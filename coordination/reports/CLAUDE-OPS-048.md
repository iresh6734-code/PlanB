# CLAUDE-OPS-048 · Radar operativo y comparador de capturas en Continuidad

30/10/2026. Una sesión Claude, sin subagentes. Solo lectura de APIs ya aceptadas (OPS039 y DIFF040). Sin despliegue, sin tocar 4331/4334, sin `npm run build`, sin commit ni autoaceptación.

## Problema

La página «Continuidad del CRM completo» no respondía a «¿qué tareas debo atender en las próximas horas?» ni a «¿qué cambió entre estas dos copias?», aunque el servidor ya ofrece `GET /api/v2/continuity/response-queue` y `GET /api/v2/captures/compare`.

## Comportamiento resultante

Un bloque secundario «Operaciones de la copia» (ocultable, debajo de «Mantén la copia al día») con dos pestañas accesibles (`TabList` existente, flechas/Inicio/Fin):

- **Qué atender (radar).** Horizonte 8/24/72/168 h y tareas visibles 25/50/100; la hora de cálculo es la del servidor. Muestra procedencia (copia activa, cuenta, captura, revisión abreviada), recuentos completos, «Mostrando n de N», grupos Vencidas / Dentro del horizonte / Por revisar / Posteriores con motivo y siguiente paso, asociaciones disponibles o «ID … (no disponible)» sin tratarlas como dependencias, fechas sin hora como «Día AAAA-MM-DD (sin hora)» con aviso de incertidumbre, datetime en hora local legible, estado desconocido visible. Un recuento no numérico se muestra «—», nunca 0. Sin dinero perdido ni puntuación. Sin copia activa no consulta y remite a «Continuar trabajando»/«Preparar aplicación».
- **Qué cambió (comparador).** Selectores «Primera captura» / «Segunda captura» con los IDs exactos de `ContinuityStatus.captures`; vacío útil con menos de dos. Consulta solo al pulsar «Comparar capturas» (o «Reintentar consulta»). Resultado: procedencia de ambas, recuentos por entidad, registros paginados (25 por página, offset/limit del servidor, «Registros a–b de total»), antes/después tipados (propiedad ausente, `null`, texto vacío, booleano y número se distinguen), aviso de vista previa recortada a 500 y de «n de N campos», esquema/configuración y relaciones en grupos aparte con sus marcas de muestra truncada, y límites del servidor. «Ausente» se explica como «no figura en la segunda captura», no borrado en HubSpot. El orden elegido no se invierte (`chronological:false` se rotula «comparación inversa»).
- **Solo lectura:** ninguna petición del bloque usa un método distinto de GET; no hay botones de completar/editar/preparar/agentes ni enlaces al piloto.

## Archivos exactos (únicos escritos)

| Archivo | SHA-256 |
|---|---|
| src/ContinuityHome.tsx | `91462f0bfe4edcf842dabcd1d722655cfcf8b8cae71b6cb94ea15d9c8b3ca3e8` |
| src/ContinuityOperations.tsx | `7624dd4060de01f337bb74208aee7c80e9728c163622be6fd342c64dc9ca8790` |
| src/continuity-operations.css | `f42b866a3ca150b205abcde6a79352f2bc916c2cb68de576ce334629bb342150` |
| tests/continuity-operations.test.ts | `c060871f6d11e9f6518f2cf66e2567168825b4335c4d2ed78bf0492a8b01527e` |
| tests/e2e/continuity-operations.spec.ts | `b8d82ec0e067bd5a61907b7a14e3e9e677061a4de8a974d48d253068b8caca3f` |
| coordination/reports/CLAUDE-OPS-048.md | lo registra `submit` |

Cambio en `ContinuityHome.tsx`: un import y una línea que monta `<ContinuityOperations captures activeCaptureId refreshContext>`; el resto del módulo no se tocó. El CSS se importa desde `ContinuityOperations.tsx` (no se tocó `main.tsx`) y todos sus selectores cuelgan de `.continuity-operations`; neutraliza dentro de `.co-table` los `th/td` globales de `refinements.css` (altura 61 px, fondos) sin redefinir `:root`, `body` ni botones/tablas globales.

