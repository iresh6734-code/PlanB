# Ficha por tarea 123 · Traspaso a Codex (montaje) — versión corregida tras la revisión 131

## Contrato exacto

```ts
// shared/local-task-focus.ts
export interface TaskFocusProps {
  taskId: string;                                   // ID local de la tarea (no su nombre)
  onClose: () => void;                              // devuelve el control a la fila de Hoy; no efectúa cambios
  onSaved: (record: CrmRecord) => Promise<void>;    // «el registro quedó guardado/aceptado»; recargar la cola
  onPrepare: () => void;                            // abre el flujo existente de preparación (copia vacía o sin activar)
}
// src/LocalTaskFocus.tsx
export function LocalTaskFocus(props: TaskFocusProps): JSX.Element
// src/local-task-focus-client.ts (cambia respecto a la primera presentación)
verifyAfterUncertain(args: { taskId; baseline; patch; context?: TaskContext }, transport?): Promise<Verification>
//   Verification añade { kind: 'context-changed' }; sin `context` devuelve { kind: 'unknown' } (sin identidad no hay evidencia).
// Transport admite readTimeoutMs/writeTimeoutMs (por defecto 15 s / 30 s).
// TaskContext añade captureStartedAt, accountId y generatedAt; contextKey los combina con instanceId, snapshotId y capturedAt.
```

## Punto de montaje en la fila de Hoy

En `LocalOperations` (reserva de 118/117, no editada aquí):

```tsx
import { LocalTaskFocus } from './LocalTaskFocus.js';
const [focus, setFocus] = useState<string | null>(null);
// en cada fila de la cola (nombre accesible distinto por fila; hay homónimas):
<button type="button" onClick={() => setFocus(task.id)}>Abrir «{task.label}» ({task.id})</button>
// una sola instancia, al final de la vista:
{focus ? <LocalTaskFocus taskId={focus} onClose={() => setFocus(null)} onSaved={reloadQueueOrThrow} onPrepare={onPrepare} /> : null}
```

## Lista de integración verificable

1. **Abrir por ID, sin confundir homónimas.** Verificación: dos tareas «Llamar a Ana» con IDs distintos; cada fila abre su ID (la línea de contexto de la ficha muestra la ID y la fecha límite distingue).
2. **Reservar rutas exactas** antes de editar `LocalOperations` o `App` (reservas de 117/118/053); este traspaso no las concede.
3. **`onSaved` debe rechazar de verdad si la recarga falla.** `load()` de `LocalOperations` captura sus errores y no lanza; hace falta una variante que lance. Verificación: forzar un fallo de `GET /api/v7/local-operations` tras un PATCH confirmado → la ficha muestra «El guardado está confirmado, pero la cola de Hoy no se actualizó» y **sigue** mostrando el acuse. Si `onSaved` nunca resuelve, a los 20 s se declara «no se actualizó».
4. **Reintentar `onSaved` no escribe.** `onSaved` solo debe LEER. Verificación: contar PATCH en el servidor tras pulsar «Reintentar la actualización» varias veces: no cambia. `onSaved` debe ser **idempotente** (puede llamarse varias veces por el mismo registro).
5. **Foco útil si el botón desaparece.** Si al completarse la tarea sale de la cola, el botón que abrió la ficha ya no existe y `Modal` no puede devolverle el foco. Mover el foco al encabezado de la cola o a la fila siguiente tras `onClose`. Verificación: guardar «Completada», volver, `document.activeElement` ≠ `body`.
6. **No cambiar `taskId` con un borrador abierto sin pasar por la protección de cierre.** Cambiar `taskId` descarta borrador y respuestas anteriores sin preguntar (lo prueba «cambio de tarea con borrador»). Con `Modal` el fondo queda cubierto, pero un cambio programático lo evita: cerrar y abrir, o preguntar antes. Un PATCH en vuelo de la tarea anterior no bloquea a la nueva (D2 corregido) y su resultado, si confirma, llega igualmente a `onSaved`.
7. **Barra lateral real, ficha y foco a 1440, 390 y 320 px.** Las pruebas actuales usan un arnés con barra lateral vacía. Verificación en la App real: sin desbordamiento, controles ≥ 44 px a ≤ 600 px, foco dentro del panel mientras guarda y de vuelta al disparador al cerrar.
8. **Tarea con fecha-hora en el DOM.** Cubierto en la QA-130 con una fixture ficticia modificada (campo `datetime`, Auckland y Los Ángeles). Repetir en la App real si su especificación tiene ese tipo.
9. **Lo probado con la API actual frente a lo que exigiría 128.** Probado: PATCH parcial, comprobación previa no atómica, acuse perdido incierto, contexto ligado a instalación/captura/fecha/cuenta/generación. NO probado ni prometido: CAS, idempotencia, protección multi-proceso. 128 (`GET/PATCH /api/v7/task-revision/:id`, `expectedRevision`, 409 con `details.code='TASK_REVISION_CHANGED'`, `changed:false` sin fila extra) cambiaría el consumidor así: guardar `revision` con el registro leído; enviar `expectedRevision`; distinguir 409 de revisión (conservar borrador y comparar «lo que viste / lo que escribiste / lo actual») de otros 409 (devolución en curso); reemplazar la comprobación previa por la del servidor, sin reintento automático; seguir necesitando `/api/v2/state` para el esquema y el contexto; y una lectura posterior seguiría sin probar autoría. Garantía propuesta por 128: un único proceso escritor dueño del `Store`. Es una unidad futura con reserva propia; **no se adopta aquí**.
10. **No mostrar «conectado», «sincronizado» o «guardado» sin evidencia concreta.** La ficha distingue tres cosas: «Cambios guardados» (el servidor devolvió el registro), «Estado leído y aceptado por ti» (decisión humana tras un acuse perdido; el servidor no confirmó) y «la cola de Hoy no se actualizó». El montaje no debe sustituirlas por un «guardado» genérico ni marcar la cola como actualizada sin releerla.

