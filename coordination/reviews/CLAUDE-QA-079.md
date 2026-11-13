# CLAUDE-QA-079 · Revalidación independiente de las correcciones QA060/QA073

Autor: claude. Una sesión, sin subagentes. 01/11/2026. Los informes QA060/QA073 no se han tocado. Esta revisión **no acepta fuentes Codex**, no instala, no publica, no hace commit y no usa proveedores. Carpeta de evidencia propia: `tests/.tmp/qa079-99b83230-e456-4eef-9bbf-85f433357a3f/` (logs con UUID/timestamp únicos; **cero borrados recursivos y ningún log sobrescrito**; las copias, mutantes y ejecuciones están en carpetas nuevas que se conservan).

## 1. Fuentes y hashes cotejados

Las ocho unidades (SEARCH053, ACTIVATION066, MANUAL067, HISTORY064, RESTORE050, MANUAL-ID076, REHEARSAL-ISOLATION077, SEARCH-CONTEXT078) estaban en `review` con reserva. Cotejé los **45 hashes presentados** contra el disco al empezar, antes del banco final y al terminar: 45/45 coinciden. Hashes completos de las fuentes que he leído/probado:

| Ruta | SHA-256 actual |
|---|---|
| server/manual-recovery.ts | 762e6ae48882b76ff44b09b2dd0641900e8b8255ef0b4615056e25422626a731 |
| src/ManualRecovery.tsx | c353ba253d2f3b9e503e3d93d8cd22c13228f96d6c72babb3660b178e210475f |
| shared/change-history.ts | f9d6eb3c417be175d21f837a086420003ca274f1df0882a33f3c333973c80565 |
| shared/workspace-search.ts | 513a4f8344b52eefd6f0d1d9302897da54039393169666212109a68a6eb3fc33 |
| server/workspace-search.ts | a4539f4e497e6aeaa3c5e93ae76f24c4619d704c4e1a22ce959044810b9cf779 |
| src/WorkspaceSearch.tsx | 58b07fcba525971fe7a88eac817ece68678012d73ccfc3b65bfbef529c87d1be |
| src/Preparation.tsx | 38f7cc4a060181e78ea8e908c93832a7778217f61988509067cb5d3e295c5397 |
| src/preparation-review.css | b1ef56b8f1abfb6033bd6e18ec66bd63f06f284e19751df889cdcefc6112d870 |
| tests/helpers/rehearsal-workspace.ts | ff20f88e4d44c75f63e1d7ca6d845ce7c372032910bad07c6bc299b3830bd8c7 |
| tests/recovery-rehearsal.test.ts | 64178dcc2f769237861270000f1951257cd8b13c8748d7b2cb82d15c7b48afe5 |
| tests/recovery-rehearsal-cli.test.ts | 0026127d178752e56e03bdd0dda986e1e0e7de4931afe180809d3ec226449ce1 |
| tests/search-context.test.ts | 5884de3b5490c18fb0a31089bbe0d874c18df9aeb3a3c7f614f9cb5ff1664901 |
| tests/manual-recovery-id.test.ts | 5aa8138652c6e2ba6873cc5f18256e6df6631f91def5b18f61fdafc06d5400da |
| server/recovery-rehearsal.ts | e8873f5522703a1a5f1cd4704ee62feec517df3a9b8357c1e9296008a3fd6e3e |

Manifiestos completos (206→217 ficheros de src/server/shared/scripts/tests-helpers/config) en `evidence/freeze-manifest-{1-start,2-before-final,3-build-cur2,4-final}.json`. **El árbol de Codex cambió durante mi sesión**, fuera de las unidades revisadas: `server/connection.ts` (b88111890134→371ac9cee0d4) y `server/team/oauth.ts` (f7d3131c1c3c→cd64d685b36d) (HS-029), y ficheros nuevos de otra delegación (`src/ContinuityLab.tsx`, `src/continuity-lab.css`, `src/ContinuityEvidence.tsx`, `src/continuity-evidence*.{ts,css}`, `server/continuity-evidence*.ts`, `shared/continuity-evidence*.ts`, `scripts/check-release-candidate.mjs`, `scripts/demo-continuity-evidence.ts`). No son parte de esta revisión y no los he probado. El build aislado `app-cur2` (E2E final) se compiló tras los cambios de HS-029 y **antes** de los ficheros continuity-evidence; los bancos Node corren sobre el árbol vivo (último repaso: 6 bancos, ver §3).

