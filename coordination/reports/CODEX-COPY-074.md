# CODEX-COPY-074 · Revisar una copia antes de restaurar

Autor Codex. Inspector visible en Continuidad del generador, plegado hasta abrirlo; no se muestra en runtime independiente. Objetivo: distinguir integridad del archivo, cobertura de operaciones locales y custodia. La unidad no restaura ni confirma custodia.

## Contrato y comportamiento

GET/api/v7/copy-review/context devuelve referencia activa con revisión exacta y recuentos. POST/api/v7/copy-review/inspect acepta bytesbase64canónicos, contraseña opcional y revisión explícita (shaonull), máximo32MiB. Límite de cuerpo48MiB permitebase64sin el antiguo corte20MiB. RechazaUTF8inválido, rutas/opciones extra, revisión antigua y metadatos ambiguos; hereda auth/Host/Origin/no-store. Solo verifica y compara mediante Storeen memoria. La referencia de producción se cifra efímeramente para cumplir el contrato del motor; nunca se almacena o entrega. Una referencia inválida o demasiado grande no produce cobertura verde.

El cliente calculaSHA-256 de los bytes leídos y exige concordancia exacta de hash,tamaño,referencia y esquema semántico del informe. Cerrar,cambiar archivo/contexto odescartar retira resultado y cancela la petición; respuestas válidas antiguas no sobreviven aunque se ignoreabort. Elegir archivo antes de terminarGETinicial conserva esa lectura, regresión propia añadida.409actualiza contexto, borra contraseña y no repitePOSTautomáticamente. Contraseña se borra también tras respuesta aceptada/cierre/cambio; archivo y contraseña no se persisten. No sondeo propio.

Distinguecoincide,faltanoperaciones,revisióndivergente,origenincompatible e inválido. Una vuelta de valoresA→B→A conserva dos operaciones no cubiertas. Resultado es de un instante y referencia indicados, no promesa sobre estado vivo/HubSpot/RPO/RTO.

## Evidencia

**25/25Node** (12API+13UI) incluidas en82focales. API: archivo21MiBaceptado,>32rechazado, cifrado/contraseña/corrupción, producción, identidad, incertidumbre, sin espacio activo, referencias concurrentes, auth/Host/Origin y sin mutación persistente. UI: hashes/tamaños/referencias malformados, lecturas tempranas, ABA,respuestas tardías, cierre,409+fallo al recargar,singleflight y modo solo integridad.

**8/8 E2E reales** tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/browser-results.json: exportación cifrada auténtica en fixture nueva,bytesexactos, cobertura antigua tras dos operaciones revertidas, contraseña incorrecta/reintento/tamper,409real sinreintento, respuesta pendiente al cerrar, hash equivocado, selección temprana y teclado1440/390/320. Estado/changelog/custodia antes y después de inspeccionar iguales; la exportación inicial crea su propia metadata antes de medir. Interceptadas solo carreras/errores adversos, no comparación positiva. Capturascopy074-1440/390/320.png;1440/320inspeccionadas.

No lector de pantalla/Edge/otro equipo o piloto instalado; límite32MiB y petición explícita en memoria. No ZIP, restauración visible, almacenamiento de resultados o verificación de custodia. Backend síncrono acotado, no tarea en segundo plano. Revisión independiente futura requiere encargo separado:079excluye074para respetar sus once reservas.

## Verificación integrada propia · 31/10/2026, 14:32:45, Europe/Madrid

Candidata aislada **tests/.tmp/release-candidates/candidate-5e94390e-745e-40e1-ac1f-d412eaf4672f**,329fuentes,23artefactos: typecheck, Vite, seis bundles Node, public-assets y162pruebas Node correctos. approved:false/deployed:false/releaseEligible:false; conserva bloqueos de fuentes sin aceptar. No es una instalación o aceptación de las unidades. Todos los hashes de fuente se recotejaron antes de esta presentación.

Banco focal propio del snapshot: **82/82**, sin fallos/TODO/skip (tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/focal.log). Navegador: **29casos únicos correctos** repartidos en dos ejecuciones del mismo snapshot: activación6, manual6, historial3 e inspector8 en tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/browser-results.json, y búsqueda6 en tests/.tmp/final079-8a4e0c8e-ae18-44b0-aa37-b59b0b7abd12/evidence/browser-results.json. El primer arranque omitió la fixture de búsqueda: sus6fallos se conservaron; se corrigió solo el arnés y se repitió solo esa suite con datos ficticios nuevos. No se convierten los fallos iniciales en éxitos ni se suman reejecuciones como casos nuevos.

Browser plugin not available: PlaywrightCLI existente con Chromium headless-shell1228 propio, workers1, servidores nuevos4391/4401/4404/4406/4410, allowlist de entorno y bloqueo de red externa. Capturas1440/390/320; inspeccionadas visualmente las de inspector1440/320 y activación320. Controles44px medidos en navegador. Sin Edge, lector de pantalla, instalación4331/4334, datos reales, proveedor, dependencias, build/dist raíz, deploy, commit/push o acceso corporativo.

