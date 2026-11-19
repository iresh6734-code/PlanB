# Fechas de los resúmenes de tareas y oportunidades

El resumen ya no acepta un prefijo con apariencia de fecha sin validar el día. Antes, un 30 de febrero podía aparecer como un día de marzo. Se conserva un aviso distinto para una fecha ausente y para un valor imposible. La fecha prevista de cierre mantiene el día almacenado. En tareas, un valor con hora y zona se proyecta al día de Madrid antes de compararlo con hoy. Los días sin hora conservan su valor civil.

## Evidencia

- El código anterior falla las dos regresiones nuevas. Una desplaza el 30 de febrero al 2 de marzo. La otra llama vencida a una tarea cuyo instante corresponde a hoy en Madrid. La versión corregida cubre además 29 de febrero, hora imposible y cambio de día con horario de verano.
- 29/29 pruebas de fechas, cola y vistas guardadas. Tipos y Vite correctos en `tests/.tmp/finish435-sJELRR`. Las huellas de los archivos de esta entrega coinciden con el corte probado.
- En el navegador real, una fecha `2026-99-01` simulada en la respuesta GET de una oportunidad queda como «Fecha de cierre no válida» en su tarjeta y en la ficha a 320 y 390 px. La app usó datos ficticios y el backend aislado de 432. El servidor rechazó activar una copia con esa fecha en la primera preparación del ensayo. Se repitió con una base válida y solo se alteró la respuesta en Chromium. No hubo métodos de escritura ni errores de página. El recorrido móvil registra un 404 de ensayo separado en `/api/v2/relay/rehearsal`.

Esta unidad cambia la presentación de los resúmenes. El tratamiento de valores ilegibles en otros listados y editores requiere una comprobación propia. La instalación del usuario queda fuera del ensayo.
