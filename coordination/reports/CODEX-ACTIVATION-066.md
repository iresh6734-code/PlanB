# ACTIVATION066 · Activación guiada ligada a la revisión examinada

30/10/2026, Europe/Madrid. Codex. **9/9 API,11/11 componente y7/7 navegador correctos; typecheck/Vite, seis bundles y162/162 Node de integración.** Una mutación temporal de la guarda API falla causalmente0/1. Fuentes presentadas para revisión independiente, sin autoaceptación o instalación. La corrección del diagnóstico inicial siguiente forma parte del dictamen.

## Corrección del diagnóstico inicial

La primera lectura de Preparation aislada sugirió que mostraba la especificación activa mientras el servidor activaba la candidata. Al seguir el recorrido hasta App.tsx línea141 se comprobó que el padre ya pasa state con la candidata resuelta. **No se confirma esa confusión en el flujo normal de la app anterior.** Se comunicó expresamente esta corrección al usuario antes de seguir. Los tres casos que fallan con el componente anterior usan props AppState sin adaptar: son defensa adicional de su contrato aislado, no prueba de un fallo del recorrido real anterior.

La mejora confirmada y central es otra: el POST antiguo /api/activate recibe solamente reviewed:true, sin identidad de la preparación examinada. La nueva activación guiada muestra un preview autoritativo y liga la casilla a una revisión calculada en el servidor. Si cambian candidata, esquema, datos, historial o bloqueos antes del commit, el endpoint nuevo responde409 antes de activar. No se afirma que el endpoint legado quede protegido por este contrato nuevo: se conserva por compatibilidad y la UI nueva no lo usa.

## Diseño implementado hasta este corte

GET /api/v4/activation-review y POST /api/v4/activate-reviewed registrados por server/v4.ts, archivo libre reservado previamente. El contexto hash incluye candidata completa y estado activo relevante, registros/historial y bloqueos. El preview devuelve objetivo, procedencia, esquema/reglas, generación/reconciliación y recuentos; retira arrays de registros y relaciones del snapshot, sin fichas individuales.

Commit valida reviewed:true/revisión exacta y comprueba/activa de forma síncrona, sin await entre cotejo y Store.activate. Mantiene la validación de Store, consentimiento anterior de sustitución y límites de sesión de continuidad; también bloquea devolución en curso. No se modifica Store, app.ts, Recovery o fuentes de Claude. Modo runtime independiente excluido de este flujo de preparación.

Preparation muestra el preview del servidor en el paso de revisión. preparationTarget también resuelve candidatas en el componente si recibe props sin adaptar, incluyendo spec:null/error sin fallback activo. Casilla ligada a revisión y contexto de carga, respuestas anteriores descartadas aun ignorando abort, refresh explícito retira aprobación.409 retira casilla, vuelve a consultar y no activa por reintento automático.404 de un servidor antiguo bloquea el flujo nuevo, sin degradar a la activación no ligada a revisión.

La tarea de preparación usa referencia síncrona contra doble acción. El manejo de error de acción y refresh evita avanzar paso/abrir workspace si no se confirma la operación y actualización; el fallo de ambos se maneja sin rechazo abandonado. Cancelar/navegar no garantiza deshacer una acción ya recibida por el servidor. El guard revisado protege el intervalo dentro de este proceso Node; no es una transacción distribuida o un mecanismo contra escrituras ajenas directas en SQLite.

## Evidencias disponibles antes del cierre

- tests/.tmp/activation066-api.log:9/9, sin skipped/TODO. Preview candidato sin fichas, commit exacto no reutilizable, cambios de schema/datos rechazados, candidata nula/fallida, sustitución con edición posterior, sesión/devolución, auth/Host/Origin/no-store/malformed/runtime. Un microtask programado por el test corre después de la activación síncrona; no se invoca proveedor.
- tests/.tmp/activation066-ui.log:11/11, sin skipped/TODO. Componente real con hooks/transportes controlados, no React DOM: objetivo, aprobación/contexto/refresh, doble click,409/404, éxito/error tardíos, desmontaje y fallo de refresh sin avance.
- tests/.tmp/activation066-ui-baseline.log:0/3 seleccionados sobre src/Preparation.tsx anterior exacto, congelado en tests/.tmp/activation066-original-preparation.tsx. Como se explica arriba, prueba props sin adaptar; no evidencia de la ruta normal de App.
- Primera typecheck global antes de añadir todos los E2E: correcto. Build definitivo separado en candidate-7444fd6d-da9d-4304-8d6b-59a7af5f3158; resultados y límites en el cierre siguiente. El proceso se observó con su mismo handle hasta terminar, sin reiniciarlo al vencer una espera.

