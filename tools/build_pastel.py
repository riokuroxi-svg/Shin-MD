# -*- coding: utf-8 -*-
"""
build_pastel — dibuja TODAS las piezas del README de Shin-MD.

    python3 tools/build_pastel.py

Salida en docs/assets/pastel/. Cada pieza es autocontenida (fondo pastel propio)
y se ve igual en tema claro y oscuro. Los números salen del repositorio
(docs/assets/datos.json si existe).

Estilo: dashboard anime pastel — píldoras, tarjetas con barra de acento, curvas,
iconos dibujados a mano y todo el texto en trazado vectorial.
"""
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

from pastel_lienzo import (  # noqa: E402
    banner, quicksand_suave, subbanner,
    A, ANCHO, C, CAT, D, MASCOTA, N, P, PAD, PR, RADIO, SALIDA, V, adorno, baloo, baloo_med, bloque,
    chip, cjk, corazon, esc, estrella, formato, guardar, icono, lienzo, mono, nunito, nunito_med,
    nunito_suave, quicksand, quicksand_suave, subbanner, tabla, tarjeta_lista, texto,
    texto_centrado, Lienzo,
)
from svgkit import uri_imagen  # noqa: E402


# --------------------------------------------------------------------------
# PORTADA
# --------------------------------------------------------------------------
def hero():
    AA, AL = 1200, 660
    c = Lienzo(AA, AL, "Shin-MD — bot de WhatsApp con anti-ban propio")
    c.gradiente_lineal("fondo", [("0", P["canvas1"]), ("0.55", P["canvas2"]), ("1", P["canvas3"])],
                       x1=0, y1=0, x2=1, y2=1)
    c.gradiente_radial("halo", [("0", P["rosa"], "0.26"), ("0.6", P["rosa"], "0.09"), ("1", P["rosa"], "0")])
    c.gradiente_radial("halo2", [("0", P["menta"], "0.20"), ("1", P["menta"], "0")])
    c.sombra("sombra", dy=8, desenfoque=14, color=P["sombra"], opacidad=0.32)
    c.sombra("sombra-suave", dy=4, desenfoque=9, color=P["sombra"], opacidad=0.24)
    c.defs_agrega('<pattern id="puntos" width="26" height="26" patternUnits="userSpaceOnUse">'
                  '<circle cx="2" cy="2" r="1.6" fill="%s" opacity="0.55"/></pattern>' % P["rosa_claro"])
    c.rect(0, 0, AA, AL, 0, "url(#fondo)")
    c.rect(0, 0, AA, AL, 0, "url(#puntos)", opacidad=0.5)

    # franjas diagonales
    c.agrega('<g transform="rotate(-14 0 40)">')
    for i, (color, op) in enumerate([(P["rosa"], 0.75), (P["menta"], 0.65), (P["ambar"], 0.65), (P["rosa"], 0.35)]):
        c.rect(-120, 6 + i * 17, 430 + i * 26, 7, 3.5, color, opacidad=op)
    c.agrega("</g>")

    c.elipse(1120, 60, 240, 200, "url(#halo2)")
    c.elipse(1080, 560, 320, 260, "url(#halo)", opacidad=0.75)
    c.elipse(140, 600, 260, 220, "url(#halo)", opacidad=0.5)

    # marca
    c.circulo(84, 76, 27, P["blanco"], trazo=P["borde"], grosor=1.5, filtro="sombra-suave")
    kanji = "反魂"
    c.camino(cjk.trazado(kanji, 26, 84 - cjk.ancho(kanji, 26) / 2, 76 + 26 * 0.34), P["rosa_fuerte"])
    texto(c, quicksand, "SHIN-MD", 25, 124, 76 + quicksand.alto(25, "cap") / 2, P["tinta"], 1.6)
    texto(c, nunito_suave, "bot de WhatsApp", 17, 124 + quicksand.ancho("SHIN-MD", 25, 1.6) + 12,
          76 + nunito_suave.alto(17, "cap") / 2, P["tinta_tenue"], 0.3)

    # enlaces (texto plano, sin cajas)
    enlaces = [("docs/web", "marcador"), ("Shin-Lab", "rayo"), ("AGPL-3.0", "escudo")]
    tam_nav = 17
    anchos = [quicksand.ancho(t, tam_nav, 0.2) + 30 for t, _ in enlaces]
    x = 1136 - (sum(anchos) + 26 * (len(enlaces) - 1))
    for (etq, ic), w in zip(enlaces, anchos):
        c.agrega(icono(ic, x + 8, 44, 7, P["rosa"], grosor=2))
        texto(c, quicksand, etq, tam_nav, x + 22, 44 + quicksand.alto(tam_nav, "cap") / 2,
              P["tinta_suave"], 0.2)
        x += w + 26

    # título
    texto(c, baloo, "SHIN", 92, 64, 226, P["tinta"], -1.5)
    ancho_shin = baloo.ancho("SHIN", 92, -1.5)
    texto(c, baloo, "-MD", 92, 64 + ancho_shin, 226, P["rosa_fuerte"], -1.5)
    ancho_nombre = ancho_shin + baloo.ancho("-MD", 92, -1.5)
    c.rect(66, 240, ancho_nombre * 0.72, 10, 5, P["rosa"], opacidad=0.95)
    texto(c, nunito_med, "反魂 · el renacer de un bot superior", 22, 68, 282, P["rosa_fuerte"], 0.6)
    texto(c, nunito_suave, "No se cae, no se banea y no borra tu sesión.", 23, 66, 320, P["tinta_suave"], 0.2)

    # píldora de arranque
    c.rect(66, 356, 372, 54, 27, P["terminal"], filtro="sombra")
    c.circulo(98, 383, 15, P["menta"])
    c.agrega(icono("rayo", 98, 383, 8, P["terminal"], grosor=2))
    texto(c, mono, "npm start -- --code", 19, 124, 383 + 19 * 0.35, P["terminal_texto"], 0.2)
    texto(c, nunito_suave, "8 caracteres en pantalla · o --qr si prefieres", 15, 68, 434,
          P["tinta_tenue"], 0.2)

    # terminal
    tx, ty, tw, th = 736, 72, 400, 252
    c.rect(tx, ty, tw, th, 24, P["terminal"], filtro="sombra")
    c.rect(tx + 1.5, ty + 1.5, tw - 3, th - 3, 23, "none", trazo=P["terminal_linea"], grosor=1.5)
    for i, color in enumerate([P["rosa"], P["ambar"], P["menta"]]):
        c.circulo(tx + 30 + i * 22, ty + 30, 7, color)
    texto(c, mono, "shin-md v%s — npm start" % V, 15, tx + 108, ty + 36, P["terminal_suave"], 0.2)
    c.linea(tx + 24, ty + 52, tx + tw - 24, ty + 52, P["terminal_linea"], 1.5)
    renglones = [
        ("sesión", "SQLite WAL · sin corrupción", P["menta"]),
        ("comandos", "%d cargados · 0 errores" % C, P["terminal_texto"]),
        ("anti-ban", "jitter σ 0.25 · warm-up", P["rosa"]),
        ("panel", "127.0.0.1:3000/health", P["terminal_texto"]),
        ("riesgo", "0-100 · pausa sola si sube", P["ambar"]),
    ]
    yy = ty + 80
    for etq, val, color in renglones:
        c.circulo(tx + 30, yy - 5, 4, color)
        texto(c, mono, etq, 15, tx + 46, yy, P["terminal_suave"], 0.2)
        texto(c, mono, val, 15, tx + 152, yy, color, 0.2)
        yy += 30
    c.linea(tx + 24, ty + th - 44, tx + tw - 24, ty + th - 44, P["terminal_linea"], 1.5)
    texto(c, mono, "$ npm test", 15, tx + 30, ty + th - 20, P["terminal_suave"], 0.2)
    texto(c, mono, "%d/%d ✓" % (PR, D["pruebas_total"]), 15, tx + 152, ty + th - 20, P["menta"], 0.2)

    # logros
    logros = [
        ("anti-ban propio", "jitter gaussiano", P["menta"]),
        ("%d comandos" % C, "%d alias" % A, P["ambar"]),
        ("Node ≥ %s" % D["node"], "node:sqlite nativo", P["rosa"]),
        ("Termux listo", "Android · VPS", P["menta"]),
    ]
    ly = 366
    for etq, detalle, color in logros:
        adorno(c, tx + 10, ly - 5, 8, color, giro=10)
        texto(c, quicksand, etq, 19, tx + 32, ly, P["tinta"], 0.2)
        ancho_e = quicksand.ancho(etq, 19, 0.2)
        texto(c, nunito_suave, detalle, 16, tx + 32 + ancho_e + 10, ly, P["tinta_tenue"], 0.2)
        c.linea(tx + 6, ly + 18, tx + tw, ly + 18, P["borde"], 1.2)
        ly += 38

    # tarjetas de datos
    tarjetas = [
        ("PRUEBAS", "%d" % PR, "22 archivos", "escudo", P["menta"]),
        ("COMANDOS", "%d" % C, "%d categorías" % CAT, "rayo", P["ambar"]),
        ("NOMBRES", "%d" % N, "%d alias" % A, "chat", P["rosa"]),
        ("JITTER", "σ 0.25", "gaussiano", "campana", P["menta"]),
    ]
    cw, sep, ch = 253, 20, 104
    cy0 = AL - ch - 22
    for i, (etq, val, nota, ic, color) in enumerate(tarjetas):
        x = 64 + i * (cw + sep)
        c.rect(x, cy0, cw, ch, 22, P["tarjeta"], filtro="sombra-suave")
        c.rect(x, cy0, 8, ch, 4, color)
        texto(c, nunito, etq, 14, x + 26, cy0 + 32, P["tinta_tenue"], 1.6)
        texto(c, baloo, val, 40, x + 24, cy0 + 74, P["tinta"], -0.5)
        ancho_v = baloo.ancho(val, 40, -0.5)
        texto(c, nunito_suave, nota, 15, x + 34 + ancho_v, cy0 + 74, P["tinta_suave"], 0.2)
        c.agrega(icono(ic, x + cw - 32, cy0 + 32, 13, color, grosor=2.2))

    # mascota
    alto_m = 384
    ancho_m = alto_m * 334 / 780
    c.gradiente_radial("plato", [("0", "#FFFFFF", "0.95"), ("0.7", "#FFF0F6", "0.7"), ("1", "#FFE3EF", "0")])
    c.circulo(620, 330, 128, "url(#plato)")
    c.circulo(620, 330, 122, "none", trazo=P["rosa_claro"], grosor=2.5, opacidad=0.95)
    adorno(c, 486, 150, 13, P["ambar"], giro=12)
    adorno(c, 724, 128, 10, P["rosa"], giro=30, opacidad=0.9)
    c.agrega(corazon(740, 252, 8, P["rosa"], opacidad=0.9))
    c.agrega(corazon(492, 292, 7, P["rosa"], opacidad=0.7))
    c.imagen(MASCOTA, 620 - ancho_m / 2, 46, ancho_m, alto_m)
    adorno(c, 508, 424, 9, P["menta"], giro=8)
    adorno(c, 728, 430, 11, P["ambar"], giro=20)
    guardar(c, "hero.svg")


