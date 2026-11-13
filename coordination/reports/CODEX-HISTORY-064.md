# HISTORY064 · Historial local completo, consultable y tipado

30/10/2026, Europe/Madrid. Codex. **10/10 unitarias, 3/3 E2E nuevos finales, un recorrido anterior de Cambios correcto, typecheck y Vite.** Fuentes para revisión, sin autoaceptación o instalación.

## Problema y resultado

ChangesView mostraba únicamente changes.slice(-100).reverse(): las operaciones anteriores quedaban inaccesibles en pantalla aunque siguieran conservadas y exportables. Se sustituye ese fragmento por ChangeHistory; no se modifica el flujo de devolución, aprobación, exportación, ManualRecovery o propuestas.

El nuevo historial presenta todas las operaciones recibidas de la API local en páginas de veinte. Permite buscar por todos los términos entre ID de operación/registro, entidad, campo, fecha y valores anteriores/posteriores, sin distinguir acentos o mayúsculas y sin interpretar regex. Filtros de entidad, alta/edición y marca de devolución se combinan. Recuentos globales y resultados filtrados separados; orden por ID descendente, no por texto de fecha. Las entradas y el orden original no se mutan. Una página fuera de rango se ajusta a los resultados disponibles.

Al desplegar una operación se muestran solo campos con diferencias. Distingue campo ausente, null, texto vacío, número, booleano y cadenas con comillas/escapes explícitos. Antes/después conservan sus tipos y valores completos; cero y false no desaparecen por falsy. Una creación indica campo ausente en el antes; una operación sin cambio de valores no inventa diferencias. React escapa el contenido, no se interpreta HTML de un registro.

La clasificación por watermark se llama «Posterior a la marca» o «Incluida en la marca». El texto explica que la marca registra una devolución/comprobación pasada, no verifica que los valores sigan disponibles en el destino. Las simulaciones no la avanzan. «Campo ausente» describe la versión local y no afirma borrado en HubSpot. No se cambia la semántica del watermark ni se conecta un proveedor.

Controles nativos con etiquetas, foco al limpiar, navegación por teclado de details/summary, mensajes aria-live y controles44px. CSS acotado, valores largos con salto de línea y dos columnas antes/después en móvil. La lista renderiza hasta veinte operaciones por página; las diferencias de esas filas están disponibles al desplegar. No se añade backend o petición por filtro/página.

## Pruebas propias

**10/10 Node**, sin skips/TODO, log unit.log del snapshot. Oráculos escritos con137 operaciones: todas las páginas restituyen exactamente los IDs137…1, sin duplicados ni omisiones. Recuentos/markup por marca inclusiva, búsqueda entre antes/después/campo/ID, filtros compuestos, ajuste de página, tipos/null/ausente, creación/no-op, fechas invertidas y5000 operaciones con ventanas de veinte. Límites de consulta/filtros inválidos rechazados. Comando node --require ./scripts/block-external.cjs --import tsx --test tests/change-history.test.ts; ejecución final sobre su copia congelada.

**Sensibilidad:** solo en una copia temporal se reintroduce un recorte de las últimas cien antes de filtrar. El caso de recorrido completo falla por secuencia incorrecta: faltan IDs antiguos y el ajuste de páginas repite el último tramo. Resultado0/1 causal, no éxito de aplicación; sin skips/TODO. Scratch cutoff-mutation/sensitivity.log. La misma prueba con fuente actual pasa entre las diez; archivo compartido intacto. No se compara dos invocaciones del mismo algoritmo como oráculo.

**3/3 E2E finales**,17.3s, sin skipped/flaky. Fixture nueva con122 operaciones reales por API:121 ediciones y un alta; first/middle/last IDs se obtienen de las asignaciones reales del Store, sin suponer reinicio del autoincremento.

