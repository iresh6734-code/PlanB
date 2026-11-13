# R3 · Identidad completa antes de habilitar acciones (devolución 290)

**Hallazgo:** con la misma captura y fecha pero otra generación, una cola vieja recibida tarde pasaba el filtro de los tres campos comunes con la lista v1 y reactivaba el plan. No se demostró un PATCH erróneo; la ficha conserva su comprobación.

**Corrección (solo `LocalOperations.tsx`):** el cruce con la lista v1 queda como primer filtro y para **retirar** el plan ante un cambio conocido; **ya no autoriza**. Tras recibir la cola, `confirmFull` lee la identidad vigente con `readContext` (la lectura de la ficha, sin editar su cliente) y exige que `contextKey` coincida EXACTAMENTE con la clave de la cola (los seis campos: instalación, captura, fecha y inicio de captura, cuenta, generación). Distinta ⇒ el plan no se activa, no se elige otra copia, se relee una vez y, si sigue sin coincidir, se avisa. Pendiente, con error o tardía ⇒ de consulta (`inert`) con aviso. Es cancelable y lleva guarda de época y de secuencia; el bloqueo y cada época nueva la cancelan. Las estimaciones solo se conservan con la misma identidad completa acreditada.

**Regresiones (3 nuevas, 25 en total):** generación distinta con cola vieja tardía (retenida de la generación A, regeneración real del servidor ficticio con misma captura y fecha, Hoy actual, llegada real del cuerpo viejo y dos cuadros; después la jornada nueva **sí** permite estimar y abrir la tarea exacta, para que no pase solo por ocultar la Jornada); identidad pendiente o con error; lectura de identidad retenida que llega tras la comprobación nueva. **Con R2 fallan 3/3; con R3 pasan 3/3.**

**Ejecuciones R3:** Jornada **25/25 en tres ejecuciones** sin reintentos y sin la excepción de PID (se retiró: se usa el cierre del arnés aceptado en 293). Regresiones: A2 14/14, Por decidir 7/7, DOM 95/95, D7+reapertura 35/35, arnés 240 13/15 (A4 rojas por diseño), tsc limpio. **Contrapruebas R3:** detectada la comparación completa omitida; **sobreviven** quitar solo la guarda de época o solo la cancelación al empezar época (y su combinación): hay tres capas redundantes (guarda de época, cancelación por época y cancelación/secuencia al empezar la comprobación siguiente), cada una suficiente por sí sola.

**Límite:** `readContext` lee `/api/health` y `/api/v2/state` (hasta 8 MB) en cada refresco de Hoy; es el coste de acreditar la identidad completa sin un contrato nuevo del anfitrión. Una identidad completa en la lista de Hoy lo evitaría (unidad nueva con Codex).

**Huellas R3 (LF):**

| Archivo | SHA-256 |
| --- | --- |
| `src/LocalOperations.tsx` | `05c3c6875f2c8af2ddaf9a6173332e8b218f49a1cc32195d6e6108c668171c9d` |
| `src/local-operations.css` | `db138aed8750b234c8cd9b16b67afed6dd9a14d48e43c42ac85f9d7ac49d0227` |
| `tests/e2e/hoy-cola-jornada.spec.ts` | `964139b6ab6d6ce636389cc4786daae21c921ed144dfb9a5a8505b0fb9f5357c` |

# CLAUDE-HOY-COLA-JORNADA-A3 · «Organizar mi jornada» en Hoy

Autor: Claude A. Unidad con cuatro archivos exactos: `src/LocalOperations.tsx`, `src/local-operations.css`, `tests/e2e/hoy-cola-jornada.spec.ts` y este informe. Dependencias aceptadas: A2 (ficha condicionada y «Por decidir»), cola estructurada 230, Jornada 205 y el adaptador A3 (con la corrección 275 de estimaciones). No toca `App.tsx`, `main`, `ContinuityDay`, el adaptador ni el arnés.

## Qué puede hacer ahora una persona

