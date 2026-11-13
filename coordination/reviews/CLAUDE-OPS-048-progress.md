# OPS048 · Revisión de progreso independiente

30/10/2026, Europe/Madrid. Usuario comunica que Opus trabaja y pide seguimiento paralelo. **OPS048 presentó y fue devuelta con reservas por el P2 reproducido abajo.** Codex respeta sus seis archivos y desarrolla SAFE049 en siete archivos propios disjuntos. No se tomó navegador o sesión del autor ni se enviaron fuentes a un proveedor.

## Corte probado

Snapshot `tests/.tmp/safe049-7c40dc4c-3ca7-4adc-8752-38dd18a24873/source`. Hashes de cada entrada en ../manifest.json. Incluye ContinuityHome, ContinuityOperations, Node y E2E del autor existentes en ese momento. CSS solo leído estáticamente en live; no se compiló en esta revisión. El archivo de informe aún no existía al capturar, se leyó al presentar. La fuente live puede seguir cambiando: cotejar antes de usar esta revisión como evidencia de una versión posterior.

- **10/10 Node del autor ejecutadas por Codex**, sinTODO/skips; transporte ficticio y arnés de hooks, no React DOM. Log ../opus-progress.log.
- **Typecheck del snapshot completo correcto**, incluyendo módulo nuevo y el trabajo en curso de Opus. No E2E/build nuevos por Codex; autor conserva su ventana de navegador.
- Lectura estática: peticiones GET, clave estable sin sondeo adicional, cancelación al cambiar clave/desmontar, separación radar/capturas históricas, vistas previas y tipos explícitos; CSS contenido a continuity-operations. Son observaciones del corte, no prueba de todos los errores o accesibilidad real.

## [P2] Una captura retirada no invalida una comparación en vuelo

Reproducido por Codex **solo en una copia temporal del test del autor**, sin modificar sus fuentes:

1. ComparePanel con a:1 y b:2 en el historial; seleccionar ese par y pulsar Comparar.
2. Con petición pendiente, actualizar captures retirando b:2 (por ejemplo retención/actualización de contexto) y mantener a:1 y otra captura nueva.
3. Se ve correctamente «ya no está en el historial» y se conserva la selección, pero no se cancela/invalida req.
4. Resolver la petición vieja con el resultado correcto del par original.
5. Aparece «Resultado de la comparación» y siguen activos los controles de paginación junto al aviso de captura no disponible. La aserción de que no reaparezca el resultado falla.

**Causa:** ComparePanel calcula missing y bloquea Comparar, pero useQuery usa solo JSON.stringify(req); no incorpora la disponibilidad actual del par ni retira una petición/resultados cuando desaparecen sus IDs. La comprobación de identidad valida contra req, que tampoco cambió. La prueba actual de captura desaparecida modifica el historial antes de realizar una consulta, por lo que no cubre esta carrera.

**Corrección propuesta al autor dentro de su reserva:** invalidar/abortar la consulta y retirar datos/error/paginación al dejar de existir un miembro del par; conservar la selección explícita y el aviso, sin elegir automáticamente una captura nueva. Descartar la respuesta tardía aunque el transporte ignore abort. Añadir casos con petición en vuelo y con resultado ya recibido; volver a seleccionar un par válido inicia desde offset0. No rebajar la comprobación de identidad ni introducir polling.

Reproducción: `source/tests/opus-progress-adversarial.test.ts`; resultado esperado-fallido en ../opus-adversarial.log. Es un caso nuevo del revisor, no una prueba fallida atribuida a la suite entregada por el autor. No permite inferir edición remota o pérdida de datos: el fallo es presentar una consulta obsoleta como resultado utilizable.

## Puerta de revisión

Tras observar submit se leyó el informe y se cotejaron los seis hashes: todos coinciden con la presentación y los fuentes que prueban el P2 siguen intactos. Componente `e811b30d3812b5341ca18fd002292e1d39d512b8256a60caf2a874f0e4c8b683`; Node `955686ed9b469b9d3cb7f8dc7ea3c09e8b69648bee7242f2ce4eee5485bae19d`. Se registró revise con reproducción/corrección requerida en la nota oficial del tablón. OPS048working conserva sus seis reservas; no aceptación.

Los105 focales y4+8E2E del informe son resultados atribuidos al autor; no se repitieron por Codex y no neutralizan el caso nuevo. No se ha enviado aviso automático a la sesión de Claude: informe y nota del tablón son locales, sin acreditar lectura. La revisión continúa dentro de este chat cuando exista una nueva versión; no acredita vigilancia permanente.
