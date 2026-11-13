# PERSISTED-RECOVERY-111 · Conservar evidencia y controlar resultados remotos

1/11/2026, 17:06:50, Europe/Madrid. CorreccionesF1–F3confirmadas en108. Fuente055y unidad111presentadas para revisión; sin autoaceptación o instalación.

## Coordinación y alcance

Nuevo brief CODEX-PERSISTED-RECOVERY-111.md declara las dos fuentes exactas Store/Recovery bajo la reserva055existente, devuelta aworking antes de editarlas.111reserva solo brief/test/informe nuevos. No se duplican reservas, se toman archivosClaude o se acepta una dependencia para sortear la coordinación. Testoriginalrecovery-uncertainty no cambia; informe055anterior preservado byte a byte en carpeta de evidencia. Su nuevo corte vigente distingue fuentes actuales del historial de verificaciones/candidatas anteriores.

## Comportamiento

**F1:**la migración de cifrado identifica la fila meta.recoveryPlan. Si su texto no esJSONo no tiene estructura de plan válida, no la sella, normaliza o descarta. Store abre y su lector ya existente publica el diagnósticoR1invalid, conservando contenido bruto. Valid/nullmantienen la migración normal aenc1. El JSONmalformado de cualquier otra fila sigue produciendo rechazo/rollback; no se convierte corrupción arbitraria deSQLiteen appválida.

Las seis variantes nuevas se reabren tres veces con fila/ledger/archivo idénticos en fixtures ya cifradas salvo ese plan. Eso no significa que el archivo completo de cualquier instalación heredada permanezca idéntico si otras filas válidas necesitan migrarse legítimamente. La fila dañada heredada plaintextse conserva **sin sellar**: no es cifrado o reparación de esos bytes. APIlegible permite consultar historial con mensaje fijo ysin eco del contenido del plan.

**F2:**localRecord devuelve AppError409si una operación activa ya no tiene registro local. approve conserva el estado y applylo comprueba antes deverify/cualquier envío. Se relee cuando se usa tras esperar; si la ficha se retira duranteverify, no se crea nada y el protocolo existente guarda un fallo de operación controlado/partial con estructura válida. Ese resultado posterior no se presenta como rollback del cambio externo o comoHTTP409garantizado después de empezar: applynormalmente devuelve el plan parcial. No se fabrica ficha/identidad para continuar.

**F3:**antes de asignarIDdecreate se exige cadena no vacía; se conserva exactamente, incluidos0, IDsgrandes y opacos. No se usaString/Numberpara aceptar una respuesta malformada. Si el efecto ya pudo ocurrir, opuncertain/planpartial yapprovedAtnull; remoteIdqueda null y mappingprevio intacto. No relación/lectura posterior con un IDinventado, watermarkavanzado o reintentoautomático. Reiniciar conserva incertidumbre; una resolución explícita mediante IDreal leído permite terminar sin otra creación. Se trata de Remotequeviola su contratoTS; no evidencia de incidencia real deHubSpot.

**Guardado:**save comprueba R1del estado actual y estructura del nuevo plan dentro deBEGIN, antes de escribir mapa/plan. Una decisión de tipo inválido no puede invalidar el plan persistido. Error502fijo sin eco del dato. Si la fuente se corrompe justo antes de la transacción, prevalece el409canónicoR1, no el error de una estructura nueva. No valida toda semántica relacional o prueba éxito remoto por pasar schema.

## Evidencia propia actual

-**194/194focales** en16archivos,0fail/skip/TODO, incluidas12regresiones nuevas y matrizoriginal055,087/109,core/provider/v2,activación,custodia,preflight/cobertura/manualID/evidencia101/API103y bancos independientes deQA052/SAFE049. No todos los tests del checkout.
-**247/247QA091**,0fail/skip/TODO:se ejecutan los tres bancos exactos aceptados, quitando únicamente las cuatroetiquetasTODOdeF1–F4en copias privadas. Los originalesClaude aceptados no se editan. Seis arranques realesmain/runtime con fixtures nuevas en4541–4549incluidos; procesos finalizados por handle. No se repiten sus E2E.
-Mismas trespruebas propias seleccionadas contra parejaStore/Recoveryanterior de110:0/3, fallan porAssertionError de apertura, AppErrorcontrolado y planválido tras respuesta malformada. La primera versión preparatoria de esos tests mostrabaSyntaxError/R1directos; se refinó el oráculo para afirmar explícitamente las propiedades, sin relajar comportamiento.
-Tresmutantes privados de la fuente final detectados0/1cadauno:quitar validación del plan permite persistir una decisión inválida;coercionarIDconStringasigna7envez de conservarnull;omitir retirada deapprovedAtconserva la aprobación ante incertidumbre. Los controles reales están en194/194. No se afirma que todas las aserciones posteriores se alcanzasen en el mutante que falla antes.
-Typecheck focal de las19entradas/imports limpio; dosbundlesesbuildmain/runtime conpackagesexternalcorrectos en carpeta nueva. Compilación, no ejecución de esos bundles o candidata de release completa. Diffcheckacotado limpio, avisoLF→CRLFdeGit. Node avisaSQLiteexperimental.

