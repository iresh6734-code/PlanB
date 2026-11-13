# «Historial de lecturas» · traspaso del consumidor (CLAUDE-SOURCE-READING-HISTORY-UI · R2)

9/11/2026, Europe/Madrid. Claude B. **Estado real:** el componente, su cliente y su estilo existen y están probados con un servidor real (ver informe). **No están montados**: ni Integraciones ni ninguna otra pantalla los muestran hoy, y no existe la acción de leer del proveedor ni un ensayo con cuenta real. El historial que muestra es el de las lecturas de ENSAYO (`*-fixture`, cuentas `fixture-*`) que el GET 298 sirve; no acredita acceso ni conexión.

## Puerta de aceptación y dependencias (R2)
| Dependencia | Qué usa el consumidor | Estado |
| --- | --- | --- |
| `CODEX-SOURCE-READING-HISTORY-298` y diario 297 | El GET, el esquema `sourceHistoryResponse` y la consulta | **Aceptadas** (`done`) |
| `CLAUDE-SOURCE-INTEGRATIONS-CONTRACT` (SourceStatus) | `evidenceOf` y `EvidenceKind` (cliente) para clasificar el intento de cada recibo | **R3 aceptada (`done`)**, huella probada `fddfda1bd5b73d4b5a32e0eca96e6b58a9188d6b7b50be911421c37cf2a08da1` |
| `shared/continuity-passport.ts` (solo `when`, formato de hora de Madrid) | La hora observada y la guardada del componente | **Bytes aceptados de 214** (`9b22877f…0870`) congelados en el banco; 308 tiene otra versión en revisión que NO se probó. Al aceptarse 308 hay que repetir y fijar otra combinación. El montador debe usar un `continuity-passport` aceptado |
| `shared/source-reading.ts` (Zendesk R3 aceptada) | `describeStop`, `sourceStops` | Aceptada |

**Acoplamiento.** `EVIDENCE_TEXT` es un `Record<EvidenceKind, string>`: si SourceStatus añade una categoría, el tipo no compila y la prueba de conjunto cerrado falla. Con SourceStatus R3 hay una categoría nueva, `interrupted`, porque un plazo o una cancelación con la petición enviada no distinguen si ya habían llegado las cabeceras: el recibo dice «se interrumpió … no se sabe si la fuente llegó a responder»; «falló la red antes de recibir respuesta» queda solo para la causa `network`.

## Qué se entrega (componente, no montado)
| Pieza | Ruta |
| --- | --- |
| Cliente same-origin (un GET, sin reintentos, valida la respuesta contra lo pedido, descarta lo tardío) y `historyIdentityKey` | `src/source-reading-history-client.ts` |
| Componente `SourceReadingHistory` | `src/SourceReadingHistory.tsx` |
| Estilos (`srh-*`, sin reglas globales) | `src/source-reading-history.css` |

## Props exactas (las fija el anfitrión; el componente nunca amplía el ámbito)
```tsx
<SourceReadingHistory
  source={{ provider: 'zendesk-fixture', accountId: 'fixture-…', objectType: 'ticket', mode: 'listing', target: null }}  // la MISMA fuente que el servidor ata a la sesión en scopeForRequest
  contextRevision={state.workspaceSearchContext.contextRevision}                // pin de la copia activa (como el Radar); ausente = no montar
  label="Zendesk de ensayo"                                                     // nombre visible del anfitrión; no sale de los registros
  environment="ensayo"                                                          // único valor: el contrato 298 solo sirve ensayos
  identityKey={historyIdentityKey({ session, instance, context, capture, provider, account, object, mode, target })}
  pageSize={10}                                                                 // opcional, 1–25
/>
```
**Identidad completa (`historyIdentityKey`).** Serializa un arreglo de nueve cadenas con JSON, así que ningún valor con separadores puede confundirse con otro reparto (con `join('|')`, `['a|b','c']` y `['a','b|c']` colisionan). El montador pasa, y debe actualizar cuando cambie cualquiera: `session` (contador que el anfitrión incrementa al desbloquear; el navegador no ve la cookie de sesión — `LocalIntegrations` ya tiene `lockEpoch` y escucha `planb:locked`), `instance` (`instanceId`), `context` (`contextRevision`), `capture` (captura activa, p. ej. `snapshot.id + ':' + snapshot.capturedAt`), y la fuente (`provider`, `account`, `object`, `mode`, `target` o `''`). El componente además se reinicia solo si cambian `source`, `contextRevision`, `pageSize` o `fetcher`.

La consulta lleva proveedor, cuenta, objeto, modo (y objetivo si es `lookup`), `contextRevision`, `limit` y `cursor`. No lleva etiquetas ni valores. El servidor decide con `scopeForRequest`; si la fuente pedida no es la autorizada responde 403 y no se muestra nada.

## Puntos de inserción concretos y dueños
| Paso | Archivo | Dueño | Depende de |
| --- | --- | --- | --- |
| 1. Registrar el GET con el ámbito real: `registerSourceReadingHistory(app, store, { scopeForRequest })` devolviendo el `SourceHistoryBinding` (`instanceId`, `contextRevision`, `scopeRevision`, `source`) de la fuente de ensayo de la sesión; junto a `registerWorkSummaryApi` (`server/main.ts`, hoy líneas 35–37) | `server/main.ts` | Codex coordinador | 298 (aceptada); registro de fuentes |
| 2. Registro local de fuentes y ámbito autorizado (qué fuente de ensayo ve esta sesión; `scopeRevision` que cambia si cambia el ámbito) | Nuevo módulo de servidor | Codex coordinador | Contrato de estado aceptado |
| 3. Pasar a `LocalIntegrations` el pin y la captura (hoy `<LocalIntegrations onConnectHubspot=…/>` en `App.tsx` no recibe `workspaceSearchContext`) | `src/App.tsx` | Codex coordinador | — |
| 4. Montar `<SourceReadingHistory/>` bajo la fila de la fuente, solo con copia de ensayo activa y fuente `*-fixture`; componer `identityKey` con `lockEpoch`, `instanceId`, pin, captura y fuente | `src/LocalIntegrations.tsx` | Codex coordinador (o Claude B con rutas acordadas) | Pasos 1–3 y aceptación de esta unidad |
| 5. Acción explícita «Leer ahora» que escriba en el diario 297 (con cuenta y alcance autorizados) | Nuevo endpoint | Codex coordinador | Registro de fuentes |
| 6. QA del producto montado (recorrido de abajo) | `tests/e2e/…` propios | Claude B (unidad `CLAUDE-SOURCE-HISTORY-MOUNT-QA`) | Pasos 1–4 |

