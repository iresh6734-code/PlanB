# Revisión independiente · ficha 123 R2 y QA 130

2/11/2026, Europe/Madrid. Codex, distinto del autor. Dictamen favorable para las entregas aisladas, con los límites siguientes. No es aceptación del montaje en la aplicación ni del servicio 128 como integración.

## Correcciones y evidencia

Los hashes de las once rutas de 123 y cuatro de 130 coincidieron con sus respectivos submit antes y después de la repetición. Las fuentes ahora ligan la verificación de un acuse perdido al contexto antes y después de la lectura, distinguen cambio de fecha en capturas con igual ID, identifican la aceptación humana sin atribuir un acuse al servidor y adaptan el aviso de cierre a operación en vuelo o incierta. Se leyeron los contratos y la implementación; el contexto disponible no identifica sustituciones coincidentes en todos sus campos, como reconoce el informe de Claude.

Repetición propia, no suma con la del autor:

- **40/40 Node**: `node --require ./scripts/block-external.cjs --import tsx --test tests/local-task-focus.test.ts tests/local-task-focus-client.test.ts tests/task-focus-followup.test.ts`. Incluye servidor loopback y SQLite en memoria con datos ficticios; acceso local necesario y red externa bloqueada.
- **45/45 DOM**, 0 omitidas o flaky, Chromium headless, servidor propio en loopback, `tests/.tmp/codex123review-64dab47e-d23d-4f5f-84e0-cb37605ceb1c/results.json`. Son las 26 pruebas de 123 y 19 de 130, ejecutadas en un arnés de Hoy, no en App real. Incluyen controles de respuesta tardía, contexto, 401, lectura tras guardar, foco, tamaños y el caso abierto D7.

Las dos pruebas observacionales de `tests/independent-task-focus-123.test.ts` pertenecen a la revisión anterior y estaban escritas para pasar cuando F1/F2 existían; no se ejecutan como regresiones verdes de esta versión. Las pruebas corregidas del autor sí se repitieron arriba. No se ha auditado todo el producto ni repetido sus mutantes.

## Límites para integración

La API antigua sigue sin CAS ni idempotencia; dos escritores simultáneos del mismo campo pueden pisarse y la comprobación previa no es atómica. D7 sigue abierto: cerrar con guardado en vuelo y respuesta perdida deja sin seguimiento posterior aunque se advierte antes de salir. La unidad Claude dedicada a incertidumbre sigue separada. La ficha no está montada; el montaje deberá coordinar reservas, recarga que propague errores, foco si desaparece la fila, borrador y pruebas en la app real. La aceptación no acredita HubSpot, varios procesos ni cambios remotos.
