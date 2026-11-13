# CLAUDE-QA-056 · Verificación independiente de las correcciones F1/F2/F3

30/10/2026. Una sesión Claude, sin subagentes. Revisión independiente por hashes de INTEGRITY055, REL046 y ASSETS057, más la repetición de SAFE049 y BACKUP041 sobre el `Store` corregido. **No es una aceptación del tablón, de las fuentes ni un despliegue.** Ninguna fuente de Codex se editó. `CLAUDE-QA-052.md` se conserva intacto como evidencia histórica: este informe no reescribe su pasado.

## 1. Resultado ejecutivo

| Unidad | Dictamen | Resumen |
|---|---|---|
| **Store / Recovery** (INTEGRITY055) | **Favorable** | F1 corregido por la causa correcta. Matriz de 5 estados de plan × 9 formas de operación, en restauración y en reinicio: todo `sending` pasa a `uncertain`, el plan queda `partial` con `approvedAt:null`, no hay reenvío ni resultado remoto inventado, y los controles positivos se conservan. Una observación de robustez (R1, bajo, no bloqueante). |
| **BACKUP041** (verificador de copia) | **Favorable** | Módulo sin cambios (`5cbcd229…`). Mis 12 pruebas de QA052 y el caso F1 original pasan sin rebajar expectativa. Su recuento de inciertas mejora porque usa el `Store` corregido. |
| **SAFE049** (cobertura frente a una referencia) | **Favorable, sin hallazgos** | Semillas y oráculo de QA052 sin cambios: 11/11 contra el `Store` corregido. Añadida una prueba de interacción (la normalización del plan no pasa por cobertura equivalente y es idempotente): 12/12. |
| **REL046** (candidata) con **ASSETS057** | **Favorable con limitaciones declaradas** | F2 y F3 corregidos y probados con mi banco. Quedan límites medidos (suelo de la plataforma, esbuild/vite nativos no observables, enlaces de archivo sin verificar) y una observación (O1, omisión silenciosa fuera de `public/`). La candidata real de Codex es coherente en solo lectura; no está instalada ni aprobada. |

Resultados propios sobre las fuentes presentadas (pass/fail/skip/TODO por separado):

| Banco | Pass | Fail | Skip | TODO |
|---|---|---|---|---|
| independent-recovery-integrity (20) | 20 | 0 | 0 | 0 |
| independent-backup-coverage (12) | 12 | 0 | 0 | 0 |
| release-candidate-adversarial (18) | 18 | 0 | 0 | 0 |
| **Total propio** | **50** | **0** | **0** | **0** |

`npx tsc --noEmit`: sin errores. Focales de Codex que ejecuté: 41/41 (recovery-uncertainty, recovery-preflight, recovery-preflight-cli, backup-coverage, backup-coverage-cli) y 3/3 (release-candidate-completeness). Contra las **versiones anteriores** los mismos bancos fallan por la causa correcta (sección 6): integridad 13 pass / 7 fail, cobertura 11 / 1, candidata 8 / 10.

## 2. Congelación y cotejo (antes de reclamar y al terminar)

Estado del tablón al reclamar: CODEX-INTEGRITY-055, CODEX-REL-046 y CODEX-ASSETS-057 estaban en **review**, con reserva activa. Sus hashes presentados coinciden con el disco, y siguen idénticos al terminar (`tests/.tmp/qa056/logs/hashes-before-final.txt` = `hashes-after-final.txt`).

| Fuente | SHA-256 | Origen |
|---|---|---|
| server/store.ts | `42e4ec0c9e20e54dcf12d3d712e8ae30513a7949de0c7c93bb9a724cd965e197` | INTEGRITY055 (baseline `837d54fa…`) |
| server/recovery.ts | `2d725e30c5c8ac48cf218e188ce68aa183fc6d18a37f2c980d1d541ad5021230` | INTEGRITY055 (baseline `ec23cf90…`) |
| tests/recovery-uncertainty.test.ts | `31c5065783f8af4a9b429281c27acbc0d8d2c9c0d4314e6285006e6f2b1c1a9f` | INTEGRITY055 |
| scripts/prepare-release-candidate.mjs | `34886dad490f3fafbf0f61c9c03c049dcf0b00fcff830002aec6ea308eb05778` | REL046 (baseline `bd3d8388…`) |
| tests/release-candidate-completeness.test.mjs | `c966ed4dc718fab82525ec3be0b3ada1a27b8d613c2c89e404d649de81749a69` | ASSETS057 |
| server/recovery-preflight.ts | `5cbcd229a9b7e5ba08ac7b785542819e937412f9ae9def176d0f5b6776636a3b` | BACKUP041, sin cambios |
| server/backup-coverage.ts | `be819d0ab21cae9501fac5f15c19190f6a94becd02c62936f93873641a3a6940` | SAFE049, sin cambios |
| scripts/check-recovery-copy.ts / check-backup-coverage.ts | `b30b4489…` / `2f97d79e…` | sin cambios |

