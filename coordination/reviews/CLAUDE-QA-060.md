# CLAUDE-QA-060 · Revisión independiente de SEARCH053, EXPORT054, RESTORE050 y TODAY059 (contraste con INTEGRATION058)

30/10/2026, Europe/Madrid. Autor: Claude (Sonnet 5.5), una sesión, sin subagentes. **Es una revisión, no una aceptación**: no acepto estas fuentes ni uso el actor `codex`. Sin commit, push, despliegue, instalación, dependencias, proveedores, `npm run build` ni acceso a 4331/4334. Datos 100 % ficticios.

## Dictamen por unidad (decide Codex)

| Unidad | Recomendación | Motivo |
| --- | --- | --- |
| **SEARCH053** | **Aceptable con tres correcciones menores recomendadas, no bloqueantes** | Identidad, procedencia, revisión, valores completos, límites y 10.000 registros verificados. Tres hallazgos reproducidos (F1, F2, F3), los tres de gravedad baja. |
| **EXPORT054** | **Sin hallazgos de producto: aceptable** | Archivo cifrado real descifrado y cotejado con un oráculo independiente; 409 sin custodia falsa; estados de custodia separados; guardas de respuesta tardía con sensibilidad demostrada. |
| **RESTORE050** | **Producto sin hallazgos. Devolver sus *pruebas* antes de contar con `npm test` (F4)** | El ensayo en dos procesos distintos se reproduce con oráculo propio. Pero dos tests de CLI de Codex fallan 3/3 cuando sus dos ficheros de ensayo corren en paralelo, que es lo que hace `npm test`. |
| **TODAY059** | **Sin hallazgos: aceptable** | 47/63 y 5.001/4.999 completos; tandas 20+20+7; tope de 100; la prueba propia falla 7/10 contra el código anterior al recorte, con los mismos números que reprodujo Codex. |
| **INTEGRATION058** | **No repetido por mí; solo inspeccionado** | Necesita la candidata compilada de REL046 y `PLANB_INTEGRATED_CANDIDATE`. Ver «Qué repetí y qué no». |

## Hashes congelados (SHA-256, prefijo de 16)

Cotejados **al empezar y al terminar**: 39/39 coinciden con lo presentado en el tablón; no hay mezcla intermedia. Lista completa con 64 caracteres: `tests/.tmp/qa060/hashes-presentados-2026-10-30.txt`.

```
SEARCH053   49344191ae70eb66 shared/workspace-search.ts    64b3d85ec755edb1 server/workspace-search.ts   62561ee91bf9e99f server/app.ts
            9df10b7b32960a3a src/WorkspaceSearch.tsx        756aba711ed4d201 src/workspace-search.css     8e0abbe1e966000e src/App.tsx
            451a1ddbdf6766fe tests/workspace-search.test.ts 011339926cd22178 tests/workspace-search-api.test.ts   0959a13d0961ebf3 tests/e2e/workspace-search.spec.ts
EXPORT054   b0209f1175e7bb7e src/PortableExport.tsx         2bdd54057d0a74e8 src/portable-export.css      07a351bc5a6df3bd tests/e2e/portable-export-review.spec.ts
RESTORE050  e8873f5522703a1a server/recovery-rehearsal.ts   755f25306a6a9abe server/recovery-rehearsal-worker.ts   1e3754eefe294d85 scripts/rehearse-portable-recovery.ts
            e78ebdd986261c6e tests/recovery-rehearsal.test.ts   759dc6080202a43f tests/recovery-rehearsal-cli.test.ts
TODAY059    076314173adfdd79 shared/agents.ts   df68aaee8ca8410a server/agents.ts   2505897c0ca4ca7d shared/work-queue.ts   fb0bfa05e469ed17 src/WorkQueue.tsx
            3e3bd49415d84e93 src/work-queue.css fcb41009bdb91a40 src/SalesWorkspace.tsx   a0f76ea8a94c5c67 tests/today-completeness.test.ts
            51f5d13240d8f687 tests/work-queue.test.ts   1b8f75b5fe2176e1 tests/e2e/today-work-queue.spec.ts
INTEGRATION058  bb80e282591030e9 tests/e2e/integrated-recovery.spec.ts  910243092995ac94 tests/e2e/continuity.spec.ts  cc4e8ea687ffe575 tests/e2e/v4.spec.ts
Dependencias (INTEGRITY055, solo lectura)  42e4ec0c9e20e54d server/store.ts  2d725e30c5c8ac48 server/recovery.ts  31c5065783f8af4a tests/recovery-uncertainty.test.ts
```

