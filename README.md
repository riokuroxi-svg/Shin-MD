<div align="center">

<img src="docs/assets/pastel/hero.svg" alt="Shin-MD — bot de WhatsApp con anti-ban propio, 212 comandos, 750 nombres y 198 pruebas" width="100%">

<br>

<img src="docs/assets/pastel/insignia-pruebas.svg" alt="198/198 pruebas" height="52">
<img src="docs/assets/pastel/insignia-comandos.svg" alt="212 comandos" height="52">
<img src="docs/assets/pastel/insignia-node.svg" alt="Node 22.5 o superior" height="52">
<img src="docs/assets/pastel/insignia-baileys.svg" alt="Baileys 7" height="52">
<img src="docs/assets/pastel/insignia-licencia.svg" alt="Licencia AGPL-3.0-only" height="52">
<img src="docs/assets/pastel/insignia-termux.svg" alt="Compatible con Termux" height="52">

<br><br>

<!-- El único recurso externo del README: el badge del CI, porque su estado
     cambia en cada push. Si quieres cero peticiones a terceros, borra esta línea. -->
[![CI](https://img.shields.io/github/actions/workflow/status/riokuroxi-svg/Shin-MD/test.yml?style=flat-square&label=CI&labelColor=2F1A24&color=EE3D86)](https://github.com/riokuroxi-svg/Shin-MD/actions)

**El bot de WhatsApp que no se cae, no se banea y no borra tu sesión.**

212 comandos · anti-ban nativo · Node ≥ 22.5 · sin servicios de terceros en medio.

[🌐 Página del proyecto](docs/web/index.html) ·
[⚡ Instalar](#instalación-en-5-minutos) ·
[🧩 Comandos](#los-212-comandos) ·
[🛡️ Anti-ban](#el-anti-ban-por-dentro) ·
[🪪 Identidades](#identidades-lid) ·
[🔌 El conector](#el-conector) ·
[📜 Licencia](#licencia-y-marca) ·
[🧪 Shin-Lab](https://github.com/riokuroxi-svg/Shin-Lab)

</div>

<img src="docs/assets/pastel/aviso.svg" alt="Usa un número secundario" width="100%">

<h2 id="lo-que-lo-hace-distinto">Lo que lo hace distinto</h2>

<img src="docs/assets/pastel/banner-01.svg" alt="01 · Lo que lo hace distinto" width="100%">

<img src="docs/assets/pastel/razones.svg" alt="Seis razones medibles" width="100%">

<h2 id="el-anti-ban-por-dentro">El anti-ban por dentro</h2>

<img src="docs/assets/pastel/banner-02.svg" alt="02 · El anti-ban por dentro" width="100%">

Nada de «espero un `Math.random()`». Esto es lo que hace que el bot parezca una
persona y se proteja solo:

<img src="docs/assets/pastel/anti-ban-curva.svg" alt="Curva del jitter gaussiano y calentamiento diario 20 a 500" width="100%">

<img src="docs/assets/pastel/anti-ban-tabla.svg" alt="Tabla: las ocho piezas del anti-ban" width="100%">

<details>
<summary><b>Huella de Shin-MD (marcador de obras derivadas)</b></summary>

El motor anti-ban tiene una combinación de parámetros propia:

`shinJitter` gaussiano σ 0.25 · base **1200 ms** (400–5000, +25 ms por carácter)
· perfil nuevo **1500 ms** / veterano **700 ms** · penalización **×1.5** a
contactos nuevos · calentamiento **20→500** mensajes/día en **7 días**

Si ves esos parámetros exactos en otro bot, es una obra derivada de Shin-MD y
debe cumplir la atribución de la Sección 7 del `NOTICE`.

</details>

<h2 id="los-212-comandos">Los 212 comandos</h2>

<img src="docs/assets/pastel/banner-03.svg" alt="03 · Los 212 comandos" width="100%">

Escribe `.menu` dentro de WhatsApp y verás la tarjeta con botones y la lista
desplegable por categorías.

<img src="docs/assets/pastel/comandos.svg" alt="Los 212 comandos repartidos en 15 categorías" width="100%">

<img src="docs/assets/pastel/categorias.svg" alt="Las 15 categorías con sus comandos" width="100%">

**212 comandos únicos · 750 nombres en total (538 alias) · 15 categorías.** Nombres de
ejemplo: `.play` (y sus alias `yt`, `mp3`, `musica`), `.sticker` (`s`),
`.daily` (`diario`, `recompensa`), `.w` (`work`, `trabajar`), `.x` para Twitter,
`.ig` para Instagram y `.menu` (`ayuda`, `h`).

🔑 *Instagram y Pinterest usan `FASTSAVER_KEY` (gratis en api.fastsaver.io).
Twitter funciona sin clave, pero es más estable con ella.*

<details>
<summary><b>Ver la lista completa de comandos (se genera del propio bot)</b></summary>

La página **[docs/web/index.html](docs/web/index.html)** lleva los 212 con su
buscador, filtros por categoría y descripción. Para regenerarla cuando añadas
comandos:

```bash
npm run docs:web
```

</details>

<h2 id="panel-local">Panel local</h2>

<img src="docs/assets/pastel/banner-04.svg" alt="04 · Panel local" width="100%">

<img src="docs/assets/pastel/panel.svg" alt="Panel en 127.0.0.1:3000 con /health y /metrics" width="100%">

<h2 id="instalación-en-5-minutos">Instalación en 5 minutos</h2>

<img src="docs/assets/pastel/banner-05.svg" alt="05 · Instalación en 5 minutos" width="100%">

<img src="docs/assets/pastel/subbanner-1.svg" alt="Termux (Android)" width="100%">

<img src="docs/assets/pastel/terminal-termux.svg" alt="Comandos para instalar en Termux" width="100%">

En WhatsApp: **Dispositivos vinculados → Vincular con número de teléfono**.
¿Prefieres QR? `npm start -- --qr`.

<img src="docs/assets/pastel/subbanner-2.svg" alt="Servidor o VPS" width="100%">

<img src="docs/assets/pastel/terminal-vps.svg" alt="Comandos para instalar en un VPS" width="100%">

<h2 id="cómo-está-hecho">Cómo está hecho</h2>

<img src="docs/assets/pastel/banner-06.svg" alt="06 · Cómo está hecho" width="100%">

<img src="docs/assets/pastel/estructura.svg" alt="Estructura de carpetas y comandos npm" width="100%">

<details>
<summary><b>Regenerar los gráficos del README (trazo vectorial, sin fuentes externas)</b></summary>

Las imágenes de arriba se generan solas y leen los números reales del bot
(`docs/assets/datos.json` si está; si no, los valores de respaldo del script),
así que nunca enseñan una cifra vieja. No usan fuentes de terceros ni peticiones
a internet: el texto va convertido a **trazado vectorial**, y así se dibuja
idéntico en cualquier móvil o navegador.

```bash
npm run docs:pastel        # o directamente: python3 tools/build_pastel.py
```

La primera vez hace falta `python3 -m pip install fonttools cairosvg pillow`
(y `fonts-noto-cjk` en Debian/Ubuntu para el kanji 反魂).

</details>

<h2 id="el-conector">El conector</h2>

El bot habla con WhatsApp a través de Baileys, y Baileys no está en su mejor
momento: la última versión es de julio y el proyecto lleva meses sin publicar,
con 46 arreglos esperando en la cola. En vez de esperar, el `npm install` aplica
un juego de parches propios —idempotentes, verificados y con su issue de
origen— que cubren lo que duele de verdad:

- **Vinculación**: QR que caduca, código que el teléfono rechaza por un nonce
  mal puesto y reconexión que manda el nodo equivocado.
- **Reconexiones**: los estados llegan como `<status>` y sin ack el servidor
  corta el stream cada ~50 minutos.
- **Multimedia**: una URL caducada ya no deja el archivo sin descargar; se pide
  el reenvío.
- **Memoria**: una fuga de `AsyncLocalStorage` por socket que crecía en cada
  reconexión.

Lo que no se puede arreglar (y por qué) también está escrito, con las 1 662
incidencias revisadas y su estado. Informe completo en
**[docs/CONECTOR.md](docs/CONECTOR.md)** · detalle de LID en
**[docs/LID.md](docs/LID.md)**.

```bash
node scripts/patch-baileys.cjs --check   # ¿están los ocho parches aplicados?
```

<h2 id="identidades-lid">Identidades: LID y teléfono</h2>

WhatsApp puede mandar al mismo usuario de dos formas: con su teléfono
(`521…@s.whatsapp.net`) o con un identificador interno, el **LID**
(`123…@lid`). Son **la misma persona**. Si el bot los tratara como dos, cada
usuario tendría dos carteras, el dueño dejaría de ser dueño y el admin de un
grupo dejaría de ser admin porque "no coincide el número".

Este bot los une:

- La llave de la economía es el **teléfono** siempre que se conozca, así los
  datos que ya estaban guardados siguen cuadrando.
- La pareja LID ↔ teléfono se aprende de donde venga (mensajes, metadatos del
  grupo, avisos del conector) y se guarda en SQLite: **sobrevive a reinicios y
  cambios de sesión**.
- El conector (Baileys 7) también guarda esas parejas en su propia sesión, así
  que «¿de quién es este LID?» se contesta **sin salir a internet**.
- Si alguien escribió cuando solo se conocía su LID, sus monedas se **fusionan**
  con la cuenta del teléfono en cuanto la pareja se aprende.
- Los permisos (dueño, admins) comparan las dos caras y la regla mexicana
  `521 = 52`, no cadenas de texto.

Lo que **no** se puede hacer, y conviene decirlo: saber el teléfono de un LID
que nadie vio nunca. Se contesta con lo aprendido por el conector y por el
tráfico; la consulta inversa (teléfono → LID) sí existe, pero sale a internet y
solo se usa cuando se pide a propósito con `.lid`.

Pruébalo en el teléfono con `.lid`: muestra tu llave, tu teléfono, tu LID, lo
que sabe el conector y si el bot ya conoce la pareja. En un grupo y en privado debes ver **la misma
llave**. Detalle técnico en **[docs/LID.md](docs/LID.md)**.

<h2 id="el-laboratorio">El laboratorio</h2>

<img src="docs/assets/pastel/banner-07.svg" alt="07 · El laboratorio" width="100%">

<img src="docs/assets/pastel/laboratorio.svg" alt="Experimentos de Shin-Lab" width="100%">

Todo lo experimental vive en [**Shin-Lab**](https://github.com/riokuroxi-svg/Shin-Lab).
**Nada migra a este repositorio sin estar probado.**

<h2 id="licencia-y-marca">Licencia y marca</h2>

<img src="docs/assets/pastel/banner-08.svg" alt="08 · Licencia y marca" width="100%">

<img src="docs/assets/pastel/licencia-tabla.svg" alt="Tabla de licencias por capa" width="100%">

<img src="docs/assets/pastel/licencia-reglas.svg" alt="Las cuatro reglas de la licencia" width="100%">

<h2 id="créditos">Créditos</h2>

<img src="docs/assets/pastel/banner-09.svg" alt="09 · Créditos" width="100%">

<img src="docs/assets/pastel/creditos.svg" alt="Creador, librería, laboratorio y licencia" width="100%">

<div align="center">

<img src="docs/assets/pastel/pie.svg" alt="Shin-MD · hecho para quedarse encendido" width="100%">

</div>
