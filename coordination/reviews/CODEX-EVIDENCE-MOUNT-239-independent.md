# Dictamen independiente 256 · Registro de evidencia 239

6 de noviembre de 2026, Europe/Madrid. **Favorable.** Se cotejaron las tres huellas de `CODEX-CONTINUITY-EVIDENCE-MOUNT-239` con checkout y sus dos archivos ejecutables con el corte propio. 101 R2, 103 R3, 201 y 245 están aceptadas y sus huellas actuales coinciden. La proyección conserva exactamente las entradas revisadas del servicio 101, la API 103 y el guard 245.

Se verificaron 125 archivos contra el manifiesto del corte causal del autor y se copiaron a `tests/.tmp/review256-UJKeUl/s`. Se incluyó la demo CLI de 101, también cotejada, para completar la validación de esa dependencia. Se reconstruyeron main, runtime y el main anterior al registro con esbuild y se guardaron los metafiles. La composición de main añade la importación del registrador y una llamada con la Store abierta. El main de control coincide con el baseline del tablón. El primer cotejo por sustitución literal se detuvo porque main mezcla finales de línea. La comparación normalizada confirmó que el cambio se limita a esas dos líneas y el control se compiló a partir de los bytes originales preservados. El resto de las fuentes quedó intacto.

## Resultados observados

- Main con registro y runtime, **2/2** por HTTP sobre ejecutables propios, SQLite de archivo, puertos efímeros de loopback y datos ficticios. La ruta devuelve agregado sin identificadores de registros, mantiene 2 informes técnicos guardados y 1 éxito declarado y conserva tiempo de recuperación nulo.
- Contraseña ficticia configurada mediante el endpoint real. Sin sesión devuelve 401 sin hechos con `no-store`, `Pragma` y `Vary: Cookie`. Origin ajeno devuelve 403. La lectura autorizada devuelve 200 sin `Set-Cookie`. GET y HEAD mantienen el digest de seis tablas. HEAD devuelve 404.
- Después de un PATCH explícito ficticio, la revisión anterior devuelve 409 y hechos nulos. La nueva lectura conserva captura y muestra una tarea completada más sin escribir en ninguna tabla. El PATCH se limita al caso de prueba y queda en su base propia.
- Main anterior al registro, **1/2**, con el fallo esperado `404 !== 200` al consultar evidencia. El control de runtime permanece verde. Su metafile carece del registrador, al igual que runtime. El metafile de main contiene servicio, registrador y guard de sesión.
- Typecheck focal correcto. Cuatro procesos hijos terminados mediante el cierre previsto del arnés, con recibos en `process-results.json`. Sin listeners del ensayo pendientes.

## Artefactos y alcance

`review-manifest.json` conserva las huellas de entradas, entregas y ejecutables. Main propio SHA-256 `2d4000c4152af68661fd11fd83fe9d4f52ec998ad8e94e3b061db78399af0ba8`, runtime `4f119c7134c61e02e9054f75171279852dd5652d71f4dc52a9d2ef2eb4a04061` y main de control `2e38ba1169b12531d037f5f66cda1b04081e6bd63cd59192340a911688500494`. Logs `http-mounted.log`, `http-before.log` y `types.log` en la raíz del corte. Los hashes del ejecutable propio corresponden a esta recompilación, con rutas del corte propias.

La aceptación acredita el registro en el arranque principal. El enlace de contexto 242, su adopción por el Hub 253 y una candidata servida con esas funciones conservan sus revisiones y pruebas. La caducidad dentro del cálculo pertenece al banco de inyección aceptado de 103. Este ensayo HTTP no induce esa frontera dentro del ejecutable ni abre el navegador o servicios externos.