# --------------------------------------------------------------------------
# INSIGNIAS
# --------------------------------------------------------------------------
def insignia(nombre, etiqueta, valor, color, ic):
    tam, h = 20, 52
    ancho_txt = quicksand.ancho(etiqueta, tam, 0.2)
    ancho_val = baloo_med.ancho(valor, tam + 3, 0.2)
    w = 30 + 40 + ancho_txt + 14 + ancho_val + 30
    c = Lienzo(w, h, "%s %s" % (etiqueta, valor))
    c.gradiente_lineal("gi", [("0", P["canvas1"]), ("1", P["canvas2"])], x1=0, y1=0, x2=1, y2=0)
    c.rect(0, 0, w, h, 16, "url(#gi)", trazo=P["borde"], grosor=1.5)
    c.circulo(34, h / 2, 15, color, opacidad=0.16)
    c.agrega(icono(ic, 34, h / 2, 8, color, grosor=2))
    texto(c, quicksand, etiqueta, tam, 60, h / 2 + quicksand.alto(tam, "cap") / 2, P["tinta_suave"], 0.2)
    texto(c, baloo_med, valor, tam + 3, 60 + ancho_txt + 14, h / 2 + baloo_med.alto(tam + 3, "cap") / 2,
          color, 0.2)
    guardar(c, nombre)


