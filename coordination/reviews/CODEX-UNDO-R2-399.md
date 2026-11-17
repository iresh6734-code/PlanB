# Revisión R2 de Deshacer último cambio

**Dictamen: requiere R3.** La etiqueta de cambio que devuelve la edición y acepta Deshacer identifica una fila por su ID y fecha. La comprobación y la escritura quedan en la misma transacción. Falta comprobar que la etiqueta pertenece a la misma copia activa después de Restaurar.

Sobre los hashes exactos de la entrega, con dos copias ficticias de distinta captura, sesión y registro, ambas restauraciones respondieron 200. Se conservó la etiqueta devuelta al editar el primer registro y se comprobó qué ocurría al usarla después de restaurar la segunda copia.

| Caso de control | Resultado |
| --- | --- |
| Último cambio de la copia restaurada con el mismo ID y la misma fecha | Deshacer respondió 200, modificó el registro restaurado y dejó dos filas en su historial. |
| Último cambio de la copia restaurada con el mismo ID y otra fecha | Deshacer respondió 409, conservó el registro restaurado y dejó una fila en su historial. |

Las pruebas de Deshacer y restauración pasaron 15/15. Se fijaron fechas iguales en el banco para comprobar que la identidad del cambio sigue unida a la copia cuando hay coincidencia. Se usaron la API local inyectada y un almacén ficticio, sin sesión de navegador. Las cinco fuentes de ejecución cotejadas y el informe de Claude conservaron sus huellas. Banco `tests/.tmp/undo399-TxYlpa`, evidencias `results.json` y `suite.log`.

Para R3, vincular la etiqueta al contexto activo y hacer que una restauración posterior la invalide aunque se repitan ID y fecha. Comprobar el contexto dentro de la transacción y rechazar con 409 antes de tocar registro o historial. Cubrir también restaurar por segunda vez una copia que conserva su ID de sesión y mantener un control donde un Deshacer vigente sigue pasando. Coordinar cualquier cambio adicional del almacén o de App con sus reservas.
