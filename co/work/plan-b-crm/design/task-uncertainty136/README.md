# Seguimiento de guardados de tareas · Notas de diseño (unidad 136)

Superficie `TaskSaveOutcomesPanel`: región persistente («Resultados de guardado») que debe permanecer montada mientras la ficha se abre y se cierra. Lenguaje visual existente (tokens de `planb-ui.css`, botones `.button`, avisos con la paleta de estado); sin cambios en DESIGN.md.

## Estructura

Título «Resultados de guardado» → una fila por operación → nota fija del límite («solo mientras esta ventana siga abierta; no se guarda nada en el navegador»).

Cada fila: caja de estado (título + líneas + «Intento n · hora de Madrid») → «Lo que escribiste (solo en esta ventana)» plegado (rechazado, no enviado e incierto) → acciones.

## Estados y acciones

| Estado | Tono | Qué afirma | Acciones |
| --- | --- | --- | --- |
| En curso (comprobando) | info | «Todavía no se ha enviado nada» | — |
| En curso (enviado) | info | «El envío ya salió y no se puede cancelar» | — |
| Confirmado | éxito | «El servidor devolvió la tarea» + estado de la cola | Entendido |
| Confirmado, cola sin actualizar | aviso | el guardado sigue confirmado; Hoy puede mostrar lo anterior | Reintentar la actualización (solo lee) · Entendido |
| Confirmado, esperando vista de Hoy | info | la cola se actualizará al volver a Hoy | — |
| Aceptado por ti | info | «el servidor no confirmó tu envío» | Entendido |
| Rechazado (4xx) | peligro | el servidor no escribió; campos y motivos | Abrir la tarea · Descartar aviso |
| No enviado | aviso | no salió ningún guardado | Reenviar el guardado · Abrir la tarea · Descartar aviso |
| Reintento rechazado (R2) | aviso | «No se reenvió: esta tarea ya tiene un guardado en curso o sin resolver»; el intento sigue disponible | — |
| Incierto | aviso | «No se sabe si se guardó»; sin reenvío automático | Comprobar ahora · Aceptar el estado leído (solo si coincide) · Reenviar (solo si «sin cambios») · Descartar (pide confirmar) |

La evidencia de «Comprobar ahora» se redacta aparte: *aplicado* («no distingue si lo aplicó tu envío o una edición idéntica»), *sin cambios*, *otra edición*, *otra copia* («no sirve como evidencia»), *tarea inexistente*, *sesión bloqueada*, *no se pudo leer*.

## Accesibilidad

Los avisos que requieren atención usan `role="alert"`; el resto, `role="status"`. Cada botón lleva el nombre de su tarea («Comprobar ahora: Llamar a Ana (task-2)») para que haya homónimas distinguibles. `aria-disabled` en lugar de `disabled` mientras se verifica (el foco no se pierde). Descartar un seguimiento sin resolver pide una confirmación explícita. Objetivos ≥32 px (≥44 px a ≤600 px); `prefers-reduced-motion` respetado.

## Verificación visual

`tests/.tmp/taskuncertainty136-<UUID>/shots/superficie-1440|390|320.png` (ruta concreta en el informe), contra un arnés de Hoy, no la App real.
