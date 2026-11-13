# Revisión de tarea · una lectura por metadato (206)

5/11/2026, 17:23:17, Europe/Madrid. Presentada para revisión independiente.

La ruta de revisión deserializaba la captura y el esquema para construir el token y volvía a leerlos al consultar `Store.ready`. En el guardado sin cambios también releía el esquema para validar los nombres de campo. Ahora comprueba la generación aprobada y la conciliación completa sobre los mismos metadatos que usa para calcular la revisión. La validación de campos usa el esquema de esa lectura. Después de un cambio efectivo se vuelve a leer para devolver la revisión resultante.

La serialización del token conserva el formato, el orden de las propiedades y todas sus entradas. Se mantienen las barreras del plan de devolución, revisión obsoleta, validación y sesión. La condición de activación de la ruta refleja `Store.ready`. Un cambio futuro de esa condición debe comprobar ambas rutas. La edición se acota al registrador de revisiones, con una prueba de la API y este informe.

## Evidencia

Corte `tests/.tmp/rev206-1d81a904`, con huellas de fuentes y pruebas en `result.json`. En el baseline 185, el GET leía 2 veces captura, esquema y generación, y 1 vez conciliación. El PATCH sin cambios leía 2, 3, 2 y 1 respectivamente. Las dos nuevas regresiones fallaron por aserción y el control de activación pasó. En la corrección, ambas rutas leen cada metadato una vez y el PATCH idéntico mantiene cero cambios. Token fijo idéntico antes y después: `e40bcc32f6afab2ee975967ef5ced0528957d354e37f04d4737736b679431c59`.

Se probaron 57 casos distintos en siete suites. La primera pasada dio 55 verdes y dos fallos de transporte local. Uno registró `connect EACCES` y el cliente de la otra prueba devolvió `failed`. Se repitieron exactamente esas dos pruebas sobre el mismo corte con permiso de loopback y pasaron. El typecheck focal pasó. Logs `baseline.log`, `final.log`, `loopback.log` y `typecheck.log`. El primer tanteo de conteo observó también el tick inicial de Continuidad. La prueba final espera su turno antes de instrumentar la ruta.

La medición alternó 30 lecturas por variante en el mismo proceso, con una copia en memoria de 10000 registros y 2023295 bytes serializados. Mediana de 153.6 a 95.5 ms. Percentil 90 de 175.4 a 122.4 ms. Las respuestas completas coinciden y el historial conserva cero cambios. Es una medición de este ensayo, con mayor fuerza causal en el conteo de lecturas que en los tiempos. La latencia de disco, cifrado o navegador queda fuera de la medición.

La demo 202 conserva el corte 193. Este cambio está pendiente de revisión independiente antes de montar un corte nuevo.
