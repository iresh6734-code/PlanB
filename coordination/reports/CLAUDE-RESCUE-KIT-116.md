# CLAUDE-RESCUE-KIT-116 · Kit de Relevo (informe de entrega)

02/11/2026. Sesión de Claude. Entrega **presentada, pendiente de la revisión de Codex**; no está aceptada ni integrada en la App. Todo es ficción en una carpeta nueva y un proceso nuevo **del mismo equipo**.

## 1. Qué hace hoy

Ciclo completo sin red: trabajo local → acuse **incierto** (create aplicado, acuse perdido) → **exportación cifrada** → **inspección sin escritura** → importación **ligada al contenido exacto inspeccionado** en una carpeta nueva → **proceso nuevo** → ID erróneo rechazado → ID correcto concilia → **un solo create** → informe comparativo.

- Cápsula `planb-rescue-capsule-v1`: bundle del `Store` (con `encodePortable`/`decodePortable`, sin cifrado propio), estado/diario/idempotencia de Rescate por **lista permitida**, estado del CRM simulado y el plan/mapa/marca de **simulación** (que el bundle del Store no incluye) por claves explícitas. Huella por componente y de conjunto; coherencia cruzada.
- Captura **coherente**: bajo exclusión del escritor de la sala; si un escritor ajeno cambia el simulador durante la lectura, reintento acotado y rechazo (`CAPTURE_UNSTABLE`) sin publicar nada.
- Importación: staging propio → restauración → política por estado → comprobación de revisión → publicación por renombrado → primer arranque por la ruta normal. Un fallo deja `rescue116-failed-*`, nunca un destino a medias ni toca el origen. Una cápsula se importa **una vez** (reclamo `.import-claim`, con recuperación de reclamos huérfanos).
- Contexto nuevo: `workspaceId` nuevo, `lineage.origins`, hecho `capsule-imported`; las claves de idempotencia del origen quedan solo como historia (un sobre del origen es rechazado en el destino con `CONTEXT_MISMATCH`).
- Política por estado: aprobación retirada (vuelve a revisión), incierto **conservado como incierto**, fallo armado desarmado, cerrado = consulta, nada se reenvía.
- Interfaz de tres pasos (1440/390/320, teclado, errores con foco), API propia en loopback, demo y CLI (`--crash <paso>` para ensayar interrupciones; contraseña por STDIN/interfaz, nunca por argumentos).
- Se conservan las guardas de 106 R2 (contexto antes de replay, atribución conservadora, límite de diario, validación estricta del cliente, bloqueo antes de abrir).

## 2. Comandos (comprobados)

```bash
npx vite build design/rescue-capsule --outDir "$PWD/tests/.tmp/rescue116-dist-kit" --emptyOutDir --base ./
npx vite build design/rescue-room --outDir "$PWD/tests/.tmp/rescue106-dist" --emptyOutDir --base ./
npx tsx scripts/demo-rescue-capsule.ts --port 4531 --dist tests/.tmp/rescue116-dist-kit --dest-dist tests/.tmp/rescue106-dist
echo "una-contraseña-de-ensayo" | npx tsx scripts/rehearse-rescue-capsule.ts
node --import tsx --test --test-concurrency=1 tests/rescue-capsule*.test.ts
```

Detalle y guion en `design/rescue-capsule/README.md`. Para reanudar el origen propio: `--resume tests/.tmp/rescue106-<id>`.

## 3. Resultados (proyección `pfinal`: copia de `server/ shared/ src/ scripts/ design/` y de las pruebas, con `tests/.tmp` propio)

> **Corregido en R2.5:** «48/48» sumaba dos ejecuciones (47 serial + 1 caso añadido y repetido aparte); no fue una pasada única. Ver R2 al final.

| Capa | Resultado |
| --- | --- |
| Node 116 (6 ficheros: capsule 3, integrity 10, context 13, rehearsal 12, api 5, client 5) | **48/48** (47/47 en la pasada serial de toda la suite; el test 13 se añadió después y `context` se repitió: 13/13) |
| Baseline Node 106 (68) | **68/68** |
| Baseline Node 115 (31) | **31/31** |
| `independent-rescue-contracts` (Codex, 10) | **10/10** |
| DOM 116 (`rescue-capsule.spec.ts`, Chromium headless-shell) | **7/7** |
| DOM 106 (`rescue-room.spec.ts`) | **9/9** |
| DOM 115 (`rescue-followup.spec.ts`) | **10/10** |
| `tsc --noEmit` (árbol real, proyecto completo) | **0 errores** |

**Paralelismo (hallazgo propio):** la primera pasada con los ficheros de 116 en paralelo dio **6 fallos** (integridad ×2, interrupciones ×3, importaciones concurrentes ×1) porque esas pruebas comparan el listado del `tests/.tmp` compartido y los ficheros vecinos escribían allí. En serie, 0 fallos. Es una limitación de diseño de esas pruebas: ejecutarlas **con `--test-concurrency=1` y sin otra actividad en `tests/.tmp`** (o en una copia con carpeta propia). Si Codex las ejecuta en el árbol real con otras sesiones activas puede ver ruido ajeno.

