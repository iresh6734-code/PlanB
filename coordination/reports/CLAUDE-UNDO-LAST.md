# CLAUDE-UNDO-LAST · Deshacer el último guardado local

**Autor:** Claude (Opus 5.5) · **Fecha:** 17/11/2026, Europe/Madrid · **Origen:** mejora C8 del informe de mejoras, por orden del usuario («acaba todas»).

## Qué hace

Tras guardar una ficha o una edición en línea, el aviso «Guardado en tu copia local» ofrece **Deshacer** durante 8 segundos. Mientras está disponible, la misma orden aparece en la paleta Ctrl J como «Deshacer el último guardado». Al pulsarlo, el registro vuelve a los valores de antes y el aviso dice «Cambio deshecho. Queda anotado en Cambios».

## Reglas (servidor, `server/undo.ts`)

- `POST /api/v2/changes/undo-last` con `{ entity, id }`. Se registra en `server/app.ts`, así que lo sirven la App completa y la portátil.
- Solo deshace **la última actualización** guardada, y solo si es del registro indicado y ese registro sigue **exactamente** como ella lo dejó. Si no, responde 409 con su motivo:

| Código | Cuándo |
| --- | --- |
| `NOT_LATEST` | Se guardó otro cambio después |
| `RECORD_CHANGED` | El registro cambió por otra vía |
| `NOT_AN_UPDATE` | Es un alta: el modelo no tiene borrado local |
| `RECORD_MISSING` | El registro ya no está en la copia |
| `NO_CHANGES` | No hay cambios (404) |

- **No borra historial.** La restauración se guarda con `saveRecord` como un cambio nuevo, así que pasa por la misma validación, el mismo bloqueo durante una devolución y el mismo control de integridad. La devolución al CRM ve una secuencia fiel. Los campos que la edición añadió y antes no existían vuelven a quedar vacíos.
- Deshacer dos veces seguidas rehace el cambio, porque el último cambio pasa a ser el inverso. Es coherente con la regla y no hace falta nada aparte.

## Archivos

| Archivo | SHA-256 |
| --- | --- |
| `server/undo.ts` (nuevo) | `9b62ca19…036014` |
| `server/app.ts` (+1 import, +1 línea) | antes `b26845d2…8d919b` · después `86c27f82…0bee` |
| `tests/undo-last.test.ts` (nuevo) | `b1a7545c…db83` |
| `src/App.tsx` (compartido; autorizado por el usuario) | antes `8e7b5699…ef56` · después `81c9ef8a…c80` |
| `src/faro.css` (compartido; 2 reglas al final) | después `2f190031…e702d` |

Nota de proceso: `server/app.ts` se editó minutos antes de registrar el encargo; el archivo estaba libre y la reserva se obtuvo sin conflicto.

## Verificación

- `tests/undo-last.test.ts` **4/4**:
  - lógica pura: los cinco motivos y los campos añadidos;
  - ruta real sobre un almacén cifrado: restaura, añade un cambio inverso y deja el historial completo; tras guardar otro registro responde `NOT_LATEST` sin tocar nada;
  - un alta no se deshace, y una escritura posterior por otra vía bloquea con `RECORD_CHANGED`;
  - las peticiones mal formadas se rechazan con 4xx sin cambios.
- **Mutantes 4/5 detectados:** pisar un registro cambiado, deshacer sin ser el último, no vaciar campos añadidos y escribir sin pasar por el historial. Sobrevive «deshacer altas», que es **equivalente**: el almacén guarda siempre las altas con `before` nulo, así que las dos condiciones coinciden.
- `tsc --noEmit` 0.
- **Navegador** (ensayo aislado 4421/5199, datos ficticios nuevos):
  - abrir Lucía Martín y cambiar su teléfono de `600 000 001` a `600 123 456`;
  - guardar: aparece el aviso con Deshacer;
  - pulsar Deshacer: el servidor devuelve `600 000 001` y el historial pasa de 1 a 2 cambios;
  - sin errores de página.

## Pendiente

- `docs/api.md` necesita regenerarse con la ruta nueva (`node tools/api/inventory.mjs`), y hasta entonces la CI lo marcará desactualizado. Ese archivo está reservado por `CLAUDE-API-INVENTORY`, en revisión, así que no lo edito aquí: se regenera en cuanto esa unidad vuelva o se acepte.
- Cambios (`ChangesView`) no tiene todavía un botón propio de deshacer. El aviso y la paleta cubren el caso habitual, que es arrepentirse del último guardado.

## R2 · Corrección pedida en CODEX-UNDO-REVIEW-392 (17/11/2026)

**Hallazgos de Codex (confirmados):**
- El aviso de un guardado podía revertir un guardado posterior del mismo registro.
- Repetir la petición deshacía el inverso.
- Una escritura de otra conexión entre la comprobación y la escritura quedaba pisada.

**Cambio:**
- **Identidad del guardado.** `POST/PATCH /api/records/...` devuelven `change: { id, at }`, el cambio que produjo ese guardado (`server/app.ts`). El cajón de la ficha (`src/components.tsx`) y la edición en línea (`src/App.tsx`) la entregan al aviso y a la paleta. Deshacer envía `{ changeId, at }`: la fecha distingue un mismo `id` de otra copia restaurada.
- **Comprobación atómica.** `saveRecord` admite `guard`, que se ejecuta **dentro** de su transacción `BEGIN IMMEDIATE` antes de escribir, y `onChange`, que devuelve la identidad del cambio creado (`server/store.ts`). También hay un `latestChange()` sin descifrar. Deshacer repite ahí las dos condiciones: que ese cambio siga siendo el último y que el registro siga como lo dejó.
- **Sin segundo inverso.** Tras un éxito, el último cambio es el inverso, así que repetir la petición responde 409 `NOT_LATEST`. Rehacer sería un gesto aparte, que no existe hoy.

