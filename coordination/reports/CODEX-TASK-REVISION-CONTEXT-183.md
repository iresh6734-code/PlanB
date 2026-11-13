# Puente de contexto y revisiones183

4/11/2026, Europe/Madrid. Presentada para revisión independiente. Mejora preparada para adoptar166 sin perder el contexto completo123; no es montaje visible ni SaveStrategy136. Cuatro rutas reservadas, fuentes de Claude intactas.

## Problema y cambio

166comprueba instalación/ID/fecha de captura. Su handoff exige que un consumidor conserve además cuenta,inicio de captura y generación de123. El módulo nuevo `src/task-revision-context-client.ts` hace esa composición,con lectura antes/revisión/después,un guardado que mantiene el token originalmente revisado y comprobación de resultado incierto exclusivamente medianteGET.

Un cambio de contexto producecontext-changed sinPATCH. Los fallos anteriores al envío se distinguen de un rechazoHTTP después de despachar o de la ausencia de acuse. changed/unchanged/current se conservan;no-op no se degrada a otroguardado. Un404 recibido al cambiar la captura durante la lectura no se convierte en una desaparición acreditada de la copia original. Clona entradas antes deawait y fuerza no-store/same-origin/redirect:error en contexto.

No modifica166/123/136/170/U1/U2/App/servidor ni la demo181. No es otro controlador, no almacena intención y no añade un camino visible alternativo. El traspaso `TASK-REVISION-CONTEXT-183-HANDOFF.md` detalla resultados y la integración posterior acordada,que necesita otro encargo tras170/U2aceptadas.

## Verificación propia

Snapshot válido `tests/.tmp/ctx183-d1f66620/s`, puntero `tests/.tmp/context183-latest.json`. Corte nuevo, manifiesto de fuentes/hasheseinputs166/160aceptados, sin enlaces. Solo datos ficticios yAppsFastify/SQLiteenmemoria nuevas porcaso. Entorno de pruebas por lista permitida,NODE_ENVtest yredexternabloqueada. No lectura de otra instalación o secreto.

**14/14 nuevas +43/43 relacionadas =57/57Node**,0skip/TODO/cancel. Typecheck focal limpio de las fuentes y prueba nuevas. Relacionadas:21cliente123,11lógica123,11cliente166;la última incluyeHTTPloopback nativo real. Las nuevas usanapp.inject contra la App/Store reales para poder fijar barreras y ventanas, no un backend inventado. Su oráculo comprueba cambios/valores/identidades delStore y peticiones, no solo un booleano de resultado.

Se cubren:

- changed/no-op/current,tokenviejo,revisiónnueva y opciones de caché.
- Las seis partes de identidad decontextKey,cambio antes/durantelectura,404deotra captura y comparativa controlada de la identidad intencionadamente menor166.
- Edición entrepreflight/PATCH:conflict,tokenoriginal enviado,valorajeno preservado,un cambio.
- Acuse perdido después decommitreal:uncertain,verificación5GETsinPATCH,appliedobservado sin confirmación/autoria,nueva revisión observada;otrointento explícito viejo sigueconflict.
- unchanged/diverged como evidencia;entradas inválidas/contextoerróneo/cancelación previa sinred;mutaciones del llamante durante una barrera no cambianid/token/intención.
- Contexto esperado clonado antes deawait;cancelaciónpreflight0PATCH frente a cancelacióndespuésdedespacho1PATCH/incierto.
- Endpointausente404sinlegacyfallback,tareaausente,401preflight,401postdispatchreal,409returnBusy distinto de conflict,422porcampoajeno sin escritura.
- Estadoincompatible,mensajeconfidencialdetransporte no copiado,deadline de preflight que ignoraAbortSignal,desactivación y plazo0rechazado.
- Límite explícito de atomicidad de metadatos, descrito debajo.

Logs `typecheck.log`, `node-new-and-focal.log`, `result.json` en el corte. Comando `node tests/.tmp/context183-verify.cjs` crea otro snapshot y ejecuta tipos/Node contsx ypreload bloqueador;permiso de loopback para la regresión166 existente. No se ejecutó rootbuild/npmtest oDOM, al no cambiar superficie renderizada. Las Apps se cierran enfinally;no procesos persistentes nuevos de183.181no fue operada.

## Sensibilidad causal

Cuatro mutaciones, solo en el snapshot privado, cada una ejecuta su caso objetivo y falla porAssertionError, sin fallo de infraestructura otimeout:

1. Omitir cuenta/generación/inicio delcontextKey permite llegar alPATCHenotra cuenta:el caso esperabacontext-changedyrecibeconflict,rojo causal. Elservidorevitaescribir por su fingerprint;la prueba exigeademásnoenviar.
2. Renovar revisiónporGETantes deguardar hace que un intento viejo seacepte en lugar deconflict.
3. Omitir comprobación posterior decontexto abre la lectura deotra generación como si fueraconsistente.
4. Conservarreferenciaviva dela vista revisada permite cambiarla durantepreflight y rompe la intención congelada.

`mutants.json` acredita4/4sensibles. Logs `mutant-*.log`;script `context183-mutants.cjs`. Fuentes privadas restauradas y todoelmanifiesto cotejado alfinal. No se presentaesto como versiónanteriorhistóricadelmódulo:nuevaunidadsinbaselineanterior;sonmutacionescausales.

Primer corte `ctx183-188047c6`:55Node(12nuevas+43)verdes,pero tipos con2errores deestrechamiento deunión(discriminantecompartido). Se corrigió la declaración de tipo y se añadieron dos controlesHTTP/límiteatómico antes del corteválido57/tipos;se conserva el corte inicial,no se atribuyen errores detipos alproductoajeno.

## Límite observado y riesgo residual

**No es CASatómico sobre todoTaskContext.** Las lecturas son muestras. El token128 liga snapshot/spec/sesión/registro/historial,en su únicoescritor,pero no generation.generatedAt por separado. Control determinista:mutar esa fecha traspreflightantesdePATCHpermitechanged;verificar luego devuelvecontext-changed. Mutar cuenta dentrodelsnapshotenlamismaventana produceconflict. Un protocoloqueexija atomicidaddeotrosmetadatos necesita ampliar explícitamenteelservidor;183noescondeesaventanaconlecturasextra.

Leer valores iguales no pruebaautoría,verificar no confirmaelacuse,no hay reenvíosautomáticos,idempotenciaporintención,persistenciaomultipestaña. Los resultados no llamanefectosUI por sí mismos;el adaptador futuro debe preservar onDispatch,lifecycle,changed:false/token yla procedencia. No providers,credencialesreales,corporativo/4331/4334,cambiosdedemos,dependencias,worktrees,commit/push/despliegue oautoaceptación.
