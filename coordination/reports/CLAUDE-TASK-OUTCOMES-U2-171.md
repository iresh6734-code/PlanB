# CLAUDE-TASK-OUTCOMES-U2-171 · D7 en la App real: propietario estable del gestor y superficie «Resultados de guardado»

5/11/2026, Europe/Madrid. Autora: sesión Claude que reclamó 171 tras la aceptación de 170 (instrucción expresa del usuario: «Tomar U2 (171) cuando 170 esté done»). **Incidencia de coordinación:** otra sesión Claude («Guardado y recuperación de tareas») tenía la misma misión asignada; yo **sobrescribí sin comprobar** su `src/TaskOutcomesHost.tsx` y `src/task-outcomes-host.css` (error mío; me lo comunicó y lo admití). Acordamos por mensaje que 171 la llevo yo y que ella no toca las nueve rutas; sus notas de diseño (`tests/.tmp/u2-171-c3cdd7/NOTAS-DISENO.md`) se contrastaron: coinciden el consumidor nuevo por cada registro de Hoy, la creación del gestor en un efecto (modo estricto de React), el aviso solo con cifras (redactado para no decir «al bloquear» a secas), la apertura por ID con contador y el foco. Esta unidad **no está aceptada**; no me autoacepto.

## Qué entrega (hechos, no intenciones)

| Garantía | Dónde | Cómo se comprobó |
| --- | --- | --- |
| **Un gestor por propietario de sesión**, compartido por ficha y superficie; sin singleton | `src/TaskOutcomesHost.tsx` (`createTaskSaveOutcomes` una sola vez, en el efecto del host); `App.tsx` envuelve la sesión desbloqueada; `LocalOperations.tsx` se lo pasa **exactamente** a `LocalTaskFocus` (`outcomes={outcomes?.controller}`) | Node (estático: una creación, sin gestor de módulo, Hoy no crea gestores) + recorridos en la App real (el seguimiento de la ficha aparece en la superficie y sobrevive a navegar) + compilación de **desarrollo** con el modo estricto de React |
| **Seguimiento que sobrevive** a cerrar la ficha y navegar | superficie `TaskOutcomesSurface` montada en `<main>` de App, fuera de Hoy | E2E App real: cerrar con envío en vuelo → Continuidad/Agentes/Cambios → volver a Hoy |
| **Resumen compacto + detalle** (sin menú nuevo) | barra «Resultados de guardado · N sin saber si se aplicó · …» y detalle plegable = `TaskSaveOutcomesPanel` (136) con lo pendiente primero; se abre sola cuando aparece un intento nuevo que necesita atención | capturas 1440/390/320 inspeccionadas; Node del resumen |
| **Estados** comprobando / enviado / confirmado / rechazado / incierto / aceptado | los de 136 (`describeOperation`) | E2E (cada estado se observa en la App real) |
| **Separación acuse / estado padre / Hoy** con **causa cerrada** | `confirmationConsumer`: estado de App primero → lista de Hoy después (solo si está montada); fallo ⇒ `OutcomeRefreshError('state'|'list')` sin copiar el mensaje del error | Node + E2E: con el estado fallando la lista ni se lee; el texto de la superficie no contiene el mensaje del servidor |
| **Reintentar la actualización solo lee** | `retryQueue` del gestor | E2E: `patches` no cambia tras reintentar |
| **Sustituir/desmontar el consumidor durante una recarga no se atribuye a otro** | un consumidor NUEVO por cada cambio de la vista de Hoy registrada (el gestor invalida el anterior) | Node con gestor real: el éxito o el fallo tardío del consumidor anterior no resuelve la recarga del nuevo; E2E «navegar durante la recarga» |
| **Foco útil** cuando desaparece una fila | `LocalOperations`: si la fila de origen se desconecta y el foco se pierde, va a `#lop-queue`; la superficie devuelve el foco a su resumen si desaparece el control enfocado | E2E (dos escenarios, uno con recarga posterior al cierre) + mutante |
| **Bloqueo**: `dispose()` antes de soltar al propietario; **aislamiento** | el host llama a `dispose()` en su limpieza; propietario nuevo y vacío al desbloquear | Node + E2E (bloquear antes y después del despacho, con respuesta tardía del propietario anterior) |
| **Aviso tras volver a entrar** con **solo un recuento** | `OutcomesLockNotice`: «N guardado(s) ya había(n) salido…», «M no llegó/llegaron a enviarse…», sin títulos, valores ni borradores; dice que **no** es seguimiento detallado | E2E (comprueba que el texto no contiene tarea ni valores) |
| **Abrir la tarea** desde la superficie | `openTaskRequest` (contador) → Hoy abre la ficha por ID **sin enviar nada** | E2E |

