# Persistencia, credenciales y política de sesión

Shin-MD protege las bases de datos y la sesión de WhatsApp con reglas
conservadoras para evitar pérdida de datos, corrupción silenciosa o borrado
automático de credenciales.

## Motor SQLite y respaldo JSON

- El motor principal de almacenamiento es `node:sqlite` (Node.js 22+) con
  `PRAGMA journal_mode = WAL`, `synchronous = NORMAL` y permisos `0600` sobre el
  archivo `.db` y sus auxiliares `-wal`/`-shm` en sistemas POSIX.
- El respaldo JSON (`src/storage/sqlite-compat.js`) solo entra cuando
  `node:sqlite` no está disponible y la apertura declara explícitamente
  `allowJsonFallback: true`.
- `src/core/auth.js` abre siempre SQLite real (`allowJsonFallback: false`) para
  que las credenciales y llaves Signal nunca caigan por accidente a un archivo
  plano.
- En modo JSON, cada escritura se serializa en un archivo temporal dentro del
  mismo directorio con permisos `0600`, se sincroniza (`fsync`) y se aplica con
  `rename` atómico; si el archivo contiene JSON inválido, la apertura falla en
  lugar de sobrescribirlo con una base vacía.

## Migración desde respaldo JSON a SQLite

Cuando existe un archivo `<ruta>.json` junto a una base SQLite vacía:

1. La importación corre dentro de una única transacción `BEGIN IMMEDIATE`.
2. Se verifica el contenido de cada fila escrita antes de confirmar (`COMMIT`).
3. Si cualquier fila falla o la tabla destino ya contiene datos no importados
   por el mismo respaldo, se revierte la transacción (`ROLLBACK`) y el archivo
   JSON original queda intacto.
4. La huella SHA-256 del respaldo importado queda registrada en
   `shin_json_imports` por nombre de archivo, de modo que reabrir o mover la
   carpeta del proyecto sea idempotente y cualquier alteración posterior exija
   revisión manual.

## Política de desconexión de sesión

`src/core/politica-sesion.js` clasifica los cierres de conexión en dos rutas:

- **Revisión administrativa** (`loggedOut`, `badSession`, `forbidden`,
  `multideviceMismatch` o racha de 6 o más `restartRequired` consecutivos):
  detiene la reconexión automática, cancela temporizadores de vinculación
  pendientes y **conserva las credenciales** sin borrarlas ni sobrescribirlas
  hasta que el operador revise la sesión.
- **Sesión reemplazada** (`connectionReplaced`): detiene la reconexión
  automática para no competir con otra instancia activa y conserva la sesión
  intacta.
- **Reconexión con retroceso exponencial**: el resto de cortes transitorios de
  red reintentan con espera exponencial y variación acotada, guardando antes el
  estado pendiente mientras la base de sesión siga abierta.
