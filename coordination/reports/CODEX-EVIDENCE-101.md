# CODEX-EVIDENCE-101 · Evidencia local para el laboratorio

## R2 · Identidad de las comprobaciones de un simulacro

6 de noviembre de 2026, Europe/Madrid. Se contrasta el hallazgo de 244. `declaredPassed` exige las cinco identidades distintas aceptadas en 201, cada una con resultado positivo, además de la declaración global y la ejecución aislada. Los duplicados y sustitutos siguen siendo informes guardados. El agregado conserva su alcance por identificador de captura, los recuentos de vinculación y la compatibilidad con informes legado sin campo de entorno. El tiempo de recuperación sigue sin medirse.

La regresión de servicio contiene un informe canónico reordenado, uno legado, un duplicado, una sustitución, un fallo real y otro informe de captura ajena. El servicio previo cuenta cuatro éxitos donde corresponden dos. La sonda HTTP de 244 vuelve a pasar con dos informes guardados y un único éxito. Se preservan los hashes de las seis tablas y el resultado `unproven`.

Verificación conjunta con 103 R3 y cliente 104 R2 en `tests/.tmp/evidence-r23-sLsKye`: dos regresiones causales rojas en las fuentes anteriores, 92/92 pruebas y tipos focales correctos en el corte final. Los casos incluyen los bancos independientes 244 y 252. Fastify inyectado, SQLite en memoria y datos ficticios. La proyección privada del montaje 239 (`tests/.tmp/evidence239-r23-1f46fM`) se recompiló con estas fuentes y verificó el agregado por HTTP, con SQLite de archivo en una raíz propia. Pendiente dictamen y montaje en checkout.

- `server/continuity-evidence.ts` · `7abb9f0fbc4b2727e0c4acca217498bb75c495ea818e73a80374148555881195`
- `tests/continuity-evidence.test.ts` · `cab2628594d4fdffd03ee934cd2c42e80f376c1b6fc2f6a77ed555de0711ac42`
- Dependencia aceptada `shared/drill-evidence.ts` · `c8dea95b6df1ddd827b8f10a0492959cbe7d78f4fa96b09431b39b709bff77a6`

El contrato compartido y la demo CLI de 101 conservan sus bytes. Los resultados de la primera entrega se conservan abajo.

1/11/2026, 14:51:08, Europe/Madrid. Servicio presentado para revisión; sin integraciónUI/API, aceptación o instalación.

## Problema y comportamiento

La demo036 usa datos escritos a mano. El plan035 pide adaptar evidencia persistida y no convertir una duración de tests en tiempo de recuperación. La Store actual tiene captura, registros locales, informes técnicos y metadata de exportación; no guarda medición de recuperación hasta un flujo usable ni prueba de restauración en otro ordenador. Este servicio lee lo disponible y explica sus límites sin fabricar los elementos que faltan.

reviewContinuityEvidence(reader, options, clock?) devuelve available con contexto/hash/facts/input del motor/result o unavailable con issue estático y todos los derivadosnull. No registra rutas, no abre una base proporcionada ni se conecta a4420/4421 o proveedores. spaceId debe aportarlo el futuro llamador autenticado: no es autorización de tenant por sí mismo. Archivos nuevos propios, sin cambiar035/036 u otras fuentes reservadas.

## Contrato

- Revisión ligada al namespace exacto, bundle activo, bytes semánticos de su captura archivada y metadata drills/recoveryCopy. expectedRevision opcional permite fijar ese contexto. No se sustituye por última captura del historial ni se ignora una referencia ausente.
- Esquema, conciliación y correspondencia del archivo activo; prueba del replay/relaciones mediante Store exclusivamente en memoria. Snapshot verifiedAt es la comprobación local realizada ahora, no una hora remota inventada o un ensayo histórico. La validación no acredita inventario actual del portal.
- Fuente derivada de kind/accountId/isTestData/environment, generación por hash de contenido completo de captura. No contador Number, IDs truncados o dependencia de nombre de cliente. Las modificaciones locales cambian revisión, sin fingir que cambió la captura original. Cambiar contenido con mismoID/fecha sí cambia generación.
- Segunda lectura de revisión descarta cambios observados de registros/metadata/archivo; R1inválido bloquea antes/después. Lecturas síncronas, sin await o dependencia de red. No es bloqueoSO ni garantía frente a un escritor privilegiado que altere/restituya fuera de observación.
- Inventario entero hasta10.000registros, roles configurados y parser existente de response-queue. Límite visible200 no recorta las cuentas o tareas del motor: se clasifican todos los bloques. Tareas completadas siguen en input como done, fechas faltantes como null; estados desconocidos, fechas inválidas o días sin hora impiden expresar el inventario como instantes exactos. En ese caso workload/exposurenull, con recuentos estructurados de la causa. No transforma un día en medianoche, lo llama sinfecha o elimina filas difíciles para conseguir verde.
- Informes técnicos con binding capture-id-only se muestran como declaraciones almacenadas; ningún durationMs/elapsedMs se convierte en localDrill/restoreDrill/measuredRecoveryMs. Un desfase pequeño entre durationMs y dos llamadas al reloj no invalida una suite por sí solo; ninguno de esos valores acreditaRTO. Exportación actual y custodia declarada se distinguen de bytes examinados u otro equipo: backup del motor sigue null. localRuntime/recoveryKitunknown hasta disponer de evidencia apropiada.
- Metadatos explícitos leídos:drills/recoveryCopy. El bundle usa sus lectores no secretos existentes (snapshot/spec/generation/sesión/estado de devolución); el servicio no solicita conexión, contraseña, token o clave. La Store ya abierta mantiene sus responsabilidades. No devuelve fichas, descripciones o IDs originales, solo conteos, fechas y hashes; esos hashes sin clave no son anonimización.
- Límites32MiB por bundle/archivo y1MiB de metadata seleccionada, opciones estrictas/duración y objetivos acotados/calendario/fuente futura rechazados. Errores no reflejan excepciones o contenido bruto. Puede usar varias copias/stringificaciones dentro de esos límites; no memoria constante ni benchmark del máximo65MiB combinado.

