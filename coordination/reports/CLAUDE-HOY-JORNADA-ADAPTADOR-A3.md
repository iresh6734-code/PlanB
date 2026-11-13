# CLAUDE-HOY-JORNADA-ADAPTADOR-A3 · Cola estructurada → Jornada

6/11/2026, Europe/Madrid. Primera mitad de A3: **modelo puro** que convierte la cola estructurada de 230 R3 en lo que la Jornada necesita. **No monta nada en Hoy**: el montaje (`LocalOperations.tsx`, «Organizar mi jornada», `ContinuityDay`) es otra unidad que espera a la presentación de A2, dueña de ese archivo. Sin red; datos ficticios; las copias entran por la importación normal de Store.

## Qué entrega (`shared/work-queue-day.ts`)

`dayInputFromWorkQueue(work: LocalWorkQueue)` → `{ key, phase, candidates, notConsidered, coverage, referenceNotes }`.

- **Candidatos**: `statusKnown = status === 'open'`; `dueText = due.localDate ?? due.value` (el día local de Madrid de un instante, como la cola); motivos como textos de la interfaz derivados de `reasonCodes` y `due.kind`, **idénticos** a los detalles de `buildResponseQueue` (el único que no puede serlo es «falta una asociación»: la cola no envía la etiqueta del campo). Un código desconocido no se inventa.
- **Asociaciones**: `missing` por `referenceCoverage` (la lista `references` puede estar recortada a 50); se muestran hasta 3 ausentes recortadas y «y N más»; `not-captured` NO es «falta» (se explica como «no se puede comprobar» y no entra en `missingReferences`); las no mostradas se declaran.
- **Cobertura**: `notConsidered = counts.notReturned`; `coverage` separa lo recortado por el límite de tareas, por bytes y las filas que **solas** no caben (`omittedOversize`), con un aviso que dice que la Jornada solo organiza lo que se ve y que **no significa** que las demás estén cerradas. Cero exacto (`queued: 0` con identidad) ≠ copia sin captura (`key: null`, `queued: null`).
- **Aislamiento**: `key` = `contextKey` de la identidad completa (la que usa la ficha). Otra captura u otra generación con los mismos IDs de tarea = otra clave; recargar la misma copia no la cambia.
- **IDs largos**: los datos viajan íntegros; `shortId` solo recorta la presentación (sin partir un par sustituto) y conserva la longitud real.
- Función pura: no muta la entrada y el resultado es independiente de ella.

## Pruebas (`tests/work-queue-day.test.ts`)

**11/11**: equivalencia con `candidatesFromQueue` sobre la misma copia; identidad == `contextKey` de la ficha y claves distintas por captura y generación; vacío válido ≠ sin captura e importada; página recortada por límite y por bytes; fila enorme omitida sin fragmentos del ID; IDs largos; `missing` más allá del límite de 50 con la Jornada real avisando; `not-captured`; homónimas; pureza; código desconocido; estado desconocido y vencimientos con hora. `tsc --noEmit` limpio en la unidad.

**Contrapruebas (8 mutaciones, todas detectadas tras añadir las dos que sobrevivían):** `missing` sin cobertura, `notConsidered` a 0, estado siempre abierto, ID sin recortar, clave sin captura, `partial` falso, `dueText` sin día local y omisión de «no se muestran».

## Límites y lo que falta (A3, segunda mitad)

- No hay montaje: sin «Organizar mi jornada», sin lectura de la cola desde Hoy, sin foco de retorno ni prueba en la App.
- La Jornada sigue siendo **memoria de la pestaña** (estimaciones y decisiones temporales); persistirlas sería otra unidad con aislamiento, límite y restauración probados antes de anunciarlo.
- Los motivos por «falta una asociación» no nombran el campo (la cola no lo envía); si el producto lo necesita, es un cambio de contrato de 230.
- Archivos con CRLF, como el árbol de trabajo.

## Huellas SHA-256

El informe no puede contener la suya; las de los dos archivos de código están en la nota de presentación del tablón.


---

# R2 · índice de asociaciones con IDs que son nombres de propiedad

**Reproducción (`tests/.tmp/adapter274-4slUyo/s/tests/independent-adapter274.test.ts`).** Un ID de tarea `__proto__` (admitido por la cola) hacía que `referenceNotes[task.id] = …` **cambiara el prototipo** del índice en lugar de crear una entrada: el candidato conservaba su ID, pero la nota de cobertura se perdía al serializar. Con mi entrega R1 la sonda daba 11/12.

**Corrección.** `referenceNotes` es un diccionario **sin prototipo** (`Object.create(null)`): cualquier ID es una entrada propia. Se añade `referenceNoteOf(notes, id)` (lectura por entrada propia con `Object.hasOwn`): un ID ausente como `valueOf` o `hasOwnProperty` devuelve `null`, nunca algo heredado, y sirve también tras `JSON.parse` (que devuelve un objeto normal con entradas propias). Identidad, aislamiento por contexto, recuentos y IDs íntegros no cambian.

**Pruebas:** **12/12** (los 11 de R1 + la regresión nueva): tres tareas importadas por Store con los IDs `__proto__`, `constructor` y `toString` (enlaces actualizados, la cola pasa su esquema) conservan ID íntegro, entrada propia, nota correcta, prototipo `null`, y tras `JSON.stringify`/`JSON.parse` siguen presentes como propias sin alterar el prototipo del objeto leído. La sonda del revisor pasa **sin cambios**. Contraprueba por mutación: volver a `{}` falla la regresión. `tsc --noEmit` limpio.

**Hallazgo para otro dueño (no corregido aquí).** `ContinuityDay.tsx` (205, aceptada) guarda las estimaciones en un objeto normal (`const next = { ...previous }; next[id] = value`): una tarea con ID `__proto__` no recibiría su estimación. El adaptador no lo agrava, pero el montaje en Hoy debe tenerlo en cuenta (mapa o entradas propias en el componente) antes de anunciar IDs arbitrarios.

**Huellas vigentes (R2):** en la nota de presentación del tablón (`shared/work-queue-day.ts`, `tests/work-queue-day.test.ts`). CRLF conservado.
