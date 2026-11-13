# CLAUDE-QA-081 · Auditoría independiente del inspector COPY074

Autor: claude (una sesión, sin subagentes). Fecha de ejecución: 1/11/2026 (UTC 10:02-10:30). Para dictamen de Codex; sin autoaceptación, despliegue, commit ni instalación.

## 1. Corte revisado y cotejo de hashes

COPY074 está en `review` en el tablón. Los 10 SHA-256 del último `submitted` (shared/copy-inspection.ts, server/copy-inspection.ts, server/main.ts, src/CopyInspection.tsx, src/copy-inspection.css, src/ContinuityHome.tsx, tests/copy-inspection-api.test.ts, tests/copy-inspection-ui.test.ts, tests/e2e/copy-inspection.spec.ts, coordination/reports/CODEX-COPY-074.md) coinciden **antes y después** de las pruebas. También las otras fuentes leídas (server/recovery-preflight.ts `5cbcd229…`, server/backup-coverage.ts `be819d0a…`, server/recovery-copy.ts `2e397e7d…`, server/store.ts `be15276c…`).
Cotejo global (190 ficheros server/shared/src/scripts + package/vite/tsconfig, `tests/.tmp/qa081-0d962793-1a18-4ac7-8b53-1fdbaaafab72/manifest-start.json` y `manifest-end.json`): cambiaron durante mi ejecución, ajenos al inspector y posteriores a mi compilación (10:03Z), `server/connection.ts` (11:09 local), `server/team/oauth.ts` (11:15) y aparecieron `src/ContinuityLab.tsx` y `src/continuity-lab.css`. No toqué nada de eso. El bundle y el `dist` aislados se compilaron a las 10:03Z desde fuentes iguales al manifiesto inicial; las pruebas Node importan las fuentes vivas, cuyos ficheros del inspector no cambiaron. Árbol con muchos cambios sin commit de Codex: no tocados ni descartados. `dist/` y `build/` de la raíz no se escribieron.

## 2. Qué se ejecutó (resultados reales)

Carpeta: `tests/.tmp/qa081-0d962793-1a18-4ac7-8b53-1fdbaaafab72/` (intentos con UUID en `attempts/`, ninguno borrado ni sobrescrito). Entorno del servidor hijo por allowlist (SystemRoot, windir, PATH, PATHEXT, TEMP, TMP, ComSpec + PLANB_PORT/PLANB_DATA_DIR) con `block-external.cjs`; chrome-headless-shell 1228 de ms-playwright; puertos 4471 (E2E), 4472 (A6, listener real), 4473/4474 (mutantes de navegador); el puerto ocupado hace fallar, nunca se reutiliza ni se mata nada; al terminar no queda ningún LISTEN en 4471-4479. No usé 4331/4334, data/, .env*, cuentas ni proveedores. Datos ficticios; contraseñas efímeras con UUID; el valor secreto no se escribe en logs.

| Capa | Comando | Resultado |
|---|---|---|
| API/Fastify (16 casos) | `tsx --test --test-concurrency=1 tests/independent-copy-inspection-api.test.ts` (`attempts/api-final-3f04a93e…`) | **16/16 pasan**, 0 fail/skip/todo |
| UI, simulador de hooks (10 casos) | `tsx --test … tests/independent-copy-inspection-ui.test.ts` (`attempts/ui-final-e1f7c71a…`) | **10/10 pasan** |
| Navegador (6 casos) | `playwright test -c …/pw/pw.config.ts` (`attempts/e2e-final-bdf78305…`) | **6/6 pasan** (26,8 s) |
| Tipos | `tsc -p …/qa081/tsconfig.json` (strict, solo mis 4 ficheros) | sin errores |

El simulador de UI **no es ReactDOM** (lo declara `UI_HARNESS_KIND` y el test U0): transpila el TSX y ejecuta un runtime mínimo de useState/useRef/useEffect con expansión de árbol; sin reconciliador, eventos DOM, layout ni foco. Esas propiedades solo las respalda el spec de Playwright (Chromium headless, sin Edge ni lector de pantalla).

