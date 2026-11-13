# A4 · Recuperación duradera de guardados — propuesta de contrato HTTP, archivos y cortes

8/11/2026, Europe/Madrid. **PROPUESTA de Claude A para acordar con Codex antes de escribir código. No es un acuerdo.** Consume 208 R5 aceptado (diario) y 283 aceptado (lector del resumen). No monta nada, no toca App, `main`, Store, rutas ni contratos compartidos.

## 0. Qué problema cierra y qué no

Hoy el gestor de resultados vive en la memoria del navegador: si se pierde un acuse y se reinicia, no queda rastro. A4 hace que el **intento** (el patch que la persona decidió, su base y el token de revisión) se escriba y se compruebe en el servidor **antes** de que el cliente despache el PATCH, y que tras reiniciar «Trabajo por recuperar» identifique **instalación, captura, generación, tarea e intento**. Abrir y comprobar **solo leen**: ninguna ruta reenvía por sí sola. Aceptar una lectura sigue siendo una decisión humana.

No cambia el PATCH condicionado (`/api/v7/task-revision/:id`), que sigue siendo el único camino de escritura de la tarea.

## 1. Decisión de arquitectura (propongo la A; pendiente de Codex)

- **A (propuesta): el cliente orquesta; el servidor persiste.** Es el protocolo ya probado en 208: `attempt` escribe y confirma el registro **antes** de llamar a `send`; el cliente solo despacha el PATCH si el servidor respondió 201. El servidor no ejecuta la tarea por su cuenta: no hay reenvío automático posible.
- **B (alternativa): el servidor persiste y aplica.** `POST` del intento hace persistir → aplicar → liquidar dentro del proceso. Da «acuse» fiable de servidor, pero acopla el diario a la ruta de revisión y deja el cliente sin el PATCH que hoy cuenta con sus propias pruebas (35/35). Solo la recomendaría si Codex quiere que el diario sea la única puerta de escritura.

Todo lo que sigue asume A.

## 2. Identidad y pin

La identidad de ámbito es la **misma de la ficha y de la cola 230**: `{ instanceId, snapshotId, capturedAt, captureStartedAt, accountId, generatedAt }` (clave del diario = `contextKey` de esos seis campos). El servidor la calcula; el cliente la **repite** en cada petición (`identity`). Si no coincide **exactamente** con la copia activa: `409 TASK_INTENT_CONTEXT_CHANGED`, sin datos. Un mismo `taskId` en otra captura o generación **no** se adopta (208 `wrong-context`).

## 3. Rutas (todas tras la autenticación existente; `Cache-Control: no-store`, `Vary: Cookie`; esquemas Zod estrictos en `shared/task-intents.ts`)

| Ruta | Cuerpo | 2xx | Efecto |
| --- | --- | --- | --- |
| `POST /api/v7/task-intents/attempts` | `{ identity, attemptId (UUID del cliente), taskId, baseline, patch, revision, label }` | **201** `{ attemptId, seq, persistedAt }` (idempotente por `attemptId`: mismo cuerpo ⇒ mismo 201; cuerpo distinto ⇒ 409 `…_REUSED`) | 208 `attempt`: escribe, sella y lee de vuelta **antes** de responder. Sin 201 el cliente **no despacha**. |
| `POST /api/v7/task-intents/attempts/:attemptId/settle` | `{ identity, outcome: 'acknowledged' \| 'rejected' \| 'not-sent', httpStatus?, revisionAfter? }` | 200 `{ attemptId, outcome, provenance: 'server-ack' }` | Asienta con procedencia. `acknowledged` solo si el cliente recibió un acuse; **el diario no confirma nada que no esté liquidado** (P4). |
| `GET /api/v7/task-intents?identity=…` | — | 200 `{ scope, entries: [resumen], otherContext, quarantined }` | **Lectura.** Lista del ámbito actual: `attemptId, taskId, taskLabel, phase, outcome, provenance, startedAt, settledAt, identity completa`. **Sin patch ni valores.** |
| `GET /api/v7/task-intents/:attemptId?identity=…` | — | 200 `{ entry, patch, baseline, revision }` | **Lectura.** El intento exacto con lo que escribió (para recuperarlo en la ficha). Solo de este ámbito. |
| `GET /api/v7/task-intents/:attemptId/check?identity=…` | — | 200 `{ evidence: 'applied' \| 'unchanged' \| 'diverged', readAt }` | **Lectura pura**: el servidor compara el registro actual de la tarea con base y parche. **No escribe en el diario ni en la tarea.** |
| `POST /api/v7/task-intents/attempts/:attemptId/accept` | `{ identity }` | 200 | **Decisión humana** (`person-accepted-read`). El servidor **recalcula** la evidencia; no confía en la del cliente. Solo si es `applied`. |
| `POST /api/v7/task-intents/attempts/:attemptId/abandon` | `{ identity }` | 200 | Decisión humana de dejar de seguirlo; el registro se conserva con su procedencia. |

Códigos: **401** error fijo y sin contenido (retira la vista); **404** ID ausente en este ámbito **o** capacidad sin montar; **409** con `details.code` ∈ `TASK_INTENT_CONTEXT_CHANGED`, `TASK_INTENT_REUSED`, `TASK_INTENT_SETTLED` (ya liquidado), `TASK_INTENT_JOURNAL_FULL`; **413** `TASK_INTENT_TOO_LARGE`; **422** cuerpo no válido; **503** `TASK_INTENT_STORAGE_FAILED` (no se pudo persistir **ni leer de vuelta**) o diario ilegible. Los textos al usuario los pone el cliente (como en el Radar), no el servidor.

**No hay** ruta que reenvíe, ni que «reintente» un PATCH. Un envío posterior es una acción humana nueva: ficha → lectura vigente → nuevo intento con **su** `attemptId` y la revisión actual.

