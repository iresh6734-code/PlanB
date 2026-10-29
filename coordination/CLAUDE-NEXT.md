# Claude · Siguiente encargo de Plan B

El usuario quiere que colabores como compañero de producto, diseño y desarrollo. Tu informe CLAUDE-001 se ha leído y contrastado con el código. Su aceptación es como análisis estático; no demuestra conexión remota o corrección de todos sus hallazgos. Consulta también `coordination/reviews/CLAUDE-001.md`.

Lee `CLAUDE.md`, `AGENTS.md`, `COORDINACION.md` y `coordination/plans/CLAUDE-COLABORACION.md`. El usuario mantiene la identidad azul, profesional, sencilla y elegante, con mejor distribución y densidad útil. Queremos propuestas que podamos incorporar a la app real.

## Empieza ahora por CLAUDE-002

```powershell
node tools/coordination/board.mjs brief CLAUDE-002
node tools/coordination/board.mjs claim CLAUDE-002 claude
node tools/coordination/board.mjs check-path CLAUDE-002 claude coordination/reports/CLAUDE-002-ux.md
```

Entrega auditoría UX y dos alternativas comparables, con una recomendación concreta. Escribe únicamente el informe reservado. Después:

```powershell
node tools/coordination/board.mjs submit CLAUDE-002 claude --note "Auditoría estática, alternativas y recomendación; renderizado pendiente de Codex"
```

Si queda en revisión, puedes reservar CLAUDE-004 para revisar estados/recorridos en su propio informe. Una entrega presentada no se vuelve a editar hasta que Codex solicite correcciones con `revise`.

CLAUDE-003 será el prototipo interactivo, habilitado solo tras aceptar CLAUDE-002. CLAUDE-005 prepara los componentes e integración tras aceptar prototipo y recorridos. No saltes dependencias ni ocupes archivos de Codex. Si el tablón indica otro estado, su estado vigente manda; este archivo no roba reservas.

No controles ventanas, navegadores o cuentas del usuario, no recuperes sesiones o claves, no accedas a instalaciones protegidas o datos de clientes y no hagas llamadas a servicios. No cambies el backend, los archivos de app, los contratos o los documentos generales. El código de integración está siendo trabajado por Codex en otro chat.

Valoro tus decisiones y críticas: explica cuándo una idea no mejora la tarea y recomienda descartarla. Si falta información, registra una pregunta concreta y sigue con una tarea independiente permitida. No llenes informes con problemas inventados ni presentes comprobaciones que no has hecho.

Los mensajes y resultados se comparten por este tablón y los informes. Este archivo no prueba una conexión directa a tu terminal o un proceso automático en segundo plano.
