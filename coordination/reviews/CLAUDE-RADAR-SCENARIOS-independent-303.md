# SCENARIOS · Revisión independiente303

9 de noviembre de 2026, Europe/Madrid. Dictamen: corrección acotada antes de aceptación. No se han editado las cuatro rutas de Claude.

## Versión y banco

- `src/CommitmentRadar.tsx`: `6ad5c443819a69d19dafc72bd46ec8de1c746e427ecf5bacfd3d762243336881`
- `src/commitment-radar.css`: `4023477f0f544c54e831f5a16943b0365fcc7b04a5ff9760a65ada2035baad0f`
- `tests/e2e/commitment-radar-scenarios.spec.ts`: `f2cd863bd289590f58acd53587dd82d90b6be8d9815c944662ac61b2d657a4f6`
- `coordination/reports/CLAUDE-COMMITMENT-RADAR-SCENARIOS.md`: `da2c2cd210e595d9a4db9ce833217857065dd7722172fc111cf48c7a735bf882`

Banco tests/.tmp/scenarios303-OGYLtc. Copia del banco de Radar R2 aceptado, sustituyendo solo estas cuatro rutas y los módulos aceptados de simulación e informe; manifest.json conserva procedencia y hashes. Tipos focales sin errores. Chromium de caché y Playwright del proyecto, un trabajador, cero reintentos, producción, datos ficticios nuevos, bloqueo de red externa. Browser plugin not available.

Se ejecutaron36casos:35pasan y1falla. Pasan11/11E2E de la autora sin cambiar aserciones,19/19deRadarR2,3/3sondas independientes anteriores,1/1de401real y el control temporal nuevo. El caso nuevo de antigüedad falla en su aserción de texto, después de abrir y accionar el formulario. No hay skips ni flakies en este pase.

## F1 · Evidencia antigua tratada como actual al llevar una alternativa

Prioridad media. Abrir installation-north a 2026-11-08T12:01Z muestra una alternativa con fecha propuesta y «No faltan datos de evidencia». Sin cambiar copia, revisión ni detalle, el reloj inyectado avanza25horas a 2026-11-09T13:01Z. Se vuelve a la ventana y se pulsa «Llevar al formulario de decisión». El render mantiene el texto de confianza, la fecha propuesta y la hora sin día del cálculo anterior. El formulario recibe la fecha anterior. El recibo time-before-after.json conserva ambos textos y formulario en hoy240-run-21cfa8d9/cases/001-57fec2da.

El control cierra y reabre la misma ficha con ese mismo reloj avanzado: muestra «Fecha propuesta: ninguna» y explica las24horas. El motor aceptado ya distingue evidencia antigua. La UI conserva useMemo dependiente solo de detail; bring usa la alternativa anterior y staleFrom solo compara revisión. Al accionar se necesita revalidar la vigencia o explicar explícitamente la antigüedad antes de confirmar.

La prueba no envía decisiones; no demuestra escritura no autorizada ni duplicado ni cambio externo. La asignación sigue siendo una decisión humana. El defecto es la confianza y propuesta temporal que recibe esa persona, no una nueva prohibición general de asignar con evidencia incompleta.

## Alcance favorable y límites

Las pruebas de autora acreditan simulación sin envíos, formulario único y confirmación, dos pestañas,409con borrador conservado, acuse perdido con clave estable, cronología/HTML/JSON escapados, reinicio y cierre, teclado y tamaños1440/390/320. Se abrió la captura alternativas-320.png: alternativas apiladas y botón legible sin desbordamiento en el estado capturado. La exportación HTML conserva una tabla de cinco columnas muy comprimida en320; se tratará como mejora aparte en el generador aceptado y no amplía esta devolución. No se probó lector de pantalla ni navegador Edge. Este banco es aislado: no acredita montaje en4601 ni piloto de proveedores.

Los hashes de las cuatro rutas compartidas se cotejaron antes y después del banco completo. El control privado causal y sus incidencias se registrarán por separado si termina; no sustituyen el resultado35/36. Siguiente paso: autora corrige F1 en sus cuatro rutas, aporta regresiones sensibles y presenta nuevas huellas. Codex revisará esa versión y conservará las reservas mientras tanto.

## Control causal privado

scenarios303-causal-hJOH85 no llegó a ejercer el producto: EPERM al crear la junction del arnés, un caso falló en preparación y otro no se ejecutó. Se repitió el mismo comando con permiso para el arnés propio. scenarios303-causal-YETpDa pasó2/2, sin retries ni skips, con las mismas aserciones y una modificación exclusiva en la copia privada: incluir el reloj en las dependencias del cálculo. Se restauró CommitmentRadar.tsx a6ad5c443… por hash. Esto confirma la dependencia temporal del texto; no se propone ese parche como solución completa, pues no demuestra que se corrijan fecha trasladada ni confirmación de borrador. Las fuentes compartidas no se tocaron.

## R2 · Corrección aceptada

9 de noviembre de 2026, Europe/Madrid. Cuatro huellas actuales:

- `src/CommitmentRadar.tsx`: `e3b0bec2a37c87c118d42f8a8485378fbee2ee1e918a90a4c9135a39bf1dc08a`
- `src/commitment-radar.css`: `4023477f0f544c54e831f5a16943b0365fcc7b04a5ff9760a65ada2035baad0f`
- `tests/e2e/commitment-radar-scenarios.spec.ts`: `aa7c866300aabc18bfa400e931027fb20b955d26860bb22935dd35a5869e8efa`
- `coordination/reports/CLAUDE-COMMITMENT-RADAR-SCENARIOS.md`: `acb11e63707f1e222629f2cc64127bf5d7ea41ae225924479db0ddff065c033d`

Banco scenarios303-r2-XKD3Oq:40/40Chromium en219,64s y tipos focales0, un trabajador, sin retries/skips/flakies.15casos de SCENARIOSR2,19regresionesRadar,3sondas anteriores,2sondas originales303copiadas sin cambiar y401real. Los dos casos que aislaban llevar tras25h y reabrir con el reloj avanzado pasan ahora. Las siete fuentes/probes de arnés y cuatro presentadas se conservaron porhash; el manifiesto completo identifica la procedencia.

El banco fija simulador e informe previamente aceptados desde303. No adopta shared/commitment-report.ts305review ni pasaporte308review. Son combinaciones pendientes de candidata. Red externa bloqueada, producción, SQLite ficticia y procesos propios del arnés. Browser plugin not available; Playwright y Chromium de caché existentes. Se abrió alternativas-320.png: hora completa con día, datos y botones legibles en el estado capturado.

La corrección recalcula con clock() en bring y antes de enviar un borrador derivado de alternativa. Si cambia la fecha propuesta o faltantes, retira la confianza anterior, actualiza la explicación, desmarca confirmación y no envía. Mantiene lo escrito a mano y solo sustituye valores generados sin editar. El control de evidencia vigente conserva un envío normal. El caso de25h permite una decisión humana posterior con fecha y confirmación explícitas; no convierte falta de datos en una prohibición general.

F1 queda cerrada. No se modificaron fuentes de autora desde este chat. Las mutaciones y repetición3/4con versión anterior que declara autora no se repitieron aquí; la sensibilidad original35/36 y su control causal privado siguen documentados arriba. No se probó lector de pantalla ni montaje en App/4601, ni proveedor real. Se acepta el componente y sus pruebas sobre el arnés; montajeRadar y combinación305mantienen sus propias puertas.
