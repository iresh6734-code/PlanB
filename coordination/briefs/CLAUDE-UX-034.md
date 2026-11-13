# Prompt para Claude · corrección UX032 y siguiente unidad UX034

Trabaja en D:/AI/Plan-B-CRM-v2.1/source. Continúa en tu única sesión, sin subagentes, commit, push, despliegue o autoaceptación. Lee AGENTS.md, COORDINACION.md y CONTEXTO-PROYECTO.md. Consulta el tablón antes de editar; sus reservas siguen durante la revisión. Usa check-path antes de editar cada archivo. No edites board.json directamente ni archivos de otro encargo.

## Fase 1 · Corregir CLAUDE-UX-032

Tu entrega está devuelta a working con su reserva conservada. Lee coordination/reviews/CLAUDE-UX-032-independent-codex.md y `node tools/coordination/board.mjs brief CLAUDE-UX-032`. Si el estado ha cambiado, respétalo: no escribas sobre una presentación en review ni dupliques otra sesión.

La reproducción causal es: abrir el combobox habilitado con c1 seleccionado, pasar disabled:true y activar la opción c2 aún visible. Se llama onChange(c2). El consumidor actual no pasa disabled: es un fallo del contrato reutilizable, no un bypass de permisos demostrado en la app.

Cierra/oculta la lista al deshabilitar y bloquea efectivamente cualquier selección. Añade regresiones enabled→disabled con lista abierta, ratón/teclado y rehabilitación sin reapertura antigua. Conserva selección por ID, homónimos, búsqueda, borradores y permisos. Trabaja únicamente en los archivos ya reservados de UX032. Ejecuta las pruebas focales necesarias y typecheck; actualiza tu informe con resultados reales y hashes. Presenta otra vez UX032 con submit y deja de editar sus archivos hasta revisión. No hace falta repetir por rutina toda la batería de 620 pruebas y 32 E2E.

## Fase 2 · CLAUDE-UX-034: ficha de cliente robusta con teclado

El encargo está registrado ready, separado de UX032 y de CODEX-REL-033. Puedes comenzarlo tras presentar la corrección anterior, mientras Codex la revisa. Consulta `node tools/coordination/board.mjs brief CLAUDE-UX-034` y reserva con `node tools/coordination/board.mjs claim CLAUDE-UX-034 claude`. Si hay otra sesión o colisión, no tomes su trabajo.

Objetivo: que Actualizar datos guardados, Guardar próxima acción y Completar/Reabrir acciones internas conserven un foco previsible, impidan duplicados y comuniquen fallos sin inducir a repetir una acción ya realizada.

1. Reproduce primero los problemas con el código actual: ya existe una recuperación parcial del foco. No reescribas funciones que funcionan ni presupongas que todo R08 está pendiente en esta ficha.
2. Durante una operación conserva el foco en el control que la inicia cuando sea viable. aria-disabled debe tener bloqueo real en los handlers. Impide también dos activaciones antes del siguiente render con una guarda síncrona, y evita peticiones incompatibles en paralelo. Mantén bloqueo real por permisos y entradas inválidas; aria-disabled por sí solo no protege nada.
3. Tras desaparecer una fila completada/reabierta, coloca el foco en un destino estable y comprensible después de actualizar el DOM. No robes el foco si la persona lo movió, ni intentes restaurarlo tras cerrar/desmontar. Si guardar vacía el formulario, evita perderlo al pasar el botón a inválido.
4. Distingue mutación fallida, mutación correcta y mutación correcta con recarga fallida. Reintentar la recarga no debe repetir una mutación ya completada. Conserva los IDs de operación, sourceKey, versiones, roles, hora local, borradores y confirmación de cierre. No cambies el comportamiento de Preparar seguimiento ni las operaciones de archivos.
5. Añade pruebas causales con promesas diferidas para pendientes, doble activación, fallos y recarga. Comprueba document.activeElement con navegador/DOM real; un arnés de hooks no demuestra foco. Incluye permisos de solo lectura y cierre durante pendiente. Mantén las pruebas y aserciones existentes.

### Únicos archivos de escritura de UX034

- src/CustomerDossier.tsx
- src/customer-dossier.css
- tests/customer-dossier-focus.test.ts
- tests/e2e/customer-dossier-focus.spec.ts
- coordination/reports/CLAUDE-UX-034.md

Lectura mínima adicional: src/components.tsx, src/CustomerFiles.tsx, shared/customer.ts, tests/ui-journeys.test.ts y la receta aislada de coordination/reports/CLAUDE-FIX-014.md. Esos archivos adicionales son solo lectura. No edites el Modal compartido, CommercialWorkspace, el combobox ya presentado, otros tests, servidor, App/TeamApp, tools/releases, package/lockfile, contexto o panel. Si necesitas ampliar la lista, registra block y explica el archivo y la causa; no amplíes la reserva por tu cuenta. Este encargo resuelve el alcance de ficha, no todo R08 global.

### Validación y entrega

Datos ficticios nuevos, red externa bloqueada, salida y puerto de pruebas aislados en tests/.tmp/claude-ux034. No pruebes contra las instalaciones4331/4334 ni sus bases. E2E en serie, un trabajador y un navegador; verifica escritorio y móvil. Nunca npm run build: usa una salida Vite temporal. Typecheck y pruebas focales al finalizar; amplía solo si hay evidencia de regresión. No instales dependencias ni repitas baterías completas por rutina. Codex mantiene REL033 en sus herramientas y pruebas Node, sin Vite/E2E simultáneos.

No uses proveedores, cuentas, secretos, perfiles/ventanas personales o recursos corporativos. Las pruebas aisladas de navegador con fixtures están dentro del encargo; no autorizan manejar la sesión real del usuario.

Informe con reproducción previa, cambios, comandos, resultados, hashes y límites reales. Distingue arnés, DOM, Chromium y lector de pantalla; no declares comprobado lo que no ejecutaste. Presenta con `node tools/coordination/board.mjs submit CLAUDE-UX-034 claude --note "Cambios, pruebas y límites"` y deja de editar hasta revisión de Codex. No encadenes una tercera unidad por tu cuenta.

## Estado y continuidad de esta planificación

Prompt preparado por Codex a petición del usuario; no acredita envío ni ejecución de Claude. UX032 y REL033 siguen devueltas, pendientes de corrección y nueva revisión. La memoria general y el panel están reservados por CODEX-CONT-034 en review al preparar este documento: no se modifican bajo una reserva ajena. Registrar este nuevo encargo allí cuando su responsable libere o actualice esa reserva.
