# Claude B · Zendesk R3 atendida — dependencia aceptable

Actualización8/11/2026: R3ha pasado la repetición propia de Codex:29/29Claude+9/9sondas originales+3/3extras, tipos focales0, seis huellas actuales cotejadas. Los cuatro hallazgos deR1/R2quedan corregidos. **Este encargo está atendido: no seguir editando Zendesk bajo la entrega aceptada.** Pipedrive puede reclamar su propia unidad cuando el tablón registre Zendeskdone; no amplía automáticamente la reserva al transporte compartido. Llegada aAppyproveedorrealcontinúanpendientes.

Lo siguiente es histórico y no requiere repetir las correcciones ya aceptadas.

---

## Histórico · R3 de Zendesk

Actualización8/11/2026: **R2 pasó27/27+9/9y tipos0 en revisión propia de Codex y corrigió F1/F2. Quedan dos fronteras pequeñas antes de aceptar.** Mantén las mismas seis rutas; no vuelvas a implementar las correcciones históricas de abajo ni amplíes a Pipedrive mientras la dependencia no esté done.

Lee primero el estado vigente de `coordination/reviews/CLAUDE-SOURCE-ZENDESK-independent-285.md`. R3 pide:

1. Una excepción **síncrona** de fetch (antes de devolver Promise) debe convertirse en la categoría fija de transporte, igual que un rechazo asíncrono. No debe escapar su mensaje privado de readTicket/readTickets. Conserva aborto/timeout si ya se había parado, timers/listeners y descartes tardíos; no ocultes errores de validación de inputs de creación bajo una lectura falsa.
2. Después de credential y antes de incrementar/invocar fetch, revalida cancelación y plazo total. Caso concreto: credential aborta la señal y devuelve token sintético. Hoy se llama fetch porque el listener se instala después del aborto. Debe devolver aborted,0invocaciones y0requests. No se pide interrumpir callbacks síncronos que no devuelven.

Añade regresiones y control asíncrono/normal en tests/zendesk-source.test.ts. Reproducciones propias: tests/.tmp/zendesk285-r2-extra.ts; no las modifiques. ConR2pasan1/3yfallan2/3; una corrección privada mínima hace pasar3/3pero no es tu entrega. Demuestra sensibilidad contraR2en copia propia y repite27anteriores más las9sondas originales, tipos y límites. Sin cuentas, sockets externos, nuevo esquema, reintentos o montaje. Actualiza informe/hashes, submit y detén edición. Pipedrive espera aceptación independiente.

Las instrucciones siguientes describen la devolución históricaR2, ya atendida. Se conservan para trazabilidad, **no son un encargo nuevo adicional**.

---

## Histórico · R2 de Zendesk

Corrige `CLAUDE-SOURCE-ZENDESK` tras su devolución formal por Codex. Conservas exclusivamente sus seis rutas reservadas: `shared/source-reading.ts`, `server/source-read-transport.ts`, `shared/zendesk-source.ts`, `server/zendesk-source.ts`, `tests/zendesk-source.test.ts` y `coordination/reports/CLAUDE-SOURCE-ZENDESK.md`. Relee tablón, AGENTS y COORDINACION; no edites rutas de284, Jornada/Radar, contexto ni dictamen285.

Lee el dictamen `coordination/reviews/CLAUDE-SOURCE-ZENDESK-independent-285.md`. Codex repitió tus19pruebas: pasan. Las sondas independientes detectan dos problemas; no son una conexión real ni un fallo probado del fetch nativo. No rehagas lo que ya funciona: tu lector por ID sí rechaza otro ticket.

1. **Cierra la frontera SourceReading.** Rechaza registros cuyo `objectType` difiera del de la lectura; en lookup, exige igualdad de `remoteId` y `kind` con el objetivo. Prueba las tres incoherencias con valores válidos por separado y verifica que no se convierten en observaciones completas. Conserva listado vacío con fin explícito, lookup no disponible sin registro y objetos de contexto sin rol. No cambies `shared/commitments.ts`.

2. **Haz propios los límites del transporte.** Una señal enviada a fetch no basta. Aborto/timeout deben resolver con su categoría aunque el fetch inyectado o reader.read ignoren signal; una respuesta o error tardío no puede publicar un resultado completo ni provocar rechazo no atendido. Cubre espera de headers y cuerpo, tiempo por petición y total, señales ya abortadas y abortadas entre etapas. No dejes listeners acumulados. Cancela/libera cuerpos cuando proceda, sin esperar indefinidamente a una limpieza no cooperativa. Mantén GET, origen/ruta/consulta exactos, redirect manual, presupuestos, tope de bytes, errores sin cuerpo ni credenciales y ausencia de reintentos.

3. **Regresiones causales.** Integra pruebas con fetch y ReadableStream sintéticos controlados por barreras; no debilites las19existentes. Mínimo: tres incoherencias de esquema; éxito tardío tras abort; éxito tras timeout; cuerpo que aborta antes de entregar bytes; fetch retenido y cuerpo retenido que no se liberan hasta después del plazo. Prueba además plazo total y error tardío. Usa un límite razonable de observación distinto del plazo del transporte y libera siempre barreras en finally. Muestra que las regresiones fallan con R1 en copia privada y pasan con R2. Las sondas de Codex están en `tests/.tmp/zendesk285-probes.ts`; puedes leerlas como reproducción, pero escribe las pruebas de tu entrega en tu archivo reservado. No modifiques el banco de Codex.

4. **Afina las afirmaciones.** La documentación primaria actual sí documenta `tickets:read`: separa nombre de alcance documentado de permisos sin probar en una cuenta. API tokens sí están obsoletos; no afirmes que todos han dejado de funcionar. Consulta y enlaza fuentes oficiales vigentes. Conserva OAuth-only; no añadas autenticación, proveedores ni permisos nuevos. Declara que accountId live es el subdominio configurado, no identidad observada. «Páginas completas» no es captura atómica ni inventario íntegro de la cuenta.

Fuentes de contraste: [Tickets](https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/), [cursor](https://developer.zendesk.com/documentation/api-basics/pagination/paginating-through-lists-using-cursor-pagination/), [autenticación](https://developer.zendesk.com/api-reference/introduction/security-and-auth/), [migración OAuth](https://developer.zendesk.com/documentation/authentication/oauth-migration/).

Trabaja únicamente con ficción nueva y transportes simulados/bucle local. No cuentas reales, secretos, llamadas a Zendesk, navegador del usuario,4331/4334, actualización4601, dependencia instalada, build raíz ni despliegue. No copies automáticamente la corrección experimental de Codex: solo demuestra que las sondas detectan el defecto y no cubre toda la limpieza solicitada.

Presenta R2 con cambios, resultados realmente ejecutados, sensibilidad, fuentes y nuevas huellas. Detén edición después de submit. Pipedrive continúa condicionado a la aceptación independiente de estas seis rutas; mientras esperas puedes avanzar otra unidad con rutas propias y dependencias satisfechas. No te autoaceptes.
