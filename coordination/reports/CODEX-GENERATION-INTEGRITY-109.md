# GENERATION-INTEGRITY-109 · Generación bloqueada sin candidato residual

1/11/2026, 16:34:59, Europe/Madrid. CorrecciónF4deQA091validada por108. Presentada para revisión, no instalada ni autoaceptada.

## Problema y cambio

Antes, POST /api/generate/demo con plan persistido inválido llegaba a saveGeneration, que devolvía409. Su catch llamaba failGeneration sin guarda y añadía meta.candidatecon copia de la captura/error, o lastErrorsi no estaba activada. Aunque la respuesta indicaba bloqueo, la Store había cambiado.108reprodujo este defecto sinTODOen una copia privada.

Ahora el registrador comprueba integridad al entrar en la sección exclusiva, antes de leer configuración o construir una propuesta. Relee después de obtener configuración, antes de invocar el generador. Si falla cualquier fase, la escritura del diagnóstico de generación se hace dentro de **una transacción con relectura de integridad**. Si se perdió integridad durante la espera o justo antes de esa transacción, devuelve409canónicoRECOVERY_PLAN_INVALID y conserva todas las tablas. El error tardío del generador no sustituye ese diagnóstico. No convierte bloqueo en candidato fallido o repara el plan.

Los fallos normales sobre Store válida siguen guardando su error permitido en candidate/lastError y liberando la exclusión para otro intento. Los errores inesperados no exponen mensajes privados. La generación demo normal mantiene sus metadatos, no invoca IA y no cambia datos/reglas de la app activa hasta revisión/activación.

El cuarto argumento opcional de registerGenerator permite un generador de prueba determinista del mismo tipo, por defecto generateWithAI existente. No se añade parámetroHTTP, ruta o mecanismo de selección para un cliente. Los entrypoints existentes siguen con tres argumentos. Se prueba también la dependencia real por defecto con configuración ausente:503honesto,0filasusage y ninguna red. La inyección de éxito en otras pruebas es una dependencia ficticia, **no** una llamada o respuesta de modelo real.

Solo generator.ts y tests propios nuevos. Store/Recovery055, fuentesQA091/079/106, contratos globales, App y navegación intactos.

## Comprobaciones actuales

**83/83 focales,0fail/skip/TODO**:16nuevas de generación+67existentes de core/provider/v2/activation-review/recovery-integrity/recovery-uncertainty. Typecheck focal e imports limpio. Bundlesesbuild de server/main.ts yserver/runtime.ts correctos en carpeta nueva, packagesexternal; no ejecutados o instalados. No es candidata de release completa ni browserbuild.

Los16casos nuevos cubren bloqueo inicial demo/AIcon/sin activación, conservación por digests de todas las tablasSQL(incluidassqlite_sequencecuando existe),0lecturasconfig/0generaciones si empieza inválida, demo positiva y aplicación activa intacta, dependencia inyectada retenida/success, dependencia por defecto sin configurar, AppError/errorprivado normal con ysin activación+reintento, corrupción durante awaitconéxito/error, corrupción al leer configuración, corrupción justo antes de transacción y dos generaciones simultáneas sin superar exclusión.

Carreras deterministas mediante promesas e instrumentación de la transacción de esa Store ficticia; sin sleeps o transporte real. Se guarda el ledger después de corromper, se compara al acabar. La inyección previa a BEGINdemuestra que la guarda vive dentro de la transacción, no solo antes de ella. La exclusión mutua cuenta configuración/trabajo, respuesta de segunda petición y posibilidad de tercer intento.

### Oráculo independiente y sensibilidad

- El casoF4deClaude, copiado privadamente y sin su etiquetaTODO, pasa1/1contra esta fuente. Su archivo compartido aceptado queda intacto como evidencia del corte anterior; no se editan susTODO.
- Nuestra pruebaF4contra generator.ts anterior de108falla0/1 por digestmetadistinto. Ese módulo anterior se copia con imports ligados a las dependencias del mismo snapshot; no comparación rota por clases distintas o setup.
- Tres mutaciones privadas de la fuente final fallan0/1cadauna:quitar guarda inicial permite1lecturaconfigdonde se exige0;quitar guarda dentro de transacción devuelve502envez del409canónico;quitar relectura postconfiginvoca generación cuando no debía. Controles reales incluidos en83/83. No se afirma que cada assert posterior se alcanzase en el mutante que falla antes.