Nueve archivos exactos de esta unidad, sin solapes. QA056 sigue working al último cotejo y no tiene informe final; no se ejecutan sus pruebas intermedias para juzgarlas. Sin proveedor, datos reales, dependencia nueva, build/dist raíz, instalación, commit/push o autoaceptación.

## Prueba directa de la diferencia entre contratos API

tests/.tmp/prove-legacy-gap066.ts ejecuta el servidor de fuente mediante inject, SQLite en memoria y solo fixtures. Se prepara una propuesta, se registra su descripción revisada y se cambia antes de enviar reviewed:true al endpoint legado. Este devuelve200 y activa la descripción posterior: no recibe una revisión que cotejar. El caso equivalente con /api/v4/activate-reviewed y la revisión anterior devuelve409 y conserva la candidata pendiente.

Resultado persistido en tests/.tmp/activation066-legacy-gap.json. Es una mejora del contrato del asistente, no un cierre global del endpoint legado: ambos siguen disponibles. La autenticación y las validaciones antiguas siguen aplicándose; no se demuestra ni se declara acceso externo no autorizado. La UI nueva solo usa el contrato ligado a revisión y no hace fallback al legado.

## Sensibilidad de la guarda nueva

Snapshot de mutación tests/.tmp/activation066-mutated-a921d732-d853-4caf-a311-109904af1447: copia de la candidata con fuentes verificadas por hash. Se retira exclusivamente la línea que compara current.revision con la revisión recibida. La prueba «candidate schema mutation after review» falla con200 en vez de409, después de preparar/modificar una candidata válida. **0/1, fallo esperado causal**, sin skipped/TODO. Log sensitivity.log; no error de formato/preparación o una expectativa relajada. Fuente original, candidata y archivo compartido intactos.

Esta es la evidencia de sensibilidad central de la mejora. Los tres fallos del componente aislado descritos antes son de un contrato defensivo con props sin adaptar; no se confunden con el comportamiento anterior del padre App.

## Siete recorridos reales de navegador

Candidata compilada exacta, sin un backend alternativo de fixture: server.mjs copiado por hashes a dos carpetas nuevas en127.0.0.1:4404/4405. Datos ficticios, modo demo, protección local y perfiles temporales propios de Chromium de caché; un trabajador, block-external y entorno permitido del SO. Browser plugin no disponible: flujo Playwright del repositorio. No proveedor real, navegador del usuario o instalaciones4331/4334.

1. App real con Agencia Norte activa y Distribuidora Atlas candidata: muestra el esquema candidato (comportamiento ya resuelto por el padre anterior), añade identidad/revisión/alcance y usa exclusivamente el nuevo POST con la revisión exacta. Tras éxito, activa Atlas y retira candidata.
2. Cambiar candidata después de marcar casilla:409, copia activa conservada, candidata aún sin aprobar, nuevo contenido visible y casilla retirada. Un solo intento de activación, sin reintento automático.
3. Editar un registro activo después de revisar una candidata de sustitución:409 y bloqueo por cambios locales nuevos. Conserva el teléfono editado y exige revisar/exportar la sustitución de nuevo.
4. Candidata sin especificación: el preview nuevo no ofrece la especificación activa como sustituto, aunque el espacio anterior siga ready. No botón de activación/casilla para el objetivo incompleto.
5. Servidor antiguo404: bloqueo explícito sin llamada al endpoint legado. No se presenta un vacío como una revisión válida.
6. Refresh retira aprobación; Space marca la casilla y desktop1440/390/320 conservan identidad y ausencia de overflow. Capturas1440 y320 inspeccionadas: se distingue el contexto activo del encabezado y la candidata que sustituirá registros.
7. Recorrido anterior completo de continuidad, fuente/aserciones intactas: preparar demo desde cero, revisar/activar con el flujo nuevo, editar cliente, avanzar oportunidad, crear/completar tarea, persistencia por recarga, CSV y devolución simulada aprobada. No envío real.