# --------------------------------------------------------------------------
# AVISO (el bloque del número secundario, ahora con el mismo estilo)
# --------------------------------------------------------------------------
def aviso():
    c = lienzo(196, "Usa un número secundario")
    c.rect(0, 0, ANCHO, 10, 5, P["ambar"])
    x = PAD + 4
    c.circulo(x + 30, 100, 26, P["ambar"], opacidad=0.16)
    c.circulo(x + 30, 100, 26, "none", trazo=P["ambar"], grosor=2, opacidad=0.5)
    c.agrega(icono("campana", x + 30, 100, 15, P["ambar"], grosor=2.6))
    texto(c, quicksand, "Usa un número secundario", 27, x + 74, 96, P["tinta"], 0.3)
    lineas = [
        "WhatsApp puede sancionar cuentas que automatizan mensajes. Shin-MD trae el anti-ban más",
        "cuidado de su categoría —jitter gaussiano, calentamiento diario y monitor de riesgo—",
        "pero ningún bot es inmune. Si banean tu número personal, la responsabilidad es tuya.",
        "Un chip barato cuesta menos que tu cuenta de siempre.",
    ]
    y = 128
    for i, linea in enumerate(lineas):
        color = P["tinta_suave"] if i < 3 else P["rosa_fuerte"]
        texto(c, nunito_suave, linea, 16.5, x + 74, y, color, 0.2)
        y += 22
    guardar(c, "aviso.svg")


# --------------------------------------------------------------------------
# RAZONES (lo que lo hace distinto)
# --------------------------------------------------------------------------
def razones():
    elementos = [
        dict(titulo="Anti-ban de verdad", icono="escudo", color=P["menta"],
             texto="jitter gaussiano, perfil del número y calentamiento diario; el monitor de riesgo pausa los envíos, no apaga el bot."),
        dict(titulo="La sesión no se borra", icono="campana", color=P["rosa"],
             texto="los cortes normales (408, 428, 503) se reintentan en modo paciente; la sesión solo se limpia cuando WhatsApp confirma que ya no existe."),
        dict(titulo="Cola de envío con prioridad", icono="rayos", color=P["ambar"],
             texto="nada sale «a lo loco»: los mensajes van en fila con reintento y los comandos críticos (menú, ping, dueño) se cuelan al frente."),
        dict(titulo="SQLite, no JSON frágil", icono="engrane", color=P["menta"],
             texto="node:sqlite con WAL, archivo en chmod 600 y checkpoint al arrancar: se acabó el creds.json corrupto que obliga a vincular otra vez."),
        dict(titulo="%d pruebas de verdad" % PR, icono="marcador", color=P["rosa"],
             texto="una de ellas levanta el proceso real y comprueba que entrega el código de vinculación. Cada push las pasa en GitHub Actions."),
        dict(titulo="Todo en capas", icono="casa", color=P["ambar"],
             texto="core, network, commands, services, storage y web. Arreglar una cosa no rompe otra y el bot arranca en segundos."),
    ]
    guardar(tarjeta_lista(elementos, "seis razones medibles, ninguna de folleto",
                          titulo="Lo que lo hace distinto", columnas=2, alto_elemento=112), "razones.svg")


# --------------------------------------------------------------------------
# ANTI-BAN: curva + tabla
# --------------------------------------------------------------------------
def anti_ban():
    import math
    c = lienzo(330, "jitter gaussiano y calentamiento diario")
    bx, by, bw, bh = PAD + 4, 296, 520, 148
    puntos = []
    for i in range(0, bw + 1, 4):
        t = (i / bw - 0.5) * 6.0
        g = math.exp(-(t * t) / (2 * 0.25 ** 2))
        puntos.append((bx + i, by - g * bh))
    c.gradiente_lineal("curva", [("0", P["rosa"], "0.55"), ("0.35", P["rosa_claro"], "0.85"),
                                 ("0.75", P["rosa_claro"], "0.7"), ("1", P["menta"], "0.5")],
                       x1=0, y1=0, x2=1, y2=0)
    c.camino("M %s L %s L %s Z" % (" L ".join("%s %s" % (formato(x), formato(y)) for x, y in puntos),
                                   formato(bx + bw), formato(by)), "url(#curva)")
    c.camino("M " + " L ".join("%s %s" % (formato(x), formato(y)) for x, y in puntos),
             "none", trazo=P["rosa_fuerte"], grosor=3)
    c.linea(bx, by, bx + bw, by, P["borde"], 2)
    c.linea(bx + bw / 2, by - bh - 14, bx + bw / 2, by, P["tinta_tenue"], 1.6, guiones="5 6")
    texto(c, quicksand, "σ 0.25", 18, bx + bw / 2 + 12, by - bh - 22, P["rosa_fuerte"], 0.4)
    texto(c, nunito_suave, "los retardos siguen una distribución natural (Box-Muller, σ 0.25),", 15, bx, by + 24,
          P["tinta_tenue"], 0.2)
    texto(c, nunito_suave, "no un rango plano y predecible.", 15, bx, by + 44, P["tinta_tenue"], 0.2)

    x0, y0 = 620, 118
    texto(c, quicksand, "calentamiento diario", 19, x0, y0, P["tinta"], 0.3)
    c.rect(x0, y0 + 18, 320, 14, 7, P["rosa_palido"])
    c.rect(x0, y0 + 18, 320 * 0.42, 14, 7, P["menta"])
    texto(c, mono, "20", 15, x0, y0 + 56, P["tinta_suave"], 0.2)
    texto(c, mono, "500 msg/día", 15, x0 + 320 - mono.ancho("500 msg/día", 15, 0.2), y0 + 56, P["menta"], 0.2)

    filas = [
        ("jitter", "gaussiano σ 0.25 · base 1200 ms", P["rosa"]),
        ("perfil del número", "nuevo 1500 ms · veterano 700 ms", P["menta"]),
        ("contacto nuevo", "×1.5 de espera, como una persona", P["ambar"]),
        ("monitor de riesgo", "0-100 · pausa los envíos solo", P["rosa"]),
        ("regla de oro", "solo responde: nunca inicia chat", P["menta"]),
    ]
    yy = 190
    for etq, val, color in filas:
        c.circulo(x0 + 6, yy - 5, 5, color)
        texto(c, quicksand, etq, 16, x0 + 22, yy, P["tinta"], 0.2)
        ancho_e = quicksand.ancho(etq, 16, 0.2)
        texto(c, nunito_suave, val, 15, x0 + 34 + ancho_e, yy, P["tinta_suave"], 0.2)
        yy += 28
    guardar(c, "anti-ban-curva.svg")