### Qué cubren las pruebas adversas
- Integridad: contraseña errónea, bytes truncados/alterados, formato desconocido, digest sin actualizar, componentes incompatibles, paquete del Store rechazado por `restoreBundle`; en todos, ni destino ni staging y origen intacto.
- Contexto: matriz de 7 etapas, órdenes del origen no ejecutables en el destino, aprobación retirada, incierto conservado, fallo armado desarmado.
- Interrupciones con **procesos reales** que mueren (código 86) en 6 puntos de exportación/importación: artefactos reales, origen intacto, continuación segura.
- Exclusión: una mutación pedida durante la captura espera; un escritor ajeno fuerza reintento y rechazo; dos exportaciones simultáneas se serializan; dos importaciones de la misma cápsula → exactamente un destino (`ALREADY_IMPORTED`).
- Escala 10.000 registros. API (host/origen, campos extra, 413, informe escapado y sin rutas privadas) y cliente (bytes acotados, acuses incompletos no confirman, lecturas obsoletas descartadas).

### Mutantes privados (copia aparte; control positivo = original verde)
| Mutante | Resultado |
| --- | --- |
| M1 aprobación no ligada al SHA/revisión | **detectado** (1 fallo, la prueba de aprobación ligada) |
| M2 aprobación heredada tal cual | **detectado** (2 fallos) |
| M3 fallo de acuse armado heredado | **sobrevivió** a las pruebas originales (no había prueba que exportara con el fallo armado) → **añadí un test** (`context`, el 13) → ahora **detectado** |
| M4 incierto → pendiente | **detectado** (2 fallos) |
| M5 captura sin exclusión | detectado, pero **de forma inespecífica**: rompe 8 pruebas de ensayo/CLI; no puedo afirmar que la prueba de exclusión por sí sola lo atrape |

Cinco mutantes no son una cobertura exhaustiva; los mutantes de 106 no se repitieron.

## 4. Medidas (sin garantías)

Con 63 registros la cápsula pesa ≈ 98 KiB. Con 10.000 registros: 6,4 MiB; exportar 2557 ms, inspeccionar 1157 ms, importar 4036 ms, RSS +28 MiB (una máquina, una ejecución, sin SLA).

## 5. Capturas inspeccionadas

> **Corregido en R2.5:** en la entrega abrí tres de las cuatro capturas; **no** abrí `kit-1440-inspeccion`. Ver R2 al final.

`kit-1440-destino`, `kit-{1440,390,320}-inspeccion` (carpeta de evidencias de la raíz efímera): sin desbordamiento, banner fijo visible, pasos en tarjeta, botón de aprobar deshabilitado hasta marcar la revisión; a 320 px el texto se parte sin cortar. Cada DOM comprueba además objetivos ≥ 44 px, foco visible y ausencia de scroll horizontal. Solo Chromium headless-shell: sin Edge, Firefox ni lector de pantalla.

## 6. Hashes (SHA-256, primeros 16 hex)

Archivos de 116 (los 23 de código/pruebas/docs; este informe y el checkpoint no se autoincluyen):

```
d32404b0b80acb8c  shared/rescue-room.ts            (106, modificado por 116)
727848a886f0a4d2  server/rescue-room.ts            (106, modificado por 116)
1985262937a5b928  server/rescue-room-journal.ts    (106, modificado por 116)
e96e50edfe5578cf  shared/rescue-capsule.ts
62886ac81e3134c0  server/rescue-capsule.ts
c1a0d761631ed148  server/rescue-capsule-api.ts
dfd33eda95b63fcf  scripts/demo-rescue-capsule.ts
6bcaeb39056dabb7  scripts/rehearse-rescue-capsule.ts
30432e050c8977bd  src/RescueCapsule.tsx
fef1eef65167e73d  src/rescue-capsule-client.ts
a0ce481b553e4d10  src/rescue-capsule.css
95a41187f48b1679  design/rescue-capsule/index.html
bcdbb1525b6b3ab8  design/rescue-capsule/main.tsx
cd31ffe08d3e83b8  design/rescue-capsule/README.md  (editado tras la proyección: solo documentación)
acd5ab21cd8d25cb  tests/rescue-capsule.test.ts
52f7f30bd5fcc276  tests/rescue-capsule-integrity.test.ts
738e66ed5f97858e  tests/rescue-capsule-context.test.ts
83c88c5d3ab9c30d  tests/rescue-capsule-rehearsal.test.ts
ed09892d8bcf0705  tests/rescue-capsule-api.test.ts
cf01cffe0db13b47  tests/rescue-capsule-client.test.ts
772412817c8b6e00  tests/e2e/rescue-capsule.spec.ts
b0dcd75853a42fe3  tests/helpers/rescue-capsule-harness.ts
3a34ee8769f8e823  coordination/plans/RESCUE-KIT-116-INTEGRACION.md
```

Todos los archivos de código de la proyección son **idénticos byte a byte** a los entregados (el README posterior solo añade la nota de `--test-concurrency=1`; el `context` se copió idéntico). Archivos reutilizados **sin cambios** desde el inicio: `server/crypto.ts fe126b84878716d8`, `server/store.ts 9d08d9cc06f8c4cf`, `server/recovery.ts b56e5d7255d93d3e`, `server/instance.ts f2271e6caf8bd72f`, `shared/model.ts`, `shared/operations.ts`, `shared/recovery-integrity.ts`, `server/rescue-room-api.ts a785f478dc91ca26`, `scripts/demo-rescue-room.ts c0f5759f5f2852ad`.

## 7. Procesos y archivos propios

