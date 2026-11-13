# Revisión Codex110 · QA079 R2

1/11/2026, 16:45:27, Europe/Madrid. Dictamen: **aceptar la auditoría R2 con sus límites**. No acepta SEARCH053/App/AUTH_PARENT072 ni ninguna fuenteCodex. La divergencia de Appse conserva, no se regulariza por aprobar el informe.

## Versiones

Once hashes QA079(incluye harness/informe) iguales a submitted antes/después. De los45de sus ocho unidades objetivo, **44coinciden**; App.tsxdeSEARCH053es la excepción expresamente declarada enR2 y en CLAUDE-DELEGADO-2026-11-01.md:

- src/App.tsx: submitted 8e0abbe1e966000e65ea334901f791b524c2eca043bd09aab78feff686ade3b5; observado/propuesta 6cd5a8d29a12e406b244e12457400a167c452280422eea38a94689996109f4fc

Se ensayó la propuesta actual como dependencia observada, no aceptada. G6es una comprobación **estática** de doneasync/awaitrefresh/keylockEpoch, no prueba funcional del padre. Las pruebas auth-parentdel otro autor y B7no se convierten en evidencia propia aquí. B7actualsolo registra una anotación; el autor lo declara y remite la prueba de comportamiento a AUTH_PARENT072. La afirmación antigua45/45describe un corte anterior y queda sustituida por la excepciónR2, no por normalización de hashes del tablón.

Snapshot propio de208inputs en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/qa110-dc3bbaa8-183e-45c6-ac5b-c981d15ef33c; fuentes y tests exactos, dependenciasnode_modulesexistentes no congeladas. Se excluyeron las24rutas de106en curso al recopilarserver/shared/src; no se revisan sus borradores. Baseline075se cotejó con su manifiesto315y se copió privadamente antes de superponer las pruebas nuevas; el corte histórico original no se modifica.

## Repetición propia

**138/138casos deQA079,0fail/skip/TODO**, más9casosCodexdeensayo, no147casos nuevos deClaude:

-127/127en workspace32/export14/contexts47/history13/activation11/replica10.
-Enparalelo real:11/11independent-rehearsal,7/7recovery-rehearsal,2/2CLI. Tres procesos lanzados con18msde diferencia máxima; solapamiento conjunto21151ms por start/end observados, sin --test-concurrency=1. Cada banco usa su workspace/folderspropios. F4a/F4binternos también pasan con adversario y dos procesos simultáneos.
-Typecheck focal estricto de los siete bancos/imports limpio. No tscglobal o navegador.

Logscontrol127/parallel-audit11/parallel-core7/parallel-cli2/typecheckyfinal.json. Procesos/fixtures nuevos en copia privada, claves/contraseñas ficticias, sin bases previas o equipooriginal. Unestado working/lock no se usó como prueba de actividad del modelo. No se borraron logs ocarpetas de ensayo; F4retira solo sus propias carpetas adversarias vacías mediante rmdirno recursivo. Todos los procesos de este banco terminaron por su handle/códigosobservados.

## Contraste causal de los TODO retirados

Mismos tests nuevos sobre baseline075privado, selección determinista: **0pass/7fail/0TODO**. Se revisaron las siete causas, no solo el exit1:

| Caso | Fallo antiguo observado |
| --- | --- |
|A16 |relación ausente enlaza companies:undefined |
|A17 |nombre vacío produce etiqueta vacía en vez deID |
|A18 |rango21–3envez1–3al cambiar revisión |
|D6 |A→B→Acon lectura pendiente conserva aprobación |
|E2b |UIadmite0501sin el diagnóstico de canonicidad |
|E7b |servidor no rechaza0501antes del remoto |
|H3d |sobran84operaciones que solo coinciden por fecha |

Para el huecoH1se usaH3d en lugar de afirmar queH3bes determinista:el propio informe admite queH3bpuede pasar por coincidencia de dígitos. H3c/H9verdes actuales conservan números legítimos de valores y el oráculo de fuerza bruta;H9acaracteriza expresamente el contrato anterior, no se borra esa historia. No se exige volver aindexar fecha para reproducir el comportamiento viejo. M1es política textual con remoto simulado, no prueba de normalización de IDs enHubSpotreal. D1corrige intención de aprobaciónUI; el servidor ya protegía con409.

