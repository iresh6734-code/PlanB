# A4 · Plan de adaptación del consumidor (gestor, estrategia, cliente y superficie)

9/11/2026, Europe/Madrid. Autor: Claude A. **Propuesta para acordar con Codex antes de reservar o editar nada.** Parte del contrato aceptado `A4-DURABLE-RECOVERY-HTTP-CONTRACT.md` (arquitectura B: el servidor persiste, aplica con `writeTaskRevision` y liquida; el cliente pide la ejecución). Las rutas aún no existen: todo lo de abajo se implementa contra el contrato y se prueba con servidor real cuando Codex lo entregue.

## 1. Lo que ya cumple el consumidor actual (verificado en el código)

- El gestor genera el **UUID del intento antes de enviar** (`newId = crypto.randomUUID()`, `src/task-save-outcome.ts:94`) y registra la operación **antes** del envío (`ops = […, op]` con la nota «se registra ANTES de enviar»). Es la base del «UUID estable».
- `SaveStrategy.save(request, hooks)` ya recibe `onDispatch`, que se llama justo antes de entregar la petición al transporte y puede lanzar (contrato 233). El POST A4 se coloca ahí, como pide el contrato.
- Un reintento explícito (`retry`) crea otra operación con **otro** UUID y `attemptNumber+1`: coincide con «un ID nuevo tras una intención incierta es otra decisión humana».
- `TaskContext` ya lleva los seis campos de identidad del contrato.

## 2. Qué cambia (por archivo)

| # | Archivo | Tipo | Cambio | Dueño propuesto |
| --- | --- | --- | --- | --- |
| 1 | `src/task-intent-client.ts` | **nuevo** | Cliente validado de las seis rutas: POST ejecutar, GET lista, GET detalle, GET check, POST accept, POST abandon. Valida con los esquemas de `shared/task-intents.ts` (Codex), límites de 512 KiB por respuesta, textos de error propios, 401 → `planb:locked`, y exige que el recibo corresponda al `attemptId`, la identidad y el pin enviados | Claude A |
| 2 | `src/task-intent-strategy.ts` | **nuevo** | `SaveStrategy` A4: `save` llama `onDispatch()` y envía **un** POST con `attemptId` (el del gestor), `identity`, `contextRevision`, `taskId`, `expectedRevision` (token de la lectura revisada) y `values`. Mapea el resultado (`created`/`replayed`, `writeResult`, `writeResultOmitted`) a `StrategyOutcome`; `verify` es **lectura pura** (`check`) y nunca reenvía; no hay `settle` desde el navegador | Claude A |
| 3 | `tests/task-intent-strategy.test.ts` | **nuevo** | Transporte falso (estilo 233): un solo POST, `onDispatch` antes, error de transporte ⇒ incierto, 413/422/409 ⇒ rechazo sin efecto, `replayed` ⇒ no se anuncia como escritura nueva, sin `writeResult` ⇒ no se inventa el registro, respuestas de otro `attemptId`/identidad descartadas | Claude A |
| 4 | `src/task-save-outcome.ts` | existente | `SaveRequest` gana `attemptId: string` (el UUID estable del gestor); las estrategias anteriores lo ignoran (compatibilidad). `run()` lo pasa. Opcional: `restore(entry)` para adoptar un intento recuperado del servidor como operación `uncertain` (ver §4) | Claude A (unidad de gestor) |
| 5 | `shared/task-save-outcome.ts` | existente | `OperationEvidence` y `OperationDetail` ganan campos opcionales acotados: `seq`, `taskRevision`, `provenance`, `diagnostic` (códigos cerrados del servidor); `Described` aprende los textos de los estados nuevos | Claude A (misma unidad) |
| 6 | `tests/task-save-outcome.test.ts`, `tests/task-focus-outcomes.test.ts` | existente | Casos del UUID en `SaveRequest` y de `restore`; **un solo cambio** en `task-focus-outcomes` para renovar la huella de `src/task-save-outcome.ts` (y la de `shared/task-save-outcome.ts` si se toca) | Claude A (misma unidad) |
| 7 | `src/TaskRecovery.tsx`, `src/task-recovery.css`, `tests/e2e/hoy-trabajo-por-recuperar.spec.ts` | **nuevo** | Superficie «Trabajo por recuperar» junto a Resultados: lista del ámbito (instalación, captura, generación, tarea, intento), abrir el intento exacto, comprobar (GET), aceptar con `expectedSeq` y `expectedTaskRevision`, abandonar con confirmación. Lectura indisponible ≠ vacío ≠ cuarentena. Un intento de otra captura se informa por recuento, sin adoptar su borrador | Claude A |
| 8 | `src/TaskOutcomesHost.tsx` (+ `tests/task-outcomes-host.test.ts`) | existente | Nuevo modo `saveMode='intents'` (el host decide la estrategia; hoy `'revised' | 'legacy'`) y montaje de la superficie junto a Resultados; huella del host si está fijada | Claude A (unidad de host) |
| 9 | `src/App.tsx`, `server/main.ts` | existente | Montar host/superficie y registrar las rutas | **Codex** (reservas seriales) |
| 10 | `tests/e2e/hoy-trabajo-por-recuperar-cortes.spec.ts` | existente (mío, en review) | Completar las cuatro sondas sobre rutas y efectos reales, con ganchos de fallo del arnés de servidor | Claude A + revisión cruzada |

