# Encargo para Claude · Kit de Relevo: identidad del importador y recuperación segura

Este texto prepara trabajo futuro; no demuestra que se haya enviado o leído. Fecha: 3/11/2026, Europe/Madrid.

## Objetivo

Conservar la garantía «un solo destino por cápsula» incluso si hay importaciones simultáneas desde instancias distintas del módulo en un mismo proceso. Preparar una corrección revisable y pruebas causales sin presentar el ensayo como recuperación en otro equipo ni como conexión real a HubSpot.

## Primeros pasos y coordinación

1. Lee `AGENTS.md`, `CLAUDE.md`, `COORDINACION.md`, `CONTEXTO-PROYECTO.md`, el informe R2 `coordination/reports/CLAUDE-RESCUE-KIT-116.md`, `coordination/reports/CLAUDE-RESCUE-KIT-QA-136.md`, `coordination/plans/RESCUE-KIT-QA-136-HANDOFF.md` y el último dictamen de Codex sobre 116. Consulta el tablero y comprueba los hashes actuales: los estados de este encargo pueden haber cambiado.
2. El riesgo comunicado por ti está en `server/rescue-capsule.ts`: `activeClaims` es local a una instancia del módulo; otra instancia que comparte PID puede interpretar como obsoleto un reclamo activo. Tu prueba 8 de `tests/rescue-capsule-followup-claims.test.ts` reproduce esa conducta. La aplicabilidad al servidor de ensayo normal y la estabilidad bajo carga de la regresión de 116 deben justificarse con pruebas, no suponerse.
3. Mientras 116 y QA136 estén en `review`, no edites ninguno de sus archivos ni aceptes tus entregas. Si Codex devuelve 116 a `working` por el hallazgo, lee la nota y corrige solo bajo esa reserva. Si QA136 sigue en revisión y su prueba de caracterización debe invertirse, espera la decisión de Codex o coordina una devolución formal: no la cambies a escondidas. No liberes, robes o amplíes reservas.
4. Si la devolución todavía no ha ocurrido, trabaja solo en un encargo nuevo y disjunto (informe y pruebas propias), con ID libre y archivos exactos registrados y reclamados mediante `tools/coordination/board.mjs`; comprueba cada ruta con `check-path`. No modifiques `server/store.ts`, `server/recovery.ts`, `server/app.ts`, `src/App.tsx`, componentes de tareas, pruebas de otro autor o archivos reservados de otro agente.
5. Usa exclusivamente el checkout y este equipo, datos ficticios, raíces nuevas e instalaciones de prueba propias. No uses el ordenador corporativo, perfiles, claves, cookies, credenciales o bases existentes. No uses proveedores o HubSpot; no reinicies demos ni mates procesos ajenos. Sin worktree, dependencias nuevas, commit, push o despliegue.

## Trabajo técnico

### A. Identidad y vida del reclamo

- Diseña una identidad de propietario para cada instancia/importación que no confunda dos módulos o hilos con el mismo PID. Define cuándo existe una importación activa, cuándo puede recuperarse un reclamo y cómo se verifica que el reclamo que se modifica sigue siendo el mismo.
- Trata como ambiguo lo que no pueda verificarse: un PID vivo, una recuperación de otro propietario, un marcador incompatible, error de lectura o un destino posiblemente publicado no deben permitir otro destino a ciegas. Un PID o un token por sí solos no prueban identidad entre equipos ni protegen frente a escritores no cooperativos; no prometas esas garantías.
- Conserva los casos de R2: excepción tras publicar, fallo al confirmar, reclamo conservado, recuperación exclusiva, revalidación bajo exclusión, destino publicado/no publicado/dudoso y barrido que respeta trabajos activos. No borres destinos publicados ni `takeover` a ciegas. Mantén los mensajes de error fieles a lo que se conoce.
- Analiza también el ciclo de vida de `.takeover`: proceso que muere durante la recuperación, reclamo ilegible y recuperación simultánea. Si no se resuelve automáticamente con seguridad, mantén el bloqueo y describe el paso de recuperación verificable, sin instrucciones de borrar a ciegas.

### B. Pruebas causales y regresiones

- Codex repitió QA136 en una proyección aislada con los archivos cotejados: 24/25. En la ronda 16 de la prueba de carrera, una importación terminó correctamente y la otra devolvió un `EEXIST` sin tratar, que la prueba rechazó. Esto no demuestra dos destinos ni identifica la causa. Investiga el intercalado y el contrato de error con barreras; conserva la evidencia, sin relajar el oráculo para obtener una suite verde.
- Reproduce con barreras deterministas dos instancias de módulo que comparten PID: una mantiene el reclamo activo y otra intenta importar. Tras la corrección, la segunda debe rechazar sin alterar reclamo ni staging, y al terminar la primera debe existir exactamente un destino.
- Repite el escenario con procesos reales de PID distintos y con dos recuperadores de un reclamo huérfano. Evita convertir una carrera probabilística en prueba determinista: coordina pasos con barreras y explica qué intercalado se consigue.
- Revisa la prueba `CARRERA` de 116 que usa hilos con PID compartido: elimina su supuesto incorrecto mediante procesos o un diseño explícito; conserva el oráculo de un destino, no cambies únicamente expectativas. Demuestra que las pruebas nuevas fallan por la causa en la R2 anterior y pasan en la corregida.
- Prueba fallo después de `rename`, error al confirmar el reclamo, cierre de proceso antes y después de publicar, caso dudoso, reclamo ya importado y reintento; sin reenviar efectos externos ni borrar datos existentes.
- Prueba `sweepStaging` frente a propietario activo y carpeta ajena identificada por tus propias pruebas. No enumeres ni limpies las carpetas de otros agentes. Usa una raíz temporal propia para evitar los tests de listado sensibles al directorio compartido. Si ejecutas las baterías antiguas, usa una proyección aislada y `--test-concurrency=1`.
- Si mantienes la prueba 8 de QA136 como caracterización histórica, deja explícito que falla tras la corrección hasta que su reserva permita invertirla. No elimines aserciones para conseguir una suite verde y no toques `tests/independent-rescue-claim.test.ts`: es de Codex.

### C. Producto e integración

- Prepara un traspaso con estados y pasos para el usuario ante publicación confirmada, incierta o bloqueada, sin instrucciones destructivas. Distingue integridad, cifrado y autenticidad; no atribuyas autoría a un hash.
- La cápsula y CRM actuales son ficción en este equipo, con máximo de tareas y sin relaciones observadas. No declares RTO/RPO, restauración en otro ordenador, compatibilidad de otros SO, HubSpot real o datos reales sin evidencia nueva y un encargo apropiado.
- Si una integración futura necesita nuevas rutas o cambios en App, servidor o componentes de otros agentes, indica exactamente cuáles y espera una unidad reservada; no montes nada por este encargo.

## Entrega

Registra fuentes y hashes de cada corte, comandos y resultados, incluidos fallos de arnés y pruebas antiguas que no repetiste. Ejecuta las pruebas pertinentes de 116, 106, 115 y la QA corregida en proyecciones aisladas; declara navegador, capturas realmente inspeccionadas y límites. Si un fallo exige otras rutas, registra la necesidad sin invadirlas. Presenta por `submit` y no te autoaceptes. Avisa mediante el tablero y, solo si ya existe un canal autorizado y operativo, comunica el dictamen; no afirmes que Codex lo ha leído sin respuesta.