Procesos: servidores de prueba y destinos lanzados por las pruebas (puertos libres, todos terminados), CLI de ensayo, un servidor Vite por compilación. **No** se usó ni reinició la demo 4511. Carpetas: `tests/.tmp/rescue116-adeeca72-…` (proyecciones, interfaces compiladas, registros, capturas y mutantes: se **conserva** como evidencia; una copia de mutante `pmut-M1` está bloqueada por el sistema y queda dentro de ella). Las carpetas `rescue106-*`/`rescue116-*` residuales de mis ejecuciones en el árbol real se limpiaron **sin borrado recursivo** (archivos conocidos + `rmdir`; lo inesperado se conservaba): 30 carpetas retiradas (16 de sala y 14 de kit), 0 conservadas. Se conservan `rescue106-b0fa84d8…` (demo 4511) y `rescue106-13fc0327…` (ajena).

## 8. Incidencia propia

Se creó por error `server/rescue-capsule-script.ts`, fuera de las 25 rutas: `check-path` lo rechazó, se eliminó en segundos y **no forma parte** de la entrega (`scriptOrigin` quedó dentro de `server/rescue-capsule-api.ts`).

## 9. Límites y lo que NO se demuestra

- **No se acredita otro ordenador**: solo carpeta nueva y proceso nuevo de este equipo. Sin HubSpot real, sin RTO/RPO, sin autenticidad (un hash prueba igualdad de contenido, no autoría), sin gestión de claves más allá de la contraseña del ensayo.
- Un solo escritor local por carpeta (bloqueo de proceso); sin exclusión entre ordenadores desconectados.
- El simulador no observa relaciones; el plan considera como máximo las 200 tareas visibles; el diario admite 4999 hechos efectivos.
- Cápsula de un solo uso; máximo 64 MiB (medido 6,4 MiB a 10.000).
- Pruebas sensibles al `tests/.tmp` compartido (ver §3). Mutantes: 5 de 116; los de 106 no se repitieron. Un navegador. No se pudieron crear enlaces simbólicos (EPERM en este equipo): las defensas contra enlaces no se probaron con enlaces reales en 116.
- No integrado en App/TeamApp ni en la navegación; propuesta en `coordination/plans/RESCUE-KIT-116-INTEGRACION.md`.

---

# R2 · Respuesta a la revisión independiente 138 (02/11/2026)

116 volvió a `working` con el dictamen `coordination/reviews/CLAUDE-RESCUE-KIT-116-claim.md`. Se atiende solo bajo las 25 rutas reservadas. Los resultados de esta sección sustituyen a los de §3 donde difieran.

## R2.1 Defecto confirmado y causa

`importCapsule` borraba el reclamo en su `catch` ante **cualquier** error, pero el destino ya se publica por `renameSync` antes del primer arranque y de la confirmación. Un fallo posterior (excepción tras publicar, fallo al escribir la confirmación) dejaba el destino sin reclamo y un reintento publicaba un segundo destino. **Reproducido por Codex** (excepción síncrona en `import:published`) **y por mí** (fallo real de escritura de la confirmación: reclamo en solo lectura ⇒ `EPERM`, reclamo borrado, segundo destino). No confundo ambos casos con una muerte de proceso: la muerte entre publicar y confirmar ya se recuperaba bien (el reclamo seguía «importing» con PID muerto).

Además, la QA complementaria (CLAUDE-RESCUE-KIT-QA-136) reprodujo otros dos defectos de la misma clase, corregidos aquí por tratarse del mismo mecanismo de «una sola vez»:
- **Carrera en la recuperación de un reclamo obsoleto** (`unlink` + `wx` no es atómico): con dos hilos reales sobre el mismo reclamo con PID muerto se publicaron **2 destinos en 11 de 20 rondas** (versión anterior).
- **`sweepStaging` no comprobaba si el importador vivía**: con una importación activa congelada en `components-written`, el barrido le vació el staging (4→1 ficheros) y la importación terminó en `ROOT_NO_MARKER`; y retiraba cualquier carpeta ajena con nombre y marcador válidos.

## R2.2 Corrección (`server/rescue-capsule.ts`, `server/rescue-room.ts`)

- El reclamo **nunca se libera si el destino pudo publicarse**. Tras un fallo se clasifica: *publicado* (marcador propio con `roomId` y, si consta, `capsuleRevision`), *no publicado* (verificado: no hay carpeta; solo entonces se libera, y solo si el reclamo sigue siendo el propio) o *dudoso* (se conserva). Códigos nuevos: `IMPORT_PUBLISHED_WITH_ERROR`, `IMPORT_PUBLISHED_UNCONFIRMED`, `IMPORT_AMBIGUOUS`, `CLAIM_UNREADABLE`, `CLAIM_RECOVERY_BUSY`. No se borra ningún destino.
- La confirmación del reclamo es atómica (temporal + renombrado). Un reclamo «importing» del **propio proceso** sin importación activa se trata como obsoleto (así se consolida tras un fallo de escritura).
- La recuperación de un reclamo obsoleto es **exclusiva** (`<reclamo>.takeover`, `wx`) y revalida el contenido del reclamo bajo esa exclusión. Un `.takeover` abandonado no se retira solo: error explícito.
- El marcador del staging lleva `pid` y `capsuleRevision`; `sweepStaging` solo retira un staging cuyo pid ya no existe (nunca una importación activa ni una carpeta sin pid).
- Sin cambios en `store.ts`, `recovery.ts`, `crypto.ts`, `instance.ts`.

## R2.3 Regresiones (en `tests/rescue-capsule-rehearsal.test.ts`, 6 nuevas «R2 ·»)

Fallan por la causa en la versión anterior y pasan ahora (misma prueba, código anterior `62886ac81e3134c0`/`727848a886f0a4d2` frente a código corregido):

