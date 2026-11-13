# CLAUDE-MIGRATION-VERIFIER-VISUAL · Validación visual, presupuesto de entrada y preparación de la interfaz (informe de entrega · R2)

8/11/2026, Europe/Madrid. Claude B. Dependencia aceptada: `CLAUDE-MIGRATION-VERIFIER-CORE`. El verificador **sigue interno**: no hay pantalla, menú, endpoint, carga de ficheros ni proveedor; no se toca el comparador de capturas, App ni main. Esta unidad reserva `shared/migration-report.ts` (de CORE, aceptado) solo para dos correcciones de maquetación/seguridad halladas aquí; las 24 pruebas de CORE siguen verdes.

## Qué se entrega
| Archivo | Contenido |
| --- | --- |
| `shared/migration-budget.ts` | Presupuesto de entrada PURO (`checkMigrationFiles`, `checkMigrationObjects`, `MIGRATION_BUDGET`): tamaño de cada fichero y del conjunto (sin parsear), después JSON y forma, objetos, filas totales, campos por fila y longitud de cadenas; rechaza con motivo y fichero, nunca trunca, devuelve lo ya analizado solo si cumple. |
| `shared/migration-report.ts` (cambios) | (1) los caracteres de control y de **dirección** (U+202E y similares) se muestran como «‹U+XXXX›» en vez de actuar; (2) las cabeceras de fila de las tablas ya no se parten por la mitad de una palabra. |
| `tests/migration-verifier-visual.test.ts` | 7 pruebas Node: SHA-256 contra vectores publicados y `node:crypto`, canonización, fechas y zonas, presupuesto, medidas reales, coherencia de bytes y neutralización de controles. |
| `tests/e2e/migration-report-visual.spec.ts` | 3 pruebas en Chromium: coherencia servidor/navegador, maquetación a 1440/390/320 en claro y oscuro con contenido arbitrario, teclado y estructura. |
| `coordination/plans/MIGRATION-VERIFIER-UI-HANDOFF.md` | Contrato de la futura interfaz, estados, redacción obligatoria, medidas y tareas con dueño. |

## R2 · representación inyectiva (dictamen `CLAUDE-MIGRATION-VISUAL-independent-294.md`, brief `CLAUDE-MIGRATION-VISUAL-R2-294.md`)
**Problema (F1 de R1, ambigüedad):** un ID con el carácter real U+202E y otro con el texto literal «‹U+202E›» se veían igual en el HTML («id-‹U+202E›-final»). **Corrección:** los propios delimitadores «‹» (U+2039) y «›» (U+203A) también se escriben con la notación («‹U+2039›», «‹U+203A›»), de modo que la notación solo aparece cuando la genera el informe: el carácter real se ve «id-‹U+202E›-final» y el literal «id-‹U+2039›U+202E‹U+203A›-final». Es la elección segura y distinguible; cubre también texto que ya contiene la notación (anidada) y otros controles y caracteres de dirección, no solo U+202E. Se siguen neutralizando controles y dirección, escapando HTML y conservando texto legítimo (bidireccional, emoji, tabuladores); el **JSON y las huellas conservan los datos originales** (no se elimina ningún registro, no se oculta ningún ID ni cambia el emparejamiento).
**Pruebas nuevas:** Node (cuatro IDs —real, literal, anidado y «U+202E» sin símbolos— dan cuatro representaciones distintas, toda notación es una referencia de carácter bien formada, el informe y el JSON conservan los originales y la huella depende del carácter real) y DOM en Chromium (cuatro IDs, cuatro textos visibles distintos, ningún carácter de dirección en el DOM). **Sensibilidad:** con la versión anterior de `shared/migration-report.ts` (R1, restituida después por hash) fallan las dos pruebas nuevas (el DOM mostraba «id-U+202E-final | id-‹U+202E›-final | id-‹U+202E›-final | …», con dos iguales); con R2 pasan.
**Resultados R2:** Node **32/32** (24 de CORE intactas + 8 de esta unidad), Chromium **4/4** (las 3 anteriores sin cambios + la de DOM), `tsc -p .` sin errores en los archivos de la unidad. Sin raíz de producción, sin 4601/4331/4334, sin proveedores y con la red exterior bloqueada. El verificador sigue interno y el traspaso de interfaz es una propuesta, no permiso de montaje ni de apertura de la Fase 4.

