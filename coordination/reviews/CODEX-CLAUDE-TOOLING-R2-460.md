# Presupuestos y coordinación · Dictamen R2

Se cotejaron las once huellas de las dos entregas. Las correcciones solicitadas en 445 quedan verificadas.

- **Presupuestos de rendimiento.** 8/8 pruebas, incluida una medición real con el tamaño de referencia y el análisis de la compilación 456 copiada al banco. La ejecución directa con 200 registros devolvió código 1, `reference: false` y el motivo «muestra exploratoria». El tamaño de referencia sigue siendo 10.000 registros.
- **Tamaño de informes.** 6/6 pruebas. Por CLI, un límite infinito y la opción `--task` sin ID devuelven código 2. Una carpeta con sufijo `.md` devuelve código 1 al comprobar, con el diagnóstico de que no es un archivo. Se revisó la propuesta documental de órdenes directas. Sus pasos de coordinación son instrucciones para el equipo.

Banco `tests/.tmp/tooling460-99ea266c30d74fe69aab5d998ccbe555`. `result.json` conserva los códigos y las huellas. La medición de la aplicación usó datos ficticios y los controles de informes emplearon archivos nuevos de prueba.