| Regresión | Versión anterior | Corregida |
| --- | --- | --- |
| excepción tras publicar (`import:published`) no libera el reclamo ni permite otro destino | falla (no hay `IMPORT_PUBLISHED_WITH_ERROR`; reclamo borrado) | pasa |
| fallo real al escribir la confirmación: `UNCONFIRMED`, reclamo conservado, reintentos sin duplicar, consolida al poder escribir | falla (`EPERM`) | pasa |
| estados dudosos: ilegible y PID vivo bloquean; carpeta de otra revisión ⇒ ambiguo; carpeta como reclamo ⇒ `CLAIM_UNREADABLE`; sin carpeta ⇒ importa una vez | falla (consolidaba a ciegas) | pasa |
| recuperación interrumpida (`.takeover`) no permite segunda importación | falla | pasa |
| carrera: 2 hilos reales × 20 rondas, nunca más de un destino | falla (`EEXIST` en la ronda 1 / duplicados) | pasa (20/20 con un destino) |
| barrido: respeta la importación activa y la carpeta sin pid; retira la de un importador muerto | falla (`ROOT_NO_MARKER`) | pasa |

Se conservan las 48 de 116 (6 ficheros), las 68 de 106 y las 31 de 115.

**Mutantes privados de la corrección** (copia aparte, un cambio cada uno; pruebas R2): liberar siempre el reclamo, quitar la exclusión `.takeover`, quitar la revalidación bajo exclusión, quitar la identidad por revisión, barrido que ignora el pid, confirmación que borra el reclamo al fallar → **6/6 detectados**, cada uno por la prueba que debía (el de «sin revalidar» solo por la carrera, que es probabilística; con 20 rondas la probabilidad de no ver un duplicado en la versión sin corregir es ≈ 10⁻⁷).

## R2.4 Resultados (proyección `pfix`: copia de `server/ shared/ src/ scripts/ design/` y pruebas, con `tests/.tmp` propio; archivos congelados `crypto fe126b84878716d8`, `store 9d08d9cc06f8c4cf`, `recovery b56e5d7255d93d3e`, `instance f2271e6caf8bd72f` idénticos al árbol)

| Capa | Resultado | Procedencia |
| --- | --- | --- |
| Node 116 (6 ficheros, 54 casos) | **54/54** | **una sola pasada serial** (`--test-concurrency=1`), log `fix-116.log` — resultado propio de R2 |
| Node 106 (68) y 115 (31) | 68/68 y 31/31 | repetición sobre el código corregido (mismos casos que en R1, no casos nuevos) |
| DOM 116 / 106 / 115 | 7/7, 9/9, 10/10 | repetición sobre el código corregido |
| `tsc --noEmit` del proyecto | 0 errores en los archivos de rescate | repetición |
| `tests/independent-rescue-claim.test.ts` (Codex) | **falla** a propósito | su propia nota lo exige: era una *observación del defecto* (afirmaba el texto del error inyectado); ahora el error es `IMPORT_PUBLISHED_WITH_ERROR`. No es mía y no la he tocado: debe invertirse o sustituirse |

## R2.5 Correcciones a mi informe R1 (evidencia, sin reconstruir nada)

- **«48/48» no fue una pasada única.** Qué ocurrió: una pasada serial de los 6 ficheros dio **47/47** (log `final-116b.log`, que ya incluía los 12 casos de `context`); *después* añadí un caso a `context` (13) y repetí **solo ese fichero** (13/13, salida vista en terminal, sin log guardado). «48» es 47 + 1 sumados de dos ejecuciones distintas. R2.4 sí es una pasada única (54/54) con registro.
- **Capturas.** El mensaje que entregué al usuario era correcto y mi §5 no: en la entrega yo **abrí tres** de las cuatro imágenes (`kit-1440-destino`, `kit-390-inspeccion`, `kit-320-inspeccion`) y **no** abrí `kit-1440-inspeccion`; sus comprobaciones eran solo las automáticas del DOM (sin desbordamiento, objetivos ≥ 44 px, foco visible). Durante R2 (02/11, posterior a la entrega) he abierto `kit-1440-inspeccion` de la ejecución DOM de R2: banner visible, pasos, inspección en tres columnas legibles, botón de aprobar deshabilitado hasta marcar la revisión. Es una inspección **nueva de R2**, no de la entrega original.
- Resultados **propios de R2**: R2.3 y R2.4. **Repetidos**: 106/115/DOM. **Históricos** (sin repetir en R2): medidas de 10.000 registros de §4, y mutantes M1–M5 de R1.

## R2.6 Hashes tras R2 (SHA-256, primeros 16 hex)

```
d32404b0b80acb8c  shared/rescue-room.ts
c87e7f57694d16e0  server/rescue-room.ts            (cambia: marcador del staging con pid y capsuleRevision)
1985262937a5b928  server/rescue-room-journal.ts
e96e50edfe5578cf  shared/rescue-capsule.ts
4787016b9c635070  server/rescue-capsule.ts         (cambia: reclamo, recuperación exclusiva, barrido)
c1a0d761631ed148  server/rescue-capsule-api.ts
dfd33eda95b63fcf  scripts/demo-rescue-capsule.ts
6bcaeb39056dabb7  scripts/rehearse-rescue-capsule.ts
30432e050c8977bd  src/RescueCapsule.tsx
fef1eef65167e73d  src/rescue-capsule-client.ts
a0ce481b553e4d10  src/rescue-capsule.css
95a41187f48b1679  design/rescue-capsule/index.html
bcdbb1525b6b3ab8  design/rescue-capsule/main.tsx
a6a2477308032d19  design/rescue-capsule/README.md  (cambia: sección del reclamo)
acd5ab21cd8d25cb  tests/rescue-capsule.test.ts
52f7f30bd5fcc276  tests/rescue-capsule-integrity.test.ts
738e66ed5f97858e  tests/rescue-capsule-context.test.ts
0edf38a471948e1a  tests/rescue-capsule-rehearsal.test.ts  (cambia: +6 regresiones R2)
ed09892d8bcf0705  tests/rescue-capsule-api.test.ts
cf01cffe0db13b47  tests/rescue-capsule-client.test.ts
772412817c8b6e00  tests/e2e/rescue-capsule.spec.ts
b0dcd75853a42fe3  tests/helpers/rescue-capsule-harness.ts
7aca340ae030423f  coordination/plans/RESCUE-KIT-116-INTEGRACION.md  (cambia: nota del reclamo/PID)
```