Evidenciafinal D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/generation109-b27ac08f-a197-42a1-8796-eac6ecb47da0; hashes de207inputs congelados cotejados antes/después. Proyección de108más archivos propios y seis bancos actuales; no se atribuye a esta copia todo borrador vivo de106u otras sesiones. Dependenciasnode_modulesexistentes no congeladas. Logs focal/F4-required/previous-F4/typecheck, inputs/results/final y sensibilidad D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/generation109-b27ac08f-a197-42a1-8796-eac6ecb47da0/sensitivity-649c44d2-9db5-4187-92d7-3ce044bd1570.

Pruebas conFastify.inject y Store nueva:memory:. Las suites existentes crean sus propias carpetas de fixture en scratchprivado. En Windows, algunos casos de core/provider/v2 crean claves nuevas mediante la protección DPAPI del usuario actual: NODE_ENV=test no obliga por sí solo a crear claveskind:test. La afirmación anterior de ausencia total de DPAPI era demasiado amplia; no se conserva como garantía. No se leen claves previas u otro equipo. Su cleanuprecursivo se instrumentó para comprobar resolved/realpath dentro de source/tests/.tmpde esta copia antes de borrar; no se alteraron sus aserciones o directorios existentes. Bloqueador externo cargado, envsistemaallowlist, sin listenerTCP en esta fase o cuenta/proveedor real. Las16nuevas son de memoria; no se trazó individualmente cada invocación de DPAPI de las suites existentes. Esbuildsolo compila; no lee configuración real o ejecuta los entrypoints.

## Incidencias de preparación conservadas

Primer banco nuevo15:13pass/2fail. Mis controles de éxito inyectaban resultado válido con configuraciónnull; la ruta existente necesita config.modelal registrar generaciónAI. Se aportó una configuración ficticia coherente al mock y un caso separado de dependencia por defecto sin configurar. No se cambió producto para aceptar configuraciónnull. Después16/16.

Primer corte amplio83/83y controlesF4pasaron, pero tsc señaló nevertras assert.equal(store.candidate,null) y await:el estrechamientoTypeScriptse mantenía sobre el getter. Se capturó el valor pendiente en variable local antes de afirmar, manteniendo la misma propiedad. Nuevo corte final83/83+tsclimpio. Ambos cortes/errores se conservan, no se suman. Node advierteSQLiteexperimental; gitdiff--check acotado limpio, con avisoLF→CRLFdepolíticagit. Sin dependencias nuevas.

## Límites y siguiente

F4corregido en fuente, pendiente revisión independiente/integración. No cambia Store.failGenerationpara todos sus llamadores o garantiza reparación de SQLite. La transacción protege la escritura de error del registrador frente a escritoresSQLite, no revierte configuración leída o efectos externos ya despachados. Las16pruebas nuevas nunca invocan proveedor; la contabilidad real de generaciónAIen vuelo está fuera de esta corrección. No se afirma que una reserva legítima ya despachada de coste deba deshacerse por perder integridad.

F1/F2/F3deQA091siguen pendientes enStore/Recoveryy deben abordarse bajo las reservas exactas existentes con nuevo encargo coordinado. O1sigue observación de captura ya despachada. QA091aceptada como auditoría, no todo producto. QA079R2ya se presentó con nuevos hashes y requiere revisión separada; App/SEARCH053sigue divergente, no aceptado por este cambio. LAB036sinreserva/submitnointegrada;106workingconreservaindependiente.035/101/103/104no se autoaceptan.

Sin cambios deUI/CSS: no navegador nuevo necesario. No actualiza demo100/104oarranqueinstalado, no npmrunbuild/rootdist, deps, equipooriginal/4331/4334/4420/4421, commit/push/despliegue. No checkoutglobalverde:los otros tres hallazgos y pendientes históricos se mantienen. Objetivo continuo activo.

## Hashes propios

- server/generator.ts: c0de2c8ecf574cee8e58781d5b341925a821a402a94072a46f123d52a4a82b13
- tests/generation-integrity.test.ts: 8e0333e039127556cf6a6f6b402e094a254a8fb05cd1f557cf9632dd35423659

- server/main.ts bundle: 6b6008d2c5be704ec5642a3fa7e5c191a7e9051782183deb1018f2c5d6509771
- server/runtime.ts bundle: 77adb088d58b73bf491a2b3073cdec0f352cd5ce73bbe501789e81ef1c7ca9ed

El hash del informe se registra en submit. Sin autoaceptación.

Aclaración documental 1/11/2026, 16:43:16 Europe/Madrid: plataforma win32, rama localKeyWindows y suites de claves nuevas revisadas. Informe anterior preservado en report-before-local-protection-clarification.md; sin cambios a fuentes/pruebas o resultados.
