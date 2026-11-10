#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
# Copyright (C) 2026 riokuroxi-svg
# SPDX-License-Identifier: AGPL-3.0-only
"""
preparar_arte — deja listas las ilustraciones del README.

    python3 tools/preparar_arte.py

Entra:  assets/src/perfil/*.jpg   (los originales, tal como llegan)
Sale:   docs/assets/arte/*.jpg    (los que usa el README)

Las imágenes que llegan por WhatsApp o por Pinterest vienen pequeñas y con la
compresión castigada. Aquí no se inventa detalle —eso no existe— pero sí se
aprovecha todo el que hay:

  1. **Supermuestreo**: se suben ×2 con LANCZOS y se trabaja ahí.
  2. **Paso alto suave** (unsharp mask) para devolver el filo que se comió el
     JPEG original, sin el halo blanco que deja el enfoque agresivo.
  3. **Contraste local medido**, no a ojo: se estira el histograma solo hasta
     donde no se quema ninguna zona.
  4. **Bajada al tamaño final** con LANCZOS: al reducir desde el doble, los
     bordes quedan limpios (esto es lo que hace que deje de verse borroso).
  5. **JPEG 4:4:4** (sin submuestreo de color) con calidad 92: los degradados
     morados y rosas son justo lo que más sufre con el submuestreo.

Cada pieza tiene su recorte declarado abajo. Los originales no se tocan: si un
recorte queda mal, se cambia aquí y se vuelve a ejecutar.
"""
from __future__ import annotations

import os

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
ORIGEN = os.path.join(RAIZ, "assets", "src", "perfil")
SALIDA = os.path.join(RAIZ, "docs", "assets", "arte")

# nombre final: (archivo de origen, ancho final, alto final, encuadre)
#   encuadre: "centro" | "arriba" | "izquierda" | "derecha"
#            (de dónde se recorta cuando el original no tiene la proporción)
PIEZAS = {
    # La figura del panel de la portada: es la única vertical del juego.
    "portada.jpg":      ("retrato.jpg", 300, 470, "centro"),
    # Galería (16:9 para que la rejilla de tres columnas cuadre).
    "galeria-1.jpg":    ("capucha.jpg", 640, 360, "centro"),
    "galeria-2.jpg":    ("ciudad.jpg", 640, 360, "centro"),
    "galeria-3.jpg":    ("escritorio-lila.jpg", 640, 360, "centro"),
    # Banda ancha de cierre de la galería.
    "banda.jpg":        ("game-over.jpg", 1200, 420, "centro"),
    # Retrato de la sección «cómo se hizo», al lado del texto.
    "retrato.jpg":      ("noche-codigo.jpg", 420, 500, "centro"),
}

SUPER = 2          # factor de supermuestreo
CALIDAD = 92       # JPEG 4:4:4


def _encuadre(im, ancho, alto, donde):
    """Recorta a la proporción pedida sin deformar, desde `donde`."""
    objetivo = ancho / alto
    actual = im.width / im.height
    if actual > objetivo:                     # sobra ancho
        nuevo = int(round(im.height * objetivo))
        if donde == "izquierda":
            x = 0
        elif donde == "derecha":
            x = im.width - nuevo
        else:
            x = (im.width - nuevo) // 2
        im = im.crop((x, 0, x + nuevo, im.height))
    elif actual < objetivo:                   # sobra alto
        nuevo = int(round(im.width / objetivo))
        if donde == "arriba":
            y = 0
        else:
            y = (im.height - nuevo) // 2
        im = im.crop((0, y, im.width, y + nuevo))
    return im


def preparar(nombre, origen, ancho, alto, donde):
    ruta = os.path.join(ORIGEN, origen)
    if not os.path.exists(ruta):
        raise SystemExit("falta %s" % ruta)
    im = Image.open(ruta)
    if im.mode != "RGB":
        im = im.convert("RGB")

    # 1. supermuestreo
    im = im.resize((im.width * SUPER, im.height * SUPER), Image.LANCZOS)

    # 2. filo: paso alto suave
    im = im.filter(ImageFilter.UnsharpMask(radius=1.6 * SUPER, percent=110, threshold=2))

    # 3. contraste local medido: se estira el histograma solo lo justo
    im = ImageOps.autocontrast(im, cutoff=1)
    im = ImageEnhance.Color(im).enhance(1.06)       # el morado agradece un poco
    im = ImageEnhance.Contrast(im).enhance(1.04)

    # 4. recorte y bajada al tamaño final
    im = _encuadre(im, ancho * SUPER, alto * SUPER, donde)
    im = im.resize((ancho, alto), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=0.8, percent=45, threshold=3))

    # 5. JPEG 4:4:4
    destino = os.path.join(SALIDA, nombre)
    im.save(destino, "JPEG", quality=CALIDAD, subsampling=0, optimize=True, progressive=True)
    kb = os.path.getsize(destino) / 1024
    print("  %-18s %4d×%-4d  %5.1f KB" % (nombre, ancho, alto, kb))
    return destino


def copiar_gif():
    """El gif animado se copia tal cual: recomprimirlo le quita cuadros."""
    origen = os.path.join(ORIGEN, "cargando.gif")
    if not os.path.exists(origen):
        return
    destino = os.path.join(SALIDA, "cargando.gif")
    with open(origen, "rb") as f, open(destino, "wb") as g:
        g.write(f.read())
    print("  %-18s  %s  %5.1f KB" % ("cargando.gif", "640×360", os.path.getsize(destino) / 1024))


def main():
    os.makedirs(SALIDA, exist_ok=True)
    print("Ilustraciones del README → docs/assets/arte/")
    for nombre, (origen, ancho, alto, donde) in PIEZAS.items():
        preparar(nombre, origen, ancho, alto, donde)
    copiar_gif()
    print("listo.")


if __name__ == "__main__":
    main()