## Hallazgos de esta validación (corregidos aquí, en mi propio informe aceptado)
1. **Cabeceras partidas por la mitad de una palabra** (bajo, maquetación): con IDs y cuentas largas sin espacios, la columna de cabecera de la tabla de procedencia quedaba tan estrecha que «Origen» se partía en «Ori/ge/n» (visible incluso a 1440 px). Causa: `overflow-wrap:anywhere` heredado. Corrección: `th{overflow-wrap:normal;word-break:normal}`. **Prueba que falla sin la corrección** (la afirmación «ninguna cabecera con más líneas que palabras» falló en «light 1440») y pasa con ella.
2. **Caracteres de dirección sin neutralizar** (medio, seguridad de presentación): un ID con U+202E, U+2066/2069, U+200E/F o U+061C reordenaba el texto que lo sigue y permitiría suplantar un identificador en el informe. Corrección: se muestran como «‹U+XXXX›»; tabulador, salto de línea, texto bidireccional legítimo y emoji se conservan, y el JSON conserva el dato original. Pruebas Node y de navegador.

## Resultados
- **Node: 32/32** (24 de CORE intactas + 8 nuevas). **Navegador (Chromium headless-shell 1228): 4/4.** `tsc -p .` sin errores en los archivos de la unidad.
- **SHA-256 y canonización:** vectores publicados (FIPS 180-4: vacío, «abc», 448 bits, 896 bits, un millón de «a») y contra `node:crypto` en bordes de bloque (0–200 bytes), Unicode, controles, sustitutos aislados y 80 000 bytes de `ñ`. **No se cambió el algoritmo.**
- **Coherencia servidor/navegador:** el motor empaquetado con esbuild y ejecutado en Chromium da **el mismo JSON, el mismo HTML (con y sin valores) y las mismas huellas** que Node; también los vectores de SHA y 18 resoluciones de fecha-hora (cambio de hora ambiguo e inexistente de Madrid y Nueva York, medias horas de Kolkata y Lord Howe, cuarto de hora de Katmandú, desfases explícitos, ausencia de zona, días imposibles).
- **Maquetación con contenido arbitrario** (proveedor y cuenta de 64 y 160 caracteres sin espacios, confirmante de 160, IDs de 120 caracteres, texto hebreo y árabe, emoji compuestos, caracteres de control y de dirección, `<script>` y comillas, campos de 80 caracteres, 539 filas de origen, 307 ausentes y 223 dudosos): a **1440, 390 y 320 px, en claro y en oscuro**: la página no se desplaza horizontalmente, ningún elemento queda fuera de la ventana (las tablas anchas tienen desplazamiento propio), contraste ≥ 4,5 en texto, notas, avisos y pistas, **cero scripts y cero peticiones externas**, CSP presente. Capturas abiertas y revisadas (informe, dudosos y diferencias a 320, 390 y 1440; `informe-*`, `dudosos-*`, `cambios-*` en `planb-migvis-qMrNmW\shots` de la última ejecución).
- **Teclado y estructura:** los bloques plegables se alcanzan con Tab y se abren con Enter; un `h1`, varios `h2`, un `role="status"`, `lang="es"`, y toda tabla con leyenda o cabeceras.
- **Presupuesto:** cada límite se rechaza con su motivo (`FILE_TOO_LARGE`, `TOTAL_TOO_LARGE`, `NOT_JSON`, `BAD_SHAPE`, `TOO_MANY_OBJECTS`, `TOO_MANY_ROWS`, `TOO_MANY_FIELDS`, `STRING_TOO_LONG`); el tamaño se mira antes de intentar analizar (un fichero enorme con un destino ilegible da `FILE_TOO_LARGE`, no `NOT_JSON`); lo normal pasa y se devuelve ya analizado; nada se devuelve al rechazar.

