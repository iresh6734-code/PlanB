# EVIDENCE-API-103 · Lectura local de evidencia con identidad de servidor

## R3 · La revalidación sigue a la última lectura de identidad

6 de noviembre de 2026, Europe/Madrid. El dictamen 252 reprodujo un HTTP 200 con hechos cuando la sesión vencía durante el último acceso a `instanceId`. Se conserva la lectura final de identidad y se mueve antes de volver a comprobar el permiso original. Si coinciden caducidad y cambio de identidad se devuelve el 401 genérico. Si solo cambia la identidad se conserva 409. Los errores de caché, el acceso sin contraseña y la firma de registro se conservan.

La prueba nueva usa una sesión ficticia vigente y, en el segundo acceso a identidad, avanza el reloj un milisegundo más allá del vencimiento. Prueba identidad estable y cambiada. En ambos casos se exige 401, solo cuerpo de error, sin cookie ni escrituras. La ruta previa falla por 200 frente a 401. La sonda independiente 252 y la anterior de 244 pasan con la corrección. El corte `tests/.tmp/evidence-r23-sLsKye` reúne 92/92 Node y tipos focales correctos, incluidos servicio 101, API 103, cliente 104, seguridad 245, motor y cola. Dos rojas causales en el corte previo, una por frontera de sesión y otra por el agregado técnico de 101.

Montaje privado de 239 en `tests/.tmp/evidence239-r23-1f46fM`. Se recompilaron main, runtime y main de control con 125 archivos verificados. La ruta del main de control dio 404. Con el registro, pasan los dos recorridos HTTP. Se verifica 401, 403, pin vencido 409, cero escrituras de lectura, agregado técnico 1 de 2 y ausencia en runtime. Cuatro procesos ficticios de loopback cerrados. La prueba de caducidad se hizo por inyección, no induciendo tiempo dentro del binario. La proyección privada no modifica `server/main.ts` ni la demo 236. El montaje sigue esperando los dictámenes de 101 y 103.

- `server/continuity-evidence-api.ts` · `3a67f18f107c14cab40818c5617389500c3fa6992be139d15669dd149f90eb4e`
- `tests/continuity-evidence-api.test.ts` · `b0be4ecf1d3e68e09612054152953aefbbf08b42bbb40d8963f856c664be2672`

El contrato v1 conserva su huella. 245 ya cuenta con revisión independiente. Las secciones R2 y original abajo describen sus cortes históricos.

## R2 · Revalidación del permiso original antes de publicar

6 de noviembre de 2026, Europe/Madrid. El dictamen 244 reprodujo un HTTP 200 con hechos cuando la sesión vencía durante el cálculo. El registrador usa ahora el guard de la misma instancia Fastify a través de 245. Captura el permiso original, lo exige antes de calcular y lo vuelve a comprobar antes de enviar el resultado. Si vence, devuelve 401 genérico con `no-store` y `Vary: Cookie`, sin hechos, renovación ni cambios de datos. Se conserva la firma de registro, el acceso local sin contraseña, el cuerpo v1 y la comprobación de identidad de instalación. La API sigue pendiente de montaje 239.

Con solo el registrador anterior, la nueva regresión falla por `200 !== 401`. Con el registrador corregido pasan 73/73 de autenticación, API, servicio, motor y cola y 2/2 sondas independientes 244 sobre caducidad y archivo incoherente. Typecheck focal correcto, sin skips. El corte `tests/.tmp/evidence103-r2-sdxmFA` usa 236 y los bytes exactos de 103 R2 y 245, con inyección Fastify y SQLite en memoria. El primer arnés usaba una fábrica anterior al retorno de `security` y se sustituyó por la versión de 236. El hallazgo técnico de 101 no se cubre con este resultado y conserva su propio dictamen.

Huellas vigentes de las fuentes de esta revisión.

- `server/continuity-evidence-api.ts` · `566a0c9ae3f931c09fdd0a60d54823c05f0d6bb506dd5c21e25b82d8d140e657`
- `tests/continuity-evidence-api.test.ts` · `debb6a5bcceb1d38257411e794d02a7c9051569c5f39c43fe37f460ae0b2ae9c`
- `shared/continuity-evidence-api.ts` conserva la huella original.