**Control negativo de aislamiento propio:**el mismoF4acon QA079_REHEARSAL_ROOT=shareden la copia privada falla0/1por ver carpetas ajenas creadas mientras corre la ayuda. Con el workspace privado pasa. Se confirmó la coincidencia temporal por el oráculo deltest. No se afirma haber repetido los tres intentosbaselineparalelos o los17mutantes del autor; esos resultados siguen atribuidos. Los siete contrastes nuevos y este control no se suman a138como garantías nuevas.

## Qué se inspeccionó y qué no

Leídos los oráculos de relaciones/etiquetas/paginación/contextos/IDs/caché de aprobaciones, H9y el arnés de ensayos. Progresos positivos, valores0/false, IDsgrandescomocadenas, mapas/mark/historial antes/después, respuesta tardía y manejadorcapturado diferenciados. A17bes guarda positiva aunque no discriminase elbaseline;E7c–E7eson positivos, no mutantesdetectados. No se reconstruye evidencia eliminada deQA073antigua.

E2E6+8y17mutantes son del autor, incluidos los E2ER2deapp-cur3; no ejecutados por este revisor. Se inspeccionaron sus capturasR2b5-activation-320/1440:acción principal y texto completos, estado deshabilitado, sin overflow visual aparente. No medida nueva propia de44px, sin390inspeccionado/Edge/lector/contrastecalculado. ContextosF3/D1son hooksimulados, noReactDOM; no se demuestra un trigger normal enApppara cambio externo con modal abierto.

No se declara ausencia universal deDPAPI:algunos tests de disco pueden proteger clavesficticias nuevas conWindowsactual; no se recuperan claves existentes u otro equipo. La aclaración equivalente de109se registró documentalmente sin cambiar producto o pruebas. No proveedor/redexterna/cuenta/dependencias nuevas/rootbuild/dist/navegadorusuario/instalación/commit/push/despliegue. No hay candidataactualizada o checkoutglobalverde por esta aceptación:QA091F1–F3yAppsiguen pendientes;F4corregido109review, y036sinreserva/submitnointegrado.

## Hashes QA079 aceptados

- tests/independent-workspace-contracts.test.ts: 5e3604fa70109bc7e07d2ed3d27c85bb38cfb9336e4d2b3346bc3c0e4652c4e2
- tests/independent-export-contracts.test.ts: 05cc6e4ec7f8f2928c3090ff7b7e3ea5cedaae58ca27124923a7fe3df7c05291
- tests/independent-rehearsal-contracts.test.ts: a2a555a4de6bd3a7a2aac1447b4a6c2b7bd0260ec7ebe1d80bb8a1dfb166089f
- tests/e2e/independent-workspace-flows.spec.ts: 0a6f92790df1654916ec967ef4ac4d1c9a6b8efcf8199621c0693000236bc599
- tests/helpers/independent-interface-harness.ts: ce7e81c15a50499bd3fcb974bb07fc4d0c44abe10a10ff0e29143e510f972d96
- tests/independent-interface-contexts.test.ts: f0f952ef68b3aaf7224a6dcf0685a7c5c04a575b99a3e6ec9b8d630a832d46bf
- tests/independent-history-contracts.test.ts: 93a3366ef16a0203a239cd9b52ff177419aaff883f1ed085c06a00da1462f1b6
- tests/independent-activation-contracts.test.ts: db4c503da2448ff4a2c1d8026b3358173ba9d4afce3260c3f7f6de99923098ea
- tests/independent-replica-contracts.test.ts: 40a3cbe58c47499482171f01a76520ef49052a67bfc17f153df5afb8b14c7371
- tests/e2e/independent-interface-flows.spec.ts: ffcb9324664f635e871ace08313e910f1f836075cf0ce2d5fdbed12cf3752bb7
- coordination/reviews/CLAUDE-QA-079.md: f51ab4122ddc32b9cd6c75369f4e4d73db5ed9b99ea719cef858ef8a34263311

Se acepta solo esa auditoría. El informe110se presenta a su vez para revisión, sin autoaceptarlo.

Aceptación registrada:CLAUDE-QA-079done;SEARCH053yAUTH_PARENT072noaceptadas por esta revisión.
