# CLAUDE-QA-091 · Auditoría adversaria R1: integridad persistida y barreras concurrentes

Autora: Claude (sesión única, sin subagentes). 01/11/2026, Europe/Madrid. Entrega para revisión; sin autoaceptación.
Evidencia: `tests/.tmp/qa091-c22e2b0b-4de1-4f92-b660-32338701c513/` (logs, mutantes, builds, capturas, `inventory.json`). Nada se borró.

## 1. Puerta de entrada y fuente congelada

Tablón rev. 722. Las 9 tareas (REL046, INTEGRITY055, HISTORY064, MANUAL067, COPY074, MANUAL-ID076, RECOVERY-INTEGRITY087, SOURCE-CASE089, RECOVERY-BOOT090) están en `review` y los **45 hashes** de sus `submitted` coinciden con los archivos vivos (cotejado de nuevo al retomar). Se congeló `frozen/` (server, shared, src, package.json) = vivo en los 18 archivos leídos. Al retomar, vivo≠congelado solo en `server/connection.ts` y `server/team/oauth.ts` (HS-029, fuera del alcance auditado) y en archivos nuevos no relacionados (`continuity-evidence*`, `ContinuityLab`…); los bancos de persistencia y UI se repitieron también contra el árbol vivo (56 y 26 casos, mismo resultado). Barreras/E2E/mutantes solo sobre la fuente congelada.

## 2. Resultados propios (ejecutados; fallos/skips/TODO exactos)

| Banco | Casos | Pasan | Fallan | Skip | TODO (hallazgos) |
| --- | --- | --- | --- | --- | --- |
| `independent-persisted-plan.test.ts` | 56 | 53 | 0 | 0 | 3 (F1, F2, F3) |
| `independent-return-barriers.test.ts` | 165 | 164 | 0 | 0 | 1 (F4) |
| `independent-return-integrity-ui.test.ts` | 26 | 26 | 0 | 0 | 0 |
| `e2e/independent-return-integrity.spec.ts` | 10 | 10 | 0 | 0 | 0 |

`tsc --noEmit` estricto: 0 errores en todo el proyecto (se corrigieron los errores previos de tipos de mis pruebas con `as any` deliberados donde el test lee `details` o muta objetos devueltos). Cada caso falla si no ejecuta ninguna aserción (contador propio). Los TODO son casos que codifican la propiedad deseada y hoy se incumple (node:test los marca `todo`, no rompen `npm test`).
Los 165 de barreras son familias parametrizadas, no 165 ideas distintas: 5 familias (preview, refresh, apply, resolve, manual) × espera remota (éxito/error) × transacción, 24 acciones × válido/inválido, 25 endpoints HTTP, 7 barreras internas, continuidad, custodia, inspector, 6 arranques de proceso.
Navegador: Chromium headless shell de caché, servidores propios en 4481-4489 (bundle esbuild de `server/main.ts` y `vite build` a `run/`), SQLite ficticia nueva por caso, claves de fixture tipo `test` (no se invoca DPAPI), todo remoto distinto del servidor propio abortado y contado (0). Capturas 1440/390/320 inspeccionadas (E6-320 revisada).

## 3. Dictamen por garantía

