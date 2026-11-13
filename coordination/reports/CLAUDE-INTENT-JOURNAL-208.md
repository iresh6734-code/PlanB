# CLAUDE-INTENT-JOURNAL-208 · Cuaderno reiniciable de intenciones de guardado (contrato, modelo y almacenamiento; sin montaje)

5/11/2026, Europe/Madrid. Paquete 4 del encargo «Claude A». Rutas nuevas; **no se edita** Store, Recovery, `v2.ts`, `operations.ts`, 171 ni la ficha. Sin red, proveedores ni credenciales; las pruebas con Store usan una carpeta temporal propia con una clave local nueva de esa carpeta. Sin commits ni despliegues.

## Qué entrega y qué NO

Entrega: el **contrato corto** (`INTENT-JOURNAL-208-CONTRACT.md`), el **modelo y protocolo** (`shared/task-intent-journal.ts`), un **adaptador** sobre la API pública de `Store.meta` (`server/task-intent-storage.ts`) y pruebas de fallo. **No** monta rutas HTTP, no se usa desde el gestor ni la App, no se acredita exclusión entre procesos sobre una raíz ni «recuperación tras reiniciar» en la App real. La persistencia tras recargar sigue sin existir para la persona hasta el montaje acordado con Codex.

## Diseño (resumen)

`draft → attempt → settled`. `attempt()` escribe y confirma el registro **antes** de llamar a `send`; si la escritura falla no se envía. Un intento sin acuse (o que lanza) queda `attempt` = **incierto** tras reiniciar; `boot()` solo **clasifica** (no escribe) en `restorable-draft | unknown-outcome | settled | other-context | quarantined`, y la API no tiene ninguna función que ejecute una cola. Registros corruptos, truncados, de otra versión o ilegibles se **conservan** sin aplicarse; los de otra instalación/captura no se ofrecen ni se operan. Retención: solo terminados vencidos (14 días); nunca borradores ni intentos sin resolver; al llegar al tope (200) se rechaza el alta con motivo. Comparar-y-escribir: el segundo escritor recibe `conflict`. Cifrado: el que ya da `Store` para `meta` en bases de archivo (comprobado: el texto del cliente no aparece en disco).

## Pruebas (sobre el corte final)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `tsx --test --test-concurrency=1 tests/task-intent-journal.test.ts tests/task-intent-storage.test.ts` | **21/21** (15 de protocolo con almacenamiento en memoria e inyección de fallos + 6 sobre un Store real de archivo) |

Protocolo: el intento es duradero antes del envío (el registro ya está en el almacenamiento cuando corre `send`); escritura fallida o lectura rota ⇒ `send` no corre; corte entre intento y acuse ⇒ incierto tras reiniciar, arrancar dos veces da lo mismo y no cambia un byte; excepción en `send` ⇒ incierto; evidencia solo anota, aceptar lectura es humano con su procedencia, descartar cierra sin envío; borrador que dice si pudo conservarse y pasa a intento sin duplicarse; borrador de otra captura/instalación nunca se ofrece; 7 tipos de registro dañado en cuarentena (truncado, checksum, versión, forma, no JSON, ilegible, demasiado grande) sin tocar nada; retención y tope; carrera de dos escritores; fases y contextos erróneos; contenido enorme; resumen provisional sin IDs ni valores; codificación con detección de cualquier byte alterado. Store real: sellado en disco, reinicio (cierre y reapertura), borrador de otra captura tras reiniciar, valores sellados dañados/truncados/basura en cuarentena, comparar-y-escribir con `Store.transaction`, solo escribe bajo su prefijo, base cerrada ⇒ no se envía, y `:memory:` (sin sellado, límite declarado).

**Contrapruebas (8 mutaciones del modelo, todas detectadas):** enviar aunque falle la escritura, ignorar el contexto, purgar lo no resuelto, omitir el checksum, tratar lo incierto como «no enviado», que el tope desplace, aceptar una lectura como procedencia de servidor y aplicar registros en cuarentena.

## Hallazgo (para el montaje y para Codex)

