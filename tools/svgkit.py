# -*- coding: utf-8 -*-
"""
svgkit — utilidades mínimas para generar SVG "a mano" para el README de Shin-MD.

Idea: nada de fuentes externas ni texto suelto. Todo el texto se convierte a
trazado vectorial (paths), así el dibujo se ve idéntico en cualquier móvil o
navegador aunque no tenga las fuentes instaladas. Igual que el hero actual del
repo.

Fuentes usadas (todas libres, OFL):
  · Baloo 2  (títulos y números gorditos)
  · Nunito   (texto y etiquetas)
  · Noto Sans CJK JP (el kanji 反魂)
"""
import base64
import os

from fontTools.misc.transform import Transform
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTCollection, TTFont
from fontTools.varLib import instancer

AQUI = os.path.dirname(os.path.abspath(__file__))



def _parada(p):
    """Acepta (offset, color) o (offset, color, opacidad)."""
    o, col = p[0], p[1]
    op = p[2] if len(p) > 2 else None
    return '<stop offset="%s" stop-color="%s"%s/>' % (
        esc(o), esc(col), (' stop-opacity="%s"' % esc(op)) if op is not None else "")


class Fuente:
    """Una fuente lista para sacar anchos y trazados."""

    def __init__(self, ruta, peso=None, indice=None, familia_cjk=None):
        if ruta.endswith(".ttc"):
            self.f = self._de_coleccion(ruta, familia_cjk, indice)
        else:
            self.f = TTFont(ruta)
        if peso is not None and "fvar" in self.f:
            self.f = instancer.instantiateVariableFont(self.f, {"wght": peso}, inplace=True)
        self.upem = self.f["head"].unitsPerEm
        self.gs = self.f.getGlyphSet()
        self.cmap = self.f.getBestCmap()
        self.hmtx = self.f["hmtx"]
        self.nombre = self.f["name"].getDebugName(1)

    @staticmethod
    def _de_coleccion(ruta, familia_cjk, indice):
        if indice is not None:
            return TTFont(ruta, fontNumber=indice)
        col = TTCollection(ruta)
        for i, sub in enumerate(col.fonts):
            fam = sub["name"].getDebugName(1) or ""
            if familia_cjk and familia_cjk.lower() in fam.lower():
                return sub
        raise ValueError("No encontré la subfuente %r en %s" % (familia_cjk, ruta))

    # ------------------------------------------------------------------ medidas
    def ancho(self, texto, tam, tracking=0.0):
        """Ancho real del texto, contando el interletrado entre caracteres."""
        total = 0.0
        primero = True
        for ch in texto:
            glifo = self.cmap.get(ord(ch))
            if glifo is None:
                continue
            if not primero:
                total += tracking
            total += self.hmtx[glifo][0] / self.upem * tam
            primero = False
        return total

    def alto(self, tam, metrica="cap"):
        f = self.f
        if metrica == "cap" and "OS/2" in f:
            return f["OS/2"].sCapHeight / self.upem * tam
        if metrica == "asc":
            return f["hhea"].ascent / self.upem * tam
        return tam

    # ----------------------------------------------------------------- trazados
    def trazado(self, texto, tam, x, base, tracking=0.0):
        """Devuelve el atributo `d` de un <path> con el texto convertido a curvas."""
        trozos = []
        cx = x
        primero = True
        for ch in texto:
            glifo = self.cmap.get(ord(ch))
            if glifo is None:
                continue
            if not primero:
                cx += tracking
            pluma = SVGPathPen(self.gs, ntos=lambda v: formato(v))
            transform = Transform(tam / self.upem, 0, 0, -tam / self.upem, cx, base)
            self.gs[glifo].draw(TransformPen(pluma, transform))
            d = pluma.getCommands()
            if d:
                trozos.append(d)
            cx += self.hmtx[glifo][0] / self.upem * tam
            primero = False
        return " ".join(trozos)


