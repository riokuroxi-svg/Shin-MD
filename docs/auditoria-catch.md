regenerado
a de los `catch {}` vacíos

Total: **183** bloques `catch` vacíos en el proyecto.

Clasificación por lo que hay DENTRO del `try` (lo que puede fallar en silencio):

| Riesgo | Cuántos | Qué significa |
|---|---|---|
| 🔴 ALTO | 23 | El try toca la **base de datos** o escribe archivos. Si falla, se pierden datos y nadie se entera |
| 🟠 MEDIO | 60 | El try **envía o descarga**. Si falla, el usuario no recibe lo suyo y el bot no lo registra |
| 🟢 BAJO | 26 | Borrado de temporales, presencia, parseo opcional: aquí el `catch` vacío es **correcto y deliberado** |
| ⚪ INDEFINIDO | 74 | El try es corto o genérico: mirar a mano |

> Cómo se hizo: se leyó el `try` que precede a cada `catch` vacío y se clasificó por la operación que contiene. Es una guía para revisar, no un veredicto: los 🟢 no se tocan; los 🔴 y 🟠 merecen una mirada.

## 🔴 ALTO riesgo — base de datos y escrituras (23)

| Archivo | Línea | Operación que falla en silencio |
|---|---|---|
| `boot/index.js` | 404 | `db.close()` |
| `cmds/downloads/play.js` | 238 | `fs.writeFileSync()` |
| `cmds/downloads/ytdlp.js` | 343 | `fs.writeFileSync()` |
| `cmds/socket/subs.js` | 178 | `saveCredsDB()` |
| `cmds/stickers/getpack.js` | 58 | `db.getUser()` |
| `src/core/auth.js` | 43 | `wal_checkpoint()` |
| `src/lib/channel.js` | 51 | `db.setSettings()` |
| `src/services/ginko-db.js` | 35 | `d.exec()` |
| `src/services/ginko-db.js` | 36 | `d.exec()` |
| `src/services/ginko-db.js` | 37 | `d.exec()` |
| `src/services/ginko-db.js` | 38 | `d.exec()` |
| `src/services/ginko-db.js` | 85 | `d.exec()` |
| `src/storage/database.js` | 42 | `wal_checkpoint()` |
| `src/storage/database.js` | 99 | `db.close()` |
| `src/storage/migrations.js` | 61 | `db.exec()` |
| `src/storage/migrations.js` | 64 | `db.exec()` |
| `src/storage/migrations.js` | 65 | `db.exec()` |
| `src/storage/migrations.js` | 66 | `db.exec()` |
| `src/storage/migrations.js` | 67 | `db.exec()` |
| `src/storage/migrations.js` | 68 | `db.exec()` |
| `src/storage/migrations.js` | 69 | `db.exec()` |
| `src/storage/migrations.js` | 70 | `db.exec()` |
| `src/storage/sqlite-compat.js` | 91 | `fs.writeFileSync()` |

## 🟠 MEDIO riesgo — envíos y descargas (60)

