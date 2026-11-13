# INTENT-JOURNAL-208 · Contrato corto del cuaderno de intenciones de guardado

5/11/2026, Europe/Madrid. Propuesta para acordar con Codex antes de montar nada. Esta unidad entrega modelo, protocolo, adaptador y pruebas; **no** monta rutas HTTP, no usa el cuaderno desde la App y no toca Store, Recovery, `v2.ts` ni `operations.ts`.

## 1. Qué se persiste y por qué

La **intención** de guardar una tarea (el patch que la persona decidió, su valor base, el token de revisión) y sus **resultados**, para que tras recargar o reiniciar la persona vea qué quedó pendiente de comprobar. No se persiste la cola de Hoy, ni resultados de lecturas, ni nada «para reenviar sin preguntar».

## 2. Dónde vive (reutiliza lo que hay)

- **Filas de `Store.meta` con el prefijo `task-intent:`** (una por registro), mediante la API pública (`get`/`set`/`transaction`). Precedente: `server/rescue-room-journal.ts` (intenciones con idempotencia sobre las mismas primitivas).
- **Cifrado**: con una base de archivo, `Store` sella cada valor de `meta` (AES-256-GCM, clave local protegida por DPAPI). Comprobado en `tests/task-intent-storage.test.ts`: el texto del cliente no aparece en disco. En `:memory:` no hay sellado (límite declarado, solo pruebas).
- **Autenticación**: el cuaderno no tiene rutas propias. Quien lo monte debe exponerlo solo tras la puerta de autenticación existente (orden 158) y vaciar/ocultar su lectura al bloquear; al bloquear, la memoria del navegador no conserva su contenido.
- **No** se usa `localStorage`/`IndexedDB` para texto de clientes.

## 3. Ciclo de vida y protocolo

`draft` (borrador) → `attempt` (intento iniciado) → `settled` (terminado: `acknowledged` | `rejected` | `not-sent` | `accepted-read` | `abandoned`).

1. **Antes de que exista intención duradera**: `saveDraft` devuelve si pudo conservarse (`ok` / `storage-failed` / `journal-full` / `too-large`). La interfaz no debe prometer «guardado en borrador» sin ese `ok`. Si falla, la ficha mantiene el texto y ofrece una salida clara (copiar, reintentar, seguir editando).
2. **Entre preparar el intento y el acuse**: `attempt` escribe y confirma el registro `attempt` **antes** de llamar a `send`. Si esa escritura falla, **no se envía** (`send` no se llama) y se explica el motivo. Es una sola escritura previa a la comprobación y al PATCH, por lo que `attempt` puede quedar escrito aunque el proceso muera antes de enviar: eso se trata como **incierto**, nunca como «no enviado».
3. **Tras una confirmación válida**: el resultado se asienta con su procedencia (`server-ack` solo con acuse del servidor; `person-accepted-read` si la persona aceptó una lectura; la coincidencia de valores no prueba autoría).
4. **Arranque**: `boot(current)` **solo clasifica** (no escribe, no envía): `restorable-draft`, `unknown-outcome` (acción: comprobar leyendo), `settled`, `other-context`, `quarantined`. Cualquier nuevo envío exige acción humana y una revisión vigente (token de la lectura actual); este módulo no tiene función alguna que ejecute una cola.

## 4. Identidad y contexto

Cada registro lleva `installId` y `contextKey` (instalación, captura, generación, cuenta). Un registro de otra copia se **conserva** y no se ofrece ni se opera desde esta (`wrong-context`). El mismo `taskId` en otra captura no cuenta.

## 5. Datos mínimos y retención

Solo los campos cambiados y su valor base (datos sensibles, solo en almacenamiento sellado), identificadores locales, fechas, fase/resultado/procedencia, evidencia de lectura (`applied|unchanged|diverged` + instante) y un contador `seq`. **Retención**: los terminados se retiran a los 14 días; **nunca** se borra por retención un borrador ni un intento sin resolver; tope de 200 registros: al llegar, se intenta retirar terminados vencidos y, si sigue lleno, se rechaza el alta con un motivo claro (no se desplaza lo antiguo).