Mis cinco archivos (SHA-256 completos):
```
d14231bb940be29ffe5cb27a232a7a641f2f157e78a7dfba194138acbc5e557e  tests/independent-workspace-contracts.test.ts
05cc6e4ec7f8f2928c3090ff7b7e3ea5cedaae58ca27124923a7fe3df7c05291  tests/independent-export-contracts.test.ts
7241b3ae72f3dd4288d495b38de6ab8651770ac3d7003260b08f57f7e8e34e24  tests/independent-rehearsal-contracts.test.ts
3be698aacc99b04a60179a1622c3639e2793505fd289c9178730e99fdb4b3e83  tests/e2e/independent-workspace-flows.spec.ts
```
(el informe no puede contener su propio hash).

## Hallazgos (reproducción mínima)

Las pruebas que los afirman están en mis ficheros como `todo` con su referencia: **no son fallos de la suite**, documentan algo sin corregir por su dueño.

**QA060-F1 · SEARCH053 · baja · `server/workspace-search.ts:31-35`.** Al resolver las relaciones del registro abierto se usa `String(record.values[field.key])` sin comprobar que el valor exista. Un cliente sin empresa (`undefined`) o con `company_id: null` enlaza como «relacionado» la empresa cuyo ID sea literalmente `"undefined"` o `"null"`. Reproducción: `A16` (contacto `lonely` + empresa con id `undefined` → `related = [{id:'undefined'}]`). Alcance práctico: requiere IDs con esas palabras (los de HubSpot son numéricos); es un fallo de identidad, no un bypass. Corrección sugerida: ignorar valor vacío antes de buscar.

**QA060-F2 · SEARCH053 · baja · `shared/workspace-search.ts:56`.** `String(valor ?? record.id)` solo cae al ID si el nombre es `null/undefined`; con nombre `''` el resultado sale con `label: ''` y un título en blanco (el botón conserva «ID …»). Reproducción: `A17`. `server/agents.ts:19` usa `||` y no tiene el problema. Corrección: `||`.

**QA060-F3 · SEARCH053 · baja-media · `src/WorkspaceSearch.tsx:24,50,58`.** Si `localRevision` cambia (cada `refresh()` de `App`) estando en la página 2, `baseKey` cambia pero `offset` se conserva y no se envía `revision`; si la lista pasa a ≤ 20 se muestra «**21–5 de 5 resultados**», vacío y sin paginación (solo «Actualizar búsqueda» o cambiar la consulta lo arreglan). Reproducción: `A18` con el componente real y transporte ficticio. **No la he demostrado en navegador**: depende de que haya un refresco de datos con la búsqueda abierta (que es modal). Corrección sugerida: `setOffset(0)` cuando cambie `baseKey`.

**QA060-F4 · RESTORE050 (pruebas) · media para la fiabilidad de `npm test` · `tests/recovery-rehearsal-cli.test.ts` vs `tests/recovery-rehearsal.test.ts`.** Ambos comparan el listado de la carpeta fija `tests/.tmp/recovery-rehearsals` mientras el otro fichero crea ensayos. `npm test` (`tsx --test tests/*.test.ts`) ejecuta ficheros en paralelo: **3/3 ejecuciones con solo esos dos ficheros fallan los 2 tests de CLI; con `--test-concurrency=1` pasan 9/9.** No es un fallo del producto. Hay que aislar (carpeta por ejecución inyectable, o aserciones sobre su propio `runId`). Mis pruebas de ensayo usan reintento acotado para esa misma razón y no exigen «una sola carpeta».

