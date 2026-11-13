# Generación y revisión por HTTP187

4/11/2026, Europe/Madrid. Presentada para revisión independiente. Unidad de banco e informe,posterior a185aceptada por186;no cambia producto o demos. Dos reservas exactas:testnuevo `tests/task-revision-generation-launcher.test.ts` yeste informe.

## Flujo comprobado

**1/1prueba nueva y tipos focales limpios**,sobre elprincipal real compilado con185yHTTPnativo. Corte final `tests/.tmp/h187-90dd5cbe/s`,puntero `tests/.tmp/http187-latest.json`. No esapp.inject ni un endpoint inventado. HTMLmínimo,sinDOM;no se presenta como prueba deAppvisual.

Nueva carpeta `http187-395ee59d`,puerto53394,PID27540,instancia `f6530965-6af8-407f-99ef-6df6c6fbc151`. EndpointacreditaPIDdelhijo e identidadigual ahealth antesdelrecorrido. Base/semilla/clavekindtestnuevas,62registrosficticios18tareas. Entorno dehijo porlista permitida,sin.env/.ai/cuentas/tokens;preloadbloquearedexterna. Estadoinicial:0cambios,aiConfiguredfalse,disconnectedtrue,isTestDatatrue.

1. Cliente183lee una tarea/contexto/revisión deesta instancia. La generación inicial de la semilla tiene fecha fija anterior.
2. `POST /api/generate {mode:'demo',prompt:''}` real→200,providerdemo/modelnull/approvedfalse yfecha nueva. La especificación devuelta es exactamente la activa;notaexplícita de que no se llamó aIA. No se configura proveedor ni se habilitan servicios.
3. Mientrasla propuestaes candidata,GETv7mantiene eltoken anterior y0cambios.
4. `POST /api/activate {reviewed:true}` real→200. Lecturafresh183obtienerevisión distinta yfecha de generación deesa propuesta.
5. Cliente166con lavistaanterior:escritura→conflict;no-opconvalorantiguo→conflict. Cliente183concontextoanteriorrechazaantesdedespachar,context-changed,sinotroPATCH.0cambios.
6. Intenciónexplícita con183fresh→changed. No-opconlarevisión confirmada→unchanged/mismotoken. Historialtotal1cambio. No se renueva un token viejo para reenviar.
7. Configurarcontraseña inventada solo enesta carpeta→setup200. LecturassinCookie→failed401;GETautenticadocomprueba1cambio. BloqueoPOSTreal→200 ylecturaposteriorfailed401. Cookies ycontraseña no se guardan eninformes/registros de peticiones.

observed.json guarda32peticiones deltransporte (incluyehealth/state),con4PATCHv7:409,409,200,200. Los dos200son uncambio yunno-op,no dosfilas. Elrequestnativo de bloqueo yla lecturaautenticada se comprueban aparte yno están incluidos enesa lista32;lasprobesdearranque tampoco. No se presenta32como totalabsoluto de todala actividadHTTPdelproceso. NingúnPATCHusa legacy.

## Contraprueba y cierre

En el mismo snapshot privado,se quita únicamente generatedAtdel fingerprint y se vuelve acompilar elmainreal. El casoHTTP falla porAssertionError/notStrictEqual:activar mantieneincorrectamentelamisma revisión.0/1porcausalidad,sinerror deinfraestructuraotimeout. Script `http187-reverse.cjs`,reverse.log/reverse.json. Fuente restaurada ymanifiestocompleto cotejado. No es unbaselinehistórico ejecutable completo;esmutaciónreversade185.

Proceso positivo27540 yproceso decontraprueba24656 registranclose/SIGTERM yPIDausente;process-audit.json. Amboshijossonpropios,ninguna demopersistente se detuvo. Eltry/finally deltest cierra incluso al fallar la contraprueba,conplazode10s. Eltestcompletotiene90s ysuarranque30s.

Primer corte `h187-2468b946` también pasó1/tipos ycontrapruebacausal;despuésse añadióaserciónexplícita dedisconnectedtrue ysu campo de evidencia,se repitióenotra carpeta paraelcortefinal. Los PIDs18288/19576 deeseprimerpar también registranclose/ausencia. No se suman ambas pasadas como dos casos nuevos.

## Evidencia y alcance

Scripts propios `tests/.tmp/http187-verify.cjs` (snapshot/tipos/HTTP),`http187-reverse.cjs` (contraprueba/restore/auditoría);manifiesto,trazadelcaso,logs,server.mjs yfixtures enelcorte. Envelopedevariablespermitidas yredexternabloqueada;loopbackconpermiso deentorno. El test final es idéntico al congelado/cotejado. No se repitieron los58de185 aquí;se leyó su revisión independiente186que sílosrepitió,tipo0ycontrapruebapropia1pass/4fail. Estas cifras siguenatribuidas a186,además dela ejecución previa propia185.

No UI/lector de pantalla/otrosnavegadores,proveedores,datosinstalados,originalcorporativo4331/4334,dependencias,rootbuild/dist,worktrees,commit,pushodespliegue.183/166/185productoaceptado yfuentesClaude intactos. Esta unidad no modifica181en4595,que permanece conbackendanterior185/UI158legacy;saludnorepetida. No hay certeza deprocesopersistente por una memoriahistórica.

La garantía185sigue ligadaalosvaloresdel fingerprint yunescritorcooperativo,noidempotencia,autoría,multiprocesooidentidadmonotónica.170/U2pendientes antesdeadoptar183/166congestor136enlaApp. Nueva actualización visible o debackend requiere otraunidadexacta trasdictamen,con fixture/buildpropios.
