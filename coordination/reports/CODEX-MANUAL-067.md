# CODEX-MANUAL-067 · Aprobación y comprobación manual ligadas al contexto

30/10/2026, Europe/Madrid. Unidad propia con cinco reservas exactas, sin modificar backend, ChangesView ni fuentes Claude. Presentación para revisión; sin autoaceptación.

## Resultado

La confirmación humana se liga a revisión, operaciones pendientes y mapeo exacto. Cambiar cualquiera la retira, también A→B→A. Las altas requieren IDs numéricos y únicos por entidad, admitiendo un mismo ID en entidades distintas. Un vuelo síncrono impide dobles POST antes del render; cambios de contexto o desmontaje abortan y descartan éxito/error tardíos aunque el transporte ignore la señal.

Los resultados deben cubrir exactamente los registros únicos por entidad/ID, sin duplicados, con booleanos coherentes. Para éxito se exige informe manual_verified, misma revisión, watermark final, recuento y campos de identidad/fecha válidos. Un array vacío, ficha ajena o informe de otra revisión no se presenta como comprobación confirmada. Se muestran entidad e ID además del motivo. Un resultado negativo conserva pendientes y exige nueva revisión humana.

Si el servidor confirma pero falla la lectura posterior, se conserva el acuse, se informa del fallo local y el botón reintenta solo refresh. Un handler antiguo no reenvía la comprobación.409 retira aprobación y trata de actualizar; si esa lectura también falla ofrece reintentar sin rechazo no atendido.

## Verificación propia

- 14/14 pruebas de componente,0 fail/skip/TODO. Harness controlado de hooks/transporte, no prueba DOM; se complementa con navegador real.
- Cuatro regresiones con tests idénticos apuntando a tests/.tmp/manual067-original.tsx:0/4, tres fallos true!==false por aprobación retenida y uno2!==1 por doble POST. La fuente anterior SHA c51be2066d469e4a468edaebe459fb6a51d11241819fbf762ae0a1a634f249d2 se preserva, sin mutar el archivo compartido.
- Typecheck y Vite correctos en snapshot congelado.
-6/6 E2E Chromium headless propio,14.9s, puerto4406 nuevo: revisión real cambiada por edición ficticia y refresco del padre; edición de mapeo; doble click; acuse+refresh fallido; payload vacío y revisión ajena; respuesta válida retenida ignorando abort; teclado y1440/390/320 con controles44px/no overflow. Capturas1440/320 inspeccionadas, legibles.
- Backend compilado idéntico al baseline ACTIVATION066 (23 artefactos totales tras Vite). No se repiten162Node ni bundles de servidor sin cambios. Cuatro overlays actuales coinciden con lo probado.

Comandos reproducibles desde raíz:

    node --require ./scripts/block-external.cjs --import tsx --test tests/manual-recovery-ui.test.ts
    PLANB_MANUAL_SRC=<original conservado> node --import tsx --test --test-name-pattern 'approval retires|mapping edits|same revision|same remote ID' tests/manual-recovery-ui.test.ts
    node tests/.tmp/prepare-manual067.cjs
    node tests/.tmp/manual067-browser.cjs

La variable de entorno de baseline se aplica solo a ese proceso. Preparación registra logs de unitarias/typecheck/Vite; navegador results.json y browser.log. Primer intento de preparación recursiva detectó una carpeta auxiliar fuera del manifiesto y se detuvo antes de probar; arnés corregido para copiar únicamente fuentes inventariadas y cotejadas por hash, sin editar producto por esa incidencia.

## Procedencia y límites

Snapshot: D:\AI\Plan-B-CRM-v2.1\source\tests\.tmp\manual067-34acadb4-cca5-4d29-97f2-5f524e062132

Evidencia: C:\Users\iresh\.codex\visualizations\2026\10\29\01a1896e-06ff-7690-9644-4f6de90c2826\manual067\manual067-34acadb4-cca5-4d29-97f2-5f524e062132