La proyección `pfix` es byte a byte igual al árbol para `rescue-capsule.ts`, `rescue-room.ts`, la prueba de ensayo y el README.

## R2.7 Límites que siguen

- La recuperación del reclamo se apoya en el PID del importador: **no prueba identidad** (un PID reutilizado se ve vivo y bloquea: lado seguro; un reclamo de otro equipo sería ininteligible). Un solo equipo.
- Un `.takeover` abandonado o un reclamo ilegible requieren retirada manual: no hay herramienta ni se retira automáticamente.
- La confirmación atómica se probó con **solo lectura** y con una **carpeta** en el lugar del reclamo; no se probó un disco lleno ni un corte de energía.
- El relleno base64 del salt (`==`) no está autenticado por el cifrado: alterarlo se acepta al leer (mismo contenido) pero cambia el hash, y la aprobación ligada al contenido lo rechaza (`CONTENT_CHANGED`). Hallado por QA-136.
- Las pruebas de listado de 116 siguen sensibles al `tests/.tmp` compartido (§3); las R2 no lo son.

---

# R3 · Propiedad del reclamo (revisión 148, 03/11/2026)

116 volvió a `working` por la revisión independiente `coordination/reviews/CLAUDE-RESCUE-KIT-116-r2-independent.md` (y el encargo `CLAUDE-RESCUE-OWNER-148`). Corregido bajo las 25 rutas reservadas; **QA-136 sigue en `review` y no se ha editado**. Los resultados de esta sección sustituyen a los de R2.4 donde difieran.

## R3.1 Hallazgo y alcance exacto

En R2 el reclamo propio se reconocía por `pid === process.pid` y por un conjunto en memoria (`activeClaims`) **local a cada instancia del módulo**. Dos instancias en el mismo proceso (p. ej. dos hilos) comparten PID y no comparten ese conjunto: la segunda tomaba el reclamo ACTIVO de la primera por obsoleto, lo recuperaba y publicaba otro destino. Reproducido por Codex y por mí de forma determinista (prueba 8 de QA-136).

**Aplicabilidad (no se supone):** no he demostrado que el servidor de ensayo normal cargue dos instancias del módulo (una sola, más la guarda de «ocupado» de la API), ni el defecto aparece entre procesos con PID distinto (PID vivo ⇒ bloquea; comprobado). Se corrige igualmente porque el encargo exige la garantía «un solo destino» frente a instancias distintas en un proceso, y el diseño anterior dependía de un supuesto («un módulo por proceso») que nada garantiza.

## R3.2 Corrección (`server/rescue-capsule.ts`; sin cambios en `rescue-room.ts` ni en Store/Recovery/crypto/instance)

- **Identidad:** cada instancia tiene un `INSTANCE` (uuid) y todo reclamo lleva `pid` + `owner`. Un reclamo «importing» se considera obsoleto **solo si** (a) su PID ya no existe, o (b) lo escribió ESTA instancia y esta instancia no tiene una importación activa sobre él. PID vivo con otro propietario, propietario desconocido (reclamos de R1/R2 sin `owner`) o reclamo ilegible ⇒ **ambiguo ⇒ bloquea** (`ALREADY_IMPORTED`/`CLAIM_UNREADABLE`) sin tocar nada.
- **Verificar que se modifica el mismo reclamo:** la recuperación revalida el contenido exacto bajo la exclusión `.takeover` (ya en R2); ahora además `confirm` comprueba que el reclamo en disco **sigue siendo el que se iba a confirmar** (bytes) antes de reemplazarlo; si no, `IMPORT_PUBLISHED_UNCONFIRMED` y el reclamo ajeno queda intacto.
- **Ciclo de vida de `.takeover`:** lleva `pid`, `owner`, `token`, `at`. Solo se retira la exclusión **propia** (se compara el token). Una exclusión abandonada (proceso muerto, ilegible) **no se retira sola**: `CLAIM_RECOVERY_BUSY` informa de lo verificable (pid, desde cuándo, si ese proceso existe). Nuevo `describeClaim(kit, nombre)`: informe **solo de lectura** (reclamo, propietario, vida del PID, exclusión, publicación del destino y veredicto). El paso humano seguro es: comprobar que el proceso de la exclusión ya no existe, que el reclamo no ha cambiado y que el destino no está publicado; con dudas, esperar. No se da ninguna instrucción de borrado a ciegas.
- Ganchos de prueba nuevos (`import:claim-read`, `import:recovery-locked`), inertes sin `kit.onStep`.
- Se conservan los casos de R2 (excepción tras publicar, fallo al confirmar, reclamo conservado, recuperación exclusiva, revalidación, publicado/no publicado/dudoso, barrido que respeta lo activo).

