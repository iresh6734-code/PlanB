# Regresión093 · Conjunto TypeScript de candidata357

1/11/2026, 11:02:22, Europe/Madrid. Autor Codex. El turno anterior fue progreso: R1/O2/090 presentadas y revisión086devuelta; esta continuación amplía evidencia sin editar fuentes reservadas.

## Corte y ejecución

tests/.tmp/release-candidates/candidate-42c5f15c-99a2-4f4d-bd96-275f84c47f0f, source congelado en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/release-candidates/candidate-42c5f15c-99a2-4f4d-bd96-275f84c47f0f/source.94archivos tests/*.test.ts: es el alcance TypeScript de package.json, no los .mjs ni Playwright. Se ejecutan todos los archivos capturados, sin quitar tests históricos/TODO. Inventario y357hashes de origen en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/regression093-75a4033c-3dc0-46c9-ba02-9c894a2768e5/inputs.json. Hashes de todos los archivos de la captura cotejados antes y después: sin cambios. No afirmar que el snapshot sea repositorio íntegro o tenga auxiliares excluidos/dependencias propias.

Ejecución serial por archivo, con aislamiento Node por proceso; las pruebas de concurrencia internas mantienen Promise.all/transporte propio. Entorno OS por lista permitida y NODE_ENV=test; bloqueo externo existente. Datos ficticios y carpetas nuevas de pruebas dentro de snapshot, nunca bases anteriores/4420/4421/4331/4334. Referencias4334 de payloads/mockHost son texto sintético, no conexiones al piloto. Dependencias existentes por ancestros, sin instalar. Inicio 2026-11-01T09:45:30.555Z, fin 2026-11-01T10:01:58.683Z.

## Resultado completo, no verde global

Código de salida: **1**. Resumen literal deNode:

- tests: 1162
- suites: 12
- pass: 1154
- fail: 1
- cancelled: 0
- skipped: 0
- todo: 7
- duration_ms: 987715.478

Fallas distintas registradas (puede aparecer el mismo nombre otra vez en el resumen final):

- ✖ H9 caracterización: la búsqueda también coincide con la fecha, la entidad y la operación (no solo ID, campo y valores)

TODO emitidos por el runner (no contarlos como aprobaciones independientes):

- ✔ H3b HALLAZGO H-1: buscar un número de ID no debería devolver operaciones solo porque su fecha ISO contiene esos dígitos (429.0289ms) # QA073-H1: la búsqueda indexa `at`; el texto de ayuda promete ID, campo o valores
- ⚠ E2b HALLAZGO M-1: IDs con ceros a la izquierda (501 y 0501) se aceptan como altas distintas aunque son el mismo ID numérico remoto (52.7436ms) # QA073-M1: la validación compara cadenas, no valores numéricos
- ⚠ D6 HALLAZGO D-1: A→B→A no debería resucitar la casilla de una revisión retirada mientras la lectura nueva de A sigue pendiente (313.9208ms) # QA073-D1: reviewed no se reinicia al cambiar de contexto y reviewResponse conserva la respuesta de A
- ✔ E7b HALLAZGO M-1 (servidor): dos altas con IDs remotos numéricamente iguales (501 y 0501) se confirman como registros distintos (23.4903ms) # QA073-M1: la comprobación compara cadenas; HubSpot trata 0501 y 501 como el mismo objeto
- ✔ A16 QA060-F1 una relación vacía no debe enlazar el registro cuyo ID sea literalmente «undefined» o «null» (33.0915ms) # QA060-F1: server/workspace-search.ts usa String(valor) sin comprobar vacío
- ✔ A17 QA060-F2 un registro con nombre vacío debe mostrarse con una etiqueta identificable (0.4982ms) # QA060-F2: label sale como cadena vacía si el campo de nombre es «»
- ✔ A18 QA060-F3 si la revisión local cambia estando en la página 2 y la lista se acorta, la búsqueda debe volver a una página válida (1160.2042ms) # QA060-F3: src/WorkspaceSearch.tsx conserva offset al cambiar baseKey por localRevision
- ⚠ E2b HALLAZGO M-1: IDs con ceros a la izquierda (501 y 0501) se aceptan como altas distintas aunque son el mismo ID numérico remoto (52.7436ms) # QA073-M1: la validación compara cadenas, no valores numéricos
- ⚠ D6 HALLAZGO D-1: A→B→A no debería resucitar la casilla de una revisión retirada mientras la lectura nueva de A sigue pendiente (313.9208ms) # QA073-D1: reviewed no se reinicia al cambiar de contexto y reviewResponse conserva la respuesta de A

Log completo typescript-all.log y result.json en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/regression093-75a4033c-3dc0-46c9-ba02-9c894a2768e5. Un intervalo sin log no se interpretó como proceso detenido: se comprobó el mismo handle78577 y el árbol propio; el trabajador avanzó y no se reinició.

## Contratos históricos y diagnóstico focal

H9 exige que buscar el año devuelva las122operaciones por el campo at. La correcciónH1deHISTORY064retiró ese campo del índice; en una repetición aislada TAP devuelve36/122por coincidencias reales de campos/valores. No se debe restaurar la búsqueda por fecha solo para poner verde una caracterización que exige el comportamiento sustituido. QA079tiene asignada explícitamente su actualización tras cotejar la fuente corregida y controlespositivos; se conserva el test de su autor intacto.

D6 sigue marcadoTODO: repetición TAP falla al buscar una checkbox que ya fue retirada durante la lectura nueva trasA→B→A. No llega a afirmar resurrección de aprobación. E2bTODO falla en la expectativa textual antigua y muestra el mensaje nuevo de IDs canónicos sin ceros iniciales; no prueba que0501seaaceptado. Logs characterization-H9/D6/E2b.log separan estas causas. Los dos testsTODO devuelven exit0 por el marcadorTODO, no por pasar sus aserciones: no se declaran verdes. QA079debe reconstruir esos oráculos y demostrar el defecto con baseline antes de retirarlos.

## Siguiente

Revisión independienteQA079/081/091 yR2de086continúan pendientes. No hay entrega nueva deClaude observada en esta comprobación. Mantener reservas y revisar hashes actuales antes de aceptar informes. AUTH_PARENT072sigue pendiente porAppreservado. Esta verificación no valida proveedores reales, instalación productiva, lector de pantalla o todos los flujosE2E; no hubo despliegue/commit/push/equipooriginal. La app094se verifica en su informe propio y no representa una releaseaceptada.
