# CLAUDE-HOY-POR-DECIDIR-A2 · «Por decidir» en Resultados

6/11/2026, Europe/Madrid. Unidad propia de la fase A2: **no toca** la ficha, el host ni `LocalOperations.tsx` (en revisión en su unidad). Sin red ni datos reales; raíces nuevas, SQLite de archivo, red exterior bloqueada. Sin commits ni despliegues.

## Qué hace

El panel de **Resultados de guardado** (el mismo gestor, la misma superficie junto a Hoy) ofrece un filtro de dos botones con `aria-pressed` y recuentos: **«Todos (n)»** y **«Por decidir (m)»**. «Por decidir» agrupa por la **acción disponible**, que es distinta en cada caso:

| Grupo | Qué contiene | Acciones que ofrece |
|---|---|---|
| Sin saber si se aplicó | resultado **incierto** | Comprobar ahora (solo lee), aceptar el estado leído si la lectura lo muestra, Abrir la tarea |
| No se aplicó | **rechazado** (409, 422…) o **no enviado** | Abrir la tarea (recupera lo escrito); Reenviar solo si consta que no salió |
| Lista sin actualizar | confirmado o aceptado con la recarga de Hoy **fallida** | Reintentar la actualización (solo lee) |
| En curso | envío ya salido, sin respuesta | nada que decidir; Abrir la tarea |

Los confirmados sin incidencias y los descartados **no** están en ningún grupo: solo se ven en «Todos». El recuento de «Por decidir» no incluye «En curso». Sin decisiones: «Nada por decidir ahora. Los resultados ya resueltos siguen en «Todos»». «Abrir la tarea» entrega tarea e intento exactos (adopción de 219, sin cambios). El filtro vive en el estado del panel, que sigue montado al navegar: tras ir a otra pantalla y volver se conserva.

## Pruebas (App compilada, servidor real con revisiones, SQLite de archivo; recuentos del servidor)

`hoy-por-decidir.spec.ts`: **7/7 en tres ejecuciones seguidas sin reintentos**.

| Prueba | Observado |
|---|---|
| **Mezcla**: task-2 incierto, task-3 rechazado (422 que llega con la ficha cerrada), task-4 confirmado con la lista fallida, task-5 confirmado limpio | «Todos (4)» y «Por decidir (3)»; cada tarea en SU grupo con SUS acciones y sin las ajenas; task-5 solo en «Todos»; el foco no salta al alternar; el servidor vio 3 PATCH aplicados (task-3 no llegó), 0 legados |
| **Abrir desde el filtro** | task-3 abre con lo escrito recuperado en la tarea correcta (no en la homónima), «Se restauró lo que escribiste» y «El aviso sigue en Resultados»; cerrar, ir a Continuidad y volver conserva filtro y avisos; task-2 incierto se reabre con su intento, la verificación es una lectura y **0 PATCH nuevos** |
| **Mismo ID en otra captura** con dos resultados pendientes | la ficha de task-3 recupera SU intento (no el de task-2); tras cambiar de captura, abrir task-2 muestra «Ese resultado es de otra copia», la ficha trae los valores de la captura vigente, **0 PATCH** y el resultado ajeno sigue visible (no se adopta ni se descarta) |
| **En curso y no enviado** | el envío retenido aparece en «En curso» sin contar como decisión; liberada la barrera pasa a confirmado y sale del filtro; un guardado cuya comprobación previa falla va a «No se aplicó» con 0 PATCH |
| **Teclado y 390/320 px** | Tab/Shift+Tab, Enter y Espacio alternan sin perder el foco; objetivos ≥ 44 px; contraste de los botones ≥ 4,5:1 una vez asentadas las transiciones; sin desbordamiento; capturas abiertas e inspeccionadas |
| **Sin decisiones** | «Por decidir (0)» con el texto vacío; «Todos» conserva el confirmado |

- **Causal (4 mutaciones sobre la App compilada, todas detectadas):** grupo «lista sin actualizar» eliminado, «no enviado» fuera de «No se aplicó», «En curso» contado como decisión y filtro invertido. (Dos sobrevivían a la primera versión de la prueba —faltaba un caso de «no enviado» y otro «en curso»— y se añadieron.)
- **Hallazgo de la inspección visual:** la primera captura mostraba el botón activo con colores a medias porque se tomó dentro de la transición de 0,15 s; la medición de contraste y la captura esperan a que asiente (mi error de la prueba, no del producto).
- **U1 (huella):** las **7 pruebas Node** (`task-focus-outcomes`) y **40 especificaciones de navegador** del panel y de la ficha (`task-focus-outcomes` y `task-save-outcome`, 1440/390/320) se repitieron **antes** de renovar la huella; luego se renovó solo la de `TaskSaveOutcomes.tsx` y su CSS (**sustituye a `CLAUDE-TASK-PINS-220`**, que queda sin objeto) y una aserción estática se hizo tolerante a CRLF/LF. `task-focus-outcomes`, `task-outcomes-host` y `task-focus-followup` 27/27. `tsc --noEmit` limpio.

## Corrección sobre las terminaciones de línea (importante)

En mis informes anteriores (233, 230, 208, A2, A3, arnés) escribí que «el árbol de trabajo está en CRLF». **Era falso**: la comprobación que usé (`grep -c $'\r'`) no distingue en esta shell y daba todas las líneas. Con un contador exacto, el árbol es **mayoritariamente LF** (p. ej. `src`: 81 solo-LF, 26 solo-CRLF, 6 mixtos). El archivo original de `LocalTaskFocus.tsx` era LF. Convertí a CRLF, sin necesidad, los archivos de mis unidades anteriores. Consecuencias y estado:

- Esta unidad (`TaskSaveOutcomes.tsx`, su CSS, el test y los nuevos) está en **LF**, como el original.
- Las unidades **ya presentadas** (A2, adaptador A3, arnés) conservan sus bytes CRLF porque están en revisión y sus huellas son coherentes entre sí; **recomiendo normalizarlas a LF en una unidad posterior** (o al aceptarlas) y que las huellas de A2 (`task-focus-followup`) se recalculen entonces. Las unidades **aceptadas** (233, 230, 208) también quedaron en su mayoría en CRLF (por ejemplo `server/local-operations.ts`, `shared/task-intent-journal.ts`; `shared/task-save-outcome.ts` está en LF) y sus huellas están fijadas en pruebas: no las he tocado.
- El efecto visible fue una aserción estática de la ficha que esperaba `}\n`; ya es tolerante.

## Límites

- No hay filtro por «contexto activo»: el gestor es de la sesión y la adopción ya rechaza un intento de otra copia (probado), pero el panel no separa visualmente lo ajeno.
- «Por decidir» no persiste tras recargar ni reiniciar (A4); el seguimiento sigue en memoria.
- No se probó con lector de pantalla; sí teclado y 390/320 px.
- 36 pruebas antiguas con la App real y servidor sin `taskRevisions` siguen rojas por configuración (hallazgo de A2); no es de esta unidad.

## Huellas

El informe no puede contener la suya; las de los archivos están en la nota de presentación.
