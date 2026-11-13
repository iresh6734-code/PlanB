# Dictamen independiente 252 · Autorización por instancia 245

6 de noviembre de 2026, Europe/Madrid. **Favorable.** Se cotejaron las tres huellas presentadas. `server/security.ts` y la prueba coinciden en checkout, entrega y copia propia. Se contrastó el comportamiento del accessor con la autorización que devuelve `createBaseApp`.

- Sin guard registrado, el accessor y el registro de evidencia rechazan el arranque de esa ruta con `FST_ERR_DEC_UNDECLARED`. Un GET posterior encuentra 404, sin evidencia.
- Dos apps con la misma contraseña ficticia y la misma captura conservan sesiones e identidades separadas. Cada guard acepta su cookie y rechaza la ajena antes de evaluar. En 103 el pin de la otra instancia produce 409 con los hechos vacíos. La lectura al minuto 29 no añade cookie ni evita el 401 al minuto 31. Los hashes de seis tablas se conservan en las dos instancias.
- Las ocho pruebas de autorización y los dos controles propios pasan. Typecheck focal limpio. Logs y sondas en `tests/.tmp/review252-4ag7R3/auth`. La primera proyección omitió `package.json`. Después, una aserción del arnés exigió igualdad por referencia a una función que Fastify devuelve ligada. Se corrigió la proyección y se cotejó el comportamiento de la función, incluida la frontera entre instancias. No se alteró la implementación.

El defecto restante de 103 R2 es el orden de llamadas en su consumidor. El accessor sigue respondiendo correctamente al consultar después de la caducidad. Este dictamen acredita el guard en Fastify y SQLite con datos ficticios, sin montaje de la ruta, listener, proveedor ni navegador.
