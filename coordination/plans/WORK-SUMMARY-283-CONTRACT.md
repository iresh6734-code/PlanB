# 283 · Adaptador HTTP del resumen del trabajo local

7/11/2026, Europe/Madrid. Contrato de integración del backend cedido por el chat coordinador a este Codex. Consume 255 y 208 R5 aceptados; no modifica sus archivos. Reservas de 283: `server/work-summary-api.ts`, `tests/work-summary-api.test.ts`, este documento y su informe. No incluye `main`, App, Store ni el escritor de A4.

## Entrada y salida

`registerWorkSummaryApi(app, store, options)` registra únicamente `GET /api/v7/local-operations/work-summary`. Requiere la seguridad de `createBaseApp`. La Store ya abierta pertenece al servidor; la petición no elige archivo, instalación, captura o contexto. No se admiten parámetros de consulta ni cuerpo. No hay operaciones HTTP de escritura, reintento ni sondeo.

La salida 200 cumple el esquema estricto de `shared/work-summary.ts`: formato, estado, ámbito, instante, origen, procedencia, cobertura, cuatro recuentos y cuarentena. No contiene IDs de tarea o intención, valores, parches, revisión, claves del diario ni rutas de disco. El pin público es el SHA-256 canónico de la captura, igual al de la evidencia de Continuidad. El contexto interno del diario sí conserva instalación, captura, fechas, cuenta y generación completos; otra generación se cuenta aparte aunque el pin de captura coincida.

## Cobertura que debe declarar el anfitrión

`covers(current)` es obligatorio y solo lo proporciona el servidor. Debe devolver un booleano. El argumento está congelado para impedir cambios accidentales del contexto de lectura. Un error o valor distinto de booleano produce indisponibilidad.

- Antes del montaje efectivo de A4 debe devolver `false`. Tener el módulo 208 instalado, una base legible o cero filas no demuestra cobertura.
- Con `false`, la respuesta leída tiene cobertura `none`, recuentos y cuarentena `null`; no se consulta el diario. Tampoco se interpreta como vacío si hay entradas antiguas.
- Con `true`, el anfitrión declara evidencia de cobertura del protocolo de escritura para la clave completa de ese ámbito en el mismo soporte del cuaderno. No basta con que ahora haya un escritor o componente montado. Para archivo, esa evidencia debe conservar su significado al reiniciar; cerrar o desmontar Hoy no debe hacer desaparecer la cobertura del trabajo ya registrado. A4 debe definir y verificar cómo guarda esa evidencia y su alcance antes de conectar el callback. La lectura clasifica las entradas mediante 208: borradores, intentos sin acuse, resueltos y otros contextos. La cuarentena se cuenta aparte. Cobertura completa exige cero cuarentena; parcial significa que las cifras son cotas inferiores.
- Sin una copia activa no hay ámbito, pin ni cifras y no se consulta cobertura o diario.

El posterior encargo de A4 debe justificar cuándo instrumenta el ámbito; no debe instalar `covers: () => true` para hacer desaparecer un aviso. Este módulo no conserva borradores de pestañas ni inventa trabajo que todavía no pasó por el diario.

Los fixtures de 283 declaran cobertura para verificar el lector y sus barreras. No prueban una política de cobertura de A4 ni sustituyen evidencia del montaje real. El estado de la vista o la mera existencia de entradas tampoco sirve como política.

## Almacenamiento y consistencia

Por defecto lee `storeIntentStorage(store).readAll()`. `readEntries` permite un adaptador controlado del mismo cuaderno; no acepta entradas de la petición. Se valida su forma, límite y unicidad de claves. El límite nativo se comprueba antes de descifrar las filas; excederlo no trunca ni acredita un total.

No se llama a `attempt`, `saveDraft`, `acceptRead`, `abandon`, `prune`, `write` ni `remove`. La procedencia es `memory-only` para la Store `:memory:` y `durable` para una Store de archivo. Describe el soporte leído, no una prueba de recuperación en otro equipo.

La sesión original se captura al entrar. Después de las esperas y de preparar/validar la respuesta se vuelven a comprobar permiso e identidad de la copia. La huella interna combina el contexto de trabajo con `total_changes()` de la conexión y `PRAGMA data_version`: detecta A→B→A en la conexión propia y commits desde otra conexión. Puede rechazar conservadoramente una escritura no relacionada. No es una transacción que bloquee todos los escritores ni una garantía contra modificaciones privilegiadas después de la última comprobación.

## Estados HTTP

| Código | Significado |
| --- | --- |
| 200 | Resumen leído, con o sin cobertura según el contrato. |
| 401 | Sesión inicial ausente, bloqueada, vencida o cuya condición de protección cambió. Solo error fijo, sin resumen. Una sesión nueva no hereda la petición anterior. |
| 409 | La copia o el diario cambiaron durante la consulta. Solo error fijo; actualizar contexto y solicitar de nuevo explícitamente. |
| 422 | Parámetros de consulta o cuerpo rechazados por el manejador. El parser HTTP también puede rechazar un cuerpo antes de alcanzarlo. |
| 503 | Origen, cobertura, reloj o diario no legibles, demasiado grandes o incoherentes. No se publica un cero ni la excepción original. |

Las respuestas de la ruta, también los errores de seguridad, llevan `Cache-Control: no-store`, `Pragma: no-cache` y `Vary: Cookie`. El consumidor 255 ya distingue 401, 404, otros errores y la respuesta 200 por esquema. Su comprobación de pin sigue siendo necesaria.

## Siguiente montaje, separado

1. Revisión independiente de los cuatro hashes de 283 y su evidencia.
2. Encargo nuevo para registrar el módulo una sola vez desde main y consumir la tarjeta 255 desde Continuidad, sin ocupar reservas de A3/App ajenas.
3. Mientras no exista A4, cobertura falsa explícita y mensajes de desconocido.
4. Integrar el escritor y la recuperación por intento exacto bajo su propio contrato, con las cuatro fronteras de reinicio pendientes. Solo entonces revisar la declaración de cobertura.
5. Repetir la candidata compilada y el portátil en sus cortes nuevos. 4601 y los binarios anteriores no se actualizan por haber escrito este módulo.
