# Revisión de contratos, rendimiento y herramientas de coordinación

Se congelaron las trece huellas presentadas por las tres entregas. Se usó el código de la candidata inicial de 444, con los archivos entregados cotejados en la copia y el checkout, incluidos los documentos y el JSON de presupuestos que el empaquetador excluye. Los bytes del frontend se cotejaron antes de usarlos en la prueba de tamaño. Banco `tests/.tmp/tooling445-TYnJtD`.

## Contratos de API

Dictamen favorable a las pruebas entregadas. Pasan 11/11 con la app real en memoria. Comprobé de forma independiente que el filtro de tareas tiene un resultado y no pasa por una lista vacía. El literal numérico no finito enviado como texto JSON a un campo numérico real de una oportunidad recibe 422. El caso original que usa un objeto JavaScript con `Infinity` lo serializa a `null`, por lo que ese caso no acredita por sí solo el rechazo de un número no finito. La comprobación independiente sí lo cubre. El dictamen se limita a ese servidor congelado.

## Rendimiento

7/7 en el banco, incluida la prueba del paquete que suele omitirse cuando no hay compilación. La herramienta compara los tiempos, pero la decisión de aprobación ignora el tamaño de la muestra. Con un presupuesto de 10.000 registros, un resultado para 200 puede quedar sin ningún exceso. Pedir R2 para que el modo de comprobación exija el tamaño de referencia, o identifique de forma inequívoca la medida como exploratoria y no dé un aprobado. La configuración sigue permitiendo pruebas manuales con otros tamaños.

La generación con el tamaño previsto produce 1.500 empresas, 5.000 clientes, 2.000 oportunidades, 1.500 tareas y 12.000 enlaces. El informe cuenta 6.500 clientes y 14.000 enlaces. Corregir las cifras. Revisar las mediciones como evidencia del entorno observado, sin convertir los techos en objetivos de producto.

## Documentación y tamaño de informes

Las tres pruebas de G3 pasan. En un directorio de prueba reproduje tres aprobaciones incorrectas o errores de uso silenciados: `--limit Infinity --check` aprueba un informe de 31 KiB, una ruta explícita a un directorio `directory.md` se cuenta como informe y se aprueba, y `--task` sin ID cae en el análisis general. Pedir R2 con límite finito, rutas de archivos regulares y validación de argumentos requeridos. G2 y G4 quedan como propuestas documentales. Los archivos históricos no se movieron.

Salida de comprobaciones adicionales en `tests/.tmp/tooling445-TYnJtD/probe-vvDjgD/result.json`. Se usaron datos ficticios y se bloqueó la red externa.
