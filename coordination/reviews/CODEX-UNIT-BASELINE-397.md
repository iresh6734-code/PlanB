# 397 · Resultado de la batería unitaria completa

17/11/2026, Europe/Madrid. Ejecuté `npm test` sobre un corte local ficticio fijado en el tablón 2819. Incluye 860 archivos seleccionados, 50 auxiliares y 50 referencias sintéticas de 381. Los 283 archivos de pruebas se ejecutaron en un directorio nuevo con dependencias locales y la guardia de red exterior. No se detectó ninguna huella congelada distinta al terminar.

| Corte | Pruebas | Aprobadas | Fallos | Omitidas | TODO | Canceladas |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 381 | 3.056 | 3.039 | 12 | 1 | 4 | 0 |
| 397 | 3.123 | 3.104 | 14 | 1 | 4 | 0 |

La ejecución completa terminó a las 16:38:35 con código 1 en 24 min 53 s. Las 12 coincidencias por archivo y nombre de 381 siguen presentes: 4 de decisiones 339, 2 de ContinuityLab 099, 3 de comprobación de fecha 337 y 3 del consumidor de intenciones 322. No desapareció ningún fallo anterior en este corte.

| Fallo adicional | Evidencia fuera de la batería |
| --- | --- |
| `task-focus-followup.test.ts`, huella QA130 | La huella antigua no corresponde al texto «Datos de prueba». La ficha pasó el recorrido de navegador y la prueba exacta renovada pasa 8/8 en 329 R4. El corte global se tomó antes de actualizar la huella. |
| `task-save-outcome.test.ts`, «401 / 404 / 409 / 422 / tiempo agotado» | La prueba original pasa aislada. Al introducir 120 ms en la lectura previa se reproduce `not_sent` en lugar de `uncertain`, porque ambos plazos estaban limitados a 40 ms antes de que el PATCH llegase a su transporte. En la copia de ensayo se separaron la lectura previa, el PATCH y la lectura de verificación. El mismo retraso pasa y la suite focal pasa 65/65. |

Banco `tests/.tmp/u397-JAUTfx`. `inputs.json` fija el corte. `npm-test.log`, `completion.json` y `comparison-397.json` registran totales, salida y clasificación completa. El intento matinal se interrumpió y los intentos restringidos quedaron fuera de estos totales. Los recorridos de navegador son evidencia separada. No se ejecutó otro corte global con los dos cambios de pruebas.