## Pruebas propias finales

Snapshot de17archivos (4propios+13dependencias), hashes antes/después iguales, en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/evidence101-dc7f099d-3902-4cb5-9025-e6200d114a24.

- **49/49focales**:17nuevas,17motor035,15response-queue;0fail/skip/TODO. Store real nueva en memoria, digests de seis tablas antes/después. Cubre10.000registros/IDs largos, roles personalizados/enum ambiguo, null/0, archivo más nuevo ajeno, archivo ausente o alterado, historial incoherente, fuente futura, namespace/pinning, reloj atrás, cambios causales entre lecturas y R1inválido conservado. Ninguna fuente o base de los agentes se modificó para provocar casos.
- **17/17** mismas nuevas contra bundleesbuild de este servicio, packages external; no17casos adicionales o app completa compilada. SHA del bundle: eb26a844ed65599e2eef835f87bbefe32e517ee47a880db60795a2de1db917d1.
- Typecheck de la proyección acotada limpio. No se presenta como typecheck del checkout entero, que contiene trabajo ajeno en curso.
- Tres copias mutadas: retirar descarte final de revisión, aceptar día sin hora como inventario exacto y quitar namespace del hash. Cada prueba focal correspondiente falla0/1 por la aserción esperada, sin error de importación/setup; controles de fuente real pasan. Es sensibilidad frente a regresiones introducidas, no tres fallos reales adicionales del producto anterior.
- DemoCLI0, argumentos externos2 sin abrir ruta, importar demo sin salida/ejecución. Dos espacios ficticios nuevos en memoria: fecha civil→exposurenull; instantes exactos→exposición calculada. Ambos siguen unproven, sin evidencia RTO/otro equipo. No proveedor ni SQLite de disco usados.

Comando útil: `node --import tsx scripts/demo-continuity-evidence.ts`. La salida muestra únicamente la ficción generada por este comando. No admite --database, credencial o ruta. Uso del servicio es una capa backend, no un botón visible en la demo100.

Logs/inputs/results/final y mutantes preservados. El primer corte ea179732 tuvo49/49 pero typecheck falló por el estrechamiento de una función never declarada como const y cast incompleto de mock. Se corrigieron con declaración de función y cast explícito solo en test; segundo corte final todo lo indicado pasa. Primeras15pruebas y repeticiones49no se suman a los49finales. Advertencia experimental de SQLite deNode visible, sin fallo de comprobaciones. diff --check acotado sin errores.

## Estado y siguiente paso

Servicio utilizable desde código y demoCLI; aún sin ruta autenticada, adaptador de equipo, mediciones persistidas del flujo, presentación de facts en036 o integración de navegación. No se anuncia laboratorio real conectado/preparado. No se modifica la demo100/candidata357, engine035, interfaz036, QA079/081/091 o instalaciones anteriores. Tras revisión independiente, la unidad de integración deberá ligar tenant/permisos, retener contexto y representar precisión/cobertura/limitaciones, antes de usarlo en UI. Recoger recuperación medida y evidencia de otro equipo requiere contrato propio, no reutilizar sin más la suite existente.

Se prepara QA102 en tres rutas nuevas para contrastar este servicio, sin herramientas de proveedor/autoaceptación. QA079/081/091siguen reservadas a sus autores; no se exige que otra sesión termine su trabajo para que esta nueva auditoría tenga un brief, pero una sesión autora debe presentar su unidad antes de cambiar de encargo. Laboratorio036sigue sin reserva formal/submit, con F1/F2pendientes. No se acepta035para desbloquearlo retrospectivamente.

## Hashes propios

- shared/continuity-evidence.ts: f285ee03a995ddce21bfe153c84ec01de0906c3943feb0c80365df4a1e844e73
- server/continuity-evidence.ts: e9e339c06e8361866568447eb3e67c2b84d179af9f4a8f5198927d3cc8286085
- scripts/demo-continuity-evidence.ts: ccfa46b15399ceeb73d899a7b9195c49d454a7cd6414a2b383dbf91a419fe68a
- tests/continuity-evidence.test.ts: 9bbb75d2c5b09df4592f455e160c8f555584b218b10d3e0559bfbc8805e7f139

Dependencias exactas en inputs.json; hash del informe lo registra submit. Sin deploy, instalación, commit/push, proveedor, datos de clientes, bases o credenciales del ordenador original. Objetivo continuo activo, no promesa de consumo o ejecución permanente.
