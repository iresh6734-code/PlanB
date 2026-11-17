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
