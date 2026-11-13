# TODAY-WORKQUEUE-230 · Traspaso (R3)

Este traspaso no autoriza editar `LocalOperations.tsx`, `App.tsx` ni `shared/continuity-day.ts`.

## Cómo consumirlo

```ts
const work = await loadLocalWorkQueue(signal);            // src/local-operations-client.ts (tope de lectura: WORK_QUEUE_CLIENT_MAX_BYTES, por bytes reales)
const key = contextKey({ instanceId: work.identity.instanceId, snapshotId: work.identity.snapshotId, capturedAt: work.identity.capturedAt,
                         captureStartedAt: work.identity.captureStartedAt, accountId: work.identity.accountId, generatedAt: work.identity.generatedAt });
// <ContinuityDay key={key} candidates={candidatesFromWorkQueue(work)} notConsidered={work.counts.notReturned} ... />
```

- `candidatesFromWorkQueue(work)` (a escribir): `statusKnown = status === 'open'`; `dueText = due.localDate ?? due.value`; `reasons` = textos de la interfaz a partir de `reasonCodes` (códigos **distintos**: «falta una asociación» aparece una vez).
- **Asociaciones**: usa `referenceCoverage.missing` para saber cuántas faltan (no cuentes `references`, que puede estar recortada a 50). Las `not-captured` NO son «falta»: «no comprobable» (decisión de interfaz). `referenceCoverage.omitted > 0` significa que hay asociaciones que no viajan (siempre viajan primero las ausentes y las no comprobables).
- **Una lista parcial nunca acredita el total.** `counts` cubre toda la copia; `counts.notReturned = page.omittedByLimit + page.omittedByBytes` son tareas de la cola que no están en `tasks` (la página es un prefijo en orden de prioridad). Una exclusión de la Jornada por «no devuelta» debe decirse así, no como «no cabe en el presupuesto».
- La identidad es la misma que usa la ficha; úsala como `key` del componente para aislar decisiones por copia (mismo ID de tarea en otra captura = estado nuevo).
- **Filas omitidas por tamaño** (`page.omittedOversize > 0`): la Jornada debe decir «hay N tareas que no se pueden mostrar aquí» (no las conoce por ID); no son «fuera de la lista» ni «cerradas».
- Una copia ACTIVA valida cada valor de campo a ≤ 10 000 caracteres (activación); el ID de un registro y una copia solo IMPORTADA no tienen ese tope. El v1 (`/api/v7/local-operations`) sigue acotando el ID de tarea a 1 000 y el de captura a 500.
- Recargar la lista tras una operación de la MISMA copia no cambia la clave; cambiar de captura o regenerar sí.
- `phase: 'empty'` ⇒ `identity`/`counts` `null` y lista vacía (validado por esquema). Cero exacto (`counts.queued === 0` con identidad) ≠ copia sin captura.

## Límites del contrato

| Límite | Valor | Quién lo cumple |
|---|---|---|
| Tareas por página | 200 | servidor (`page.omittedByLimit`) |
| Referencias por tarea | 50 | servidor (`referenceCoverage`) |
| Cuerpo UTF-8 | 900 000 B (servidor) / 1 000 000 B (cliente) | servidor mide el JSON real; cliente cuenta bytes reales sin fiarse de `Content-Length` |
| IDs de tarea, de referencia, de captura y de cuenta | solo el presupuesto de la respuesta (antes 1 000/500) | **nunca se truncan**: una fila que sola no cabe se omite entera (`page.omittedOversize`, subconjunto de `page.omittedByBytes`) y las siguientes siguen |
| Identidad de la copia | debe caber entera en el presupuesto | si no, error 500 explícito («La identidad de esta copia no cabe…»): decisión de producto pendiente |

`not-captured` y `missing`: la importación normal rechaza una referencia sin destino y exige las cuatro entidades. `missing` aparece si un registro desaparece de la copia tras importarla; `not-captured` es una rama defensiva (ver informe).

## Fuera de esta unidad

Adaptador y montaje de la Jornada; datos de responsable/duración (no existen); `LocalOperations.tsx` sigue usando el v1 para la cola visible.