## R3.3 Pruebas (12 nuevas «R3 ·» en `tests/rescue-capsule-rehearsal.test.ts`) — qué intercalado se consigue

Los auxiliares (proceso hijo, hilo) se escriben como ficheros en la carpeta de kit de cada prueba; se detienen **síncronamente** en un paso del servicio hasta que el padre crea `<flag>.go` (plazo de 90 s ⇒ no quedan colgados). **Deterministas** (el orden lo fijan las barreras, no la suerte):

| Prueba | Intercalado forzado | R2 (+ganchos) | R3 |
| --- | --- | --- | --- |
| Dos instancias, mismo PID | A activa retenida en `components-written`; B (otra instancia, mismo PID) intenta importar ⇒ rechazo con reclamo/staging/takeover **idénticos byte a byte**; al soltar A: un destino | **falla** (B importa otro destino) | pasa |
| Procesos reales de PID distinto | ídem con A = proceso hijo | pasa | pasa |
| Propietario muere antes / después de publicar | A muere (`exit 86`) en `before-publish` / `published`; reintento | pasa | pasa |
| Dos recuperadores | A retiene la exclusión en `recovery-locked`; B ⇒ `CLAIM_RECOVERY_BUSY` con `holderPid` = A y `holderAlive`; al soltar A: un destino y A retira SU exclusión | falla (error sin detalles) | pasa |
| El recuperador que leyó pierde | B detenido en `claim-read` con el reclamo viejo; A recupera e importa; B revalida y se rechaza sin segundo destino | pasa | pasa |
| Ciclo de vida de `.takeover` | exclusión de proceso muerto / ilegible: no se retira; `describeClaim` informa; tras el paso humano verificado se recupera una vez | falla (sin `describeClaim`/detalles) | pasa |
| Propiedad ambigua | sin `owner` con mi PID, o `owner` de otra instancia del mismo proceso ⇒ bloquea sin tocar | falla | pasa |
| Confirmar no pisa ajeno | el reclamo cambia entre publicar y confirmar ⇒ `UNCONFIRMED`, reclamo ajeno intacto | falla | pasa |
| `describeClaim` solo lectura | 6 estados; el listado no cambia | falla (no existe) | pasa |

**Probabilísticas (no deterministas; lo digo):** 2 pruebas de estrés de 20 rondas (hilos con **el mismo PID** y hilos con **PID de proceso ajeno vivo**, que emulan procesos) alinean dos hilos con `Atomics` y un desfase fino, **sin forzar el intercalado**; oráculo: nunca más de un destino por ronda, sin cambios respecto a R2. **Ambas pasan también en R2** (sin carga): no discriminan, son estrés complementario; la prueba que sí discrimina el defecto es la determinista de dos instancias.

**Sobre la regresión «CARRERA» de R2 (hilos con PID compartido):** su supuesto «hilos = procesos distintos» era incorrecto. Ahora el modelo «dos instancias en un proceso» es **parte del contrato** (se prueba de forma determinista) y se conserva con el mismo oráculo; la variante que emula procesos usa PIDs ajenos vivos. No relajé ninguna expectativa.

**Mutantes privados (7, pruebas deterministas):** propiedad solo por PID, confirmar sin verificar el reclamo, sin exclusión `.takeover`, sin revalidar, exclusión abandonada que se retira sola, exclusión propia que no se retira, PID vivo que no bloquea → **7/7 detectados** (por las pruebas previstas).

## R3.4 Resultados (proyección `pr3`: copia de `server/ shared/ src/ scripts/ design/` y pruebas, con `tests/.tmp` propio; `--test-concurrency=1` donde se indica)

| Capa | Resultado | Procedencia |
| --- | --- | --- |
| Node 116 (6 ficheros, 66 casos = 54 + 12 nuevos) | **66/66** | una sola pasada serial (`r3-116.log`) — propio de R3 |
| Node 106 (68) / 115 (31) | 68/68 y 31/31 | repetición |
| DOM 116 / 106 / 115 | 7/7, 9/9, 10/10 (Chromium headless-shell) | repetición; la UI no cambió |
| QA-136 (25 casos, copia **sin editar**) | **24/25**: falla únicamente la 8 «ARTEFACTO DEL MISMO PID» | **esperado**: es una caracterización histórica del defecto; invertirla exige la reserva de QA-136 |
| `tsc --noEmit` | 0 errores en los archivos de rescate | repetición |
| No repetido en R3 | `tests/independent-rescue-claim.test.ts` (de Codex, falla desde R2), las dos ejecuciones simultáneas de QA-136, las 10 de Codex `independent-rescue-contracts` | — |

Capturas: **no se inspeccionó ninguna captura nueva en R3**; la UI no cambió y los DOM pasaron con sus comprobaciones automáticas (desbordamiento, objetivos, foco). Las inspecciones de R1/R2 siguen siendo las declaradas en R2.5.

## R3.5 Hashes tras R3 (SHA-256, primeros 16 hex)

