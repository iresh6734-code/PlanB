# 270 · Continuidad lee la copia activa en el runtime portátil

6 de noviembre de 2026, Europe/Madrid. El ejecutable portátil sirve ahora la misma consulta de evidencia local que la App usa en el generador. Tras crear `createBaseApp`, `server/runtime.ts` registra una vez `registerContinuityEvidenceApi(app, store)`. La consulta usa el Store y la autorización originales de esa instancia.

La prueba del ejecutable portátil compila su punto de entrada y arranca con una copia ficticia en SQLite. Comprueba 401 con `no-store` para una sesión ausente, 200 con la revisión pedida confirmada en cabecera y resultado `unproven`, 409 sin hechos para una revisión ajena y 404 al usar POST. El digest de las filas de metadatos, registros, cambios y capturas permanece igual antes y después de la consulta. Se conserva el control de dos escrituras condicionadas sobre la misma revisión, que aplica una y rechaza la otra, y el rechazo de un segundo dueño de la misma base.

La misma prueba con el runtime anterior falló al faltar `no-store` en el 401 de la ruta sin registrar. El generador de contraste y la base ficticia se conservaron. La versión nueva pasó el recorrido y el typecheck focal sobre la proyección de 278 entradas. Se registraron los cierres propios. El hash del runtime compilado es `831e0e671b36467246bfdc5e666070b992f90c665836c0a7313e47e07e153bb5`.

Chromium abrió ese runtime con los 15 activos verificados de 263 y otra base ficticia. Tras autenticar, Continuidad mostró «Copia local capturada» como observada. El GET real devolvió 200 con la revisión solicitada confirmada. La vista de 390 px se inspeccionó, sin desbordamiento. La página emitió cero peticiones de escritura y externas, sin errores y con cero cambios de CRM. Un primer intento de navegador se detuvo al coincidir tres rótulos «Observado». La verificación final usó la fila exacta de copia, sin cambiar el producto.

- Contraprueba `tests/.tmp/portable270-baseline-xjX4Ba`.
- Verificación del ejecutable `tests/.tmp/portable270-final-mTiPb4`.
- Navegador, captura y cierre `tests/.tmp/portable270-browser-in1qHs`.

La lectura de evidencia funciona en el ejecutable portátil probado. La captura muestra las otras fuentes sin lectura disponible, incluida la de relevo. Generar y probar un nuevo ZIP descargable con este runtime es el siguiente paso. La demo 263 tiene su corte propio.
