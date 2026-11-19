# Lectura de relaciones al cambiar de ficha

«Relacionado» cancela la lectura anterior cuando cambia el destino o se cierra la ficha. La paginación comprueba la cancelación incluso si el transporte entrega una respuesta tardía. La interfaz muestra resultados y errores de la ficha y del intento vigentes. Si la consulta falla, «Reintentar» vuelve a leer desde la ficha abierta. La búsqueda sigue siendo local y mantiene el límite de 300 registros por tipo y el aviso de cobertura parcial.

## Verificación

- Antes del cambio, las dos nuevas pruebas unitarias fallan porque la cancelación no detiene la lectura. Después, 20/20 pruebas focales de relaciones, listado y navegación.
- Chromium falla antes en los dos casos nuevos. Al cambiar de ficha no se cancela la solicitud anterior y, tras un 503, falta el botón Reintentar. Con el cambio, 2/2. Chromium confirma el aborto de la lectura anterior, muestra la relación de la nueva ficha y recupera los resultados al reintentar. Las respuestas están interceptadas y el caso de reintento verifica que las consultas usan GET.
- TypeScript del checkout terminó con código 0. Los archivos probados se registran en `tests/.tmp/related439-inputs.json`. Las salidas anteriores y posteriores están en `tests/.tmp/related439-*`.

La prueba de navegador monta el componente real con datos ficticios. El piloto instalado queda fuera de esta entrega.