El backend tiene una base ficticia nueva. Solo se altera por interceptación el flag de origen mostrado por /api/v2/state para recorrer la rama de producción de la UI; todos los POST manual-recovery/verify se interceptan con respuestas ficticias. Cada E2E confirma en backend snapshot.source.isTestData:true,connection:null,watermark:0 ymanualReport:null. No es prueba de HubSpot ni de verificación manual en producción; no se realizó una lectura o escritura de proveedor.

Backend manual existente ya comprobaba revisión al inicio/final y solo hacía lecturas remotas. No se atribuye a esta UI una corrección de bypass de permisos o escrituras remotas. Cancelar en cliente no demuestra que el servidor haya detenido una operación ya recibida. No lector de pantalla ni Edge, instalación4331/4334, build/dist raíz, dependencias, despliegue, commit o push. Los informes de otras unidades conservan su alcance.

## Hashes de los cuatro archivos probados

| Ruta | SHA-256 |
|---|---|
| src/ManualRecovery.tsx | `3ff1b197c73842af4b47bbc4006d657824eb25d1e061bd57769f79a2f45d4684` |
| src/manual-recovery.css | `bbd514335bbb200fd3e6c38a80830ad7d7690d7b70a4bae297bb35c348dbe7d7` |
| tests/manual-recovery-ui.test.ts | `6e69369bf1d2f3a6f3703a08adea16c1fb7ffa35df2fb155796eaedc189b2b6f` |
| tests/e2e/manual-recovery-review.spec.ts | `935f250d2469e0e50107961bc14a31d151bc9a5fdcd441e42e773f45e6550c85` |

El informe se sella al presentar; no se autoacepta.


## R2 · IDs de texto canónicos QA073 M1

Formulario rechaza ceros iniciales, mantiene hasta100dígitos como texto y no usa Number. MatrizUI añade0501/501y00/1;14UI correctas dentro82focales,6E2E del flujo correctos. Backend se endurece en la unidad separada076, no en reserva067. El remoto numérico ficticio reproduce el alias potencial; comportamiento real de HubSpot con0501no comprobado, por tanto no se afirma duplicación real en el proveedor.

## Verificación integrada propia · 31/10/2026, 14:32:45, Europe/Madrid

Candidata aislada **tests/.tmp/release-candidates/candidate-5e94390e-745e-40e1-ac1f-d412eaf4672f**,329fuentes,23artefactos: typecheck, Vite, seis bundles Node, public-assets y162pruebas Node correctos. approved:false/deployed:false/releaseEligible:false; conserva bloqueos de fuentes sin aceptar. No es una instalación o aceptación de las unidades. Todos los hashes de fuente se recotejaron antes de esta presentación.

Banco focal propio del snapshot: **82/82**, sin fallos/TODO/skip (tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/focal.log). Navegador: **29casos únicos correctos** repartidos en dos ejecuciones del mismo snapshot: activación6, manual6, historial3 e inspector8 en tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/browser-results.json, y búsqueda6 en tests/.tmp/final079-8a4e0c8e-ae18-44b0-aa37-b59b0b7abd12/evidence/browser-results.json. El primer arranque omitió la fixture de búsqueda: sus6fallos se conservaron; se corrigió solo el arnés y se repitió solo esa suite con datos ficticios nuevos. No se convierten los fallos iniciales en éxitos ni se suman reejecuciones como casos nuevos.

Browser plugin not available: PlaywrightCLI existente con Chromium headless-shell1228 propio, workers1, servidores nuevos4391/4401/4404/4406/4410, allowlist de entorno y bloqueo de red externa. Capturas1440/390/320; inspeccionadas visualmente las de inspector1440/320 y activación320. Controles44px medidos en navegador. Sin Edge, lector de pantalla, instalación4331/4334, datos reales, proveedor, dependencias, build/dist raíz, deploy, commit/push o acceso corporativo.

