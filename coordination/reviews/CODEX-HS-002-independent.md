# Revisión independiente CODEX-HS-002

29/10/2026 Europe/Madrid. Revisor: subagente Codex review_h2, distinto del autor de OAuth y sus pruebas. Solo se escribe este informe; CONTEXTO-PROYECTO.md permanece reservado al coordinador, que recibe la evidencia para actualizarlo. Sin proveedor, cuentas, navegador, secretos o servicios del piloto.

## Dictamen

Aceptar H2 dentro de su alcance: el callback STANDARD revalida productionSpace en la transacción final antes de guardar la conexión, bajo el bloqueo de team_spaces compartido por instalación de capturas y ediciones. El aislamiento por empresa/actor/state de un solo uso se conserva; una autorización retirada antes de esa fase es rechazada al no encontrarse su fila vigente. El portal esperado sigue cotejándose con la respuesta remota y hub_id cuando está presente. El tipo de cuenta, la lista permitida de scopes y la protección cifrada no cambian. Espacio ocupado por ensayo u otro portal no llega al INSERT. Las comprobaciones y la escritura son atómicas dentro de la misma transacción.

La diferencia de OAuth respecto al baseline fue comprobada reconstruyéndolo únicamente en memoria al quitar el nuevo comentario, SELECT de bloqueo y llamada condicional a productionSpace. El SHA256 reconstruido coincide exactamente con el baseline a1380c38742cb27ad791ba9c6a17ba626b006be70cd825cfc128158d5f971999. No se modificó el archivo para compararlo.

## Comprobación independiente

Se ejecutó en este encargo: node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-oauth-isolation.test.ts. Resultado: 7/7 correctas, sin red externa, con PGlite y transporte sintéticos. Cubre espacio vacío/cifrado/state, ensayo, captura ajena sin registros locales, importación durante la espera remota, historial real del mismo portal, conexión previa/retirada, empresa ajena/modo ensayo. La suite de19 y el typecheck constan en la entrega del autor; no se atribuyen como repetidos por este revisor.

Los tres hashes presentados fueron cotejados con los actuales antes de aceptar:

- server/team/oauth.ts: 2ee32dc8650240c9138d6ca5e7606a76c68aef5f9c7e4aa161bac91c2fb4c0fa
- tests/hubspot-oauth-isolation.test.ts: 534319e04e03715bf1db3a8d1454a165a1652d3d71bc12a331e5ea89d2bf962f
- coordination/reports/CODEX-HS-002.md: 8b83c94121867ee62f70d8642c295ed83752428241ef1b1a5f6f177b5a43dda3

## Límites y precisión de evidencia

No se acredita OAuth remoto real ni concurrencia con dos conexiones PostgreSQL. Las pruebas de carrera insertan cambios entre fases asíncronas, suficiente para la regresión H2 pero no una prueba exhaustiva de bloqueos. Una precisión del informe del autor: disconnectHubspot no adquiere por sí mismo el bloqueo de team_spaces; elimina conexión y estados en su transacción. La retirada se coordina por las filas de conexión/state y su comprobación final, no por un bloqueo de empresa en disconnect. No se atribuye a esta entrega haber resuelto todo el orden de bloqueos o la renovación H7. H3, permisos concurrentes y H7 siguen siendo trabajos separados. No es una revisión Claude y no se ha enviado fuente nueva a Anthropic.

H2 se acepta por el revisor distinto del autor; este informe de revisión se presenta y no se autoacepta.
