# -*- coding: utf-8 -*-
"""
Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
Copyright (C) 2026 riokuroxi-svg
SPDX-License-Identifier: AGPL-3.0-only
Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
"""
"""
arte_marca — la marca de Shin-MD, dibujada con código.

    python3 tools/arte_marca.py

No hay ninguna imagen generada por IA en el repositorio: la mascota y los
banners se dibujan aquí, con formas y curvas, y se guardan como PNG. Así la
marca se puede versionar, auditar y volver a generar igual dentro de diez años.

Qué produce:
  assets/brand/shin-marca.png     marca cuadrada (llama 魂 sobre koi 鯉)
  assets/brand/banner-dia.png     banner horizontal, fondo crema
  assets/brand/banner-noche.png   banner horizontal, fondo noche

Regla del repositorio: si una imagen no es dibujada por este archivo (o por
tools/build_pastel.py), no entra.
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
SALIDA = os.path.join(RAIZ, "assets", "brand")
BANNERS = os.path.join(RAIZ, "media", "banners")
PORTADAS = os.path.join(RAIZ, "media", "covers")

CJK = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# La misma paleta que tools/pastel_lienzo.py, para que el bot y el README
# no parezcan dos proyectos distintos.
PAL = dict(
    tinta="#2E2740", lila="#7C5FC4", lila_fuerte="#5B3F9E", lila_claro="#C3AEEC",
    verde="#3F9C86", ambar="#C98A2E", blanco="#FFFFFF",
    crema1="#FBF3E4", crema2="#F6F1FC",
    noche1="#1A1230", noche2="#2A1B4A", noche3="#120D22",
)


def _hex(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _mezcla(a, b, t):
    """Interpola dos colores. t=0 → a, t=1 → b."""
    ca, cb = _hex(a), _hex(b)
    return tuple(round(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))


def _degradado(im, puntos, vertical=True):
    """Pinta un degradado de varios topes sobre la imagen."""
    w, h = im.size
    d = ImageDraw.Draw(im)
    n = h if vertical else w
    for i in range(n):
        t = i / max(1, n - 1)
        pos = t * (len(puntos) - 1)
        j = min(int(pos), len(puntos) - 2)
        col = _mezcla(puntos[j], puntos[j + 1], pos - j)
        if vertical:
            d.line([(0, i), (w, i)], fill=col)
        else:
            d.line([(i, 0), (i, h)], fill=col)


def _arco(d, caja, inicio, fin, color, grosor):
    """Arco grueso con extremos redondeados (PIL solo hace uno; se remata)."""
    d.arc(caja, inicio, fin, fill=color, width=grosor)
    r = grosor / 2
    for ang in (inicio, fin):
        a = math.radians(ang)
        cx = (caja[0] + caja[2]) / 2
        cy = (caja[1] + caja[3]) / 2
        rx = (caja[2] - caja[0]) / 2 - r
        ry = (caja[3] - caja[1]) / 2 - r
        x = cx + rx * math.cos(a)
        y = cy + ry * math.sin(a)
        d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def _koi(d, cx, cy, s, cuerpo, panza, ojo):
    """Un koi de perfil, nadando en diagonal. Cuerpo curvo, cola de dos velas."""
    # cola (dos velas abiertas)
    d.polygon([(cx - s * 0.42, cy + s * 0.10),
               (cx - s * 0.92, cy - s * 0.28),
               (cx - s * 0.70, cy + s * 0.06),
               (cx - s * 0.94, cy + s * 0.40)], fill=cuerpo)
    # cuerpo: elipse girada, hecha con dos círculos unidos suavemente
    d.ellipse([cx - s * 0.46, cy - s * 0.34, cx + s * 0.50, cy + s * 0.34], fill=cuerpo)
    d.ellipse([cx + s * 0.10, cy - s * 0.26, cx + s * 0.72, cy + s * 0.22], fill=cuerpo)
    # panza clara
    d.ellipse([cx - s * 0.30, cy - s * 0.02, cx + s * 0.52, cy + s * 0.30], fill=panza)
    # aleta dorsal
    d.polygon([(cx - s * 0.10, cy - s * 0.30),
               (cx + s * 0.10, cy - s * 0.58),
               (cx + s * 0.26, cy - s * 0.26)], fill=cuerpo)
    # aleta pectoral
    d.polygon([(cx + s * 0.06, cy + s * 0.16),
               (cx - s * 0.16, cy + s * 0.52),
               (cx + s * 0.24, cy + s * 0.30)], fill=cuerpo)
    # ojo
    d.ellipse([cx + s * 0.44, cy - s * 0.14, cx + s * 0.56, cy - s * 0.02], fill=ojo)


def _ola(d, y, ancho, alto, color, amplitud=14, periodo=180, desfase=0.0):
    """Una ola delgada, para el pie y el fondo."""
    pts = []
    for x in range(0, ancho + 1, 6):
        pts.append((x, y + amplitud * math.sin((x / periodo) * 2 * math.pi + desfase)))
    pts.append((ancho, alto))
    pts.append((0, alto))
    d.polygon(pts, fill=color)


def _texto_centrado(d, caja, txt, fuente, color):
    x0, y0, x1, y1 = caja
    caja_txt = d.textbbox((0, 0), txt, font=fuente)
    w = caja_txt[2] - caja_txt[0]
    h = caja_txt[3] - caja_txt[1]
    d.text((x0 + (x1 - x0 - w) / 2 - caja_txt[0],
            y0 + (y1 - y0 - h) / 2 - caja_txt[1]), txt, font=fuente, fill=color)


def marca():
    """512×512: la llama (魂) custodiando al koi (鯉). Sin caras, sin IA."""
    S = 512
    im = Image.new("RGB", (S, S), PAL["crema1"])
    _degradado(im, [PAL["crema1"], PAL["crema2"]], vertical=False)
    d = ImageDraw.Draw(im)

    # halo suave detrás
    for r, a in [(410, "#EEE7FA"), (330, "#F4EEFB"), (250, "#F6F1FC")]:
        d.ellipse([S / 2 - r / 2, S / 2 - r / 2, S / 2 + r / 2, S / 2 + r / 2], fill=a)

    # marco redondeado
    d.rounded_rectangle([18, 18, S - 18, S - 18], radius=64,
                        outline=PAL["lila_claro"], width=6)
    d.rounded_rectangle([34, 34, S - 34, S - 34], radius=52,
                        outline="#FFFFFF", width=4)

    # llama (gota de fuego)
    llama = [
        (256, 92), (300, 168), (330, 214), (344, 262), (338, 310),
        (310, 358), (262, 384), (206, 380), (170, 342), (160, 296),
        (170, 252), (192, 214), (214, 178), (238, 148),
    ]
    d.polygon(llama, fill=PAL["lila_fuerte"])
    d.polygon([(256, 150), (296, 226), (312, 268), (300, 320), (262, 348),
               (214, 340), (190, 300), (196, 256), (228, 200)], fill=PAL["lila"])
    # brillo lateral de la llama (una media luna, no un hueco central)
    d.polygon([(256, 150), (238, 214), (228, 268), (236, 320), (216, 344),
               (200, 300), (204, 250), (228, 190)], fill=PAL["lila_claro"])

    # kanji 魂, blanco sobre el morado: el único texto de la marca
    f_kanji = ImageFont.truetype(CJK, 92)
    _texto_centrado(d, (168, 244, 344, 366), "魂", f_kanji, "#FDFBFF")

    # koi cruzando delante, en la base
    _koi(d, 300, 396, 110, PAL["verde"], "#DCEEE8", PAL["tinta"])

    # chispitas
    for x, y, r in [(118, 140, 5), (398, 132, 4), (424, 232, 3), (96, 300, 3)]:
        d.ellipse([x - r, y - r, x + r, y + r], fill=PAL["ambar"])

    ruta = os.path.join(SALIDA, "shin-marca.png")
    im.save(ruta, optimize=True)
    print("%7.1f KB  %s" % (os.path.getsize(ruta) / 1024, os.path.basename(ruta)))


def banner(nombre, fondos, tinta, sub, kanji_col, koi_col, panza, sufijo):
    """1000×420: la marca a la izquierda, el nombre a la derecha."""
    W, H = 1000, 420
    im = Image.new("RGB", (W, H), fondos[0])
    _degradado(im, fondos)
    d = ImageDraw.Draw(im)

    # olas del pie
    _ola(d, H - 96, W, H, _mezcla(fondos[-1], kanji_col, 0.18), 12, 260, 0.0)
    _ola(d, H - 62, W, H, _mezcla(fondos[-1], kanji_col, 0.32), 10, 200, 1.6)

    # círculo de marca
    cx, cy, R = 208, H / 2, 132
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=_mezcla(fondos[-1], kanji_col, 0.42))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=kanji_col, width=5)
    d.ellipse([cx - R + 14, cy - R + 14, cx + R - 14, cy + R - 14],
              outline=_mezcla(fondos[-1], kanji_col, 0.78), width=3)

    # llama dentro del círculo
    esc = 0.62
    llama = [(0, -150), (58, -34), (92, 22), (104, 74), (94, 122),
             (62, 164), (6, 186), (-56, 180), (-96, 138), (-108, 88),
             (-96, 42), (-70, 2), (-44, -38), (-16, -96)]
    d.polygon([(cx + x * esc, cy + y * esc) for x, y in llama], fill=kanji_col)
    f_kanji = ImageFont.truetype(CJK, 62)
    _texto_centrado(d, (cx - 76, cy - 24, cx + 76, cy + 78), "魂", f_kanji, "#FFFFFF")

    # nombre
    f_titulo = ImageFont.truetype(SANS, 96)
    f_sub = ImageFont.truetype(MONO, 30)
    f_kanji_g = ImageFont.truetype(CJK, 40)
    d.text((392, 96), "SHIN", font=f_titulo, fill=tinta)
    ancho_shin = d.textbbox((0, 0), "SHIN", font=f_titulo)[2]
    d.text((392 + ancho_shin + 6, 96), "-MD", font=f_titulo, fill=kanji_col)
    d.line([(400, 214), (400 + 300, 214)], fill=_mezcla(fondos[-1], kanji_col, 0.5), width=6)
    d.text((392, 232), sub, font=f_sub, fill=_mezcla(tinta, fondos[-1], 0.25))
    d.text((392, 272), "反魂", font=f_kanji_g, fill=kanji_col)
    _koi(d, 760, 318, 74, koi_col, panza, tinta)

    ruta = os.path.join(BANNERS, nombre)
    im.save(ruta, optimize=True)
    print("%7.1f KB  media/banners/%s" % (os.path.getsize(ruta) / 1024, os.path.basename(ruta)))


def portada():
    """500×500: la carátula que se incrusta en los MP3 de .play/.mp3."""
    S = 500
    im = Image.new("RGB", (S, S), PAL["lila"])
    _degradado(im, [PAL["lila_fuerte"], PAL["lila"], PAL["lila_claro"]])
    d = ImageDraw.Draw(im)
    for r, a in [(470, "#6D51B4"), (380, "#7C5FC4"), (280, "#8C6FD0")]:
        d.ellipse([S / 2 - r / 2, S / 2 - r / 2, S / 2 + r / 2, S / 2 + r / 2], fill=a)
    d.ellipse([S / 2 - 118, S / 2 - 118, S / 2 + 118, S / 2 + 118], fill="#FDFBFF")
    d.ellipse([S / 2 - 100, S / 2 - 100, S / 2 + 100, S / 2 + 100], fill=PAL["lila_fuerte"])
    f_kanji = ImageFont.truetype(CJK, 96)
    _texto_centrado(d, (S / 2 - 100, S / 2 - 66, S / 2 + 100, S / 2 + 74), "魂", f_kanji, "#FDFBFF")
    f_t = ImageFont.truetype(SANS, 40)
    _texto_centrado(d, (0, 34, S, 84), "SHIN-MD", f_t, "#FDFBFF")
    f_s = ImageFont.truetype(MONO, 17)
    f_cjk_p = ImageFont.truetype(CJK, 20)
    _texto_centrado(d, (0, S - 66, S - 40, S - 34), "MUSIC", f_s, "#EDE4F8")
    _texto_centrado(d, (S - 150, S - 70, S - 40, S - 30), "反魂", f_cjk_p, "#EDE4F8")
    _koi(d, 400, 430, 62, "#5FC7AE", "#DCEEE8", PAL["tinta"])
    ruta = os.path.join(PORTADAS, "shin-portada.png")
    im.save(ruta, optimize=True)
    print("%7.1f KB  media/covers/%s" % (os.path.getsize(ruta) / 1024, os.path.basename(ruta)))


def main():
    os.makedirs(SALIDA, exist_ok=True)
    os.makedirs(BANNERS, exist_ok=True)
    os.makedirs(PORTADAS, exist_ok=True)
    print("marca, banners y portada dibujados a mano (0 imágenes de IA)\n")
    marca()
    portada()
    banner("banner-day.png", [PAL["crema1"], PAL["crema2"], "#EDE4F8"],
           PAL["tinta"], "bot de WhatsApp · anti-ban propio",
           PAL["lila_fuerte"], PAL["verde"], "#DCEEE8", "dia")
    banner("banner-night.png", [PAL["noche1"], PAL["noche2"], PAL["noche3"]],
           "#F6F1FC", "bot de WhatsApp · modo noche",
           PAL["lila_claro"], "#5FC7AE", "#1E3A38", "noche")


if __name__ == "__main__":
    main()