Diff de las fuentes frente al snapshot QA052 de Codex (`tests/.tmp/qa052-review-8458cf2d…/source`): `store.ts` sustituye 2 líneas por 4 en `restoreBundle`; `recovery.ts` cambia 2 líneas del constructor; el script cambia las líneas de captura pública, exclusiones, entorno y esbuild. Nada más.

**Copias de trabajo congeladas** (`tests/.tmp/qa056/`, `manifest.json` con hashes; `server/ shared/ scripts/` + junction a `node_modules` existente, sin instalar nada):
`current` (fuentes presentadas) · `baseline` (snapshot QA052 completo) · `hybrid` (current con `store.ts`+`recovery.ts` anteriores) · `only-store-old` · `only-recovery-old` (current con solo uno de los dos archivos anteriores). Los bancos se apuntan a ellas con `QA056_ROOT` / `QA056_SCRIPT`.

## 3. Mis bancos (hashes y comandos)

| Archivo | SHA-256 | Antes (QA052) |
|---|---|---|
| tests/independent-recovery-integrity.test.ts | `11277086196ee4d7464a02f905d0f0305ca3edcf4dbf805f7c7f7aa1cc02edd2` | `12bb554c…` |
| tests/independent-backup-coverage.test.ts | `09fbd66df134cd7846c0b8021bf13bc545da3d9c017ccefb0853e101096a01c5` | `808e4fb3…` |
| tests/release-candidate-adversarial.test.mjs | `15a9790fc5049840fe991c45298406995a9b27cf28663238d7ba34df1789d266` | `ab3f9373…` |

```
node --import tsx --test tests/independent-recovery-integrity.test.ts      # ≈18 s
node --import tsx --test tests/independent-backup-coverage.test.ts         # ≈30 s
node --test tests/release-candidate-adversarial.test.mjs                   # ≈80 s
QA056_ROOT=<raíz> …   QA056_SCRIPT=<script> …                              # apuntar a otra versión (QA052_* sigue admitido)
```

**Cómo se cuentan las 35 de QA052.** Ejecuté primero los tres ficheros **originales sin tocar** contra las fuentes corregidas: integridad 13/13 (incluido el caso F1, que ahora pasa), cobertura 11/11 y candidata **9/11**. Las 2 que fallan son exactamente los dos cambios de contrato justificados abajo (prueba 0, fijación de versión; prueba 2b, entorno), y el caso F2 original pasa. Después las evolucioné: 13 + 11 + 11 = 35 originales conservadas (con las dos expectativas cambiadas) más 15 nuevas = 50.

Una anotación honesta: el primer log de cobertura original (`orig-coverage-vs-current.log`) mezcla dos ejecuciones simultáneas por un error mío de lanzamiento en segundo plano. La evidencia válida de esas 11 pruebas es `final-coverage-live.log` (12/12, las 11 originales con el mismo código).

## 4. Cambios de expectativa y por qué

