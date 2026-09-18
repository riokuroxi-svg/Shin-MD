// ─────────────────────────────────────────────────────────────────────────────
//  Gestión robusta de yt-dlp (auto-descarga + auto-reparación).
//
//  Por qué existe esto:
//   El binario estático oficial de yt-dlp es un empaquetado PyInstaller
//   "one-file": al ejecutarse se extrae a sí mismo (incluida la extensión nativa
//   curl_cffi/_wrapper.abi3.so) a una carpeta temporal y luego ejecuta desde ahí.
//   La carpeta de extracción sale de la env TMPDIR (o /tmp por defecto).
//
//   En contenedores de hosting (BoxMine) /tmp suele ser un tmpfs pequeño, lleno,
//   noexec o se limpia entre procesos, o hay presión de memoria. Eso hace que la
//   extracción falle con:  [PYI-180:ERROR] Failed to extract curl_cffi/...
//   decompression resulted in return code -1!   (error zlib Z_DATA/Z_MEM)
//
//   En Termux esto no pasa porque ahí se usa `pip install yt-dlp` (Python real),
//   no el binario estático.
//
//  Solución aplicada aquí:
//   1. Forzar la extracción a un directorio de DISCO propiedad del bot
//      (bin/.tmp) fijando TMPDIR/TMP/TEMP en cada ejecución.
//   2. Descarga ATÓMICA + validada: tamaño mínimo, no-HTML, e_machine del ELF
//      debe coincidir con process.arch, y smoke-test con `--version`.
//   3. Auto-reparación: si en plena descarga el binario falla con PYI-*/decompresión,
//      se invalida la caché, se re-descarga verificado y se reintenta UNA vez.
//   4. Logs de diagnóstico en consola (para poder leerlos desde el panel de BoxMine,
//      donde no hay shell).
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);
const BIN_DIR = path.join(process.cwd(), 'bin');
const BIN_PATH = path.join(BIN_DIR, 'yt-dlp');
// Directorio de extracción de PyInstaller, en disco, propiedad del bot.
const TMP_DIR = path.join(BIN_DIR, '.tmp');
const MIN_BYTES = 10 * 1024 * 1024;            // yt-dlp_linux real pesa ~32 MB
const ARCH_FALLBACKS = {
  x64: 'arm64',
  arm64: 'x64',
};

let _cachedBin = undefined; // undefined = sin sondear; null = no disponible; ruta = OK

// ── Nombre del asset de GitHub según plataforma/arquitectura ─────────────────
// Devuelve { asset, elf } donde elf = e_machine esperado del ELF (solo linux).
export function ytdlpAssetFor(platform = process.platform, arch = process.arch) {
  if (platform === 'linux') {
    if (arch === 'x64') return { asset: 'yt-dlp_linux', elf: 0x3e };
    if (arch === 'arm64') return { asset: 'yt-dlp_linux_aarch64', elf: 0xb7 };
    if (arch === 'arm') return { asset: 'yt-dlp_linux_armv7l', elf: 0x28 };
    if (arch === 'riscv64') return { asset: 'yt-dlp_linux_riscv64', elf: 0xf3 };
  } else if (platform === 'darwin') {
    return { asset: arch === 'arm64' ? 'yt-dlp_macos_legacy' : 'yt-dlp_macos', elf: null };
  } else if (platform === 'win32') {
    return { asset: 'yt-dlp.exe', elf: null };
  }
  return null;
}

// Directorio de extracción de PyInstaller (disco, escribir, propiedad del bot).
export function getAppTmpDir() {
  try { fs.mkdirSync(TMP_DIR, { recursive: true }); } catch {}
  return TMP_DIR;
}

// env con TMPDIR/TMP/TEMP apuntando a disco, para que PyInstaller no use /tmp.
export function getYtdlpEnv() {
  const tmp = getAppTmpDir();
  return { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp };
}

// Raw execute de yt-dlp con el env de extracción fijado. Lanza si falla.
export async function _execYtdlpRaw(bin, args, opts = {}) {
  // Nota: --version también pasa por la extracción de PyInstaller, así que sirve
  // de prueba real de que el binario está completo y puede auto-extraerse.
  return await exec(bin, args, {
    timeout: opts.timeout || 120000,
    windowsHide: true,
    maxBuffer: (opts.maxBuffer || 10) * 1024 * 1024,
    cwd: opts.cwd,
    env: opts.env || getYtdlpEnv(),
  });
}

export function esErrorPYI(error) {
  const msg = String(error?.stderr || error?.message || error || '');
  return /PYI-\d+|decompression resulted in return code|Failed to extract|Not a(z)? valid (ELF|executable)|Exec format error|zlib|Z_DATA_ERROR|Z_MEM_ERROR/i.test(msg);
}

// Smoke-test: --version con el env corregido. Devuelve true si el binario vive.
export async function verifyYtdlp(bin, opts = {}) {
  try {
    await _execYtdlpRaw(bin, ['--version'], { timeout: 10000, env: opts.env, maxBuffer: 2 });
    return true;
  } catch {
    return false;
  }
}

