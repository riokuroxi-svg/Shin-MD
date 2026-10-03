# `tools/` — cómo se dibujan los gráficos del README

Nada de Canva ni de imágenes hechas a mano: **todo el diseño es código**, igual
que el resto del repositorio.

```bash
python3 -m pip install fonttools cairosvg pillow
python3 tools/build_pastel.py     # docs/assets/pastel/*.svg  (los gráficos)
python3 tools/build_preview.py    # vista-previa.html         (para revisar)
```

## Las tres reglas del diseño

1. **Sin fuentes externas.** El texto se convierte a **trazado vectorial**
   (`<path>`), no a `<text>`. Así el 反魂 y el nombre se dibujan idénticos en
   cualquier equipo, aunque no tenga la fuente instalada. Es el mismo criterio
   que ya usaba el hero anterior del repositorio.
2. **Sin peticiones a internet.** La mascota va embebida como
   `data:image/png;base64` dentro del SVG. El README no pide nada a terceros.
3. **Claro y oscuro de verdad.** Cada pieza tiene su versión para
   `prefers-color-scheme`, con paletas propias (no un simple filtro invertido).

## Archivos

| Archivo | Qué hace |
|---|---|
| `svgkit.py` | El motor: mide textos, los convierte a trazado, dibuja rectángulos, píldoras, iconos y chispitas. Sin dependencias raras (solo `fontTools`). |
| `build_pastel.py` | Compone las piezas: portada, tarjetas de sección, insignias, divisores. Aquí están los textos y los números. |
| `build_preview.py` | Convierte el README.md en `vista-previa.html`, con todos los SVG dentro del propio archivo. |
| `fuentes/` | Baloo 2, Nunito y Quicksand (todas OFL). Solo hacen falta para regenerar. |

## Cambiar un dato

Los números viven en `build_pastel.py`, en listas legibles:

```python
renglones = [
    ("sesión",   "SQLite WAL · sin corrupción", P["menta"]),
    ("comandos", "210 cargados · 0 errores",     P["terminal_texto"]),
    ...
]

tarjetas = [
    ("PRUEBAS", "140", "22 archivos", "escudo", P["menta"]),
    ...
]
```

Se edita, se corre `python3 tools/build_pastel.py` y los SVG se reescriben.
Después solo queda `git add docs/assets/pastel && git commit`.

## Los iconitos

Están dibujados a mano en `svgkit.py` (`icono()`): lupa, casa, calendario,
engrane, marcador, rayo, escudo, campana, rayos, personas y chat. Son líneas y
curvas simples, nada de iconos copiados, así que puedes usarlos sin pensar en
licencias de terceros.
