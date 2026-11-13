# CONTINUITY-DAY-205 · Traspaso: montar la Jornada de continuidad en Hoy

Este traspaso **no autoriza editar** `LocalOperations.tsx`, `App.tsx`, `TaskOutcomesHost.tsx` ni la API de Hoy: el montaje necesita su propia unidad, con rutas reservadas, cuando 171 esté aceptada.

## Llamada prevista

```tsx
// En la vista de Hoy (LocalOperations), con los datos que ya recibe:
const candidates = useMemo(() => candidatesFromToday(data.tasks), [data]);          // adaptador CONSERVADOR
const hints = useMemo(() => pendingHints(outcomes.getSnapshot(), currentContextKey), [ops]);   // solo { [taskId]: 'in_flight' | 'uncertain' }
<ContinuityDay candidates={candidates} hints={hints} notConsidered={data.counts.queued - data.counts.returned}
               onOpenTask={id => openFicha(id)} />
```

- `onOpenTask` debe abrir la ficha **vigente** por ID (la misma ruta que «Abrir tarea» de Hoy). Completar una tarea sigue siendo el guardado normal de la ficha; la jornada no escribe nada.
- `pendingHints` (a escribir en el montaje) recorre las operaciones del gestor 170/171 y emite **solo el estado** (`in_flight`/`uncertain`) de las que no están sustituidas y cuyo `contextKey` coincide con el de la copia actual. Nunca texto de tareas, parches ni IDs de intento.
- Un `attemptId` o una operación de otra copia no puede marcar una tarea de esta copia.

## Aislamiento por identidad COMPLETA de la copia (criterio de montaje, R2)

Los estados locales del componente (estimaciones, fijadas, elegidas, descartadas, orden, bloqueadas) están ligados a **IDs de tarea**, y un ID de tarea puede repetirse en otra captura. Por eso quien monte la jornada debe **identificarla por el contexto completo de la copia**:

```tsx
<ContinuityDay key={contextKey(context)} candidates={...} hints={...} ... />   // instalación + captura + fecha de captura + inicio + cuenta + generación
```

- Cambiar de instalación, captura o generación **cambia la clave** y el componente se monta de nuevo con estado vacío: ninguna decisión se atribuye a una tarea homónima de otra copia.
- Dentro de la misma copia, cambiar el tiempo o el filtro **conserva** las decisiones (probado en Node y DOM).
- Las pistas de resultados (`hints`) deben salir **del contexto correcto**: el montaje debe filtrar las operaciones del gestor por `contextKey` antes de emitir `{ taskId: estado }`.
- El montaje debe probar: misma ID de tarea en otra captura (estado nuevo, sin decisiones heredadas) y estados pendientes de la copia correcta.

## Qué falta para que la jornada sea completa en Hoy (y por qué no está hecho aquí)

1. **Estado y referencias de las tareas de Hoy.** La API de Hoy (`/api/v7/local-operations`) no trae `status` ni `references`. Mientras tanto `candidatesFromToday` es conservador: «Revisar datos» no se planifica sola y las referencias que faltan solo se detectan por el texto fijo de `nextAction` (una prueba contrasta ese texto con la cola real). Lo correcto es ampliar `shared/local-operations.ts` y `server/local-operations.ts` con esos dos datos (unidad aparte; no están reservados por 055/087 al escribir esto, comprobar de nuevo) y usar `candidatesFromQueue` equivalente.
2. **Responsable.** No hay dato real de responsable en la cola ni en Hoy. Sin `owners`, el filtro no aparece. Si la copia define un campo de responsable, añadirlo a la API y pasar el mapa `{ taskId: nombre | null }`.
3. **Persistencia.** Las decisiones (fijar, elegir, descartar, orden, estimaciones) viven en el estado del componente y se pierden al recargar. Persistirlas es el paquete de recuperación de intención, no esta unidad.
4. **Navegación.** Decidir si es una sección de Hoy (pestaña/disclosure bajo «Qué atender primero») o una vista aparte; no añadir otro elemento al menú principal.

## Contrato que no debe romperse

- El modelo (`shared/continuity-day.ts`) no accede a red, reloj ni almacenamiento y no muta sus entradas; las funciones de decisión devuelven objetos nuevos.
- «Ya no aparece en la cola» no se presenta como «completada».
- La vista imprimible es por lista blanca (orden, título, ID, minutos, arranque).
- **Saldo honesto (R2):** `usedMinutes` es el subtotal CONOCIDO; con tareas elegidas sin duración (`unknownDurations > 0`) el saldo (`remainingMinutes`) es `null` (indeterminado) y las propuestas automáticas posteriores son `provisional` y sin hora de comienzo. La lista imprimible usa la misma semántica.
- El plan reutiliza `buildRescuePlan`; si cambian los motivos de exclusión de ese módulo, `tests/continuity-day.test.ts` (primera prueba) lo detecta.

## Pruebas que el montaje debe añadir

Hoy real: abrir la ficha desde la jornada sin escribir, guardar una tarea elegida y verla salir de la cola sin perder el resto de decisiones, guardado incierto que marca la tarea como «por decidir», cambio de captura (los hints de otra copia no cuentan), y 1440/390/320 con la barra lateral real.
