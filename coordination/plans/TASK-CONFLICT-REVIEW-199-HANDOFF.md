# TASK-CONFLICT-REVIEW-199 · Traspaso: cómo montarlo en la ficha (paquete 5)

Este traspaso **no autoriza editar** `LocalTaskFocus.tsx`, `local-task-focus.css` ni el gestor: la integración necesita su propia unidad, con esas rutas reservadas y tras aceptar 170/171.

## Llamada prevista desde la ficha

Cuando el guardado termina en conflicto (hoy `not_sent` con `detail.kind === 'conflict'` en el gestor; con 128/166, `rejected` con `revisionConflict`):

1. **Cargar la versión actual explícitamente** (lectura): `loadTask(taskId, signal)` → `{ record: current, context: currentContext, schema }` y, con 166/183, el token de **esa** lectura. Si la lectura falla: avisar, conservar el borrador y no abrir el comparador.
2. Montar, en lugar del formulario y dentro de la ficha:
   ```tsx
   <TaskConflictReview
     input={{ entity, spec: schema.spec, base: op.baseline, baseContext: op.context,
              draft: { ...op.baseline.values, ...op.patch }, current, currentContext }}
     describeValue={describeReference}          // opcional: nombre de la referencia
     onKeepEditing={backToForm}                  // vuelve al formulario con el borrador intacto
     onPropose={proposal => adopt(proposal)} />
   ```
   `base` y `baseContext` son los de la **operación** (lo que la persona vio), no la lectura nueva.
3. `adopt(proposal)`: `base := proposal.baseline`, `draft := proposal.values`, aviso «Revisado contra la versión de las HH:MM», y **no** guardar: la persona pulsa «Guardar» y la ficha llama a `outcomes.submit({ baseline: proposal.baseline, patch: proposal.patch, revision: <token de la lectura del paso 1>, context: currentContext, … })`. Es un intento NUEVO y explícito; nunca se reenvía el anterior ni se renueva un token para reenviar en silencio.
4. Si `resolve` da `noop`, no hay envío (el componente no llama a `onPropose`). Si `identity-mismatch`, no se ofrece mezcla: el borrador sigue visible y se remite a reabrir la tarea.

## Contrato que no debe romperse

- El componente no guarda ni lee; el gestor sigue siendo el único dueño de envíos.
- `proposal.provenance === 'person-decision'`: no se muestra como «confirmado por el servidor» ni como autoría del envío anterior.
- Foco: al montar, el foco va al encabezado; al «Volver al formulario» la ficha debe devolverlo al primer campo editable.
- Mantener `contextKey` y el orden de identidad de 158: si la lectura da 401, el aviso `planb:locked` ya lo gestiona el propietario (123); el comparador no se monta con sesión bloqueada.

## Pruebas que la integración debe añadir

Dos editores desde la misma revisión → conflicto visible con el borrador intacto → decisión por campo → un nuevo intento explícito → un único cambio ganador en el servidor; no-op sin historial; cambio de captura durante la revisión; verificación tras acuse perdido sin reenvío.
