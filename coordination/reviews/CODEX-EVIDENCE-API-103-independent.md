# Dictamen independiente 244 · CODEX-EVIDENCE-API-103

6 de noviembre de 2026, Europe/Madrid. **Devolver a `working`.** Conservar reserva. Hallazgo F1 en `server/continuity-evidence-api.ts`, retorno de la evaluación. El hallazgo de agregado de simulacro se atribuye al servicio 101 y se registra por separado. La 239 sigue esperando ambos dictámenes favorables.

## F1 · Una sesión que vence durante el cálculo recibe la evidencia

`createBaseApp` autentica al entrar. El GET calcula, relee la identidad de instalación y publica sin volver a verificar el permiso de la sesión original. Con contraseña de ficción, SQLite nuevo y reloj controlado, un GET sin cookie devuelve 401 y no invoca el cálculo. Un GET autorizado normal devuelve 200 sin `Set-Cookie`. El caso crítico entra un milisegundo antes del fin de la sesión y, en la segunda lectura del reloj del servicio, cruza el vencimiento. La respuesta publica HTTP 200, con `no-store`, sin renovación y con las seis tablas intactas. Un GET inmediato con la misma cookie ya devuelve 401 por el middleware real. El primer GET debía devolver 401 sin hechos. No se necesita suponer una operación asíncrona para reproducirlo.

Integrar explícitamente la autorización local ya disponible en `createBaseApp`. Fijar la autorización original y verificarla antes de enviar la respuesta, sin extender la sesión. Conservar el rechazo temprano, los estados de caché y la regla de acceso del producto para instalaciones sin contraseña. Probar controles antes/durante/después, autorización ausente o vencida y lectura válida con el mismo resultado. Acordar la firma del registrador con 239. El vínculo de contexto 242 protege otra propiedad y no sustituye este control de caducidad.

## Verificaciones que pasan

- Coinciden 4 huellas de entrega con el tablón y 44 archivos con la proyección histórica. Los 3 archivos de código/pruebas entregados coinciden entre proyección y checkout. Se cotejó el informe en el checkout.
- 64/64 Node de 103, 101, motor y cola. Typecheck focal 0 sobre la proyección propia. La primera invocación con el cargador falló antes de las pruebas por una ruta Windows. Se repitió con la CLI de `tsx`.
- Sonda independiente con Fastify real. GET válido, revisión antigua tras cambiar metadatos, 409 `SOURCE_CHANGED` sin hechos. Archivo con JSON coherente pero otra captura, 409 `ARCHIVE_MISMATCH`. Bytes ilegibles, 503 `SOURCE_UNREADABLE`. Los tres rechazos conservaron las tablas de la Store, al igual que la lectura autorizada. Pruebas de sesión y pin usan la app base, sin proveedor ni escucha HTTP.
- Reproducción y salida en `tests/.tmp/review244-kfO06p/CODEX-EVIDENCE-API-103/independent-244.test.ts` e `independent-review.log`. El fallo de sesión es `200 !== 401`. Este dictamen no certifica las rutas del binario instalado.
