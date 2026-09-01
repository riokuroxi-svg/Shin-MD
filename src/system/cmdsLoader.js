import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import chalk from "chalk";
import log from "#lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commandsFolder = path.resolve(__dirname, "../../cmds");
const pluginCache = new Map();
const debounceMap = new Map();
const watchers = new Map();

global.comandos = global.comandos || new Map();
global.plugins = global.plugins || {};
global.cmdsExecute = global.cmdsExecute || [];

function registerModule(filePath, mod) {
  const key = path.relative(commandsFolder, filePath).replace(/\\/g, "/").replace(/\.js$/, "");
  for (const [cmd, data] of global.comandos) if (data.pluginKey === key) global.comandos.delete(cmd);
  global.cmdsExecute = global.cmdsExecute.filter(p => p.key !== key);

  const cmd = mod && mod.default;
  const dirname = path.dirname(filePath);
  const allFn = (cmd && typeof cmd.all === "function") ? cmd.all : (typeof mod.all === "function" ? mod.all : null);
  const beforeFn = (cmd && typeof cmd.before === "function") ? cmd.before : (typeof mod.before === "function" ? mod.before : null);

  global.plugins[key] = { ...mod, dirname };
  if (allFn) { global.plugins[key].all = allFn; global.cmdsExecute.push({ key, type: "all", fn: allFn, dirname }); }
  if (beforeFn) { global.plugins[key].before = beforeFn; global.cmdsExecute.push({ key, type: "before", fn: beforeFn, dirname }); }

  if (!cmd || typeof cmd.run !== "function") return;
  const cmds = Array.isArray(cmd.command) ? cmd.command : (cmd.command ? [cmd.command] : []);
  const keys = cmds.filter(Boolean).length > 0 ? cmds.filter(Boolean).map(c => c.toLowerCase()) : (cmd.customPrefix ? [key.split("/").pop().toLowerCase()] : []);
  if (!keys.length) return;

  for (const c of keys) {
    global.comandos.set(c, {
      pluginKey: key, run: cmd.run, category: cmd.category || "general",
      description: cmd.description || "",
      isOwner: cmd.isOwner || false, isAdmin: cmd.isAdmin || false,
      botAdmin: cmd.botAdmin || false, customPrefix: cmd.customPrefix || null,
      ownerOnly: cmd.ownerOnly || false, modOnly: cmd.modOnly || false,
      adminOnly: cmd.adminOnly || false, premiumOnly: cmd.premiumOnly || false,
      groupOnly: cmd.groupOnly || false, privateOnly: cmd.privateOnly || false,
      botAdminRequired: cmd.botAdminRequired || false,
    });
  }
}

async function importModule(filePath) {
  const mtime = fs.statSync(filePath).mtimeMs;
  const cached = pluginCache.get(filePath);
  if (cached && cached.mtime === mtime) return cached.mod;
  const url = pathToFileURL(filePath).href + "?v=" + mtime;
  const mod = await import(url);
  pluginCache.set(filePath, { mtime, mod });
  return mod;
}

function collectFiles(dir, out) {
  out = out || [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) collectFiles(f, out);
    else if (e.name.endsWith(".js")) out.push(f);
  }
  return out;
}

async function scan(dir) {
  const files = collectFiles(dir);
  const results = await Promise.allSettled(files.map(async (fp) => {
    const mod = await importModule(fp);
    registerModule(fp, mod);
  }));
  let errs = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "rejected") {
      errs++;
      log.gray("Error cargando " + path.basename(files[i]) + ": " + (results[i].reason.message || results[i].reason));
    }
  }
  return { total: files.length, errors: errs };
}

function watchDir(dir) {
  if (watchers.has(dir) || !fs.existsSync(dir)) return;
  try {
    const w = fs.watch(dir, (ev, filename) => {
      if (filename && filename.endsWith(".js")) reloadFile(path.join(dir, filename));
    });
    w.unref();
    watchers.set(dir, w);
  } catch {}
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) watchDir(path.join(dir, e.name));
  }
}

async function reloadFile(filePath) {
  if (!filePath.endsWith(".js")) return;
  if (!fs.existsSync(filePath)) {
    pluginCache.delete(filePath);
    const key = path.relative(commandsFolder, filePath).replace(/\\/g, "/").replace(/\.js$/, "");
    for (const [cmd, data] of global.comandos) if (data.pluginKey === key) global.comandos.delete(cmd);
    global.cmdsExecute = global.cmdsExecute.filter(p => p.key !== key);
    delete global.plugins[key];
    return;
  }
  const mtime = fs.statSync(filePath).mtimeMs;
  if (pluginCache.get(filePath) && pluginCache.get(filePath).mtime === mtime) return;
  try {
    const mod = await importModule(filePath);
    registerModule(filePath, mod);
  } catch (e) {
    log.gray("Error recargando " + path.basename(filePath) + ": " + e.message);
  }
}

export default async function cmdsLoader() {
  const t = Date.now();
  const { total, errors } = await scan(commandsFolder);
  log.gray(global.comandos.size + "/" + total + " comandos cargados en " + (Date.now() - t) + "ms" + (errors > 0 ? " (" + errors + " errores)" : ""));
  watchDir(commandsFolder);
}