## Reglas de integración (resto)

- `onSaved` también se llama (a) cuando la persona acepta el estado leído y (b) aunque la ficha ya se haya cerrado o cambiado de tarea si el PATCH confirma después. No asumir que el panel sigue montado.
- **D7 (límite abierto):** si se cierra la ficha con un PATCH en vuelo y la respuesta se pierde, nadie recibe acuse ni incertidumbre y la cola puede quedar vieja. La ficha lo avisa antes de salir («no se puede cancelar… no sabrás el resultado»); resolverlo del todo requiere un contrato nuevo (p. ej. `onUncertain`).
- `onPrepare` se usa para copia vacía y copia importada sin activar; la ficha no activa nada por sí misma.
- Estilos: `src/local-task-focus.css` (clases `ltf-*` y `.modal*:has(.ltf)`); no hay CSS global nuevo ni cambios en `components.tsx`.
- Sin rutas nuevas: usa `/api/health`, `/api/v2/state`, `/api/v2/records/tasks/:id`, `PATCH /api/records/tasks/:id`. Las lecturas están acotadas por flujo (1 MiB; 8 MiB el estado) y con tiempo límite.

## Qué recarga cada parte

Lecturas de la ficha: salud + estado (dos veces) + registro, con cancelación, tiempo límite y descarte de respuestas antiguas. Tras guardar, la ficha NO relee la tarea: confía en el acuse del PATCH (`{record}`) y deja la recarga de la cola a `onSaved`.

## Restricciones y límites (heredados del backend)

Sin comparación de versión ni idempotencyKey: dos pestañas sobre el mismo campo → gana el último guardado; la ficha solo avisa de lo ya cambiado antes de enviar (reproducción: «edición concurrente… NO es atómico»). Guardar exige copia activada (409 si no). Cada PATCH deja una fila en `changes`, aunque no cambie nada.

## Verificación pendiente de 117/120/121

En la App real: el callback de recarga que rechaza, el foco con la fila desaparecida, el ancho con la barra lateral, y que la cola refleja el estado nuevo. Este traspaso no declara la app actualizada.