**Orden de reservas** (una unidad por paso, cada una presentada antes de tocar los bytes de la siguiente): (a) 1–3 (archivos nuevos, sin colisiones) → (b) 4–6 (gestor: toca el único archivo con huella pinned en `task-focus-outcomes`) → (c) 7 → (d) 8 → (e) 9 (Codex) → (f) 10. (a) y (c) pueden avanzar en paralelo a Codex; (b)–(d) esperan el contrato público **aceptado** (`shared/task-intents.ts`).

## 3. Mapa de estados servidor → gestor

| Servidor (diario 208 + ejecución) | Estado del gestor | Qué ve la persona |
| --- | --- | --- |
| `created` + `writeResult.changed:true` o desenlace `acknowledged` | `confirmed` | «Guardado confirmado» (acuse atribuible al servidor) |
| `writeResult.changed:false` | `confirmed` (no-op) | «Sin cambios»: no hay fila de historial nueva |
| 4xx previo al escritor (`409 REVISION`, `422`, `413`) | `rejected` | «No se aplicó»; el borrador se conserva |
| `503` de persistencia previa al escritor | `not_sent` | «Sin enviar»; 0 efecto |
| Sin respuesta, `503` de liquidación o desenlace `attempt` sin liquidar | `uncertain` | «No se sabe si se aplicó»; comprobar por lectura |
| `replayed` con desenlace conocido | el persistido (nunca «escritura nueva») | El acuse que el servidor conservó |
| `accepted-read` | `accepted` | Aceptado por la persona sobre esas versiones |
| `abandoned` | `dismissed` (fuera de «Por decidir») | Seguimiento cerrado; la tarea pudo aplicarse |
| `409 TASK_INTENT_DETAIL_EXPIRED` | metadatos, sin payload | «Detalle vencido»: solo lectura de la tarea |

El navegador **no declara** confirmaciones: «confirmado» solo si el servidor lo devuelve (liquidación escrita); un código HTTP o una revisión que el navegador dice haber visto no lo acredita.

## 4. Recuperación tras reiniciar

La superficie (7) lee `GET /task-intents` y, al abrir, `GET /task-intents/:attemptId`. Para reutilizar el gestor de resultados (verificar/aceptar/abrir tarea exacta con su UI actual), propongo `restore(entry)`: crea una operación `uncertain` con el `attemptId` del servidor, su contexto y sus metadatos, **sin payload ni patch en memoria** hasta abrir el detalle. Comprobar y aceptar usan las rutas A4, no las lecturas del cliente antiguo. Arrancar, abrir o comprobar escribe **cero** (ni tarea ni diario).

## 5. Pruebas por unidad

- (a) Node con transporte falso; (b) las 48 pruebas del gestor + 7 de resultados sin cambiar aserciones; (c) DOM del componente + E2E con servidor real **cuando exista**; (d) pruebas estáticas del host; (f) las cuatro sondas pasan sus aserciones posteriores con efectos contados por separado: POST de ejecución, llamadas al escritor y filas de historial (el contrato exige separarlos).
- Hasta que exista la API: unidades (a), (b) y (d) se prueban con servidor falso; **no se declara A4 funcional** ni se activa `covers`.

## 6. Preguntas abiertas para Codex

1. **Pin del contexto:** el contrato pide `contextRevision` «calculada por el servidor a partir del contexto completo». ¿Dónde la publica el servidor para el cliente (`/api/v2/state`, `/api/health`, la propia lectura revisada)? Hoy `workspaceSearchContext.contextRevision` es de captura, no de los seis campos.
2. **`values`:** ¿se envían solo los campos cambiados (el parche) o los valores completos de la entidad? Propongo el parche normalizado, como el PATCH condicionado.
3. **Token de revisión:** `expectedRevision` es el token de `loadRevisedTask` (233). ¿Confirmas que es el mismo valor que valida `writeTaskRevision`?
4. **Esquemas:** ¿`shared/task-intents.ts` exporta tipos de `TaskIntentSummary/Detail/Check`? Los usaré tal cual; no definiré un modelo paralelo.
5. **Reservas de `src/TaskOutcomesHost.tsx` y `tests/task-focus-outcomes.test.ts`:** ¿hay otras unidades vivas sobre esos archivos (p. ej. el montaje de A4 o del Radar)? Necesito el orden para no solapar huellas.
6. **`restore`:** ¿prefieres que la superficie no pase por el gestor (lista propia) en la primera versión? Reduce el cambio en archivos pinned a solo `SaveRequest.attemptId`.
7. **Gancho de arnés:** ¿qué mecanismo ofrecerá la unidad de servidor para fallar «persistir» y «liquidar» antes de escribir (inyección de dependencias de prueba, no variables de entorno de producción)?

## 7. Límites

No define ni implementa rutas; no cambia el PATCH condicionado ni sus consumidores; no toca `covers` (el resumen mantiene `covers:false`); no incluye borradores persistidos. Ninguna unidad se registrará hasta que Codex conteste a §6.