def formato(v):
    """Números cortos y sin ruido en el SVG (1 decimal basta a tamaño de pantalla)."""
    t = ("%.1f" % v).rstrip("0").rstrip(".")
    return "0" if t in ("-0", "") else t


def esc(t):
    return (
        str(t)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


class Lienzo:
    """Pequeño acumulador de elementos SVG."""

    def __init__(self, ancho, alto, nombre=""):
        self.ancho = ancho
        self.alto = alto
        self.nombre = nombre
        self.defs = []
        self.elementos = []

    # ------------------------------------------------------------ construcción
    def agrega(self, svg):
        self.elementos.append(svg)
        return self

    def defs_agrega(self, svg):
        self.defs.append(svg)
        return self

    def gradiente_lineal(self, gid, paradas, x1=0, y1=0, x2=1, y2=1):
        stops = "".join(_parada(p) for p in paradas)
        self.defs_agrega(
            '<linearGradient id="%s" x1="%s" y1="%s" x2="%s" y2="%s">%s</linearGradient>'
            % (esc(gid), x1, y1, x2, y2, stops)
        )
        return gid

    def gradiente_radial(self, gid, paradas, cx=0.5, cy=0.5, r=0.5):
        stops = "".join(_parada(p) for p in paradas)
        self.defs_agrega(
            '<radialGradient id="%s" cx="%s" cy="%s" r="%s">%s</radialGradient>'
            % (esc(gid), cx, cy, r, stops)
        )
        return gid

    def sombra(self, sid, dy=6, desenfoque=10, color="#C98BA8", opacidad=0.22):
        self.defs_agrega(
            '<filter id="%s" x="-30%%" y="-30%%" width="160%%" height="180%%">'
            '<feDropShadow dx="0" dy="%s" stdDeviation="%s" flood-color="%s" flood-opacity="%s"/>'
            "</filter>" % (esc(sid), dy, desenfoque, esc(color), esc(opacidad))
        )
        return sid

    # ------------------------------------------------------------------ formas
    def rect(self, x, y, w, h, r=0, relleno="none", trazo=None, grosor=0, opacidad=None,
             filtro=None, extra=""):
        partes = ['<rect x="%s" y="%s" width="%s" height="%s"' % (formato(x), formato(y), formato(w), formato(h))]
        if r:
            partes.append('rx="%s" ry="%s"' % (formato(r), formato(r)))
        partes.append('fill="%s"' % esc(relleno))
        if trazo:
            partes.append('stroke="%s" stroke-width="%s"' % (esc(trazo), formato(grosor)))
        if opacidad is not None:
            partes.append('opacity="%s"' % esc(opacidad))
        if filtro:
            partes.append('filter="url(#%s)"' % esc(filtro))
        if extra:
            partes.append(extra)
        return self.agrega(" ".join(partes) + "/>")

    def circulo(self, cx, cy, r, relleno="none", trazo=None, grosor=0, opacidad=None, filtro=None):
        partes = ['<circle cx="%s" cy="%s" r="%s"' % (formato(cx), formato(cy), formato(r))]
        partes.append('fill="%s"' % esc(relleno))
        if trazo:
            partes.append('stroke="%s" stroke-width="%s"' % (esc(trazo), formato(grosor)))
        if opacidad is not None:
            partes.append('opacity="%s"' % esc(opacidad))
        if filtro:
            partes.append('filter="url(#%s)"' % esc(filtro))
        return self.agrega(" ".join(partes) + "/>")

    def elipse(self, cx, cy, rx, ry, relleno, opacidad=None):
        extra = ' opacity="%s"' % esc(opacidad) if opacidad is not None else ""
        return self.agrega(
            '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s"%s/>'
            % (formato(cx), formato(cy), formato(rx), formato(ry), esc(relleno), extra)
        )

    def camino(self, d, relleno="none", trazo=None, grosor=0, opacidad=None, filtro=None,
               uniones="round", remates="round"):
        partes = ['<path d="%s"' % d, 'fill="%s"' % esc(relleno)]
        if trazo:
            partes.append('stroke="%s" stroke-width="%s"' % (esc(trazo), formato(grosor)))
            partes.append('stroke-linecap="%s" stroke-linejoin="%s"' % (remates, uniones))
        if opacidad is not None:
            partes.append('opacity="%s"' % esc(opacidad))
        if filtro:
            partes.append('filter="url(#%s)"' % esc(filtro))
        return self.agrega(" ".join(partes) + "/>")

    def linea(self, x1, y1, x2, y2, trazo, grosor=2, opacidad=None, guiones=None):
        extra = (' stroke-dasharray="%s"' % guiones) if guiones else ""
        op = (' opacity="%s"' % esc(opacidad)) if opacidad is not None else ""
        return self.agrega(
            '<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="%s" '
            'stroke-linecap="round"%s%s/>'
            % (formato(x1), formato(y1), formato(x2), formato(y2), esc(trazo), formato(grosor), extra, op)
        )

    def imagen(self, uri, x, y, w, h, r=0, recorte=False, opacidad=None, extra=""):
        clip = ""
        atr = ""
        if r and recorte:
            cid = "c%d" % (abs(hash((x, y, w, h))) % 100000)
            self.defs_agrega(
                '<clipPath id="%s"><rect x="%s" y="%s" width="%s" height="%s" rx="%s"/></clipPath>'
                % (cid, formato(x), formato(y), formato(w), formato(h), formato(r))
            )
            atr = ' clip-path="url(#%s)"' % cid
        op = ' opacity="%s"' % esc(opacidad) if opacidad is not None else ""
        return self.agrega(
            '<image href="%s" x="%s" y="%s" width="%s" height="%s" '
            'preserveAspectRatio="xMidYMax slice"%s%s%s/>'
            % (uri, formato(x), formato(y), formato(w), formato(h), atr, op, extra)
        )

    # ------------------------------------------------------------------ salida
    def svg(self, con_xml=True):
        cab = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 %s %s" width="%s" height="%s" role="img" aria-label="%s">' % (
            formato(self.ancho),
            formato(self.alto),
            formato(self.ancho),
            formato(self.alto),
            esc(self.nombre),
        )
        partes = [cab]
        if self.defs:
            partes.append("<defs>%s</defs>" % "".join(self.defs))
        partes.extend(self.elementos)
        partes.append("</svg>")
        texto = "\n".join(partes)
        if con_xml:
            texto = '<?xml version="1.0" encoding="UTF-8"?>\n' + texto
        return texto

    def guardar(self, ruta):
        with open(ruta, "w", encoding="utf-8") as fh:
            fh.write(self.svg())
        return ruta