Revisar 245 junto con 103 R2. 239 deberá incorporar la misma infraestructura aprobada y repetir sus pruebas de ejecutable. 242 mantiene su propio vínculo con la revisión de contexto. Los resultados históricos de la primera entrega se conservan abajo.

1/11/2026, 15:19:44, Europe/Madrid. Presentada para revisión; módulo registrable, no endpoint instalado en la demo100 o entradas main/runtime.

## Resultado y uso

registerContinuityEvidenceApi(app,store,clock?) añade GET /api/v7/continuity/evidence a una instancia de createBaseApp. No admite otros métodos ni HEAD implícito. La Store la aporta el servidor ya abierto; no acepta tenant/base/carpeta/spaceId del cliente. El namespace es local:<instanceIdUUID> leído de metadata de la instalación; si falta o está dañado devuelve503, sin inventarlo/escribirlo.

La llamada futura debe registrarse después de createBaseApp y antes de ready/listen. No montar en Fastify desnudo y asumir autenticación: hereda los hooks de protección local, Host y Origin de createBaseApp. Esa composición real se prueba aquí. Contraseña opcional según política existente; si configurada se requiere sesión válida. No se introduce obligatoriedad o un nuevo sistema de roles/tenant. No registra por sí mismo ninguna entrada instalada.

## Protocolo

Parámetros: scenario(crm-outage/device-loss), outageMinutes(1..43200), maxDataAgeMinutes(1..43200), maxRecoveryMinutes(1..43200), maxEvidenceAgeMinutes(1..129600) y revision opcional SHA-256. Defaults compartidos:CRM/480/60/15/1440min. Solo cifras decimales canónicas: sin espacios, signo, ceros iniciales, exponencial, decimales, duplicados o claves desconocidas. GET con cuerpo se rechaza422; ninguna ruta selecciona otra fuente desde parámetros.

Respuesta propia formatplanb-continuity-evidence-api-v1: available/context/parameters/evaluation/facts/limitations. **No input del servicio, tareas individuales, fichas oIDs originales.** Recuentos y exposición de10.000filas siguen completos; no se recorta para aligerar respuesta. No convierte informe técnico o custodia enRTO/otro equipo.

-200: evaluación coherente del servicio101, parámetros examinados explícitos.
-422 INVALID_OPTIONS: consulta/cuerpo no admitidos, sin eco de valores.
-409: referencia cambiada, copia no activa, R1inválido, replay incorrecto, archivo distinto, exceso de evidencia o captura futura. Derived/context/facts/evaluation/parametersnull, sin resultado anterior.
-503 SOURCE_UNREADABLE: instancia o referencia no legible. No revela excepción/contenido de metadata.
-401/403: respuestas del middleware existente, formato base {error}; no se presentan como evaluación o se fuerza el contrato de success. Cliente futuro debe comprobar estadoHTTP antes de datos.

Relee instanceId tras calcular: cambiar solo la instalación mientras bundle/archivo permanecen iguales descarta el resultado409.101 conserva su comprobación de revisión de datos. Todo síncrono, sin proveedores o awaits remotos. Cache-Control:no-store, Pragma:no-cache y Vary:Cookie en onSend de esta ruta, incluidos401/403tempranos; conserva otros valoresVary. Un GET no prolonga la sesión de protección por lectura de fondo. No se cambian hooks globales u otras rutas.

## Verificación propia

Fuente congelada y44inputs con hashes antes/después en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/evidence103-c45d3a4b-61d4-4c1c-a433-9fc17e0f3e78. Incluye la clausura real de imports de createBaseApp/103/101 y tipos, dependencias externas de node_modules existentes no copiadas; no imagen completa del repositorio.

**64/64focales:**15API nuevas+17servicio101+17motor+15response-queue,0fail/skip/TODO. **15/15** mismasAPI sobre bundleesbuild del módulo103 con packages external, no15casos únicos adicionales ni backend/app entera compilados. Typecheck de entradas e imports congelados limpio; diff --check acotado sin errores. Cinco hashes101cotejados con su submittedreview antes de presentar, intactos. No cambia lo que audita102.

