# CLAUDE-CONTINUITY-DAY-205 · Jornada de continuidad (modelo y componente; aún no montada en Hoy)

5/11/2026, Europe/Madrid. Paquete 5 del encargo «Claude A». Bloque independiente que solo consume contratos aceptados (`buildResponseQueue`, `buildRescuePlan`). Sin navegador del usuario, MCP, proveedores, credenciales ni red externa; datos ficticios de `makeFixture`. Sin commits ni despliegues. **No toca** 171, la ficha, el gestor, Hoy ni App.

## Qué es y qué NO es

Convierte «tengo N minutos» en una selección editable: lo que fijas o eliges entra primero; el resto lo propone la heurística voraz de `buildRescuePlan` con las estimaciones que declaras. Responde en una pantalla a «qué puedo hacer en los próximos 30 minutos» y «qué requiere una decisión». **No guarda ni completa nada, no está montada en Hoy y el arnés no cuenta como montaje.** Las decisiones viven en memoria (se pierden al recargar).

## Modelo (`shared/continuity-day.ts`)

- Candidatos normalizados (`DayCandidate`) con dos adaptadores: **exacto** desde `ResponseQueue` (`candidatesFromQueue`, estado y referencias reales) y **conservador** desde las tareas de Hoy (`candidatesFromToday`: «Revisar datos» no se planifica sola; las referencias que faltan se detectan por el texto fijo de `nextAction`, comparado en una prueba con la cola real).
- Decisiones **separadas del cálculo** (`DayDecisions`: elegidas con marca de fijada y orden, descartadas, bloqueadas por el operador) con gestos inmutables (`pickTask`, `setPinned`, `moveTask`, `skipTask`, …). Cambiar presupuesto o filtro no las toca.
- `buildContinuityDay`: primero lo manual (fijadas, luego elegidas); **lo que desborda el tiempo se incluye y se avisa**, no se descarta; después `buildRescuePlan` sobre el tiempo restante (mismos motivos de exclusión) y los motivos propios `skipped-by-person`, `owner-filter`, `outcome-pending`. Duración desconocida: separada (`unknownDuration`) y no cuenta como cero. «Por decidir»: estado desconocido, referencia que falta, sin estimación, guardado pendiente, desborde.
- Filtro por responsable **solo si el llamador aporta el dato**. Pistas de resultados: **solo** `in_flight`/`uncertain` por ID (sin texto); una tarea con guardado pendiente no se planifica sola y, si la eliges, se avisa.
- `departedFromQueue`: elecciones que «ya no aparecen» (no se dice «completada»). `printableDay`: lista blanca (orden, ID, título, minutos, arranque).

## Componente (`src/ContinuityDay.tsx` + CSS)

Tiempo (15/30/60/120 o minutos propios, 1–480), resumen `role=status`, «Tu jornada» (cada fila con ID, bucket, origen —Propuesta/Elegida/Fijada—, estimación o «duración desconocida», motivo, avisos, campo de minutos, Abrir la tarea, Fijar, Subir/Bajar, Quitar), «Por decidir», «Fuera de la jornada» (con «Elegir a mano»/«Volver a incluir»), «Cómo leer esto» (estimación / elegida / guardada / finalizada) e «Imprimir la lista». El foco permanece en el mismo control tras mover o fijar. `onOpenTask(id)` entrega el ID; nada más sale del componente.

## Pruebas (sobre el corte final)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `tsx --test tests/continuity-day.test.ts` | **17/17** |
| Playwright `tests/e2e/continuity-day.spec.ts` (Chromium 1228, servidor HTTP efímero, tráfico externo abortado) | **12/12** |

Node: coincidencia con `buildRescuePlan`; fijar recalcula lo automático; desborde avisado y no descartado; **decisiones intactas** al cambiar 5 presupuestos × 3 filtros; entrada congelada; duración desconocida separada; referencias y estado; homónimas; reordenación sin cruzar grupos; gestos reversibles e inmutables; filtro sin dato; resultados pendientes sin datos del intento; salidas de la cola; presupuesto/estimaciones inválidos; lista blanca de impresión; cola REAL (adaptadores). DOM: 30 min sin inventar jornada, estimar desde «Por decidir», cambiar tiempo conservando decisiones, reordenar con teclado (foco estable), desborde, homónimas (aria-label con ID, `onOpenTask` correcto), valores inválidos, filtro solo con dato, estado vacío, **impresión emulada** (solo la lista blanca visible), 1440/390/320 sin desbordamiento y con objetivos ≥44 px; **0 peticiones de red** y ninguna apertura espontánea.

**Contrapruebas del modelo (8 mutaciones, todas detectadas):** descartar lo que desborda, fijadas no primero, ignorar resultados pendientes, filtrar sin dato de responsable, contar la duración desconocida como 5 min, imprimir con motivos, mutar las decisiones de entrada (esta sobrevivía; se añadió la prueba de inmutabilidad) y dejar de distinguir IDs duplicados. **Límite:** el componente no se mutó; el DOM se apoya en las aserciones de efectos y orden.