- **Persistencia (cumple).** 27 formas inválidas y 4 tipos SQL no textuales → `invalid`, plan nulo, mensaje fijo sin eco, fila byte a byte conservada tras construir `Recovery`, reabrir 3 veces y arrancar `createBaseApp` (almacén cifrado incluido; ciphertext alterado → invalid). `none` (ausente, `null`) ≠ `invalid`. Caché por bytes: A→B→A→B′→none y cambio por otra conexión observados. Clones: mutar lo devuelto no altera lecturas ni fila. Plan válido viaja en el bundle y se restaura.
- **Barreras (cumple con una salvedad F4).** 24 acciones directas y 25 endpoints: 409 `RECOVERY_PLAN_INVALID`, ledger SQL idéntico, 0 llamadas remotas, sin marcador ni pila. Lecturas, historial JSON/CSV, continuidad y contexto del inspector siguen legibles.
- **Concurrencia (cumple).** Barrido de 5 familias: corrupción con la promesa remota retenida en cada espera (`verify/read/create/update/hasRelation/relate`) y liberada con éxito o error, y justo antes de cada transacción. Siempre: rechazo (409 si éxito remoto), ledger idéntico al de después de corromper (sin plan, mapeo, watermark, returnComplete ni informe manual), 0 llamadas posteriores. Los efectos ya despachados se cuentan aparte (`matrix-results.json`) y no se exige deshacerlos.
- **Continuidad/inspector (cumple).** `tick()` no inventa `lastAttempt`; `capture()` bloqueado no registra intento; custodia no vigente ni reconfirmable; inspector: archivo correcto → `valid` sin cobertura, alterado → no valid, contexto antiguo → 409, y razón `RECOVERY_STATE_INVALID` distinta de `NO_ACTIVE_COPY`.
- **UI (cumple).** Servidor antiguo, incoherencia plan/estado (3 variantes), metadatos inválidos con historia válida, respuesta sana vieja tras inválida con transporte que ignora el abort (arnés y navegador real), manejador capturado, doble acción sin render, autorización no resucitada (A→B→A), acuse manual conservado con GET fallido y reintento solo de lectura (POST = 1), botón de 44 px, teclado, foco y sin desbordamiento a 1440/390/320, ningún control que autorice en bloqueo.
- **Arranque (cumple).** `main` y `runtime` con proceso real: sin snapshot + plan inválido + semilla válida → API arriba, semilla no restaurada, fila intacta; semilla restaurada sin plan; semilla ignorada con snapshot.

## 4. Hallazgos (fuente congelada = vivo)

- **F1 (baja)** `server/store.ts:50` `migrateEncryption` hace `JSON.parse` de cualquier fila no sellada: un plan en texto claro no-JSON hace lanzar `SyntaxError` al abrir el `Store` (la app no arranca, sin diagnóstico fijo); el archivo no se modifica (rollback). Pasos: sellar el fixture, `INSERT` plano `{garbage`, `new Store`.
- **F2 (baja)** `server/recovery.ts:87` (`approve`) y `:128` (`apply`): `store.record(...)!` sin comprobar nulo. Un plan estructuralmente válido con `localId` inexistente hace que `approve` lance `TypeError` (HTTP 500 genérico). «valid» es solo estructura. Fila intacta.
- **F3 (baja-media)** `server/recovery.ts:134` y `:29` (`save`): `op.remoteId` de `remote.create` se persiste sin validar tipo ni plan. Un `Remote` que viole el contrato (número) deja el plan guardado `invalid` por escritura propia y bloquea la app sin reparación. El `hubspotRemote` real convierte a `String`, por lo que es hipotético.
- **F4 (media-baja)** `server/generator.ts:56` → `server/store.ts:156-162`: `POST /api/generate` (demo) con plan inválido devuelve 409 pero `failGeneration` escribe `meta.candidate` (copia de la captura + error). Rompe «ausencia de cambios»; recuperable con `/api/v2/candidate/discard`.
- **O1 (observación)** Una captura ya en vuelo al corromperse el plan termina: añade captura y marca `captureLastSuccess` (`server/continuity.ts:63`, `store.addCapture` sin guarda). No toca plan, registros, historial, mapeo ni marcas (comprobado). R1 no lo declara; se deja como decisión del autor.

## 5. Controles causales (copias efímeras de la fuente congelada; diffs en `mut/*/MUTANT.diff`)

Bancos usados en los mutantes: persistencia `fc6910…`, barreras `c76217…` (hash anterior a añadir el caso O1), UI `71d98f…`. 13 mutantes de servidor y 8 de UI; cada uno con un único reemplazo exacto verificado. Falla = casos rojos del banco; el control positivo (misma prueba sobre fuente real) pasa.

