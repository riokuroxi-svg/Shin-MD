#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
# Copyright (C) 2026 riokuroxi-svg
# SPDX-License-Identifier: AGPL-3.0-only
"""
build_perfil — dibuja las piezas nuevas del README (estilo «perfil»).

    python3 tools/preparar_arte.py     # primero las ilustraciones
    python3 tools/build_perfil.py      # después las piezas vectoriales

Salida en docs/assets/perfil/:

    portada.svg        la cabecera con el arte a la derecha
    cifras.svg         la franja de números reales del bot
    divisor.svg        la línea con la flor de cerezo
    pie.svg            la despedida
    insignias/*.svg    una por etiqueta (pruebas, comandos, node, licencia, kofi)

Reglas que se respetan igual que en el resto del proyecto:

  · cada pieza es autocontenida (lleva su fondo), así se ve igual en tema
    claro y oscuro, sin depender de la configuración de GitHub;
  · todo el texto va a trazado vectorial: nada de fuentes externas;
  · los números salen de docs/assets/datos.json, no se escriben a mano;
  · el arte va **dentro** del SVG como data URI, porque GitHub sirve los SVG
    por su caché de imágenes y una ruta relativa dejaría de resolver.
"""
from __future__ import annotations

import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, AQUI)

from pastel_lienzo import (  # noqa: E402
    baloo, baloo_med, bloque, cjk, esc, formato, mono, nunito, nunito_med,
    nunito_suave, quicksand, quicksand_suave, texto, texto_centrado, Lienzo,
)
from svgkit import corazon, estrella, uri_imagen  # noqa: E402

SALIDA = os.path.join(RAIZ, "docs", "assets", "perfil")
ARTE = os.path.join(RAIZ, "docs", "assets", "arte")
os.makedirs(SALIDA, exist_ok=True)
os.makedirs(os.path.join(SALIDA, "insignias"), exist_ok=True)

# ── paleta ────────────────────────────────────────────────────────────────
# Sakura y lila: el rosa carga los acentos, el lila sostiene el texto y el
# crema sujeta el fondo para que no se vuelva un pastel azucarado.
P = dict(
    papel="#FFFAF6", papel2="#FFF3F6", blanco="#FFFFFF",
    tinta="#2A2340", tinta_suave="#5F5478", tinta_tenue="#9A8FB2",
    sakura="#F6A8C0", sakura_fuerte="#E4668F", sakura_palido="#FDE3EC",
    lila="#9B7BD4", lila_fuerte="#6E4FB0", lila_palido="#EFE8FB",
    menta="#6FCBB0", menta_oscura="#2F7F6B",
    ambar="#D99A3C",
    borde="#F2DDE6",
)


def cifras():
    """Números reales del bot, de docs/assets/datos.json."""
    ruta = os.path.join(RAIZ, "docs", "assets", "datos.json")
    d = {}
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as fh:
            d = json.load(fh)
    return d


D = cifras()
PRUEBAS = D.get("pruebas") or 0
TOTAL = D.get("pruebasTotal") or PRUEBAS
ARCHIVOS = D.get("archivos") or 0
COMANDOS = D.get("comandos") or 0
NOMBRES = D.get("nombres") or 0
ALIAS = D.get("alias") or 0
CATEGORIAS = D.get("categorias") or 0
VERSION = D.get("version") or "0.0.0"
NODE = D.get("node") or "22.5"


# ── ayudas ────────────────────────────────────────────────────────────────
def guardar(c, nombre):
    """Escribe la pieza en docs/assets/perfil (no en la carpeta del pastel)."""
    ruta = os.path.join(SALIDA, nombre)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    c.guardar(ruta)
    print("%8.1f KB  %s" % (os.path.getsize(ruta) / 1024, nombre))


def pastilla(c, fuente, txt, x, y, tam=15, fondo=None, color=None, alto=None, borde=None):
    """Etiqueta redondeada. Devuelve el ancho total."""
    alto = alto or tam * 2.1
    w = fuente.ancho(txt, tam, 0.3) + alto * 1.35
    c.rect(x, y, w, alto, alto / 2, fondo or P["blanco"], trazo=borde, grosor=1.4 if borde else 0)
    texto(c, fuente, txt, tam, x + alto * 0.68, y + alto / 2 + fuente.alto(tam, "cap") / 2, color or P["tinta"], 0.3)
    return w


def fondo_papel(c, ancho, alto):
    c.gradiente_lineal("papel", [("0", P["papel"]), ("0.55", P["papel2"]), ("1", P["lila_palido"])],
                       x1=0, y1=0, x2=1, y2=1)
    c.gradiente_radial("halo", [("0", P["sakura"], "0.22"), ("1", P["sakura"], "0")])
    c.sombra("sombra", dy=7, desenfoque=13, color="#C98BA8", opacidad=0.22)
    c.rect(0, 0, ancho, alto, 0, "url(#papel)")
    c.elipse(ancho * 0.86, alto * 0.18, ancho * 0.3, alto * 0.55, "url(#halo)")


