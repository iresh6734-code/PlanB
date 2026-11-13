# Revisión de tareas y generación185

4/11/2026, Europe/Madrid. Presentada para revisión independiente,sin autoaceptación. Unidadposterior a183donepor184. Server y prueba183 se editan bajo la nueva reserva185, no durante la revisión anterior. Seis rutas reservadas;cinco modificadas y elhandoff183preservado byte a byte por acuerdo con el otro revisor. La aclaración401 va en elhandoff185nuevo.

## Problema y cambio

Un editor podía guardar con un token anterior a una generación nueva de fecha distinta y especificaciónidéntica. Elfingerprint128incluía spec/snapshot/sesión/registro/historial,pero no generation.generatedAt. No era necesario manipularStoremeta:el flujo normal `saveGeneration`→candidata→`activate` lo reproduce con registros yspecidénticos.

`server/task-revision.ts` añade solo generatedAtal objeto hasheado,y actualiza su comentario. No cambia rutas,respuesta,autenticación,Store,cliente166 o183. Ahora el token anterior recibe409/TASK_REVISION_CHANGED tanto para escritura como para no-op;el token nuevo mantiene changed/unchanged/nueva revisión. La prueba de límite histórica183se convierte bajo185 en regresión de generación/cuenta que espera conflicto en ambos casos, conservando también la detección deotro campo decontexto. El código183y sus informes/handoffaceptados permanecen intactos.

## Baseline causal previo

Sonda privada `tests/.tmp/probe185.ts`, sobre elservidorcongelado183:especificación idéntica,fecha nueva mediante saveGeneration+activate reales,0cambiosantes,misma revisión y el token antiguo puede escribir. La preparación inicial por comando de shell falló por comillas yno creó/ejecutó código;se corrigió usando un archivo. No es fallo deproducto.

Baselinecongelado `tests/.tmp/g185-baseline-1846775e/s`:**5casos nuevos,1controlverde/4rojosporAssertionError**,sin error deinfraestructura. Se conserva baseline.log/manifiesto/hashdelservidorytest. Las expectativas nuevas no se relajaron entre baseline ycorrección:el testnuevo en la fuente final es byte a byte el que falló con elservidorviejo.

Los cuatro fallos son:revisiónidéntica trasactivarfechanueva,tokenviejoaceptado200enlugarde409,activacióntrascandidatano invalida y carrera activaciónentrepreflight/PATCHaceptada. El controlverde:fecha/contextoidénticos no se invalidan por el mero archivado.

## Verificación final

Snapshot `tests/.tmp/g185-c9c9f48f/s`,puntero `tests/.tmp/generation185-latest.json`,manifiesto conhashes,baseline einputs183aceptados. **58/58Node,0skip/TODO/cancel**,typecheckfocal limpio de nueve suites:

| Suites | Casos |
| --- | --- |
| Nuevageneración185 |5 |
| Contexto183,incluidocontrollímiteactualizado185 |14 |
| Cliente166 |11 |
| Core/API128 |16 |
| Montaje160 |8 |
| Main167/runtime168 compilados |2 |
| Ciclo177cliente166conambosbinariosreales |2 |

Las5nuevas usanApp/Store reales enmemoria,app.inject ybarrera en transporte para activar después delpreflight y antes delPATCH. No reemplazan elservidor por unmock:contrastan cambios,datos,digests de records/changes,token yrespuesta real. Cubren candidata noactivada,activaciónfechaidéntica,tokenviejo paraescritura/no-op,revisiónfresh no-op/cambio yactuaciónenventana. Lasrelacionadas mantienen la comparacióncuenta/spec/captura/instancia,historialyABAdeediciones,nofallbacklegacy,acuseperdido,locks/auth/Host/Origin/returnBusy y no-op.

Los lanzadores yelciclo177compilan el servidor nuevo dentro de carpetas nuevas,claveskindtestprecreadas/semillas/sesionesficticias,redexternabloqueada. LasApps inject secierranenfinally. `process-audit.json` acredita6hijos propios conclose y PIDausente:13228/2836 delciclo,10732/32108 delmain,360/27504 deruntime. Los dos contendientes salen1 rechazadosporlock,conBDigualydueñovivo;losotros cuatro cierran porSIGTERM. No se pararon demos oprocesos ajenos.

Comando `node tests/.tmp/generation185-verify.cjs` crea corte nuevo y ejecuta tipos/Node mediante tsx con entorno porlistapermitida ypermisoloopback para suitesHTTP/compiladas. No rootbuild/dist,dependencias nuevas,pruebaDOM o suiteglobal. No hay cambio renderizado deinterfaz en185.

## Contraprueba reversa

Solo en el snapshot final se retira el campo generatedAt del fingerprint. Los mismos5casos vuelven a **1pass/4fail porAssertionError**,sin error deinfraestructura otimeout. `reverse.json`/`reverse.log`;fuente restaurada ymanifiesto completocotejado. Es mutación reversa del campo nuevo;elbaselineanterior completo también está conservado por separado. No se sumancomo8pruebas nuevas.

## Atribución y límites

183aceptada por otroCodex184:leyó4hashes,repitió57Node/tipos ysonda401sintética independiente. Sus57son otraejecución yse mantienen atribuidos,no se suman a58. Se leyó su dictamen. readContext123heredaevento `planb:locked` ante401 en navegador;183noloañadepero tampoco eliminaeseefecto. Handoff185loaclara sin editarhandoff183aceptado.

La revisión liga valoresactuales,incluidafechageneración;no es contador monotónico deactivaciones,autenticidaddeautoría,idempotencia porintención,CASmultiproceso o protección de rutaslegacy. Reusar exactamente los mismosvaloresligados puede producir el mismotoken. Verificaciones decontexto antes/después siguen siendo observaciones;elservidoraplica sucomparaciónsíncrona bajoúnicoescritorcooperativo. No se convierte una lectura coincidente enacuse.

La demo181no se modificó ni se verificó enestaunidad:sigue compilada conbackend4d63e027… anterior185/UI158legacy.170/U2/gestor136/fuentesClaude intactos. Actualizar una copia requiere nuevaunidad tras dictamen,conbuild/fixturepropios. SinHubSpot/Google/IA/credencialesreales/corporativo4331/4334,commit,push,worktreeodespliegue. Siguiente:revisiónindependiente185 y continuar170→U2 antes deadoptar183/166enunúnicoflujodeApp.
