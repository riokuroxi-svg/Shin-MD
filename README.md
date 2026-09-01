<div align="center">

# 反魂 Shin-MD

**Bot WhatsApp Multi-Device superior — anti-ban nativo, auto-healing, eficiente en recursos.**

[![Node.js](https://img.shields.io/badge/Node.js-22.5+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/Baileys-6.7.24-25D366?style=for-the-badge)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/License-AGPLv3-red?style=for-the-badge)](LICENSE)
[![Termux](https://img.shields.io/badge/Termux-Compatible-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://termux.com)

</div>

## ⚠️ Licencia — AGPL-3.0

Este proyecto se distribuye bajo la **GNU Affero General Public License v3.0**.

Esto significa: **cualquiera que use o modifique este código debe publicar su versión modificada bajo la misma licencia AGPL-3.0**, incluyendo servicios ofrecidos a través de una red. Impide el aprovechamiento comercial cerrado del trabajo.

## 🏗️ Arquitectura

Capa por responsabilidad, sin código repetido, sin "index.js gigante".

```
src/
├── core/            # Núcleo del bot
│   ├── engine.js    # Ciclo de vida (BOOT → INIT → CONNECT → READY → RUNNING → SHUTDOWN)
│   ├── socket.js    # Conexión Baileys: reconexión, backoff, captura de mensajes
│   └── auth.js      # Auth state persistido en SQLite (creds + Signal keys)
├── network/         # Capa anti-ban
│   ├── throttler.js # Jitter gaussiano, warm-up diario, penalización a contactos nuevos
│   ├── queue.js     # Cola de envío serial, reintento, pausa por riesgo
│   └── health.js    # Monitor de riesgo de ban (puntuación 0-100)
├── services/        # Servicios transversales
│   ├── logger.js    # Pino + Chalk, 6 niveles, timestamps ISO
│   └── watchdog.js  # Auto-healing: detecta bloqueos, pausa en riesgo alto
├── storage/         # Persistencia
│   ├── database.js  # SQLite (node:sqlite) con migraciones versionadas
│   ├── migrations.js# Definiciones de migración (single source of truth)
│   └── cache.js     # Caché en memoria con TTL y auto-GC
└── web/             # Panel local
    └── server.js    # /, /health, /metrics (solo 127.0.0.1 por defecto)

boot/index.js        # Arranque: monta engine + socket + watchdog + web
index.js             # Entry point público (npm start)
test/                # Tests (node --test)
```

## 🛡️ Anti-ban integrado

- **Jitter gaussiano**: los delays entre mensajes siguen una distribución natural, no son fijos ni predecibles.
- **Warm-up diario**: arranca con un tope bajo de mensajes/día y sube gradualmente durante 7 días.
- **Penalización a contactos nuevos**: primer contacto espera más, imita comportamiento humano.
- **Monitor de riesgo**: puntúa disconnects, errores y fallos de envío; el watchdog pausa automáticamente ante riesgo crítico.
- **Backoff exponencial + jitter** en reconexiones, con tope de 15 reintentos antes de limpiar sesión.

## 🚀 Instalación

```bash
# Requiere Node.js >= 22.5.0 (node:sqlite)
npm install

# Copiar configuración
cp .env.example .env   # rellena OWNER_NUMBER y método de vinculación

# QR
npm start
# ó npm run start:qr

# Pairing code (recomendado en Termux)
npm run start:code          # usando el número de .env
node index.js --code 521234567890
```

## 🖥️ Panel local

Con el bot corriendo:

- `http://127.0.0.1:3000/` — estado
- `http://127.0.0.1:3000/health` — riesgo, cola, memoria
- `http://127.0.0.1:3000/metrics` — métricas de proceso

## 🧪 Tests

```bash
npm test
```

## 📁 Estructura de sesión

La sesión de WhatsApp se guarda en `./Sessions/Owner/auth.db` (SQLite, WAL), más robusta que los JSON planos que se corrompen.

---

**Shin-MD** — Hecho desde cero. AGPL-3.0.