```
c087675110b9d54d  server/rescue-capsule.ts          (cambia: owner, CAS, exclusión, describeClaim)
d34c2022e4f564b6  design/rescue-capsule/README.md  (cambia: propietario y exclusión)
491227764cf1c640  tests/rescue-capsule-rehearsal.test.ts  (cambia: +12 «R3 ·»)
e204a0faa29ec7cd  coordination/plans/RESCUE-KIT-116-INTEGRACION.md  (cambia: nota de owner y estados para el usuario)
(sin cambios desde R2) d32404b0b80acb8c shared/rescue-room.ts · c87e7f57694d16e0 server/rescue-room.ts · 1985262937a5b928 server/rescue-room-journal.ts · e96e50edfe5578cf shared/rescue-capsule.ts · c1a0d761631ed148 server/rescue-capsule-api.ts · dfd33eda95b63fcf scripts/demo-rescue-capsule.ts · 6bcaeb39056dabb7 scripts/rehearse-rescue-capsule.ts · 30432e050c8977bd src/RescueCapsule.tsx · fef1eef65167e73d src/rescue-capsule-client.ts · a0ce481b553e4d10 src/rescue-capsule.css · 95a41187f48b1679 design/rescue-capsule/index.html · bcdbb1525b6b3ab8 design/rescue-capsule/main.tsx · acd5ab21cd8d25cb tests/rescue-capsule.test.ts · 52f7f30bd5fcc276 tests/rescue-capsule-integrity.test.ts · 738e66ed5f97858e tests/rescue-capsule-context.test.ts · ed09892d8bcf0705 tests/rescue-capsule-api.test.ts · cf01cffe0db13b47 tests/rescue-capsule-client.test.ts · 772412817c8b6e00 tests/e2e/rescue-capsule.spec.ts · b0dcd75853a42fe3 tests/helpers/rescue-capsule-harness.ts
Intactos: crypto fe126b84878716d8 · store 9d08d9cc06f8c4cf · recovery b56e5d7255d93d3e · instance f2271e6caf8bd72f
```

## R3.6 Límites que siguen

- **Ni el PID ni el `owner` prueban identidad entre equipos ni protegen frente a escritores que no cooperen** (otro proceso que edite los ficheros a mano). Un solo equipo. Un PID reutilizado se verá vivo y bloqueará (lado seguro).
- Una instancia que **muere sin que el proceso termine** (p. ej. un hilo terminado a la fuerza dejando un reclamo `importing`) deja un reclamo con PID vivo y propietario ajeno: **bloquea de forma permanente** hasta que alguien verifique y actúe; no hay recuperación automática segura. Tampoco se recupera un staging cuyo pid sigue vivo.
- `.takeover` abandonado: no se retira solo (decisión deliberada).
- Los auxiliares pasan la contraseña FICTICIA de las pruebas por argumentos del proceso hijo (visible en la lista de procesos de este equipo): válido solo para pruebas con datos ficticios, **no** un patrón para el producto (que la recibe por cuerpo/STDIN).
- Sin probar: disco lleno, corte de energía, enlaces simbólicos reales, otro sistema operativo o equipo, HubSpot, relaciones, datos reales. Mismas limitaciones del kit (200 tareas, 5000 hechos, simulador sin relaciones).

# R4 · Adquisición inicial y recuperación como un solo protocolo (revisión 153 / caracterización 150, 04/11/2026)

116 sigue en `working` bajo sus 25 rutas. QA-136 (`review`) y la prueba independiente de Codex **no se han editado**.

## R4.1 Análisis del protocolo completo

Actores: **R** (recuperador de un reclamo huérfano, bajo `.takeover`), **N** (importador nuevo: crea el reclamo con `wx` sin pasar por `.takeover`), **O** (dueño anterior, muerto o propio inactivo).

- R3 hacía `unlinkSync(claim); take()`. Entre ambas operaciones el reclamo **no existía**: N podía crearlo, importar y publicar; R recibía entonces un `EEXIST` de sistema. No es un fallo de la exclusión (R y otro recuperador sí se excluyen), sino de que **la exclusión no cubre a quien adquiere por primera vez**.
- Dentro de un proceso no hay intercalado (el bucle es síncrono); solo aparece entre procesos.
- Otros intercalados examinados: R retiene la exclusión y N llega con el reclamo aún presente ⇒ N ve el reclamo obsoleto, intenta `.takeover` y recibe `CLAIM_RECOVERY_BUSY` (cubierto desde R3). Reclamo cambiado entre verificar y actuar ⇒ ahora se relee justo antes de sustituir.
- Un renombrado no es una comparación-e-intercambio: **un escritor que no coopere (edición manual) sigue sin cubrirse**; no se pretende más.

## R4.2 Corrección (`server/rescue-capsule.ts`)

1. **Sustitución atómica:** tras verificar «sin destino publicado», el reclamo obsoleto pasa al propio con `rename` de un fichero temporal propio (`<reclamo>.<8hex>.recover.tmp`). El reclamo existe siempre ⇒ N nunca encuentra el hueco. Con EPERM/EBUSY/EACCES se reintenta hasta 12 veces × 25 ms (en Windows un lector concurrente bloqueó el renombrado en la batería de estrés; sin reintento se observaron rondas con `CLAIM_RECOVERY_FAILED`, hallazgo de la propia ejecución).
2. **Relectura** del reclamo justo antes de sustituir (gancho nuevo `import:recovery-verified`): si cambió, se reevalúa y no se pisa.
3. **Resultado de dominio fiel:** `CLAIM_RECOVERY_FAILED` (409) si el renombrado falla, con `details.claimUnchanged` solo `true` si se **comprobó** que el reclamo anterior quedó igual (si no, el mensaje dice que no se puede comprobar). Cualquier otro error de sistema durante el reclamo sale como `CLAIM_CHECK_FAILED` (500: «esta llamada no importó nada; estado del reclamo no comprobado») y no como `INTERNAL`.
4. No se declara «no se publicó nada» por capturar un `EEXIST`: esa captura ya no existe en la recuperación; el estado dudoso sigue siendo `IMPORT_AMBIGUOUS`.