1. Abre **Hoy**. Junto a «Qué atender primero» aparece **Organizar mi jornada** (botón con `aria-expanded`). La lista de Hoy sigue siendo una sola; la jornada es una sección bajo ella, no otra lista.
2. Al abrirla, el foco pasa a la región «Organizar mi jornada» y se ve la **Jornada de continuidad (205)** con la cola estructurada (230) ya adaptada: tiempo disponible (15/30/60/120 o libre), estimaciones por tarea, «Por decidir», «Fuera de la jornada», fijar/subir/bajar/quitar e imprimir.
3. Declara minutos de cada tarea: lo **desconocido no cuenta como cero**. Si elige a mano una tarea sin duración, el subtotal es el conocido y el saldo queda **indeterminado**; las propuestas posteriores salen «Provisional» y sin hora de inicio.
4. Si lo elegido excede el tiempo, se incluye y se **avisa cuántos minutos se pasan** («No se ha quitado»). Lo fijado sobrevive al cambio de tiempo.
5. «Abrir la tarea» abre la **misma ficha por ID exacto**, con guardado condicionado, comparador y «Por decidir». Al cerrar, el foco vuelve al botón exacto de la fila; si la fila desapareció (la tarea salió de la cola), a la región de la jornada.
6. La cobertura se dice siempre: «N tareas abiertas o por revisar en la copia, M en esta lista» y, si la página es parcial, «Esta lista no incluye K tareas… no significa que las demás estén cerradas ni que no existan». Las asociaciones que la copia no puede comprobar o que la lista no muestra aparecen en «Asociaciones que no se pueden comprobar (N)», **sin tratarlas como ausentes ni correctas**.

## Cómo está montado (decisiones)

- **Lectura.** `loadLocalWorkQueue` se llama junto con la lista de Hoy (solo en la vista Hoy, no en Agentes). Un fallo de esa lectura no rompe la lista: se ve al abrir la jornada, con «Reintentar la lectura de la cola»; un fallo posterior conserva la última lectura con aviso y la hora. La lista sigue viniendo del contrato anterior (`/api/v7/local-operations`, con `nextAction` y buckets de la interfaz); si los dos recuentos difieren se avisa de que se leyeron en momentos distintos.
- **Ámbito de las decisiones.** Estimaciones, elecciones, fijados y tiempo viven en memoria de **esta vista de Hoy abierta** y están ligados a la **identidad completa de la copia** (`workIdentityKey`: instalación, captura, fecha y comienzo de captura, cuenta y generación): `ContinuityDay` lleva esa clave, así que otra captura o generación con los mismos IDs la reinicia. Salir de Hoy, recargar o bloquear la descarta. No se guarda nada en el navegador ni en el servidor.
- **Fase de la copia.** Vacía: no se ofrece la jornada (Hoy ya dice «Importa una captura…» y la API responde `phase: 'empty'`). Importada sin activar: se puede organizar con lo importado y se explica que editar exige completar la preparación. Activa: completa.
- **Guardados sin resolver.** Un guardado incierto o en curso de la **misma identidad** hace que la tarea no se planifique sola y la jornada lo avise (`outcome-pending`); el mismo ID en otra captura no hereda el aviso. Los `hints` se construyen sin prototipo.
- **Foco.** El retorno no guarda el nodo del botón (puede desmontarse mientras la tarea está «en curso») sino su nombre exacto y su sección; si no existe, la región. `restoreFocusIfRowGone(); }` se conserva literal (lo usa la mutación de D7).
- **Bloqueo.** El evento `planb:locked` retira la cola y descarta una lectura en vuelo.

## Pruebas (App compilada, API real, SQLite de archivo, 127.0.0.1, red exterior bloqueada)

`tests/e2e/hoy-cola-jornada.spec.ts` extiende el arnés aceptado por herencia (escenarios sembrados por `scenario.txt` del caso; nueva captura con los mismos IDs). Los recuentos salen del servidor. **17 casos**: entrada y foco; 30/60 min calculados con un oráculo voraz **aparte** del producto sobre el orden real de la cola de la fixture actual (Alfa 20, Beta 25, Gamma 30, Delta 15 por posición: 30 min → Alfa, 10 libres; 60 min → Alfa + Beta + Delta = 60); duración desconocida; selección que excede (25 + 30 sobre 30 → «25 min por encima»); IDs `__proto__`, `constructor` y `toString`; relación ausente y no comprobable; 205 tareas (cola 200, 5 fuera del límite); copia vacía; importada; error de lectura/incompatible/última lectura; misma copia frente a otra identidad; ficha desde la jornada (1 PATCH condicionado, 0 legados, historial del ID exacto, «ya no aparece» y foco); guardado sin resolver con otra captura; Agentes; teclado y 1440/390/320 px con capturas de la entrada y de la jornada (inspeccionadas) y sin desbordamiento.

Resultados y estabilidad: ver la sección «Ejecuciones» al final (se rellena con los números reales).

## Límites y hallazgos

