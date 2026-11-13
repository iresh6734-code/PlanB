# 239 · Evidencia de copia registrada en el arranque principal

6 de noviembre de 2026, Europe/Madrid. Codex. Se registró `registerContinuityEvidenceApi(app, store)` en `server/main.ts`, usando la Store abierta por la aplicación y el guard local de su instancia. La ruta `GET /api/v7/continuity/evidence` queda disponible al arrancar el servidor principal compilado. El punto de entrada portátil conserva su composición.

101 R2, 103 R3 y 104 R2 se aceptaron mediante el dictamen independiente 254 antes de reclamar la reserva y escribir el montaje. Se cotejaron sus huellas con el corte privado ya probado. La infraestructura 245 y las identidades de simulacro 201 también están aceptadas. No se añadió un segundo guard, conexión o Store.

## Comprobación desde el ejecutable

`tests/continuity-evidence-mount.test.ts` crea SQLite de archivo en una carpeta ficticia nueva y arranca procesos compilados en puertos efímeros de loopback. Hace peticiones HTTP y cierra cada proceso con recibo terminal. La fixture guarda un simulacro con las cinco identidades correctas y otro que repite una. La lectura devuelve dos guardados y un éxito declarado, sin duración de recuperación medida.

- Sin registro, el main de control responde 404 y falla la misma aserción de entrada. El control del runtime portátil pasa.
- Con registro, los dos recorridos pasan. Sin sesión responde 401, un Origin ajeno recibe 403 y los errores de sesión llevan `no-store`, `Pragma` y `Vary: Cookie`. La lectura autorizada no renueva cookie.
- GET y HEAD conservan las seis tablas cotejadas. HEAD no habilita una ruta implícita. Después de un PATCH explícito y ficticio, el pin antiguo devuelve 409 sin hechos. Una nueva lectura muestra una tarea completada más, la misma captura y ninguna escritura adicional.
- Se recompiló de nuevo el main con los bytes materializados en el checkout. Su SHA coincide con el ejecutable del corte de prueba. Los dos recorridos HTTP volvieron a pasar y sus dos procesos terminaron. Los cuatro procesos del corte causal anterior también terminaron.

Corte causal y tipos en `tests/.tmp/evidence239-r23-1f46fM`, 125 fuentes. Comprobación posterior al montaje en `tests/.tmp/evidence239-final-4XSLLw`, con `http.log` y `result.json`. Main compilado SHA-256 `a571127daf2f6299e253c16ede14917d137a590d245938a332796f11fca368ab`. Los dos recorridos repetidos no cuentan como cuatro casos distintos.

## Alcance pendiente

Este paquete monta la API. El vínculo entre su lectura y el contexto de la pantalla corresponde a 242. El Hub y su navegación se entregan en 253. La caducidad durante el cálculo y después de la última lectura se acreditó en las suites de 103 y el dictamen 254 mediante reloj controlado. Esta prueba HTTP no inyecta esa caducidad dentro del binario. La candidata servida 236 conserva su corte anterior.

## Huellas de entrega

- `server/main.ts` · `e6693d2d27aa13facb6a40623c000a97a7b2a79c6435a741ddfdcadd3c47eeae`
- `tests/continuity-evidence-mount.test.ts` · `3f742960fbc0d28824309f02225d99f2e9d8868e1195b6b4b2441ed58c785d40`

El tablón registra la huella del informe al presentar. Pendiente revisión independiente del montaje.