## R4.3 API e interfaz

- La API ya convertía `CapsuleError` en `{error, code, details}`; un `EEXIST` crudo habría salido como `INTERNAL` 500 («No se pudo completar la operación. El origen no se ha modificado») sin decir nada del destino. Ahora `CLAIM_RECOVERY_BUSY/FAILED/CHECK_FAILED` llegan con su mensaje; probado por la API (409, sin contraseña ni rutas, reclamo y exclusión intactos, el estado no marca la cápsula como importada).
- Interfaz (`src/RescueCapsule.tsx`, una línea): tras **cualquier** fallo se recarga el estado del kit, para que no muestre el de antes del intento si otro proceso ganó. El error sigue en la alerta con foco; **nunca se muestra una confirmación que no exista** (la confirmación solo sale de una respuesta `ok`).
- Sin cambios en `server/rescue-capsule-api.ts` ni en el cliente.

## R4.4 Pruebas nuevas (`tests/rescue-capsule-rehearsal.test.ts`, 5 «R4 ·»; `tests/rescue-capsule-api.test.ts`, 1)

| Prueba | Qué fuerza | Resultado |
| --- | --- | --- |
| R4 · recuperador + importador nuevo (2 procesos, 2 barreras) | R detenido en `import:recovery-verified`; N existe como proceso (barrera en `import:start`) y se suelta solo con R retenido | **ROJO en R3 instrumentado** (gancho puesto *después* del `unlink`, único modo de forzar el hueco): `{recoverer:'EEXIST', newImporter:'ok'}`. **VERDE tras la corrección:** `{recoverer:'ok', newImporter:'CLAIM_RECOVERY_BUSY'}`, 1 destino publicado, reclamo final `imported` con el destino de R, N con `holderPid` = R, exclusión de R retirada, reclamo ajeno byte a byte igual |
| R4 · el reclamo cambia entre verificar y sustituir | un reclamo ajeno de proceso vivo aparece en el gancho | no lo pisa, `ALREADY_IMPORTED`, sin publicar, sin temporales. **Mutante** (sin relectura): falla |
| R4 · estado dudoso | destino sin marcador propio | `IMPORT_AMBIGUOUS`, no llega a sustituir, carpeta y reclamo intactos |
| R4 · fallo al sustituir | reclamo de solo lectura | en este Windows se observó la rama `CLAIM_RECOVERY_FAILED` con `claimUnchanged: true`; la prueba acepta también «importa una vez» (otros sistemas) y nunca un error crudo |
| R4 · error de sistema al reclamar | carpeta de reclamos ausente | `CLAIM_CHECK_FAILED`, sin rutas |
| API · exclusión abandonada | takeover de proceso muerto vía HTTP | 409 `CLAIM_RECOVERY_BUSY` |

Se conservan sin cambios los controles previos: propietario activo (misma instancia/mismo PID y procesos distintos), caída antes/después de publicar, dos recuperadores con barrera, el que leyó pierde, ciclo de vida de `.takeover`, estrés probabilístico (que **no** se usa como prueba causal).

## R4.5 Resultados (proyección en carpeta propia con `tests/.tmp` propio; `--test-concurrency=1`)

- Ficheros de 116 + Codex independiente: **83 pasan, 1 omitida** (la caracterización de Codex, que exige `PLANB_RESCUE_R2_BASELINE`), 0 fallos. Incluye la batería de estrés de 20 rondas (2 variantes) tras añadir el reintento.
- QA-136 (25, sin editar): **24/25**; falla solo la 8 «ARTEFACTO DEL MISMO PID» (caracterización histórica, igual que en R3). *Nota de método:* en una ruta larga fallaron 14 por `unable to open database file` (límite de ruta de Windows del propio arnés, no de este cambio); repetidas con `PLANB_QA136_BASE` corto dieron 24/25.
- DOM 116 (Chromium headless-shell instalado, config propia): **7/7** con el cambio de UI. No hay DOM nuevo para `CLAIM_RECOVERY_BUSY`.
- `tsc --noEmit` de todo el proyecto: exit 0.
- No re-ejecutado: 106/115, ni la suite completa del repositorio.

## R4.6 Límites

- La prueba roja usa un R3 con gancho añadido para forzar el hueco; **no** demuestra que ese intercalado causara el `EEXIST` de la ronda 16 de QA-136, ni la ausencia de otros. No se observó duplicación en ninguna ejecución, ni se declara demostrada su imposibilidad.
- Sin escritores no cooperantes, otro sistema operativo/equipo, ni disco lleno/corte de energía. Un temporal `*.recover.tmp` puede quedar si el proceso muere entre crearlo y renombrarlo (solo propio; no se barre).
- Mismo equipo, carpeta y procesos propios, datos ficticios: no acredita otro ordenador, HubSpot real ni RTO/RPO.

## R4.7 Hashes (primeros 16 hex; cambian: `server/rescue-capsule.ts` 968e4db08a5a181f · `src/RescueCapsule.tsx` 5882c21a598d7493 · `tests/rescue-capsule-rehearsal.test.ts` 4ba38d3a74af29dc · `tests/rescue-capsule-api.test.ts` 37ca5f432f3236c4 · `design/rescue-capsule/README.md` f7fa494f68b91d90 · plan de integración + este informe)
Sin cambios desde R3: el resto. Intactos: crypto fe126b84878716d8 · store 9d08d9cc06f8c4cf · recovery b56e5d7255d93d3e · instance f2271e6caf8bd72f.