### Observaciones (no son hallazgos)
- `server/agents.ts:79` desempata con `localeCompare` (orden ICU: `a < A < b`), no por unidad de código; es estable y determinista. Un oráculo ASCII en minúscula coincide; con IDs de mayúsculas mezcladas podría diferir de un orden binario.
- `PortableExport`: los botones se deshabilitan durante la carga, por lo que dos lecturas solapadas no son alcanzables con la UI normal; la guarda de secuencia se ejercita forzando el handler (B14, señalado como defensivo).
- `rememberExport` registra la exportación antes de que el navegador reciba el archivo: la UI lo dice con honestidad («preparado para descargar… no se ha verificado una restauración»).
- `failure()` de `WorkspaceSearch` traduce **cualquier** 404 a «esta versión no incluye la búsqueda global», incluido el `404 El registro ya no está disponible` de `search-record`. Es inalcanzable con revisión válida (un registro borrado cambia la revisión → 409); lo dejo anotado.
- En ≤ 1150 px la etiqueta «Sin próxima acción» se oculta y en ≤ 600 px «Ver oportunidad» queda como flecha (`font-size:0`, reglas preexistentes de `design-system.css`); el botón conserva su nombre accesible (aserción propia a 1440/390/320).
- A 1440 px el relleno transparente de «Ver oportunidad» rebasa 8 px el fondo de la región; no es visible ni recorta.
- PID de dos procesos consecutivos podrían coincidir por reutilización del SO: el resultado sería un falso *fallo*, nunca un falso éxito.

## Resultados reales

| Comprobación | Resultado |
| --- | --- |
| `npx tsc --noEmit` | sin errores |
| `tests/independent-workspace-contracts.test.ts` (A + D + A18) | 28 casos: **25 pasan, 3 `todo` (F1–F3)**, 0 fallos |
| `tests/independent-export-contracts.test.ts` (B) | **14/14** |
| `tests/independent-rehearsal-contracts.test.ts` (C) | **9/9**, 0 saltados (junction creada de verdad) |
| Los tres juntos | 51 casos: 48 pasan, 3 `todo`, 0 fallos, 0 saltados |
| `tests/e2e/independent-workspace-flows.spec.ts`, Chromium headless-shell 1228, un trabajador | **7/7** (varias ejecuciones; última tras añadir la aserción de nombre accesible) |
| Mismo E2E contra copia **mutada** de `WorkspaceSearch.tsx` (sin la guarda de respuesta antigua) | el test de la carrera **falla** («el estado desaparece»: spinner huérfano); en el modo serie los demás no se ejecutan |
| B14 contra copia mutada de `PortableExport.tsx` (sin guardas de secuencia/aborto) | **B14 falla** por «repone contenido ANTIGUO»; B9, B10 y B13 siguen pasando (B13 cubre `alive`, otra guarda) |
| Banco de Hoy contra `server/agents.ts` de `HEAD` (antes del recorte, hash `f1de1f06fda944b4` tras reescribir 3 imports) | **7 fallan / 3 pasan**: D3 devuelve 20 en vez de 47 y D9 20 en vez de 5.001; D4 segunda tanda 0 en vez de 20 y D5 0 en vez de 20; D2 por falta del desempate por ID; D1 y D7 por la ausencia de `listTotals` (campo nuevo). Pasan D6, D8 y D10 |
| Tests de Codex repetidos por mí (33: `workspace-search`, `-api`, `today-completeness`, `work-queue`, `recovery-rehearsal`, `-cli`) | 31 pasan; los 2 de CLI fallan en paralelo (F4) y pasan en serie |

