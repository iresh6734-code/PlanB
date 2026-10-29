# Revisión independiente CODEX-HS-007

29/10/2026, Europe/Madrid. Revisor Codex review_h2, distinto del autor. **Aceptar** el reparto acotado de la muestra entre tipos tras revisión estática, ejecución focal independiente y cotejo de hashes. Solo se escribe este informe; no se editan fuentes de aplicación/captura/runner o pruebas del autor. Sin proveedor real, navegador, cuentas, secretos o fuentes nuevas aClaude. El coordinador actualiza contexto/panel que tiene reservados.

## Resultado de revisión

El bucle exterior recorre índices0y1; el interior recorre los cinco tipos. Con asociaciones suficientes, la primera vuelta reserva un detalle de cada tipo antes de cualquier segundo detalle, evitando la exclusión sistemática de emails del orden anterior. selected.length<8 conserva el tope global y solo dos índices por tipo conservan el máximo de dos. Tipos vacíos no consumen plazas. No se promete reparto igual de las segundas plazas: con los cinco tipos saturados las reciben los tres primeros del orden declarado. El informe final reconoce ese límite.

La selección conserva únicamente IDs de las asociaciones observadas y usa encodeURIComponent para el segmento de detalle. Cada detalle pasa por el helper get existente: assertCurrent antes deGET, destinoHubSpot, transporte readonly y redirecterror. La lectura de propietario autorizado sucede aparte; máximo esperado son ocho detalles más contacto y propietario, diezGET en el caso saturado con propietario. Después se conserva assertCurrent final. Desconectar durante un detalle detiene el siguiente y descarta la salida. No se amplían rutasPOST, scopes o lectura de datos.

La fecha ordena solo los elementos seleccionados; la descripción nueva aclara que no garantiza actividades más recientes. No se altera el resto del contrato de contexto/owner ni la renovaciónOAuth. Una única clase conserva máximo dos y la ausencia de clases no añade consultas de detalle.

## Evidencia independiente

Ejecutado por este revisor:

    node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-context-sampling.test.ts

**5/5 correctas** con PGlite separado y transporte sintético, red externa bloqueada. Casos saturados incluyen todos los cinco tipos, topes, orden de primera vuelta y ausencia de terceras asociaciones; vacíos y escasos; ownerfuera del presupuesto; orden descendente solo de muestra; desconexión durante primera vuelta. La suite41/41 ytypecheck correctos, así como cuatro controles y un fallo antes del cambio por ausenciaemails, son evidencia del autor y no se presentan como repetidos por este revisor.

## Límites

Sin CRM/OAuth real, UI o QA visual. La política no busca recencia global ni pagina asociaciones. No elimina sesgo de segundas plazas o trata errores individualesH5; los segundos cupos siguen orden fijo. No acredita concurrenciaPostgreSQL completa o cancelacióninstantánea. La muestra sigue parcial aunque se muestren todos los tipos. No hay problemas materiales restantes dentro del alcance.

## Versiones aceptadas

- server/team/oauth.ts: 5f67cf22ea391d32c9a53d5f9a7995a057474ed282af737fa009e31ace338af3
- tests/hubspot-context-sampling.test.ts: 6ecd0ee448e970dfb249f6c37ffa45d2fe41b57bed6b475996b6d02272e2054a
- coordination/reports/CODEX-HS-007.md: 75e328dd313ce1125f342491a9395ec21d36a21155d1b0dc71d7f2debabe6e50

Todos coinciden con la presentación vigente. CODEX-HS-007 aceptada por el revisor distinto del autor. Este propio informe se presenta para revisión del coordinador sin autoaceptarse.