QA060/QA073 permanecen informes históricos aceptados como auditoría con hallazgos; no se reescribieron sus fuentes de pruebas/informes. La revalidación independiente nueva079 debe retirar TODO solo con causa y actualizar su caracterización H9 (búsqueda sin fechas implícitas). No se declara toda la batería del proyecto verde. AUTH_PARENT072 permanece pendiente y App.tsx no se modificó durante estas correcciones.


## Hashes de esta presentación (sustituyen tablas anteriores)

- shared/copy-inspection.ts: `febdc5170bffb36083da80450b585720ee4e9e202fec191fd73c7c5017612361`
- server/copy-inspection.ts: `1afe9b78e0f0024d1e61ef9adfc17ebddc36f5349f6b8fd687407c463d55498c`
- server/main.ts: `21cf8e2aa5bbf3275e7cc2b2e29f09f45659ce66c6b9b9030edc61a7b3856c0d`
- src/CopyInspection.tsx: `102da705789f477f4d2e4391285f45f10b4de79524a0e67d9ae566294af119e6`
- src/copy-inspection.css: `6b92ffd2037f075c7b89fd6e9e38ca7b0a341f8071006530a3d3c3604f20809b`
- src/ContinuityHome.tsx: `b5d6f52c4d509b47f1a406f39eaea68bf069696cd81ec6c7d7f06394b0cc20d0`
- tests/copy-inspection-api.test.ts: `45b2883ef8a83c6b1da79a2ace6e74cdaf4c82724de197f72d13cdc2f369614c`
- tests/copy-inspection-ui.test.ts: `102330caca01ce94c8e58b667e5ce65c65a78d511fc9c4a7ed971c64e650b242`
- tests/e2e/copy-inspection.spec.ts: `cfd78cb903b0e609096c49b5fe1c4cd89a7fb8a5646a0770f0f1e1c128c41a0d`

El hash del informe lo registra submit. No autoaceptación.


## R1/O2 · Corte final 31/10/2026, 16:16:55, Europe/Madrid

Contexto de inspector indica RECOVERY_STATE_INVALID y no ofrece referencia activa; sigue admitiendo integridad independiente del archivo. CopyInspection/ContinuityHome muestran razón explícita. main no restaura demo.seed al encontrar un plan inválido sin snapshot.12API/13UI y8E2E existentes pasan en las suites116/24; arranque final cubierto por090.

Detalle transversal en CODEX-RECOVERY-INTEGRITY-087.md, CODEX-SOURCE-CASE-089.md y CODEX-RECOVERY-BOOT-090.md.

Candidata final: tests/.tmp/release-candidates/candidate-42c5f15c-99a2-4f4d-bd96-275f84c47f0f;357 fuentes/23 artefactos, snapshotStable:true y liveSourcesStillMatch:true al cierre de la captura. Typecheck,Vite,seis bundles,activos públicos y162 pruebas Node correctos. Sigue approved/deployed/releaseEligible:false por revisiones y exclusiones declaradas. No es imagen íntegra del repositorio ni reconstrucción en máquina limpia. Dependencias existentes, sin nuevas instalaciones.

Los116 focales y24E2E se ejecutaron contra candidate-d4cc1c48-2201-48d9-94de-2bab0fb2faf0. El cierre final conserva todas las fuentes R1 de negocio/UI y21/23 artefactos idénticos; solo server.mjs/runtime.mjs cambian por las condiciones de arranque. Tres pruebas de arranque adicionales pasan contra fuentes finales y contra ambos ejecutables finales. Detalle de comparación y logs en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/final091-36a2d7eb-c634-49c3-8443-c8481cbf2d5d. No se suman repeticiones como pruebas únicas.

La app abierta PREVIEW083 en4420/4421 conserva sus artefactos anteriores: no incluye automáticamente R1. Ambos health200 comprobados en esta continuación. No se reemplazó/reinició esa vista, no instalaciones4331/4334, equipo original, proveedores, cuentas, claves, build/dist raíz, commit/push o despliegue. Fuentes para revisión independiente; no autoaceptación.

### Hashes que sustituyen las versiones previas para esta revisión

- shared/copy-inspection.ts: `fce67a03381e81b4a5831a2444c3aeab3bdbe07d038976f9af103d8eec71559a`
- server/copy-inspection.ts: `c55eee711914de03fa62fd95e5a1f023ed23c3c1953df463d20265f93c435461`
- server/main.ts: `196c51b28be8a9d7ef00c92e0f5b22ad6895b9465f397f88005423b8674b2644`
- src/CopyInspection.tsx: `faca448949ef9dd908453829c5cbb4e58c1cfb40c6d2360be010458c66832d34`
- src/copy-inspection.css: `6b92ffd2037f075c7b89fd6e9e38ca7b0a341f8071006530a3d3c3604f20809b`
- src/ContinuityHome.tsx: `78290475d791d9684ee33239d986d14e07497da45a3a59e73f060ae69f981602`
- tests/copy-inspection-api.test.ts: `45b2883ef8a83c6b1da79a2ace6e74cdaf4c82724de197f72d13cdc2f369614c`
- tests/copy-inspection-ui.test.ts: `102330caca01ce94c8e58b667e5ce65c65a78d511fc9c4a7ed971c64e650b242`
- tests/e2e/copy-inspection.spec.ts: `cfd78cb903b0e609096c49b5fe1c4cd89a7fb8a5646a0770f0f1e1c128c41a0d`

El informe lo sella submit.
