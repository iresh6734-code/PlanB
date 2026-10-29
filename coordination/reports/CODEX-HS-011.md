# CODEX-HS-011 · Presupuesto temporal de la lectura de ficha HubSpot

29/10/2026, Europe/Madrid. **Informe del autor redactado por Claude (Sonnet 5.5) por delegación expresa del usuario**, a partir del código y las pruebas que dejó Codex y de la revisión independiente ya escrita (`coordination/reviews/CODEX-HS-011-independent.md`). No es una entrega nueva de código: no he modificado `server/team/oauth.ts` ni su prueba.

## Qué resuelve

Antes, cada `GET` de la ficha tenía 12 s y las 10 lecturas posibles podían superar 120 s en conjunto. Ahora `OAuthService.context(...)` (`server/team/oauth.ts:134-176`) tiene **un plazo absoluto para la fase de lectura CRM**, que empieza después de `access()` (por tanto no incluye la lectura inicial ni la renovación OAuth) y que comparten el contacto, el lote de detalles, el propietario y la lectura del cuerpo JSON.

## Diseño (lo que hay en el código)

- Opciones internas `timeoutMs` (1–30000, por defecto 30000) y `requestTimeoutMs` (1–12000, por defecto 12000), validadas con zod; no se añaden parámetros HTTP ni rutas públicas.
- Un único `AbortController` de presupuesto con temporizador. Un tiempo agotado produce 504 «HubSpot agotó el tiempo total de lectura de la ficha»; una cancelación del llamante, 409.
- `bounded(...)` envuelve cada operación (`assertCurrent`, `fetch` y `response.json`) y **rechaza por presupuesto o por temporizador individual aunque el transporte ignore `AbortSignal`**; registra los manejadores de éxito y error desde el inicio para consumir un rechazo tardío. `finish` es idempotente y limpia temporizador y escuchas.
- La última `assertCurrent` también está acotada. El propietario comparte el plazo y un tiempo agotado no devuelve éxito parcial.
- Un 404 opcional (HS-010) no reinicia el reloj. Se conservan identidad de portal, solo lectura, permisos y los errores actuales.
- Al terminar (éxito o error) se limpian el plazo y la escucha de la señal externa; las señales son propias de cada operación y no abortan lecturas posteriores.

## Verificación

- `tests/hubspot-context-budget.test.ts`: **8/8** (ejecutado por mí con `node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1`). Cubren plazo compartido con 404 sin reinicio, transporte que ignora la señal, cuerpo JSON acotado, propietario sin éxito parcial, cancelación previa y durante la lectura, limpieza de temporizadores, fetch tardío que no lee el cuerpo y validación de opciones.
- `tsc --noEmit` sin errores y `npm test` completo **539/539**.
- Revisión independiente (revisor Codex distinto del autor, `CODEX-HS-011-independent.md`): dictamen favorable; ejecutó 8/8.
- Hashes SHA-256 (16 primeros): `server/team/oauth.ts` b84b34bc5b83fd66; `tests/hubspot-context-budget.test.ts` a3076ffea4c660be.

## Límites

- Un temporizador de JavaScript no interrumpe trabajo síncrono de CPU ni un bucle de eventos bloqueado.
- `bounded` deja de esperar y descarta resultados; **no cancela físicamente una consulta a base de datos ya iniciada** ni garantiza detener un transporte que ignore la señal.
- El plazo empieza después de `access()` o de la renovación OAuth: no acota la duración total de una petición HTTP de ficha.
- Sin API real de HubSpot, sin QA visual y sin despliegue: todo con transporte sintético y red bloqueada.
- Reintentos 429 y recencia real de actividades siguen pendientes y separados; este encargo no declara H5 completo.
