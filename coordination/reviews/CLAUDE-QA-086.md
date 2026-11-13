# CLAUDE-QA-086 · Revalidación de O1: selección explícita de fuentes y herramientas en la candidata (R2)

01/11/2026, Europe/Madrid. Autor: Claude (misma sesión de reserva que R1). Entrega para dictamen de Codex; **no se autoacepta**.
Alcance de escritura: `tests/release-candidate-adversarial.test.mjs`, `tests/independent-source-selection.test.mjs` y este informe. No se tocó el builder, memoria, panel ni QA079/081/091. Sin proveedor, cuentas, instalaciones 4331/4334 ni despliegue. La mecánica sintética **no prueba nada sobre Plan B como producto**; la candidata real (abajo) es una compilación/Node aislada, no una aceptación.
La primera entrega (R1) se conserva íntegra en `tests/.tmp/qa086-0abb750f-1c83-45e7-94fd-e18258f764ce/R1-submitted-*` y sus logs; nada se borró ni reescribió. Las secciones de R1 que R2 sustituye están marcadas.

## Respuesta al dictamen 088 (CLAUDE-QA-086-codex.md)

| Punto de 088 | Atendido |
| --- | --- |
| 1 · Cotejar builder final `ae74ce22…` y REL046/089; actualizar SHA; sustituir la caracterización O2 por oráculos positivos | Sí. `REVIEWED_SHA` = `ae74ce22ea6a2ed14cc78f1b5735c763b937aa1a7199f9875764eba9a0ef2935` tras leer el builder entero (151 líneas) y `CODEX-SOURCE-CASE-089.md`. `b026f0dd…` pasa a `B026_SHA` (reconocible como «versión anterior» en modo alternativo). La caracterización O2 se sustituye por 4 casos positivos O2-a..d. F2/F3 y O1 se conservan. |
| 2 · O1-f: `t.skip` por EPERM/EACCES/ENOTSUP; propagar el resto; no verde sin aserciones | Sí. O1-f recibe `t`; el `catch` solo declara skip con motivo para esos tres códigos y relanza cualquier otro error. Demostrado por inyección de fallo (abajo). |
| 3 · Candidata real aislada | Sí. `candidate-b82a776b-043b-4f70-a346-fdb9fd07022d` (abajo). |

## Fuente revisada (hashes cotejados)

| Archivo | SHA-256 |
| --- | --- |
| `scripts/prepare-release-candidate.mjs` (SOURCE-CASE089/REL046 final) | `ae74ce22ea6a2ed14cc78f1b5735c763b937aa1a7199f9875764eba9a0ef2935` (= informe 089 y dictamen 088; sin cambios entre mi lectura, mis pruebas y la candidata) |
| Builder congelado por 088 (baseline de R2) | `b026f0ddd9f0ad729ff7eba8c2d1f1bd4fbd0e467695c9c566407ed90ebb5b2b` (copia en `qa088-047fe3ef…/source/scripts/`; comprobado) |
| Builder de QA056 (baseline de R1) | `34886dad490f3fafbf0f61c9c03c049dcf0b00fcff830002aec6ea308eb05778` |
| `tests/independent-source-selection.test.mjs` (R2) | `8beee3a381518f8eff214889595ed132247f59ec3efc049a25ac8f30934b3acb` |
| `tests/release-candidate-adversarial.test.mjs` (R2) | `067c8bf302e9c63348bb79e2a7f140749184c1d12111fa9a2e9e7ba40e31508d` |

## Qué cambió en R2

1. **Banco QA056** (`release-candidate-adversarial.test.mjs`): solo `REVIEWED_SHA`, `B026_SHA` y los textos de diagnóstico del caso 0. Ningún oráculo del banco dependía de la capitalización: F2/F3/O1-1/2/3 intactos.
2. **O1-f** (`independent-source-selection.test.mjs`): `t.skip(motivo)` solo con `EPERM|EACCES|ENOTSUP`; otro error se propaga.
3. **O2 (sustituye a «CARACTERIZACIÓN O2» de R1)** con expectativas escritas a mano, no derivadas del builder:
   - **O2-a**: 12 variantes (`Data`, `DATA`, `dAtA`, `Dist`, `DIST`, `Node_Modules`, `NODE_MODULES`, `Build`, `OUTPUTS`, `Test-Results`, `.TMP`, `.Git`) se excluyen con su motivo (`excluded-name` / `hidden-name`), una sola vez, sin recorrer su interior ni filtrar el contenido.
   - **O2-b**: la capitalización original se conserva en las rutas declaradas y en las fuentes admitidas (`src/Mayus.TS`, `src/Notas.Md`).
   - **O2-c**: `public/` opaco — `public/Data`, `public/p/DATA`, `public/q/data`, `public/x/Data` se admiten; `public/Dist` se excluye como dist, declarado.
   - **O2-d**: cambiar los bytes de un `server/Data/` excluido no altera la selección ni se presenta como capturado.
   Nota de fixture: `Data`/`DATA`/`data` bajo el mismo padre son un único directorio en NTFS, así que O2-c los cuelga de padres distintos (un primer intento con el mismo padre falló por mi fixture, no por el builder; corregido y comentado en el test).
