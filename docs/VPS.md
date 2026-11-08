# Shin-MD en un servidor (VPS)

En un VPS el bot no se arranca a mano: se deja corriendo como servicio y se
mira desde fuera. Esta página es para eso.

## Lo primero: qué cambia respecto al teléfono

El panel dibujado **solo aparece si hay una terminal de verdad**. El programa
lo comprueba (`process.stdout.isTTY`) y, si no la hay, no manda ni un código de
color ni de posición de cursor: escribe líneas normales y punto. Eso significa
que el mismo `npm start` funciona en systemd, en pm2, con `nohup` o dentro de
un contenedor, sin ensuciar los registros con basura binaria.

| Dónde | `npm start` dibuja panel | Cómo ves lo que pasa |
|---|---|---|
| Termux (móvil) | sí | el panel, con el registro debajo |
| SSH a un VPS | sí | el panel en tu SSH |
| systemd | no | `journalctl -u shin-md -f` |
| pm2 | no | `pm2 logs shin-md` |
| `nohup` / Docker | no | el archivo de salida o `docker logs` |

## systemd (recomendado en un VPS)

```ini
# /etc/systemd/system/shin-md.service
[Unit]
Description=Shin-MD
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=shin
WorkingDirectory=/home/shin/Shin-MD
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
# Sin esto, systemd corta el proceso a los 90 s al pararlo.
TimeoutStopSec=20
# El bot no necesita escribir fuera de su carpeta.
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now shin-md
journalctl -u shin-md -f
```

Dos avisos honestos:

- **`Restart=always` y el vigía hacen lo mismo.** Si usas systemd con
  `Restart=always`, arranca con `npm run vigia` o con `npm start`; da igual,
  porque el vigía solo reintenta cinco veces y luego se rinde, y ahí es systemd
  quien vuelve a empezar. No se pelean: es una red debajo de otra.
- **El usuario del servicio tiene que ser el dueño de `Sessions/` y `.env`.**
  Si no, la sesión de WhatsApp no se puede escribir y el bot no vincula.

## pm2

```bash
npm install -g pm2
cd ~/Shin-MD && pm2 start npm --name shin-md -- start
pm2 logs shin-md
pm2 save && pm2 startup
```

pm2 arranca sin terminal, así que tampoco dibuja panel. Su ventaja es que
`pm2 monit` da algo parecido a lo que hace `npm start` en el móvil.

## tmux o screen

Si quieres el panel **y** que sobreviva a cerrar la sesión SSH:

```bash
tmux new -s shin
cd ~/Shin-MD && npm start -- --code
# Ctrl+B, luego D  → se desengancha
tmux attach -t shin
```

`tmux` sí es una terminal de verdad, así que el panel se dibuja con normalidad.
`sreen` también.

## Qué NO se debe hacer

- **No lances dos copias.** Dos procesos con la misma sesión de WhatsApp se
  pelean por el socket y uno acaba expulsando al otro. Antes de arrancar:
  `pgrep -af "index.js|consola.mjs"`.
- **No expongas el panel a internet.** El puerto (`PORT`, por defecto 3000)
  solo escucha en `127.0.0.1` mientras `LOOPBACK=1`, que es lo que viene
  puesto. Si lo abres (`LOOPBACK=0`), ponlo detrás de un proxy con contraseña:
  fuera no hay autenticación de ningún tipo.
- **No edites `Sessions/` a mano.** Ahí vive la vinculación; si se rompe, hay
  que volver a vincular el número.
