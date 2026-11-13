# CLAUDE-TODAY-WORKQUEUE-230 · Cola de trabajo estructurada de Hoy (R3)

6/11/2026, Europe/Madrid. Corrección R2 del dictamen independiente (`coordination/reviews/CLAUDE-TODAY-WORKQUEUE-230-independent.md`). Sin red ni datos reales; solo lectura. Sin commits ni despliegues. **No monta nada en Hoy ni cambia `LocalOperations.tsx`.** El recurso v1 `/api/v7/local-operations` y su cliente no cambian.

## Qué falló y cómo se corrige

| Hallazgo del dictamen | Causa | Corrección | Prueba |
|---|---|---|---|
| 1 · Una tarea válida con más de 20 asociaciones daba 422 en toda la página | La proyección volcaba todas las referencias y el esquema admitía 20; además `reasonCodes` repetía `missing-reference` una vez por asociación ausente (mismo fallo con ≥21 ausentes) | Límite de **50** referencias por tarea (`WORK_QUEUE_REFERENCE_LIMIT`). Si hay más se conservan **siempre** las no comprobables (`missing`, `not-captured`), se completa con las encontradas y se mantiene el orden original; ningún identificador se toca. `referenceCoverage` {total, returned, omitted, found, missing, notCaptured} cuenta **todas** las asociaciones; `omitted > 0` exige haber llegado al límite. `reasonCodes` pasa a códigos distintos (cuántas ausentes: `referenceCoverage.missing`) | `R2·1` con totales 6, 21…23, 48…51 y 59: sin recorte hasta 50, recorte de **1** en 51 y de 9 en 59; ausentes al final del orden viajan y el motivo sale una vez |
| 2 · La página del servidor (1.769.130 B) superaba el tope del cliente (1.000.000 B) | Servidor y cliente no compartían presupuesto | `WORK_QUEUE_BYTE_BUDGET = 900 000` B UTF-8 medidos sobre el JSON real; el cliente acepta hasta `WORK_QUEUE_CLIENT_MAX_BYTES = 1 000 000`. Si no caben las 200 tareas se devuelve el **prefijo más largo que cabe**; `page.omittedByBytes` (distinto de `page.omittedByLimit`) las cuenta y `counts.notReturned` es siempre su suma. Orden, cifras globales e identificadores intactos | `R2·2` con 200 tareas × 16 asociaciones de 420 caracteres: cuerpo ≤ presupuesto, prefijo de la cola en el mismo orden, recuentos globales iguales a `buildResponseQueue`, cliente lo consume sin `Content-Length` y en fragmentos de 64 KB; borde **exacto** (con el tamaño exacto cabe, con 1 byte menos una tarea menos, seis pasos seguidos); UTF-8 con €, ñ, emoji y CJK (un presupuesto igual al nº de caracteres no admite el cuerpo) |
| 3 · El cliente aceptaba `phase: 'empty'` con identidad, recuentos y tareas | El esquema ligaba identidad y recuentos entre sí pero no a la fase | `empty` ⇒ identidad y recuentos `null`, lista vacía y cero omitidas; `imported`/`active` ⇒ identidad y recuentos. Además: tareas = completadas + abiertas + desconocidas; en cola = abiertas + desconocidas; devueltas + no devueltas = en cola; no devueltas = suma de motivos; IDs de tarea distintos; abiertas/desconocidas devueltas ≤ contadas; presupuesto declarado ≤ tope del cliente | `R2·3`: 15 respuestas contradictorias rechazadas por esquema y por `loadLocalWorkQueue`; controles positivos (copia viva y vacía) |

El cliente **no usa `Content-Length`**: una prueba independiente existente (`independent-local-operations-http`) exige que un `Content-Length` falso no rechace un cuerpo de exactamente 1.000.000 bytes; manda el recuento real de bytes (`readBoundedText`, exportado para probar el borde con multibyte y fragmentos que parten un carácter).

## Contrato (formato `planb-local-work-queue-v1`, sin consumidor aún)

La respuesta cambia de forma respecto a la entrega anterior (`page`, `referenceCoverage`, `reasonCodes` distintos), pero **no hay ningún consumidor**: ni `LocalOperations.tsx`, ni la Jornada, ni otro código leen el recurso. Se mantiene el nombre de formato porque nunca se publicó a un cliente; si Codex prefiere un `-v2`, es un cambio de una línea antes del primer consumidor.