1. **`REVIEWED_SHA` `bd3d8388…` → `34886dad…`.** El script presentado es otra versión. Se cotejó byte a byte contra el tablón, el informe REL046 y la copia dentro de la candidata real **antes** de cambiar la constante. No se ajustó para esconder un fallo: la versión anterior se conserva como constante `QA052_SHA` y la prueba 0 la identifica en modo alternativo.
2. **Prueba 2b (entorno).** Antes: «la lista negra retira lo que nombra y `QA052_BENIGN` se hereda» (caracterización de un riesgo residual). Ahora el contrato es otro: **lista permitida** del sistema operativo. Exijo ausencia de **todo** canario inventado, tanto con forma de credencial como inocuo, de sistema operativo o con otra capitalización, y conservación de PATH/SystemRoot/temporales. La expectativa antigua falla contra la fuente nueva en una sola aserción (`QA052_BENIGN` pasa a `absent`); las listas de credenciales ya pasaban.
3. **F2.** Antes era un fallo intencionado («un activo no cubierto desaparece sin aviso»). Ahora exige lo contrario: todo archivo público regular admisible se captura por bytes y lo no capturable consta como exclusión. El caso original, sin editar, ya pasa contra la fuente nueva.
4. **F1.** El cuerpo del caso original no cambia. Solo se quita el prefijo «HALLAZGO» del título, porque ya no es un defecto abierto.

Ninguna otra aserción se relajó. Se **endurecieron**: la fuga de entorno se decide **por valor** (un valor canario visible en un hijo), no por la presencia de un nombre; y cada rechazo del banco de integridad sigue exigiendo que el original sea válido y la mutación esquema-válida.

## 5. F1 · Store y Recovery

**Oráculo propio** (escrito desde el encargo, no leído del código): todo `sending` → `uncertain`; si queda algún `sending/uncertain` o el plan era `applying` → `partial` con `approvedAt:null`; una aprobación ordinaria restaurada vuelve a `review` (solo al restaurar un paquete, no al reiniciar); en cualquier otro caso el plan no cambia; el resto de operaciones, registros, historial y captura no cambian nunca.

| Prueba | Qué cubre | Resultado |
|---|---|---|
| F1 (original QA052) | `sending` bajo review/approved/partial/complete | pasa, sin rebajar |
| F1-1 | 5 estados de plan × 9 formas de operación en `restoreBundle`: estado de cada operación, mensaje, `approvedAt`, entrada no mutada, registros/historial/captura idénticos, resumen del verificador, aviso REMOTE_RESULT_UNCERTAIN, reinicio posterior idempotente y bloqueo completo | pasa |
| F1-2 | Controles: aprobación ordinaria → review; plan completo realmente resuelto sigue completo y no bloquea la edición; `applying` sin envío en vuelo → partial/null con operaciones intactas y reaprobable | pasa |
| F1-3 | Sin reenvío ni resultado inventado: resolver con un ID inexistente o con el valor antiguo en el remoto se rechaza (409) sin escribir; con el cambio realmente presente se resuelve y el plan se completa **sin ninguna escritura** remota | pasa |
| F1-4 | Constructor de Recovery (reinicio) sobre planes persistidos de versiones anteriores, 45 combinaciones, segundo reinicio idempotente, y control: una aprobación ordinaria **no** se retira al reiniciar | pasa |
| F1-5 | Generativo: 4 semillas × 40 casos, 1–5 operaciones de estado aleatorio, restauración y reinicio contra el oráculo (solo semilla/índice en el fallo) | pasa |
| F1-6 | Observación de robustez (R1) | caracterizada, ver abajo |
| F1-7 | **Mapa causal**: acumula qué propiedad concreta se incumple en cada combinación | 0 propiedades incumplidas |

Bloqueos verificados en todo plan con resultado desconocido: editar (409 «Resuelve la devolución parcial»), aprobar (409 «resultados inciertos»), aplicar (409 «Revisa y aprueba»), decidir (409), refrescar (409) y crear otro plan (409). Con un remoto que cuenta llamadas: **cero llamadas** (ni lecturas) desde esas vías, y el plan no cambia al intentarlas.

**Hallazgo de la versión anterior que ahora se ve con claridad:** con las fuentes de QA052, F1-7 registra `RESENT_TO_REMOTE ×18`. Un plan persistido `approved` con un `sending` se aprobaba (`approve` solo bloqueaba `uncertain`) y `apply` **volvía a enviar** `update,create`. F1 no era solo un recuento erróneo del verificador: era un camino real de reenvío para planes heredados o artefactos manipulados.

### Aislamiento por archivo

