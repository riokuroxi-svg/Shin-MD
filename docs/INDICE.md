# Índice de la documentación

Este archivo responde una sola pregunta: **¿dónde está lo que busco?**

Hay cuatro clases de documento y cada una tiene su carpeta y su regla. Si algo
no encaja en ninguna, no debería existir.

| Clase | Qué es | Se actualiza |
| --- | --- | --- |
| **Esencial** | El README. Qué es el bot, cómo se instala y qué se promete | sí, en cada versión |
| **Inicio** | `docs/`: instalarlo y sacarlo adelante en un aparato concreto | sí, cuando cambia el instalador |
| **Técnica** | `docs/`: cómo está montado por dentro y por qué | sí, cuando cambia el código |
| **Histórica** | `docs/historico/`: lo que se decidió en una fecha, como registro | **no, nunca** |

---

## Quiero…

### …instalarlo o arrancarlo

| Documento | Responde a |
| --- | --- |
| [../README.md](../README.md) | qué es, cómo se instala con una línea, qué se promete |
| [INSTALACION.md](INSTALACION.md) | primer arranque, qué escribir, qué debe ver, qué hacer si sale un error |
| [TERMUX.md](TERMUX.md) | el caso del teléfono: wakelock, batería, procesos hijos, qué se puede y qué no |
| [VPS.md](VPS.md) | servidor: systemd, pm2, `0.0.0.0` con contraseña |

### …entender cómo está hecho

| Documento | Responde a |
| --- | --- |
| [MAPA.md](MAPA.md) | el plano: qué hay en cada carpeta, el viaje de un mensaje, cada dependencia y qué se retiró. **Se regenera con `npm run mapa` y falla en la suite si se queda viejo** |
| [DESARROLLO.md](DESARROLLO.md) | montarlo en local, tu primer comando, botones, base de datos y migraciones |
| [CONECTOR.md](CONECTOR.md) | los ocho parches de Baileys, cada uno con su issue y su estado |
| [LID.md](LID.md) | identidades `@lid` contra teléfonos: por qué una persona puede llegar con dos identificadores |

### …publicar mi propia versión

| Documento | Responde a |
| --- | --- |
| [FORK.md](FORK.md) | nombre, instalador, imágenes, tu copyright, y cómo no romper la AGPL |
| [PROCEDENCIA.md](PROCEDENCIA.md) | de dónde salió cada pieza y qué licencia trae |

### …saber qué se decidió y por qué, hace tiempo

En [historico/](historico/), con un aviso en la cabecera de cada uno. **No se
mantienen al día a propósito**: son el registro de una fecha, no una guía. Si
algo de ahí se necesita hoy, se sube a un documento vivo en vez de citarlo.

| Documento | Qué guarda |
| --- | --- |
| [historico/AUDITORIA-3.2.1.md](historico/AUDITORIA-3.2.1.md) | auditoría del instalador de la 3.2.1 y el incidente que la motivó |
| [historico/investigacion.md](historico/investigacion.md) | estudio de otros bots, con Baileys 6.7.24 |
| [historico/plan-bloques.md](historico/plan-bloques.md) | el plan de trabajo por bloques de septiembre |
| [historico/auditoria-catch.md](historico/auditoria-catch.md) | recuento y clasificación de los `catch` vacíos |
| [historico/menus.md](historico/menus.md) | las plantillas de menú que se barajaron |

---

## Las reglas

1. **Un tema, un documento.** Si dos explican lo mismo, sobra uno: se fusiona y
   el otro desaparece. No se dejan dos versiones de la misma verdad.
2. **Nada histórico se actualiza.** Si un documento describe una fecha, se
   archiva; intentar mantenerlo al día es lo que lo vuelve mentira.
3. **Lo que se puede generar, se genera.** El plano, la página de comandos y el
   recuento de pruebas salen de `npm run mapa` y `npm run docs:web`. Un número
   escrito a mano envejece; uno generado, no.
4. **Antes de publicar, la suite mira.** Si la documentación dice una versión y
   el código dice otra, no entra (`scripts/versiones.mjs --check`).
