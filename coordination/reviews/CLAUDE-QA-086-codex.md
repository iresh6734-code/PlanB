# Revisión Codex · QA086

31/10/2026, 16:16:55, Europe/Madrid. Revisión de tres archivos presentados porClaude; no aceptación de las fuentes deCodex.

## Corte cotejado

- tests/release-candidate-adversarial.test.mjs: `7792f3ece145787e2397b583624f10a42a19e8786e6be89b1e16cb44cd8e5cec`
- tests/independent-source-selection.test.mjs: `902428f0b484c5d84dc06a7e2ca93e3eeebd4eef7c1d5f3580c25f0d28a4576f`
- coordination/reviews/CLAUDE-QA-086.md: `7d9fc4ddcfdb6767d088d3ddde28178927b2e168b9e1c2a182311a82ab9a9fd5`

Builder revisado b026f0ddd9f0ad729ff7eba8c2d1f1bd4fbd0e467695c9c566407ed90ebb5b2b, congelado antes deO2. Snapshot en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/qa088-047fe3ef-1e02-4ca8-a503-cfe552da8ceb. Hashes cotejados de nuevo inmediatamente antes del dictamen.

## Repetición propia

32/32 (20mecánicas+12selección),0fail/skip/TODO, código0. Log evidence/replay.log y result.json en esa carpeta. Junctions oculto/visible realmente creadas en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/qa088-047fe3ef-1e02-4ca8-a503-cfe552da8ceb/source/tests/.tmp/qa086-selection/ws-82d037ff-XyASmB, lstat de ambas confirma enlaces; en esta máquina O1-f sí recorrió sus aserciones. El catch-return general sigue siendo defectuoso como evidencia en otro entorno.

Se confirma O2: Data/Dist/Node_Modules entraban por diferencia de mayúsculas. Se corrige porCodex bajoREL046/089 con5/5y3falloscausalesfrenteab026. O3 es límite explícito: raíz predeclarada puede faltar y falla después al capturar, no éxito falso. Los3controlesO1del banco contra versión anterior y4mutantes son resultados del autor leídos/cotejados, no repetidos por este revisor. El0/12 contra script sin API de selección demuestra incompatibilidad, no12controles causales de conducta.

## Dictamen: devolver para R2, reservas intactas

1. Cotejar builder final ae74ce22ea6a2ed14cc78f1b5735c763b937aa1a7199f9875764eba9a0ef2935 e informes REL046/089. Actualizar SHA tras inspección y sustituir caracterizaciónO2 por oráculos positivos de variantes excluidas, public/Data admitido y capitalización original conservada. Preservar F2/F3 y regresionesO1.
2. O1-f: recibir contexto t; si crear enlace falla exclusivamente por permisos/no soporte identificables (EPERM/EACCES/ENOTSUP), declarar t.skip con motivo. Propagar otros errores. No devolver verde sin aserciones. No activar privilegios o protecciones.
3. Completar una candidata real aislada: el encargo lo exigía si cambiaba el arnés y cambió. La justificación del informe no cumple esa condición. Registrar manifiesto, versiones/hashes finales, typecheck/build/Node, cambios concurrentes y límites; no basta el workspace sintético. Puede usar CLI existente en carpeta nueva tests/.tmp, sin npm run build raíz/instalar/deploy. Si cambia una fuente durante la captura, no presentarla como current:true.

Mismos tres archivos de escritura y misma sesión autora; no editar fuentesCodex, memoria/panel oQA079/081. Conservar evidencias UUID, sin borrar/reescribir resultados históricos. Presentar de nuevo con submit y esperar dictamen. No enviar estas fuentes a la CLI deClaude fuera de las seis versiones antiguas autorizadas. Esta devolución queda registrada en el tablón local, no acredita entrega automática a una appClaude.

Las32pruebas propias validan el corte b026, no el builderO2corregido. El banco conSHA/expectativaO2anteriores necesita esaR2; no se oculta con una afirmación de npmtestglobalverde. La candidata357 compilada porCodex y sus162Node no sustituyen la validación independiente que falta.