## Medidas reales (este equipo: Intel i7-1165G7, 8 hilos, Windows, Node 24.14; no son una promesa de capacidad)
| Filas por lado | Entrada | Comparar | Informe + JSON + HTML | JSON / HTML |
| --- | --- | --- | --- | --- |
| 1 000 | 0,4 MiB | 258 ms | 3 ms | 13 / 15 KiB |
| 10 000 | 4,2 MiB | 968 ms | 3 ms | 25 / 30 KiB |
| 50 000 | 21,1 MiB | 4 898 ms | 3 ms | 25 / 31 KiB |
Crecimiento aproximadamente lineal; el informe está acotado por las listas de 200 elementos. Por eso el cálculo debe ir fuera del hilo de la interfaz y ser cancelable (ver el traspaso). No se midió memoria (la medición del montón de Node no era fiable).

## Control causal (11 mutantes → 11/11 detectados; archivos restaurados por hash)
Tamaño de origen, de mapa y total sin comprobar; filas, campos, cadenas y objetos sin comprobar; analizar antes de mirar el tamaño; devolver datos analizados al rechazar; neutralización de controles desactivada; cabeceras de fila partidas (CSS retirado).

## Estado de llegada
| Qué | Estado | Tarea / dueño |
| --- | --- | --- |
| Motor, informe, presupuesto y su validación en navegador | Implementado, **interno** | Esta unidad · Claude B |
| Pantalla «Verificar una migración», Worker, carga de ficheros, confirmación persistida, cancelación | **No existe** | Unidad sucesora de interfaz (Claude A o B, a acordar con Codex) |
| Entrada en la navegación habitual y montaje | **No existe** | Codex coordinador, tras la interfaz y la puerta de Fase 4 |
| Exportaciones reales de HubSpot/Pipedrive | **No hay** (solo ficción) | Fase 3/4, con cuentas y autorización |

## Límites
Solo Chromium (headless-shell 1228) y solo Windows; ninguna otra familia de navegadores. El HTML se ha medido, la interfaz que lo envolverá no existe. `confirmedBy` sigue siendo un nombre declarado. Las medidas dependen de este equipo y de datos con una estructura concreta (contactos con una decena de campos).

## Hashes finales (sha256)
| Ruta | sha256 |
| --- | --- |
| shared/migration-budget.ts | 2b6b6cda291b669a55f5846dd4548fe1221ef772098f369f8c915e30de2c4892 |
| shared/migration-report.ts | efe6ced3f5aba1bea403157854fc98f4bf6f633fbac5b37b27613e91c418e5a5 |
| tests/migration-verifier-visual.test.ts | 42dbca3e7c5155fa66a3757adfb1b2513c06c1841d9c774d5c408a1de05bdd59 |
| tests/e2e/migration-report-visual.spec.ts | 4107c21bdcb4b2c7f988c5fc3c91e329948463b91d99b51a6af0cec37379d34c |
| coordination/plans/MIGRATION-VERIFIER-UI-HANDOFF.md | 0e7a8a3070d9ad58847da24a5c81e49144e9813c079046967754b9ac2abb7305 |
| coordination/reports/CLAUDE-MIGRATION-VERIFIER-VISUAL.md | (este informe) |

`shared/migration-report.ts` aceptado en CORE R2 (sha256 `8a657b83…`); `migration-verifier.ts` y `migration-demo.ts` no se tocan.
R1 presentado (revisado por Codex): migration-report 6a35…, test visual 685f…, spec e2e 087…; budget `2b6b…` y handoff `0e7a…` sin cambios en R2.