Baseline: copia byte a byte (verificada con `diff -rq`) del corte `qa075-d90acf90…/source` en `qa079-…/baseline075` (315 fuentes, sin bases/claves). Nunca se modifica; cada contraste usa una copia nueva (`baseline-run-*`, `baseline-f4-*`) con las pruebas nuevas superpuestas.

## 2. Los 7 TODO anteriores: todos resueltos (ninguno mantenido)

Antes (QA075, Codex): A16/A17/A18, H3b, E2b, E7b, D6 fallaban como TODO. Retirados solo tras comprobar corrección **y** fallo del baseline por su causa.

| TODO | Fuente | Con fuentes actuales | Con baseline075 (causa observada) |
|---|---|---|---|
| A16 F1 | server/workspace-search.ts | pasa (+A16b) | falla: `lonely` relaciona `companies:undefined` |
| A17 F2 | shared/workspace-search.ts | pasa (+A17b/c) | falla: etiqueta `""` |
| A18 F3 | src/WorkspaceSearch.tsx | pasa (+A18b) | falla: `21–3 de 3 resultados` |
| H3b H1 | shared/change-history.ts | pasa (+H3c, H3d, H9) | falla **solo a veces** (1 de 2 ejecuciones pasó: depende de que los dígitos del ID aparezcan por azar en la marca de tiempo). La sensibilidad determinista la dan H3d/H3c/H9 |
| E2b M1 UI | src/ManualRecovery.tsx | pasa (+E2c) | falla: 0501 habilita la casilla |
| E7b M1 srv | server/manual-recovery.ts | pasa (+E7c–E7g) | falla: «Missing expected rejection» |
| D6 D1 | src/Preparation.tsx | pasa (+D6b, D6c) | falla: casilla marcada tras A→B→A |

Se añadieron: F1 positivos (ID válido, mismo ID en otra entidad, referencia literal `undefined` existente, revisión exacta/409); F2 con 0/false, solo espacios, ranking estable con entrada invertida, datos congelados; F3 con página 2 de 43 → 3 resultados (`1–3 de 3`, tres datos nuevos, sin spinner ni paginación, peticiones siempre offset 0 sin revisión heredada), A→B→A (vuelve a `1–20 de 43`, no a la 2), manejadores capturados antes del cambio sin efecto, paginación posterior con la revisión nueva.

**H9 (contrato cambiado explícitamente):** el texto buscable ya no incluye la fecha presentada (`at`); sí ID de operación, ficha, entidad, operación (metadatos admitidos), campos y valores. H9 se reescribió con oráculo de fuerza bruta (año y día devuelven 36 de 122, no 122); **H9a conserva la caracterización anterior** ejecutando `shared/change-history.ts` del baseline075 (devuelve 122/122). H3c prueba números legítimos en valores (año en un teléfono, mes+día) y que la fecha sola no coincide; se conserva 122 operaciones/rangos/ausente-null-vacío-0-false/total_changes (H1–H8 verdes).

**D1:** A→B→A con la lectura nueva pendiente: sin casilla marcada ni botón habilitado; manejador de activar capturado antes no envía; éxito/error tardíos de B no repuestan permisos ni muestran fallo ajeno; tras cargar A exige nueva aprobación y envía la revisión **nueva**; un fallo de red deja alerta + «Actualizar revisión» habilitado y el reintento funciona. **Es una corrección de intención de la interfaz: el servidor ya devolvía 409; no se presenta como cierre de un bypass.**

**M1 (alcance real):** la reproducción de QA073 usa un **remoto simulado de lectura que normaliza ceros iniciales**; no son pruebas contra HubSpot real ni hay fuente primaria que garantice esa resolución. La corrección se prueba como **política textual de IDs canónicos** `^(0|[1-9]\d*)$`: 0501/000/00/0000 se rechazan (422/validación) antes de `verify`/`read`, con mapeo, informe, marca e historial intactos y sin convertir el ID; `0` es válido (sin afirmar que exista un registro 0); 9007199254740992 y …993 se conservan como cadenas distintas (leídas y mapeadas exactas; en UI y en el POST); mismo ID en entidades distintas válido; duplicado en la misma entidad rechazado; mapeo heredado `0501` no se reasigna ni se reescribe; colisión con IDs guardados de altas fuera del lote y con registros capturados `0777`. El positivo posterior sigue verificando valores por lectura.