**Capturas abiertas e inspeccionadas:** `day-1440.png` y `day-320.png` en `tests/.tmp/c170/r205/` (390 generada, no abierta). Se vio una columna legible a 320, chips ajustados, botones de ancho completo y sin recorte. Tras verlas se añadió un marcador (▸/▾) a los desplegables «Fuera de la jornada» y «Cómo leer esto», que no se distinguían de un texto. Las capturas son anteriores a ese último ajuste de CSS (DOM repetido 12/12 después).

## Hashes (SHA-256)

| Archivo | SHA-256 |
|---|---|
| `shared/continuity-day.ts` | `f740140a0b20d96b672c46dd768e78a6bba8d8393942d0bccb8030a0301ff6fa` |
| `src/ContinuityDay.tsx` | `9003c19f51df79f3aa6c4303e2312207c87ced9b41f715c14accfd864e20e73d` |
| `src/continuity-day.css` | `9f34cd6f34602ee301210d24dc9127aae59dbce7c5afdd92f0043a0d01950969` |
| `tests/continuity-day.test.ts` | `1f6763e6b0d25226eacf7c876eac13e5efb73abaef206cbe772ba28fd14605c9` |
| `tests/e2e/continuity-day.spec.ts` | `2979d7016fa85472d8df764a59e244850f986c9e8a3a5500a0cdcfb56033b492` |

## Límites

- No está en Hoy. La fuente de datos de Hoy no trae estado ni referencias; no hay dato de responsable; las decisiones no persisten. Detalle y siguiente unidad en el handoff.
- Es una heurística voraz, no una optimización; las estimaciones son manuales y no se validan; el plan no demuestra que se ahorre tiempo.
- No se ha probado con lectores de pantalla reales ni con una impresora (solo emulación de medios `print`).

---

# R2 · respuesta al dictamen 208 (F1–F3 y criterio de montaje)

- **F1 · saldo indeterminado.** El modelo separa el **subtotal conocido** (`usedMinutes`), las **tareas elegidas sin duración** (`unknownDurations`) y el saldo (`remainingMinutes`, `null` = indeterminado). Con 30 min, una tarea elegida sin estimar y otra de 25: se conservan ambas decisiones; el resumen dice «25 min estimados + 1 tarea sin duración: el tiempo libre es indeterminado» (sin «5 min libres»); lo que sigue de la tarea sin duración pierde su hora de comienzo (`startMinute/endMinute = null`) y la propuesta automática se marca **«Provisional»** y deja de afirmar «Cabe en el tiempo restante». Lo ya estimado que pasa del tiempo sigue avisándose (cota inferior: «…como mínimo»). Al declarar la duración vuelve el saldo exacto, las posiciones y, si procede, el aviso de desborde. La lista imprimible usa la misma semántica («Estimado: 25 min + 1 tarea sin duración»; sin posiciones inventadas).
- **F2 · etiquetas.** El control de estimación usa un identificador **único por instancia** (`useId`), nunca derivado del ID de CRM: `segment/1` y `segment:1` ya no colisionan. DOM: `label.control` de cada fila pertenece a su fila, 0 IDs duplicados en el documento, clic en la etiqueta enfoca su propio campo y el nombre accesible corresponde a la tarea.
- **F3 · foco.** La restauración de foco compara el atributo **exacto** (`kind + ':' + id`) dentro del componente, sin construir un selector con el ID de CRM ni quitarle caracteres. DOM con `record"1` y `record1`: fijar, subir y bajar dejan el foco en el control de la ficha correcta.
- **Criterio de montaje.** El handoff documenta que la jornada debe identificarse por el **contexto completo de la copia** (`key={contextKey(context)}`), que las pistas deben salir del contexto correcto y que el montaje debe probar «misma ID en otra captura». Es un criterio pendiente, no un fallo observado.

**Pruebas sobre el corte R2:** `tsc --noEmit` limpio; Node **22/22** (17 + 5 regresiones de R2); DOM **16/16** (12 + 4 de R2); **tres casos del revisor reproducidos** (saldo, etiquetas, foco) en mi arnés. **Contrapruebas de R2:** ID de etiqueta derivado del ID de CRM (falla F2), selector que quita comillas (falla F3), saldo conocido con duración desconocida (falla el DOM de F1) y comienzo exacto de la propuesta provisional (la detecta Node; el DOM no lo observa porque la interfaz no muestra horas de comienzo). **Capturas abiertas:** `unknown-390.png` (nuevo resumen: «25 min estimados + 1 tarea sin duración…», chip «Provisional»); las de 1440/320 son anteriores a R2 y no se volvieron a abrir (el layout no cambió). La caja de resumen y las filas encajan en 390 sin recorte.

**Sigue siendo preparación**: no está montada en Hoy.
