<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&height=220&color=gradient&customColorList=12,23,25,30&text=反魂%20SHIN-MD&fontSize=54&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=Bot%20WhatsApp%20Multi-Device%20Superior&descSize=18&descAlignY=60" width="100%"/>

<br>

[![WhatsApp Bot](https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/riokuroxi-svg/Shin-MD)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/Baileys-Multi%20Device-25D366?style=for-the-badge)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/License-AGPLv3-red?style=for-the-badge)](LICENSE)
[![Termux](https://img.shields.io/badge/Termux-Compatible-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://termux.com)

<br>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=26&duration=2800&pause=600&color=4ADE80&center=true&vCenter=true&width=640&lines=反魂+Shin-MD;El+renacer+de+un+bot+superior;Hecho+desde+cero;Arquitectura+limpia+y+moderna;AGPL-3.0+Protegido" alt="Typing SVG" />

<br>

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">

</div>

## 🏆 ¿Qué hace a Shin-MD superior?

| Característica | Shin-MD | Otros bots |
|---|---|---|
| **Arquitectura** | Capas separadas (conexión, router, libs) | Todo en index.js |
| **Auth** | SQLite nativo (WAL, atómico) | JSON frágil que se corrompe |
| **Rate limiting** | Cola FIFO con delay configurable | No existe, riesgo de ban |
| **Logging** | Pino estructurado + salida legible | console.log espartano |
| **Backoff** | Exponencial con jitter | Lineal o inexistente |
| **Licencia** | AGPL-3.0 (protección real) | MIT sin restricciones |
| **Plugins** | Carga con hot-reload | Carga estática |
| **Dependencias** | Versiones fijas, 0 vulnerabilidades | Versiones sueltas |

## 🚀 Inicio rápido

### Termux (Android)

```bash
pkg update && pkg upgrade -y
pkg install -y git nodejs ffmpeg
git clone https://github.com/riokuroxi-svg/Shin-MD
cd Shin-MD
npm install
cp .env.example .env
# Edita .env con tu número y método de conexión
npm start
```

### BoxMine / VPS

```bash
git clone https://github.com/riokuroxi-svg/Shin-MD
cd Shin-MD
npm install
# Configura .env con PAIRING_METHOD=code y PAIRING_NUMBER
npm start
```

## ⚙️ Configuración

Copia `.env.example` a `.env` y rellena:

| Variable | Descripción | Default |
|---|---|---|
| `OWNER_NUMBER` | Tu número (solo dígitos) | — |
| `PAIRING_METHOD` | `code` o `qr` | `code` |
| `PAIRING_NUMBER` | Número para pairing | — |
| `LOG_LEVEL` | debug, info, warn, error, silent | `info` |
| `RATE_DELAY_MS` | Delay entre mensajes | `800` |
| `RATE_MAX_PER_MINUTE` | Máximo de mensajes por minuto | `60` |
| `PORT` | Puerto del servidor HTTP | `3000` |

## 🏗️ Estructura del proyecto

```
Shin-MD/
├── index.js              ← Entry point
├── settings.js           ← Config global
├── server.js             ← HTTP (health check)
├── package.json          ← Dependencias fijas
├── src/
│   ├── main.js           ← Router de comandos
│   ├── core/
│   │   └── connection.js ← Manager de conexión (Baileys)
│   ├── lib/
│   │   ├── logger.js     ← Logging estructurado
│   │   ├── rate-limiter.js ← Cola de mensajes
│   │   ├── errors.js     ← Errores usuario/técnicos
│   │   └── sqliteAuth.js ← Auth state en SQLite
│   ├── system/
│   │   ├── database.js   ← SQLite nativo + caché
│   │   └── cmdsLoader.js ← Cargador de plugins
│   └── serialize.js      ← Deserialización de mensajes
├── cmds/                 ← Comandos/plugins
├── assets/               ← Imágenes
└── docs/                 ← Documentación
```

## 📜 Licencia

**Shin-MD** está protegido bajo **GNU Affero General Public License v3.0**.

Esto significa que:
- ✅ Puedes usar, modificar y compartir el código
- ❌ **No puedes** usarlo en servicios comerciales cerrados
- ❌ **No puedes** vender este bot o una versión modificada
- ✅ Si haces mejoras, debes compartirlas bajo la misma licencia

El objetivo es claro: que nadie lucre con este trabajo. Es y será siempre libre.

## 🧠 Filosofía

> **"No quiero clonar una base ya hecha de otro bot y ponerle mi nombre. Quiero construir algo superior con herramientas actuales, no con lo que 'siempre se ha hecho así' en estos bots MD."**

Este bot está construido desde cero con investigación profunda, no copiando lo que otros hacen. Cada decisión técnica tiene una razón.

## 🍁 Créditos

**Creador:** [riokuroxi-svg](https://github.com/riokuroxi-svg)

Basado en la experiencia de Ginko-MD, pero reconstruido desde cero para ser superior.

---

<div align="center">
  <img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
  <br><br>
  <strong>反魂 Shin-MD</strong> — El renacer de un bot superior
</div>