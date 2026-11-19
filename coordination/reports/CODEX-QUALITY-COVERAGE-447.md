# Calidad de los datos con cobertura comprobada

La tarjeta cuenta registros únicos por tipo. Si una página repite IDs, contiene otro tipo, trae un tamaño incoherente o cambia el total, la cobertura queda sin confirmar. Solo se afirma que una relación está rota cuando se pudo revisar todo el tipo de destino. El resto de avisos comprobables sigue visible. Si se alcanza el límite de 300 registros por tipo con páginas coherentes, se muestra el recuento parcial habitual.

Al cambiar de copia, desaparecen los avisos anteriores junto con sus accesos a fichas. La solicitud pendiente se cancela. Una respuesta tardía que ignora la cancelación tampoco inicia más páginas. Las lecturas fallidas y la cobertura sin confirmar permiten reintentar.

## Pruebas

- 21/21 Node de calidad, relaciones y listado. Las tres regresiones nuevas fallaban antes: una página duplicada inflaba el total, un recuento que disminuía daba cobertura completa y la cancelación permitía más solicitudes.
- 3/3 en Chromium con la tarjeta real y consultas ficticias interceptadas. Las mismas tres pruebas fallan sobre el código previo. Cubren cobertura, retirada de avisos al cambiar de copia y reintento de un 503. El camino de reintento comprueba que ambas peticiones usan GET.
- TypeScript termina con código 0. Se cotejaron las huellas de las cuatro entradas en `tests/.tmp/quality447-pins.json`.

El cliente detecta incoherencias observables. Una secuencia con el mismo total, sin IDs repetidos y formada por distintas revisiones puede parecer coherente con el contrato actual. Para garantizar un corte único, el servidor tendría que incluir una revisión común en cada página. La instalación del usuario queda fuera del ensayo.
