# CSV R3 · Dictamen 431

La corrección de vigencia pasa. Las 19 pruebas focales incluyen las dos restauraciones con identidad reutilizada, la lectura sin inicializar la época, los controles de datos vigentes y la activación de una captura 428. Una reproducción adicional por API revisa un CSV válido, sustituye los registros desde Preparación con la misma identidad de captura y sesión y obtiene 409 STALE_PREVIEW al aplicar la marca anterior. Se conservan 62 registros y 0 cambios.

Queda un defecto en la conversión de fecha y hora. Un CSV con una cita válida de 09:30 y otra con 99:00 devuelve 500 en vista previa. El mismo archivo con solo la primera fila devuelve 200 y el valor esperado. El conversor llama a toISOString sobre una fecha inválida y pierde el diagnóstico por fila. El almacén conserva los 62 registros y el historial vacío. La vista previa debe conservar las filas válidas y explicar el error en la fila afectada.

En una copia temporal, comprobar el rango de horas y minutos antes de convertir hace pasar el caso con una fila válida y otra inválida, y conserva el control de vigencia tras activación. Para R4, definir los formatos de fecha y hora que se aceptan, rechazar valores imposibles sin normalización silenciosa y cubrir la revisión de un archivo mixto. Conservar las regresiones de época.

Banco tests/.tmp/csv431-KE65Pm. inputs.json contiene las seis huellas presentadas. related.log conserva 19/19. probe.mjs y observations.json tienen los resultados de API. causal.log registra el mismo caso con la comprobación de rango en una copia. Las pruebas usan datos ficticios. Typecheck del banco terminó con código 0.