1. Se alcanza la última página y primera operación antigua, fuera del recorte100 previo. Se comprueban valores exactos false/true/0/7/vacío/null y teléfono antes/después, búsqueda de ambos valores y filtro de altas con campos ausentes.
2. Respuesta GET fixture con marca en la operación intermedia:61 incluidas y61 posteriores, filtros de tarea/entidad, vacío y limpiar. La marca se simula en respuesta de lectura; no se ejecuta una devolución o escribe un watermark real para fabricar el test.
3. Texto de400 caracteres y250 caracteres suplementarios repetidos, apertura por Enter, controles44px y ausencia de overflow a1440/390/320. Capturas desktop y320 inspeccionadas: filtros y diferencias legibles, tipos y valores distinguibles.

Los tres verifican cero escrituras de UI, cero pageerror, cero solicitudes fuera del origen y revisión de espacio sin cambiar durante filtros. La selección por ID usada por el test no confunde posición ordinal con ID persistente.

**Regresión existente:** v4 «Hoy, revisión, simulación persistente, integraciones y móvil sin envíos externos» pasa1/1 en la primera corrida,4.6s, con la misma fuente funcional/frontend/backend. Fuente y aserciones intactas; se prueba aprobar/ejecutar simulación y caducidad posterior desde Cambios. No se repite cuando solo se corrige la instrumentación del test nuevo.

## Snapshot, build y evidencia

tests/.tmp/history064-ef967246-4bf5-482c-8690-c875966c31c9. Sources basadas en el snapshot final de RELATION062; backend server.mjs idéntico y cotejado. Seis overlays propios registrados en manifest.json, typecheck.log, unit.log y vite.log. Después solo cambió la instrumentación del E2E; typecheck-final.log verifica esa versión final. No se reconstruye todo el backend o se repite Node162 por cambiar una vista exclusivamente frontend.

Browser fixture propio en127.0.0.1:4401; regresión anterior separada4402. Datos/carpetas de protección nuevas, entorno de hijos con lista permitida del SO, block-external, Chromium headless de caché y perfiles temporales propios, un trabajador. Browser plugin no disponible: se usa el flujo Playwright del repositorio. No servicios4331/4334, navegador del usuario o datos/cuentas originales.

Evidencias: C:/Users/iresh/.codex/visualizations/2026/10/29/01a1896e-06ff-7690-9644-4f6de90c2826/history064/history064-ef967246-4bf5-482c-8690-c875966c31c9/. El results.json raíz registra la primera corrida2/4 y el recorrido anterior correcto. final/results.json conserva los3/3 nuevos, con history064-1440.png/390/320 inspeccionados en final. Logs browser-initial.log y browser.log separados. La config final excluye la regresión ya pasada y usa fresh-data nueva; no recicla la base del primer intento.

Incidencias propias: un lector auxiliar intentó leer history064-latest.json antes de que terminara el build; ENOENT de preparación, sin reiniciar el proceso de build vivo. Primera corrida2/4: getByLabel exacto no coincidía con el texto completo del label envolvente, aunque el nombre accesible del combobox era correcto; se usa getByRole con ese nombre. El caso de marca suponía IDs1…122, pero el Store conserva autoincremento entre importaciones: se corrige a IDs reales de cada ensayo, conservando recuentos/orden esperados y todas las aserciones funcionales. Cero cambios de producto para convertir esa corrida en verde.

## Alcance y límites

Siete archivos exactos de HISTORY064. Sources de Claude QA056 y QA060, Store/Recovery, App y entregas anteriores congeladas intactos. QA056 sigue con su reserva propia; su progreso se registra por separado y no se acepta a partir de una prueba de historial.

La API existente sigue entregando todo el historial: esta unidad elimina el recorte de presentación y limita DOM por página, sin paginación nueva en backend o garantía de tiempo para historiales arbitrariamente grandes. No prueba todas las carreras de carga del padre ChangesView ni modifica su sondeo anterior. La marca tampoco es un certificado remoto actual. No se ensayó lector de pantalla real, otro motor o una instalación existente.

