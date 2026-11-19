# CSV R4 · Dictamen independiente

**Fechas y horas verificadas.** Las seis huellas presentadas coinciden. Pasaron 20/20 pruebas focales y TypeScript sobre el banco. Un archivo con cinco filas aceptó el 29 de febrero de un año bisiesto y la hora ISO con segundos. Marcó en sus propias líneas el día imposible, las 24:00 y el segundo 60. La vista previa devolvió 200 sin escribir. Aplicar creó dos registros y dos entradas de historial.

**Queda una carrera entre verificar la marca y guardar.** Se revisó un CSV que asociaba un contacto a la empresa `company-1`. Otra conexión restauró una copia ficticia donde ese mismo nombre correspondía a `company-2`. Si la restauración ocurre antes de aplicar, R4 devuelve 409 y no se crea el contacto. Si termina después de comparar la marca pero antes del primer `saveRecord`, la respuesta es 200 y se crea el contacto con `company-1`, que tiene otro nombre en esa copia. El historial confirma una alta. La temporización se dirigió en una base SQLite cifrada de prueba. No se evaluó la frecuencia de esa secuencia en una instalación.

| Momento del cambio de copia | R4 presentada | Prototipo con comprobación dentro de la transacción |
| --- | --- | --- |
| Antes de aplicar | 409, cero altas | 409, cero altas |
| Tras validar la marca y antes de guardar | 200, alta vinculada a la empresa anterior | 409, cero altas |

El prototipo lee la versión de SQLite antes de calcular el plan y vuelve a comprobarla en el `guard` de `saveRecord`, dentro de la transacción. La lectura de la vista previa conserva su carácter de solo lectura. En una base ficticia que aún carece de época, el prototipo sigue importando las dos filas válidas. Se probó el cambio antes de la primera alta. Las escrituras intercaladas después de una primera alta merecen una prueba y un recibo explícito de qué quedó guardado.

**R5.** Mantener la regresión de fechas de R4. Incluir un caso que cambie la copia entre la comprobación de la marca y el primer registro. Rechazarlo como `STALE_PREVIEW` sin altas ni historial en la copia restaurada. Cubrir también una interrupción entre filas de una importación múltiple y conservar la importación estable, incluso en copias sin época inicial. Si se usa `saveRecord.guard`, comprobar y escribir bajo el mismo bloqueo de SQLite.

Evidencia en `tests/.tmp/csv452-fqDZVi`. `inputs.json` conserva las seis huellas y las dependencias comprobadas. `completion.json` registra los resultados y la ausencia de diferencias. El caso dirigido y su variante guardada están en `observations.json` y `guard/observations.json`. Se preservaron las seis fuentes de Claude.