## Decisiones de fuente y concurrencia

- **Fuente del radar:** `state.snapshot.id + ':' + capturedAt` del padre (copia activa). La respuesta trae `source.captureId`; si difiere, se descarta el resultado, se avisa y se ofrece «Actualizar contexto» (el `refresh` existente) y repetir la consulta. Sin copia activa no hay petición.
- **Fuente del comparador:** IDs de `status.captures`. Una selección que desaparece del historial no se sustituye (aviso y botón desactivado); una captura recién llegada nunca se elige sola. Misma captura en ambos lados no se compara.
- **Concurrencia:** hook `useQuery` con clave estable, `AbortController` y bandera `live` por efecto; cambiar horizonte/límite/captura/par/página, cerrar el bloque o desmontar aborta y descarta respuestas tardías; el estado solo se muestra si su clave coincide con la actual (no hay un fotograma con datos de otra clave). Además cada respuesta se valida (`captureId`, `from/to.captureId`, `offset`) antes de aceptarse. Sin sondeo propio: el refresco de 2500 ms del padre no cambia las claves, así que no genera peticiones (comprobado en el test de fuente: sin `setInterval`). Carga inicial: una sola petición del radar al montar.
- **Errores:** 404 de ruta («Operación no disponible…») → «requiere actualizar Plan B»; 404 «No se encontró la captura.» → captura ya no existe; 409/422 → mensaje del servidor; 401 → «Desbloquea tu copia local…» sin botón de reintento (el wrapper `api()` sigue emitiendo `planb:locked`; además el bloque se retira al recibirlo); otros → mensaje recuperable con «Reintentar consulta». Pulsar «Comparar capturas» de nuevo tras un error repite la misma consulta. Se evita `role="status"` propio para no duplicar los mensajes existentes.
- Los controles son `<select>`/`<button>` nativos con etiqueta y `disabled` real; objetivos de 44 px.

## Pruebas propias y resultados

Fixtures y build aislados en `tests/.tmp/claude-ops048` (dist de Vite propio, `harness.mjs` y `server.mjs` esbuild propios, datos SQLite ficticios nuevos por ejecución). Puerto **4351** (un servidor, un navegador); 4331/4334/4337/4341 no usados. Navegador: Chromium headless shell de la caché de Playwright (`chromium_headless_shell-1228`, perfil temporal); no se usó ningún navegador ni perfil del usuario.

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | sin errores |
| `node --import tsx --test tests/continuity-operations.test.ts` | 10/10 |
| Focales: ui-journeys, customer-combobox, continuity-operations, response-queue-api, capture-comparison-api, design-tokens | 105/105 |
| E2E nuevo (`continuity-operations.spec.ts`, harness con 3 capturas: activa, anterior con cliente extra, otro portal) | 4/4 |
| E2E existente `continuity.spec.ts` contra build aislado de `server/main.ts` + `drill.mjs` | 8/8 |

Cobertura causal (aceptación §6): (1) radar con ruta, horizonte y recuentos reales, nulo → «—», estado desconocido visible; (2) respuestas diferidas en orden inverso, cambio de captura y desmontaje no reponen datos; (3) comparación sintética con ausente/null/vacío/booleano/número, recorte y grupos; (4) paginación y selecciones sin mezclar pares, 404/409/422 conservan la selección, reintento repite el mismo par; (5) 404 de servidor antiguo y 401 sin resultado ni filtración; (6) navegador: ambos paneles, teclado (flecha entre pestañas, foco), 1440/390/320 sin desbordamiento de página, sin red externa, sin errores de consola, cero peticiones no GET a las rutas del bloque, 409 real del servidor por portal distinto; (7) historial, simulacro, copia/recuperación y navegación existentes siguen presentes (nuevo E2E) y el E2E de Continuidad previo pasa sin tocar sus aserciones.

**Sensibilidad (copia efímera en scratch, `PLANB_UI_SRC`):** quitando la bandera `live` y el `abort` del hook, el test «respuesta vieja…» falla (9/10). El 404 de `/api/v6/workspace` que aparece en el harness lo pide la app existente y su servidor aislado no la registra; se excluye explícitamente de la aserción de consola y no procede de este bloque.

