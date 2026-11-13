# Guion repetible · Hoy → Organizar mi jornada → tarea exacta

9/11/2026, Europe/Madrid. Autor: Claude A. Observado en el navegador integrado de Claude sobre `http://127.0.0.1:4601/` (instalación ficticia de Codex, «Agencia Norte», datos de ensayo, copia del 7/11 con 62 registros). **Es una observación de lectura**: no se guardó nada, no se tocó la instalación y no se acredita su identidad de proceso/corte (la acredita quien la sirve; el recibo de 299 manda).

## Guion (cada paso es repetible por la persona)

| # | Acción | Resultado observado |
| --- | --- | --- |
| 1 | Menú lateral → **Hoy** | Cabecera «Agencia Norte · Copia activa · Datos ficticios», 6 vencidas, 2 próximas 24 h, 18 tareas. Junto a «Qué atender primero» aparece el botón **Organizar mi jornada** |
| 2 | Pulsar **Organizar mi jornada** | Se abre la «Jornada de continuidad». Texto: «Cola leída a las HH:MM: 14 tareas abiertas o por revisar en la copia, 14 en esta lista» (cobertura completa, sin aviso de recorte). Con 30 min: «0 tareas (0 min estimados, 30 min libres). 14 tareas piden una decisión» |
| 3 | Escribir **20** en los minutos de *Revisar los detalles · Pablo* (task-2) y **25** en *Llamar para seguimiento · Ana* (task-3) | Con 30 min: «1 tarea (20 min estimados, 10 min libres)». La de 25 no cabe y no desaparece |
| 4 | Elegir **60 min** | «2 tareas (45 min estimados, 15 min libres)». Las cifras salen de lo que declaraste, no de la cola |
| 5 | En una tarea sin duración (task-4) pulsar **Incluir igualmente** | «3 tareas (45 min estimados + 1 tarea sin duración: el tiempo libre es indeterminado)». Lo desconocido no cuenta como cero |
| 6 | Pulsar **Abrir la tarea** de task-3 | Ficha de *Llamar para seguimiento · Ana* abierta por su ID exacto |
| 7 | **Escape** | La ficha se cierra, el foco vuelve al botón exacto de esa fila y el plan (estimaciones y selección) sigue intacto |

## Peticiones observadas (solo lectura)

Toda la sesión fue `GET`: `local-operations/work`, `local-operations`, `health` + `v2/state` (la comprobación de identidad completa de R3) y, al abrir la ficha, `v7/task-revision/task-3` y los registros relacionados. **Ningún `PATCH`, `POST` ni `PUT`.** (Una lectura de `v2/state` aparece abortada por la propia navegación al abrir la ficha.)

## Qué NO está verificado aquí

- Guardado condicionado, conflicto de revisión, foco cuando la fila desaparece, resultado «por decidir», mismo ID en dos capturas, cambio solo de generación, fallo de confirmación y recuperación con «Actualizar»: se prueban en **candidata propia** con `tests/e2e/hoy-cola-jornada.spec.ts` (25/25 ×3), `hoy-ficha-condicionada.spec.ts` (14/14) y `hoy-por-decidir.spec.ts` (7/7). No se ejecutan sobre 4601.
- 390 y 320 px: el banco de A3 los cubre con capturas; esta observación fue a 1024 px.
- Que 4601 sirva exactamente el corte de A3 R3: lo declara el recibo de 299 (Codex), no esta lectura. Solo se comprobó que el botón y los textos de R3 están servidos.

## Decisión vigente

Cerrar la Jornada descarta las estimaciones en memoria. Persistirlas necesitaría un contrato (alcance, caducidad, borrado visible, qué ocurre al cambiar la cola): unidad posterior, no incluida.