**44 px:** en navegador real con CSS global, el botón principal «Activar y abrir aplicación» mide 44,0 px a 1440/390/320 (altura exacta ≥44, texto completo dentro del botón, sin desbordamiento horizontal); baseline075: 32 px. Capturas `b5-activation-1440.png` y `-320.png` **inspeccionadas** (botón visible, texto íntegro, ancho completo a 320 px, estado deshabilitado). 390 px medido, **no inspeccionado visualmente**.

## 3. Resultados propios (ejecutados)

Árbol vivo, banco final (6 ficheros en paralelo; 138 casos Node con el de ensayo): workspace 32/32, export 14/14, interface-contexts 47/47, history 13/13, activation 11/11, replica 10/10, rehearsal 11/11 → **138 pass, 0 fail, 0 skip, 0 TODO**. Los tests Codex `search-context` (1) y `manual-recovery-id` (4) también pasan (5/5, ejecutados por mí, no aceptados). E2E Chromium (chrome-headless-shell de ms-playwright, puertos 4461-4469, servidor con `block-external.cjs`, datos ficticios): interfaz 6/6 y workspace 8/8 sobre build aislado; `tsc --noEmit`: **0 errores en mis 10 archivos**; 12 errores preexistentes en `independent-persisted-plan.test.ts`, `independent-return-barriers.test.ts`, `e2e/independent-return-integrity.spec.ts` (de otra unidad, no tocados).

Baseline075 con los bancos nuevos: workspace 27/32 (falla A16, A17, A17c, A18, A18b; A17b no discrimina: pasa por coincidencia de orden, queda como guarda de regresión), interface 40/47 (D6, D6b, D6c, E2b, E7b, E7f, E7g), history 9/13 (H3b, H3c, H3d, H9; H9a pasa porque caracteriza el baseline), oráculos activation+export+replica 35/35 (conservados sin cambios, hashes idénticos). E2E contra build baseline: interfaz falla B5 (32 px) y B6 (0501) y workspace falla el nuevo caso F2 (7/8). E7c, E7d, E7e pasan en baseline: son controles positivos, no discriminantes.

**Controles causales (mutantes sobre copias de las fuentes actuales, 17/17 detectados por la prueba prevista):** F1a/F1b (quitar la guarda; sobre-corrección que rechaza el literal «undefined»), F2a/F2b (`||` genérico que pierde 0/false; solo `??`), F3a/F3b (offset heredado; manejador viejo escribe en el contexto actual), D1a/D1b (sin reinicio; respuesta antigua conservada), M1a–M1g (ceros admitidos; `Number` en identidad; «0» no canónico; comparación cruda; sin guarda de mapeo heredado; UI sin regla; UI convierte con `Number`), H1a/H1b (reindexar `at`; sobre-corrección que pierde valores). Hallazgo de sensibilidad: E7f por sí solo **no** detecta M1d (la guarda de mapeo no canónico lo cubre por redundancia); lo detecta E7g, añadido por eso.

## 4. F4: ensayos aislados (sin serializar)

- Lectura del helper de Codex: copia solo `server/`, `shared/`, `scripts/block-external.cjs`, `scripts/rehearse-portable-recovery.ts` (+ `package.json`), omite ficheros con punto, `node_modules/dist/build`, rechaza enlaces, `mkdtemp` nuevo, **sin borrados**. Inspeccionado un workspace real: solo `.ts/.cjs/package.json`; el `.sqlite` y `.planb-key` son del propio ensayo ficticio. No acepta destinos arbitrarios. No registra hashes de procedencia (mío sí: `SOURCES.json`).
- **Baseline075, 3 intentos** en paralelo real (3 procesos lanzados con ≤70 ms de diferencia, intervalos solapados verificados): `recovery-rehearsal-cli` falló 3/3 (2/2 casos), `recovery-rehearsal` y mi banco antiguo pasaron 3/3 (mi banco antiguo **no era sensible**: sus 3 reintentos enmascaraban el defecto).
- Mi banco nuevo usa su propio workspace privado (UUID, fuentes copiadas con hashes), sin reintentos, exige `[runId]` exacto, **sin `--test-concurrency=1`**. Control negativo `QA079_REHEARSAL_ROOT=shared`: solo F4a falla (carpetas adversarias vistas en la ayuda); en paralelo con las suites baseline, 2/2 intentos con 4 fallos (C1, C3, C5, F4a).
- F4a (adversario): mientras corren ayuda y `--run-fixture` se crean carpetas `run-<uuid>` legítimas en la **raíz antigua**, con ≥1 creada durante la vida de cada proceso; el workspace privado solo gana el runId propio. F4b: dos ensayos simultáneos en el mismo workspace, 4 PIDs, 2 carpetas, evidencia propia. Las carpetas adversarias se retiran con `rmdir` no recursivo (vacías y creadas por la prueba).
- **Árbol actual, 5 intentos** (3 con env de evidencia propia + 2 con la configuración entregada sin variables) de los dos ficheros Codex + mi banco en paralelo: 5/5 verdes (7+2+11 casos por intento).