Sin dependencia nueva, build/dist raíz, proveedor, datos originales, publicación, commit/push o autoaceptación. Siguiente: revisión independiente por hashes, manteniendo separados el mecanismo local, la evidencia de simulación y cualquier devolución real autorizada en otra fase.

## Hashes de fuentes/pruebas cotejados

- shared/change-history.ts: c65e5964b7e2978c90c91c6800e38ff703e4925a51268e5ba942c84f8667940c
- src/ChangeHistory.tsx: 62d8836530097c300ce4aecff1e9d3f551287c8f78db7252076388397aa619c5
- src/change-history.css: b7f9bdc75eeea75fb351664c5c0b8fab5e845912cf48c276ec93a9f2cf8e12d6
- src/ChangesView.tsx: 477df14c11ed66ffea80971ad2a3cd9273ff4a8da80807cd27e10a8a95d5ef36
- tests/change-history.test.ts: a95f4f8bff24cdd5a97687c1bda43d051be8bef0ea0156000610ad04935d3ca1
- tests/e2e/change-history.spec.ts: 24992e3ebc3071cb717e5c376b3d24eee1f93cba78b3265bb917e910a31a3312

Hash del informe registrado por submit, sin lista autorreferente.


## R2 · Precisión de búsqueda QA073 H1

La fecha deja de participar implícitamente en el texto buscado. IDs, campos, operaciones y valores tipados siguen participando; fecha conserva su presentación y filtros temporales existentes.11/11 de historia en82focales y3/3E2E reales correctos. El caso específico33con otra operación en segundoISO33falla ante075y pasa aquí (tests/.tmp/fixes075-baseline-6bceb5d0-deee-4148-8563-542a51128b00/approval-history.log). El test histórico H9 de Claude documentaba la conducta anterior; no se edita sin nueva reserva079 ni se presenta como regresión deseable.

## Verificación integrada propia · 31/10/2026, 14:32:45, Europe/Madrid

Candidata aislada **tests/.tmp/release-candidates/candidate-5e94390e-745e-40e1-ac1f-d412eaf4672f**,329fuentes,23artefactos: typecheck, Vite, seis bundles Node, public-assets y162pruebas Node correctos. approved:false/deployed:false/releaseEligible:false; conserva bloqueos de fuentes sin aceptar. No es una instalación o aceptación de las unidades. Todos los hashes de fuente se recotejaron antes de esta presentación.

Banco focal propio del snapshot: **82/82**, sin fallos/TODO/skip (tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/focal.log). Navegador: **29casos únicos correctos** repartidos en dos ejecuciones del mismo snapshot: activación6, manual6, historial3 e inspector8 en tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/browser-results.json, y búsqueda6 en tests/.tmp/final079-8a4e0c8e-ae18-44b0-aa37-b59b0b7abd12/evidence/browser-results.json. El primer arranque omitió la fixture de búsqueda: sus6fallos se conservaron; se corrigió solo el arnés y se repitió solo esa suite con datos ficticios nuevos. No se convierten los fallos iniciales en éxitos ni se suman reejecuciones como casos nuevos.

Browser plugin not available: PlaywrightCLI existente con Chromium headless-shell1228 propio, workers1, servidores nuevos4391/4401/4404/4406/4410, allowlist de entorno y bloqueo de red externa. Capturas1440/390/320; inspeccionadas visualmente las de inspector1440/320 y activación320. Controles44px medidos en navegador. Sin Edge, lector de pantalla, instalación4331/4334, datos reales, proveedor, dependencias, build/dist raíz, deploy, commit/push o acceso corporativo.

QA060/QA073 permanecen informes históricos aceptados como auditoría con hallazgos; no se reescribieron sus fuentes de pruebas/informes. La revalidación independiente nueva079 debe retirar TODO solo con causa y actualizar su caracterización H9 (búsqueda sin fechas implícitas). No se declara toda la batería del proyecto verde. AUTH_PARENT072 permanece pendiente y App.tsx no se modificó durante estas correcciones.