Las API usan **createBaseApp real y Fastify.inject**, Store nueva:memory: por caso y carpetas ficticias nuevas. No listener/TCP/TLS/navegador o servidor4420/4421/4331/4334. Autenticación setup/login-cookie/lock y caducidad se ejercitan con contraseña ficticia y reloj de pruebas; ninguna cookie/contraseña en informes. Host externo, Origin externo/https/null, GETbody, métodos no registrados, arrays/claves inesperadas, parámetros límites, pinning y cambio de soloinstanceId cubiertos. Middleware rechaza sin ejecutar el reloj del servicio; no se afirman llamadas al modelo o proveedor.

Además:R1antes/durante, estado/archivo/replay/futuro/cotas,10.000filas con exposición completa ybody<10.000caracteres sinidentificadores privados, runtime desconectado, digests de seis tablas antes/después. Las mutaciones de fixture sobreSQLite se hacen solo en memoria para provocar errores. Directorios de caso vacíos: ningún Store de disco, DPAPI o datos existentes abiertos. No cuenta o credencial real.

| Copia privada mutada | Fallo causal |
| --- | --- |
| Omite rereadinstanceId | prueba da200donde exige409,0/1 |
| Omite cabeceras de caché de ruta |401carece deno-store,0/1 |
| Añade input interno al wire |assert de ausencia deinput falla,0/1 |

Mismos controles reales pasan. No mutación de archivos compartidos, errores de importación o atribución de tres defectos históricos; sensibilidad frente a regresiones introducidas. Logs mutant-*.log/focal64.log/typecheck.log/compiled15.log, inputs/results/final.json preservados. BundleSHA:19d2885bf9cce66ca40d8110de09091ff90bbdcf3cd2ccdec46659132551c58d.

## Incidencias de preparación, sin ocultar

PrimeraAPI13:12pass/1fail. Mi fixture de runtime importaba/activaba como CRM, lo que establece disconnected:false; no representaba server/runtime.ts. Se corrigió usando restoreBundle del seed como ese entrypoint, en memoria; no se alteró app/runtime para ponerlo verde. Después64/64. Primer typecheck de proyección rechazó la firma de headers del helper (uniones de objetos omiten propiedades); se admitió undefined como headers reales, solo en test. Snapshotd25b6891/initial.log conservados. Segundo corte final es el que se presenta; no sumar repeticiones. Node emite aviso deSQLiteexperimental, no fallo de comprobación.

## Límites y siguiente fase

No instala endpoint, actualiza binarios/demo100, cambia arranque o conecta una pantalla. Falta revisión independiente/aceptación103 e integración de arranque con reserva exacta propia; no se autoacepta101/035para eludir puertas. QA102es auditoría del servicio101, **no** se atribuye revisión de esta API nueva. Se prepara una vista104 separada, de solo lectura y con validación del wire/cancelación/contexto; no editor de evidencias o sustitución de la demoClaude036. Podrá ensayarse con backend ficticio aislado antes de proponer integración de shell.

Herencia de protección no equivale a authmultiusuario/cloud o navegador real certificado. Fake clock verifica caducidad del middleware, no reloj delSO. Lecturas repetidas no son bloqueoSO contra escritores privilegiados. No autenticidad firmada o prueba del inventario remoto. Sin proveedor/redexterna/dependencias/build-dist raíz/commit/push/despliegue/equipooriginal. Memoria actualizada aparte bajo reserva035documental.

## Hashes de fuentes propias

- shared/continuity-evidence-api.ts: 0a0c3c44543848d261b1251b3fcabb42f2a67760a437046af7bd4ac860480ff5
- server/continuity-evidence-api.ts: 11630c14cbd45cc35f644ac5fad2725fed3545c0c6a2dc58c26e372bae1c47b9
- tests/continuity-evidence-api.test.ts: ad1357430d76e6300e63c78a1bad00edd8f3192c611a8ff0fea604f1486d93fb

El hash del informe queda registrado en submit; no autoaceptación. Objetivo continuo activo.
