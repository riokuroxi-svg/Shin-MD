# 🗺️ Shin-MD — Plan por bloques (desde la lluvia de ideas)

_Fecha: 2026-09-24 · Estado: BLOQUES 0 y 1 COMPLETADOS ✅_

Este plan organiza la lluvia de ideas (chat con "Ginko") en bloques de trabajo.
**Regla de oro:** nada entra al bot sin estar verificado contra el código real y
con las pruebas (27 tests) pasando. Lo que no se pudo verificar, va al laboratorio.

---

## 🔍 Triage previo (hecho hoy contra el código real)

| Afirmación de la lluvia de ideas | Veredicto verificado en código |
|---|---|
| "15 desconexiones borran auth.db" | ✅ **REAL Y VIVO** — `socket.js` línea ~290: `retries > MAX_RETRIES(15)` → `clearSession()` para CUALQUIER código, incluidos 408/428 (cortes de red). Crítico en Termux con datos móviles. |
| "Durante pairing no debería sumar riesgo" | ✅ **REAL** — `health.recordDisconnect()` se llama en todo `close`, incluso sin sesión registrada. |
| "health.js no detecta 403" | ❌ **YA ARREGLADO** — health.js tiene fix explícito del 403 (líneas 50-83). |
| "Loop infinito de restartRequired (515)" | ❌ **YA ARREGLADO** — backoff escalonado + streak >= 6 con salida controlada. |
| "Queue se congela si un envío falla" | ⚠️ **PARCIAL** — hay reject/retry; falta auditar el camino de timeout. Va en Bloque 0. |
| "Bug LID en permissions.js" | ⚠️ **DOCUMENTADO** — serialize.js explica que en Baileys 6.7.x no hay mapa LID↔teléfono; `userPart()` ya normaliza. Va en Bloque 0 re-verificar. |
| ".menu invisible tras auth corrupto" | ⚠️ **POR VERIFICAR** — hay fix previo en commits; falta validar fallback iOS y checkpoint WAL al arranque. |
| Rankings de forks Baileys (japofc, kyyinfinite, etc.) | ❓ **NO VERIFICADO** — viene de otra IA, sin auditar. Riesgo de supply-chain real (el propio chat menciona forks que robaban credenciales). Ver decisión D1. |

---

## 🧱 LOS BLOQUES

### BLOQUE 0 — Auditoría de bugs reclamados ✅ (2026-09-24)
Verificado uno por uno contra el código real:
- [x] Congelamiento de `queue.js` → **YA ARREGLADO** (withTimeout + reject en todas las rutas)
- [x] `.menu` tras auth corrupta → fallback a texto **YA EXISTE** en interactive.js; WAL checkpoint añadido en B1.3
- [x] Router + self mode vs throttler → **REAL**: el delay por longitud de texto (+25ms/char hasta 2s) hacía lento `.menu`. Fixeado en B1.4
- [x] Health 403, LID, loop 515 → **YA ARREGLADOS** en commits anteriores (Batch H/I)
- [x] Rate-limit por usuario → **YA EXISTE** en cooldown.js (10 req/min por JID)
- [ ] Duplicados de alias (667 handlers → 195 únicos) → cosmético, pasa al Bloque 2

### BLOQUE 1 — Estabilidad anti-borrado ✅ (2026-09-24, commit de esta sesión)
- [x] **B1.1** `socket.js`: una sesión registrada NUNCA se borra por cortes de red.
      Al superar 15 reintentos ahora entra en **modo paciente** (reintento cada ~5 min,
      sesión intacta) en vez de `clearSession()`. Tormenta de c0 con sesión válida:
      sale sin borrar, con aviso. Solo se limpia en 401/403/411/500 (sesión muerta real).
- [x] **B1.2** Pairing paciente: con `!creds.registered` los reintentos no cuentan,
      no suman riesgo en health, y reconecta con backoff sin límite (como Ginko-MD).
- [x] **B1.3** `auth.js`: `PRAGMA wal_checkpoint(TRUNCATE)` al abrir (pliega -wal
      huérfanos tras cortes bruscos). Fallback a texto de sendInteractive ya existía.
- [x] **B1.4** Ventana de prioridad en la cola: `.menu`/`.ping`/`.owner` llevan
      `priority: true` → sus envíos salen con delay mínimo y saltan el bloqueo del
      warm-up (antes 3-5s de silencio tras conectar). 3 tests nuevos lo cubren.
- [x] **B1.5** Ya existía (antispam por usuario en cooldown.js) — verificado, sin cambios.

**Verificación:** 30/30 tests ✅ · arranque real con .env carga 195 comandos ✅ ·
ruta 401 (sesión inválida real) sigue limpiando correctamente ✅