## 6. Fallos y cuarentena

Un registro ilegible (bytes dañados o clave distinta), no JSON, de forma distinta, de otra versión, de más de 200 000 caracteres o con checksum incorrecto (corrupción accidental o escritura incompleta) pasa a `quarantined`: se conserva sin modificar, no se aplica y no se purga. El checksum **no** resiste manipulación deliberada. La escritura usa comparar-y-escribir: un segundo escritor con el valor viejo recibe `conflict`; nunca se sobrescribe un valor ilegible.

## 7. Límites y lo que queda para el montaje (con Codex)

- **Hallazgo para quien monte**: el constructor de `Store` migra las filas de `meta` que no empiezan por `enc1:` y **lanza** si no son JSON (salvo `recoveryPlan`). Un valor de `task-intent:` escrito por fuera del adaptador (texto plano no JSON) impediría abrir la base. El adaptador siempre escribe vía `Store.set` (sellado y JSON), por lo que no lo provoca; conviene que el montaje no escriba en `meta` por otra vía y que Store trate las filas ajenas con la misma tolerancia que `recoveryPlan`.
- Exclusión entre **procesos** sobre la misma carpeta: la da el candado de instancia, no este módulo; **no probada aquí**.
- Falta: rutas HTTP (lectura/escritura tras autenticación), integración con el gestor (envolver `SaveStrategy` con `attempt`), ocultar al bloquear, reinicio con el servidor real y prueba de dos procesos.
- **Resumen para el pasaporte (provisional)**: `summarizeForPassport` devuelve `{ scope: { installId, contextKey }, at, counts: { drafts, unknownOutcome, settled, otherContext, unknown } }` y nada más (sin IDs de tarea, valores ni borradores). Hay que acordar la semántica con quien lleva el pasaporte antes de fijar un tipo compartido.


---

## R2 · cambios de contrato tras el dictamen 210

1. **Identidad antes de cualquier mutación.** Editar o promover un borrador existente exige, ANTES de escribir o llamar a `send`: misma instalación, misma captura (`contextKey`) y mismo `taskId` (`wrong-context` / `wrong-task`; cero callbacks, cero bytes cambiados). La promoción válida conserva el ID, la fecha de creación y sube `seq`.
2. **Parche, base y revisión viajan juntos.** Al promover, el registro toma el parche, el valor base de ESOS campos y la revisión del intento (no los del borrador). Lo que recibe el callback, lo que queda escrito y lo que clasifica una instancia nueva coinciden.
3. **Tope atómico en el punto de escritura.** `IntentStorage.write(key, raw, expected, { maxEntries })` rechaza con `full` un ALTA (expected = null) si ya hay ese número de entradas bajo el prefijo; el adaptador lo comprueba dentro de la misma transacción de SQLite. Dos altas simultáneas (incluso de dos diarios sobre el mismo Store) ocupan un solo hueco; el perdedor no llama a su callback; editar un registro existente con la base llena sigue permitido. Alcance probado: un Store/una base; la exclusión entre PROCESOS sigue siendo del candado de instancia (no probada).
4. **Forma completa y coherencia.** `decodeRecord(raw, key)` valida fechas (ISO válidas), valores del patch/base (solo cadena, número finito, booleano o null), evidencia, `seq ≥ 1`, ID con forma válida y **ID interno = clave**, y la coherencia fase/resultado/procedencia (`acknowledged` ⇒ `server-ack`; `accepted-read` ⇒ `person-accepted-read`; el resto, sin procedencia; borradores e intentos sin resultado). Lo incoherente es `quarantined`: se conserva byte a byte, no se aplica ni se purga. **Retención**: solo terminados con fecha de liquidación VÁLIDA y vencida.
5. **Qué puede afirmar el arranque.** `boot()` devuelve `{ status: 'read', entries }` o `{ status: 'unavailable', entries: [] }`. Con `unavailable` NO se afirma «vacío» ni «sin pendientes»: se dice que no se pudo leer. Ni el diario ni el adaptador pueden localizar la base en un fallo de lectura completa; quien lo monte debe tratarlo como «no sé».
6. **Qué exige aceptar una lectura.** `acceptRead` solo funciona sobre un `attempt` con evidencia `applied` registrada (una lectura que muestre el cambio aplicado) y de la misma copia; `unchanged`/`diverged` no bastan. La procedencia sigue siendo `person-accepted-read`: no prueba autoría del envío.
7. **Resumen para el pasaporte (provisional)**: `{ source: 'intent-journal', observed, scope: { installId, contextKey }, status: 'read' | 'unavailable', at, counts: { drafts, unknownOutcome, settled, otherContext, unreadable } | null }`. `counts` es `null` si no se pudo leer (no cero); `unreadable` cuenta lo presente pero en cuarentena. Un recuento de borradores no demuestra que la copia esté actualizada ni que un envío se aplicara. El exportador deriva una etiqueta corta del contexto; el tipo interno no cambia. Adaptación al tipo del pasaporte (`PassportWorkSummary {status, at, counts}`): proyección directa, sin campos nuevos.
8. **Fuera de R2 (otra unidad):** rutas HTTP, App, Store/Recovery, integración con el gestor, prueba de dos procesos y la apertura de una base con JSON plano dañado (hallazgo de Store ya documentado).