def anti_ban_tabla():
    filas = [
        ["Jitter gaussiano", "los retardos siguen una curva natural (Box-Muller, σ 0.25), no un rango plano"],
        ["Perfil del número", "nuevo: base 1500 ms + 7 días de calentamiento; veterano: 700 ms + 2 días"],
        ["Calentamiento diario", "arranca en 20 mensajes/día y sube hasta 500; el tope se consulta con .warmup"],
        ["Contactos nuevos", "×1.5 de espera en el primer mensaje, como haría una persona"],
        ["Monitor de riesgo", "puntúa de 0 a 100 las desconexiones, errores y fallos de envío"],
        ["Watchdog", "con riesgo crítico pausa los envíos solo; no mata el bot"],
        ["Regla de oro", "solo responde a quien le escribe: nunca inicia conversación"],
        ["Antispam con criterio", "ráfagas, texto repetido e inundación de comandos se frenan (SHIN_BRAIN=0 lo apaga)"],
    ]
    acentos = [P["menta"], P["rosa"], P["ambar"], P["menta"], P["rosa"], P["ambar"], P["menta"], P["rosa"]]
    columnas = [(24, 280, "Pieza"), (330, 740, "Qué hace")]
    guardar(tabla(columnas, filas, acentos, "ocho piezas, ninguna improvisada"), "anti-ban-tabla.svg")


# --------------------------------------------------------------------------
# COMANDOS
# --------------------------------------------------------------------------
def comandos():
    c = lienzo(330, "%d comandos en %d categorías" % (C, CAT))
    categorias = [
        ("Grupos", 30), ("Economía", 29), ("Bot y sesión", 25), ("Gacha", 24), ("Utilidades", 24),
        ("Stickers", 17), ("Descargas", 16), ("Perfil", 14), ("Menú e info", 8), ("Dueño", 7),
        ("NSFW", 6), ("Anime", 4), ("Juegos", 4), ("Audio", 1), ("Diversión", 1),
    ]
    colores = [P["rosa"], P["menta"], P["ambar"]]
    cw, ch, sep = 204, 62, 14
    for i, (cat, n) in enumerate(categorias):
        fila, col = divmod(i, 5)
        x = PAD + col * (cw + sep)
        y = 46 + fila * (ch + sep)
        color = colores[i % 3]
        c.rect(x, y, cw, ch, 16, P["tarjeta"], trazo=P["borde"], grosor=1.2)
        texto(c, quicksand, cat, 17, x + 18, y + 28, P["tinta"], 0.2)
        texto(c, baloo_med, str(n), 22, x + cw - 18 - baloo_med.ancho(str(n), 22, 0.2), y + 46, color, 0.2)
        c.rect(x + 18, y + 46, 40, 5, 2.5, color, opacidad=0.9)
    guardar(c, "comandos.svg")


# --------------------------------------------------------------------------
# PANEL LOCAL
# --------------------------------------------------------------------------
def panel():
    c = lienzo(330, "panel local en 127.0.0.1:3000")
    px, py, pw, ph = PAD + 4, 60, 660, 218
    c.rect(px, py, pw, ph, 20, P["terminal"], filtro="sombra-suave")
    c.rect(px + 1.5, py + 1.5, pw - 3, ph - 3, 19, "none", trazo=P["terminal_linea"], grosor=1.4)
    for i, color in enumerate([P["rosa"], P["ambar"], P["menta"]]):
        c.circulo(px + 26 + i * 18, py + 26, 6, color)
    texto(c, mono, "GET /health", 14, px + 96, py + 31, P["terminal_suave"], 0.2)
    c.linea(px + 20, py + 48, px + pw - 20, py + 48, P["terminal_linea"], 1.4)
    barras = [
        ("riesgo", 12, P["menta"], "12/100"),
        ("cola de envío", 34, P["ambar"], "3 en fila"),
        ("grupos", 68, P["rosa"], "17 conectados"),
        ("memoria", 46, P["menta"], "212 MB"),
    ]
    yy = py + 80
    for etq, val, color, nota in barras:
        texto(c, mono, etq, 14, px + 24, yy, P["terminal_suave"], 0.2)
        c.rect(px + 172, yy - 11, 292, 12, 6, P["terminal_linea"])
        c.rect(px + 172, yy - 11, 292 * val / 100, 12, 6, color)
        texto(c, mono, nota, 14, px + pw - 24 - mono.ancho(nota, 14, 0.2), yy, color, 0.2)
        yy += 30
    texto(c, mono, "// LOOPBACK=0 exige PANEL_PASSWORD", 14, px + 24, py + ph - 22, P["terminal_suave"], 0.2)

    rx = 740
    rutas = [("/", "estado general"), ("/health", "riesgo, cola, grupos, memoria"),
             ("/metrics", "métricas del proceso")]
    yy = 74
    for ruta, desc in rutas:
        c.rect(rx, yy, 380, 50, 14, P["tarjeta"], trazo=P["borde"], grosor=1.2)
        c.rect(rx, yy, 7, 50, 3.5, P["menta"])
        texto(c, mono, ruta, 16, rx + 22, yy + 32, P["rosa_fuerte"], 0.2)
        texto(c, nunito_suave, desc, 15, rx + 124, yy + 32, P["tinta_suave"], 0.2)
        yy += 60
    lineas = [
        "Por defecto solo escucha en tu máquina. Si lo abres a la red,",
        "LOOPBACK=0 exige PANEL_PASSWORD (usuario admin) y bloquea la",
        "fuerza bruta: 10 intentos por IP y esa IP espera 5 minutos.",
    ]
    y = 272
    for linea in lineas:
        texto(c, nunito_suave, linea, 15.5, rx, y, P["tinta_tenue"], 0.2)
        y += 21
    guardar(c, "panel.svg")