- **Sondas del arnés aceptado.** `CONTROL · … hoy NO lee la cola estructurada` (línea base de A3) pasa a ser rojo por diseño: Hoy ya la lee. Las dos sondas A3 pasan a verde. Esa especificación está bajo una unidad aceptada; no la edito. Hace falta una unidad pequeña que **sustituya** ese control por su sucesor (propongo `CLAUDE-HOY-PROBES-A3-ACTUALIZAR`).
- **PID reutilizado.** En una ejecución, `assertAllClosed` del arnés informó «sigue vivo tras su cierre» para un PID con recibo de cierre. Windows reutiliza PIDs; las dos repeticiones siguientes dieron 17/17. Lo dejo como hallazgo del arnés (no es producto).
- **ContinuityDay** ya guarda las estimaciones por propiedad propia (275): `__proto__` pasa de extremo a extremo.
- **Vacío.** La jornada no se ofrece sin captura; la ruta `phase: 'empty'` del adaptador solo se alcanzaría si la copia se vaciara con la jornada abierta.
- **Persistencia.** Las decisiones de la jornada no sobreviven a salir de Hoy: es el ámbito documentado. Si se quiere conservarlas entre vistas, hace falta un contrato nuevo de almacenamiento (no lo asume esta unidad).
- No se montó ninguna segunda entrada ni se tocó `App.tsx`. No se declara terminada la prueba con `main` compilado con esbuild: esa es la prueba de salida del paquete A4.

# R2 · Barrera de contexto (devolución 290)

**Hallazgo:** tras recapturar con los mismos IDs, la jornada de la captura anterior seguía utilizable (cola 503, cola pendiente o cuerpo viejo recibido tarde) y abría tareas por ID. No había PATCH erróneo (la ficha relee y rotula la copia actual), pero el plan, sus fijados y estimaciones eran de otra copia.

**Corrección (solo `LocalOperations.tsx` y CSS):**
- Cada lectura de Hoy es una **época**. La jornada ofrece acciones solo si su cola se leyó **en la época actual** y es de la misma copia que la lista de Hoy. Se cruzan únicamente los campos comunes entre la lista v1 y la cola 230 (`instanceId`, `captureId`↔`snapshotId`, `capturedAt`); **faltan inicio de captura, cuenta y generación en v1**, así que esto no se llama comparación completa: cualquier otra lectura sin confirmar deja el plan en pausa.
- Un cambio conocido de la copia en la lista **retira** el plan anterior (con sus fijados y estimaciones). Cola pendiente, con error o recibida tarde de otra copia no renueva la autorización; si llega una cola de otra copia se descarta y se relee una vez.
- Sin confirmar, lo mostrado queda solo de consulta (`inert` + aviso «Comprobando…» / «No se pudo confirmar la copia actual»); además `openFromDay` ignora la llamada. La misma copia comprobada conserva las estimaciones (misma clave completa); otra captura, generación o cuenta las reinicia en cuanto llega su cola.
- El bloqueo descarta lecturas en vuelo y retira la jornada.

**Regresiones integradas (5)** con barreras explícitas: cola 503 tras recapturar; cola pendiente; cuerpo viejo recibido tarde (se espera su llegada real y dos cuadros; además comprueba que no aparece ningún dato de la captura vieja: allí Delta tenía una relación ausente); refresco de la misma copia en pausa y estimaciones intactas; bloqueo con lectura retenida. **Con R1 (copia privada) fallan 4/5** (el de bloqueo es control: pasaba también con R1, como señaló la revisión; su lectura retenida la aborta el bloqueo, así que solo se afirma que no reaparece). Con R2 pasan 5/5.

**Ejecuciones R2:** Jornada **22/22 en tres ejecuciones** sin reintentos (17 anteriores + 5 nuevas). Regresiones: A2 14/14, Por decidir 7/7, DOM 95/95, D7+reapertura 35/35, arnés 240 13/15 (las dos A4 rojas por diseño), tsc limpio. **Contrapruebas R2:** 3/4 detectadas (no retirar el plan al cambiar la copia, aceptar una cola de otra copia, plan activo sin confirmar); sobrevive quitar la guarda de `openFromDay` porque `inert` ya impide pulsar (defensa en profundidad).

**Arnés:** en esta especificación `assertAllClosed` se sustituye por una versión que solo cuenta un PID como vivo si su línea de comandos sigue siendo la del servidor del caso (Windows reutiliza PIDs: 3 falsos positivos en ~10 ejecuciones). No toca el archivo del arnés.

