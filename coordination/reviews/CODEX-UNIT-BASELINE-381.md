# 381 · La batería global baja de trece a doce fallos conocidos

16/11/2026, Europe/Madrid. Se congeló un corte de 837 fuentes y 270 archivos de pruebas TypeScript. Incluye G6, los casos de servicios de 379 y la identidad de copia de 378. Se reusaron las mismas referencias y archivos auxiliares de 377. El banco dispone de temporales nuevos, bloqueo de red externa y dependencias locales existentes.

| Resultado | Corte 377 | Corte 381 |
| --- | ---: | ---: |
| Casos | 3.050 | 3.056 |
| Correctos | 3.032 | 3.039 |
| Fallos | 13 | 12 |
| Omitidos | 1 | 1 |
| TODO | 4 | 4 |
| Cancelados | 0 | 0 |

Los doce fallos coinciden por archivo y nombre con 377. El caso G6 obsoleto desaparece y pasa su sustituto, que verifica una lectura válida tardía durante el bloqueo. Pasan los seis casos añadidos, tres de servicios y tres de identidad de copia. El proceso termina con código 1 por los fallos conocidos. Las 837 fuentes congeladas conservan sus huellas al cierre.

## Fallos pendientes

| Unidad | Fallos | Alcance |
| --- | ---: | --- |
| 337 | 3 | Ventana mínima, protección de compromisos y cancelación al calcular escenarios |
| 339 | 4 | Identidad de alternativa, identidad de acta y atribución de retrasos |
| 099 | 2 | Identidad de captura del laboratorio |
| 322 | 3 | Cancelación antes del despacho, 401 tardío y asociación de tarea e intento |

La corrida duró 33 min 18 s. Se observó progreso de los procesos durante las pruebas de copia y recuperación, incluidas las carreras de 20 rondas; se esperó al mismo job hasta su salida. La duración no es un ensayo controlado de rendimiento. `npm test` ejecuta los archivos TypeScript. Los bancos .mjs del iniciador y las pruebas de navegador tienen sus propios informes. El corte antecede a las correcciones 382 y 384 del empaquetado.

Evidencia en `tests/.tmp/u381-kzpZvp`: `inputs.json`, `npm-test.log`, `completion.json`, `classified.json` y `comparison-381.json`. Datos ficticios. La ejecución no cambia una instalación.