**7/7,30.0s, sin skipped/flaky.** Resultados JSON y capturas en C:/Users/iresh/.codex/visualizations/2026/10/29/01a1896e-06ff-7690-9644-4f6de90c2826/activation066/activation066-59ec1893-f9eb-4d0a-bb57-f40575ab47a6/. Preparación/browser.log/manifest.json en tests/.tmp/activation066-59ec1893-f9eb-4d0a-bb57-f40575ab47a6; scripts de preparación/ejecución conservados en tests/.tmp/activation066-browser-prepare.cjs y activation066-browser.cjs.

## Build, hashes y límites de atribución

Candidata tests/.tmp/release-candidates/candidate-7444fd6d-da9d-4304-8d6b-59a7af5f3158:295 fuentes y23 artefactos, typecheck completo, Vite, seis bundles, diez activos públicos y162/162 Node previstos correctos. Los ocho archivos funcionales/tests de esta unidad se cotejaron contra los fuentes congelados antes del navegador y al presentar. Sus resultados focales previos pertenecen a esos mismos hashes. La candidata incluye tests de Claude QA056 en working porque están en el checkout; no se ejecuta su banco intermedio ni se atribuye esa revisión a Claude por compilar su snapshot.

El manifiesto conserva approved/deployed/releaseEligible:false y blockers por las unidades aún reservadas, QA056 y revisión E2E/visual de release pendiente. Los siete E2E de esta unidad no certifican toda la aplicación. No publicación o instalación. Los logs de candidata y de cada prueba conservan sus nombres/fechas; no se suman repeticiones como tests nuevos.

El hash incluye datos completos relevantes pero el preview retira records/links: no acredita que un usuario haya leído todos los campos o conservado una exportación. Cambios concurrentes por el servidor en este proceso se rechazan; no es un mecanismo frente a escritura directa de otra herramienta en la misma SQLite. Una activación confirmada puede haber ocurrido aunque falle después el refresh de pantalla; no se repite el POST automáticamente, y el siguiente intento con revisión antigua es rechazado por el servidor.

La API legado permanece sin vinculación de revisión por compatibilidad. Clientes externos al asistente deberán adoptar el endpoint nuevo si necesitan esa propiedad. No se prueba lector de pantalla real, motor alternativo, datos de producción o un proveedor. Store/Recovery/app.ts y fuentes reservadas de Claude permanecen intactos; server/v4.ts se reservó como punto libre de integración antes de editar. Siguiente: dictamen independiente sobre esta unidad y las restantes, sin dar por aceptada una fuente por el build verde.

## Cotejo final de hashes y estado de snapshot

- server/activation-review.ts: 7746e1f59ad68c1cf9c4bf10a9ed46f4b227dc622aa71924944dc123aaec5dd7
- server/v4.ts: 7b540f8c163592378b36e0f7b175ec717f6b5b430fb3a5147cf517aaef5a7c09
- shared/activation-review.ts: 649432f1228ae49b5077e16abc7e9e238f85092dfaa7cc4693c6f0f70f671972
- src/Preparation.tsx: 2b0630f3f16992a22f31b66ee25466a1ef30b10fe443a524421142d7fd258de1
- src/preparation-review.css: 3245624e5d713f357500edb0d3af70a780c3632d72d996479106a2cfd7d15b8f
- tests/activation-review.test.ts: 0573050a0c6bed697c50b4b45df1a00ca53e717d2afc2b90e3f5151c8ed8dd11
- tests/e2e/preparation-review.spec.ts: 89b2844214c633667d9e317d16d7e66bf7c2e00e4732d9b10b619b813f0ca148
- tests/preparation-review.test.ts: 54f4fd337a19d0805e45136c1c0a9b06a8526298cfa68f615f831ab5c4da0422

SnapshotStable:true; liveSourcesStillMatch al completar build:true. El hash del informe lo registra submit.


## R2 · Aprobación ABA y geometría QA073 D1/O-D2

Cambiar reviewKey retira aprobación, respuesta y error antes de solicitar la nueva revisión. VolverA→B→A no recupera consentimiento antiguo mientrasGETAestá pendiente; la revisión nueva aún necesita aprobación explícita. Primario44px mediante CSS propio con especificidad suficiente, medido a1440/390/320.12UI/82focales y6E2E relevantes correctos; el caso ABA falla ante075 (tests/.tmp/fixes075-baseline-6bceb5d0-deee-4148-8563-542a51128b00/approval-history.log). Backend del contrato no cambió por esta corrección.

## Verificación integrada propia · 31/10/2026, 14:32:45, Europe/Madrid