## Hashes de esta presentación (sustituyen tablas anteriores)

- shared/change-history.ts: `f9d6eb3c417be175d21f837a086420003ca274f1df0882a33f3c333973c80565`
- src/ChangeHistory.tsx: `62d8836530097c300ce4aecff1e9d3f551287c8f78db7252076388397aa619c5`
- src/change-history.css: `b7f9bdc75eeea75fb351664c5c0b8fab5e845912cf48c276ec93a9f2cf8e12d6`
- src/ChangesView.tsx: `477df14c11ed66ffea80971ad2a3cd9273ff4a8da80807cd27e10a8a95d5ef36`
- tests/change-history.test.ts: `a9910f2ca9b89d2fd707ac4fe584c09c304d3b387bc072740394508c9f99dea6`
- tests/e2e/change-history.spec.ts: `24992e3ebc3071cb717e5c376b3d24eee1f93cba78b3265bb917e910a31a3312`

El hash del informe lo registra submit. No autoaceptación.


## R1/O2 · Corte final 31/10/2026, 16:16:55, Europe/Madrid

ChangesView valida GETchanges y su coherencia; conserva historial/exportaciones cuando los metadatos no permiten confiar en devolución. Ref sincrónica, secuencia y cancelación descartan respuestas/handlers viejos. Manual se mantiene montado para conservar acuses confirmados.

Detalle transversal en CODEX-RECOVERY-INTEGRITY-087.md, CODEX-SOURCE-CASE-089.md y CODEX-RECOVERY-BOOT-090.md.

Candidata final: tests/.tmp/release-candidates/candidate-42c5f15c-99a2-4f4d-bd96-275f84c47f0f;357 fuentes/23 artefactos, snapshotStable:true y liveSourcesStillMatch:true al cierre de la captura. Typecheck,Vite,seis bundles,activos públicos y162 pruebas Node correctos. Sigue approved/deployed/releaseEligible:false por revisiones y exclusiones declaradas. No es imagen íntegra del repositorio ni reconstrucción en máquina limpia. Dependencias existentes, sin nuevas instalaciones.

Los116 focales y24E2E se ejecutaron contra candidate-d4cc1c48-2201-48d9-94de-2bab0fb2faf0. El cierre final conserva todas las fuentes R1 de negocio/UI y21/23 artefactos idénticos; solo server.mjs/runtime.mjs cambian por las condiciones de arranque. Tres pruebas de arranque adicionales pasan contra fuentes finales y contra ambos ejecutables finales. Detalle de comparación y logs en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/final091-36a2d7eb-c634-49c3-8443-c8481cbf2d5d. No se suman repeticiones como pruebas únicas.

La app abierta PREVIEW083 en4420/4421 conserva sus artefactos anteriores: no incluye automáticamente R1. Ambos health200 comprobados en esta continuación. No se reemplazó/reinició esa vista, no instalaciones4331/4334, equipo original, proveedores, cuentas, claves, build/dist raíz, commit/push o despliegue. Fuentes para revisión independiente; no autoaceptación.

### Hashes que sustituyen las versiones previas para esta revisión

- shared/change-history.ts: `f9d6eb3c417be175d21f837a086420003ca274f1df0882a33f3c333973c80565`
- src/ChangeHistory.tsx: `62d8836530097c300ce4aecff1e9d3f551287c8f78db7252076388397aa619c5`
- src/change-history.css: `b7f9bdc75eeea75fb351664c5c0b8fab5e845912cf48c276ec93a9f2cf8e12d6`
- src/ChangesView.tsx: `49b321d079e25247db6f77e5ffb9c7ac8425c818f93bc352bff8439de86daecf`
- tests/change-history.test.ts: `a9910f2ca9b89d2fd707ac4fe584c09c304d3b387bc072740394508c9f99dea6`
- tests/e2e/change-history.spec.ts: `24992e3ebc3071cb717e5c376b3d24eee1f93cba78b3265bb917e910a31a3312`

El informe lo sella submit.