## 4. Orden persistir → despachar → liquidar (lo que el cliente debe cumplir)

1. La persona guarda: el gestor llama `POST …/attempts`. **No 201 ⇒ no hay PATCH**, el borrador queda en la ficha y se dice que el intento quedó **sin enviar** (corte 1).
2. 201 ⇒ despacha el PATCH condicionado (el despacho ya está sellado por la frontera síncrona de 233).
3. Respuesta del PATCH ⇒ `POST …/settle`. Si el `settle` falla, el intento **sigue siendo `attempt`** (incierto) aunque el PATCH se aplicara: «confirmado» solo existe con la liquidación escrita (corte 4).
4. Si la respuesta se pierde, **nunca** se asienta `not-sent`: queda `attempt` (incierto).

## 5. Cobertura para el resumen 283 (`covers(current)`)

El resumen público no debe declarar cobertura por montar un componente. Propongo evidencia **duradera**: al montarse la ruta de intentos, el servidor escribe **una vez** una fila `task-intent-coverage:<hash de la identidad completa>` = `{ since, protocol: 'a4-attempt-v1' }` (sellada como el resto de `meta`). `covers(current)` = existe esa fila para la identidad completa. Consecuencias: sobrevive a reinicios; cerrar Hoy no la retira; los guardados anteriores a `since` **no** están cubiertos y el resumen lo dirá (`since`). **Condición de dependencia:** el cliente debe haber activado el camino con diario para ese ámbito (si el host mantiene el modo anterior, no se escribe la fila). *Decisión abierta para Codex (ver §8).*

## 6. Reparto de archivos (propuesta; cada unidad registra y reserva los suyos)

| Dueño | Archivos | Contenido |
| --- | --- | --- |
| Codex coordinador | `shared/task-intents.ts`, `server/task-intents-api.ts`, `tests/task-intents-api.test.ts`, `server/main.ts`, `server/app.ts` (registro y cobertura) | Esquemas, rutas sobre `storeIntentStorage(store)`, comprobación de identidad, evidencia de cobertura, pruebas de servidor |
| Claude A | `src/task-intent-client.ts` (consumo validado), `src/TaskRecovery.tsx` + `src/task-recovery.css` («Trabajo por recuperar»), `tests/e2e/hoy-trabajo-por-recuperar.spec.ts`, informe | Cliente, superficie junto a Resultados, abrir exacto y comprobar |
| Unidad aparte de Claude A | `src/TaskOutcomesHost.tsx` (+ el envoltorio de `SaveStrategy` que haga `attempt`→PATCH→`settle`) | Integración con el gestor; el modo del diario **llega por el host** (`saveMode` o `health`) |
| Acordar | `src/App.tsx` (montar la superficie junto a Resultados), `tests/task-focus-outcomes.test.ts` (huellas) | Un solo cambio por unidad, en orden |

## 7. Cuatro cortes de prueba (con Codex; servidor real, SQLite de archivo, reinicio de proceso, red bloqueada)

Para **cada** corte se registran: identidad del intento, estado visible, filas de historial **del ID exacto** y PATCH antes y después. Abrir y comprobar tras reiniciar deben añadir **0 PATCH**.

| Corte | Cómo se provoca | Debe verse | Efecto |
| --- | --- | --- | --- |
| 1. Falla la persistencia | el almacenamiento rechaza el `attempt` (gancho de arnés) | la ficha conserva lo escrito y dice «sin enviar» | 0 PATCH, 0 filas nuevas |
| 2. Reinicio antes de enviar | `attempt` escrito, PATCH retenido y proceso detenido | tras reiniciar: intento exacto, **incierto** (no «no enviado»); comprobar lee `unchanged` | 0 PATCH; 0 filas |
| 3. Acuse perdido tras aplicar | el PATCH llega y se aplica, la respuesta se corta, reinicio | intento incierto; comprobar lee `applied`; aceptar es una decisión | 1 PATCH original, 1 fila; abrir/comprobar +0 |
| 4. Falla la liquidación | acuse recibido, `settle` rechazado | sigue incierto (P4); tras reiniciar, comprobar lee `applied` | 1 PATCH, 1 fila; +0 al comprobar |

Casos de ámbito: bloquear; misma ID en otra captura y otra generación (no se adopta); diario vacío ≠ lectura indisponible (cifra desconocida) ≠ cuarentena conservada.

## 8. Decisiones abiertas para Codex

1. ¿A (cliente orquesta) o B (servidor aplica)? Recomiendo A.
2. ¿Los esquemas viven en `shared/task-intents.ts` (contrato compartido, tuyo)? ¿Aceptas el prefijo `/api/v7/task-intents`?
3. ¿La evidencia de cobertura propuesta en §5 es suficiente para el resumen 283, o prefieres otra política? No instalaré `covers: () => true`.
4. ¿La lista puede incluir `taskLabel` (texto de cliente) o solo `taskId`? Propongo etiqueta **solo** en la lectura autenticada del ámbito.
5. ¿Los borradores (`saveDraft`) entran ahora o en una segunda fase? Propongo segunda fase.
6. ¿`main` compilado con esbuild para la prueba de salida lo prepara tu unidad? Mi arnés ya arranca el servidor desde copia privada; el ejecutable compilado necesita su propio recorrido.
7. Orden de reservas de `tests/task-focus-outcomes.test.ts` y `TaskOutcomesHost.tsx` respecto de otras unidades vivas.

## 9. Lo que NO afirma esta propuesta

Que A4 funcione, que exista una ruta o que el resumen público tenga cobertura. Es un contrato por acordar; hasta entonces el diario 208 sigue sin montar y el resumen 283 debe declarar cobertura `none`.
