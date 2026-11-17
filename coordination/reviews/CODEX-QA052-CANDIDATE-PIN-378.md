# 378 · QA052 verifica la huella vigente del constructor

16/11/2026, Europe/Madrid. Se cotejaron los resultados de los bancos ejecutados el 15/11/2026 y se actualizó la presentación. El constructor comprobado tiene SHA-256 `9719765673729c44cad2318969995d22e5506d968ab4e2efe586d46a0b292731`. Coincide con REL046 en revisión y con la candidata 377. La comparación por bytes con la última edición auditada `ae74ce22ea6a2ed14cc78f1b5735c763b937aa1a7199f9875764eba9a0ef2935` muestra un solo cambio: `lstat` comprueba la entrada de la raíz antes de interpretar que falta. Así una junction presente con destino ausente se rechaza antes de compilar.

Se actualizó la huella explícita en el test adverso. En modo estricto sigue exigiendo la versión presentada. También compara la copia del arnés con el script seleccionado en ambos modos. El modo alternativo conserva la identificación de las cuatro versiones históricas y muestra el SHA completo de una copia distinta. Los demás oráculos del archivo se conservaron.

| Comprobación | Resultado |
| --- | --- |
| Huella estricta, constructor vigente | 1/1 |
| Huella estricta, copia anterior en banco desechable | Falla 1/1 por el SHA exacto de REL046 |
| Modo alternativo, copia anterior | 1/1 e identificación explícita de SOURCE-CASE089 |
| QA052, custodia, cliente HTTP y ASSETS057 | 67/67, cero skips y TODO |

Banco `tests/.tmp/qa378-vODQLW`. Prueba adversa SHA-256 `5227a01dabd710db19e528b6a42d976685ac825c31f228d32531c4b1080559de`. El control negativo cambia solo el constructor en la copia desechable y lo repone antes de la batería focal. Las comprobaciones de junctions sí se ejecutaron. La creación de symlinks de archivo sigue fuera de la capacidad del equipo y su rechazo no queda verificado.

## Batería global de la candidata 377

`npm test` en `tests/.tmp/u377-9f8cDv` terminó con código 1. Se ejecutaron 268 archivos TypeScript: **3.050 pruebas, 3.032 correctas, 13 fallos, una omitida y cuatro TODO**. Las trece parejas archivo/nombre coinciden con 369, sin fallos nuevos ni desaparecidos. Las siete pruebas añadidas corresponden al cliente HTTP. Los fallos se mantienen en decisión de fecha (4), laboratorio (2), transición de protección del App (1), planificación de fecha (3) e intenciones de tarea (3). `classified.json` conserva el detalle.

La batería global parte de las fuentes congeladas de 377, con archivos auxiliares y referencias históricas de 369. El test adverso exclusivamente .mjs se ejecutó en el banco focal. El resultado global no acredita los cambios posteriores de interfaz ni la elegibilidad de la candidata. Datos ficticios, red externa bloqueada y sin intervención en la app de 4331.