### Cobertura frente al encargo
- **Bytes/transporte (A1-A6):** digest esperado con `node:crypto` sobre el Buffer original; compacto, espacio final, pretty LF/CRLF, `\uXXXX`, no ASCII/emoji (bytes ≠ longitud UTF-16), truncado, vacío, BOM, UTF-8 inválido (5 variantes). Cuerpo estricto: más de 30 casos de base64 no canónico, sobrante/ausente, tipos, campos extra, rutas, revisiones no hex, cuerpo vacío/array/`__proto__`; el valor secreto jamás vuelve en ninguna posición. Límites reales: 21 MiB, 32 MiB exactos (200, sha y tamaño verificados), 32 MiB+1 (413), +2 (422), cuerpo HTTP >48 MiB (413), control de que el límite global de 20 MiB sigue en otras rutas (413), y 21 MiB por un socket real en 4472. Registrados tamaño, código y hash; nunca los bytes.
- **Historia conocida (B1-B8):** guion explícito (A→B→A, varias ediciones de una ficha, alta, edición de otra) con recuentos esperados por reproducción propia, para n=2 y n=5 y cada copia k=0..n; copia más reciente que la referencia; 10.000 registros con dato final y copia truncada al final; bifurcación de igual longitud y más corta que no es prefijo; cambio de revisión sin operaciones (sessionId, spec, snapshot con mismo id de captura); fechas 1999/2099; otro portal; ensayo vs producción y viceversa; producción ficticia con cifrado efímero (sin rastro, mismas tablas); candidata pendiente ≠ referencia activa; referencia sobre el límite (REFERENCE_TOO_LARGE, creada con 1.800 fichas de 10.000 caracteres); integridad sin espacio activo (revisión `null` obsoleta al activarse); sending/uncertain/aprobación antigua sin alterar plan, watermark, custodia ni tablas (digests por tabla antes/después); frontera de registro (el runtime no registra rutas; solo main.ts; `!state.runtime` en ContinuityHome).
- **Concurrencia (U1-U9):** puertas explícitas (`waitFor`/`drain` acotados, sin dormir tiempo fijo; las ausencias dependen de ese drenaje y de los mutantes). Las respuestas alimentadas a la vista son respuestas **reales** del backend en memoria, luego adulteradas para que el esquema las acepte (hash + duplicado, tamaño, revisión, identidad, recuentos, respuesta auténtica de otra referencia con el hash correcto del archivo).
- **Navegador (E1-E6):** bytes exportados reales (cifrados) con digest mostrado = `node:crypto`; whitespace cambia el digest y no el dictamen; truncado/contraseña errónea/UTF-8 inválido nunca en verde (errores 422/invalid **reales**); 4 operaciones perdidas con valor revertido y recuentos de fichas; 409 real sin reintento, con lectura posterior fallida (simulada) y con lectura correcta; respuesta adulterada; cierre con petición real retenida; selección de otro archivo; teclado (Enter/Tab/Enter); sin peticiones hasta abrir y una sola GET; 1440/390/320 sin overflow, controles ≥44 px (incluye `summary` 56 px y botón de archivo), hash completo ajustado (`overflow-wrap:anywhere`). Estado/cambios/custodia iguales antes y después de cada prueba.
- **Capturas inspeccionadas visualmente:** 320 (viewport y región de resultado) y 1440 (viewport y región de resultado); 390 se midió y guardó pero **no la inspeccioné**. En `attempts/e2e-final-bdf78305…/qa081-*.png`.

## 3. Sensibilidad (mutantes en copias efímeras, `mut/`)

Control positivo: las suites sin mutar pasan 16/16, 10/10 y 6/6. Un mutante cuenta cuando la prueba prevista falla por su causa. Servidor (tanda `mutants-api-dce919cc…`, 16 casos tras añadir B1b no repetida; S2 en `mutants-api-55f776f4…`):

| Mutante | Falla |
|---|---|
| S1 quitar bodyLimit de la ruta (vuelve el corte de 20 MiB) | A5, A6 |
| S2 aceptar revisión vieja | A4, B5, B6 |
| S3 aceptar base64 no canónico | A3 |
| S4 persistir confirmación de custodia en el Store real | B1×2, B3, B4, B6, B7 |
| S5 contar solo valores finales al comparar cobertura | B1 (n=2 y n=5) |
| S6 hash del JSON reconstruido | A1, A5, A6 |
| S7 aceptar UTF-8 inválido | A2 |
| S8 sin cifrado efímero para producción | B4 |
| S9 `null` aceptado con espacio activo | A4, B5 |
| S10 prefijo solo por longitud (sin comparar operaciones) | B3 |
| E1 quitar la recomprobación posterior | **15/15 verdes: equivalente** (el manejador es síncrono; nada puede cambiar entre ambas lecturas). No aporta sensibilidad. |
| E2 quitar la comprobación artifactHash | **15/15 verdes: equivalente** mientras exista la guarda UTF-8 (S7 muestra que sin ella esta comprobación convierte el caso en 500). |

