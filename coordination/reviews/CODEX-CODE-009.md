# CODEX-CODE-009 · Aceptación independiente del motor de capturas y endurecimiento de `importHubspot`

29/10/2026, Europe/Madrid. **Ejecutado por Claude (Sonnet 5.5) por delegación expresa del usuario**, que autorizó hacer el trabajo de Codex. El motor lo escribió una sesión Claude (`CLAUDE-CODE-009`); el endurecimiento de `server/hubspot.ts` y sus pruebas son de Codex. Quien firma esta revisión **no escribió ninguno de los dos**, y la parte de código se revisó además con un subagente independiente de solo lectura. Registro de la delegación: `coordination/reports/DELEGACION-CLAUDE-COMO-CODEX-2026-10-29.md`.

## Alcance

- A) `shared/crm-capture-contract.ts` y `shared/crm-capture-runner.ts`: motor genérico de captura (reintentos, cancelación, plazo, cupos previos a la copia). **No está integrado todavía** en el importador: ningún archivo del repositorio los importa fuera de sus pruebas.
- B) `server/hubspot.ts`: rechazo de páginas sin progreso, ids y cursores no canónicos, cuerpos JSON inválidos y colecciones enormes.

## Verificación

- `tsc --noEmit` sin errores. `npm test` completo **548/548**.
- Baterías (con `--require ./scripts/block-external.cjs`, en serie): contrato 49/49, contrato-aceptación 37/37, motor 94/94, motor-aceptación 27/27, `hubspot-capture-progress` 19/19 (16 + 3 nuevas), `hubspot-response-validation` 7/7. Regresión HubSpot ya existente verde: `hubspot` 7, `hubspot-collab` 9, `hubspot-remote` 3, producción 10, local-producción 5, aislamiento OAuth 7, renovación OAuth 10.
- **Revisión independiente de código** (subagente, solo lectura, 28 mutaciones sobre copias):
  - **A, contrato y motor: aceptable.** Reintentos solo para 429/5xx; los errores de transporte se enmascaran (sin causa ni token); cancelación, plazo y timeout abortan la señal en vuelo; el resultado solo se devuelve con todas las entidades terminadas; duplicados detectados por entidad y entre páginas; cupos comprobados antes de copiar o leer getters; el binding se revalida antes y después de cada lectura. **Ninguna ruta de red ni de escritura**: solo recibe un `readPage` y un `getBinding` inyectados. Mutaciones del motor: 8 de 11 detectadas; las 3 supervivientes son **equivalentes** (otra capa produce el mismo resultado: normalización del error, comprobación previa redundante).
  - **B, `hubspot.ts`: aceptable con correcciones menores.** Se aplicó la única regresión real (**B1**): `paging: { next: null }` devolvía 502 «cursor no válido» y antes terminaba bien. Corregido a `page.paging?.next != null` y probado.
- **Lagunas de prueba cerradas** (3 pruebas nuevas en `tests/hubspot-capture-progress.test.ts`), cada una comprobada por mutación sobre el archivo real y restaurado después: `paging.next null` es fin de colección (falla si se vuelve a `!== undefined`); un cursor repetido se rechaza (falla sin la comprobación `previous.has`); el tope de 10.000 es acumulado entre páginas (falla si es por página).
- Hashes SHA-256 (16 primeros): `server/hubspot.ts` d8b0919027506b25 · `tests/hubspot-capture-progress.test.ts` 807d38196cac86a6 · `tests/crm-capture-runner.acceptance.test.ts` 3a9cf4cabe35ecbf · `shared/crm-capture-runner.ts` a6e46a7d0d17f3af · `tests/crm-capture-runner.test.ts` 4a188ed36646fa31.

## Observaciones no corregidas (decisión de diseño o preexistentes)

1. Un **timeout no se reintenta** (`runner:496`; `isRetryable` solo admite 429/5xx): parece intencionado y está probado; confirmar la política.
2. `retryAfterMs` se recorta a `maxDelayMs`: con un `Retry-After` mayor que el tope se reintenta antes de lo que pide el servidor y se gasta un intento.
3. Los topes por defecto (1000 páginas, 1.000.000 de registros) están **duplicados** en motor y contrato: hoy iguales; si divergen, el cupo previo a la copia dejaría de coincidir.
4. `hubspot.ts`: un `abort` o timeout durante `response.json()` se convierte en 502 «respuesta no válida» en lugar de `AbortError` (no rompe la cancelación, que mira `signal.aborted`).
5. **Sin tope de bytes** en `response.json()`: «respuestas enormes» solo se acota por número de registros y después de parsear el cuerpo; tampoco se limita el tamaño de `properties` por registro (preexistente).
6. Un 401 del proveedor se devuelve como 502 (cambio deliberado de contrato HTTP, exigido por `hubspot-collab.test.ts`).
7. Relaciones: `single.paging` y `item.paging.next.after` no se validan; un `after` ausente se enviaría como el cursor literal «undefined» (preexistente, fuera de este diff).

## Límites

Sin API real de HubSpot ni red; sin medir rendimiento con 1.000.000 de registros; sin integración del motor en el importador (siguiente unidad); sin despliegue ni QA visual. Las baterías propias del motor se ejecutaron en el checkout, no contra una instalación.
