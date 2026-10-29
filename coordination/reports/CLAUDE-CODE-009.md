# Informe CLAUDE-CODE-009

Autor: Claude (Sonnet 5.5). Estado: entregado para revisión. Codex gestiona `submit`/`accept`.

## Archivos (solo los tres reservados)

- `shared/crm-capture-runner.ts`: motor asíncrono `runCrmCapture`.
- `tests/crm-capture-runner.test.ts`: 94 pruebas con `node:test`.
- `coordination/reports/CLAUDE-CODE-009.md`: este informe.

Solo se leyó mi propio `shared/crm-capture-contract.ts` (no se modificó). No se tocó nada más y no se usó red, git, subagentes ni instalaciones. El motor no está conectado a ningún importador ni a `server/hubspot.ts`.

## Qué implementa

API exportada exactamente la pedida: `CaptureItem`, `RunnerPage`, `RunnerRequest`, `RunnerOptions`, `RunnerResult`, `CaptureReadError`, `CaptureRunnerError` y `runCrmCapture`. Importa solo de `./crm-capture-contract.js`.

**Flujo.** Las entidades se recorren en el orden dado. Cada página pasa por `CrmCaptureContract.addPage`, y el resultado solo se construye tras `finalize`. Un error de cualquier tipo rechaza toda la promesa y no se devuelve ningún dato parcial.

**Operaciones acotadas.** `readPage`, `getBinding` y `sleep` pasan por una única función `bounded`. Esta compite contra cancelación externa, plazo global y (salvo en `sleep`) `requestTimeoutMs`. Termina aunque el callback ignore la señal o no resuelva nunca. Cada intento tiene su propio `AbortController`, que se aborta en timeout, cancelación y plazo, y no tras un éxito. Los timers y listeners se limpian en `finally`, y los rechazos tardíos de lecturas abandonadas quedan consumidos.

**Contexto.** Todo lo previo al primer `await` es síncrono: las opciones, el binding y las entidades se copian, y los callbacks se capturan ahí. `getBinding` se comprueba antes y después de cada `readPage` (también si la lectura falló; el cambio de contexto gana a cualquier otro error), antes de cada intento (lo que cubre el momento tras cada espera) y antes de devolver. Cada petición recibe una copia congelada del binding, un objeto de petición congelado y una `signal` sin congelar.

**Reintentos.**
- Solo se reintentan `CaptureReadError` con estado 429 o 500..599.
- Un `retryAfterMs` válido (entero ≥ 0) prevalece, con tope en `maxDelayMs`. Si no es válido, el retraso es `base·2^(attempt−1)` con tope en `maxDelayMs`. No hay jitter.
- No se reintentan 401, 403, 404, errores genéricos, `TIMEOUT`, `CANCELLED`, `DEADLINE`, `BINDING_CHANGED` ni errores del contrato.
- Si se agotan los intentos, el error es `RETRY_EXHAUSTED`.

**Errores.** Los códigos propios son `INVALID_OPTIONS`, `CANCELLED`, `TIMEOUT`, `DEADLINE`, `BINDING_CHANGED`, `RETRY_EXHAUSTED` y `READ_FAILED`. Cualquier otro error del transporte se enmascara como `READ_FAILED`, con mensaje fijo y sin `cause`. Ningún mensaje contiene binding, IDs, URLs ni valores del transporte. Los errores del contrato se propagan tal cual como `CaptureContractError`.

**Páginas.** La respuesta se copia en cuanto llega, antes de la segunda comprobación de binding. Esto cubre un transporte que mute su respuesta después. Los items se copian de forma superficial y se congelan. Un `items` que no sea array, un item que no sea objeto o un getter que lance dan `CaptureContractError` con `INVALID_INPUT`. El resto de la validación (ID canónico, `nextCursor`, `total`, bucles, duplicados, límites) la hace el contrato.

**Inmutabilidad.** El resultado, `records` y cada array de entidad están congelados. El resumen está congelado en profundidad por el contrato. Los payloads anidados de los items son datos opacos y no se congelan; hay una prueba que lo fija.

## Corrección tras la revisión de Codex (cupos antes de copiar)

**Fallo reproducido por Codex.** Con `maxRecords=1` y 4 items con getter enumerable, el motor rechazaba con `LIMIT_EXCEEDED`, pero los 4 getters ya se habían ejecutado al clonar, porque el límite solo lo comprobaba el contrato después de la copia.

**Corrección** (en `shared/crm-capture-runner.ts`; la API no cambia):
- El motor lleva su propio cupo global restante: `maxPages − páginas aceptadas` y `maxRecords − registros aceptados`. Los defaults son los del contrato (1000 y 1.000.000). Se acumula entre todas las entidades y solo avanza cuando el contrato acepta una página. Un reintento de transporte no lo toca.
- `snapshotPage` recibe ese cupo y lo comprueba antes de recorrer `items` o leer propiedades por item:
  - Si no queda ninguna página en el cupo, lanza `LIMIT_EXCEEDED` sin mirar la respuesta.
  - Si `items.length` supera el cupo de registros, lanza `LIMIT_EXCEEDED` antes de cualquier copia.
