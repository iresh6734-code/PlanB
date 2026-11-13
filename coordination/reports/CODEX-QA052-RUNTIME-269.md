# 269 · QA052 F1 en el servidor compilado de Plan B

6 de noviembre de 2026, Europe/Madrid. La corrección de QA052 se verificó en el ejecutable de la candidata aceptada 263. Se usaron los mismos bytes de `build/server.mjs` y de sus 15 activos en una instalación nueva con SQLite de archivo. Los procesos de prueba tenían puertos propios y salida de red externa bloqueada.

## Corte y prueba

- Ejecutable SHA-256 `19392014f8213a4c1e2ab855216bcbfedbc76dc8e79b7be797fcde0cb3bd19cd`. Las huellas de `server/store.ts` y `server/recovery.ts` coinciden con las de 055 aceptada. Se cotejaron además Crypto, preflight y generador de datos del corte.
- Se generó un espacio ficticio en memoria con una modificación y un alta de contacto. El simulador de devolución creó el plan. La fuente del plan tiene el identificador de HubSpot requerido por el formato portátil y sus lecturas se resolvieron en memoria.
- Se repitió el caso QA052 con los estados de plan `review`, `approved`, `partial` y `complete`, cada uno con su primera operación en `sending`. El verificador reconoció una operación incierta por copia. Las cuatro copias cifradas se restauraron por la API protegida con 200.
- La exportación cifrada de cada restauración conservó la captura, el plan, la identidad de sus operaciones, los registros, el mapa, el watermark y las dos filas de historial. En las cuatro, el plan quedó `partial` y sin aprobación, la operación `sending` pasó a `uncertain` y la otra siguió `pending`. La aprobación devolvió 409 por resultados inciertos.
- Una copia cifrada con un ID de historial incoherente recibió 422 y dejó intactos el plan y el historial. Este control usa una contraseña válida para llegar a la comprobación del historial.

## Reinicio

Los procesos `30564` y `8216` arrancaron sobre el mismo archivo, con la misma identidad de instalación. La sesión del primer proceso recibió 401 tras reiniciar. Después de iniciar sesión de nuevo, la última copia conservaba el plan parcial, la operación incierta y las dos filas originales. Una lectura SQLite posterior al cierre confirmó los IDs 1 y 2, una actualización y un alta. Los recibos registran el cierre de ambos procesos con SIGTERM.

El primer intento omitió el campo obligatorio `reviewedWorkflows` en la solicitud de aprobación y recibió 422. Se corrigió la petición del arnés y se repitió desde una raíz nueva. El resultado final de aprobación comprueba el bloqueo por incertidumbre, con cuerpo válido.

Script `tests/.tmp/probe-263-qa052.cjs`. Recibo, salidas de servidor e instalación ficticia en `tests/.tmp/qa052-preview263-ECQ5Hb`. Esta prueba acredita F1 en el servidor de la candidata 263 y en su exportación cifrada. El ZIP portátil usa otro ejecutable. Su comprobación y los hallazgos del constructor F2/F3 tienen evidencias separadas.
