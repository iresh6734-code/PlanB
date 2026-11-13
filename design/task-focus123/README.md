# Ficha por tarea 123 · Notas de diseño (versión corregida tras la revisión 131)

Panel lateral de la tarea elegida en Hoy. Lenguaje visual existente (tokens de `planb-ui.css`, `Modal side`, `ReferenceSelect`); sin cambios en DESIGN.md.

## Estructura

Cabecera (asunto, máximo 3 líneas) → línea de estado («Guardando…») → línea de contexto (ID, copia, fecha de captura en Madrid, ensayo/producción) → avisos → formulario (campos de la especificación) → «Cómo se guarda» y «Reglas que se aplican» plegados → pie fijo (Cancelar · Guardar cambios).

## Estados

| Estado | Qué se ve | Acciones |
| --- | --- | --- |
| Leyendo | «Leyendo la tarea…» (error con reintento a los 15 s) | — |
| Error de lectura | motivo (sesión bloqueada, demasiado grande, tardó demasiado…) | Reintentar · Volver a Hoy |
| Copia vacía | explicación | Continuar la preparación · Volver a Hoy |
| Sin activar | valores en lectura, sin formulario | Continuar la preparación · Volver a Hoy |
| Tarea inexistente | «ya no existe»; lo escrito, listado, no guardado | Volver a Hoy |
| Edición | formulario; «Guardar» con `aria-disabled` si no hay cambios | Guardar · Cancelar |
| Aviso de campos / 422 / 409 / 401 / conflicto | banner con foco; el borrador se conserva | Guardar de nuevo (decisión humana) |
| Copia cambiada | «Esta ficha ya no corresponde a la copia actual»; Guardar bloqueado | Cerrar |
| Acuse incierto | «No se sabe si el guardado llegó a aplicarse» + resultado de la lectura (aplicado / sin cambios / otra edición / otra copia / no comprobable) | Aceptar el estado leído (solo si coincide) · Volver al formulario · Comprobar de nuevo · Cerrar sin guardar |
| Guardado confirmado | «Cambios guardados · El servidor confirmó…», antes → después | Volver a Hoy · Seguir editando |
| Estado aceptado por la persona | «Estado leído y aceptado por ti · el servidor **no confirmó** tu envío» | Volver a Hoy · Seguir editando |
| Cola sin actualizar | aviso persistente («la cola de Hoy no se actualizó»), también tras «Seguir editando» | Reintentar la actualización |
| Salir con cambios | «Hay cambios sin guardar… Nada se ha enviado.» | Seguir editando · Descartar |
| Salir con guardado en curso | «Hay un guardado en curso… no se puede cancelar… no sabrás el resultado» | Seguir aquí · Salir de todos modos |
| Salir con resultado incierto | «El resultado del guardado es incierto… puede haberse aplicado» | Seguir aquí · Salir de todos modos |

## Accesibilidad

Foco al panel al abrir y de vuelta al disparador al cerrar (`Modal`); al guardar, el foco pasa a una región de estado dentro del panel (no se salta al fondo); tras un error, al primer campo afectado o al aviso; tras guardar, al encabezado del acuse. El botón de guardar usa `aria-disabled` para no perder el foco. Objetivos ≥32 px (≥44 px a ≤600 px) en los controles del módulo. `prefers-reduced-motion` respetado.

## Verificación visual

`tests/.tmp/taskfocus123-<UUID>/shots/` (ruta concreta en el informe), 1440/390/320 con asunto largo sin espacios, y `f4-en-vuelo.png`; contra un arnés de Hoy, no la App real.
