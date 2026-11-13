# CLAUDE-HOY-APP-PROBES-A · Arnés y sondas de App de Hoy (R2)

6/11/2026, Europe/Madrid. R2 tras el dictamen 266. Unidad **solo de pruebas**: no cambia código de producto y **no declara ninguna capacidad terminada**. Datos ficticios, raíz propia, SQLite de archivo, red exterior bloqueada. Sin commits ni despliegues.

## Qué corrige

**F1 · una petición rechazada ya no satisface la comprobación de aplicación.** El arnés separa tres hechos:
1. *Recepción*: `loseAck` guarda el estado HTTP **real** que devolvió el servidor al PATCH de la tarea exacta (`route.fetch()`).
2. *Aplicación observada*: `assertApplied` exige, para el ID exacto, un PATCH con respuesta **2xx**, el valor esperado persistido, una **fila de historial de ese ID** con el efecto y la homónima sin cambios. Un 500 anterior a la escritura cuenta como petición pero no pasa (1) ni (3).
3. *Corte hacia el navegador*: solo se descarta la respuesta (`connectionreset`) **después** de observar la aplicación. La barrera se libera siempre en `finally`.

La sonda A4 exige antes del reinicio: respuesta `[200]`, una fila del ID exacto y `status: completed`. Tras reiniciar exige **la misma fila** (misma `id`/`at`), las mismas filas del ID, el mismo total de historial, la homónima intacta y **cero PATCH nuevos**; solo entonces llega a la barrera de producto (que sigue fallando). La identidad del intento y su verificación por lectura se añadirán con el montaje (A4).

**Contrapruebas del 500 (dos controles):** con `failFirstPatchOnNextStart` el servidor rechaza con 500 el primer PATCH *antes de escribir*: contó 1 petición, 0 aplicadas, 0 filas → `assertApplied` rechaza con «Aplicación NO acreditada»; el PATCH siguiente (mismo token, nada se había escrito) devuelve 200 y entonces sí se acredita con 1 fila. Un segundo control corre el **recorrido completo de la sonda A4** con ese 500 y falla en la aplicación, antes del reinicio (un solo arranque, 0 aplicadas, 0 filas).

**F2 · raíz propia.** `claimRoot` verifica que el padre de pruebas está dentro de `tests/` del repositorio, crea la raíz sin `recursive` y **rechaza** un destino preexistente que no creó la ejecución, uno que resuelve fuera del padre, uno que sale por `..` y uno cuyo ancestro existente resuelve fuera (enlace/junction, comprobado **antes** de crear nada). Cada **caso** usa un directorio de datos nuevo (`cases/NNN-<ejecución>`), con una clave de ensayo recién generada (`kind: test`, 32 bytes aleatorios); solo un reinicio del mismo caso reutiliza su base. **Ya no se borra nada** (ni `frozen` ni archivos de base). Un control crea un destino ajeno sintético, prueba que las cuatro formas se rechazan y que su contenido no se toca; solo elimina, sin recursividad, lo que creó él.

**Procedencia del corte.** El arnés copia a la raíz el cliente (`src`, `shared`, `public`, `index.html`, `package.json`, `tsconfig.json`) **y el servidor** (`server`, `shared`, `scripts/block-external.cjs`…), coteja **cada archivo de cualquier extensión** con el checkout (si algo cambia durante la copia se niega a continuar) y escribe un manifiesto con hash de fuentes de cliente, de servidor y de los **activos compilados** (`dist`). La App se compila con Vite desde esa copia y el servidor arranca **desde la copia privada** (sus imports son absolutos a ella), con entorno mínimo (PATH, SystemRoot, TEMP… y las variables propias), `NODE_ENV=test` y red exterior bloqueada. Un control coteja el manifiesto contra el checkout y comprueba que el servidor corre desde la copia. Las dependencias de terceros se enlazan por junction a `node_modules` del repositorio (no se copian).

**Identidad de ejecución y cierres.** Cada arranque anota PID e identidad de la ejecución (`starts.jsonl`) y el servidor los incluye en cada línea de su registro; `restart()` falla si el PID no cambia (se acredita aunque el puerto se repita) y exige el recibo de cierre del anterior. Cada cierre deja un recibo (PID, código, señal) y `afterAll` exige que **todo** proceso arrancado tenga recibo y ya no esté vivo.

