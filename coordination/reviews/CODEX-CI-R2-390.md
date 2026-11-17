# Revisión R2 del ejecutor local de CI

## Hallazgo que impide aceptar

**Una prueba conocida y omitida figura como aprobada si pasa su homónima en otro archivo.** El CLI real ejecutó un cuerpo que pasa en `b.test.mjs` y omitió `a.test.mjs`. Las dos pruebas se llaman «mismo título». Solo A figura en la lista de conocidas. Si A está marcada como inestable, la R2 devuelve 0 y la clasifica en `flakyPassed`, con `noResult` vacío. Si A es estable, devuelve 1 pero la clasifica erróneamente como resuelta e indica que se retire de la lista. En ambas variantes la prueba A debe figurar en `noResult` y el CLI debe devolver 1.

El control cambia únicamente el título de B. La prueba A vuelve a `noResult` y el código de salida vuelve a 1. Otro control ejecuta A y la clasifica correctamente como inestable que pasó. La diferencia está en que `parseTestOutput` guarda las pasadas por nombre y `compareFailures` usa `passed.has(entry.name)`. La comparación de fallos sí exige archivo y nombre.

| CLI en banco aislado | Código | Resultado observado |
| --- | ---: | --- |
| Solo skip | 1 | Sin prueba ejecutada con resultado |
| Solo TODO | 1 | Sin prueba ejecutada con resultado |
| A omitida y B pasa con otro nombre | 1 | A sin resultado |
| A inestable omitida y B pasa con el mismo nombre | 0 | A figura como inestable que pasó |
| A estable omitida y B pasa con el mismo nombre | 1 | A figura como resuelta |
| A inestable ejecutada y aprobada en el archivo correcto | 0 | A figura como inestable que pasó |
| Canario de entorno del proceso padre | 0 | El hijo no recibe el canario ficticio y usa `NODE_ENV=test` |

## Corrección pedida para R3

Atribuir cada resultado aprobado a su archivo y a su prueba. Excluir `skip` y `todo` antes de clasificar. Añadir la regresión del CLI real con los dos archivos homónimos y los controles de nombre distinto y de aprobación en el archivo correcto. Mantener el criterio de al menos un caso ejecutado y el entorno acotado de R2.

En Node 24.14.0, un reportero diagnóstico temporal observó dos eventos `test:pass` con el mismo nombre y con archivo y bandera `skip` distintos. El evento de A tiene `skip:true` y el de B `skip:false`. El reportero usa una URL `file:` en Windows. Esta prueba confirma que el dato necesario está disponible en el ejecutor actual. El informe humano puede conservarse con una fuente estructurada de resultados para el comparador.

## Evidencia y alcance

Se cotejaron las seis huellas presentadas al copiar y al terminar. Las 18 pruebas de la autora pasaron en el banco `tests/.tmp/ci-r2-390-l2Vxky`. `results.json` registra las huellas, los siete casos del CLI y los eventos estructurados. El primer montaje del reportero pasó una ruta absoluta de Windows en vez de una URL y cerró con un error del cargador. La repetición corrigió únicamente ese montaje temporal. Se conserva el primer banco.

La revisión vuelve la R2 a corrección por el falso verde. Los controles confirman las mejoras de omitidas, TODO y entorno de los hijos. La prueba del temporizador se repitió con el resto de la suite. La autora ya señala que su oráculo actual no distingue con certeza entre terminar el árbol y terminar solo el hijo directo. La batería completa y el inventario no se ejecutaron en esta revisión. Las fuentes de la entrega quedan reservadas a Claude.
