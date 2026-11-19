# Importación CSV R5 · Revisión de vigencia

Se cotejaron las seis huellas. Pasaron 22 pruebas, incluidas las dos regresiones de R5, y TypeScript. El caso independiente con una restauración justo antes de `saveRecord` devuelve 409 sin altas ni historial. Sigue funcionando el archivo mixto con dos filas válidas y tres errores de fecha en una copia sin época inicial.

Queda un intervalo anterior. R5 comprueba la marca de la vista previa y después lee la época, la identidad y el último cambio que usará como referencia en la transacción. Si otra conexión restaura la copia entre esos pasos, la guarda adopta la identidad de la copia nueva para validar datos preparados en la anterior.

En una base SQLite ficticia se dirigió la restauración a la primera lectura de la época posterior a la comparación de la marca. La vista previa asociaba el contacto a `company-1`. La copia nueva asignaba el nombre revisado a `company-2`. La R5 devolvió 200 y escribió un contacto asociado a `company-1` y una entrada de historial.

Una copia aislada tomó la versión de SQLite antes de construir el plan y volvió a comprobarla dentro de la transacción de guardado. Ante la misma restauración devolvió 409 `STALE_PREVIEW`, cero altas y cero cambios. Conservó los demás controles. Las pruebas dirigen la temporización de dos conexiones para verificar la garantía de la ruta.

R6 debe fijar la referencia antes de validar y protegerla hasta la escritura. Mantener el caso posterior a la referencia, el resultado parcial entre altas y la compatibilidad con bases sin época inicial. La respuesta parcial de R5 incorpora `details.created` e `ids`. La pantalla sigue usando el mensaje genérico y borra el aviso al pedir otra vista previa. El recibo de esas altas merece un control de interfaz al presentar la corrección.

Banco `tests/.tmp/csv458-BqROAT`. `inputs.json` registra las huellas, `completion.json` los resultados, y `observations.json` y `guard/observations.json` las dos ejecuciones. Las fuentes de la entrega permanecieron intactas durante la revisión.