| Variante | Propiedades incumplidas (F1-7) |
|---|---|
| `current` | ninguna |
| `baseline` y `hybrid` (store+recovery anteriores) | idénticas entre sí: SUMMARY_UNDERCOUNT ×20, SENDING_REMAINS ×40, PLAN_STATUS_WRONG ×36, OP_STATUS_WRONG ×40, APPROVAL_NOT_RETIRED ×48, EDIT_NOT_BLOCKED ×12, APPROVE_NOT_BLOCKED ×15, RESENT_TO_REMOTE ×18, REMOTE_TOUCHED ×2 |
| `only-store-old` | SUMMARY_UNDERCOUNT ×20, APPROVAL_NOT_RETIRED ×3 |
| `only-recovery-old` | SENDING_REMAINS ×20, PLAN_STATUS_WRONG ×18, RESENT_TO_REMOTE ×6, EDIT_NOT_BLOCKED ×6, APPROVAL_NOT_RETIRED ×27… |

Lectura: los dos archivos son **complementarios**. `store.ts` es el único responsable del recuento del verificador (que restaura en un `Store` sin `Recovery`); `recovery.ts` cubre el reinicio y el camino de reenvío. Con solo uno de los dos corregidos, el banco falla por la causa de la mitad que falta, no por otra.

### Sensibilidad (mutantes sobre copias efímeras de la fuente presentada)

| Mutante | Prueba(s) mías que lo matan | ¿Lo detecta recovery-uncertainty de Codex? |
|---|---|---|
| S1 store: sin «sending/uncertain ⇒ partial» | F1-1, F1-5 | sí |
| S2 store: no retira `approvedAt` | F1-1, F1-2, F1-5, F1-7 | sí |
| S3 store: la aprobación ordinaria no vuelve a review | F1-1, F1-2, F1-5, F1-7 | sí |
| S4 store: `sending→uncertain` solo si `applying` | F1 original, F1-1, F1-5, F1-7 | sí |
| R1 recovery: ignora la incertidumbre heredada | F1-4, F1-5, F1-7 | **no** (4/4 pasan) |
| R2 recovery: no retira `approvedAt` | F1-4, F1-5, F1-7 | sí |
| R3 recovery: sobre-normaliza (cualquier plan → partial) | F1-1, F1-2, F1-4, F1-5, F1-7 | **no** (4/4 pasan) |
| R4 recovery: sin conversión `sending→uncertain` | F1-4, F1-5, F1-7 | sí |

Los 8 mutantes mueren. Conservo estos ocho y no repito las once mutaciones antiguas de QA052: aquellas probaban el verificador y la cobertura, cuyos módulos no cambiaron.

### R1 · observación de robustez (bajo, no bloqueante)
El constructor evalúa ahora `plan.operations.some(…)` para **todo** plan persistido, no solo para `applying`. Un plan sin lista de operaciones y fuera de `applying` hacía que arrancara sin error con la fuente anterior; con la corregida lanza `TypeError`, y `new Recovery(store)` se ejecuta al construir las rutas en `server/v2.ts:21`.
```
store.set('recoveryPlan', { id: 'x', status: 'review', approvedAt: null, accountId: 'x', source: 'hubspot' });
new Recovery(store);   // TypeError: Cannot read properties of undefined (reading 'some')   (baseline: arranca)
```
No es alcanzable por los escritores de la app: solo `Recovery.save` y `Store.restoreBundle` (que valida el esquema) escriben `recoveryPlan`. Requeriría una base manipulada o una versión futura de esquema. **Recomendación** (a Codex, no la aplico): proteger con `Array.isArray(plan.operations)` o tratar un plan ilegible como «requiere revisión». Prueba F1-6 lo deja documentado como `diagnostic`, sin exigirlo.

## 6. F2 · activos públicos completos o exclusión explícita

