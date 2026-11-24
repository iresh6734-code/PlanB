# Fase 1 · Núcleo de la cadena privada del expediente

24/11/2026, Europe/Madrid.

Cada encargo de Verifica tiene ahora una cadena `verifica-expediente-v1` en la tabla cifrada de metadatos (`verifica:ledger:<id del encargo>`). Cada entrada tiene versión, encargo, secuencia desde 1, instante UTC, evento, huella anterior, datos mínimos (papel y origen) y referencias tipadas. Su huella es `sha256-canonical-v1`: `fingerprintOf` de la entrada sin su campo `fingerprint`.

## Qué se registra

| Evento | Cuándo | Referencias |
| --- | --- | --- |
| `source-stored` | Fuente subida (`file`), leída de HubSpot (`hubspot-read`) o desplazada a «anterior» al rotar (`rotate`) | Bytes UTF-8 (`sha256-bytes-v1`) y entrada interpretada (`verifica-input-v1`) con su papel. Si es una lectura, acta (`verifica-read-record-v1`) y documento de autorización. Si sustituye a otra, la huella de bytes reemplazada con `replaced: true` |
| `source-removed` | Fuente retirada que existía | Bytes reemplazados |
| `report-issued` | Emisión en sala limpia | Cada fuente citada por el informe, el informe y la custodia, con sus métodos de formato |
| `watch-signing` / `watch-capture` | Captura de firma y captura semanal de la vigilancia | Bytes, entrada interpretada, acta y documento de autorización |
| `watch-accepted` | Aceptación explícita de una captura retenida | Entrada interpretada aceptada |

La entrada se escribe en la misma transacción que el documento. Subir y retirar fuentes, y aceptar en la vigilancia, ahora son transaccionales. Si falla la escritura de la entrada, no se guarda la fuente y se conservan la cabeza y los documentos anteriores. La cadena no guarda nombres de archivo, datos del CRM ni claves.

`verifyLedger` comprueba formato, encargo, huella y enlace, y da el primer problema por posición: entrada retocada (`altered`), enlace roto tras resellar (`link`), eliminada (`missing`), insertada o reordenada (`out-of-order`). Con una cabeza registrada fuera, también detecta el recorte de la cola (`truncated`) o una cadena reconstruida (`head`). Sin esa cabeza externa, un recorte de la cola no se puede detectar. El orden lo da la secuencia, aunque el reloj retroceda.

## Comprobaciones

- `tsc` limpio. Pruebas focales del expediente, la reapertura de SQLite y la ruta de vigilancia correctas. Batería segura completa correcta.
- Dos fallos provocados se detectan: tragarse el error de escritura de la cadena y quitar la detección de reordenación.
- Solo datos ficticios y almacén en memoria. Sin servidor, navegador ni PowerShell lanzados por la app. No se ha comprobado en un navegador porque no cambia la pantalla.

## Pendiente

- Equivalencia de la migración: su informe aún no se guarda, así que no hay artefacto que encadenar.
- Respuestas declaradas, cierre y borrado.
- Paquete del comprador verificable sin conexión y cabeza registrada fuera del almacén.
- Ruta HTTP de lectura y línea de tiempo dentro de Operación. La ruta espera a que el inventario de `docs/api.md` quede libre.
- Encargos anteriores a este cambio: su cadena empieza en el primer evento posterior.