- `page`: `taskLimit` 200, `referenceLimit` 50, `byteBudget`, `omittedByLimit`, `omittedByBytes`. **Una lista parcial no acredita el total**: los recuentos cubren toda la copia y `notReturned` > 0 significa que faltan tareas.
- Por tarea: `references` (≤ 50) + `referenceCoverage`. `total: 0` es «sin asociaciones»; `omitted > 0` es «recortado».
- Presupuesto: `byteBudget` viaja dentro del cuerpo; el tamaño exacto de un cuerpo es el punto fijo de «presupuesto = bytes de la respuesta que produce». `inspectLocalWorkQueue(store, clock, { byteBudget })` admite un presupuesto distinto solo para pruebas; un presupuesto que ni el esqueleto admite falla con 500 en vez de devolver más de lo declarado.

## Prueba de las 3 sondas del dictamen contra el código actual

| Sonda | Resultado |
|---|---|
| CONTROL (candidata pendiente no sustituye la cola activa; 401 sin sesión; 403 con origen ajeno; cero escrituras) | pasa sin cambios |
| 21 asociaciones | pasa sin cambios (21 de la prueba + 2 propias = 23 ≤ 50) |
| Respuesta vacía con tareas | pasa sin cambios |
| Página completa de 200 tareas consumible por el cliente | **la aserción antigua no puede cumplirse** (esperaba 200 tareas y > 1.000.000 B); el contrato acordado devuelve 100 tareas y `omittedByBytes: 100`. La misma escena está cubierta en `R2·2` con la expectativa nueva y el cliente real consumiendo el cuerpo |

## Referencias fuera de la copia y `not-captured`

- **La importación normal rechaza una referencia sin destino** (422 «Referencia sin destino», también cuando el ID existe pero en otra entidad) y conserva la captura activa. `missing` solo se alcanza si un registro desaparece de la copia después de importarla (la prueba lo borra de Store, como la de referencias existente). Las pruebas de importación fallida lo demuestran.
- **`not-captured` es una rama defensiva**: la importación normal exige las cuatro entidades (422 por formato), así que no existe ninguna copia normal en la que la entidad referida no figure. Solo se alcanza con una copia alterada fuera de Store (la prueba original de `referencias` lo hace manipulando el snapshot).
- Homónimas: dos contactos con el mismo nombre y distinto ID se ven como dos referencias con la misma etiqueta e IDs distintos. Mismo ID de tarea en otra captura: la identidad (`snapshotId`, `capturedAt`) cambia, se leen solo los datos de la captura activa y una candidata pendiente no cambia la cola.

## Compatibilidad con la Jornada (205)

`candidatesFromWorkQueue` (unidad aparte) debe tratar `notReturned > 0` como «no consideradas» (nunca un total), usar `referenceCoverage.missing` para «falta una asociación» aunque `references` esté recortada, y mostrar `not-captured` como «no comprobable». Ver traspaso.

## Pruebas (sobre el corte final)

| Comando | Resultado |
|---|---|
| `tsx --test tests/local-work-queue.test.ts` | **19/19** (10 anteriores + 9 nuevas) |
| Familia de Hoy (`local-operations`, `-client`, `-client-regression`, `-mount`, `independent-local-operations-http`) + la nueva | **58/58** |
| `tsc --noEmit` | sin errores en los archivos de la unidad; el único error del proyecto está en `tests/e2e/continuity-hub.spec.ts` (otra sesión) |

**Contrapruebas por mutación (13 aplicables: 10 detectadas, 3 equivalentes):** medir caracteres en vez de bytes, sin prioridad de las no comprobables al recortar, motivos repetidos, `omittedByBytes` a 0 y combinada «sin bucle de bajada + estimación ×2» (3 pruebas fallan y el guardián final lanza 500); en el cliente, contar fragmentos en vez de bytes y tope +1; en el esquema, sin regla de fase, sin regla de suma de omitidas y sin IDs distintos. **Equivalentes (se explican):** quitar el bucle que sube `returned` (el de bajada lo corrige), quitar el de bajada (la estimación por tamaños individuales es conservadora y nunca lo necesita) y relajar la estimación (el bucle de bajada la repara). Una catorceava mutación, el atajo por `Content-Length`, se descartó porque el atajo se retiró del código.

## Hashes (SHA-256)