Candidata aislada **tests/.tmp/release-candidates/candidate-5e94390e-745e-40e1-ac1f-d412eaf4672f**,329fuentes,23artefactos: typecheck, Vite, seis bundles Node, public-assets y162pruebas Node correctos. approved:false/deployed:false/releaseEligible:false; conserva bloqueos de fuentes sin aceptar. No es una instalación o aceptación de las unidades. Todos los hashes de fuente se recotejaron antes de esta presentación.

Banco focal propio del snapshot: **82/82**, sin fallos/TODO/skip (tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/focal.log). Navegador: **29casos únicos correctos** repartidos en dos ejecuciones del mismo snapshot: activación6, manual6, historial3 e inspector8 en tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/browser-results.json, y búsqueda6 en tests/.tmp/final079-8a4e0c8e-ae18-44b0-aa37-b59b0b7abd12/evidence/browser-results.json. El primer arranque omitió la fixture de búsqueda: sus6fallos se conservaron; se corrigió solo el arnés y se repitió solo esa suite con datos ficticios nuevos. No se convierten los fallos iniciales en éxitos ni se suman reejecuciones como casos nuevos.

Browser plugin not available: PlaywrightCLI existente con Chromium headless-shell1228 propio, workers1, servidores nuevos4391/4401/4404/4406/4410, allowlist de entorno y bloqueo de red externa. Capturas1440/390/320; inspeccionadas visualmente las de inspector1440/320 y activación320. Controles44px medidos en navegador. Sin Edge, lector de pantalla, instalación4331/4334, datos reales, proveedor, dependencias, build/dist raíz, deploy, commit/push o acceso corporativo.

QA060/QA073 permanecen informes históricos aceptados como auditoría con hallazgos; no se reescribieron sus fuentes de pruebas/informes. La revalidación independiente nueva079 debe retirar TODO solo con causa y actualizar su caracterización H9 (búsqueda sin fechas implícitas). No se declara toda la batería del proyecto verde. AUTH_PARENT072 permanece pendiente y App.tsx no se modificó durante estas correcciones.


## Hashes de esta presentación (sustituyen tablas anteriores)

- shared/activation-review.ts: `649432f1228ae49b5077e16abc7e9e238f85092dfaa7cc4693c6f0f70f671972`
- server/activation-review.ts: `7746e1f59ad68c1cf9c4bf10a9ed46f4b227dc622aa71924944dc123aaec5dd7`
- server/v4.ts: `7b540f8c163592378b36e0f7b175ec717f6b5b430fb3a5147cf517aaef5a7c09`
- src/Preparation.tsx: `38f7cc4a060181e78ea8e908c93832a7778217f61988509067cb5d3e295c5397`
- src/preparation-review.css: `b1ef56b8f1abfb6033bd6e18ec66bd63f06f284e19751df889cdcefc6112d870`
- tests/activation-review.test.ts: `0573050a0c6bed697c50b4b45df1a00ca53e717d2afc2b90e3f5151c8ed8dd11`
- tests/preparation-review.test.ts: `fdbb2b085018cac8c2b40af65db756b7df73c5d241579acc9a6dd7cf9072fa67`
- tests/e2e/preparation-review.spec.ts: `21423515f6a34bfb8cc2f7356c87c7e2ca66cb5599476fc3c205a16c4be3042e`

El hash del informe lo registra submit. No autoaceptación.

## Revalidación con el menú actual · 17/11/2026, Europe/Madrid

La diferencia en Preparación frente a la presentación anterior es la etiqueta local «Datos de prueba». La candidata f992ac95-6466-42a0-bb7c-1b1fa2993e35 conserva la misma revisión y contrato de activación. El E2E anterior se detuvo al buscar Preparación directamente. Se actualizaron los dos accesos de la suite para abrir Ajustes y luego Preparación con nombres accesibles y se comprueban la URL y la etiqueta visible.

Con el mismo código y dos almacenes ficticios nuevos, **6/6 Chromium**: revisión de la candidata, revisión anterior rechazada con 409, edición local protegida, ausencia de candidata, servidor antiguo 404 y teclado con vistas de 1440, 390 y 320 px. **21/21 Node** con las unidades de API y pantalla. Los controles de activación originales se conservan.

Bancos `tests/.tmp/prep409-239f968ac3184f94a5b886a76ac72060` y `tests/.tmp/prep409-unit-722e242436574ca68966b60b450ad80d`, con huellas, logs y capturas. El servidor de prueba se gestionó en 4404. No se editaron Preparación, estilos ni API. El tablón recoge las huellas actuales de Preparación, la suite y el informe.