# ---------------------------------------------------------------- utilidades
def uri_imagen(ruta):
    """Convierte una imagen del disco en data URI (self-contained, sin red)."""
    ext = os.path.splitext(ruta)[1].lower()
    tipo = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".webp": "image/webp"}.get(ext, "image/png")
    with open(ruta, "rb") as fh:
        return "data:%s;base64,%s" % (tipo, base64.b64encode(fh.read()).decode("ascii"))


def estrella(cx, cy, r, color, giro=0, opacidad=None, puntos=4, radio_int=0.28):
    """Chispita de 4 puntas (las de las referencias)."""
    import math

    pts = []
    for i in range(puntos * 2):
        ang = math.radians(giro + i * (360.0 / (puntos * 2)))
        rad = r if i % 2 == 0 else r * radio_int
        pts.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad))
    d = "M %s" % " L ".join("%s %s" % (formato(x), formato(y)) for x, y in pts) + " Z"
    op = ' opacity="%s"' % esc(opacidad) if opacidad is not None else ""
    return '<path d="%s" fill="%s"%s/>' % (d, esc(color), op)


def corazon(cx, cy, r, color, opacidad=None):
    d = (
        "M {x} {y} c {a} {b} {c} {d} {e} 0 c {e2} {d2} {c2} {b2} {a2} {b2} Z"
    ).format(
        x=formato(cx), y=formato(cy + r * 0.75),
        a=formato(-r * 1.25), b=formato(-r * 0.9), c=formato(-r * 1.55), d=formato(-r * 1.5),
        e=formato(-r * 1.55),
        e2=formato(r * 1.5), d2=formato(r * 0.9), c2=formato(r * 1.25), b2=formato(r * 0.9),
        a2=formato(r * 1.25),
    )
    op = ' opacity="%s"' % esc(opacidad) if opacidad is not None else ""
    return '<path d="%s" fill="%s"%s/>' % (d, esc(color), op)