# --------------------------------------------------------------------------
# LICENCIA Y CRÉDITOS
# --------------------------------------------------------------------------
def licencia():
    filas = [
        ["Núcleo (Shin-MD)", "AGPL-3.0-only", "libre para usar, modificar y redistribuir; todo derivado sigue siendo AGPL"],
        ["Extensiones y plugins", "Comercial propia", "se pueden vender y comprar; su código no es AGPL si usa la API de plugins"],
        ["Soporte y servicios", "Contrato aparte", "instalación, hosting, mantenimiento y desarrollo a medida"],
    ]
    acentos = [P["menta"], P["rosa"], P["ambar"]]
    columnas = [(24, 240, "Capa"), (290, 230, "Licencia"), (540, 540, "Qué significa")]
    guardar(tabla(columnas, filas, acentos, "cuatro reglas que lo sostienen"), "licencia-tabla.svg")


def reglas():
    elementos = [
        dict(titulo="El núcleo es y será libre", icono="escudo", color=P["menta"],
             texto="nadie puede vender el bot ni un fork como software cerrado: la AGPL obliga a entregar el código."),
        dict(titulo="La marca no se hereda", icono="marcador", color=P["rosa"],
             texto="los derivados, aunque sean AGPL legítimos, no pueden llamarse Shin-MD ni usar 反魂."),
        dict(titulo="Atribución obligatoria", icono="personas", color=P["ambar"],
             texto="los forks conservan LICENSE, NOTICE y los headers, y muestran el crédito en .menu y .owner."),
        dict(titulo="El bot lo comprueba", icono="engrane", color=P["menta"],
             texto="si alguien borra LICENSE o NOTICE, no arranca. No es un virus: es la licencia defendiéndose."),
    ]
    guardar(tarjeta_lista(elementos, "las cuatro reglas de la Sección 7",
                          titulo="Cómo se sostiene la licencia", columnas=2, alto_elemento=104,
                          tam_titulo=19), "licencia-reglas.svg")


def creditos():
    elementos = [
        dict(titulo="Creador", icono="personas", color=P["rosa"],
             texto="riokuroxi-svg 🇲🇽 · github.com/riokuroxi-svg"),
        dict(titulo="Librería", icono="chat", color=P["menta"],
             texto="@whiskeysockets/baileys %s + parche propio de vinculación" % D["baileys"]),
        dict(titulo="Laboratorio", icono="rayo", color=P["ambar"],
             texto="Shin-Lab: memoria RAG, sub-bots aislados y red-teaming"),
        dict(titulo="Mascota y gráficos", icono="lupa", color=P["rosa"],
             texto="dibujados para este repositorio en SVG propio, sin fuentes externas"),
        dict(titulo="Licencia", icono="marcador", color=P["menta"],
             texto="AGPL-3.0-only + NOTICE (Sección 7)"),
        dict(titulo="Estado", icono="engrane", color=P["ambar"],
             texto="v%s · Node ≥ %s · %d pruebas · %d comandos" % (V, D["node"], PR, C)),
    ]
    guardar(tarjeta_lista(elementos, "quién hizo esto y con qué", titulo="Créditos",
                          columnas=2, alto_elemento=92, tam_titulo=19), "creditos.svg")


# --------------------------------------------------------------------------
# ADORNOS
# --------------------------------------------------------------------------
def divisor():
    c = Lienzo(ANCHO, 72, "divisor")
    c.linea(320, 36, 560, 36, P["rosa_claro"], 2.5)
    c.linea(600, 36, 840, 36, P["rosa_claro"], 2.5)
    c.agrega(corazon(580, 30, 9, P["rosa"]))
    c.agrega(estrella(548, 36, 7, P["menta"], giro=15))
    c.agrega(estrella(612, 36, 7, P["menta"], giro=15))
    guardar(c, "divisor.svg")


def pie():
    c = Lienzo(ANCHO, 96, "pie")
    c.gradiente_lineal("gp", [("0", P["canvas1"]), ("0.5", P["canvas2"]), ("1", P["canvas3"])],
                       x1=0, y1=0, x2=1, y2=0)
    c.rect(0, 8, ANCHO, 80, 24, "url(#gp)", trazo=P["borde"], grosor=1.4)
    kanji = "反魂"
    texto(c, quicksand, "Shin-MD", 24, PAD + 6, 52 + quicksand.alto(24, "cap") / 2, P["tinta"], 1.4)
    ancho_k = cjk.ancho(kanji, 22)
    c.camino(cjk.trazado(kanji, 22, PAD + 6 + quicksand.ancho("Shin-MD", 24, 1.4) + 16, 58), P["rosa_fuerte"])
    texto(c, nunito_suave, "hecho para quedarse encendido", 17,
          PAD + 6 + quicksand.ancho("Shin-MD", 24, 1.4) + 16 + ancho_k + 16, 58, P["tinta_tenue"], 0.3)
    texto(c, nunito_suave, "v%s · %d pruebas · %d comandos · %d nombres" % (V, PR, C, N), 16,
          ANCHO - PAD - 6 - nunito_suave.ancho("v%s · %d pruebas · %d comandos · %d nombres" % (V, PR, C, N), 16, 0.2),
          58, P["tinta_suave"], 0.2)
    adorno(c, ANCHO / 2 - 40, 48, 10, P["ambar"], giro=12)
    adorno(c, ANCHO / 2 + 34, 56, 8, P["rosa"], giro=20)
    guardar(c, "pie.svg")


