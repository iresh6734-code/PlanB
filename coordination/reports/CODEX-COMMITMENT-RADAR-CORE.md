# Radar · Contrato, persistencia y API de ensayo

6/11/2026, Europe/Madrid. Autor Codex del chat «Prepara un plan potente para Claude». Revisión independiente a cargo del chat «Responder saludo».

El contrato versionado separa identidad de fuente, relación y evidencia. Proyecta riesgo por bloqueo observado, cobertura incompleta, caducidad y resultado. La API protegida ofrece lista, detalle y confirmación de decisiones. Exige revisión de la copia y autorización local. El historial cifrado usa la transacción de Store para comparar la revisión, aplicar la decisión y registrar su evento en el mismo cambio. Un reintento exacto conserva el recibo. Un cierre manual y uno con evidencia tienen códigos y trazas distintos.

Verificación del corte final: `tsx --test tests/commitments.test.ts tests/local-authorization.test.ts` dio 12/12. `tsc --noEmit --pretty false` dio exit 0. Las cuatro pruebas del Radar usan Fastify con el guard de la App, SQLite, dos solicitudes sobre la misma revisión, reapertura de archivo, cifrado, cambio de captura, autorización local, fuente indisponible, caducidad, vínculo ambiguo y exclusión de copia de producción. El caso concurrente usa inyección HTTP sobre un mismo servidor. La reapertura usa una instancia Fastify nueva sobre el mismo archivo. El primer intento de pruebas apuntaba a un import inexistente de la fixture y se corrigió.

| Archivo | SHA-256 |
| --- | --- |
| `shared/commitments.ts` | `126d44e05372c0ece060c6ef6b547ba6226543641d2e63b2222537a577901328` |
| `server/commitments.ts` | `294d38db5ca1c3905f778e55e559b4c60b6023fe0945e6224411a76471cd6d61` |
| `tests/commitments.test.ts` | `77d9d9f2150e47f8828d3978eb199a2adf3094aa7ab38e5d2475766487f3da1c` |
| `coordination/plans/COMMITMENT-RADAR-CONTRACT.md` | `3a0e3e97903275afeade5ad6eed7b0760d0fe3761d312430fa4b5a1928e8d008` |

El servidor se registró desde el arnés. Quedan el registro en el ejecutable, el montaje en Hoy, la prueba de navegador y la candidata. Las fuentes son ficticias. El contrato define el ámbito unipersonal, la vigencia de evidencia de 24 h y la identidad del dataset estable entre arranques. La primera demo permite asignar y cerrar. El simulador, relevo operativo, película exportable y proveedores tienen sus propias puertas de salida.

## R2 · Autorización al terminar lectura y escritura

La revisión independiente encontró cuatro fronteras de caducidad. Ahora el helper comprueba también el permiso después de leer la identidad de la copia. El POST vuelve a comprobar el contexto y el permiso después de que la transacción confirme su resultado. Una escritura previa al vencimiento se conserva y se oculta su recibo. Una escritura que llega sin permiso se rechaza antes de producir efecto.

Se añadieron cuatro regresiones al archivo propio. El banco de Radar y autorización da 16/16. Las cuatro sondas independientes del dictamen, copiadas al directorio temporal únicamente para apuntar sus imports a estas fuentes, dan 4/4 sin modificar sus aserciones. Los casos de lista, detalle y permiso vencido antes del guardado dejan cero filas. El caso que vence dentro de Store.set conserva una sola entrada y recupera su recibo al desbloquear y repetir explícitamente la misma clave.

Los nuevos hashes sustituyen únicamente dos filas de la tabla del corte anterior. `server/commitments.ts` es `23dc9bd01b3cb7cf0db33dcea73514e1a6d169d59719ccdac9814c24e38f1b13` y `tests/commitments.test.ts` es `d37aa3ea5c0689b7c3422ee984449ccf2765b1c3dec6f40c13bb9748f31db49d`. La repetición global de `tsc --noEmit --pretty false` dio exit 0 en R2.