def icono(forma, cx, cy, r, color, grosor=None):
    """Iconitos mínimos dibujados a mano (sin librerías externas)."""
    g = formato(grosor or max(1.6, r * 0.28))
    col = esc(color)
    x, y = formato(cx), formato(cy)
    trazo = 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round"' % (col, g)

    if forma == "lupa":
        return ('<g %s><circle cx="%s" cy="%s" r="%s"/><path d="M %s %s L %s %s"/></g>'
                % (trazo, formato(cx - r * 0.15), formato(cy - r * 0.15), formato(r * 0.62),
                   formato(cx + r * 0.42), formato(cy + r * 0.42), formato(cx + r * 0.98), formato(cy + r * 0.98)))
    if forma == "casa":
        return ('<g %s><path d="M %s %s L %s %s L %s %s Z"/>'
                '<path d="M %s %s L %s %s"/></g>'
                % (trazo,
                   formato(cx - r), formato(cy + r * 0.15), x, formato(cy - r * 0.85), formato(cx + r), formato(cy + r * 0.15),
                   formato(cx - r * 0.5), formato(cy + r * 0.6), formato(cx + r * 0.5), formato(cy + r * 0.6)))
    if forma == "calendario":
        return ('<g %s><rect x="%s" y="%s" width="%s" height="%s" rx="%s"/>'
                '<path d="M %s %s L %s %s"/><path d="M %s %s L %s %s"/><path d="M %s %s L %s %s"/></g>'
                % (trazo, formato(cx - r * 0.85), formato(cy - r * 0.75), formato(r * 1.7), formato(r * 1.6), formato(r * 0.3),
                   formato(cx - r * 0.85), formato(cy - r * 0.2), formato(cx + r * 0.85), formato(cy - r * 0.2),
                   formato(cx - r * 0.3), formato(cy + r * 0.15), formato(cx + r * 0.3), formato(cy + r * 0.15),
                   formato(cx - r * 0.3), formato(cy + r * 0.5), formato(cx + r * 0.3), formato(cy + r * 0.5)))
    if forma == "engrane":
        rayos = []
        for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            rayos.append('<path d="M %s %s L %s %s"/>'
                         % (formato(cx + dx * r * 0.45), formato(cy + dy * r * 0.45),
                            formato(cx + dx * r), formato(cy + dy * r)))
        return ('<g %s><circle cx="%s" cy="%s" r="%s"/>%s</g>'
                % (trazo, x, y, formato(r * 0.45), "".join(rayos)))
    if forma == "marcador":
        return ('<g %s><path d="M %s %s L %s %s L %s %s L %s %s Z"/></g>'
                % (trazo, formato(cx - r * 0.6), formato(cy - r * 0.85), formato(cx + r * 0.6), formato(cy - r * 0.85),
                   formato(cx + r * 0.6), formato(cy + r * 0.35), formato(cx - r * 0.6), formato(cy + r * 0.35)))
    if forma == "rayo":
        return ('<path d="M %s %s L %s %s L %s %s L %s %s L %s %s L %s %s Z" fill="%s"/>'
                % (formato(cx + r * 0.36), formato(cy - r),
                   formato(cx - r * 0.7), formato(cy + r * 0.14),
                   formato(cx - r * 0.06), formato(cy + r * 0.14),
                   formato(cx - r * 0.36), formato(cy + r),
                   formato(cx + r * 0.7), formato(cy - r * 0.2),
                   formato(cx + r * 0.06), formato(cy - r * 0.2),
                   col))
    if forma == "escudo":
        return ('<g %s>'
                '<path d="M %s %s L %s %s C %s %s %s %s %s %s C %s %s %s %s %s %s Z"/>'
                '<path d="M %s %s L %s %s L %s %s"/></g>'
                % (trazo,
                   x, formato(cy - r),
                   formato(cx + r * 0.85), formato(cy - r * 0.55),
                   formato(cx + r * 0.85), formato(cy + r * 0.45),
                   formato(cx + r * 0.45), formato(cy + r * 0.85),
                   x, formato(cy + r * 1.05),
                   formato(cx - r * 0.45), formato(cy + r * 0.85),
                   formato(cx - r * 0.85), formato(cy + r * 0.45),
                   formato(cx - r * 0.85), formato(cy - r * 0.55),
                   formato(cx - r * 0.32), formato(cy - r * 0.05),
                   formato(cx - r * 0.06), formato(cy + r * 0.28),
                   formato(cx + r * 0.42), formato(cy - r * 0.30)))
    if forma == "campana":
        return ('<g %s>'
                '<path d="M %s %s C %s %s %s %s %s %s L %s %s Z"/>'
                '<path d="M %s %s C %s %s %s %s %s %s"/></g>'
                % (trazo,
                   formato(cx - r * 0.78), formato(cy + r * 0.42),
                   formato(cx - r * 0.78), formato(cy - r * 0.85),
                   formato(cx + r * 0.78), formato(cy - r * 0.85),
                   formato(cx + r * 0.78), formato(cy + r * 0.42),
                   formato(cx - r * 0.78), formato(cy + r * 0.42),
                   formato(cx - r * 0.26), formato(cy + r * 0.45),
                   formato(cx - r * 0.26), formato(cy + r * 0.95),
                   formato(cx + r * 0.26), formato(cy + r * 0.95),
                   formato(cx + r * 0.26), formato(cy + r * 0.45)))
    if forma == "rayos":
        return ('<g %s><path d="M %s %s L %s %s L %s %s"/><path d="M %s %s L %s %s L %s %s"/></g>'
                % (trazo,
                   formato(cx - r), formato(cy - r * 0.4), x, formato(cy - r * 0.1), formato(cx + r * 0.9), formato(cy - r * 0.5),
                   formato(cx - r * 0.9), formato(cy + r * 0.55), x, formato(cy + r * 0.25), formato(cx + r), formato(cy + r * 0.7)))
    if forma == "personas":
        return ('<g %s><circle cx="%s" cy="%s" r="%s"/><path d="M %s %s C %s %s %s %s %s %s"/>'
                '<circle cx="%s" cy="%s" r="%s"/><path d="M %s %s C %s %s %s %s %s %s"/></g>'
                % (trazo,
                   formato(cx - r * 0.45), formato(cy - r * 0.45), formato(r * 0.34),
                   formato(cx - r), formato(cy + r), formato(cx - r * 0.9), formato(cy + r * 0.1),
                   formato(cx), formato(cy + r * 0.1), formato(cx + r * 0.1), formato(cy + r),
                   formato(cx + r * 0.6), formato(cy - r * 0.35), formato(r * 0.28),
                   formato(cx + r * 0.2), formato(cy + r), formato(cx + r * 0.3), formato(cy + r * 0.2),
                   formato(cx + r), formato(cy + r * 0.2), formato(cx + r * 0.95), formato(cy + r)))
    if forma == "chat":
        return ('<g %s><rect x="%s" y="%s" width="%s" height="%s" rx="%s"/>'
                '<path d="M %s %s L %s %s L %s %s"/></g>'
                % (trazo,
                   formato(cx - r), formato(cy - r * 0.8), formato(r * 2), formato(r * 1.35), formato(r * 0.5),
                   formato(cx - r * 0.25), formato(cy + r * 0.5),
                   formato(cx - r * 0.02), formato(cy + r * 1.15),
                   formato(cx + r * 0.3), formato(cy + r * 0.54)))
    raise ValueError("icono desconocido: %s" % forma)