Capturas: `tests/.tmp/claude-ops048/traces/continuity-operations-rada-63e35-na-y-sin-errores-de-consola/comparador-{1440,390,320}.png`. Resultado JSON: `tests/.tmp/claude-ops048/resultado-e2e.json`.

## Límites

- Backend existente = OPS039/DIFF040 sin modificar. Nueva UI = estos cinco archivos. Build aislado = `tests/.tmp/claude-ops048`. **Piloto instalado (4331/4334) no verificado ni desplegado**: un servidor anterior devolverá 404 y la UI lo explica.
- Las pruebas de hooks no son React DOM; el comportamiento real lo cubre el E2E de Chromium. No se probó con lector de pantalla ni con Edge (no instalado en esta máquina).
- El 401 real se simula con `route.fulfill` en el E2E y con el transporte ficticio en la prueba unitaria; no se configuró una contraseña local en el harness.
- Selector de horizonte con cuatro valores prefijados (dentro de 1–720); no hay entrada libre. El comparador no ofrece tamaño de página distinto de 25.
- El bloque es del CRM completo; el piloto de equipo no tiene estas bases/API y no se enlaza.
- No se toca `package.json`, lockfile, backend, contratos, estilos globales, App/TeamApp, contexto ni panel. Integraciones reales, laboratorio persistido y verificador de archivos en pantalla siguen para unidades posteriores.

## R2 · Devolución de Codex (P2: captura retirada con comparación en vuelo)

30/10/2026. Reproducción de `coordination/reviews/CLAUDE-OPS-048-progress.md` confirmada: `useQuery` solo dependía de `req`, así que retirar un miembro del par del historial no abortaba ni invalidaba la consulta, y la respuesta vieja reponía resultado y paginación junto al aviso.

**Corrección (solo `ComparePanel`).** La consulta activa es `req` únicamente mientras ambas capturas del par sigan en `captures` (`active`); la clave, la comprobación de identidad, los estados de carga/error/resultado y la paginación usan `active`. Al faltar un miembro, la clave pasa a `null` (cleanup: `live=false` + `abort`), y un efecto limpia `req`, de modo que si la captura reaparece no se repite sola la petición antigua. La selección explícita (`from`/`to`) y el aviso «ya no está en el historial» se conservan; nunca se elige otra captura. Una respuesta o error tardío se descarta por `live=false`, aunque el transporte ignore `abort`. Volver a un par válido exige pulsar «Comparar capturas» y empieza en offset 0. Sigue siendo solo GET y sin sondeo propio.

**Regresiones nuevas (unitarias, `tests/continuity-operations.test.ts`, 14/14):** (1) captura retirada con petición pendiente: aborta, la respuesta tardía no repone nada, selección y aviso intactos; (2) retirada tras recibir resultados (y tras un error): se retiran resultado, paginación y error; (3) transporte que ignora la cancelación (respuesta y error tardíos); (4) reaparición de la captura + selección explícita: sin petición automática, nueva consulta con `offset=0`. Se añade además un E2E de navegador con el refresco real de Continuidad devolviendo el historial sin la segunda captura mientras la comparación está retenida.

**Sensibilidad.** En copia temporal con la versión anterior (`const active = req;`, vía `PLANB_UI_SRC`), las 4 regresiones fallan (10 pasan, 4 fallan) y con la corrección pasan 14/14. La copia temporal se borró. No repetí la mutación sobre el E2E de navegador (necesitaría otro build de la versión anterior).

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | sin errores |
| `node --import tsx --test tests/continuity-operations.test.ts` | 14/14 |
| Focales (ui-journeys, customer-combobox, continuity-operations, response-queue-api, capture-comparison-api, design-tokens) | 109/109 |
| `npx vite build --outDir tests/.tmp/claude-ops048/dist` (build aislado, no `npm run build`) + E2E nuevo, puerto 4351 | 5/5 |
| E2E existente `continuity.spec.ts` contra el build aislado | 8/8 |

Navegador: Chromium headless shell de la caché de Playwright. Sin 4331/4334, sin despliegue, sin commit ni autoaceptación. Límites anteriores vigentes.