## 5. Límites y pendientes

- **CORRECCIÓN POSTERIOR A LA ENTREGA (01/11/2026, por orden expresa del usuario; Codex debe recotejar hashes de este informe y del test):** `src/App.tsx` ya incorpora AUTH_PARENT072 (ver `coordination/reports/CLAUDE-DELEGADO-2026-11-01.md`) y G6 se sustituyó por una comprobación del arreglo (`done` async con `await refresh()` y `key={lockEpoch}`); el comportamiento lo prueban `tests/auth-parent.test.ts` y `tests/e2e/auth-parent.spec.ts`. Versiones presentadas conservadas en `tests/.tmp/auth072-b4995c84-8302-4548-a5cb-c711d2a7b0c0/QA079-submitted-*`. El único cambio de ese test es G6; el resto del archivo y de la entrega no se modificó. El texto siguiente describe el estado **anterior** a esa corrección.
- **G6 / AUTH_PARENT072 (estado anterior):** `tests/independent-interface-contexts.test.ts` G6 **no se había modificado**; caracteriza que `App` entrega a `Protection` un `done` que ejecuta `void refresh()` sin devolver su promesa. Pasa hoy. **Es una caracterización que cambiará** cuando Codex corrija App.tsx (la coordinación ha anunciado esa corrección tras esta entrega); entonces G6 y B7 (`AUTH_PARENT072`) deberán actualizarse con un nuevo encargo. No se declara cerrado.
- F3: la reproducción es el componente real en un arnés de hooks (sin React DOM) cambiando `localRevision` por props; **no** demuestra que el operador pueda provocarlo desde el modal normal de App (no hay sondeo ni refresco con el modal abierto que lo dispare; no encontrado). No hice wrapper de navegador. D1 también es solo arnés, no navegador (el E2E B5 cubre el 409 de servidor).
- M1 sin HubSpot real; H1: H3b es dependiente del tiempo (ver §2); A17b no discrimina; 3 casos de contraste (E7c–E7e) son controles positivos.
- Un único motor (Chromium headless), sin lector de pantalla; 390 px sin inspección visual; capturas `b5-*-390`, `b1`–`b7` generadas pero solo b5-1440/320 inspeccionadas.
- Fuera de alcance, no probado: COPY074, EXPORT054/TODAY059 salvo mis oráculos conservados (sin cambios, 35/35 en baseline y actual), instalaciones 4331/4334, HubSpot/IFR/Gmail, el resto del producto, todo lo nuevo de continuity-evidence/HS-029.
- La reproducción de mi QA073 anterior (mutantes/logs) no se reconstruye; aquí no se repite ese desvío.

## 6. Rutas y comandos

Bancos: `npx tsx --test tests/independent-*-contracts.test.ts tests/independent-interface-contexts.test.ts`. Paralelo/F4: `…/work/parallel-driver.mjs`. Baseline: `…/work/runbase.sh`. Mutantes: `…/work/mutants.mjs`. E2E: `npx playwright test -c …/e2e/pw.config.ts` con `QA079_APP`, `QA079_PORTS`, `QA079_RUN`, `QA079_SPEC`. Logs y JSON de resumen en `…/logs/` (121 ficheros), capturas en `…/e2e/*/shots`.

## Hashes de mis 10 archivos de prueba