| Prueba | Qué exige | Resultado |
|---|---|---|
| F2-1 | 18 archivos públicos: GIF, PNG en mayúsculas, webmanifest, txt, PDF, WASM, **sin extensión**, extensión arbitraria, `UPPER.HTML`, `Mixed.JSON`, archivo **vacío**, nombre con espacio y no ASCII, más 5 ya cubiertos: fuente = snapshot = runtime/dist = manifiesto (hash y bytes), sin extras ni duplicados | pasa |
| F2-2 | Seis rutas excluidas (`.secreto.json`, `.well-known/`, `build/`, `dist`, `node_modules/`, `sub/.oculto`): `excludedPublicPaths` exacto a mano, un bloqueo `PUBLIC_PATH_EXCLUDED:` por ruta, `publicAssetCoverage = {captured:18, excluded:6, complete:false}`, estado no fallido, `approved/deployed/releaseEligible` falsos, **y el canario de su contenido no aparece en ningún fichero de la candidata** (no se copia para aparentar completitud) | pasa |
| F2-3 | Control positivo: sin rutas excluidas, `complete:true`, sin bloqueo de ruta, y siguen los demás bloqueos (completar no aprueba) | pasa |
| 6 / 6b | Junctions rechazadas sin recorrer su destino, también dentro de `public/` y a mayor profundidad; una junction pública **oculta o con nombre de salida** no se sigue y se declara como exclusión | pasan |
| 7 | Un archivo público de extensión arbitraria sobre 2 MB **se detiene** (no se omite), además de los límites de código, 2000 entradas y 50 MB | pasa |
| 8 | Cambios durante la captura: añadir/quitar una ruta pública oculta o añadir un archivo público → error «cambiaron durante la captura», sin compilar | pasa |
| 8b | Cambios **después** de verificar: una ruta oculta nueva o un activo modificado → `liveSourcesStillMatch:false` y `LIVE_SOURCE_CHANGED_AFTER_SNAPSHOT`, sin alterar la lista de exclusiones registrada | pasa |
| 3 / 4 / 5 / 5b | Guarda de activos, typecheck y pruebas que fallan, y un bundle esbuild que falla detiene la candidata en ese bundle con su log y sin artefactos | pasan |

**La causa es la correcta contra la versión anterior** (`QA056_SCRIPT` = bd3d8388…): F2-1 falla con «13 de 18 omitidos del manifiesto» (los trece de extensión no cubierta) con `public-assets=true` y `cobertura=undefined`; F2-2 falla porque `excludedPublicPaths` está vacío; F2-3, 6b, 7 (un `.mp4` de 2 MB+1 se omite en vez de detenerse), 8 y 8b fallan por lo mismo. Las pruebas 0, 1, 2, 3, 4, 5, 6 y O1 (preservación y controles) **pasan** también con la versión anterior, así que el banco distingue F2/F3 de la conducta que no cambió. Los fallos de preparación del arnés (junction, permisos, typecheck) se distinguen en el mensaje («FALLO DE PREPARACIÓN/ARNÉS»); ninguno ocurrió.

### Sensibilidad F2/F3 (mutantes de la fuente presentada)

| Mutante | Matan | ¿ASSETS057 de Codex? |
|---|---|---|
| N1 la lista permitida añade `QA056_BENIGN` | F3-1 | no comparable (su canario se llama QA057_*) |
| N2 los bundles esbuild salen del runner saneado | F3-1 | **no** (3/3 pasan) |
| N3 captura pública con lista de extensiones | F2-1, F2-2, F2-3, 7, 8 | sí |
| N3b falla solo `.PNG` en mayúsculas | F2-1, F2-2, F2-3 | sí |
| N5 `excludedPublicPaths` vacío | 2, 8, 8b | sí |
| N6 sin bloqueo `PUBLIC_PATH_EXCLUDED` | F2-2 | sí |
| N7 `complete` siempre true | F2-2 | sí |
| N8 el cotejo final ignora las exclusiones | 8, 8b | **no** |
| N9 copia lo oculto de `public/` | F2-1, F2-2 | sí |
| N10 sin límite de 2 MB en `public/` | 7 | **no** |
| N11 la lista permitida sin path/systemroot/temp/tmp | ninguna | no |

Diez mueren. **N11 sobrevive y es equivalente en este equipo**: Windows reinyecta PATH, SystemRoot y TEMP aunque el padre lance el hijo con `env:{}` (medido, ver F3). La *conservación* de esas variables por la lista permitida no se puede demostrar aquí; solo que, si faltaran, el hijo las recibiría igualmente. En otra plataforma sí sería observable.

## 7. F3 · entorno de todos los subprocesos

**Instrumento:** el guardián `block-external.cjs` del workspace es la copia exacta del real más un observador de solo lectura (la prueba 0 comprueba que lo único que difiere es ese sufijo). Cada hijo node que lo carga con `--require` anota nombres de variables en minúsculas, un hash corto de PATH/SystemRoot/TEMP/TMP y qué nombres tienen **valor canario**; nunca un valor. Se observaron **19 procesos node**: typecheck, vite, **seis procesos esbuild (uno por entrada)** y los de pruebas.