4. O3 sigue siendo una **caracterización** declarada (archivos raíz inexistentes: fallo posterior explícito, no éxito falso), como pidió 088.

## Resultados (carpeta `tests/.tmp/qa086-r2-f8935724-dd97-42db-a655-c607aca846ba/`, logs conservados)

| Ejecución | Log | Resultado |
| --- | --- | --- |
| Selección independiente contra `ae74ce22` | `selection-current-ae74.log` | **15/15**, 0 skip, 0 todo (O2 incluido; O1-f recorrió sus aserciones: junctions reales en este equipo) |
| Selección independiente contra `b026f0dd` congelado | `selection-baseline-b026.log` | 11 pasan / **4 fallan: O2-a, O2-b, O2-c, O2-d**, cada uno por su causa (`server/Data/` sin motivo; `Data/Dist/Node_Modules` capturados; `public/Dist` no excluido; contenido de `Data` filtrado). Los fallos no son de importación: O1 sigue verde en ambas versiones. |
| O1-f con `fs.symlinkSync` forzado a EPERM / EACCES / ENOTSUP | `fault-*.log` (`symlink-fault.cjs`) | `skipped 1`, 0 fallos, código 0 (skip con motivo, no verde silencioso) |
| O1-f con `EIO` | `fault-EIO.log` | **falla** (error propagado), código 1 |
| Banco QA056 actualizado contra `ae74ce22` | `bank-ae74-current.log` | **20/20**, 0 skip, 0 todo |

La inyección de fallos es un arnés de prueba (precarga que reemplaza `fs.symlinkSync` solo en ese proceso); no cambia permisos ni protecciones del sistema. Los controles de O1 de R1 (3 fallos causales frente al builder de QA056) y los 4 mutantes siguen documentados en los logs de R1; **no se repitieron en R2** y, como señala 088, son resultados del autor.

## Candidata real aislada (exigida porque el arnés cambió)

Comando: `node scripts/prepare-release-candidate.mjs --prepare` (CLI existente, carpeta nueva bajo `tests/.tmp`, sin `npm run build` raíz, sin instalar ni desplegar). Log: `candidate-real.log`.

- Carpeta: `tests/.tmp/release-candidates/candidate-b82a776b-043b-4f70-a346-fdb9fd07022d`, creada 01/11/2026 10:02:39Z, completada 10:04:18Z, revisión del tablón 676.
- `state: compiled-and-node-verified`, **`snapshotStable: true`, `liveSourcesStillMatch: true`**; 357 fuentes, 23 artefactos; `approved/deployed/releaseEligible: false`.
- Comprobaciones: typecheck, vite, seis bundles, `public-assets` y `node-integration` correctos; `node-integration`: **162/162**, 0 fallos/skip/todo.
- `sourceSelection` presente, `repositoryImage:false`, 9 exclusiones declaradas (8 auxiliares `unlisted-extension` + `tests/.tmp/` oculto); 8 bloqueos `SOURCE_AUXILIARY_EXCLUDED`; cobertura pública 10 capturados / 0 excluidos (`complete:true`); 20 archivos de `tools/` capturados.
- Comparada con la candidata de Codex `candidate-42c5f15c…`: **23/23 artefactos idénticos**; las únicas fuentes distintas son mis dos archivos de prueba (es lo esperado: contienen R2). Mismo recuento (357). No es una segunda validación de la compilación independiente de la primera: solo confirma que el builder final produce los mismos artefactos.
- Los bloqueos `SOURCE_NOT_ACCEPTED:*` listan las tareas de Codex en review; siguen bloqueando la liberación.
- Hashes de builder y core: iguales al inicio y al final (`builder-before-candidate.txt`); no hubo cambio de fuentes durante la captura, de modo que sí procede presentarla como actual (`snapshotStable` y `liveSourcesStillMatch` verdaderos).

## Observaciones

- **O2**: **resuelta** en `ae74ce22…` por Codex (SOURCE-CASE089). R1 la caracterizaba como defecto; R2 la exige como oráculo positivo.
- **O3**: sin cambios, límite declarado (falla después, al copiar, de forma explícita).
- Un enlace excluido consta sin «/» final (matiz de formato, cubierto en O1-f).

## Límites

- Mecánica sintética para la selección; la candidata real solo acredita compilación y las 162 pruebas Node del builder, **no** E2E ni revisión visual (`E2E_AND_VISUAL_REVIEW_PENDING`), ni que las fuentes sean aceptables.
- O1-f y O2 dependen del sistema de archivos del equipo (NTFS, junctions). Con O1-f sin permisos el caso ahora se salta y se cuenta como skip; no es evidencia de que el contrato se cumpla en ese entorno.
- No ejecuté `tests/candidate-source-coverage.test.mjs`, `tests/candidate-path-case.test.mjs` ni los 116 focales/24 E2E de Codex.
- Los 3 controles O1 y los 4 mutantes de R1 no se repitieron; son resultados del autor leídos por Codex en 088.
- Sin dictamen propio de aceptación: corresponde a Codex.