## Tabla de comportamientos (verificada en el banco real)
| Situación | Estado (`data-state`) | Texto principal | Qué se muestra |
| --- | --- | --- | --- |
| Consultando | `loading` | Consultando el historial local… | Nada del resultado anterior |
| Sin recibos | `empty` | Sin recibos locales para esta fuente. Que no haya recibos no dice nada de lo que tenga el proveedor | Nada más; **nunca** «proveedor vacío» |
| Parte leída | `partial-view` | Hay N recibos locales…; se han cargado M | Recibos cargados; **sin** «último guardado» |
| Todo leído | `complete` | N recibos locales de esta fuente | «Último guardado» y «Observación más reciente» por separado |
| 401 | `locked` | Plan B está bloqueado… | Nada; se descarta lo leído, también al continuar |
| 403 | `out-of-scope` | Esta fuente no pertenece al ámbito autorizado… | Nada |
| 409 (pin o historial) | `changed` | La copia o el historial cambiaron mientras se leía | Nada; con otro pin el cambio de prop vuelve a consultar solo |
| 409/422 al continuar | `partial-view` | Aviso «El historial cambió mientras se leía; se volvió a consultar desde el principio» | Primera página del corte nuevo |
| 503 / respuesta inválida / fallo | `unavailable` / `invalid` / `failed` | Se desconoce cuántos recibos hay (no es cero) | Nada; botón «Reintentar consulta local» (solo local) |
| 404 | `not-registered` | Esta versión todavía no ofrece el historial | Nada |

Cada recibo (orden de inserción del contrato, el más antiguo primero) muestra: número, cobertura, hora observada y hora guardada, causa de la parada, **intento** (datos / no salió ninguna petición / falló la red antes de recibir respuesta / interrumpido sin saber si llegó respuesta / error de la fuente / respuesta inutilizable), páginas y peticiones, omitidos y espera pedida. Un fallo sin datos dice «Recuento desconocido (no es cero)». **No** muestra etiquetas, asuntos, referencias externas, valores, cuerpos ni el ID de un registro.

## Garantías de la consulta
Un solo GET local por acción; «Actualizar historial local» y «Cargar más recibos» no leen del proveedor ni escriben (el banco compara las tablas antes y después); respuestas tardías (otra identidad, otro pin, componente desmontado, transporte que ignora `AbortSignal`) no se publican; una respuesta que no corresponde a lo pedido (otra copia, otra fuente, otro tamaño de página, paginación incoherente) es «inválida» y no se usa. El aviso de ensayo y «No conectado» se ven siempre.

## Recorrido de QA con el producto montado (unidad `CLAUDE-SOURCE-HISTORY-MOUNT-QA`)
Cada paso indica qué depende del montaje. Hoy ninguno se puede ejecutar sobre la App: el componente solo se ejercita en el banco.
| # | Paso | Entrada visible | API | Estado hoy |
| --- | --- | --- | --- | --- |
| 1 | Integraciones | Menú «Integraciones» (`LocalIntegrations`) | — | Existe |
| 2 | Fuente autorizada de ensayo | Fila de la fuente | Registro de fuentes (paso 2) | **Depende del montaje** |
| 3 | Historial | Botón «Historial (N)» | `GET /api/v7/source-reading-history` | Componente probado; **no montado** |
| 4 | Paginación | «Cargar más recibos» | mismo GET con `cursor` | Probado en el banco; **no montado** |
| 5 | Actualizar | «Actualizar historial local» | mismo GET | Probado en el banco; **no montado** |
| 6 | Bloquear → desbloquear | Candado / `planb:locked` | `/v2/auth/lock`, `/v2/auth/login` | Probado en el banco con `identityKey`; **el vínculo con `lockEpoch` depende del montaje** |
| 7 | Reiniciar → mismo historial | Reinicio del servidor y desbloqueo | mismo GET; diario 297 en SQLite | Persistencia del diario probada en 297; **el recorrido depende del montaje** |
| 8 | Respuestas tardías, cambio de cuenta, cursor invalidado, teclado, 1440/390/320 | — | — | Probado en el banco; **repetir sobre la App compilada** |

## Lo que NO existe (dueño y sucesor)
| Pieza | Estado | Dueño / tarea |
| --- | --- | --- |
| Registro del GET 298 en `main` con ámbito real | No existe | Codex coordinador (montaje central) |
| Montaje en Integraciones | No existe | Codex coordinador, tras aceptar esta unidad |
| Registro de fuentes y estado (`SourceStatus`) en pantalla | No existe | Codex coordinador + consumidor posterior |
| Acción explícita «Leer ahora» con cuenta y alcance autorizados | No existe | Codex coordinador |
| Historial de lecturas reales (proveedor real) | El GET 298 solo sirve ensayos | Decisión de contrato posterior |
| Ensayo con cuenta real | No hecho | La persona, con autorización expresa |