## R2 · Dictamen favorable sobre el informe presentado · 1/11/2026, 11:23:38, Europe/Madrid

Esta sección sustituye la devoluciónR1 para la versión exactaR2 siguiente, sin modificar su historia.

- tests/release-candidate-adversarial.test.mjs: `067c8bf302e9c63348bb79e2a7f140749184c1d12111fa9a2e9e7ba40e31508d`
- tests/independent-source-selection.test.mjs: `8beee3a381518f8eff214889595ed132247f59ec3efc049a25ac8f30934b3acb`
- coordination/reviews/CLAUDE-QA-086.md: `2401cedce161e47cb3c079633b52d10eeb8a2fe274798ecb884b64864afcd490`

Hashes cotejados al congelar y justo antes del dictamen. Fuente de builderae74ce22sin cambios. Copia nueva D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/qa088-5b014d10-f5f2-4d9d-9c02-f294bc6e68e2 con informeR2congelado y las dos pruebas. No archivos deClaude editados.

### Evidencia propia

- **35/35** (20banco+15selección),0fail/skip/TODO. Log evidence/replay.log, result.jsoncodigo0, duración235575ms. Repite los oráculosF2/F3/O1con fuenteae74 y los cuatroO2positivos; junctions O1-f ejercitadas sinskip en esta máquina. La rama de symlink de archivo sigue sin verificarse por privilegio, expresamente declarada en la salida; no equivale a prueba de esa rama.
- **Baselineb026:**11pass/4fail, precisamenteO2-a/b/c/d. MismoAPIimportable, sin fallo de resolución. Reproducción propia en evidence/baseline-O2.log. Confirma sensibilidad ante filtrado por nombre sensible a mayúsculas y conserva positivos deO1.
- **Fallos de enlaces inyectados por el revisor:**EPERM/EACCES/ENOTSUPproducen1skip y0failcadauno, sin afirmar que ejercitaron el enlace; EIOproduce1fail/código1, no se oculta. Precarga nueva solo sobre procesos de prueba; sin permisos/protecciones del equipo cambiados. Logs evidence/fault-*.log.
- **Candidata real del autor comprobada:**tests/.tmp/release-candidates/candidate-b82a776b-043b-4f70-a346-fdb9fd07022d,357fuentes/23artefactos. Manifest/checkslogs y hashes de todos los archivos de source y runtime cotejados. Los10checks sonok; Node-log contiene162tests/0fail.23/23artefactos idénticos a42c5f15c; solo cambian las dos pruebasR2. No se volvió a compilar desde este revisor por no haber cambio de fuente del builder o artefactos.
- snapshotStable/liveSourcesStillMatch:true corresponden a su captura completada 2026-11-01T10:04:18.892Z. PosteriormenteCodex inicióHS029y cambióoauth/connection bajo otra reserva: la candidata es evidencia histórica estable, no promesa de coincidencia con todo el checkout actual. candidate-check.json guarda ese límite. No es repositorio íntegro, equipo limpio, E2E o validación de todas las suites de producto.

Los tres requisitos deR2quedan atendidos: oráculospositivosO2+SHAactual; omisión de enlaces explícita solo por códigos identificados; candidata real aislada. O3sigue límite de fallo tardío honesto, sin silenciamiento. Los trescontrolesO1ycuatromutantesdeR1siguen atribuidos al autor y no se vuelven a contar como propiosR2.

### Aceptación acotada

Se acepta **CLAUDE-QA-086 como informe y banco de auditoría** sobre estos hashes. No acepta REL046/084/089, fuentesR1 u otras unidades propias, ni etiqueta la candidata como aprobada/desplegada. QAREVIEW088continúa enreviewpara otro revisor, sin autoaceptación. QA079/081/091conservan sus reservas. Sin proveedores, equipooriginal, servicios4331/4334, nuevasdependencias, commit/push o despliegue.
