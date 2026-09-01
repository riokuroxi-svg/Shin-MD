# 🎨 Plantillas de Menú — Shin-MD

> Elige una plantilla y la implemento. Todas se renderizan con formato de WhatsApp
> (`*negrita*`, `_cursiva_`, `~tachado~`, ```mono```, emojis).

---

## PLANTILLA A — "反魂 Elegante" (actual, mejorada)

Menú de texto con cabecera informativa + comandos agrupados por categoría.

```
╭───「 ✦ *SHIN-MD* 」───
│  反魂 · Bot WhatsApp superior
│  ⏱️ Activo: 2h 15m
│  🛡️ Riesgo: 🟢 0%
│  👤 *2* usuarios · *5* comandos
╰───────────────────

✦ *INFORMACIÓN*
│  `menu` · Ver este menú
│  `ping` · Comprueba el bot

✦ *UTILIDAD*
│  `sticker` · Crea sticker
│  `tts` · Texto a voz

✦ *ADMINISTRACIÓN*
│  `kick` · Expulsa miembro
│  `antilink` · Anti-enlaces

╭───────────────────
│  _Hecho desde cero · AGPL-3.0_
╰────「 反魂 」────
```

---

## PLANTILLA B — "Minimal/Boxes"

Estilo limpio con recuadros, muy legible en chats movidos.

```
╔══════════════════════════╗
║   ✨ *SHIN-MD* ✨        ║
║   _反魂 — Bot superior_ ║
╚══════════════════════════╝

▸ *INFO*
   ├ .menu  → lista de comandos
   ├ .ping  → latencia del bot
   └ .owner → contacto del dueño

▸ *UTILIDAD*
   ├ .sticker → crea stickers
   └ .tts     → texto a voz

▸ *JUEGOS* 🎮
   ├ .trivia  → pregunta de cultura
   └ .ttt     → tres en raya

╔══════════════════════════╗
║  _AGPL-3.0 · Hecho en 反魂_ ║
╚══════════════════════════╝
```

---

## PLANTILLA C — "Interactiva (Rich Message)"

Con **botones táctiles** (no texto plano). El bot envía el menú y el usuario
**toca una categoría** para expandirla — sin escribir nada.

```
┌────────────────────────────┐
│  ✨ *SHIN-MD* · 反魂        │
│                            │
│  Elige una categoría:      │
│  ┌──────────────────────┐  │
│  │ 📋 INFORMACIÓN        │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ 🎮 JUEGOS            │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ 🛠️ UTILIDAD          │  │
│  └──────────────────────┘  │
└────────────────────────────┘
```

_Así se ve en WhatsApp: tarjeta con botones debajo del texto. Al tocar una
categoría, el bot responde con los comandos de esa sección._

---

## PLANTILLA D — "Lista desplegable"

Usa la **lista nativa de WhatsApp** (un solo botón que despliega un menú con
secciones y filas). Ideal para menús largos, se ve "oficial".

```
┌────────────────────────────┐
│  ✨ *SHIN-MD* · 反魂        │
│                            │
│  Toca el botón para ver    │
│  el menú completo.         │
│                            │
│  ┌──────────────────────┐  │
│  │ 📋 MENÚ ▼             │  │
│  └──────────────────────┘  │
└────────────────────────────┘

(dentro del desplegable:)
─────────────────────────
📋 INFORMACIÓN
  ├ ping — latencia
  └ menu — ver menú
🎮 JUEGOS
  ├ trivia — preguntas
  └ ttt — 3 en raya
─────────────────────────
```

---

## PLANTILLA E — "Banner + Categorías" (con imagen)

Igual que A pero con **imagen de cabecera** (el bot sube un banner PNG
con el logo 反魂). Se ve profesional, estilo bot "comercial".

```
[ 📷 imagen banner Shin-MD ]

╭───「 ✦ *SHIN-MD* 」───
│  Elige una categoría o escribe `menu <categoría>`
│  Ej: `menu juegos`
╰───────────────────

✦ *INFORMACIÓN* (menu info)
✦ *UTILIDAD* (menu utilidad)
✦ *ADMINISTRACIÓN* (menu admin)
✦ *JUEGOS* (menu juegos)
```

---

## Mi recomendación

Para un bot personal que además debe ser **anti-ban**: la **Plantilla A** (texto
plano, ligero, sin riesgo) es la base sólida, y opcionalmente le añades la
**Plantilla C/D** (rich message con botones) para el menú principal — los
botones se ven premium y no requieren que el usuario escriba.

**⚠️ Nota anti-ban**: los botones/interactivas en Baileys 6.7.24 existen (lo
verifiqué), pero WhatsApp los asocia a *cuentas business/API*. En una cuenta
personal MD pueden salir como texto plano o fallar. Por eso diseño el menú
para que **funcione igual** como texto o con botones (fallback automático).