# ══════════════════════════════════════════════════════════ la portada ══
def portada():
    AA, AL = 1200, 470
    c = Lienzo(AA, AL, "Shin-MD — bot de WhatsApp con anti-ban propio")
    fondo_papel(c, AA, AL)

    # el arte, a la derecha, a sangre por arriba y por abajo
    meta = AL - 60
    x_arte, w_arte = AA - 330 - 40, 330
    ruta = os.path.join(ARTE, "portada.jpg")
    if not os.path.exists(ruta):
        raise SystemExit("falta %s: ejecuta tools/preparar_arte.py" % ruta)
    c.defs_agrega('<clipPath id="panel"><rect x="%s" y="30" width="%s" height="%s" rx="24"/></clipPath>'
                  % (formato(x_arte), formato(w_arte), formato(meta)))
    c.agrega('<image href="%s" x="%s" y="30" width="%s" height="%s" preserveAspectRatio="xMidYMid slice" '
             'clip-path="url(#panel)"/>' % (uri_imagen(ruta), formato(x_arte), formato(w_arte), formato(meta)))
    c.rect(x_arte - 3, 30, 3, meta, 2, P["sakura_fuerte"], opacidad=0.55)

    # marca: flor de cerezo + rótulos
    c.circulo(78, 78, 26, P["sakura_palido"], trazo=P["sakura"], grosor=2.2)
    c.agrega(estrella(78, 78, 13, P["sakura_fuerte"], puntos=5, radio_int=0.42))
    texto(c, quicksand, "BOT DE WHATSAPP  ·  AGPL-3.0", 13, 116, 72, P["sakura_fuerte"], 3.2)
    texto(c, nunito_suave, "riokuroxi-svg/Shin-MD", 15, 116, 94, P["tinta_tenue"], 0.2)

    # nombre
    texto(c, baloo, "SHIN", 74, 62, 196, P["tinta"], -1.2)
    ancho = baloo.ancho("SHIN", 74, -1.2)
    texto(c, baloo, "-MD", 74, 62 + ancho, 196, P["lila_fuerte"], -1.2)
    ancho += baloo.ancho("-MD", 74, -1.2)
    c.rect(66, 210, ancho * 0.66, 9, 4.5, P["sakura"], opacidad=0.95)

    # El kanji va con la fuente CJK: Nunito no lo tiene y saldría un guion.
    ancho_k = 0
    if cjk is not None:
        ancho_k = cjk.ancho("反魂", 26)
        c.camino(cjk.trazado("反魂", 26, 68, 250), P["lila_fuerte"])
        ancho_k += 12
    texto(c, nunito_med, "el renacer de un bot superior", 21, 68 + ancho_k, 250, P["lila_fuerte"], 0.5)
    texto(c, nunito_suave, "No se cae, no se banea y no borra tu sesión.", 22, 66, 286, P["tinta_suave"], 0.2)
    texto(c, nunito_suave, "%d comandos · anti-ban propio · Node ≥ %s" % (COMANDOS, NODE),
          18, 66, 318, P["tinta_tenue"], 0.2)

    # la orden de arranque, en su terminal
    c.rect(66, 344, 330, 50, 25, "#221C31", filtro="sombra")
    c.circulo(96, 369, 14, P["menta"])
    texto(c, mono, "$", 17, 90, 375, "#221C31")
    texto(c, mono, "npm start -- --code", 17, 116, 375, "#F6F1FC", 0.2)
    texto(c, nunito_suave, "8 caracteres en pantalla · o --qr si prefieres", 14, 68, 416, P["tinta_tenue"], 0.2)

    # pétalos sueltos
    c.agrega(corazon(470, 120, 9, P["sakura"], opacidad=0.75))
    c.agrega(estrella(432, 344, 9, P["ambar"], giro=14, opacidad=0.8))
    c.agrega(estrella(700, 96, 7, P["lila"], giro=28, opacidad=0.7))
    guardar(c, "portada.svg")