// ── Buscar un yt-dlp ya instalado en el sistema (verificado) ─────────────────
export async function searchYtdlp() {
  const candidates = [
    process.env.YTDLP_PATH,
    'yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/opt/yt-dlp/yt-dlp',
    '/data/yt-dlp',
    '/home/container/yt-dlp',
    BIN_PATH,
    path.join(process.env.HOME || '', '.local', 'bin', 'yt-dlp'),
  ].filter(Boolean);
  for (const bin of candidates) {
    try {
      // La entrada 'yt-dlp' se resuelve por PATH; los demás son rutas absolutas.
      await _execYtdlpRaw(bin, ['--version'], { timeout: 10000, env: getYtdlpEnv(), maxBuffer: 2 });
      return bin;
    } catch {}
  }
  return null;
}

// ── Validar el header ELF de un binario descargado (solo linux) ──────────────
// Revisa el magic + e_machine (bytes 18-19 little-endian) contra process.arch,
// para descartar en el acto descargas de la arquitectura equivocada.
function validarElf(buf) {
  if (!buf || buf.length < 20) return false;
  // Magic 0x7F 'E' 'L' 'F'
  if (!(buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46)) return false;
  const data = buf[5];
  const eMachine = data === 1 ? (buf[18] | (buf[19] << 8)) : (buf[18] << 8) | buf[19];
  const info = ytdlpAssetFor();
  if (info?.elf && eMachine !== info.elf) {
    // Si no coincide con la arquitectura deducida, acepta la de respaldo
    // (cubre contenedores que reportan mal process.arch).
    const back = ARCH_FALLBACKS[process.arch];
    const backInfo = back ? ytdlpAssetFor(process.platform, back) : null;
    if (backInfo && eMachine === backInfo.elf) return true;
    return false;
  }
  return true;
}

// ── Descarga del binario estático: atómica + validada + smoke-test ───────────
export async function downloadYtdlpStatic() {
  const info = ytdlpAssetFor();
  if (!info) return null;
  const { asset } = info;
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
  console.log(`[yt-dlp] descargando binario estático → ${asset} (${process.platform}/${process.arch})`);
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${asset}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_BYTES) throw new Error(`descarga incompleta (${buf.length} bytes < ${MIN_BYTES})`);
  if (buf.length > 4 && buf[0] === 0x3c) throw new Error('la respuesta no es binaria (HTML)');
  if (process.platform === 'linux' && !validarElf(buf)) {
    throw new Error(`ELF no coincide con la arquitectura ${process.arch} (${asset})`);
  }
  // Escritura ATÓMICA: temp + rename, para nunca ejecutar un archivo a medio escribir.
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const tmpPath = path.join(BIN_DIR, `.yt-dlp.${Date.now()}.tmp`);
  fs.writeFileSync(tmpPath, buf);
  if (process.platform !== 'win32') fs.chmodSync(tmpPath, 0o755);
  fs.renameSync(tmpPath, BIN_PATH);
  if (!(await verifyYtdlp(BIN_PATH))) {
    // Borrar el binario corrupto para no re-usarlo ni confundir al buscador.
    try { fs.rmSync(BIN_PATH, { force: true }); } catch {}
    throw new Error('el binario no superó el smoke-test (--version)');
  }
  console.log(`[yt-dlp] ✅ binario listo y verificado (${buf.length} bytes) → ${BIN_PATH}`);
  return BIN_PATH;
}

// ── Orquestador: busca → si no, descarga (con reintento tolerante) ──────────
export async function ensureYtdlp({ force = false } = {}) {
  if (!force && _cachedBin !== undefined) return _cachedBin;

  let bin = !force ? await searchYtdlp() : null;
  if (bin) {
    console.log(`[yt-dlp] detectado en el sistema → ${bin}`);
    _cachedBin = bin;
    return bin;
  }

  // No hay yt-dlp: probar pip (útil en Termux y algunos VPS) y luego el binario
  // estático (contenedores BoxMine). Reintento para tolerar bajadas truncadas.
  try {
    await exec('python3', ['-m', 'pip', 'install', '-U', '--pre', 'yt-dlp'], { timeout: 120000 });
    const pipBin = await searchYtdlp();
    if (pipBin) { _cachedBin = pipBin; return pipBin; }
  } catch {}

  // Binario estático, con un par de reintentos.
  for (let i = 0; i < 2; i++) {
    try {
      bin = await downloadYtdlpStatic();
      if (bin) { _cachedBin = bin; return bin; }
    } catch (e) {
      console.warn(`[yt-dlp] falló la descarga/smoke-test (intento ${i + 1}/2): ${e?.message || e}`);
    }
  }

  _cachedBin = null;
  return null;
}

// ── Invalidate + forzar re-descarga (auto-reparación) ───────────────────────
export async function resetYtdlpCache() {
  _cachedBin = undefined;
  try { if (fs.existsSync(BIN_PATH)) fs.rmSync(BIN_PATH, { force: true }); } catch {}
  return undefined;
}

export async function forceReinstallYtdlp() {
  await resetYtdlpCache();
  return await ensureYtdlp({ force: true });
}

// ── API pública simple ───────────────────────────────────────────────────────
export async function resolveYtdlpBinary() {
  return await ensureYtdlp();
}
export async function isYtdlpAvailable() {
  return Boolean(await ensureYtdlp());
}

export default ensureYtdlp;
