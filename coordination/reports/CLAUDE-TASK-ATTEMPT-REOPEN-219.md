# CLAUDE-TASK-ATTEMPT-REOPEN-219 · Abrir el intento exacto desde un resultado pendiente

5/11/2026, Europe/Madrid. Paquete 2 del encargo «Claude A», sobre U2-171 aceptada. Servidor real y procesos propios, datos ficticios, red externa bloqueada. Sin commits ni despliegues.

## Problema

«Abrir la tarea» en «Resultados de guardado» solo abría la ficha por ID: no retomaba el intento que generó el aviso (con un intento sin resolver, guardar daba `busy` y remitía a la superficie) y el botón ni siquiera se ofrecía para un guardado incierto o en curso.

## Cambio

- `shared/task-attempt-adoption.ts`: regla pura `resolveAdoption`. Identifica el intento por **instalación + captura + generación (`contextKey`) + tarea + intento**, nunca por título. Resultados: `adopt` (en curso, incierto, confirmado o aceptado, con aviso de otros intentos abiertos), `restore-draft` (rechazado/no enviado), `refused` (otra copia, intento desaparecido, otra tarea, ambiguo) o `none`.
- `TaskSaveOutcomes.tsx`: «Abrir la tarea» entrega también el `attemptId` y se ofrece para intentos **inciertos y en curso**.
- `TaskOutcomesHost.tsx`, `App.tsx`, `LocalOperations.tsx`: la petición de abrir lleva `{taskId, attemptId, nonce}` hasta la ficha; abrir desde la fila de Hoy pasa `null`.
- `LocalTaskFocus.tsx`: prop `adoptAttemptId` (`undefined` = no adopta, como U1; `null` = solo un intento único y compatible; ID = ese intento). Adoptar **enlaza el seguimiento de la ficha a ese intento**: muestra el mismo estado, **sin PATCH** y **sin volver incierto un formulario de reenvío** (la comprobación sigue siendo solo lectura y aceptar es decisión humana). Rechazado/no enviado restauran lo escrito rebasado sobre la tarea actual sin descartar el aviso; otra copia conserva el aviso en su contexto y abre la tarea actual como recorrido nuevo y separado.

## Pruebas (sobre el corte final)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `tsx --test tests/task-attempt-adoption.test.ts` | **9/9** |
| Playwright `tests/e2e/task-attempt-reopen.spec.ts` (App real: barra lateral, Hoy, servidor real, red externa abortada) | **8/8** |
| Regresión: 171 `task-d7-real-app.spec.ts` / 136 DOM / U1 DOM | 24/24, 13/13, 27/27 (repetidas sobre el corte final) |

Los 8 recorridos en la App real: (1) incierto → cerrar → navegar → «Abrir la tarea» → ficha con ESE intento, sin «Guardar»/«Reenviar», lectura sin escribir, aceptar humano, **un único PATCH y un cambio de historial**; (2) reabrir desde la fila con un intento único; (3) en vuelo: «Guardando… ya salió», al llegar el acuse la ficha refleja el resultado sin otro PATCH; (4) **homónimas** («Llamar a Ana» task-2/task-3): cada fila abre SU intento; (5) **mismo ID en otra captura**: aviso «Ese resultado es de otra copia… recorrido nuevo y separado», sin estado de aceptación/confirmación, el aviso sigue en el panel y no hay otro PATCH; (6) rechazado (422) con la ficha cerrada: se restaura lo escrito, el aviso sigue, sin PATCH hasta guardar de nuevo; (7–8) 390 y 320 px sin desbordamiento, con teclado.

**Contrapruebas en la App real (4 mutaciones sobre la copia congelada, todas detectadas):** sin adopción (fallan 1–4), adoptar de otra copia (5, 7, 8), panel sin `attemptId` (5–8) y petición que pierde el `attemptId` (5–8). Node: otra captura/instalación/generación/cuenta no se adopta, homónimas, uno vs varios abiertos, reintento sustituido, intento desaparecido e inmutabilidad.

**Capturas abiertas e inspeccionadas:** `reopen-uncertain-1440.png` (ficha reabierta que tras comprobar y aceptar muestra «Estado leído y aceptado por ti» con el aviso de que el servidor no confirmó el envío) y `reopen-othercopy-320.png` (aviso ámbar «Ese resultado es de otra copia», formulario de la copia actual, sin recorte). Las de 390 y las demás están en `tests/.tmp/c219/r219/`.

## Hashes (SHA-256)

