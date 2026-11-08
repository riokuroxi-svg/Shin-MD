# -*- coding: utf-8 -*-
"""
Genera vista-previa.html: el README renderizado como HTML con los gráficos
incrustados dentro del propio archivo (así se ve sin depender de internet).

Uso:  python3 tools/build_preview.py [salida.html]
"""
import os
import re
import sys

import markdown

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
README = os.path.join(RAIZ, "README.md")
# El nombre empieza con punto a propósito: el .gitignore del bot ya ignora
# .vista-readme-*.html, así que esta copia de revisión nunca se commitea.
SALIDA = os.path.join(RAIZ, ".vista-readme-pastel.html")


def leer(ruta):
    with open(ruta, encoding="utf-8") as fh:
        return fh.read()


def _svg_incrustado(ruta, alt=""):
    svg = leer(ruta)
    svg = re.sub(r"<\?xml[^>]*\?>\s*", "", svg)
    svg = re.sub(r'(<svg[^>]*?)\s+width="[^"]*"', r"\1", svg, count=1)
    svg = re.sub(r'(<svg[^>]*?)\s+height="[^"]*"', r"\1", svg, count=1)
    return svg


def incrustar_picture(html, base):
    """Cada <picture> del README pasa a dos mitades: solo-claro / solo-oscuro."""
    def reemplazo(m):
        bloque = m.group(0)
        claro = re.search(r'<img[^>]*src="([^"]+)"', bloque)
        oscuro = re.search(r'srcset="([^"]+)"', bloque)
        alt = re.search(r'alt="([^"]*)"', bloque)
        alt = (alt.group(1) if alt else "").replace('"', "&quot;")
        if not claro:
            return bloque
        ruta_claro = os.path.join(base, claro.group(1))
        if not os.path.exists(ruta_claro):
            return bloque
        partes = ['<span class="grafico solo-claro" role="img" aria-label="%s">%s</span>'
                  % (alt, _svg_incrustado(ruta_claro))]
        if oscuro:
            ruta_oscuro = os.path.join(base, oscuro.group(1))
            if os.path.exists(ruta_oscuro):
                partes.append('<span class="grafico solo-oscuro" role="img" aria-label="%s">%s</span>'
                              % (alt, _svg_incrustado(ruta_oscuro)))
        return "".join(partes)

    return re.sub(r"<picture>.*?</picture>", reemplazo, html, flags=re.S)


def incrustar_svg(html, base):
    """Cambia cada <img src="...svg"> por el SVG real, incrustado."""
    def reemplazo(m):
        etiqueta, src = m.group(0), m.group(1)
        ruta = os.path.join(base, src.split("?")[0])
        if not os.path.exists(ruta):
            return etiqueta
        svg = leer(ruta)
        svg = re.sub(r"<\?xml[^>]*\?>\s*", "", svg)
        # el ancho lo controla el CSS del contenedor
        svg = re.sub(r'(<svg[^>]*?)\s+width="[^"]*"', r"\1", svg, count=1)
        svg = re.sub(r'(<svg[^>]*?)\s+height="[^"]*"', r"\1", svg, count=1)
        alto = ""
        mh = re.search(r'alt="([^"]*)"', etiqueta)
        if mh and "insignia" in src:
            alto = ' class="insignia"'
        return '<span class="grafico%s" role="img" aria-label="%s">%s</span>' % (
            " insignia-contenedor" if alto else "",
            (mh.group(1) if mh else "").replace('"', "&quot;"),
            svg,
        )

    return re.sub(r'<img[^>]*src="([^"]+\.svg)"[^>]*>', reemplazo, html)