- **F3-1:** 21 canarios con forma de credencial (incluidos `PASSPHRASE`, `PRIVATE_KEY`, `COOKIE`, `AUTH_HEADER`, `ACCESS_KEY`, `BEARER`, proveedores y una variante en minúsculas), 4 inocuos (uno vacío y uno de capitalización mixta), 13 de sistema operativo (HOME, USERPROFILE, APPDATA, proxies, NODE_PATH, NODE_OPTIONS…). Ninguno llega a ningún hijo: ni por nombre ni por valor. Las claves presentes en todo hijo son la lista permitida, `PLANB_UI_SRC` (la fija la herramienta para node-integration) y `NODE_TEST_CONTEXT` (la pone node:test), más el suelo de la plataforma. TZ y LANG pasan. El proceso de pruebas (nieto) imprime el estado de cada nombre vigilado y coincide con el observador. Ningún valor aparece en logs ni manifiesto.
- **F3-2:** para cada uno de los seis bundles: comprobación registrada con `ok` y `exitCode:0`, log propio, salida generada que contiene **su propia** entrada, hash del manifiesto y exactamente **un** proceso CLI de esbuild observado para esa entrada. No basta con que exista el log: N2 muestra que un bundle fuera del runner sigue generando log, y solo F3-1 lo detecta.
- **Contra la versión anterior:** F3-1 falla con 21 nombres de canarios que sí llegan al hijo (los no cubiertos por la lista negra de QA052, entre ellos `PASSPHRASE`, `PRIVATE_KEY`, `COOKIE`, `AUTH_HEADER`, `ACCESS_KEY`, `BEARER`, `CREDENTIALS`, los inocuos y los de sistema operativo). F3-2 falla porque esbuild iba por API, sin comprobación ni proceso CLI.

### L1 · suelo de la plataforma (límite medido, no atribuible a REL046)
En este Windows, un hijo node recibe del padre `USERNAME` y `USERPROFILE` **con el valor actual del padre** (y reinyecta `HOMEDRIVE`, `HOMEPATH`, `LOGONSERVER`, `SYSTEMDRIVE`, `USERDOMAIN`, `WINDIR`, `PATH`, `SystemRoot`, `TEMP`) incluso si se lanza con `env:{}`. Lo reproduce un script de control sin la herramienta (`tests/.tmp/qa056/envprobe.cjs`). Mi primera versión de F3-1 lo marcó como fuga de REL046: era un error de mi arnés, y por eso la prueba calcula ahora el suelo con un hijo de control y exige que la herramienta no deje pasar nada **más** (decisión por valor). Consecuencia: la lista permitida no impide que `USERNAME`/`USERPROFILE` del entorno lleguen a los hijos. **No afirmo que sea un sandbox hermético**; no lo es.

Límite adicional: el binario nativo de esbuild/vite hereda el entorno de su proceso node padre, que sí se observó; el propio binario no se instrumentó.

## 8. Candidata real y runtime instalado (distinguidos)

- **Mecánica (mía):** workspaces sintéticos nuevos bajo `tests/.tmp/qa056/ws-*`, con tests de negocio vacíos. Prueban mecanismo, no el producto. Se borran al terminar (`QA056_KEEP=1` los conserva para depurar).
- **Candidata real de Codex, verificada en solo lectura** (`candidate-c3b1e6d5…`, script `tests/.tmp/qa056/verify-real-candidate.mjs`): 270 fuentes y 23 artefactos, todos con el hash del manifiesto en snapshot y runtime; 10 archivos públicos byte a byte en dist; sin ficheros en runtime fuera del manifiesto; las diez comprobaciones `ok`; los seis logs y las seis salidas de bundle presentes; `publicAssetCoverage {10,0,true}`; `approved/deployed/releaseEligible` falsos; `store.ts`, `recovery.ts`, el script y los demás fuentes revisados dentro de la candidata tienen exactamente los hashes de la sección 2. **No generé yo una candidata real** (no ejecuté `--prepare` sobre Plan B) ni repetí su compilación. Hoy hay 14 fuentes capturadas que ya no coinciden con el disco vivo (otras unidades), ninguna de las revisadas aquí: una candidata nueva sería necesaria para cualquier instalación.
- **Runtime instalado (4331/4334):** no verificado, no tocado. Un build o una candidata verdes no acreditan instalación.

