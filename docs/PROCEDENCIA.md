# Procedencia y Mapa de Licencias de Comandos — Shin-MD

**Fecha de Auditoría:** 2026-09-29  
**Autor:** riokuroxi-svg  
**Estado:** AUDITORÍA COMPLETADA ✅  

---

## 1. Resumen Ejecutivo de Procedencia

Shin-MD cuenta con **197 comandos únicos** (673 entradas contando alias). Para garantizar la seguridad jurídica del proyecto y la viabilidad del modelo **Open Core**, se clasifica el linaje del código en tres categorías estrictas:

| Categoría | Total | Licencia Original | Licencia en Shin-MD | Capa de Monetización |
| :--- | :--- | :--- | :--- | :--- |
| **Shin Original Core** | 16 comandos + Motor | AGPL-3.0-only (Propio) | AGPL-3.0-only | Núcleo Abierto (Libre) |
| **Linaje Ginko / YukiBot** | 181 comandos | MIT (iamDestroy / YukiBot) | AGPL-3.0-only | Núcleo Abierto (Libre) |
| **Plugins / Extensiones Pro** | Nuevos en Shin-Lab | Comercial / Propietaria | PolyForm Shield / Store API | Extensiones de Pago |

---

## 2. Mapa Detallado de Componentes

### A. Núcleo Shin Original (16 Comandos + Infraestructura)
*Autoría 100% de riokuroxi-svg:*
- **Motor Anti-Ban & Resiliencia:** `src/core/engine/throttler.js` (Jitter gaussiano, warm-up adaptativo), `src/core/auth.js` (SQLite WAL nativo), `src/network/queue.js` (Cola serial con prioridad), `src/services/watchdog.js` (Auto-healing).
- **Panel Web Seguro:** `src/web/server.js` (Basic Auth tiempo constante, rate-limiting anti fuerza bruta, fingerprint `/metrics`).
- **Comandos Nativos Shin:**
  1. `.ping` (`cmds/main/ping.js` - latencia de cola y socket)
  2. `.menu` (`cmds/main/menu.js` - interfaz con tarjetas interactivas)
  3. `.owner` (`cmds/main/owner.js` - vCard y contacto seguro)
  4. `.status` (`cmds/main/status.js` - métricas del proceso)
  5. `.runtime` (`cmds/main/runtime.js` - tiempo de actividad y cola)
  6. `.health` (`cmds/main/health.js` - score de riesgo de ban)
  7. `.cache` (`cmds/main/cache.js` - estadísticas y purga de caché)
  8. `.play` (`cmds/downloads/play.js` - audio multi-fuente anti-429)
  9. `.play2` (`cmds/downloads/play2.js` - video multi-fuente)
  10. `.benchdl` (`cmds/utils/benchdl.js` - benchmark de proveedores)
  11. `.subircookies` (`cmds/owner/subircookies.js` - rotación de cookies YouTube)
  12. `.ttt` (`cmds/games/ttt.js` - juego de tres en raya interactivo con botones)
  13. `.kuro` (`cmds/games/kuro.js` - motor de mini-juegos)
  14. `.demo` (`cmds/games/demo.js` - demostrador de botones nativos)
  15. `.adivina` (`cmds/games/adivina.js` - trivia interactiva)
  16. `.trivia` (`cmds/games/trivia.js` - motor de preguntas)

### B. Linaje Portado Ginko / YukiBot (181 Comandos)
*Linaje de origen permisivo (MIT):*
- **Categorías portadas y aisladas:**
  - `cmds/anime/*` (anime, waifu, shares, ppcouple)
  - `cmds/economy/*` (adventure, balance, casino, coffer, coinflip, crime, daily, deposit, dungeon, fish, givecoins, heal, hunt, invoke, math, mine, monthly, ppt, roulette, shop, slot, slut, steal, transfer, weekly, withdraw, work)
  - `cmds/gacha/*` (buychar, claim, harem, rollwaifu, sell, trade, vote, waifusboard, etc.)
  - `cmds/group/*` (kick, promote, demote, hidetag, link, open, close, options, revoke, warn, warns, etc.)
  - `cmds/profile/*` (afk, marry, divorce, level, lboard, profile, setgenre, sethobby, etc.)
  - `cmds/stickers/*` (sticker, brat, bratv, qc, newpack, packlist, emojimix, etc.)
  - `cmds/socket/*` (subs, bots, reload, self, setprefix, setname, etc.)
  - `cmds/utils/*` (hd, toimg, tourl, translate, tts, qrcode, morse, carbon, chatgpt, etc.)
  - `cmds/nsfw/*` (danbooru, gelbooru, rule34, etc.)

---

## 3. Conclusión Jurídica y Frontera Comercial

1. **El Núcleo (Shin-MD) es 100% AGPL-3.0-only:**  
   Cualquier distribución o fork del repositorio debe mantener el código fuente abierto y respetar los headers SPDX y el archivo `NOTICE`.
2. **Capa Comercial Limpia:**  
   Los comandos derivados de Ginko (MIT) quedan dentro del núcleo libre. Las extensiones comerciales de pago se desarrollarán **exclusivamente como plugins desacoplados** que interactúan mediante la API del Plugin Store (aislados en Sandbox VM con hash SHA-256), evitando la contaminación viral de licencias.