QA060/QA073 permanecen informes históricos aceptados como auditoría con hallazgos; no se reescribieron sus fuentes de pruebas/informes. La revalidación independiente nueva079 debe retirar TODO solo con causa y actualizar su caracterización H9 (búsqueda sin fechas implícitas). No se declara toda la batería del proyecto verde. AUTH_PARENT072 permanece pendiente y App.tsx no se modificó durante estas correcciones.


## Hashes de esta presentación (sustituyen tablas anteriores)

- src/ManualRecovery.tsx: `85daa058d570977d5ff2306144733d4bcdb7186b9c5b914ce48d4cad8a56df1b`
- src/manual-recovery.css: `bbd514335bbb200fd3e6c38a80830ad7d7690d7b70a4bae297bb35c348dbe7d7`
- tests/manual-recovery-ui.test.ts: `900a07a477471dc4087b165ebb94323376ff49d0556f14f23debbe5964fcb34e`
- tests/e2e/manual-recovery-review.spec.ts: `935f250d2469e0e50107961bc14a31d151bc9a5fdcd441e42e773f45e6550c85`

El hash del informe lo registra submit. No autoaceptación.


## R1/O2 · Corte final 31/10/2026, 16:16:55, Europe/Madrid

Prop opcional integrityBlocked retira aprobación e impide nuevas verificaciones cuando el padre no puede validar el estado. Conserva el acuse confirmado y permite retry de lectura GET; no repite POST.14unitarias y6E2E existentes pasan dentro de las suites116/24.

Detalle transversal en CODEX-RECOVERY-INTEGRITY-087.md, CODEX-SOURCE-CASE-089.md y CODEX-RECOVERY-BOOT-090.md.

Candidata final: tests/.tmp/release-candidates/candidate-42c5f15c-99a2-4f4d-bd96-275f84c47f0f;357 fuentes/23 artefactos, snapshotStable:true y liveSourcesStillMatch:true al cierre de la captura. Typecheck,Vite,seis bundles,activos públicos y162 pruebas Node correctos. Sigue approved/deployed/releaseEligible:false por revisiones y exclusiones declaradas. No es imagen íntegra del repositorio ni reconstrucción en máquina limpia. Dependencias existentes, sin nuevas instalaciones.

Los116 focales y24E2E se ejecutaron contra candidate-d4cc1c48-2201-48d9-94de-2bab0fb2faf0. El cierre final conserva todas las fuentes R1 de negocio/UI y21/23 artefactos idénticos; solo server.mjs/runtime.mjs cambian por las condiciones de arranque. Tres pruebas de arranque adicionales pasan contra fuentes finales y contra ambos ejecutables finales. Detalle de comparación y logs en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/final091-36a2d7eb-c634-49c3-8443-c8481cbf2d5d. No se suman repeticiones como pruebas únicas.

La app abierta PREVIEW083 en4420/4421 conserva sus artefactos anteriores: no incluye automáticamente R1. Ambos health200 comprobados en esta continuación. No se reemplazó/reinició esa vista, no instalaciones4331/4334, equipo original, proveedores, cuentas, claves, build/dist raíz, commit/push o despliegue. Fuentes para revisión independiente; no autoaceptación.

### Hashes que sustituyen las versiones previas para esta revisión

- src/ManualRecovery.tsx: `c353ba253d2f3b9e503e3d93d8cd22c13228f96d6c72babb3660b178e210475f`
- src/manual-recovery.css: `bbd514335bbb200fd3e6c38a80830ad7d7690d7b70a4bae297bb35c348dbe7d7`
- tests/manual-recovery-ui.test.ts: `900a07a477471dc4087b165ebb94323376ff49d0556f14f23debbe5964fcb34e`
- tests/e2e/manual-recovery-review.spec.ts: `935f250d2469e0e50107961bc14a31d151bc9a5fdcd441e42e773f45e6550c85`

El informe lo sella submit.