## Límite que NO se resuelve (lo digo en la interfaz y aquí)
- **Tras bloquear solo hay un contador.** El seguimiento detallado (qué tarea, qué valores, comprobar/aceptar) **se pierde**; no declaro D7 cerrado para ese escenario. La garantía siguiente (persistencia del seguimiento tras bloqueo/recarga, sin guardar textos de tareas ni secretos en un aviso público) necesita unidad propia con almacenamiento (Store/Recovery, reservas de Codex).
- Sin persistencia tras recargar o cerrar la pestaña, sin coordinación entre pestañas, sin revisión de versión/CAS (128/160/166): fuera de alcance.
- «La cola de Hoy está actualizada» con Hoy **no** montada significa «el estado de la App se actualizó y no hay cola vieja en pantalla; Hoy leerá de nuevo al montarse» (comprobado en E2E «confirmación mientras estoy en otra sección»). Es el significado acordado en el plan de 171.
- **Hallazgo fuera de las nueve rutas (no tocado):** Hoy muestra en su banner de error el mensaje del servidor tal cual (`LocalOperations` pre-existente: con un 503 de prueba se ve «detalle-interno-secreto» en la cabecera de Hoy). La superficie del gestor no lo copia, pero ese banner sí. Requiere otra unidad si se quiere cerrar.
- Navegador: solo Chromium headless-shell 1228; sin lector de pantalla real; teclado verificado en la superficie (Enter sobre Comprobar y Aceptar a 390/320, botones ≥ 44 px) y heredado en la ficha (U1/123).

## Cambios por archivo
- `src/TaskOutcomesHost.tsx` (nuevo): contexto, `TaskOutcomesHost`, `confirmationConsumer`, `summarizeOutcomes`, `byAttention`, `addLockSummary`, `TaskOutcomesSurface`, `OutcomesLockNotice`.
- `src/task-outcomes-host.css` (nuevo): `toh-*`; reutiliza los estilos `ltso-*` del detalle.
- `src/App.tsx`: `TaskOutcomesHost` alrededor del shell; estado `lockedOutcomes` (solo cifras) y `taskRequest`; `OutcomesLockNotice` y `TaskOutcomesSurface` en `<main>` (no en modo `runtime`); `onOpenTask` navega a Hoy.
- `src/LocalOperations.tsx`: usa `useTaskOutcomes()`; registra su recarga como consumidor; avisa de ficha abierta; pasa `outcomes` a la ficha; consume `openTaskRequest`; restaura el foco si la fila desaparece. **Sin propietario (p. ej. una prueba que monta Hoy sola) conserva el comportamiento anterior** (`onSaved`).
- `tests/task-outcomes-host.test.ts` (nuevo, 11), `tests/e2e/task-d7-real-app.spec.ts` (nuevo, 19), `tests/e2e/task-d7-real-app-baseline.spec.ts` (153 **invertida**).
- No se tocaron `src/task-save-outcome.ts`, `src/TaskSaveOutcomes.tsx`, `src/LocalTaskFocus.tsx`, `shared/task-save-outcome.ts` (hashes `d2aaed72…`, `328e2ea6…`, `ac480c5f…`, `da79ae6d…`), ni 128/160/166/183/185, ni servidores.