Snapshot D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/qa091-resilience111-c86e2d80-a27b-4deb-b302-d45b138e04b7;227inputs congelados y hashes cotejados antes/después. Proyección de110más fuentes/testsbajo prueba y ambasCLI requeridas; node_modulesexistentes no congelados. final/results/inputs.json, focal/independent247-required/previous-three/typecheck.log y sensibilidad D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/qa091-resilience111-c86e2d80-a27b-4deb-b302-d45b138e04b7/sensitivity-747b79f7-af0c-49a3-8550-bc63bc0dfb42 preservados. No sumar repeticiones de preparación o tratar194+247como todo el producto validado.

Docecasos propios:seisvariantesplaintext/18reaperturas, positivosvalid/null, corrupciónotrafilayrollback,APIhistoriallegible,approveausente,applyausenteantesdelremoto,retiradaduranteverify,sieteformasIDmalformado,tresIDválidosexactos,resolucióntrasreinicio,decisióninválidasinescritura ycorrupciónenfronteratransacción. Son12tests con variantes internas, no12garantías universales.

Fixtures nuevas ydatos inventados. Las12nuevas usanmemoriaoclavekind:testprecreada explícitamente, sinDPAPI. Suitesexistentescore/provider/v2pueden proteger claves nuevas de ficción conDPAPIactual; no se afirma su ausencia porNODE_ENVtest. No claves anteriores/uotro equipo. Cleanuprecursivodelas suites se limita por resolved/realpathal scratchprivado. Redexternabloqueada yentornosistemaallowlist; fuentes/datosnoenviadosa proveedor.

## Incidencias de preparación

Primera ampliación:188/194pasaron, seisCLI fallaron porque la proyección omitía scripts/check-recovery-copy.ts yscripts/check-backup-coverage.ts. projection-omissions.jsonconfirma ausencia; fuente/testsfocalesconservados en qa091-resilience111-24dde8e9-3933-45f9-b7e4-6f00b6a75879. Se incluyeron ambas entradas en **carpeta nueva**, sin alterar producto o testsparaaceptar ausencia. Final194/194y247/247es el corte presentado; no ocultar fallo o sumarlo como regresión arreglada de producto.

## Límites y continuación

Los cuatrohallazgosQA091tienen corrección en fuente: F1–F3aquí/F4en109; eso no los convierte en aceptaciones de producto o instalación. Falta revisión independiente del nuevo corte055/111/109 y de integración. La comprobación adicional de estructura es lineal porguardado, además de la serialización existente; no se midió un benchmark de10.000operaciones enviadas. R1es estructural; claves perdidas/otras filas dañadas/SQLitepáginasno se reparan. No se revierten efectos remotos ya despachados o se convierte custodia declarada en recuperación demostrada.

QA079R2aceptada por110conAppdivergente explícita, no aceptación de072/SEARCH053.036sinreserva/submitconF1/F2de099pendientes;106mantiene su reserva independiente, sin editar sus archivos.101/103/104yotrasfuentespropiasno se autoaceptan. Memoria/panel035solo documentales al cerrar. No actualización de demos100/104, equipooriginal/4331/4334/4420/4421, deps/rootbuild/dist/autostart/commit/push/despliegue. Sin UI/CSSnuevo:no navegador adicional requerido. Objetivo continuo activo.

## Hashes finales

- server/store.ts: 9d08d9cc06f8c4cf45f60d6b963e3ad566e95aa34253a9c2ab2dc25bd682f65f
- server/recovery.ts: b56e5d7255d93d3e7526dc2afbe6a629e558f1378e473c33cb8ce18a357ea86f
- tests/persisted-recovery-resilience.test.ts: e602827319b58dba8a24a98c73308359d3717c173a18d2bbde9f1a8f0f4f7c6a
-tests/recovery-uncertainty.test.ts(original055intacto):31c5065783f8af4a9b429281c27acbc0d8d2c9c0d4314e6285006e6f2b1c1a9f
- server/main.ts bundle:a5d8a90e85efec94694e05373dfaa698c1e9aaeaa1dd41de707462320b6e6494
- server/runtime.ts bundle:79400de774300333d2f02c1f9a3411d6226982f3fee4c632945fa4cdb627fb1d

Hashesdeinformes/briefyfuentes055quedanensubmit; ningunaautoaceptación.
