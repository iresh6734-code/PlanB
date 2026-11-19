# Detección de escrituras concurrentes en la búsqueda

Se probaron dos protecciones sobre el mismo corte del índice de Claude. Una relee las claves de las filas y la identidad, como en el ensayo 448. La otra lee `PRAGMA main.data_version` en la misma conexión antes de resolver la identidad y tras leer las filas, antes de reutilizar resultados o modificar la caché. Si el valor cambia, descarta la caché de esa conexión y devuelve 409.

SQLite documenta que el valor cambia si otra conexión confirma una escritura. No cambia por las escrituras de la propia conexión y solo se compara consigo mismo. En estas dos rutas, las lecturas protegidas son síncronas y no escriben en la conexión. [Documentación de SQLite](https://sqlite.org/pragma.html#pragma_data_version)

## Concurrencia

| Cambio dirigido durante la lectura | Índice actual | Releer filas e identidad | Versión de SQLite |
| --- | ---: | ---: | ---: |
| Cambio de copia con caché vacía | 200 | 409 | 409 |
| Cambio de copia con caché caliente | 200 | 409 | 409 |
| Cambio de copia al abrir una ficha | 200 | 409 | 409 |
| Edición de un contacto desde otra conexión | 200 | 409 | 409 |
| Activación de otra copia desde otro proceso Node | 200 | 409 | 409 |
| Escritura de metadatos ajenos a la búsqueda | 200 | 200 | 409 |
| Escritura ajena a la búsqueda seguida de rollback | 200 | 200 | 200 |

Las respuestas 409 carecen de resultados y ficha. La consulta siguiente, sin imponer la identidad anterior, devolvió el registro correcto en las 21 combinaciones. El rechazo de una escritura no relacionada es conservador y puede pedir un reintento. La prueba emplea dos conexiones y un proceso hijo en bases nuevas con datos ficticios.

## Rendimiento con 10.000 registros cifrados

Se hicieron cinco rondas de calentamiento, 24 mediciones con la caché caliente y 15 tras guardar una edición local en cada variante. Cada ronda alternó el orden de las variantes y comparó el cuerpo JSON completo, incluidas identidad y revisión. Los tres cuerpos fueron iguales en cada ronda.

| Variante | Caché caliente, mediana / p90 | Tras editar, mediana / p90 |
| --- | ---: | ---: |
| Índice actual | 187,42 / 220,75 ms | 257,51 / 307,53 ms |
| Releer filas e identidad | 251,18 / 278,55 ms | 322,94 / 351,64 ms |
| Versión de SQLite | 192,21 / 218,85 ms | 271,90 / 327,25 ms |

Mediciones de un banco local con Fastify inject. La mediana por versión fue 59 ms menor en caliente y 51 ms menor tras editar que al releer las filas. Las cifras sirven para elegir qué protección integrar. Se volverán a medir sobre las huellas de la entrega formal.

## Evidencia y alcance

- Banco `tests/.tmp/search451-AKKycq`. Entradas y medidas crudas en `result.json`. Preparación y ejecución en `tests/.tmp/search451-run.mjs` y `tests/.tmp/search451-writer.mjs`.
- SHA-256 del servidor probado `d8f572ff6a1267d9f3e4ede567f0ade45ee4884304c5db2f987263d9d682c240`, del módulo común `158ada53d692b18b6adeebed10282c9a775536331d188c30598243d9f968ea15` y del prototipo por versión `b3b3ff15be9f4b58e3f34b327cd7f24b4001e8bb649c267ddab1f91b793aa9d6`.
- El prototipo pasó 29/29 pruebas existentes de búsqueda e identidad y `tsc --noEmit` sobre su banco aislado.
- El prototipo cubre las dos rutas de búsqueda. Quedan por revisar la llamada desde el estado general y el comportamiento del navegador al reintentar tras cambiar efectivamente de copia.
- La implementación vive en el banco. Se mantienen las reservas 207 y SEARCH-PERF-R.