# --------------------------------------------------------------------------
def main():
    os.makedirs(SALIDA, exist_ok=True)
    print("\nnúmeros usados: %d comandos · %d nombres (%d alias) · %d categorías · "
          "%d pruebas · v%s" % (C, N, A, CAT, PR, V))
    print("origen: %s\n" % D["origen"])

    hero()
    aviso()
    banners()
    subbanners()
    razones()
    anti_ban()
    anti_ban_tabla()
    comandos()
    panel()
    licencia()
    reglas()
    creditos()
    instalacion()
    estructura()
    categorias_tabla()
    laboratorio()
    divisor()
    pie()
    for archivo, etq, val, color, ic in [
        ("insignia-pruebas.svg", "pruebas", "%d/%d" % (PR, D["pruebas_total"]), P["menta"], "escudo"),
        ("insignia-comandos.svg", "comandos", "%d" % C, P["ambar"], "rayo"),
        ("insignia-node.svg", "node", "≥ %s" % D["node"], P["menta"], "engrane"),
        ("insignia-baileys.svg", "baileys", "%s" % D["baileys"], P["rosa"], "chat"),
        ("insignia-licencia.svg", "licencia", D["licencia"].replace("-only", ""), P["ambar"], "marcador"),
        ("insignia-termux.svg", "termux", "listo", P["menta"], "personas"),
    ]:
        insignia(archivo, etq, val, color, ic)

    print("\nlisto. Ahora revisa con: python3 tools/build_preview.py")




# --------------------------------------------------------------------------
# BANNERS DE SECCIÓN
# --------------------------------------------------------------------------
SECCIONES = [
    (1, "Lo que lo hace distinto", "seis razones medibles", "rayo", P["rosa"], "lo-que-lo-hace-distinto"),
    (2, "El anti-ban por dentro", "jitter, calentamiento y monitor", "escudo", P["menta"], "el-anti-ban-por-dentro"),
    (3, "Los 210 comandos", "15 categorías, carga dinámica", "rayo", P["ambar"], "los-210-comandos"),
    (4, "Panel local", "127.0.0.1:3000 · /health y /metrics", "engrane", P["menta"], "panel-local"),
    (5, "Instalación en 5 minutos", "Termux o VPS, sin misterios", "casa", P["rosa"], "instalación-en-5-minutos"),
    (6, "Cómo está hecho", "capas separadas y comprobables", "casa", P["ambar"], "cómo-está-hecho"),
    (7, "El laboratorio", "Shin-Lab: nada llega sin pruebas", "lupa", P["menta"], "el-laboratorio"),
    (8, "Licencia y marca", "AGPL-3.0-only + NOTICE", "marcador", P["rosa"], "licencia-y-marca"),
    (9, "Créditos", "quién hizo esto y con qué", "personas", P["ambar"], "créditos"),
]


def banners():
    for n, titulo, sub, ic, color, _ in SECCIONES:
        c = banner(n, titulo, sub, ic, color)
        guardar(c, "banner-%02d.svg" % n)


def subbanners():
    for n, (titulo, sub, ic, color) in enumerate([
        ("Termux (Android)", "el caso más común: el teléfono", "personas", P["menta"]),
        ("Servidor o VPS", "Debian, Ubuntu o donde tengas Node", "engrane", P["ambar"]),
    ], start=1):
        c = subbanner(titulo, sub, ic, color)
        guardar(c, "subbanner-%d.svg" % n)


# --------------------------------------------------------------------------
# TARJETAS DE TERMINAL (instalación)
# --------------------------------------------------------------------------
def terminal(nombre, titulo, pasos, nota=None):
    """pasos: [(comentario, comando)] — se dibuja una ventana con el prompt."""
    alto_lin = 27
    alto = 74 + len(pasos) * (alto_lin * 1.85) + (34 if nota else 0) + 26
    c = Lienzo(ANCHO, alto, titulo)
    c.rect(0, 0, ANCHO, alto, 22, P["terminal"])
    c.rect(1.5, 1.5, ANCHO - 3, alto - 3, 21, "none", trazo=P["terminal_linea"], grosor=1.5)
    for i, color in enumerate([P["rosa"], P["ambar"], P["menta"]]):
        c.circulo(PAD + 8 + i * 20, 34, 7, color)
    texto(c, mono, titulo, 16, PAD + 84, 40, P["terminal_suave"], 0.2)
    c.linea(PAD, 58, ANCHO - PAD, 58, P["terminal_linea"], 1.4)
    y = 86
    for comentario, comando in pasos:
        if comentario:
            texto(c, mono, comentario, 15, PAD + 4, y, P["terminal_suave"], 0.2)
            y += alto_lin
        texto(c, mono, "$ ", 16, PAD + 4, y, P["menta"], 0.2)
        texto(c, mono, comando, 16, PAD + 30, y, P["terminal_texto"], 0.2)
        y += alto_lin * 1.35
    if nota:
        c.linea(PAD, y - 6, ANCHO - PAD, y - 6, P["terminal_linea"], 1.2)
        texto(c, mono, nota, 15, PAD + 4, y + 16, P["ambar"], 0.2)
    guardar(c, nombre)