**Recuentos de conflicto.** `Counts` distingue `attempts` (PATCH recibidos, cualquier estado) de `applied` (2xx). La sonda de dos pestañas exige tras el 409: 2 intentos, 1 aplicado, 1 conflicto; el comentario de la fase siguiente fija que confirmar la propuesta lleva a **3 intentos y 2 efectos** (264).

## Resultado contra la compilación actual del checkout

```
npx playwright test -c tests/.tmp/hoy240-pw/pw.config.ts      # 15 pruebas, retries: 0
```

| Clase | Prueba | Resultado |
|---|---|---|
| CONTROL | carga y Hoy; endpoint con token; guardado aplicado por una sola ruta (1 PATCH aplicado, 1 fila, homónima intacta; anota la ruta); reinicio con otro PID y misma base; raíz propia; corte acreditado; contraprueba del 500; contraprueba del 500 en el recorrido A4 | **8/8 pasan** |
| SONDA A2 | guardado condicionado; dos pestañas + comparador | pasan (A2 está montada en el checkout, en su propia reserva) |
| SONDA A2 | «Por decidir» en Resultados | falla: `FUNCIÓN AUSENTE`, tras comprobar que «sin saber si se aplicó» existe |
| SONDA A3 | cola estructurada; «Organizar mi jornada» | fallan: `FUNCIÓN AUSENTE` |
| SONDA A4 | acuse perdido + aplicación acreditada + reinicio | pasa todo hasta la barrera y **falla en `Trabajo por recuperar`** |
| SONDA A4 | `GET …/work-summary` (ruta propuesta, no acordada) | 404 |

**Estabilidad observada:** tres ejecuciones completas seguidas, sin reintentos y sobre raíces nuevas (más una cuarta solo de controles): en las tres, los mismos 10 pasan y los mismos 5 fallan, cada uno con su mensaje `FUNCIÓN AUSENTE` o el 404; y el arnés de A2 (12 pruebas) pasa 12/12 sobre este arnés. Los cierres de proceso se acreditan en `afterAll` en cada ejecución. Las ejecuciones dejan sus raíces en `tests/.tmp/hoy240-run-*` (no se borran). La línea base legada del control anterior se sustituyó por un control **independiente de la ruta** (pasa antes y después de A2 y anota cuál se usó).

## Qué NO está verificado

- Lo que cada sonda escribe tras su primera barrera (comparación, recuperación por intento exacto, verificación por lectura) se afina con el montaje.
- El rechazo de un enlace/junction intermedio está implementado y comprobado por código, **no ejercitado** con un enlace real en la prueba (sí lo están el preexistente, el exterior y `..`).
- No se usa `main` compilado con esbuild ni el menú del empaquetado: eso es la prueba de salida (264). El servidor es `createBaseApp` con `taskRevisions`, igual que `main` pero sin su arranque.
- No se probó 390/320 px ni capturas: pertenecen a la prueba de salida.
- Las dependencias de terceros no se copian (junction). Un cambio en `node_modules` durante la ejecución no consta en el manifiesto.
- Una ejecución exacta de 5 sondas rojas no demuestra su estabilidad futura; la estabilidad observada se registra abajo.

## Cómo repetirlo

Edge no está en este equipo: se usa el `chrome-headless-shell` 1228 de Playwright (`PLANB_PLAYWRIGHT_EXECUTABLE`). El andamiaje de ejecución no es un entregable: `tests/.tmp/hoy240-pw/pw.config.ts` (carpeta temporal sin seguimiento) contiene solo la configuración mínima (`testDir`, `testMatch: hoy-recuperable-240.spec.ts`, `workers: 1`, `retries: 0`, `launchOptions.executablePath`). Cada ejecución crea una raíz nueva `tests/.tmp/hoy240-run-<id>` que **no se borra** (conserva manifiesto, casos, registros y recibos); otras ejecuciones nunca la reutilizan.

## Compatibilidad

`reset()`, `requests()`, `counts()`, `state()`, `guard()`, `restart()` y el guion `root/server.mts` conservan su forma: `hoy-ficha-condicionada.spec.ts` (A2, en revisión) corre sin cambios sobre este arnés (12/12).

## Huellas SHA-256

El informe no puede contener la suya; las de arnés y especificación están en la nota de presentación.