- El `catch` de `snapshotPage` conserva los `CaptureContractError` (ya no los convierte en `INVALID_INPUT`). Cualquier otro fallo de forma sigue siendo `INVALID_INPUT`.
- El error se difiere como los demás errores de forma: la comprobación de binding posterior sigue teniendo prioridad (`BINDING_CHANGED`).
- Una página que excede el cupo de páginas se sigue leyendo del transporte (una petición más) pero no se copia. No se evita la petición porque no sabemos de antemano si será la última. Si ambas violaciones coinciden en una página mal formada, gana `LIMIT_EXCEEDED` sobre otros errores de forma.

**Pruebas nuevas (9)** en el bloque «cupos antes de copiar»:
- Página inicial sobredimensionada con getters: `LIMIT_EXCEEDED` y contador de getters en 0.
- Cupo global: exceso tras una entidad aceptada; la entidad siguiente no se lee y no hay resultado.
- Acumulación entre páginas de la misma entidad.
- Límites exactos (se aceptan y los items sí se copian).
- `maxPages`, en la misma entidad y entre entidades, sin clonar la página extra.
- Los reintentos de transporte no consumen cupo.
- Defaults: 1000 páginas (la 1001 no se clona) y un array disperso de 1.000.001 entradas rechazado por longitud.
- Prioridad de `BINDING_CHANGED` sobre el exceso.
- Cero llamadas tras el rechazo.

**Comprobación de que detectan el fallo.** Desactivé temporalmente la comprobación de longitud: fallaron 4 de las nuevas (página inicial, cupo global, acumulación entre páginas y defaults). La restauré y confirmé que no queda rastro de la mutación.

## Pruebas realmente ejecutadas

Comando: `node --import tsx --test --test-concurrency=1 tests/crm-capture-runner.test.ts`

Resultado final: **94 pruebas, 94 pasan, 0 fallan** (las 85 originales más las 9 nuevas; ≈ 1,2–1,4 s). Antes de la corrección se había ejecutado cuatro veces con 85/85. Después de ella: 2 ejecuciones completas con 94/94, una con la mutación (90 pasan, 4 fallan, como se esperaba) y una final con 94/94. Tras la primera pasada original limpié tres detalles de las pruebas: una asignación a sí misma, una lectura de `error.cause` y un parámetro sin usar.

Cobertura:
- **Recorrido y estado:** multientidad con paginación, mismo ID en otra entidad, vacío terminal, y el contexto del caller mutado tras la llamada.
- **Reintentos:** `attempt` reiniciado por página y contadores de intentos y reintentos. Retry-After de 0, válido, con tope e inválido, y exponencial con tope. 401/403/404 y los estados 400/499/600/0 sin reintento. Sin filtración de URL ni token. Agotamiento y lanzamiento síncrono.
- **Identidad:** cambio antes, después, durante la espera y antes de devolver. Cambio por separado de tenant, portal y generation, binding mal formado, `getBinding` que falla, y precedencia del cambio sobre un fallo de lectura.
- **Cancelación y plazos:**
  - Cancelación previa y con transporte, `getBinding` y `sleep` que no cooperan.
  - `TIMEOUT` en `readPage` y en `getBinding` colgado.
  - `DEADLINE` con `readPage`, `sleep` y `getBinding` colgados, y con una secuencia de esperas reales.
  - Limpieza de listeners, rechazos tardíos consumidos y cero llamadas tras el rechazo.
- **Páginas inválidas:** 16 páginas malformadas, más bucle de cursores, duplicados, página vacía con cursor, `TOTAL_CHANGED`, `COUNT_MISMATCH` y límites.
- **Inmutabilidad:** resultados congelados, copia superficial de items y mutación tardía del transporte.
- **Cupos antes de copiar:** ver la sección de corrección (9 pruebas añadidas).
- **Opciones:** 26 opciones inválidas, getter hostil y valores de borde.

Todo con transportes ficticios, sin red. Los tiempos de las pruebas de timers son de 15 a 70 ms.

## Límites y no verificado

- No ejecuté `tsc`, el linter, la suite general ni las pruebas de aceptación de Codex, porque no estaba permitido. Revisé los tipos a mano (evité `Error.cause` tipado, usé parámetros con guion bajo), pero no hay comprobación automática.
- **Cancelación física:** si un callback ignora `signal`, el motor abandona su resultado y rechaza a tiempo, pero la lectura real puede seguir viva. No se promete cancelarla fuera del proceso.
- `requestTimeoutMs` también acota cada `getBinding`. Un `sleep` solo está limitado por el plazo global y la cancelación, no por `requestTimeoutMs`. Si `deadlineMs` es muy grande, se acota a 2³¹−1 ms por el límite de `setTimeout`.
- La comprobación de binding tras un fallo de lectura añade una llamada extra a `getBinding`. Es deliberado, para que el cambio de contexto prevalezca. Si `getBinding` tiene coste, conviene saberlo.
- Los items conservan solo propiedades propias enumerables: la copia superficial pierde el prototipo de las instancias de clase.
- No hay persistencia, reanudación, lease distribuido ni efectos salientes. Los callbacks deben ser de solo lectura. Una detección de omisiones del proveedor o de instantánea consistente queda fuera, como en el contrato.
- Sin integración, despliegue ni prueba contra proveedor real.

## Pendiente del coordinador

Revisión, `submit` y `accept`. No he presentado ni aceptado el encargo.