Medidas (sin umbral, no son una garantía): búsqueda sobre 10.000 registros ≈ 46 ms por consulta HTTP; recorrer los 9.999 resultados con 200 páginas ≈ 8 s en el motor puro; importar y activar 10.000 ≈ 0,23 s; `today()` con 10.000 ≈ 43 ms; un ensayo completo en dos procesos ≈ 3–4,5 s.

## Qué cubrí por área (oráculos escritos antes de llamar al código)

- **A · Búsqueda.** Cuatro entidades, mismo ID en entidades distintas, homónimos, orden `ID exacto → prefijo/nombre → contiene → otro campo` escrito a mano y estable con la entrada invertida; acentos compuestos/descompuestos, mayúsculas, espacios y NBSP; puntuación literal; campos no declarados fuera; enum por etiqueta/valor; `0`, `false` y `null` (null no es cero); inmutabilidad (objetos congelados); recuentos globales ≠ filtro ≠ página con límites 0/1/20/21/50/51; 10.000 registros con último ID y 10.001 rechazado; 422 de consulta (corta, larga, marcas combinantes, 13 términos, `limit`/`offset` no enteros, entidades con espacio/mayúscula/coma final, revisión en mayúsculas); revisión estable sin cambios y 409 al paginar o abrir tras editar; apertura con ID de caracteres reservados, valor completo de 800 caracteres, 404/409/422 y misma ID en otra entidad; ninguna consulta modifica ninguna tabla y todas responden `no-store`. **Carreras en navegador** con transporte que ignora la cancelación y respuesta válida de la misma captura (resultado y apertura), 409 visible y recuperable, 404 antiguo no tratado como vacío.
- **B · Exportación.** API real: descarga cifrada descifrada y comparada con el fixture original + la única edición conocida (valores, historial anterior/posterior, captura, revisión); contraseña errónea, ciphertext alterado, truncado, sal cambiada y formato ajeno fallan sin tocar el origen; 409 sin custodia registrada y compatibilidad sin `revision`; 11/201/campos extra/ausentes; custodia ausente → exportada → declarada → histórica tras editar → nueva exportación sin heredar. Componente: sin resumen (404/503) no descarga ni forzando el handler, matriz de habilitación, doble activación = una descarga, contraseñas y casilla retiradas, un único intento ante 409 y revisión nueva obligatoria, 401 bloquea la pantalla, los cinco estados de custodia con frases propias, respuestas tardías tras cerrar.
- **C · Ensayo.** CLI sin opción = ayuda y argumentos con rutas/contraseñas rechazados (exit 2); ocho rechazos de admisión y ocho de alcance fixture/producción antes de crear carpeta; recorrido completo con **PID distintos entre sí y del test**, 17 + 8 comprobaciones nombradas, cifras con oráculo propio (`registros = paquete + 1`, `historial = paquete + 4`, mismo estado en ambos procesos, revisión distinta tras las operaciones), hash del artefacto, evidencia en disco y **sin contraseñas, datos de fichas ni rutas en el informe/stdout**; flujo no aplicable → `failed` en la primera fase sin segunda; worker: fuera del padre, nombre no UUID, `..`, fase desconocida, campo extra, entrada no JSON, `resume` sobre carpeta inexistente, base previa con centinela intacta y **junction real** rechazada con destino vacío.
- **D · Hoy.** Matriz de cobertura con ventana inclusiva (hoy… hoy+7), vencidas, completadas, fuera de ventana, tarea del cliente y cierre; frontera horaria Madrid/UTC; orden estable por ID y entrada invertida; 47/63; tandas 20+20+7+0 sin repetir y todas en `review`; tope de 100 exactos y rechazo siguiente; obsolescencia por edición; motor no disponible en runtime ni con datos no ficticios; ~10.000 registros con último elemento alcanzable; `queueWindow` pura. Navegador: 53/61, páginas de 20 hasta el último, búsqueda por ID/acentos sin ninguna petición, página antigua acotada, foco al limpiar, aviso explícito sin `listTotals` o con totales inconsistentes (3 variantes), sin escrituras, objetivos ≥ 44 px, teclado, 1440/390/320 sin desbordamiento. Capturas inspeccionadas: `hoy-1440.png`, `hoy-390.png`, `hoy-320.png`.