def instalacion():
    terminal("terminal-termux.svg", "Termux (Android) — qué escribir, en orden", [
        ("# 1. prepara el teléfono", "pkg update && pkg upgrade -y"),
        ("", "pkg install -y git nodejs python ffmpeg"),
        ("# 2. baja el bot e instala dependencias", "git clone https://github.com/riokuroxi-svg/Shin-MD"),
        ("", "cd Shin-MD && npm install"),
        ("# 3. configura tu número", "cp .env.example .env && nano .env"),
        ("# 4. enciende", "npm start -- --code"),
    ], nota="→ el bot muestra un código de 8 caracteres (ej. 7QK4-2ZP9)")

    terminal("terminal-vps.svg", "Servidor o VPS — y que siga vivo al cerrar la terminal", [
        ("# Node 22 en Debian/Ubuntu", "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"),
        ("", "sudo apt-get install -y nodejs ffmpeg git"),
        ("# bot + dependencias + configuración", "git clone https://github.com/riokuroxi-svg/Shin-MD && cd Shin-MD"),
        ("", "npm install && cp .env.example .env && nano .env"),
        ("# que no se muera al cerrar la sesión", "npm install -g pm2"),
        ("", "pm2 start index.js --name shin-md -- --code && pm2 save"),
    ], nota="→ sin terminal interactiva el bot toma el número del .env solo")


# --------------------------------------------------------------------------
# ESTRUCTURA DEL PROYECTO
# --------------------------------------------------------------------------
def estructura():
    arbol = [
        ("Shin-MD/", 0, P["rosa"]),
        ("index.js              → entrada (npm start)", 1, P["tinta_suave"]),
        ("boot/index.js         → perfil del número + motor + conexión", 1, P["tinta_suave"]),
        ("cmds/                 → %d comandos en %d categorías (carga dinámica)" % (C, CAT), 1, P["tinta_suave"]),
        ("docs/", 1, P["menta"]),
        ("web/              → página del proyecto (npm run docs:web)", 2, P["tinta_suave"]),
        ("assets/pastel/    → gráficos del README (SVG propio)", 2, P["tinta_suave"]),
        ("test/                 → %d pruebas en 22 archivos (runner propio)" % PR, 1, P["tinta_suave"]),
        ("src/", 1, P["menta"]),
        ("core/             → ciclo de vida, conexión, auth SQLite, anti-ban", 2, P["tinta_suave"]),
        ("network/          → cola de envío con prioridad, monitor de riesgo", 2, P["tinta_suave"]),
        ("commands/         → cargador, router, interactivos, permisos", 2, P["tinta_suave"]),
        ("services/         → logger con rotación, descargador, watchdog", 2, P["tinta_suave"]),
        ("storage/          → SQLite WAL, migraciones, caché TTL", 2, P["tinta_suave"]),
        ("web/server.js     → panel local", 2, P["tinta_suave"]),
    ]
    comandos = [
        ("npm start", "encender"),
        ("npm test", "%d pruebas" % PR),
        ("npm run lint", "0 errores"),
        ("npm run typecheck", "tipos (JSDoc)"),
        ("npm run test:pairing", "código de vinculación"),
        ("npm run docs:web", "página del proyecto"),
        ("npm run docs:pastel", "estos gráficos"),
    ]
    alto = max(len(arbol) * 30, len(comandos) * 44) + 110
    c = lienzo(alto, "estructura del proyecto")
    c.rect(0, 0, ANCHO, 10, 5, P["ambar"])

    # izquierda: el árbol
    x, y = PAD + 8, 74
    for texto_arbol, sangria, color in arbol:
        if sangria == 0:
            texto(c, mono, texto_arbol, 17, x, y, P["rosa_fuerte"], 0.2)
        else:
            guion = "└─ " if sangria == 1 else "└──── "
            texto(c, mono, guion, 15, x + sangria * 16, y, P["borde"], 0.2)
            partes = texto_arbol.split("  → ")
            if len(partes) == 2:
                texto(c, mono, partes[0].rstrip(), 15, x + sangria * 16 + 42, y, color if color != P["tinta_suave"] else P["tinta"], 0.2)
                ancho_p = mono.ancho(partes[0].rstrip(), 15, 0.2)
                texto(c, mono, "→ " + partes[1], 14, x + sangria * 16 + 52 + ancho_p, y, P["tinta_tenue"], 0.2)
            else:
                texto(c, mono, texto_arbol, 15, x + sangria * 16 + 42, y, color, 0.2)
        y += 30

    # derecha: comandos npm
    rx = 716
    ty = 74
    c.rect(rx - 16, ty - 34, 380, len(comandos) * 44 + 24, 18, P["tarjeta"], trazo=P["borde"], grosor=1.3)
    for cmd, que in comandos:
        texto(c, mono, cmd, 15.5, rx, ty, P["rosa_fuerte"], 0.2)
        ancho_c = mono.ancho(cmd, 15.5, 0.2)
        texto(c, nunito_suave, que, 15, rx + ancho_c + 14, ty, P["tinta_suave"], 0.2)
        ty += 44
    guardar(c, "estructura.svg")