| Archivo | Antes | Ahora |
|---|---|---|
| `shared/local-operations.ts` | `b9d76a19e3318dbc…` | `6c4f8826b1d6fc565f7fea35d81c63a5bf845650d7506ff3526afbdfb1ae1696` |
| `server/local-operations.ts` | `173284d47432b5c9…` | `0578285b8a5412a10806dcbc3380b5552b6daf251b053af9867968f5ec8f89e4` |
| `src/local-operations-client.ts` | `f16d1c7729079f7b…` | `b5fcb0fcd0af0199938feef019d27d5aa7c5c1e08a4897770eb88c02e5f650bb` |
| `tests/local-work-queue.test.ts` | nuevo | `77e3486fb6dd596d4425211faa19191722d1af8d6032b10c0d19792a3d7ee7f6` |

## Límites

- No hay consumidor: la Jornada necesita `candidatesFromWorkQueue` (en `shared/continuity-day.ts`, unidad aparte) y el montaje en Hoy (`LocalOperations.tsx`/`App.tsx`) es otra unidad. Esta no certifica nada del binario de la candidata 236.
- Con 200 tareas de asociaciones muy largas la página puede traer menos de 200; la interfaz debe leer `notReturned` y no presentar el total como la lista.
- `not-captured` no cubre capturas parciales de una entidad que sí figura.
- No hay dato de responsable ni de duración.
- Los archivos conservan su terminación de línea original (CRLF en el árbol de trabajo).


---

# R3 · los IDs que admite la importación no pueden hacer ilegible la cola

**Reproducción (`tests/.tmp/work230-r2-ns0i8C/s/tests/work230-r2-independent.test.ts`, caso final).** Un contacto con ID de 1.001 unidades UTF-16 se importa y activa con normalidad, el v1 responde 200 y la cola estructurada respondía 422 por `WorkReferenceSchema.id.max(1000)`. Con la corrección, las 5 sondas del dictamen pasan **sin modificarlas** (ya con la expectativa de 100 tareas de la sonda de tamaño).

**Causa y auditoría de límites.** Los esquemas de importación solo exigen «no vacío» al ID de un registro, al ID de la captura y a la cuenta (`RecordSchema.id`, `SnapshotSchema.id`, `source.accountId`); los topes de 1.000/500 eran míos. Cotejo del resto de campos de la proyección:

| Campo de la cola | Tope del contrato | Lo que admite la entrada | Resultado |
|---|---|---|---|
| ID de referencia, ID de tarea, `identity.snapshotId`, `identity.accountId` | **antes 1.000/500** · ahora el presupuesto de la respuesta | sin tope (`min(1)`) | **corregido** |
| `reference.field` | 200 | clave de campo ≤ 100 (`FieldSchema`) | compatible (probado con una clave de 100) |
| `reference.entity` | 100 | enum de 4 entidades | compatible |
| `label` de tarea / de referencia | 500 | se recorta a 180 por diseño (`buildResponseQueue.label`, sin partir un par sustituto) | compatible (probado en el límite del par) |
| `due.value` | 100 | un vencimiento inválido se recorta a 100 | compatible (probado con 5.000 caracteres) |
| `identity.capturedAt`, `captureStartedAt` | 100 | `datetime` ISO | compatible |
| `identity.generatedAt` | 100 | fecha de generación del propio servidor | compatible |
| `reasonCodes` | 20 códigos de ≤ 100 | códigos fijos del servidor, ahora distintos | compatible |
| **Valores de campo (incluida una referencia) en una copia ACTIVA** | — | **≤ 10.000 caracteres** (`shared/model.ts`: «El texto es demasiado largo») | límite de la **activación**, no de la cola: una copia solo importada sí admite más (probado con 60.000 y 1.000.000) |

**Corrección.** `identifier = z.string().min(1).max(WORK_QUEUE_BYTE_BUDGET)`: en unidades UTF-16 una cadena nunca pesa menos bytes que unidades, así que el presupuesto de la respuesta es su única cota. **Ningún ID se trunca**. Lo que no cabe se omite:

- **Fila que SOLA no cabe** en el presupuesto (p. ej. un ID de tarea de 1.000.000 de unidades, o 3 referencias de ~10.000 caracteres con un presupuesto de 20 KB): se **omite entera**, se cuenta en `page.omittedByBytes` y en el nuevo `page.omittedOversize` (subconjunto, validado por esquema), se explica en `limitations`, y **las siguientes siguen** en su orden (una fila enorme no vacía la cola). Las filas que sí caben juntas siguen el prefijo más largo de siempre. El cuerpo no contiene ni un fragmento del ID omitido (comprobado a 100/200 caracteres).
- **Identidad que no cabe** (ID de captura de 950.000 unidades con presupuesto de 900.000): no hay respuesta honesta posible porque la identidad viaja siempre íntegra; el servidor devuelve un **500 con mensaje claro** («La identidad de esta copia no cabe en el presupuesto…»), no un 422 de esquema ni una identidad truncada, y el cuerpo del error no la vuelca. **Decisión de producto pendiente**: acotar el ID de captura/cuenta en la importación o aceptar este error. No lo decido aquí.
- **v1 sin cambios** (instrucción de R3): su esquema sigue acotando a 1.000 el ID de tarea y a 500 el de captura, de modo que un ID de tarea >1.000 sigue dando 422 en `/api/v7/local-operations` (no en la cola nueva). Es el recurso anterior; lo registro como límite para el montaje de Hoy.

**Pruebas nuevas (6 en `tests/local-work-queue.test.ts`; total 25/25).** (1) contacto de 1.000, 1.001, 5.000 y 10.000 unidades en copia **activa** y de 60.000 en copia **solo importada**, y un ID multibyte de 1.251 unidades (mucho más de 3.000 bytes): `found`, etiqueta resuelta (no «ausente»), 200, v1 200, cuerpo ≤ presupuesto, el cliente recibe la identidad íntegra; (2) ID de tarea de 2.500+, de captura de 20.000 y de cuenta de 3.000 unidades; (3) fila que sola no cabe con presupuesto pequeño: omitida, declarada, orden conservado, sin fragmentos; (4) **presupuesto real**: una tarea de 1.000.000 de unidades (copia activa) y un contacto de 1.000.000 (copia importada) → su fila se omite, la cola sigue legible y el cliente consume el cuerpo realmente devuelto; (5) identidad que no cabe → 500 explícito; (6) etiquetas/vencimientos largos recortados por diseño y clave de campo de 100. Además, dos contradicciones de esquema nuevas en `R2·3` (filas grandes > omitidas por bytes).

**Repeticiones.** Las 19 anteriores (R2) siguen verdes; familia de Hoy (`local-operations`, cliente, regresión, montaje, `independent-local-operations-http`): **64/64**; `tsc --noEmit` limpio en la unidad. **Contrapruebas R3:** tope de 1.000 en la referencia, tope de 500 en la captura, tope de 100 en el identificador, sin omitir filas grandes, sin guarda de identidad y `omittedOversize` a 0 — las seis detectadas; el `if (false)` de la regla `omittedOversize ≤ omittedByBytes` se detectó tras añadir su contradicción; quitar `omittedOversize` de la regla de «empty» es **equivalente** (ya lo cubre `omittedByBytes` = 0).

**Límites nuevos.** (1) El borde exacto de «cabe sola» se mide con `omittedOversize` aún sin contar: una fila a ±1 byte del presupuesto puede clasificarse como omitida por bytes y no como grande; ningún caso real depende de ello. (2) Una fila con muchas referencias largas se omite entera en vez de recortar sus referencias hasta que quepa; coherente con «no fabricar detalle», pero implica que una tarea con 50 referencias de 10.000 caracteres (~500 KB) cabe y una con 3 de 400.000 (solo importada) no.

**Huellas SHA-256 vigentes (R3).** El informe no puede contener la suya; la registra el tablón al presentar. `src/local-operations-client.ts` no cambia en R3.

| Archivo | SHA-256 |
|---|---|
| `shared/local-operations.ts` | `29bf4f4f11ebda0786567bcb6b8357d15a01c50ed2f1deadab08ca458d64560c` |
| `server/local-operations.ts` | `51e1c9489036ef05b3867524c13223f77d203cb9041a354efeaea1b1fbd7511a` |
| `src/local-operations-client.ts` | `b5fcb0fcd0af0199938feef019d27d5aa7c5c1e08a4897770eb88c02e5f650bb` |
| `tests/local-work-queue.test.ts` | `6a911d30cbe4e50b76241957d9a68b4aeb27a7a8a4d3c0ea0ce671031309ca7c` |
| `coordination/plans/TODAY-WORKQUEUE-230-HANDOFF.md` | `34ec5ce99098287f82acfbef8ab7874463139f654a31116a1f782eba302bd6c5` |