`new Store(archivo)` **lanza** si alguna fila de `meta` no empieza por `enc1:` y no es JSON (solo `recoveryPlan` está exento). Una escritura externa de texto plano no JSON bajo `task-intent:` (o cualquier clave) bloquearía la apertura de la base. El adaptador siempre escribe sellado y en JSON, así que no lo provoca; el montaje no debe escribir en `meta` por otra vía. Lo vi al simular una fila dañada sin el prefijo de sellado (un fallo de mi prueba, corregido para simular el daño real: ciphertext `enc1:` inválido). `store.ts` sigue reservado por Codex: lo documento, no lo toco.

## Hashes (SHA-256)

| Archivo | SHA-256 |
|---|---|
| `coordination/plans/INTENT-JOURNAL-208-CONTRACT.md` | `f5289f6853cd7e0d554daabec22c7fea1d9daafc4cf3e5f91b202ead6d8a5ed2` |
| `shared/task-intent-journal.ts` | `75d78fcd699ca53b3375317a8b38ab77cef93a76856202077b81ad88d49abb77` |
| `server/task-intent-storage.ts` | `c5de864b9c0f68f8b12c345996623e2acb9682e8548812cf19f50ff17eb423f4` |
| `tests/task-intent-journal.test.ts` | `51b273f0ddf6efe90cf848afd4865dfdc101d74f946b354660475ba94c9451cb` |
| `tests/task-intent-storage.test.ts` | `5a9c946b469f5b1aa9591ef1f425b33a289b57da65cf4b851a6199b07bda6230` |

## Límites

- Sin montaje: no hay rutas, ni integración con `SaveStrategy`/gestor/ficha, ni ocultación al bloquear, ni prueba de dos procesos sobre la misma raíz, ni reinicio con el servidor real.
- El checksum detecta corrupción accidental, no manipulación. Si el proceso muere entre la escritura de `attempt` y el envío, el estado es incierto aunque no saliera nada (decisión conservadora).
- `summarizeForPassport` es **provisional**: la semántica se acordará con quien lleva el pasaporte antes de fijar un tipo compartido.
- Esto no sustituye al gestor en memoria (136/170): un intento sigue siendo propiedad del gestor; el cuaderno solo recordaría su intención.

---

# R2 · respuesta al dictamen 210 (F1–F5)

Las cinco sondas del revisor (`tests/.tmp/j210-98fe684e/s/tests/independent-intent-journal.test.ts`) se ejecutaron **sin modificarlas** sobre una copia con el código corregido: **5/5 verdes** (con la entrega anterior fallaban, según su dictamen).

- **F1 / F2 · identidad.** `attempt` y `saveDraft` comprueban instalación, captura y tarea del borrador existente **antes** de escribir o llamar a `send` (`wrong-context` / `wrong-task`). Pruebas: otra captura, otra instalación y otra tarea de la misma captura ⇒ 0 callbacks y bytes idénticos; actualización de borrador y promoción válida conservan ID y fecha de creación.
- **F3 · base.** La promoción guarda juntos parche, base de los campos enviados y revisión del intento. Probado: lo que lee el callback, lo ya escrito cuando corre y lo que clasifica una instancia nueva; con la escritura fallida, el callback no corre.
- **F4 · tope.** Se aplica en el punto de escritura (`maxEntries` → `full`, atómico en la transacción de SQLite). Probado con dos diarios sobre la misma base en memoria y en un Store real: solo gana una alta, el perdedor devuelve `journal-full` sin llamar a su callback, editar con la base llena sigue permitido. **Alcance:** una base; no se prueba exclusión entre procesos.
- **F5 · forma y retención.** Decodificación estricta con coherencia fase/procedencia, fechas válidas, ID interno = clave. Probado con 9 variantes incoherentes (fecha inválida con checksum coherente, fase/procedencia incompatibles, evidencia, valor no escalar, `seq` 0, ID distinto de la clave): cuarentena byte a byte, sin purgar ni operar; el terminado válido y vencido sí sale.
- **Además (pendientes del dictamen):** el arranque distingue «no se pudo leer» (`unavailable`) de «vacío»; aceptar la lectura exige evidencia `applied`; el resumen del pasaporte cambia a `status`/`counts` nulo/`unreadable`/`source`/`observed`, como pidió la otra sesión; ID de entrada con forma válida. Todo en el contrato (sección R2).