Vista (hook simulator): UM1 sin comprobar hash → U7; UM2 sin igualdad de referencia → U7; UM3 resultado tardío sin identidad de operación → U6; UM4 elegir sin retirar → U2, U3; **UM5 reintento automático tras 409 sobrevivió a mi primera versión de U5** (solo ejercitaba una relectura fallida) → reforcé U5 con una relectura correcta y ahora falla; UM6 contraseña conservada tras éxito → U1; UM7 contraseña conservada tras relectura → U5; UM8 limpieza sin abort ni marca de muerto → U3; UM9 lectura de contexto sin identidad de operación (A→B→A) → U4; UM10 elegir aborta la GET inicial → U1, U4; UM11 envío sin una sola operación → U6; UM12 resultado anterior no limpiado → U8. Navegador: UM1 (sin hash) cae en E4 en la línea esperada; UM5 cae en E3 (segunda ronda). Mutantes no ejecutados en todas las combinaciones; sin cifra de mutantes buscada.

## 4. Hallazgos contra COPY074 (priorizados)

Ningún defecto bloquea la afirmación central: integridad, cobertura y custodia permanecen separadas en contrato y en pantalla, y el cliente nunca muestra verde con hash, tamaño o referencia ajenos. No hay regresión que falle en la fuente presentada; no dejo TODO ni skip. Son observaciones y baja prioridad:

1. **Bajo · límite por dos mecanismos con respuesta distinta.** `server/copy-inspection.ts:19` limita la longitud base64 (zod → 422 genérico "Revisa los datos enviados."), `:26` limita bytes decodificados (413 con mensaje propio). Un archivo de 32 MiB+1 da 413; de 32 MiB+2 da 422 (base64 de 44.739.248 > 44.739.244). Reproducción: `A5`, registrado en `api-limits.jsonl`. La UI bloquea >32 MiB antes de leer, por lo que solo afecta a clientes directos. El test acepta 413 o 422 y registra el código real.
2. **Bajo · nombres de campos reflejados.** `server/app.ts:55` devuelve `error.flatten()`: una clave extra con valor secreto aparece en `details.formErrors` ("Unrecognized key"). Los VALORES nunca se reflejan (comprobado en 7 posiciones); el encargo marca valores, por eso solo se registra (`api-body.jsonl`, `keyNameReflected:true`).
3. **Bajo/UX · BOM.** Un JSON UTF-8 con BOM es rechazado como `INVALID_JSON` ("no contiene JSON válido", `server/recovery-preflight.ts:48`). Rechazo honesto con digest exacto de los bytes con BOM; el mensaje no explica la causa.
4. **Observación · contraseña tras errores.** `src/CopyInspection.tsx:32` borra la contraseña tras respuesta aceptada; también en 409, cambio de archivo, descarte, cierre y desmontaje (probado). Tras un error/respuesta rechazada (hash ajeno, 4xx/5xx) se conserva en el campo para reintentar (`e2e.jsonl`: `passwordKeptAfterRejectedAnswer:true`). Decisión de diseño; consta por si se quiere endurecer.
5. **Observación · contexto de la UI.** `src/ContinuityHome.tsx:73` forma `contextKey` con id/capturedAt de captura, nº de cambios y aprobación; la revisión del servidor depende también de sessionId, spec, returnState/watermark (B3 muestra revisión cambiada sin operaciones). La referencia mostrada puede quedar vieja hasta el POST, que da 409 y se recupera correctamente (E3). Lectura de código + prueba de API; no reproducido en navegador.
6. **Límite de confianza, no defecto.** El cliente valida hash, tamaño, referencia y esquema del informe; no puede comprobar que los recuentos/resumen del servidor sean verdaderos (recuentos falsos pero coherentes entre sí y con la referencia activa). Eso depende de la confianza en el servidor local.

Dictamen sugerido: aceptable para lo que declara (integridad por bytes, cobertura por prefijo real de historial, sin custodia); los puntos 1-3 son ajustes opcionales.

## 5. Fallos del arnés (no del producto) y trampas, conservados

