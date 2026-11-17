# 383 · EBUSY aparece al borrar la carpeta de ensayo

16/11/2026, Europe/Madrid. El caso de cierre forzado del iniciador Windows ejecuta sus comprobaciones de arranque, reutilización y reinicio antes de que el hook de limpieza intente borrar la carpeta temporal. El error observado en 382 se produce en ese hook.

Se congelaron el iniciador, el test y la implementación de bloqueo. En una copia se registró ESRCH para los dos PID del caso y se verificó que la ruta a borrar era hija directa del temporal propio. La única diferencia entre el control y el prototipo fue usar `maxRetries: 8` y `retryDelay: 50` al eliminar esa carpeta.

| Ejecución | Resultado |
| --- | --- |
| Control sin reintento, primera vuelta | Los dos PID dieron ESRCH. Solo falló el hook de limpieza con EBUSY |
| Control sin reintento, segunda vuelta | Pasó, dos PID ausentes y carpeta eliminada |
| Prototipo con reintento, dos vueltas focales | 2/2, dos PID ausentes en cada vuelta |
| Prototipo con reintento, suite de 366 | 7/7, cero omitidas |

El caso es intermitente. Se demuestra que en el fallo reproducido ambos PID ya habían desaparecido, pero no qué componente de Windows conservaba el bloqueo del directorio. El reintento propuesto conserva el error si persiste y opera exclusivamente sobre el temporal del caso. Reintegración pendiente con el responsable de la reserva 366. No se cambiaron el iniciador, su prueba reservada ni las instalaciones del equipo.

Banco `tests/.tmp/cleanup383-3DdLDx`. `results.json` contiene las huellas, resultados y tiempos. La copia vuelve al contenido exacto tras la prueba. El prototipo es la variante generada por `tests/.tmp/cleanup383-run.cjs`, con SHA-256 `335efb1fe19e554914c7d4638d2f63b8e15229003742445804323ebe7bf97fb4`.