**Pruebas sobre el corte R2:** `tsc --noEmit` limpio; Node **31/31**: 24 del diario (15 anteriores, algunas reajustadas al nuevo contrato, y 9 nuevas de R2) y 7 con Store real (6 anteriores y la del tope). **Contrapruebas R2 (11 mutaciones, todas detectadas):** sin identidad de captura al promover, sin identidad de tarea, promoción que conserva la base vieja, tope sin pasar `maxEntries`, adaptador que ignora el tope, validación de fechas permisiva (la de `prune` sola sobrevivía por defensa en profundidad), sin coherencia fase/procedencia, ID interno sin comprobar, aceptar sin evidencia y arranque que devuelve «leído» al fallar la lectura.

**Límites sin cambio:** sin montaje (rutas, App, gestor/ficha), sin prueba de dos procesos sobre una raíz ni de reinicio con el servidor real, sin DPAPI; el checksum no resiste manipulación; un intento escrito y no enviado por muerte del proceso se trata como incierto.

---

# R3 · segunda ronda del dictamen 210

**R2 preservada** (copia con hashes en `tests/.tmp/c208r3/r2/`, con los bytes originales CRLF; `hashes.txt`). Las dos sondas nuevas del revisor (`tests/.tmp/j210r2-0fdc463a/s/tests/independent-intent-journal-r2-races.test.ts`) se ejecutaron sin modificarlas **antes del cambio: 2 fallos de 7** (con las cinco originales); **tras el cambio: 7/7**.

- **F1 · misma versión.** En R2 `acceptRead` leía el registro para comprobar la evidencia y `change()` volvía a leerlo para escribir con la lectura NUEVA como precondición: un cambio intercalado (evidencia `diverged`) pasaba el control. Ahora `change()` lee una vez, evalúa fase y guardia sobre esa lectura y escribe con ella como precondición (`conflict` si cambió). Pruebas propias: evidencia intercalada `diverged`, `unchanged` y retirada de la evidencia (resultado, fase, evidencia y bytes: el valor del otro escritor queda intacto); control positivo sin carrera con procedencia humana; contexto ajeno y fase siguen rechazándose.
- **F2 · calendario.** `validDate` valida contra el calendario con bisiestos y las formas ISO admitidas (con y sin milisegundos, `Z` u offset, solo fecha). 30 de febrero, 29/02 no bisiesto, mes 13, hora 24, offset 24:00, `T` sin segundos y similares quedan en cuarentena. Se aplica a `createdAt`, `updatedAt` y `evidence.at`; con checksum coherente siguen en cuarentena sin operar ni purgar, y el terminado válido y vencido sí se retira.

**Pruebas sobre el corte R3:** `tsc --noEmit` limpio; Node **37/37** (31 previas + 6 nuevas: 3 de F1 con 4 variantes y 3 de F2); las **cinco sondas originales y las dos nuevas 7/7**. **Contrapruebas R3:** guardia de evidencia ignorada, febrero siempre válido, bisiesto sin siglos y `evidence.at` sin calendario — las cuatro detectadas; las sondas nuevas fallan sobre R2 preservada.

**Límites sin cambio:** sin montaje, sin prueba de dos procesos, sin DPAPI; `unreadable`/`unavailable` son del diario y de su consumidor (resumen para el pasaporte con `status`/`counts` nulo). El hallazgo de Store (fila de `meta` no sellada no JSON impide abrir la base) sigue siendo de la reserva 055.


---

# R4 · tercera ronda del dictamen 231

Las siete sondas anteriores y las tres nuevas (`tests/.tmp/j231-9e74a6ed/s/tests/independent-intent-journal-r3-writes.test.ts`, más las de R2 y R1) se ejecutaron **sin modificarlas** sobre el código corregido: **10/10 verdes** (control con finito/null incluido). Con la entrega R3 las dos sondas nuevas fallaban, según su dictamen.

