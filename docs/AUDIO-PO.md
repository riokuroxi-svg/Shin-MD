# Audio PO experimental para `.play`

Riokuroxi · adaptación del laboratorio de audio para Shin-MD. Estado: experimental, desactivada por defecto. Se probó una descarga real autorizada mediante el adaptador y un proveedor local; no se han validado el VPS, Termux ni el envío por WhatsApp.

## Alcance y activación

Por defecto `SHIN_PO_MODE=legacy` conserva el flujo anterior. `SHIN_PO_MODE=bgutil` selecciona la nueva ruta de audio de `.play` y sus alias directos. La búsqueda por nombre usa los mecanismos de búsqueda existentes para obtener un ID; la descarga de audio no rota clientes ni cambia a una API de respaldo. El vídeo, las búsquedas, SoundCloud delegado y otros comandos no se sustituyen. El precalentado de audio se desactiva en este modo. La caché RAM de audio está separada por modo. El flujo legado mantiene sus comportamientos anteriores, incluido el posible retorno de audio original si falla una conversión.

Requisitos independientes, que no instala ni inicia este bot: Python/venv con yt-dlp compatible y plugin `bgutil-ytdlp-pot-provider` 2.0.2, sus componentes EJS ya instalados localmente si son requeridos, Node adecuado, FFmpeg con libmp3lame y FFprobe. El proveedor HTTP debe estar funcionando por separado únicamente en `127.0.0.1:4416`, con acceso restringido; su interfaz no tiene autenticación y no debe exponerse a internet. Consulta el proyecto oficial y revisa su advertencia de seguridad. No se incluyen binarios, tokens, cookies ni credenciales.

En `.env`, con rutas reales del sistema de destino:

```dotenv
SHIN_PO_MODE=bgutil
SHIN_PO_YTDLP=/ruta/absoluta/al/venv/bin/yt-dlp
SHIN_PO_PLUGIN_DIR=/ruta/absoluta/al/paquete/yt_dlp_plugins/extractor
SHIN_PO_FFMPEG=/ruta/absoluta/a/ffmpeg
SHIN_PO_FFPROBE=/ruta/absoluta/a/ffprobe
SHIN_PO_NODE=/ruta/absoluta/a/node
```

El directorio del plugin debe contener `getpot_bgutil.py`, `getpot_bgutil_http.py` y `getpot_bgutil_script.py`. Las rutas de FFmpeg y Node pueden omitirse para usar los binarios configurados por defecto. No cambiar de versión ni activar en producción sin probar compatibilidad en el entorno real. Para volver al modo anterior pon `SHIN_PO_MODE=legacy` y reinicia.

## Controles y limitaciones

La ruta PO usa `mweb`, un solo proveedor local y configura cero reintentos explícitos de yt-dlp para descargas, fragmentos, extractor y acceso a archivos; no garantiza que bibliotecas externas nunca reintenten internamente. Usa un máximo de dos trabajos simultáneos, 180 segundos por operación (incluida la cola), hasta 100 MiB de entrada y 50 MiB de MP3. Genera en temporales privados, comprueba códec, tamaño, duración y decodificación completa y publica sin sobrescribir mediante hard link. La validación no garantiza detectar toda corrupción y depende de la duración de origen. El almacenamiento debe permitir hard links; un apagón o SIGKILL puede dejar temporales. FFmpeg no es una sandbox.

Una respuesta HTTP 429 del ping local o un error 429 reconocible en stderr de yt-dlp bloquea el descargador de esta instancia y cancela los trabajos en curso hasta reiniciar. **Esto no cubre todos los 429:** el servidor puede encapsularlos en JSON con HTTP 200, yt-dlp puede no mostrarlos o mostrarlos con otra redacción y sus advertencias están suprimidas. No debe interpretarse como limitador completo ni como protección contra bloqueos. Revisar y detener manualmente ante señales de límite; no reiniciar para eludirlo. El proveedor no se inicia ni reinicia automáticamente. No se registran intencionalmente sus respuestas o tokens; configura también los logs del proveedor con cuidado, pues pueden exponerlos.

El adaptador usa `--force-ipv4` en yt-dlp y desactiva su proxy; esto no fuerza la red usada internamente por el servidor proveedor. Un PO Token no garantiza aceptación por YouTube ni demuestra disponibilidad futura. Los ensayos incluidos usan un servidor y un ejecutable simulados y FFmpeg real con sonido generado localmente. Además se hizo una prueba real autorizada con un único vídeo: el proveedor respondió a una solicitud con un token presente y el adaptador produjo un MP3 validado. Esa observación no demuestra que YouTube recibiera o aceptara el token, ni predice el resultado en otro entorno. Antes de desplegar, revisar términos aplicables, versiones, seguridad de red y ensayar expresamente en el entorno autorizado.