---

## R3 · cambios de contrato (segunda ronda del dictamen 210)

9. **Aceptar la lectura y la evidencia que la justifica son la MISMA versión del registro.** `change()` lee UNA vez, evalúa la fase y la guardia (`evidence.kind === 'applied'`) sobre ESA lectura y escribe con esa misma lectura como precondición de la escritura. Si otro escritor cambia o retira la evidencia entre la lectura y la liquidación (`diverged`, `unchanged`, `null`), la escritura recibe `conflict`: no se liquida y el valor nuevo se conserva byte a byte. Procedencia humana, rechazo por contexto y comprobaciones de fase sin cambios.
10. **Las fechas son fechas de CALENDARIO.** `createdAt`, `updatedAt` y `evidence.at` deben ser `YYYY-MM-DD` o `YYYY-MM-DDTHH:MM:SS[.mmm](Z|±HH:MM)` (con o sin milisegundos), con mes 1–12, día dentro del mes (bisiestos: divisible por 4 salvo siglos no divisibles por 400), hora ≤ 23, minuto/segundo ≤ 59 y offset ≤ 23:59. Un 30 de febrero (o un 29/02 de año no bisiesto) es `bad-shape` → cuarentena, intacto, sin operar ni purgar, aunque su checksum coincida. La retención sigue exigiendo una fecha de liquidación válida y vencida.
11. Terminaciones de línea: todos los archivos de esta unidad se normalizaron a LF.


---

## R4 · cambios de contrato (tercera ronda del dictamen 210/231)