## Pruebas (todas ficticias; servidor real `createBaseApp`, SQLite en memoria, 127.0.0.1, red externa bloqueada)
| Qué | Resultado |
| --- | --- |
| Node del host (`tests/task-outcomes-host.test.ts`) | **11/11** |
| Node: host + 136 + U1 + 123 (ficha y cliente) + independiente (`task-outcomes-host`, `task-save-outcome`, `task-focus-outcomes`, `local-task-focus`, `local-task-focus-client`, `independent-task-outcomes`) | **99/99** |
| **App real** `task-d7-real-app.spec.ts` | **19/19** (1,3 min): recorrido completo (guardar → cerrar → navegar → ver seguimiento → volver → acuse perdido → comprobar sin escribir → aceptar), confirmación tardía, doble clic, fallo de estado y de lista con reintento solo-lectura, 401/404/409/422 con la ficha abierta, 409 tardío con ficha cerrada + «Abrir la tarea», cambio de captura, bloquear antes y después del despacho (+ respuesta tardía y propietario nuevo), navegar durante la recarga, confirmación mientras estoy en otra sección, foco (×2), 390 y 320 |
| 153 invertida (App real) | **6/6** (antes: observaciones del defecto; las aserciones «U2 DEBE INVERTIR» pasan a exigir seguimiento; la fuente original se conserva: `tests/.tmp/u2-171/evidence/task-d7-real-app-baseline.spec.ORIGINAL-153.ts`, sha `10e077c2…`) |
| Compilación de **desarrollo** (modo estricto de React: doble montaje de efectos) | **5/5** de los recorridos clave (incierto, confirmación tardía, bloqueos ×2, foco) |
| Regresiones repetidas sobre la App nueva | 151 `task-parent-state` **3/3**, 155 `app-refresh-notice` **3/3**, 158 `auth-gate-order` **4/4**, 140 `task-focus-main` **6/6**, U1 `task-focus-outcomes` **27/27**, 136 `task-save-outcome` **13/13** |
| `tsc --noEmit -p tsconfig.json` | exit 0 |

**Contraprueba contra el montaje anterior** (`PLANB_U2_PRE=1`: App.tsx y LocalOperations.tsx de antes de U2, hashes `c8046461…`/`13bde436…`): los recorridos «incierto», «confirmación tardía», «lista falla» y «bloquear después» **fallan** (no hay superficie ni aviso); el de foco con la fila retirada antes de cerrar **pasa** también con el montaje anterior (ya lo cubría la ficha): no es evidencia causal de U2. Log: `tests/.tmp/u2-171/evidence/counter-pre-U2.log`.

**Control causal con 5 mutantes** sobre la copia congelada (cada uno quita una garantía y lo mata la prueba que la protege): `no-dispose` ⇒ falla «bloquear después» (no hay aviso); `consumer-never-updates` ⇒ fallan «confirmado después de cerrar» y el foco tardío (la fila no se retira); `list-failure-ignored` ⇒ falla «falla la lista»; `no-focus-restore` ⇒ falla el foco tardío; `surface-not-hidden` ⇒ falla «ficha ya cerrada/abrir la tarea» (la superficie duplicaba con la ficha abierta). Logs `mutant-*.log` en la misma carpeta de evidencia.

Nota del arnés: la App se compila desde una **copia congelada** de `src/shared/public` con manifiesto de hashes (`manifest.json`; coincide con los hashes de abajo); si un fuente cambia mientras se copia, el spec se niega a continuar. Los specs 151/155/140/148/136 exigen raíces **absolutas** (con rutas relativas fallan por `"root" option must be an absolute path`: fue un error mío de invocación, corregido).

## Capturas abiertas e inspeccionadas (`tests/.tmp/u2final/`)
`u2-incierto-1440`, `u2-lista-falla-1440` (muestra además el banner pre-existente de Hoy con el mensaje del servidor), `u2-rechazo-tardio-1440`, `u2-aviso-bloqueo-1440`, `u2-incierto-390/320`, `u2-aceptado-390/320`. A 390 y 320 no hay desbordamiento horizontal (comprobado por código y a la vista) y los controles miden ≥ 43 px.

## Hashes finales (sha256)
| Ruta | sha256 |
| --- | --- |
| src/App.tsx | db2f17406cd56de2b1e3958cd8cca53f4b34104ba1f076ca98012d4662f3a1e9 |
| src/LocalOperations.tsx | abf2daeebe41289fafa55a4f1455998916d6d861cf77792100e005d6168d48a5 |
| src/TaskOutcomesHost.tsx | 5932084e145de74a354ac6281a66860fa89bc022550a683e6151d0728b5c0512 |
| src/task-outcomes-host.css | a00445a7a7d9e4a6ff7709c1b75da933db5c8b2d51f22df73fd6fbdbf3439662 |
| tests/task-outcomes-host.test.ts | ac4c9f4c72acf5894b481a6f980a13c5d6707229f128f5b6d0b0b1e64608a112 |
| tests/e2e/task-d7-real-app.spec.ts | 2e91611a27ba962e09636d252405db0f2e285eda857d6e2c11adfa4302ccf6ed |
| tests/e2e/task-d7-real-app-baseline.spec.ts | dc7e0c7305b371aeda5eff37d610bdadd74f0b9d503f33beee5cdbc88668afa5 |
| coordination/plans/TASK-OUTCOMES-U2-171-HANDOFF.md | (traspaso; hash al presentar) |
| coordination/reports/CLAUDE-TASK-OUTCOMES-U2-171.md | (este informe; hash al presentar) |