## 9. Observaciones

- **O1 · omisión silenciosa fuera de `public/`.** La exclusión declarada de F2 solo cubre `public/`. En `src`, `server`, `shared`, `scripts` y `tests` se capturan solo las extensiones listadas. En el repositorio real hoy quedan fuera sin declararse `scripts/hubspot-fixture.expected.json` (lo lee `scripts/verify-configured-capture.ts`), 4 `.py` y 3 `.ps1` en `scripts/`. No afecta a typecheck, vite, bundles ni a los diez tests de la candidata, y la herramienta no promete una imagen completa; pero es el mismo patrón que F2. Prueba O1 (caracterización, no se exige): `.json`, `.sql`, `.ps1` y `.MD` en esas raíces no se capturan ni se mencionan. **Recomendación:** listar esas exclusiones también (por ejemplo `excludedSourcePaths`) o capturar por directorio.
- **O2 · rutas públicas legítimas ocultas.** `.well-known/` y similares se excluyen siempre y por tanto una app que las sirva nunca tendrá `complete:true`. Es coherente con el diseño (declarar, no copiar) pero conviene saberlo antes de esperar una candidata «completa».
- **O3 · sensibilidad de los tests de Codex (no es un defecto de producto).** `recovery-uncertainty` no detecta R1 ni R3; `release-candidate-completeness` no detecta N2, N8 ni N10 (la existencia del log de cada bundle no prueba que su entorno estuviera saneado). Pasan contra la fuente corregida y fallan contra la anterior, así que sirven como regresión mínima. Mi banco cubre esos huecos.
- **O4 · el verificador no cambió pero su mensaje `approvalWouldBeReset` sigue diciendo «nueva revisión»** para un plan aprobado con incertidumbre, que acaba en `partial` y no en `review`. La aprobación sí se retira; solo la redacción es imprecisa. Cosmético.

## 10. Límites (precisos)

- **Enlaces de archivo:** `symlink` de archivo no está disponible en este equipo (permisos de Windows). El rechazo de enlaces de **archivo** queda sin verificar; las **junctions** sí se probaron (código, `public/`, a mayor profundidad, y ocultas).
- **Reinicio real de proceso:** mis pruebas de reinicio construyen `Store` en memoria con el plan persistido y llaman al constructor, que es lo que ocurre al arrancar; no abren una base de archivo en dos procesos (en Windows crearía una clave DPAPI nueva, y evité tocar ese mecanismo). La persistencia entre procesos queda cubierta solo por lo que ya ejecutan los focales de Codex.
- **Pruebas que no ejecuté:** `npm test` general, E2E de navegador, visuales; los 23 de v2 y los 9 de RESTORE050 que Codex cuenta en sus 52 (RESTORE050 no es objeto de esta revisión).
- **Plataforma:** el suelo de entorno y la equivalencia de N11 son de este Windows; en otra plataforma las conclusiones sobre PATH/SystemRoot/TEMP pueden ser distintas.
- **Candidata real propia, runtime instalado, puertos 4331/4334, build raíz, red, navegador, proveedores, despliegue, commit y push:** no usados.

## 11. Inventario de evidencia (`tests/.tmp/qa056/`, scratch permitido)

`freeze.mjs` `0bdc51b7…` · `freeze2.mjs` `a388c415…` · `mutate.mjs` `906b7480…` · `codex-vs-mutants.mjs` `df42196a…` · `verify-real-candidate.mjs` `bf3b1ad3…` · `envprobe.cjs` `9244e17c…` · `manifest.json` `2611a26b…` · `logs/` con los resultados de cada comparación (`final-*-live.log`, `final-*-baseline/hybrid/only-*.log`, `new-candidate-vs-baseline.log`, `causal-*.log`, `mutation-f1.json`, `mutation-rel.json`, `codex-vs-mutants.json`, `tsc-final.log`, `hashes-*-final.txt`). Los workspaces de las pruebas de Codex que ejecuté se crearon en su propio `tests/.tmp/assets057/` y no se borraron.

No he aceptado ninguna entrega, no he desplegado y no he editado fuentes ni pruebas de Codex. La decisión de aceptación es de Codex.