12. **Se valida ANTES de serializar, de podar y de llamar a `send`.** `saveDraft` y `attempt` construyen la intención EN MEMORIA y la validan (misma forma y coherencia que el arranque: `validateRecord`) antes de leer la capacidad. Una entrada inválida (`NaN`, `±Infinity` o `undefined` en el parche o en el valor base de un campo enviado, base no objeto, reloj imposible) devuelve `invalid-input`: no ocupa plaza, no dispara la poda de terminados vencidos, no toca la versión anterior de un borrador (que sigue promovible) y `send` no se llama. `null` explícito sigue siendo un valor permitido y se conserva como `null`. **Nada se normaliza**: un `NaN` jamás se convierte en `null`.
13. **Lo que recibe `send` es lo que hay en el almacenamiento.** Toda escritura (`put`) valida el registro, lo serializa, lo RELEE con el decodificador del arranque y exige que coincida con lo validado; el resultado devuelve esa relectura, y es ella la que se entrega a `send` (p. ej. `-0` llega como `0`, igual que queda en disco). Así ninguna intención entregada es una que el arranque no pueda clasificar como `unknown-outcome`.
14. **La evidencia y el reloj son entradas.** `recordEvidence` rechaza (`invalid-input`) una evidencia con tipo desconocido, campos extra o fecha que no sea de calendario (30 de febrero, 29/02 de año no bisiesto, hora 25…), sin tocar el registro, que sigue siendo un intento comprobable. El reloj inyectado se valida: un instante imposible, ilegible o que lanza no se escribe nunca (rechazo de entrada antes de enviar); si falla justo al liquidar, el acuse no se asienta y el registro conserva su versión válida de `attempt` (incierto), nunca `acknowledged`. Las transiciones (`abandon`, `acceptRead`) con el reloj roto se rechazan con los bytes intactos. Sin hora fiable la retención no purga (no se acredita que nada haya vencido).
15. Terminaciones de línea: el árbol de trabajo de este checkout está en CRLF (`core.autocrlf`); los archivos de esta unidad lo conservan, igual que los ya aceptados. (La nota 11 de R3 sobre «normalizar a LF» no describía el árbol real.)

### Propiedades del transporte de recuperación (probadas con SQLite de archivo y barreras deterministas)

«Transporte» es lo que lleva una intención desde que la persona guarda hasta que, tras cualquier corte, la interfaz sabe qué ocurrió: persistir → despachar → aplicar → acusar → liquidar. Las pruebas usan un servidor ficticio que cuenta aplicaciones, promesas como barreras (sin esperas por tiempo) y, para cada caída, un Store NUEVO sobre el mismo archivo como arranque.

| Propiedad | Garantía | Prueba |
|---|---|---|
| P1 | El intento es duradero y sellado antes de despachar | con `send` retenido, otra conexión al archivo ve el registro sellado y el servidor ficticio no ha recibido nada |
| P2 | Un corte en cualquier frontera deja el intento incierto y comprobable leyendo; jamás «no enviado» ni «confirmado» | caídas tras persistir/antes de despachar, tras aplicar/antes del acuse y tras el acuse con la liquidación retenida |
| P3 | El arranque no escribe ni envía | el servidor ficticio no recibe nada tras reabrir y los bytes no cambian |
| P4 | «Confirmado por el servidor» solo existe si la liquidación quedó escrita | acuse recibido y liquidación retenida ⇒ el registro sigue siendo `attempt` |
| P5 | Caso feliz | persistir → despachar → acuse → liquidado con procedencia `server-ack`, estable tras reiniciar |

Lo que NO se prueba aquí (queda para el montaje y la prueba de salida): exclusión entre procesos reales sobre una raíz, DPAPI, y un corte antes de persistir con un proceso de verdad (aquí se simula con la base cerrada).


---

## R5 · cambios de contrato (cuarta ronda del dictamen)

16. **El ámbito se fija al entrar, antes del primer `await`.** `saveDraft` y `attempt` construyen la intención preparada (instalación, captura, tarea, ID) de forma síncrona y es ESA la que se compara con el borrador leído; `boot`, `recordEvidence`, `acceptRead`, `abandon` y `change` copian `{ installId, contextKey }` al empezar. Un llamador que muta su objeto compartido mientras el almacenamiento lee no cambia a qué copia pertenece la solicitud: una solicitud de A no adquiere acceso a B (`wrong-context`, bytes intactos, cero callbacks).
17. **El transporte recibe una COPIA del registro.** `send(structuredClone(sent))`: la referencia propia `sent` (la relectura de lo escrito) decide qué intento se liquida y en qué ámbito. Cambiar el `id`, la instalación, la captura o el parche del objeto recibido no redirige el acuse ni altera lo persistido; con un error de transporte el intento queda incierto con su identidad original.