- **F1 · el parche persistido no puede diferir de lo que recibe `send`.** `saveDraft`/`attempt` validan la intención EN MEMORIA (`validateRecord`: misma forma y coherencia que el arranque) antes de leer capacidad, podar o escribir. `NaN`, `±Infinity` y `undefined` en el parche o en el valor base de un campo enviado ⇒ `invalid-input`, cero escrituras, cero `send`; `null` explícito se conserva como `null`. Además `put` relee lo escrito con el decodificador del arranque y es esa relectura la que recibe `send` (`-0` llega como `0`, igual que en disco). Una entrada inválida **no ocupa plaza ni dispara la poda** (prueba con el cuaderno lleno y un terminado vencido: ni un byte cambia y `removes` no se mueve; el control con entrada válida sí poda) y **no toca el borrador** que se iba a promover (que sigue promovible).
- **F2 · el diario no puede poner en cuarentena su propio intento.** `recordEvidence` valida la evidencia como entrada (tipo, campos y fecha de calendario): 30 de febrero, 29/02 de año no bisiesto, mes 13, hora 25, `at` no cadena, campos extra y valores no objeto ⇒ `invalid-input` y bytes intactos; el intento sigue siendo `unknown-outcome` / «comprobar leyendo». El 29 de febrero bisiesto sí se acepta. El reloj inyectado también es una entrada (instante imposible, ilegible o que lanza): antes de enviar ⇒ rechazo sin escribir ni enviar; al liquidar ⇒ el acuse no se asienta y el registro queda como `attempt` válido (nunca `acknowledged`); `abandon`/`acceptRead`/`recordEvidence` con el reloj roto ⇒ rechazo con bytes intactos; sin hora fiable `prune` no purga.
- **Propiedades del transporte de recuperación** (encargo A1.3): contrato (R4, P1–P5) y dos pruebas con SQLite de archivo y barreras deterministas — caso feliz (sellado y visible desde otra conexión antes de despachar; liquidado con procedencia del servidor; arranque que no reenvía ni cambia un byte) y caídas por frontera (antes de persistir, tras persistir/antes de despachar, tras aplicar/antes del acuse, tras el acuse con la liquidación retenida).

**Pruebas sobre el corte R4:** Node **46/46** (37 del diario: las 30 previas —una con una fecha incidental inválida, ahora válida porque la entrada se valida primero— y 7 nuevas; 9 con Store real: 7 previas y 2 de transporte). `tsc --noEmit` limpio en los archivos de la unidad (único error del proyecto: `tests/e2e/continuity-hub.spec.ts`, de otra sesión). **Contrapruebas R4:** relectura de lo escrito retirada, que `send` reciba el registro sin relectura, entrada validada después de la capacidad, evidencia sin validar y reloj sin validar al liquidar: las cinco detectadas. **Equivalentes (explicados):** quitar `validateRecord` de `put` (las rutas públicas ya validan en `prepare` antes de llegar y la relectura no distingue `NaN` de `null`: es última línea de defensa para mutaciones internas), y sustituir el reloj validado por el crudo en `build`/`prune` (la forma validada de `prepare` o la fecha `NaN` ya cubren los casos probados).

**Límites.** Se mantienen CAS, cuarentena de R3 y retención; el montaje HTTP, la vinculación con lo que revisó la persona, Store y el propietario del gestor siguen en sus unidades. Sin exclusión entre procesos reales, sin DPAPI. Los archivos conservan CRLF (estado del árbol de trabajo). 

**Huellas SHA-256 vigentes (R4).** El informe no puede contener su propia huella; la registra el tablón al presentar.

