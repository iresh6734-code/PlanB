# Historial de la ficha con el detalle de cada operación

Cada edición mantiene un resumen de hasta cuatro campos y permite desplegar el resto. Las altas permiten consultar los valores iniciales. El detalle conserva una fecha ilegible tal como llegó y distingue campo ausente, valor nulo y texto vacío. Las fechas legibles mantienen el formato de Plan B.

El historial valida la respuesta con el mismo esquema de cambios guardados que usa la pantalla general. La lectura se cancela al salir o cambiar de ficha, y el componente liga su estado al tipo de registro, ID e intento. Un fallo ofrece reintento en la misma ficha.

## Verificación

- 3/3 en Chromium con el componente real, peticiones interceptadas y datos ficticios. Cubre apertura por teclado, fecha inválida, valores inicialmente ocultos, dos tipos de registro con el mismo ID y reintento de un 503. La respuesta antigua llega deliberadamente aunque el transporte omita la cancelación.
- En el código previo congelado, dos casos fallan por el formato de fecha y por la ausencia de reintento. El descarte al cambiar de tipo ya pasaba y se conserva como regresión. El primer ensayo de la versión nueva necesitó localizar la línea completa de la diferencia en vez de un nodo de texto exacto.
- 33/33 pruebas relacionadas de historial, fechas, ficha y rutas. Tipos verificados en la candidata de 444. Entradas cotejadas en `tests/.tmp/timeline443-submitted-pins.json`.

Los casos de navegador usan solo lecturas. El historial general y el editor de campos de fecha son unidades distintas. La reproducción 440 sobre fechas ilegibles del editor conserva su alcance.