# --------------------------------------------------------------------------
# TABLA DE CATEGORÍAS
# --------------------------------------------------------------------------
def categorias_tabla():
    filas_datos = [
        ("Grupos", 30, "kick · promote · warn · welcome · hidetag · open · close · topcount", P["rosa"]),
        ("Economía", 29, "daily · work · mine · rob · bank · shop · cazar · pescar · slot", P["menta"]),
        ("Bot y sesión", 25, "bots · join · leave · setprefix · setbotname · reload · logout", P["ambar"]),
        ("Gacha", 24, "rollwaifu · claim · harem · trade · sell · waifusboard · serielist", P["rosa"]),
        ("Utilidades", 24, "translate · qrcode · tts · sticker · carbon · ai · deepseek · gitclone", P["menta"]),
        ("Stickers", 17, "sticker · brat · emojimix · qc · newpack · getpack · packlist", P["ambar"]),
        ("Descargas", 16, "play · ytdlp · tiktok · spotify · instagram · fb · twitter · deezer", P["rosa"]),
        ("Perfil", 14, "profile · level · lboard · marry · afk · setbirth", P["menta"]),
        ("Menú e info", 8, "menu · allmenu · demo · ping · runtime · owner · terminos", P["ambar"]),
        ("Dueño", 7, "ex · r · restart · subir · subircookies · setmenu · fix", P["rosa"]),
        ("NSFW", 6, "r34 · danbooru · gelbooru · xvideos · xnxx", P["menta"]),
        ("Anime", 4, "anime · waifu · ppcp · angry", P["ambar"]),
        ("Juegos", 4, "ttt · trivia · kuro · adivina", P["rosa"]),
        ("Audio", 1, "audioeffect", P["menta"]),
        ("Diversión", 1, "chiste", P["ambar"]),
    ]
    ancho_texto = 700
    alto_lin = 21
    medido = []
    for cat, n, ejemplos, color in filas_datos:
        lineas = quicksand_suave.envolver(ejemplos, 15.5, ancho_texto, 0.2)
        medido.append((cat, n, lineas, color))
    alto = 96 + sum(max(50, len(m[2]) * alto_lin + 26) + 8 for m in medido) + 24
    c = Lienzo(ANCHO, alto, "las %d categorías" % CAT)
    c.gradiente_lineal("gc", [("0", P["canvas1"]), ("0.5", P["canvas2"]), ("1", P["canvas3"])],
                       x1=0, y1=0, x2=1, y2=1)
    c.sombra("shc", dy=6, desenfoque=12, color=P["sombra"], opacidad=0.26)
    c.rect(0, 0, ANCHO, alto, RADIO, "url(#gc)", filtro="shc")
    c.rect(0, 0, ANCHO, 10, 5, P["rosa"])
    texto(c, quicksand, "Las %d categorías" % CAT, 25, PAD, 48, P["tinta"], 0.3)
    ancho_t = quicksand.ancho("Las %d categorías" % CAT, 25, 0.3)
    texto(c, nunito_suave, "%d comandos únicos · %d nombres en total (%d alias)" % (C, N, A), 16,
          PAD + ancho_t + 14, 48, P["tinta_tenue"], 0.2)

    y = 74
    c.rect(PAD, y, ANCHO - PAD * 2, 42, 14, P["rosa_palido"])
    for x, txt in [(24, "CATEGORÍA"), (250, "N."), (300, "QUÉ ENCUENTRAS")]:
        texto(c, quicksand, txt, 15, PAD + x, y + 27, P["rosa_fuerte"], 1.4)
    y += 50
    for i, (cat, n, lineas, color) in enumerate(medido):
        alto_r = max(50, len(lineas) * alto_lin + 26)
        c.rect(PAD, y, ANCHO - PAD * 2, alto_r, 14, P["tarjeta"] if i % 2 == 0 else P["tarjeta2"],
               trazo=P["borde"], grosor=1.2)
        c.rect(PAD + 6, y + 10, 7, alto_r - 20, 3.5, color)
        texto(c, quicksand, cat, 17, PAD + 24, y + alto_r / 2 + 6, P["tinta"], 0.2)
        texto(c, baloo_med, str(n), 20, PAD + 250, y + alto_r / 2 + 8, color, 0.2)
        base = y + (alto_r - len(lineas) * alto_lin) / 2 + 15
        for linea in lineas:
            texto(c, quicksand_suave, linea, 15.5, PAD + 300, base, P["tinta_suave"], 0.2)
            base += alto_lin
        y += alto_r + 8
    guardar(c, "categorias.svg")


# --------------------------------------------------------------------------
# LABORATORIO (Shin-Lab)
# --------------------------------------------------------------------------
def laboratorio():
    experimentos = [
        ("Shin Brain", "clasificador anti-spam heurístico sin dependencias: decide ALLOW / SLOW / BLOCK", P["menta"], "lleno"),
        ("Memoria RAG", "SQLite + FTS5: recuerda hechos por usuario con recall de 0.4 ms en 10k memorias", P["rosa"], "lleno"),
        ("Sub-bots aislados", "cada uno en su proceso (fork + IPC): matar uno no tumba al resto", P["ambar"], "lleno"),
        ("Plugin store", "índice con SHA-256 e instalador en sandbox, sin require, process ni red", P["menta"], "lleno"),
        ("Migrador de DB", "global.db JSON (Gata / Ginko) → SQLite WAL de Shin-MD, en un paso", P["tinta_tenue"], "medio"),
        ("Evaluación TypeScript", "¿vale la pena? Veredicto: sí, pero migración gradual", P["rosa"], "lleno"),
    ]
    filas = (len(experimentos) + 1) // 2
    alto = 24 + 50 + filas * 118 + (filas - 1) * 14 + 26
    c = lienzo(alto, "el laboratorio Shin-Lab")
    c.rect(0, 0, ANCHO, 10, 5, P["menta"])
    texto(c, quicksand, "Qué se cuece en Shin-Lab", 26, PAD, 56, P["tinta"], 0.3)
    ancho_t = quicksand.ancho("Qué se cuece en Shin-Lab", 26, 0.3)
    texto(c, nunito_suave, "todo se prueba aquí primero · nada llega a Shin-MD sin tests", 16,
          PAD + ancho_t + 14, 56, P["tinta_tenue"], 0.2)

    ancho_t2 = (ANCHO - PAD * 2 - 24) / 2
    for i, (titulo, desc, color, estado) in enumerate(experimentos):
        col, fil = i % 2, i // 2
        x = PAD + col * (ancho_t2 + 24)
        y = 88 + fil * 132
        c.rect(x, y, ancho_t2, 104, 18, P["tarjeta"], trazo=P["borde"], grosor=1.3)
        c.rect(x, y, 8, 104, 4, color)
        texto(c, quicksand, titulo, 20, x + 28, y + 36, P["tinta"], 0.2)
        # estado como píldora
        etiqueta = "listo" if estado == "lleno" else "en curso"
        ancho_p = quicksand.ancho(etiqueta, 13.5, 0.3) + 30
        px_ = x + ancho_t2 - 22 - ancho_p
        c.rect(px_, y + 16, ancho_p, 28, 14, color, opacidad=0.18)
        texto(c, quicksand, etiqueta, 13.5, px_ + 15, y + 35, color, 0.3)
        base = y + 62
        for linea in nunito_suave.envolver(desc, 15.5, ancho_t2 - 56, 0.2)[:2]:
            texto(c, nunito_suave, linea, 15.5, x + 28, base, P["tinta_suave"], 0.2)
            base += 20
    guardar(c, "laboratorio.svg")


if __name__ == "__main__":
    main()