**Archivos compartidos editados con autorización del usuario:**
- `server/store.ts`, reservado por `CODEX-RESTORE-TRANSACTION-388`, ya presentado. El cambio es aditivo en `saveRecord` y `latestChange`; no toca `restoreBundle`. El encargo complementario `CLAUDE-UNDO-LAST-STORE` no se pudo asignar por esa reserva.
- `src/components.tsx` y `src/App.tsx`.

| Archivo | SHA-256 |
| --- | --- |
| `server/undo.ts` | `6261c540…5d27` |
| `server/app.ts` | `d90a014d…1eb5` |
| `server/store.ts` | `5842f24e…b457` (antes `70224323…f542`) |
| `src/components.tsx` | `b5a18e6b…7640` (antes `fb857268…13c6`) |
| `src/App.tsx` | `fb948356…b4ae3` |
| `tests/undo-last.test.ts` | `6be1a987…05b` |

**Verificación:**
- `tests/undo-last.test.ts` **7/7**:
  - la lógica, incluido el mismo `id` con otra fecha;
  - deshacer el guardado anunciado (devuelve la identidad del inverso);
  - **dos guardados del mismo registro:** el aviso del primero responde 409 `NOT_LATEST` y conserva el segundo;
  - **repetición tras un éxito:** 409, sin cambio nuevo;
  - **otra conexión que guarda en el hueco exacto** entre la lectura de la ruta y su transacción: 409 `NOT_LATEST` y la escritura ajena se conserva;
  - alta y escritura fuera del historial;
  - peticiones mal formadas.
- Mutante: sin la guarda dentro de la transacción, la prueba de concurrencia falla. Es la guarda la que protege.
- Suites del almacén en verde: `store-records-cache` 15/15, `task-revision` 10/10, `independent-recovery-integrity087` 3/3, `persisted-recovery-resilience` 12/12. `tsc` 0.
- Navegador, en el ensayo aislado: guardar el teléfono, pulsar Deshacer, el servidor vuelve al original y el historial suma un cambio (3 → 4). Sin errores de página.

## R3 · Revisión 399 de Codex

**Hallazgo (correcto).** La etiqueta `{changeId, at}` no estaba ligada a la copia activa. Tras restaurar otra copia cuyo último cambio tuviera el mismo ID y la misma fecha, Deshacer respondía 200 y modificaba el registro restaurado.

**Corrección:**

- **`server/store.ts`** (reserva 388 de Codex, editado con autorización del usuario):
  - `copyEpoch()`: una época de la copia, creada la primera vez que se pide;
  - `restoreBundle` la renueva en cada restauración, también si se restaura la misma copia con su misma sesión;
  - la identidad que `saveRecord` entrega a `onChange` lleva ahora `copy`, así que la devuelven `PATCH` y `POST /api/records`.
- **`server/undo.ts`.** La etiqueta es `{changeId, at, copy}` y es obligatoria. `planUndo` rechaza con 409 `OTHER_COPY` si la época no es la activa. La guarda **dentro de la transacción** lo vuelve a comprobar antes de tocar registro o historial.
- **`src/App.tsx` y `src/components.tsx`.** El aviso guarda y envía la etiqueta completa. Solo cambian los tipos y el objeto de la etiqueta.

**Pruebas** (`tests/undo-last.test.ts`, **10/10**):

1. `planUndo` con otra época da `OTHER_COPY`.
2. Restaurar otra copia (otra captura, sesión y registro) con el mismo último ID y fecha da 409. El registro restaurado y su historial quedan intactos.
3. Restaurar por segunda vez la misma copia con su mismo ID de sesión da 409. Como control, un guardado posterior da una etiqueta vigente y Deshacer responde 200.
4. Una restauración entre la comprobación previa y la transacción da 409.

Sobre la fuerza de las pruebas:

- La primera versión de la prueba 4 era hueca: la restauración caía antes de la comprobación previa por el orden de evaluación de los argumentos. Se rehízo sobre `copyEpoch`, que devuelve la época vieja a la comprobación previa y restaura justo después.
- **Mutaciones:** quitar la comprobación en la transacción o la previa hace fallar alguna prueba.

**Otras comprobaciones:**

- Suites del almacén y de restauración: `store-records-cache` 15/15, `backup-coverage` 15/15, `agents` 53/53, `continuity-evidence-api` 17/17 y `restore-transaction-388` 8/8.
- Interfaz: `ui-journeys` 60/60 e `independent-interface-contexts` 47/47.
- `tsc` 0.
- Contra la API de ensayo:
  - la etiqueta llega con `copy`;
  - Deshacer vigente da 200 y repetirlo da 409;
  - una etiqueta sin `copy` da 422 (petición mal formada).

**Nota de despliegue.** Un cliente anterior, sin `copy`, recibe 422 al deshacer. Interfaz y servidor se despliegan juntos (`dist` + servidor), así que solo afecta a una pestaña abierta durante un despliegue. Recargarla lo resuelve.

**Huellas R3:**

| Archivo | Antes | Después |
| --- | --- | --- |
| `server/store.ts` | `5842f24ea193` | `a4246275ef0f` |
| `server/undo.ts` | `6261c5408f8e` | `3efb76d1c2bc` |
| `src/App.tsx` | `cfeaa31066fb` | `18bdaf577d65` |
| `src/components.tsx` | `49c606c3386d` | `ab5d71534bba` |
| `tests/undo-last.test.ts` | `6be1a987adfe` | `49cc89d5feca` |