| Ruta | SHA-256 |
|---|---|
| tests/independent-workspace-contracts.test.ts | 5e3604fa70109bc7e07d2ed3d27c85bb38cfb9336e4d2b3346bc3c0e4652c4e2 |
| tests/independent-export-contracts.test.ts | 05cc6e4ec7f8f2928c3090ff7b7e3ea5cedaae58ca27124923a7fe3df7c05291 |
| tests/independent-rehearsal-contracts.test.ts | a2a555a4de6bd3a7a2aac1447b4a6c2b7bd0260ec7ebe1d80bb8a1dfb166089f |
| tests/e2e/independent-workspace-flows.spec.ts | 0a6f92790df1654916ec967ef4ac4d1c9a6b8efcf8199621c0693000236bc599 |
| tests/helpers/independent-interface-harness.ts | ce7e81c15a50499bd3fcb974bb07fc4d0c44abe10a10ff0e29143e510f972d96 |
| tests/independent-interface-contexts.test.ts | 5e5a1b0f0443e2ce7c61bd576e180206b2d8909b8a3904c51f0caeb9bc77e966 |
| tests/independent-history-contracts.test.ts | 93a3366ef16a0203a239cd9b52ff177419aaff883f1ed085c06a00da1462f1b6 |
| tests/independent-activation-contracts.test.ts | db4c503da2448ff4a2c1d8026b3358173ba9d4afce3260c3f7f6de99923098ea |
| tests/independent-replica-contracts.test.ts | 40a3cbe58c47499482171f01a76520ef49052a67bfc17f153df5afb8b14c7371 |
| tests/e2e/independent-interface-flows.spec.ts | ffcb9324664f635e871ace08313e910f1f836075cf0ce2d5fdbed12cf3752bb7 |

Sin cambios respecto a los hashes baseline (QA060/QA073): export, activation, replica y harness.

## R2 de coordinación (01/11/2026) · cotejo de la versión final con el App actual

Respuesta a la devolución del tablón (cambios posteriores a `submit` en G6/AUTH_PARENT072). **No acepta ni regulariza AUTH_PARENT072 ni SEARCH053**; el cambio de `src/App.tsx` es ajeno a mis resultados anteriores y está comunicado en `coordination/reports/CLAUDE-DELEGADO-2026-11-01.md`.

**Qué cambió después de presentar (y solo eso):** G6 de `tests/independent-interface-contexts.test.ts` (de caracterización de `void refresh()` a comprobación del arreglo) y la nota de corrección de este informe. Versiones presentadas: test `5e5a1b0f0443e2ce…`, informe `631828f0ffd42f1f…`. **Hashes finales:** test `f0f952ef68b3aaf7…`, informe `<ver sha256 del archivo; este informe se modificó al añadir esta sección>`; `src/App.tsx` `6cd5a8d29a12e406…` (antes `8e0abbe1e966000e…`). Los demás 9 archivos de prueba conservan el hash de la entrega (comprobado al inicio y al final de la repetición: `tests/.tmp/qa079-99b83230-e456-4eef-9bbf-85f433357a3f/r2-161620/hashes-start.txt` y `hashes-end.txt`).

**Repetición con el App actual** (compilación nueva `app-cur3`, carpeta `tests/.tmp/qa079-99b83230-e456-4eef-9bbf-85f433357a3f/r2-161620`):

| Banco | Resultado |
| --- | --- |
| Node: 6 contratos + contexts (`npx tsx --test tests/independent-*-contracts.test.ts tests/independent-interface-contexts.test.ts`) | **138/138**, 0 fallos, 0 skip, 0 TODO (G6 en su nueva forma pasa) |
| E2E `independent-interface-flows` (puertos 4461/4462) | **6/6** |
| E2E `independent-workspace-flows` (puerto 4463) | **8/8** |

**B7 cambió de contenido, no de resultado:** la prueba solo registra (anotación). Con el App actual el GET de estado en 503 tras un login válido muestra «El servidor confirmó el acceso, pero no se pudo terminar de abrir la copia. Reintenta la apertura…» con `pageerrors=[]` y sin abrir la app: ya no se reproduce el rechazo sin atender ni la apertura sobre estado ausente. La caracterización anterior de B7 queda superada; no la sustituyo por una aserción nueva porque ese comportamiento lo cubren `tests/auth-parent.test.ts` y `tests/e2e/auth-parent.spec.ts`.

**Nota de procedimiento:** mis dos primeros intentos de E2E de esta repetición fallaron por no pasar las variables de origen que los specs exigen (`QA079_MAIN`, `QA079_AUTH`, `QA079_WS_URL`); son errores de lanzamiento míos, conservados en `tests/.tmp/qa079-99b83230-e456-4eef-9bbf-85f433357a3f/r2-161620/e2e-independent-*-flows.log`, no del producto. Las ejecuciones válidas son `e2e-interface.log` y `e2e-workspace.log`.

**Límites sin cambio:** no se repitieron los mutantes, el baseline ni F4; este cotejo cubre solo el banco afectado por el cambio de App.