### BLOQUE 2 — UX y consola ✅ COMPLETADO (2026-09-24)
- [x] `numberProfile`: NUMBER_PROFILE=auto|nuevo|veterano en .env. Nuevo =
      1500ms + warm-up 7d; veterano = 700ms + warm-up 2d. La fecha de warm-up
      YA se persiste en settings (antes se reiniciaba en cada arranque y un
      número viejo nunca se sentía ágil). Auto: >=7 días de antigüedad → veterano.
- [x] Log "Grupos: X" al conectar (estilo Ginko) + campo `groups` en `/health`.
- [x] Misterio "667 vs 195" resuelto: el Map cuenta nombres + aliases; NO hay
      comandos duplicados (Batch I ya los limpió). El log ahora muestra el
      número real: "195 comandos únicos · 667 entradas con aliases".
- [x] Estética: logger con iconos ◐ ◑ ✓ ✕ en vez de INFO/SUCCESS en mayúsculas.
- [x] README: aviso estricto de usar número secundario (ningún bot es 100% inmune).

### BLOQUE 3 — Descargas y herramientas de owner
- [ ] `.subir` (solo owner, con candado anti-`..` para no salir del repo).
- [ ] `.subircookies`: el bot pide el documento cookies.txt y lo guarda.
- [ ] `.play` con soporte opcional de `cookies.txt` + fallback `@distube/ytdl-core`.
- [ ] Evaluar `soundcloud-scraper` si existe comando de SoundCloud.

### BLOQUE 4 — UI premium (menús)
- [ ] Validar EN TELÉFONO REAL qué renderiza Baileys 6.7.24 hoy (lo de
      `docs/investigacion.md` fue verificado en código, falta la prueba visual).
- [ ] Tag verde vía `externalAdReply` + `MENU_IMAGE`.
- [ ] `single_select` por categorías + carrusel `.demo`.
- [ ] Ver decisión D1 (¿inyector biz propio o fork?).
- [ ] ⚠️ Trucos de riesgo (`forwardingScore: 9999` + newsletter falso) quedan
      **OFF por defecto** detrás de una env var: son señal de ban.

### BLOQUE 5 — Seguridad
- [ ] `chmod 600` automático para `auth.db` / sesiones (SQLCipher solo si se
      justifica después — añade peso y complejidad).
- [ ] Auth básica en el panel web cuando `LOOPBACK=0`.
- [ ] Logs Pino a archivo rotativo (para debuggear bans).
- [ ] `.env.example` completo con todas las variables documentadas.

### BLOQUE 6 — Laboratorio (repo aparte: Shin-Lab)
Nada de esto toca el bot principal hasta estar probado:
- [ ] Brain heurístico 20KB (reglas/brain.js) para spam-detect y routing de cola.
- [ ] Memoria estilo AIRI: RAG simple sobre SQLite ("este usuario siempre pide X").
- [ ] Sub-bots aislados por proceso (jadibot seguro).
- [ ] Migración `global.db` JSON → SQLite (script de 80 líneas).
- [ ] Evaluar TypeScript en el core (costo/beneficio real).
- [ ] Plugin store (`.find-skill`) — solo si lo anterior está estable.

---

## ⚖️ Decisiones donde corrijo a la lluvia de ideas

- **D1 — No cambiar de Baileys por ahora.** El bot está en la versión oficial
  6.7.24 fijada + parcheada (vinculación, companion_reg_refresh). Los rankings de
  forks (japofc/kyyinfinite/ultra-baileys) no están verificados y mudar la pieza
  más delicada del bot a un fork comunitario sin auditar es el riesgo número 1 de
  supply-chain. Camino: quedarse en oficial; si el Bloque 4 demuestra que faltan
  features, probar el "inyector biz" primero EN EL LAB.
- **D2 — Nada de modelos de 151MB en el repo.** Viola la propia restricción de
  <15MB y en un celular modesto será lento. Si hay "cerebro", primero la versión
  heurística de 20KB, solo en el laboratorio.
- **D3 — El candado LICENSE con SHA256 es cosmético.** Se puede añadir (barato),
  pero quien edita el checker se salta el hash. La protección real es legal (AGPL).
  Va al final del Bloque 5, prioridad baja.
- **D4 — TypeScript no es la prioridad.** Primero los bugs críticos que hoy borran
  sesiones; TS después, si se justifica, en el lab.
- **D5 — Carpeta `pro/` + licencia comercial:** posible solo si posees el 100% del
  copyright. Ojo: los 181 comandos portados de Ginko y partes derivadas de otros
  bots AGPL pueden no ser 100% tuyos. Revisar antes de prometer licencia dual.

---

## 📅 Orden propuesto

```
Bloque 0 (auditoría)  →  Bloque 1 (crítico)  →  Bloque 2 (UX)
                                                     ↓
                       Bloque 3, 4 y 5 (independientes, en el orden que elijas)
                                                     ↓
                       Bloque 6 → repo Shin-Lab separado
```

Cada bloque termina con: tests pasando + arranque verificado + commit descriptivo.
