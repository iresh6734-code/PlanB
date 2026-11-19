# Estado coherente al restaurar otra copia

`/api/state` y `/api/v2/state` devuelven la captura, el esquema y la identidad de una sola lectura coherente. El servidor usa la misma versión de SQLite que las rutas de búsqueda. Si la versión cambia durante una lectura, repite la consulta una vez. Si vuelve a cambiar, responde 409 sin publicar un estado parcial. El formato completo y el compacto conservan sus respectivos contratos.

En SQLite cifrado con datos ficticios, una segunda conexión restauró una copia con el mismo ID y fecha mientras se construía la respuesta. El servidor anterior devolvió 200 con la captura de la cuenta A y la identidad de B en ambas rutas. La corrección devolvió en ambas la captura, el esquema y la identidad de B. Al dirigir un cambio en cada intento, la respuesta fue 409 y la siguiente consulta estable funcionó. El servidor que atendió GET no escribió filas.

Las tres regresiones fallan con el servidor anterior y pasan ahora. Pasaron 46/46 pruebas relacionadas de estado, búsqueda, contratos, acceso y evidencia. La primera ejecución detectó una prueba de evidencia que fijaba el número de accesos internos a la identidad. Se reprodujo antes de esta corrección y se ajustó en 461 sin cambiar el servicio de evidencia.

Se compartió la lectura de versión por la reserva 207. Los logs `tests/.tmp/state459-before.log` y `tests/.tmp/state459-final.log` conservan los resultados. La comprobación empleó las rutas Fastify reales y bases nuevas de prueba.
