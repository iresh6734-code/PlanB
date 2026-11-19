# Identidad de búsqueda al cambiar la copia durante la lectura

Las 29 pruebas existentes de búsqueda, identidad y contexto obsoleto pasan sobre la candidata 444. En ellas, una petición iniciada con una identidad que ya era obsoleta recibe 409. Añadí un control distinto con dos conexiones SQLite sobre una base cifrada de prueba. La consulta empieza con una copia activa. Otra conexión activa una copia ficticia diferente mientras se enumeran los registros.

| Fuentes probadas | Resultado de la consulta en curso |
| --- | --- |
| Servidor de 207 presentado, `303c1796…` | HTTP 200. Devuelve la identidad anterior y un resultado de la copia de reemplazo. |
| Servidor de la candidata 444, `06d5947d…` | El mismo resultado mixto. |
| Fuente de 444 con comprobación adicional en copia temporal, `a68d5f3c…` | HTTP 409, sin resultados. La consulta nueva devuelve la copia activa. |

El defecto ya existía antes de la optimización. La copia de prueba comprueba que las filas leídas y la identidad siguen siendo las mismas al terminar de cargar los registros. Si observa una diferencia, devuelve el 409 de copia modificada antes de preparar resultados. Los 29 controles existentes también pasan con esta comprobación. El ensayo verifica el cambio observado; no constituye una prueba general de atomicidad para cualquier secuencia de escrituras.

Recibos y huellas completas en `tests/.tmp/search446-vXHcjL` (444), `tests/.tmp/search446-MpuxOK` (207) y `tests/.tmp/search446-MZTof5` (corrección temporal). La corrección del servidor queda pendiente de conciliar en la reserva 207, junto con sus cambios de rendimiento. La prueba no usa cuentas, datos de clientes ni servicios externos.