PLANTILLA = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shin-MD · vista previa del README pastel</title>
<style>
  :root {
    --fondo: #FFF7FA; --texto: #3D2130; --suave: #8E6F7E; --borde: #F6DCE6;
    --codigo: #FDEBF1; --caja: #FFFFFF; --acento: #D8437A; --enlace: #D8437A;
    --cita: #FFF1E8; --cita-borde: #F5B23F;
  }
  html[data-tema="oscuro"] {
    --fondo: #2A1A23; --texto: #FFF1F6; --suave: #D3B0C0; --borde: #543244;
    --codigo: #3B2431; --caja: #3B2431; --acento: #FFA8CB; --enlace: #FFA8CB;
    --cita: #3A2C22; --cita-borde: #FFCB74;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--fondo); color: var(--texto);
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
    transition: background .2s, color .2s;
  }
  .barra {
    position: sticky; top: 0; z-index: 9; display: flex; align-items: center; gap: 14px;
    padding: 12px 22px; background: var(--caja); border-bottom: 1px solid var(--borde);
    box-shadow: 0 4px 18px rgba(190,120,150,.12); font-size: 14px; color: var(--suave);
  }
  .barra b { color: var(--texto); font-size: 15px; }
  .barra .punto { width: 10px; height: 10px; border-radius: 50%; background: #F0689B; display: inline-block; }
  .barra button {
    margin-left: auto; cursor: pointer; font: inherit; font-weight: 600;
    background: var(--codigo); color: var(--acento); border: 1px solid var(--borde);
    border-radius: 999px; padding: 8px 16px;
  }
  .hoja { max-width: 1012px; margin: 0 auto; padding: 26px 22px 80px; }
  h1, h2 { border-bottom: 1px solid var(--borde); padding-bottom: .3em; font-weight: 700; }
  h1 { font-size: 2em; margin: .3em 0 .5em; }
  h2 { font-size: 1.5em; margin: 1.7em 0 .8em; }
  h3 { font-size: 1.17em; }
  a { color: var(--enlace); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code {
    background: var(--codigo); border-radius: 6px; padding: .18em .4em;
    font: 85%/1.5 ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  }
  pre {
    background: var(--codigo); border: 1px solid var(--borde); border-radius: 12px;
    padding: 14px 16px; overflow: auto;
  }
  pre code { background: none; padding: 0; font-size: 87%; }
  blockquote {
    margin: 0 0 1em; padding: 12px 18px; border-left: 5px solid var(--cita-borde);
    background: var(--cita); border-radius: 0 12px 12px 0;
  }
  blockquote h3 { margin: .2em 0; border: 0; }
  blockquote p { margin: .4em 0; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 1.2em; display: block; overflow: auto; }
  th, td { border: 1px solid var(--borde); padding: 8px 13px; text-align: left; }
  th { background: var(--codigo); }
  td:first-child { white-space: nowrap; }
  ul li, ol li { margin: .3em 0; }
  hr { border: 0; border-top: 1px solid var(--borde); margin: 2em 0; }
  details {
    background: var(--caja); border: 1px solid var(--borde); border-radius: 12px;
    padding: 10px 16px; margin: 0 0 1.2em;
  }
  summary { cursor: pointer; font-weight: 600; }
  .grafico { display: block; width: 100%; }
  .grafico svg { display: block; width: 100%; height: auto; }
  .solo-oscuro { display: none; }
  html[data-tema="oscuro"] .solo-claro { display: none; }
  html[data-tema="oscuro"] .solo-oscuro { display: block; }
  .insignia-contenedor { display: inline-block; width: auto; margin: 2px 3px; vertical-align: middle; }
  .insignia-contenedor svg { width: auto; height: 52px; }
  .centrado { text-align: center; }
  .centrado .grafico { margin: 0 auto; }
  .nota {
    background: var(--caja); border: 1px dashed var(--borde); border-radius: 14px;
    padding: 14px 20px; margin: 26px 0 0; font-size: 15px; color: var(--suave);
  }
  .nota b { color: var(--texto); }
</style>
</head>
<body>
<div class="barra">
  <span class="punto"></span>
  <b>Shin-MD</b> · vista previa del README (estilo pastel)
  <span>· los gráficos van incrustados, sin internet</span>
  <button onclick="document.documentElement.dataset.tema = document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro'">
    Cambiar tema
  </button>
</div>
<div class="hoja">
{contenido}
<div class="nota">
  <b>Esto es solo la vista previa.</b> El archivo que se copia al repositorio es
  <code>README.md</code>, que apunta a los gráficos de <code>docs/assets/pastel/</code> y
  cambia solo entre tema claro y oscuro con <code>prefers-color-scheme</code>.
</div>
</div>
</body>
</html>
"""


def main(destino=None):
    contenido = markdown.markdown(
        leer(README),
        extensions=["tables", "fenced_code", "md_in_html", "attr_list", "sane_lists"],
    )
    contenido = incrustar_picture(contenido, RAIZ)
    contenido = incrustar_svg(contenido, RAIZ)
    # las secciones centradas se marcan desde el atributo align="center" del README
    contenido = contenido.replace('<div align="center">', '<div class="centrado">')
    html = PLANTILLA.replace("{contenido}", contenido)
    destino = destino or SALIDA
    with open(destino, "w", encoding="utf-8") as fh:
        fh.write(html)
    print("%s → %.1f KB" % (os.path.basename(destino), os.path.getsize(destino) / 1024))

    faltantes = [
        s for s in re.findall(r'src="([^"]+\.svg)"', leer(README))
        if not os.path.exists(os.path.join(RAIZ, s))
    ]
    print("gráficos que faltan:", faltantes or "ninguno")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
