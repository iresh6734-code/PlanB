# Conciliar las huellas del tablón antes de aceptar

13 de noviembre de 2026, Europe/Madrid. Ejecutar `node tools/coordination/board.mjs reconcile` o añadir el ID de una tarea reservada en revisión. El resultado JSON incluye la revisión del tablón, el número de entregas examinadas y el archivo, agente, huella presentada y huella actual de cada diferencia. Identifica archivos ausentes y aquellos que el tablón no puede comprobar. Es una lectura puntual. Una lista vacía acredita las huellas reservadas leídas, sin dictamen sobre cambios en archivos externos a la entrega.

## Corte anterior a reabrir Grafito

El tablón estaba en revisión 2439. Se examinaron 224 entregas y se encontraron 11 diferencias.

- CODEX-INTEGRATION-058 · tests/e2e/continuity.spec.ts
- CODEX-RELATION-LABEL-063 · src/components.tsx
- CODEX-HISTORY-064 · src/ChangeHistory.tsx
- CLAUDE-OPUS-UI-OPERACIONES-CLARAS · src/operaciones-claras.css, src/HomeOverview.tsx
- CLAUDE-FABLE-UI-GRAFITO · src/planb-grafito.css (ausente), src/App.tsx, src/ContinuityHome.tsx, src/main.tsx, tests/design-tokens.test.ts, coordination/reports/CLAUDE-FABLE-UI-GRAFITO.md

Grafito volvió a working conservando su reserva. El informe de Fable reconoce el cambio posterior. El arranque importa src/faro.css, que no figura entre los archivos de la entrega anterior. Se pidió un encargo adicional para rutas nuevas o renombradas, acuerdo con los dueños de los E2E y de HomeOverview, y pruebas focales sobre la versión que vuelva a presentar. La versión y las huellas anteriores se conservan en grafito-before-revise.json del banco privado.

Operaciones claras continúa en revisión. Fable atribuye al menos un cambio en HomeOverview a su sesión. Los tres encargos Codex 058, 063 y 064 conservan sus reservas para cotejar la versión vigente. HOST-MOUNT de Opus coincide en sus dos archivos reservados. Se comprobó por lectura que los dos montajes DateCheck siguen en main/runtime y que App renderiza DateCheck y DecisionReview. La revisión integrada de App y 318 continúa pendiente.

La prueba nueva cubre diferencias, ausencia, ruta que dejó de ser un archivo, filtro por ID, argumentos inválidos y bytes del tablón intactos. Las siete pruebas de la CLI y el núcleo pasaron con temporales en D: y permiso de junction. El control en copia sin el comando falló al invocarlo. La suite histórica de navegador no se verificó: su ruta fija 4346 fue bloqueada por el entorno. Esta unidad cambia la CLI y sus pruebas.