| Mutante (defecto) | Rojos | Oráculo que lo detecta |
| --- | --- | --- |
| `save-unguarded` (Recovery.save sin guarda en transacción) | 34 | ledger tras corrupción antes de transacción/espera |
| `remote-unguarded` (sin guarda pre/post espera) | 11 | llamadas remotas posteriores > 0 |
| `apply-watermark-unguarded` | 1 | watermark/returnComplete tras corrupción |
| `manual-final-unguarded` | 1 | informe+marca manuales tras corrupción |
| `saveRecord-txn-unguarded` | 2 | registro y cambio escritos con plan inválido |
| `bundle-omits-plan` | 13 | bundle con plan omitido aparentando validez |
| `boot-unguarded` | 2 | proceso muere con 409 al restaurar semilla |
| `tick-unguarded` | 1 | `lastAttempt` inventado |
| `inspector-reason` | 2 | razón atribuida a «sin espacio» |
| `custody-confirm-unguarded` | 3 | custodia confirmable/actual |
| `no-clone` | 1 | alias del plan en caché |
| `cache-stale` | 120 | A→B→A y flujos normales |
| `invalid-as-empty` | 150 | inválido→none (plan dañado = vacío) |
| UI: `ui-trusted-guard-removed`, `ui-stale-guard-removed`, `ui-action-guard-removed`, `ui-old-server-as-healthy`, `ui-reviewed-survives`, `ui-manual-ack-lost`, `ui-manual-block-ignored`, `ui-allowed-ref-removed` | 1, 2, 1, 4, 1, 1, 1, 1 | un caso preciso cada uno |

En navegador real: build vite de `ui-stale-guard-removed` → E4 rojo (la devolución se reabre transitoriamente); build de `ui-trusted-guard-removed` → E5 rojo (2 POST a `/return/preview`; el servidor los rechaza igualmente). Sus builds sanos pasan.
**Sondas de equivalencia (0 rojos, no son defecto del producto)**: `remote-post-removed`, `remote-pre-removed`, `manual-pre-final-removed` y `restore-txn-unguarded`. Las guardas pre/post de `checkedRemote` (`recovery.ts:30`), la previa de `manual-recovery.ts:60` y la de la transacción de `restoreBundle` (`store.ts:302`, cubierta por `resetReturnState` `store.ts:351`) son redundantes entre sí: cada una sola no cambia nada observable; solo su conjunto protege. No se contabilizan como controles.

## 6. Límites y no comprobado

- Fuente congelada (core) frente al build: `run/` compilado de la misma fuente; UI observada en Chromium con servidor propio. No se sumaron repeticiones como casos únicos.
- Arnés de UI = reconciliador propio de hooks (no React DOM); lo crítico se repitió en navegador (E4/E5/E6/E7).
- No se hizo comparación contra la versión anterior (HEAD) por incompatibilidad de API (`recoveryIntegrity` no existe): se usaron mutantes de guarda, no cortes antiguos.
- Inspector en navegador, lector de pantalla, otro tamaño de contraste, SQLite dañada a nivel de página y reparación: no probados. Ningún proveedor, instalación 4331/4334/4420/4421, build/dist de raíz ni datos reales usados. R1 es validación estructural: no prueba éxito remoto, permisos ni semántica relacional.
- La corrupción es SQL sobre el fixture (no una barrera del SO). Los puntos «justo antes de la transacción» instrumentan `store.transaction` de la instancia (no mutan la fuente).

## 7. Hashes actuales

Bancos (finales): `independent-persisted-plan.test.ts` 6b80942578e6852e0894a2ffcc6a5d2cbafb56bf34a08078256c460e106c48da · `independent-return-barriers.test.ts` 1d632d1465c6804b4cd5ab522330b80507c9bcdba5128b4ac44abcc2186f165b · `independent-return-integrity-ui.test.ts` 71d98f37fb142361ed677eaa97f41bd5610b964b2bf0031077dc47c28fd4a23d · `e2e/independent-return-integrity.spec.ts` ebf19e7b0d8b756c25a229563600e89c48907fb170576c0ad16de3788362882a. Fuentes de Codex: 45/45 = `submitted` (ver `inventory.json`; HEAD a29e946, tablón rev. 722).