| Archivo | SHA-256 |
|---|---|
| `coordination/plans/INTENT-JOURNAL-208-CONTRACT.md` | `6d1df549370502c33e8ab980520431b277c4fb10efb7f0e0249ca5d55188d876` |
| `shared/task-intent-journal.ts` | `44cb11eff3972497cdfc445cd3839564101c6dc581a7e1e466575f027ce59a64` |
| `server/task-intent-storage.ts` | `51950201ba277fcca52356d7a57e1541bee509dfd0b22259f02afbcddf8c2c40` |
| `tests/task-intent-journal.test.ts` | `12f1f2dce832183660a13ecbe3ef2dad672f819dbccc37629f2f8309caca0974` |
| `tests/task-intent-storage.test.ts` | `4289cc1a3842c7c2be29ba1bb4472e511d546977e60fe5aa942c7b3f1a51af4c` |


---

# R5 · ámbito fijado al entrar y copia para el transporte

Las cinco sondas del dictamen (`tests/.tmp/journal-r4-vdVBO2/s/tests/independent-intent-journal-r4-scope.test.ts`) se ejecutaron **sin cambiar sus aserciones** (solo la ruta de importación y `NODE_ENV=test`, que su arnés necesita para la clave de ensayo): **5/5 verdes**. Quitando cada fijación una a una, vuelven a fallar (4 mutaciones detectadas); la entrega R4 fallaba las cinco según el dictamen.

- **Ámbito.** `saveDraft`/`attempt` comparan el borrador leído con la intención **preparada** (construida de forma síncrona antes del primer `await`), no con `input.current`/`input.taskId` leídos después. `boot`, `recordEvidence`, `acceptRead`, `abandon` y `change` copian `{ installId, contextKey }` al entrar. Además el ID usado para buscar es el de la intención preparada.
- **Transporte.** `send` recibe `structuredClone(sent)`; la liquidación usa `sent.id` y el ámbito de `sent` (referencia propia, relectura de lo escrito).

**Regresiones nuevas (7, en `tests/task-intent-storage.test.ts`, Store real de archivo con barrera determinista en `readAll`):** `saveDraft` y `attempt` desde A con el objeto mutado a B (wrong-context, 0 callbacks, bytes intactos); `boot` para la captura pedida; `abandon`, `acceptRead` y `recordEvidence` con el ámbito mutado durante la lectura (wrong-context, bytes intactos); transporte que cambia `id`, `contextKey`, `installId` y `patch` del objeto recibido (el acuse liquida solo `sent-intent`, el otro intento incierto no se toca, `patch` y ámbito persistidos intactos) y error de transporte con el registro alterado (el intento queda incierto con su identidad original). Barreras liberadas en `finally`.

**Pruebas:** Node **53/53** (37 del diario y 16 con Store real; antes 46). `tsc --noEmit` limpio en la unidad. **Contrapruebas R5:** sin copia para `send`, sin ámbito preparado en la promoción, sin ámbito copiado en `boot` y en `change`: las cuatro detectadas por mis pruebas y por las sondas del revisor. **Equivalente:** liquidar con `input.current` en lugar del ámbito de `sent` (con la copia, el transporte ya no puede alterar ninguno de los dos; es defensa en profundidad).

**Límites sin cambio.** Montaje HTTP, vinculación con lo que revisó la persona y orquestación con Store siguen en su unidad (A4); sin exclusión entre procesos, sin DPAPI. CRLF conservado.

**Huellas SHA-256 vigentes (R5)** (el informe no puede contener la suya):

| Archivo | SHA-256 |
|---|---|
| `coordination/plans/INTENT-JOURNAL-208-CONTRACT.md` | `4935502e8ea7fe20049402b04efc544802c18dbcf5e9540cb6fdedb344690c23` |
| `shared/task-intent-journal.ts` | `07c5a3098d785f5c74e612c6c4be11be36dbe73212abb52fa099400515a2de2c` |
| `server/task-intent-storage.ts` | `51950201ba277fcca52356d7a57e1541bee509dfd0b22259f02afbcddf8c2c40` |
| `tests/task-intent-journal.test.ts` | `12f1f2dce832183660a13ecbe3ef2dad672f819dbccc37629f2f8309caca0974` |
| `tests/task-intent-storage.test.ts` | `3f3761ba13c5b196544f884d0dc893512c9539bcf7f626f65ac9749b5c4e9f0b` |
