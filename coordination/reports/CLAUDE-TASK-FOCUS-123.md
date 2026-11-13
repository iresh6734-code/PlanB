# CLAUDE-TASK-FOCUS-123 · Informe (versión corregida tras la revisión independiente 131)

2/11/2026 (Europe/Madrid). Agente: Claude. Segunda presentación para revisión de Codex; no aceptada, no montada. La primera presentación fue devuelta a `working` por la revisión independiente `coordination/reviews/CLAUDE-TASK-FOCUS-123-independent.md` (F1–F4). Se corrigió únicamente en las once rutas reservadas de 123. Los archivos del encargo de QA (130) no se tocaron aquí.

## Qué se corrigió

| Hallazgo | Origen | Corrección | Prueba causal (falla con el código anterior) |
| --- | --- | --- | --- |
| **F1** verificar tras un acuse perdido puede leer otra instalación/captura | revisión 131 (reproducción en Fastify/Store) | `verifyAfterUncertain` exige el contexto abierto, lo comprueba **antes y después** de leer el registro y devuelve `context-changed` si difiere; sin contexto → `unknown`. La ficha no ofrece «Aceptar» con esa lectura. | Node: «F1 … OTRA instalación», «F1 … se sustituye entre lecturas»; DOM: «F1: acuse perdido y la copia cambia» |
| **F2** misma ID de captura con otra fecha se trata como la misma copia | revisión 131 | `contextKey` combina instalación, ID, `capturedAt`, `captureStartedAt`, cuenta de origen y generación activa (todo lo que expone `/api/v2/state`). | Node: «F2 …»; puro: cada componente cambia la clave; DOM: «F2: otra captura con el MISMO ID» |
| **F3** una decisión humana se presenta como acuse del servidor | revisión 131 (inspección) | El acuse tiene procedencia: «Cambios guardados · El servidor confirmó…» solo tras un PATCH; tras un acuse perdido la persona «Acepta el estado leído» y la vista dice «Estado leído y aceptado por ti… el servidor **no confirmó** tu envío». | DOM: «acuse perdido tras aplicar…» (ahora comprueba el encabezado y la ausencia de «El servidor confirmó») |
| **F4** el aviso de salida afirma «Nada se ha enviado» con PATCH en vuelo o incierto | revisión 131 + mi D1 (reproducido en DOM) | El aviso depende del estado real: en vuelo («no se puede cancelar… no sabrás el resultado»), incierto («puede haberse aplicado… nadie comprobará el resultado») o normal («Nada se ha enviado»). | DOM: «F4 / D1 … en vuelo», «F4 … incierto» |
| **D2** cambiar de tarea con un PATCH en vuelo dejaba sin efecto el «Guardar» de la nueva | mi QA-130 (reproducido en DOM) | `flight` se reinicia al cambiar de tarea. | DOM: «D2 …» |
| **D3** sin tiempos límite (Leyendo…/Guardando… eternos) | mi QA-130 (reproducido en DOM, 10 min virtuales) | Lecturas 15 s → error con «Reintentar»; PATCH 30 s → resultado **incierto** (nunca «fallo»); actualización de la cola 20 s → «no se actualizó». Funciona aunque el transporte ignore `AbortSignal`. | Node: «D3 corregido»; DOM: «D3 …» |
| **D4** el tope de 1 MB se aplicaba después de leer toda la respuesta | mi QA-130 (reproducido: 48 MiB leídos) | Lectura por flujo con tope mientras se lee, y rechazo previo por `Content-Length`. | Node: «D4 corregido» |
| **D5** «Seguir editando» ocultaba el fallo posterior de la actualización de la cola | mi QA-130 (reproducido en DOM) | El estado de la cola vive aparte del acuse y se muestra también en el formulario. | DOM: «D5 …» |
| **D6** una instalación válida con muchas propiedades no podía abrir la ficha (estado > 1 MiB) | mi QA-130 (medido: ~3.300 propiedades extra) | Tope de `/api/v2/state` en 8 MiB (acotado por flujo). | Node: «D6 corregido» (3.500 propiedades) |

Defecto de mi propio código nuevo hallado al probarlo: `raceAbort` dejaba una promesa de `fetch` sin manejar cuando la señal ya estaba abortada (Node lo señaló como `unhandledRejection`). Corregido.

**No corregido (límite declarado):** **D7** — si se cierra la ficha con un PATCH en vuelo y su respuesta se pierde, nadie recibe ni acuse ni aviso y la cola de Hoy puede quedar vieja. Cerrar un contrato nuevo (p. ej. una prop `onUncertain`) corresponde al montaje. La ficha ahora **lo avisa antes de salir** (F4). Tampoco hay comprobación posterior al guardado de que la copia no cambió justo entre la comprobación previa y el PATCH (ventana residual); y sigue sin haber CAS ni idempotencia (la API antigua).

## Qué funciona (resumen vigente)

`LocalTaskFocus({taskId, onClose, onSaved, onPrepare})`: ficha lateral (`Modal side`, `ReferenceSelect`, esquema/reglas de la copia, `validateRecord`) para **una tarea de la entidad `tasks`**: lectura por ID con contexto comprobado antes/después; estados explícitos (leyendo, error con reintento, vacía, inexistente, sin activar, edición); PATCH solo de los campos cambiados con comprobación previa de mejor esfuerzo (no atómica); acuse separado de la recarga de la cola; acuse perdido = incierto, solo se lee y la lectura está ligada al contexto; 422/409/401/404 conservando el borrador; guardia de cierre según el estado real; exclusión de doble envío; foco gestionado.