## Comandos
```powershell
# Node
$env:NODE_ENV='test'; node --import tsx --test tests/task-outcomes-host.test.ts tests/task-save-outcome.test.ts tests/task-focus-outcomes.test.ts tests/local-task-focus.test.ts tests/local-task-focus-client.test.ts tests/independent-task-outcomes.test.ts
# App real (config propia con el headless-shell 1228 instalado; PLANB_U2_ROOT = carpeta nueva)
npx playwright test -c <config> tests/e2e/task-d7-real-app.spec.ts            # PLANB_U2_PRE=1 (montaje anterior), PLANB_U2_MUTATE=<mutante>, PLANB_U2_DEV=1 (modo estricto)
```
Procesos propios: servidores de prueba y navegadores de Playwright terminados (comprobado, ninguno vivo). Sin worktrees, commits, despliegues ni reinicios; no se tocaron 4331/4334/4596.

## Siguiente
Revisión independiente de 171. Después, con encargo y reserva propios: abrir/adoptar el **intento exacto** desde la superficie (paquete 4), montar el comparador 199 y la adopción 166/183/185 (paquete 5, tocan `LocalTaskFocus.tsx`/`TaskOutcomesHost.tsx`), y la persistencia del seguimiento tras bloqueo/recarga (almacenamiento, reservas de Codex).


---

# R2 · corrección del dictamen 209 (5/11/2026)

Dictamen: `coordination/reviews/CLAUDE-TASK-OUTCOMES-U2-171-independent.md`; encargo: `coordination/briefs/CLAUDE-TASK-OUTCOMES-U2-171-R2.md`. Antes de editar se comprobó que la unidad seguía `working` bajo `claude` con las nueve rutas y que los nueve hashes del archivo coincidían con los presentados en R1 (sin cambios ajenos). La otra sesión no tocó las rutas.

## F1 · el resumen atribuía una confirmación que no se recibió → corregido
`summarizeOutcomes` contaba `accepted` dentro de `confirmed`. Ahora hay **dos procedencias separadas**: «confirmado por el servidor» (`confirmed`) y «lectura aceptada por ti» (`accepted`); el fallo de recarga es **otra dimensión** (`queueFailed`, «lista sin actualizar») que no cambia el origen. Resumen del caso del dictamen a 1440 y 390 px: «Resultados de guardado · 1 lectura aceptada por ti»; el detalle sigue diciendo «Estado leído y aceptado por ti» / «El servidor no confirmó tu envío»; un solo PATCH. Con fallo de recarga: «1 lista sin actualizar · 1 lectura aceptada por ti» (sin «confirmado»).

## F2 · pedir el bloqueo dejaba salir un guardado → corregido
El gestor se **sella al iniciar** «Proteger / bloquear» en la interfaz, antes de cualquier espera de red: `App.protect()` llama a `outcomesControl.seal()` (que llama a `dispose()` del gestor 170) como primera instrucción. Lo no despachado no sale nunca (la puerta de `onDispatch` rechaza) y lo ya despachado no se cancela; los recuentos se conservan. Si el cierre **se completa**, el host se desmonta y su `dispose()` idempotente devuelve **ese mismo resumen** (aviso por recuento). Si el cierre **no se completa** (error o respuesta fallida), `resume()` **no reactiva** al propietario sellado: cierra su resumen (`onClosed(…, 'lock-not-completed')`), empieza un propietario **nuevo y vacío** y App muestra un aviso con acción clara («No se completó el bloqueo… Reintentar el bloqueo»). Con el POST de bloqueo retenido y la comprobación previa pendiente, al liberar la lectura hay **0 PATCH y 0 cambios** aunque el acuse de bloqueo no haya llegado (producción y desarrollo).