| Archivo | Línea | Operación que falla en silencio |
|---|---|---|
| `cmds/downloads/play.js` | 340 | `vRes.arrayBuffer()` |
| `cmds/downloads/play.js` | 356 | `vRes.arrayBuffer()` |
| `cmds/downloads/play.js` | 455 | `sock.sendMessage()` |
| `cmds/downloads/play.js` | 527 | `sock.sendMessage()` |
| `cmds/downloads/play.js` | 543 | `sock.sendMessage()` |
| `cmds/downloads/play.js` | 623 | `sock.sendMessage()` |
| `cmds/downloads/play.js` | 627 | `sock.sendMessage()` |
| `cmds/downloads/play.js` | 744 | `sock.sendMessage()` |
| `cmds/downloads/play.js` | 747 | `sock.sendMessage()` |
| `cmds/downloads/play2.js` | 31 | `axios.get()` |
| `cmds/downloads/play2.js` | 44 | `axios.get()` |
| `cmds/downloads/play2.js` | 57 | `axios.get()` |
| `cmds/downloads/play2.js` | 70 | `axios.get()` |
| `cmds/downloads/play2.js` | 118 | `searchYouTube()` |
| `cmds/downloads/play2.js` | 146 | `sock.sendMessage()` |
| `cmds/downloads/play2.js` | 176 | `sock.sendMessage()` |
| `cmds/downloads/play2.js` | 188 | `sock.sendMessage()` |
| `cmds/downloads/soundcloud.js` | 66 | `axios.get()` |
| `cmds/downloads/soundcloud.js` | 73 | `axios.get()` |
| `cmds/downloads/soundcloud.js` | 155 | `sock.sendMessage()` |
| `cmds/downloads/soundcloud.js` | 172 | `sock.sendMessage()` |
| `cmds/downloads/soundcloud.js` | 179 | `sock.sendMessage()` |
| `cmds/downloads/spotify.js` | 36 | `axios.get()` |
| `cmds/downloads/spotify.js` | 46 | `axios.get()` |
| `cmds/downloads/spotify.js` | 67 | `axios.get()` |
| `cmds/downloads/spotify.js` | 84 | `axios.get()` |
| `cmds/downloads/spotify.js` | 167 | `sock.sendMessage()` |
| `cmds/downloads/spotify.js` | 184 | `sock.sendMessage()` |
| `cmds/downloads/spotify.js` | 191 | `sock.sendMessage()` |
| `cmds/downloads/twitter.js` | 70 | `fetch()` |
| `cmds/gacha/charimage.js` | 33 | `res.json()` |
| `cmds/gacha/rollwaifu.js` | 111 | `sock.sendMessage()` |
| `cmds/gacha/rollwaifu.js` | 128 | `sock.sendMessage()` |
| `cmds/gacha/rollwaifu.js` | 166 | `sock.sendMessage()` |
| `cmds/gacha/rollwaifu.js` | 168 | `sock.sendMessage()` |
| `cmds/group/close.js` | 37 | `applyAction()` |
| `cmds/group/open.js` | 37 | `applyAction()` |
| `cmds/main/invite.js` | 65 | `sock.sendMessage()` |
| `cmds/main/invite.js` | 71 | `sock.sendMessage()` |
| `cmds/main/suggest.js` | 49 | `sock.sendMessage()` |
| `cmds/nsfw/gelbooru.js` | 43 | `sock.sendMessage()` |
| `cmds/socket/subs.js` | 277 | `socks.client.sendMessage()` |
| `cmds/socket/subs.js` | 307 | `socks.client.sendMessage()` |
| `cmds/utils/benchdl.js` | 58 | `sock.sendMessage()` |
| `cmds/utils/carbon.js` | 59 | `sock.sendMessage()` |
| `cmds/utils/carbon.js` | 65 | `sock.sendMessage()` |
| `cmds/utils/chatgpt.js` | 32 | `res.text()` |
| `cmds/utils/chatgpt.js` | 105 | `subirLitterbox()` |
| `cmds/utils/deepseek.js` | 75 | `sendAiResponse()` |
| `cmds/utils/recordar.js` | 53 | `sock.sendMessage()` |
| `src/commands/context.js` | 185 | `sock.sendPresenceUpdate()` |
| `src/commands/context.js` | 191 | `sock.sendPresenceUpdate()` |
| `src/commands/loader.js` | 74 | `sock.sendMessage()` |
| `src/commands/router.js` | 180 | `catch()` |
| `src/commands/router.js` | 206 | `catch()` |
| `src/commands/router.js` | 212 | `sock.sendMessage()` |
| `src/core/socket.js` | 327 | `s.groupFetchAllParticipating()` |
| `src/lib/youtubeSearch.js` | 122 | `res.json()` |
| `src/services/downloader.js` | 315 | `resolveYtdlpLocal()` |
| `src/services/downloader.js` | 341 | `Promise.any()` |

## ⚪ Por revisar a mano (74)

