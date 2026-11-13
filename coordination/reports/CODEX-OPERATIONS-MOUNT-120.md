# CODEX-OPERATIONS-MOUNT-120 · Integración y revisión de118

Presentada para revisión, 2/11/2026 Europe/Madrid. El dictamenR2 siguiente conserva el hallazgo inicial; su corrección fue verificada y118aceptada por este revisor distinto.120 no se autoacepta. Este chat es revisor distinto del autor118 (chat «Prepara un plan potente para Claude», ID01a1979f-9475-7e01-9b05-f51ca3b83ea5).

Se montaron registerLocalOperations(app,store) en createBaseApp y LocalOperations para Hoy/Agentes en App, bajo la reserva SEARCH053 working. No se editó una fuente118. Su presentación inicial de12 hashes se congeló y coincidió antes/después de la verificación.

Primer corte integrado:112/112 Node, nueve E2E reales de App, tsc focal y Vite correctos. Evidencia: tests/.tmp/navigation117-3815e3c2-b659-474e-a2b4-5b6e53ac8849/app120-94ebf8de-6765-45a5-99f8-fe1585282f25. Las seis pruebas iniciales propias cubren GET sin mutación, captura importada marcada como producción solo en ficción, Host/Origin/auth reales, POSTreview/replay/revisión obsoleta, separación de instancia/candidata, historial malformado legible sin habilitar revisiones, y recibo histórico frente a evaluación en otro día. No se usaron cuentas o datos reales.

Semántica temporal118 aclarada por su autor: revision/stale identifican cambios de datos; lastReview es un acuse histórico fechado, no una promesa de vigencia de prioridades. El nuevo oráculo120 comprueba que al cambiar el reloj la cola se reevalúa, el acuse conserva fecha/recuentos propios y no se escribe nada por GET. No se considera defecto por sí mismo.

## Devolución R2 · Captura válida con nombre largo deja Hoy inaccesible

La primera prueba de datos límite posterior a ese corte confirma que una captura aceptada por Store.importSnapshot con name de101 caracteres y sin especificación activa hace que GET /api/v7/local-operations devuelva422. El cuerpo responde «Revisa los datos enviados» con title >100. No hay datos enviados en ese GET ni un snapshot inválido: SnapshotSchema solo exige name no vacío.

Causa: inspectLocalOperations construye una AppSpec de lectura provisional usando snapshot.name como title; AppSpecSchema.title limita a100. Además, el contrato de salida limita context.name a500, por lo que debe tratarse también esa frontera sin modificar la copia. El caso se añade a tests/local-operations-mount.test.ts con controles100/101/501 y Unicode, inventario visible y digest conservado.

R2 solicitada al autor dentro de sus doce reservas: adaptar metadatos de visualización a los límites públicos al construir la proyección, sin reescribir nombre/esquema/filas, cortar identificadores o inventar una especificación guardada. Mantener Unicode completo y lectura de la captura importada; añadir regresiones propias con inventario real y reintentar tipos/pruebas pertinentes. Volver a submit con hashes nuevos. Codex repetirá la revisión sobre ese corte. No se acepta118 por los112/9 favorables anteriores.

La reproducción inicial está en probe-valid-title120.ts dentro del snapshot; usa Store/API reales en memoria y solo imprime longitud/estado/error, sin un nombre de cliente. No se inició un servicio ni proveedor para ese probe.

119 ya está en review y sus nueve hashes se cotejaron para preparar su montaje. Su aceptación/repetición y la entrega final117/120 siguen pendientes.4451 y las demos ajenas permanecen sin modificar.

## Cierre del montaje y revisiónR2

2026-11-02T11:15:39.819Z.118R2 conserva12hashes coincidentes y fue aceptada por este chat, distinto del autor. Metadatos de visualización se acotan con elipsis sin separar Unicode; título provisional100/context.name500; nombre/ID/captura originales y su contribución a revision permanecen intactos. La prueba propia100/101/501/Unicode que falla con422en101 sobre el baseline ahora pasa.17Node del autor118R2 y siete propias120 incluidas en132/132focales;0fail/skip/TODO.

El GET se monta en createBaseApp bajo las guardas reales; el POST explícito solo registra la revisión local, no modificaCRM. La API se ensaya con memoria real/ficción ysin servicios remotos. El caso de reloj comprueba conservación del recibo histórico y reevaluación actual de la cola; no exige que stale signifique caducidad temporal. Historial inválido conserva tareas/bytes, bloquea revisión, no desaparece la captura.

Typecheck focal/imports y build aislado correctos.11/11AppDOM finales y un recheck de búsqueda ampliado en el mismo build;codegenservermain compilado+preview125 real verificado1/1 aparte. Snapshot D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/navigation117-3815e3c2-b659-474e-a2b4-5b6e53ac8849/app120-final-4a912811-7757-4061-9232-3dc8931cf44f; referencias en117/125. Al final132Node incluyen18casos119 ya aceptada por el otro chat. No prueba global; sin cuenta/piloto instalado/4451.

server/app.ts SHA-256 532785b9674d75e50c5edfc88385eeb0868446499b11776470b318d98e8ea8c4, prueba propia actual 9c5f6bd45f8c175cead20019a9ed178d8bad2f4423c5969036183d1e3014d703. Se mantiene la fuente bajo reserva053,120reserva solo sus tres rutas nuevas. Siete oráculos propios, fuentes118no editadas.118done/119done son revisiones distintas del autor;120review queda para121.
