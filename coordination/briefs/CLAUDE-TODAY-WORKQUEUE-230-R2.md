# Cola de Hoy 230. Corrección R2

## Encargo vigente · R3

Conserva tus seis rutas. Las tres correcciones R2 han pasado la revisión independiente. R3 se centra en un caso adicional de entrada válida. La Store importa y activa una tarea referida a un contacto con ID de 1.001 unidades UTF-16. El contacto existe con su ID completo y el endpoint anterior responde 200. La cola estructurada falla con 422 por `WorkReferenceSchema`. El control de 1.000 responde 200. Reproduce `tests/.tmp/work230-r2-ns0i8C/s/tests/work230-r2-independent.test.ts` y su caso final.

- Alinea el contrato de referencias con los IDs que admite la importación. Mantén IDs íntegros y el presupuesto UTF-8 de la respuesta. No conviertas la referencia encontrada en ausente ni interrumpas el resto de la cola por este ID. La propuesta privada `proposed-reference-schema.ts` supera las cinco sondas conservando el presupuesto global.
- Prueba las dos longitudes sobre una importación normal, confirma la identidad recibida en el cliente y conserva la cobertura y los recuentos. Prueba que una fila que exceda el presupuesto por sí sola se declara omitida por bytes y no fabrica un ID truncado. Comprueba también si hay otros límites de campos de identidad con la misma discrepancia respecto a la entrada admitida. Conserva el contrato anterior y documenta cualquier límite que requiera una decisión de producto.
- Coteja las seis huellas y vuelve a presentar. La compatibilidad y las pruebas R2 continúan vigentes. La Jornada, la ficha y la entrada de Hoy siguen en sus propios encargos.

## Encargo anterior · R2

Conserva tus seis rutas. Lee el [dictamen independiente](../reviews/CLAUDE-TODAY-WORKQUEUE-230-independent.md) y reproduce tests/.tmp/work235-9e526518/s/tests/independent-work235.test.ts. Mantén el recurso anterior y su cliente.

1. Haz que una tarea con más de 20 asociaciones válidas siga siendo legible. Conserva las identidades exactas. Si acotas el detalle, registra cuántas referencias quedan fuera y distingue un recorte de la ausencia de asociaciones. Los motivos y los recuentos deben seguir describiendo su alcance. Prueba 20, 21 y más de 20 asociaciones por la importación normal.
2. Alinea el presupuesto de bytes del endpoint y el cliente. La primera página producida por el servidor debe ser consumible con el límite del cliente. Conserva el orden, las cifras globales y el número de tareas omitidas. Si introduces paginación o un presupuesto propio, documenta el límite y prueba el borde con UTF-8, referencias largas y 200 tareas. No sueltes el límite ni recortes identificadores para pasar la prueba. Prueba la API y el cliente juntos sobre el cuerpo realmente devuelto.
3. Valida la coherencia de fase e identidad. Empty exige identity y counts nulos y una lista vacía. Imported y active exigen identidad y recuentos. Un cero observado es compatible con una copia identificada. Añade controles de consistencia para los recuentos publicados y una respuesta contradictoria. Conserva el aislamiento de la captura activa frente a una candidata pendiente, protección por sesión, Vary y no-store.

Repite las 49 pruebas y las sondas nuevas. Ajusta las expectativas al contrato acordado si se indica expresamente un recorte. Registra la compatibilidad con la Jornada y el comportamiento de not-captured fuera de una importación normal. Presenta tipos, hashes y los límites del nuevo contrato antes de montar Hoy.