| Archivo | Línea | Operación que falla en silencio |
|---|---|---|
| `boot/index.js` | 403 | `engine.shutdown()` |
| `cmds/downloads/imagen.js` | 102 | `URL()` |
| `cmds/downloads/play.js` | 176 | `getVideoInfoById()` |
| `cmds/downloads/play.js` | 182 | `searchYouTube()` |
| `cmds/downloads/play.js` | 252 | `descargarAudioFuenteYtdlp()` |
| `cmds/downloads/play.js` | 296 | `processMp3ForWhatsApp()` |
| `cmds/downloads/play.js` | 370 | `procesarRespuesta()` |
| `cmds/downloads/play.js` | 531 | `delete()` |
| `cmds/downloads/play.js` | 740 | `delete()` |
| `cmds/downloads/play2.js` | 108 | `getVideoInfoById()` |
| `cmds/downloads/soundcloud.js` | 58 | `getSoundCloudDirectProgressive()` |
| `cmds/economy/daily.js` | 67 | `sendNativeQuickReply()` |
| `cmds/economy/mine.js` | 47 | `procesarRespuesta()` |
| `cmds/events.js` | 81 | `generateWelcomeCard()` |
| `cmds/profile/level.js` | 69 | `generateProfileCard()` |
| `cmds/profile/profile.js` | 118 | `generateProfileCard()` |
| `cmds/socket/subs.js` | 40 | `sock.ev.removeAllListeners()` |
| `cmds/socket/subs.js` | 41 | `close()` |
| `cmds/socket/subs.js` | 42 | `Error()` |
| `cmds/socket/subs.js` | 43 | `close()` |
| `cmds/socket/subs.js` | 202 | `fs.rmSync()` |
| `cmds/socket/subs.js` | 218 | `fs.rmSync()` |
| `cmds/utils/chatgpt.js` | 64 | `res.json()` |
| `cmds/utils/chatgpt.js` | 128 | `msg.react()` |
| `cmds/utils/chatgpt.js` | 157 | `msg.react()` |
| `cmds/utils/chatgpt.js` | 171 | `msg.react()` |
| `cmds/utils/deepseek.js` | 32 | `msg.react()` |
| `cmds/utils/deepseek.js` | 60 | `msg.react()` |
| `cmds/utils/deepseek.js` | 80 | `msg.react()` |
| `cmds/utils/hd.js` | 87 | `proc.kill()` |
| `cmds/utils/wastalk.js` | 46 | `sock.onWhatsApp()` |
| `cmds/utils/wastalk.js` | 80 | `import()` |
| `cmds/utils/wastalk.js` | 96 | `sock.getBusinessProfile()` |
| `src/commands/interactive.js` | 202 | `lines.push()` |
| `src/commands/interactive.js` | 423 | `?()` |
| `src/commands/router.js` | 142 | `opts.onMessage()` |
| `src/commands/router.js` | 192 | `opts.onCommand()` |
| `src/core/auth.js` | 33 | `fs.chmodSync()` |
| `src/core/engine.js` | 75 | `sock.ev.removeAllListeners()` |
| `src/core/engine.js` | 76 | `sock.ws.close()` |
| `src/core/engine.js` | 77 | `Error()` |
| `src/core/socket.js` | 85 | `s.ev.removeAllListeners()` |
| `src/core/socket.js` | 86 | `close()` |
| `src/core/socket.js` | 87 | `Error()` |
| `src/core/socket.js` | 88 | `close()` |
| `src/core/socket.js` | 192 | `estilizar()` |
| `src/core/socket.js` | 212 | `next()` |
| `src/core/socket.js` | 307 | `?()` |
| `src/core/socket.js` | 337 | `?()` |
| `src/lib/channel.js` | 34 | `endsWith()` |
| `src/lib/diagnostics.js` | 54 | `push()` |
| `src/lib/diagnostics.js` | 57 | `push()` |
| `src/lib/edgeTTS.js` | 90 | `ws.close()` |
| `src/lib/edgeTTS.js` | 111 | `ws.close()` |
| `src/lib/mp3Utils.js` | 53 | `exec()` |
| `src/lib/mp3Utils.js` | 167 | `list.push()` |
| `src/lib/sqliteAuth.js` | 91 | `?()` |
| `src/lib/ytdlp.js` | 122 | `_execYtdlpRaw()` |
| `src/lib/ytdlp.js` | 176 | `fs.rmSync()` |
| `src/lib/ytdlp.js` | 200 | `searchYtdlp()` |
| `src/services/ginko-db.js` | 105 | `?()` |
| `src/services/ginko-db.js` | 106 | `?()` |
| `src/services/ginko-db.js` | 113 | `?()` |
| `src/services/ginko-db.js` | 114 | `?()` |
| `src/services/ginko-db.js` | 121 | `?()` |
| `src/services/ginko-db.js` | 128 | `?()` |
| `src/services/ginko-db.js` | 137 | `?()` |
| `src/services/ginko-db.js` | 145 | `?()` |
| `src/services/ginko-db.js` | 152 | `?()` |
| `src/storage/database.js` | 34 | `fs.chmodSync()` |

_(+4 más en el proyecto)_