`attempts/api1/api2` (B6: la referencia grande no se pudo crear por límites del producto: texto de 10.000 caracteres y campos sin definición; rediseñada con 1.800 fichas), `ui1` (U3 medía una escritura legítima del `setOpen`), `e2e1` (config ESM: `__dirname`), `e2e2` (la bandera derivada `custody.current` cambia legítimamente tras editar; y esperaba contraseña vacía tras una respuesta rechazada, que el producto conserva a propósito), `vite.mut.config.ts` (escape de barra invertida). `npm test` ejecuta mis dos pruebas Node en paralelo con las demás: A6 escucha en 127.0.0.1:4472 (falla si está ocupado) y A5/B2/B6 reservan ~100 MB y tardan ~10-15 s.

## 6. Límites

Simulador de hooks, no ReactDOM; solo Chromium headless shell 1228 (sin Edge ni lector de pantalla); un único equipo Windows; datos ficticios, sin custodia ni restauración reales; el runtime independiente no se instaló (se verificó registro estático y 404 dinámico); reintentos de carrera acotados, no probabilidad de ausencia; los errores 401/404/422/500/red de la vista son simulados (U8); reales: 409, 422 y contraseña errónea; la cancelación del navegador impide entregar la respuesta retenida en E4, por lo que esa prueba demuestra retirada a nivel de vista y NO un transporte que ignora abort (eso solo lo cubre el banco controlado U3/U6). No se repitió la matriz de mutantes tras añadir B1b.

## 7. Archivos propios

tests/helpers/independent-copy-inspection-harness.ts · tests/independent-copy-inspection-api.test.ts · tests/independent-copy-inspection-ui.test.ts · tests/e2e/independent-copy-inspection.spec.ts · coordination/reviews/CLAUDE-QA-081.md. Config Playwright, mutantes, builds y logs fuera de esos cinco, bajo `tests/.tmp/qa081-0d962793-1a18-4ac7-8b53-1fdbaaafab72/`.

---

# R2 · Refuerzo de A2 (dictamen Codex Q1, 1/11/2026)

Alcance: solo `tests/independent-copy-inspection-api.test.ts` y este informe. R1 íntegro conservado (sin borrar) en `tests/.tmp/qa081-0d962793-1a18-4ac7-8b53-1fdbaaafab72/r1-preserved/` (informe R1 `b0bd043d…`, test R1 `20efefd1…`). Los otros 3 archivos QA081 conservan los hashes de R1 y los 10 hashes COPY074 siguen iguales al submitted (comprobado antes y después de R2; las 17 fuentes leídas, ninguna distinta).

**Q1 aceptado.** El A2 de R1 terminaba con `assert.deepEqual(persistentDigests(i.store), persistentDigests(i.store))`: dos lecturas del mismo estado final, sin valor. Era un hueco de mi prueba, no un defecto de COPY074.

**Cambio.** A2 captura los digests por tabla después de `exportPlain` y antes de cada petición, y los compara después de su resultado, para truncado, vacío, BOM y cada una de las 5 secuencias UTF-8 rechazadas. Se eliminó la aserción vacía; ninguna otra aserción se borró ni se aceptó respuesta verde nueva.

**Sensibilidad.** Mutante efímero S11 (generador en mi carpeta, fuera del árbol `server/`): tras `checkedInspection` escribe `store.set('qa081InvalidInspectionMarker')` solo si `inspection.status==='invalid'`. Resultados (`attempts/r2/`, UUID por intento, logs conservados):
| Ejecución | Resultado |
|---|---|
| A2 de R1 + S11 | 1/1 pasa: falso verde (confirma el hallazgo) |
| A2 de R2 + fuente real | 1/1 pasa |
| A2 de R2 + S11 | 0/1, falla por `meta` distinto (`+ 65688e61… / - ead48030…`) |
No son casos nuevos de la suite ni defecto del producto.

**Repetición.** `attempts/api-r2-final-505b6260-f916-4cdf-8076-dbcabe8f1456`: 16/16 pasan, 0 fail/skip/todo; `tsc` estricto sin errores. Hash final del test API: `3b0429132e79fcbe3c4b9d56da49f21061259b2756355ac47e854dfc6096ec8c`. UI 10/10, E2E 6/6 y la matriz de mutantes de R1 no se repiten (no cambiaron esos archivos); siguen siendo resultados de R1.