`RecordDrawer` sigue sin reutilizarse (hace PATCH y `await saved()` en el mismo `try`, envía todos los valores y no permite acuse perdido): prueba «un segundo PATCH idéntico añade otra fila a changes».

## Comandos y resultados (Node v24.14.0, Playwright 1.64.1, chrome-headless-shell 1228)

```powershell
npx tsx --test tests/local-task-focus.test.ts tests/local-task-focus-client.test.ts   # 32/32 (11 puras + 21 contra servidor real), 0 fail/skip/todo
$env:PLANB_TF123_ROOT="<repo>/tests/.tmp/taskfocus123-a3341d54-dfaa-4f55-b4ff-c7eab710134c"
npx playwright test -c "$env:PLANB_TF123_ROOT/pw.config.ts"                            # 26/26 (19 anteriores + 7 de corrección)
npx tsc --noEmit -p .                                                                  # 0 errores en el árbol actual (no es regresión global)
```

Histórico (primera presentación): 26 Node y 19 DOM. Repetido ahora tras la corrección: todo lo anterior. Las pruebas de la primera presentación se conservaron; solo cambiaron las que comprobaban textos que ahora son más precisos («Dar por guardado» → «Aceptar el estado leído», el aviso de cola) y se pasó `context` a `verifyAfterUncertain`.

Mutaciones (primera presentación, M1–M5) detectadas; en la QA-130 se añadieron M6–M8 sobre el 401. No se repitieron sobre este código corregido (no se afirma lo contrario).

## Capturas

`tests/.tmp/taskfocus123-a3341d54-…/shots/` (`edicion|errores|guardado` × 1440/390/320, regeneradas por la última ejecución) y `f4-en-vuelo.png` (aviso «Hay un guardado en curso», **versión anterior al margen de 8 px añadido a la línea de estado**). Inspeccionadas por mí: `f4-en-vuelo.png`, y de la primera presentación `edicion-1440`, `errores-320`, `guardado-390`. Las demás solo las cubre la prueba de geometría.

## Recursos propios y procesos

Carpeta `tests/.tmp/taskfocus123-a3341d54-…/` (git la ignora): `entry.tsx`, `server.mts`, bundle esbuild, `pw.config.ts`, `mutate.cjs`, `mut/`, `results*`, `shots/`, `server-*.log`. Un proceso hijo de servidor por prueba (puerto efímero, 127.0.0.1, `scripts/block-external.cjs`), todos cerrados (comprobado). Sin 4451/4511/4515/4591, sin bases ni credenciales existentes, sin `npm run build`/`dist`, sin proveedores.

## Hashes finales (SHA-256)

| Archivo | SHA-256 |
| --- | --- |
| shared/local-task-focus.ts | 40332326d058dfd5c30e3d45e41e03b32c3a6a59f2e13b79228670ca4032479d |
| src/LocalTaskFocus.tsx | aefb63df80bf9e6130ae6d6e42f9ca932aff5b297670e7cd40339cc6b0c6b3a5 |
| src/local-task-focus-client.ts | 535177583a1defa3cecac416d6bd75fc887c5c16e35b83d06eaff3f8b10bf510 |
| src/local-task-focus.css | cdbe8147c813be8bb57d2332d84ea4a0d4bd161b371aede30bd27391f84c1f26 |
| tests/local-task-focus.test.ts | 45789c64375ebf83048a1c8e52a8403d87fbc112b1416b206b6da97c92efa5ae |
| tests/local-task-focus-client.test.ts | 35182a219449c9c459b7e3769bb44a6f69f5ecee1d90d1a1f8a213b6eda62e92 |
| tests/e2e/local-task-focus.spec.ts | adfa5c43e0c2fb326c810ea306fef916a3bbe4f946f33f510b6b2f1337506d62 |

(Los otros cuatro archivos reservados son este informe, el checkpoint, el traspaso y `design/task-focus123/README.md`; sus hashes los fija el `submit`.)

## Garantías NO demostradas

- **Concurrencia entre pestañas**: sin CAS ni idempotencia (API antigua). La lectura previa avisa de lo ya cambiado, pero una escritura entre ella y el PATCH se sobrescribe (hay pruebas que lo demuestran). Sin «aprobación contra revisión exacta».
- Tras un acuse perdido, «aplicado» no distingue tu envío de una edición idéntica ajena; la persona decide y la vista lo registra como decisión humana.
- Ventana residual: la copia puede cambiar entre la comprobación previa y el PATCH; no se verifica a posteriori.
- La identidad de copia usa los campos que expone el estado; dos sustituciones idénticas en todos ellos no se distinguirían. No es una versión del registro.
- El montaje es un arnés de «Hoy» (filas + callbacks), no la App ni `LocalOperations`; no prueba la navegación real, la barra lateral real ni cómo 118 recarga la cola.
- `datetime` en DOM: cubierto en la QA-130 (fixture modificada con fecha-hora); aquí solo conversión pura.
- 401: el bloqueo real se reproduce con `/api/v2/auth/lock`; no hay prueba de caducidad por tiempo.
- Chromium headless únicamente; sin contraste calculado ni lector de pantalla; sin proveedores ni cuentas.