## Qué repetí y qué no

- **Repetí yo:** todo lo anterior; los 33 tests de Codex de SEARCH053/TODAY059/RESTORE050; el ensayo completo (CLI real y API) y los rechazos del worker.
- **Solo inspeccioné (estático):** INTEGRATION058. Su informe y su spec dicen: candidata aislada por ID, inventario con SHA-256 antes y después, `runtime.mjs` compilado, archivo cifrado real, `new Set(session.pids).size === 2`, edición por ID, `sending` restaurado como `uncertain` con 409 en escrituras y tras reinicio. **No he ejecutado** esos dos E2E ni sus dos recorridos antiguos; su resultado (2/2 + 2/2) es **atribuido a Codex**. La restauración de incertidumbre es de INTEGRITY055 (QA056), no la revisé aquí.
- **No cubierto:** exportación en navegador real (la cubre Codex en `portable-export-review.spec.ts`; yo solo el componente con arnés); contenido del ZIP del paquete (solo su 409 previo, que ocurre antes de construirlo); symlink de archivo (Windows: solo junction); crash real del worker; comportamiento del helper global de descarga tras navegar (límite documentado por Codex); mutación de las guardas **de servidor** de búsqueda y del worker (no hay forma de redirigir esos módulos sin tocar fuentes ajenas, así que su sensibilidad no está demostrada por mutación); lector de pantalla, Edge o Firefox (solo Chromium headless-shell).

## Límites de entorno y reproducción

Windows 11, Node 24, Chromium headless-shell 1228 de la caché de Playwright, puerto 4398, datos nuevos por ejecución, red externa bloqueada (`block-external.cjs`) y comprobada en el E2E. Las pruebas de ensayo escriben en `tests/.tmp/recovery-rehearsals` (carpeta fija del ensayo): conservo los ensayos completos como evidencia (44 carpetas, todas con `report.json`) y retiré solo restos míos exactos de iteraciones previas (14 carpetas con mi archivo centinela o vacías) sin borrado recursivo. Las pruebas de ensayo asumen que los ficheros de Codex pueden correr a la vez y no exigen «una sola carpeta nueva».

```
node --import tsx --test tests/independent-workspace-contracts.test.ts tests/independent-export-contracts.test.ts tests/independent-rehearsal-contracts.test.ts
# E2E (entorno aislado en tests/.tmp/qa060: vite build --outDir …/run/dist; esbuild server/main.ts|runtime.ts|drill-worker.ts → …/run/build/*.mjs; copiar scripts/block-external.cjs)
PLANB_EVIDENCE_DIR=tests/.tmp/qa060/evidence npx playwright test -c tests/.tmp/qa060/pw.config.ts
# Sensibilidad
PLANB_UI_SRC=tests/.tmp/qa060/mutants/export-src node --import tsx --test --test-name-pattern="B14" tests/independent-export-contracts.test.ts
QA060_AGENTS_MODULE=tests/.tmp/qa060/baseline/server/agents.ts node --import tsx --test --test-name-pattern="^D" tests/independent-workspace-contracts.test.ts
npx vite build -c tests/.tmp/qa060/vite.mut.config.ts && PLANB_RUN=run-mut npx playwright test -c tests/.tmp/qa060/pw.config.ts -g "búsqueda"
```

No resuelvo pendientes de LAB035 ni REL033, no declaro la aplicación instalada, completa o segura, y no sumo repeticiones como casos distintos (los 51 + 7 son casos distintos; las ejecuciones repetidas no se cuentan).