# ══════════════════════════════════════════════════════════ las cifras ══
def franja_cifras():
    AA, AL = 1160, 150
    c = Lienzo(AA, AL, "Cifras reales: %d pruebas, %d comandos, %d nombres" % (TOTAL, COMANDOS, NOMBRES))
    fondo_papel(c, AA, AL)
    c.rect(0, 0, AA, AL, 0, "url(#papel)")

    datos = [
        ("PRUEBAS", "%d/%d" % (PRUEBAS, TOTAL), "%d archivos" % ARCHIVOS, P["menta"]),
        ("COMANDOS", "%d" % COMANDOS, "%d categorías" % CATEGORIAS, P["lila"]),
        ("NOMBRES", "%d" % NOMBRES, "%d alias" % ALIAS, P["sakura_fuerte"]),
        ("VERSIÓN", VERSION, "Node ≥ %s" % NODE, P["ambar"]),
    ]
    ancho_t, sep = 262, 18
    x0 = (AA - (ancho_t * 4 + sep * 3)) / 2
    for i, (etq, val, nota, color) in enumerate(datos):
        x = x0 + i * (ancho_t + sep)
        c.rect(x, 20, ancho_t, AL - 40, 20, P["blanco"], filtro="sombra")
        c.rect(x, 20, 7, AL - 40, 3.5, color)
        texto(c, nunito, etq, 13, x + 26, 48, P["tinta_tenue"], 1.6)
        texto(c, baloo, val, 34, x + 24, 88, P["tinta"], -0.4)
        ancho_v = baloo.ancho(val, 34, -0.4)
        texto(c, nunito_suave, nota, 14, x + 32 + ancho_v, 88, P["tinta_suave"], 0.2)
    guardar(c, "cifras.svg")


# ═══════════════════════════════════════════════════ divisor y pie ══
def divisor():
    AA, AL = 1160, 54
    c = Lienzo(AA, AL, "")
    c.linea(0, AL / 2, AA / 2 - 40, AL / 2, P["borde"], 2)
    c.linea(AA / 2 + 40, AL / 2, AA, AL / 2, P["borde"], 2)
    c.circulo(AA / 2, AL / 2, 17, P["papel"])
    c.agrega(estrella(AA / 2, AL / 2, 12, P["sakura_fuerte"], puntos=5, radio_int=0.42))
    c.agrega(estrella(AA / 2 - 62, AL / 2, 4, P["lila"], giro=20, opacidad=0.7))
    c.agrega(estrella(AA / 2 + 62, AL / 2, 4, P["menta"], giro=10, opacidad=0.7))
    guardar(c, "divisor.svg")


def pie():
    AA, AL = 1160, 96
    c = Lienzo(AA, AL, "Shin-MD · AGPL-3.0-only · riokuroxi-svg")
    c.rect(0, 0, AA, AL, 22, P["papel2"], trazo=P["borde"], grosor=1.6)
    texto_centrado(c, quicksand, "Shin-MD · v%s · AGPL-3.0-only" % VERSION, 20, AA / 2, 42, P["tinta"])
    texto_centrado(c, nunito_suave,
                   "Sin publicidad ni funciones de pago. Usa un chip aparte, nunca tu número de siempre.",
                   15, AA / 2, 68, P["tinta_tenue"], 0.2)
    c.agrega(corazon(AA / 2 - 250, 38, 7, P["sakura"], opacidad=0.85))
    c.agrega(corazon(AA / 2 + 250, 38, 7, P["sakura"], opacidad=0.85))
    guardar(c, "pie.svg")


# ══════════════════════════════════════════════════════ insignias ══
def insignia(nombre, etiqueta, valor, color, icono_nombre=None):
    tam, h = 19, 50
    ancho_txt = quicksand.ancho(etiqueta, tam, 0.2)
    ancho_val = baloo_med.ancho(valor, tam + 3, 0.2)
    w = 26 + (26 if icono_nombre else 0) + ancho_txt + 12 + ancho_val + 26
    c = Lienzo(w, h, "%s %s" % (etiqueta, valor))
    c.gradiente_lineal("gi", [("0", P["papel"]), ("1", P["papel2"])], x1=0, y1=0, x2=1, y2=0)
    c.rect(0, 0, w, h, 15, "url(#gi)", trazo=P["borde"], grosor=1.5)
    x = 22
    if icono_nombre:
        c.circulo(x + 9, h / 2, 15, color, opacidad=0.16)
        c.agrega(estrella(x + 9, h / 2, 7, color, puntos=5, radio_int=0.42))
        x += 30
    texto(c, quicksand, etiqueta, tam, x, h / 2 + quicksand.alto(tam, "cap") / 2, P["tinta_suave"], 0.2)
    texto(c, baloo_med, valor, tam + 3, x + ancho_txt + 12,
          h / 2 + baloo_med.alto(tam + 3, "cap") / 2, color, 0.2)
    guardar(c, os.path.join("insignias", nombre))


def insignias():
    insignia("pruebas.svg", "pruebas", "%d/%d" % (PRUEBAS, TOTAL), P["menta_oscura"], True)
    insignia("comandos.svg", "comandos", "%d" % COMANDOS, P["ambar"], True)
    insignia("node.svg", "node", "≥ %s" % NODE, P["lila_fuerte"], True)
    insignia("licencia.svg", "licencia", "AGPL-3.0", P["sakura_fuerte"], True)
    insignia("kofi.svg", "apoyar", "Ko-fi", P["lila"], False)


def main():
    print("Piezas del README (estilo perfil) → docs/assets/perfil/")
    portada()
    franja_cifras()
    divisor()
    pie()
    insignias()


if __name__ == "__main__":
    main()