| Archivo | Antes (baseline del tablón) | Ahora |
|---|---|---|
| `shared/task-attempt-adoption.ts` | nuevo | `ad0e83b59ed09d0fbf38c403189e2841d8318f0080e19341e2ccc9f31396139c` |
| `src/LocalTaskFocus.tsx` | `ac480c5f48ca7229276cc7c259157a239275eeeb3db404d1958402684eda2449` | `2faeeb337c84c336014e62a6b1ffa894849dc30c345f40473916ca729e119030` |
| `src/TaskSaveOutcomes.tsx` | `328e2ea6cd3df7c1df8896ce13c429f3e65357265aca013b8baababf73adfc60` | `154b02190c7eed336305dfd805b92944d5e23ec4a1550045b142607ee6e1206d` |
| `src/TaskOutcomesHost.tsx` | `8aeb2283a9d7c4a88e625c846a8ea4e988b012f6e3978311f4776ff90ff40325` | `0afd2cd98636d508f56d76710ff4b2ff0a7d816023220f91f96863f8383fcf49` |
| `src/LocalOperations.tsx` | `abf2daeebe41289fafa55a4f1455998916d6d861cf77792100e005d6168d48a5` | `411ff77cc340da87fefa4275dfe0f0525a07b19ea0d5bfaa1d606dd67474939e` |
| `src/App.tsx` | `d5aeee9ed7b078324bf22c0eb61568c3ca31ad971e26b617bab2514d686670ce` | `45adfd454cf7fc6a77f1c3110d0979d253c301d77446070d3077e1251fa928fd` |
| `tests/task-attempt-adoption.test.ts` | nuevo | `d685d61e2471a05bd2c09cb4970a9f33c9f9629f15424bce6e04ff76d1eb2cd4` |
| `tests/e2e/task-attempt-reopen.spec.ts` | nuevo | `0788186157e62c2fe78bfbab28c1dd605a614fc0415eabefb3832f79ab6e7b2f` |
| `coordination/plans/TASK-ATTEMPT-REOPEN-219-HANDOFF.md` | nuevo | `acbb8344d57954a8c4ad652849b22c15bec25a28d56ba49295d9c80e117d4287` |

## Límites y fallos conocidos

- **Pins de otras unidades rotos por diseño** (editar `LocalTaskFocus.tsx` y `TaskSaveOutcomes.tsx`): `tests/task-focus-outcomes.test.ts` (huella de `TaskSaveOutcomes.tsx`) y `tests/task-focus-followup.test.ts` (huella de `LocalTaskFocus.tsx`, reserva Codex 196). No los edité (fuera de mis rutas). Fallos previos independientes: `independent-task-focus-123` observation F1/F2.
- Varios intentos abiertos de una misma tarea y copia no pueden coexistir hoy (el gestor devuelve `busy`): la rama «ambiguo» solo se prueba en Node.
- Sin persistencia tras recargar; sin vista «Por decidir»; sin comparador ni guardado condicionado.
- Nota de proceso: mis ediciones con Python convirtieron a CRLF cinco fuentes y rompieron una prueba de forma de U1; se normalizó a LF y se repitió todo sobre el corte final. La regresión 171/136/U1 y los 8 recorridos propios se repitieron después sobre el corte final.

---

# R2 · respuesta al dictamen (reapertura de un intento en curso que luego se rechaza)

**Defecto reproducido** (sonda del revisor `tests/.tmp/q228-416f4d17/s/tests/reopen228-browser.mts`, y la misma secuencia en mi arnés de App real): si la persona **reabre un intento EN CURSO** y después llega el mismo 422 (o un «no enviado» por prelectura), la ficha, que ya enlazaba ese intento, llamaba a `outcomes.dismiss` **sin distinguir** si lo originó ella o lo recuperó de Resultados: al cerrar se perdía el aviso y ya no se podía recuperar el borrador.

**Cambio (solo `LocalTaskFocus.tsx`):** nueva referencia `adoptedRef` con el intento que la ficha RECUPERÓ de Resultados. En la transición a `rejected`/`not_sent`, la ficha que **originó** el guardado sigue haciéndose cargo del aviso y liberando la operación (garantías de U1 y 171 intactas); la que **recuperó** el intento muestra el error y mantiene lo escrito, **deja el aviso en el gestor** y se desvincula del seguimiento. Reabrir para ver el progreso no cambia quién conserva el aviso. El aviso solo se retira por «Descartar aviso»/«Entendido» o por la transición de seguimiento acordada.

**Pruebas nuevas en la App real (3 + las 8 anteriores = 11/11):** (1) reabrir en curso + 422 con la ficha reabierta: error de campo, valor conservado, descartar el borrador al salir, **el aviso sigue** y «Abrir la tarea» restaura el mismo borrador, cero PATCH por reabrir o cerrar; (2) reintento explícito separado: tras restaurar, solo «Guardar cambios» envía (un PATCH, un cambio de historial) y la primera respuesta 422 nunca llegó al servidor; (3) «no enviado» por prelectura (503 en la lectura previa) con la ficha reabierta: «No se pudo comprobar antes de guardar», el aviso sigue («No se envió»), borrador recuperable, cero escrituras. Las dos barreras (error con la ficha cerrada: prueba 6 original, y tras reabrirla: prueba 1) están cubiertas.

**Contraprueba del defecto:** mutación `dismiss-adopted` (vuelve al `dismiss` incondicional) sobre la copia congelada: **fallan exactamente las pruebas de reabrir en curso + 422 y de prelectura**.

**Regresiones sobre el corte final:** 171 (`task-d7-real-app.spec.ts`), 136 DOM y U1 DOM — 171 24/24, 136 DOM 13/13 y U1 DOM 27/27, repetidas tras el cambio; Node de adopción 9/9; `tsc` sin errores en los archivos de la unidad.

**Pins:** 220 (`task-focus-outcomes.test.ts`) y 196 (`task-focus-followup.test.ts`) siguen esperando el dictamen de esta entrega; las huellas de `LocalTaskFocus.tsx` y `TaskSaveOutcomes.tsx` de esta tabla son las vigentes.