## Archivos y pruebas modificados bajo 171 en R2
- `src/TaskOutcomesHost.tsx`: procedencias separadas, `TaskOutcomesControl` (`seal`/`resume`), `controlRef`, `onClosed(summary, reason)`, aviso con variante «no se completó».
- `src/App.tsx`: `protect()` sella al empezar y reanuda con propietario nuevo si falla; `lockFailed`; aviso con `onRetry`.
- `tests/task-outcomes-host.test.ts` (12): + procedencia (con fallo de lista en ambas) y contrato estático (dos creaciones, ambas en el host, `resume` empieza otro).
- `tests/e2e/task-d7-real-app.spec.ts` (24): + 5 casos (procedencia a 1440 y 390, procedencia con fallo de recarga, sellar al iniciar el bloqueo, bloqueo que no se completa con propietario nuevo y reintento); la captura de un estado sin superficie ya no espera a que aparezca (`shot` solo desplaza la superficie si existe, con plazo corto).
- La línea base 153 invertida no cambió (sus aserciones usan subcadenas que siguen siendo ciertas: «1 confirmado» ⊂ «1 confirmado por el servidor»).
- Evidencia original conservada: `tests/.tmp/u2-171/evidence/` (R1) y los casos del revisor en `tests/.tmp/u209-9b96ce81/` (no se editaron).

## Resultados R2
| Qué | Resultado |
| --- | --- |
| Node: host (12) + 136 + U1 + 123 (ficha y cliente) + independiente | **100/100** |
| **App real, compilación de producción** `task-d7-real-app.spec.ts` | **24/24** |
| **App real, compilación de desarrollo (StrictMode)** el mismo spec | **24/24** |
| 153 invertida | **6/6** |
| Regresiones repetidas: 151 3/3 · 155 3/3 · 158 4/4 · 140 6/6 · U1 DOM 27/27 · 136 DOM 13/13 | todas verdes |
| `tsc --noEmit -p tsconfig.json` | exit 0 |

Control causal (mutantes sobre la copia congelada, `PLANB_U2_MUTATE`): `accepted-as-confirmed` ⇒ fallan las 3 de procedencia («1 confirmado por el servidor» en vez de «aceptada por ti»); `no-seal-at-lock` ⇒ falla «sellar al iniciar el bloqueo» (sale 1 PATCH); `no-resume-after-failed-lock` ⇒ falla «bloqueo que no se completa» (sin aviso ni propietario nuevo). Los cinco mutantes de R1 siguen siendo válidos. Logs `mutant-r2-*.log`.

Capturas abiertas e inspeccionadas: `u2-r2-aceptado-resumen-390/1440` y `u2-r2-bloqueo-fallido-1440` (carpeta de la ejecución de producción).

## Límites que siguen
- Tras un bloqueo **completado** solo hay recuento (D7 no cerrado en ese escenario). Si el bloqueo **no** se completa, lo sellado tampoco se puede comprobar desde esta ventana: se sustituye por un propietario nuevo y se avisa; la persona debe abrir la tarea para ver su valor actual.
- Sin persistencia tras recargar, sin multipestaña, sin CAS (unidades propias). La adopción de un intento exacto sigue siendo otra unidad.

## Hashes finales R2 (sha256)
| Ruta | sha256 |
| --- | --- |
| src/App.tsx | d5aeee9ed7b078324bf22c0eb61568c3ca31ad971e26b617bab2514d686670ce |
| src/LocalOperations.tsx | abf2daeebe41289fafa55a4f1455998916d6d861cf77792100e005d6168d48a5 (sin cambios) |
| src/TaskOutcomesHost.tsx | 8aeb2283a9d7c4a88e625c846a8ea4e988b012f6e3978311f4776ff90ff40325 |
| src/task-outcomes-host.css | a00445a7a7d9e4a6ff7709c1b75da933db5c8b2d51f22df73fd6fbdbf3439662 (sin cambios) |
| tests/task-outcomes-host.test.ts | bf4298a7f39009919f89cfe4d1fbcac365b5d13078d1a0353ecb81f72e8b674b |
| tests/e2e/task-d7-real-app.spec.ts | 1d0c53c4bdf878fff276fc57409d61ac660a462d185747798d5621aa08c85658 |
| tests/e2e/task-d7-real-app-baseline.spec.ts | dc7e0c7305b371aeda5eff37d610bdadd74f0b9d503f33beee5cdbc88668afa5 (sin cambios) |
Los hashes de la sección «Hashes finales» de R1 quedan como historia. Procesos propios: servidores de prueba y navegadores cerrados con cada ejecución.
