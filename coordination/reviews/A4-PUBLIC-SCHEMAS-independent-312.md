# A4 · Revisión independiente del esquema público311

9 de noviembre de 2026, Europe/Madrid. Unidad CODEX-A4-SCHEMAS-INDEPENDENT-312; distinta de la revisión SourceStatusRow con sufijo312 del otro chat. Dictamen: corrección P2 antes de aceptar311. No se editaron las tres rutas presentadas.

- `shared/task-intents.ts`: `21263317e619e9016352163e04ca372a86dd8a4fe574ceb479da8985845d96ab`
- `tests/task-intents-contract.test.ts`: `2560dafb73a7d2147d51e5190e9739fba0fc9ab76b559dba9a83b3fdc195aeb8`
- `coordination/reports/CODEX-A4-PUBLIC-SCHEMAS-311.md`: `bcefa2db5a144a06f4e2aa1310969cabdcde07454437e16c1000bdbcc54387ff`

## Evidencia y alcance

Banco schema312-uDWV1p, fuentes exactas y dependencias de modelo/revisión fijadas porhash. Modelo1276b6ac yTaskRevision5ece83d8 son baseline existente sin reserva activa; no se supone que cada archivo inicial tenga una tarea done propia. Un preflight previo demasiado estricto se detuvo antes de pruebas al exigir ese registro para model.ts; se conservó, sin contarlo como defecto.

Se repiten10/10pruebas de autora sin cambios y tipos focales0. Tres sondas privadas: dos fallan por aceptación de los estados incoherentes siguientes y el control positivo pasa. Son pruebas de los esquemas puros con datos ficticios, sin Store, red, navegador ni servidor HTTP. No prueba una ruta vulnerable ya montada.

## F1/P2 · Check acredita comparación sin detalle y omisión incompatible

TaskIntentCheck admite operation settled/acknowledged con detailAvailable:false, evidence:applied, record/revision de tarea y reason:null. El summary admite correctamente un tombstone liquidado, pero Check no vincula su evidencia con la disponibilidad del detalle. Cuando se podaron base y parche, leer la tarea actual no permite decidir applied/unchanged/diverged de ese intento. La sonda exige rechazarlo y falla porque safeParse devuelve true. La comparación debe conservar evidencia unavailable con la causa pertinente, sin habilitar aceptación basada en esa comparación imposible.

Una segunda sonda recibe operation pending/detailAvailable:true, evidence:unavailable, record/revisionnull y reason:detail-expired. El esquema también lo acepta, aunque declara que ese mismo detalle está disponible. TaskIntentDetail ya relaciona metadata y motivo de omisión; Check necesita la relación equivalente para no presentar una causa falsa.

Se pide al menos rechazar evidencia comparada cuando detailAvailable esfalse y rechazar reason detail-expired cuando detailAvailable estrue. No se impone por esta revisión que la falta observada de una tarea deba desaparecer si el detalle también venció: ese caso puede tener su propia causa coherente, sin afirmar applied. El coordinador debe fijar la prioridad concreta en la API.

## Compatibilidad revisada y límites

El scope coincide con310para contexto válido: seis campos, pin, cuenta vacía distinta de null. acknowledgement usa changed/resultingRevision como receipt interno310; hasDetail se proyecta a detailAvailable y seq/fase/desenlace/procedencia se conservan. El servicio debe aportar el acuse real al liquidar antes de omitir writeResult; los esquemas no autentican el origen de ese dato. Lista distingue desconocido de vacío y comprueba ámbitos/duplicados. Los límites256/512KiB no sustituyen el límite del transporte ni los de208/claim.

310sigue presentada para revisión independiente y su baseline087está declarado pendiente. Este contraste estático no la acepta. Tras corregir Check, repetir las10pruebas, conservar los controles de omisión/acuses y añadir regresiones sensibles contra esta versión anterior. No se monta ninguna ruta o se activa covers por aceptar tipos.

## Control causal privado

schema312-causal-mBLigU añade solo las dos implicaciones descritas sobre la fuente congelada21263317: pasan13/13 (10previas+3sondas), tipos0. El producto no se edita. Un intento previo terminó con una comprobación de estabilidad del checkout demasiado amplia: el coordinador ya podía modificar311tras revise y su archivo cambió legítimamente. Se corrigió el observador para comprobar el banco congelado y se repitieron los13casos. Esto no acepta una futura R2 ni demuestra API montada.

## R2 · Contrato público aceptado

9 de noviembre de 2026, Europe/Madrid. Nuevas huellas: {"shared/task-intents.ts":"4413be57483b73f2135d5eec8073ce9e37f9d95fd60cfa3767593b665cdff94d","tests/task-intents-contract.test.ts":"a2b410d5e500ad91df09bfeb7c703842dfaadc14532250c0c82213404f241f3e","coordination/reports/CODEX-A4-PUBLIC-SCHEMAS-311.md":"fa998cae50f4328813609b8ab20f8c1e48876fdc4bb41bbc1738c3796fde4b0e"}. Banco schema312-r2-avxfpS:16/16Node (13autora+3sondas originales sin cambiar), tipos0. Las dos relaciones Check quedan corregidas: no comparación sin detalle y no detail-expired con detalle disponible. Se conservan missing, read-failed y response-too-large coherentes; los controles con detalle disponible y ausencia explícita tras vencimiento pasan. Modelo/revisión conservan los hashes del banco anterior. Fuentes presentadas cotejadas antes/después. Se acepta forma pública y validación, no API registrada, autenticación, CAS o cobertura de escritura.310continúa bajo revisión independiente y su integración tiene puerta propia. Las regresiones0/2con fuente anterior que reporta el autor se atribuyen a él; no se repitieron aquí.