**Límite conservado:** la generación no está en la lista v1: si cambia la generación con la misma captura, el plan queda en pausa durante cualquier relectura y se reinicia al llegar la cola nueva; hasta entonces la ficha sigue haciendo su comprobación de identidad completa. Una identidad completa en la lista de Hoy requeriría contrato del anfitrión (unidad nueva con Codex).

**Huellas R2 (LF):**

| Archivo | SHA-256 |
| --- | --- |
| `src/LocalOperations.tsx` | `84b4d3dc137d013491543cb21355af47de362b6b68bc46c0e852876c3aeb79a4` |
| `src/local-operations.css` | `db138aed8750b234c8cd9b16b67afed6dd9a14d48e43c42ac85f9d7ac49d0227` |
| `tests/e2e/hoy-cola-jornada.spec.ts` | `b395e4f5aa2e0fb33925af9cc092cea5008e7edb11f577f6105054cc6db70b78` |

(Lo anterior describe R1; las huellas de R1 fueron f124fbe4, 3dc0ad02 y 576349fc.)

## Ejecuciones

Comando: `npx playwright test -c tests/.tmp/hoy240-pw/pw-a3.config.ts` (workers 1, sin reintentos, `PLANB_PLAYWRIGHT_EXECUTABLE` = chrome-headless-shell 1228; la config es una herramienta local, no un entregable). Cada ejecución compila la App desde una copia privada con manifiesto de hashes y arranca un servidor real con SQLite de archivo propio por caso, clave de ensayo nueva y red exterior bloqueada.

- **A3 sobre el código final (lectura de la cola al abrir Hoy): 17/17 en tres ejecuciones completas sin reintentos** (1,8 / 1,5 / 1,6 min). Entre ellas hubo una 16/17: el `afterAll` del arnés aceptado informó que un PID con recibo de cierre «sigue vivo» (posible reutilización de PID de Windows); no se pudo reproducir en las tres siguientes y no cambia el producto. Antes del cambio a lectura al abrir Hoy hubo además una ejecución 17/17 con lectura al abrir la jornada.
- **Contrapruebas** (mutación sobre `LocalOperations.tsx`, archivo restaurado y comprobado por hash tras cada una): 7/7 detectadas — clave de identidad fija (2 casos rojos), `contextKey` fuera de los pines de guardado, retorno de foco al nodo/región, aviso de cobertura parcial oculto, lista de asociaciones no comprobables oculta, Hoy sin leer la cola, error de lectura oculto.
- **Regresiones tras el montaje** (mismas configuraciones y raíces nuevas): A2 14/14; «Por decidir» 7/7; DOM de ficha/gestor/comparador 95/95; regresiones migradas D7 y reapertura **35/35**; Node: host 12/12, ficha 8/8, resultados 7/7, adaptador 12/12, cola 25/25; `tsc` limpio.
- **Arnés de sondas 240: 12/15.** Rojas: el control «Hoy NO lee la cola estructurada» (línea base **sustituida por diseño**: Hoy ya la lee) y las dos sondas A4 (diario duradero y resumen público, pendientes de su paquete). Las dos sondas A3 pasan.

## Huellas (SHA-256 de los bytes presentados, todos LF)

| Archivo | SHA-256 |
| --- | --- |
| `src/LocalOperations.tsx` | `f124fbe450815902ff0da2e17b0b5234c67d58914ee11d9e22d29e9a69718835` |
| `src/local-operations.css` | `3dc0ad0245ebb0e03b1697bc53d65295607d0d17a4c4455545d98918b9d6a0c4` |
| `tests/e2e/hoy-cola-jornada.spec.ts` | `576349fc508770d36232dd150f6446ad9e108db31d40839bcb2e7a20575125f2` |

Capturas inspeccionadas (casos de la última ejecución completa, raíz `tests/.tmp/hoy240-run-*`): `entrada-{1440,390,320}.png` (botón «Organizar mi jornada» visible junto a «Qué atender primero») y `jornada-{1440,390,320}.png` / `jornada-{…}-completa.png` (jornada abierta con 60 min, dos tareas, saldo de 15 min, «Por decidir (6)»), sin desbordamiento horizontal.

## Siguiente tramo

- `CLAUDE-COMMITMENT-RADAR-UI` (archivos distintos).
- Unidad pequeña para **sustituir el control legado** del arnés 240 («Hoy NO lee la cola») y activar las sondas A3 como controles verdes.
- A4 (diario duradero) espera el contrato HTTP y las rutas acordadas con Codex.
