# CI local

Comprobación completa y reproducible en este equipo, sin servicios externos.

```bash
node tools/ci/run.mjs                                 # tipos + batería unitaria + inventario de la API (~15 min)
node tools/ci/run.mjs --skip-api                      # sin comprobar docs/api.md
node tools/ci/run.mjs --tests "tests/store-*.test.ts" # solo un subconjunto (los conocidos se filtran igual)
```

## Qué hace

1. **Tipos:** `tsc --noEmit -p tsconfig.json`.
2. **Batería unitaria:** se ejecuta con `NODE_ENV=test`, algo que `npm test` todavía no hace; por eso fallaban 13 pruebas que crean una clave local de prueba. Cada prueba fallida, identificada por archivo y nombre, se compara con [`known-failures.json`](known-failures.json):
   - **nuevo:** no está en la lista → la CI falla;
   - **conocido:** está en la lista y sigue fallando → se informa, no falla;
   - **resuelto:** está en la lista, no está marcado `flaky` y ya pasa → se pide retirarlo de la lista;
   - **inestable que pasa:** está marcado `flaky` y esta vez pasó → solo informativo.
3. **Inventario de la API:** `node tools/api/inventory.mjs --check` (ver `tools/api/README.md`).

Termina con código 0 si todo es correcto y 1 si hay errores de tipos, fallos nuevos, una batería sin resumen o un `docs/api.md` desactualizado. Registros (`tsc.log`, `unit.log`, `api.log`) e informe (`report.json`) quedan en `tests/.tmp/ci/<fecha>/`, que Git ignora.

## La lista de fallos conocidos

Cada entrada lleva `file`, `name` (nombre exacto de la prueba hoja, sin la duración), `cause` y `owner`. Opcionalmente lleva `flaky: true`, si a veces pasa y a veces no. **No es un sitio para esconder fallos:** cada entrada debe explicar por qué falla y quién puede arreglarlo, y se retira en cuanto pasa. La prueba `tests/ci-compare.test.ts` exige que el archivo exista y que la causa tenga contenido.

## Límites

- Solo pruebas unitarias (`tests/*.test.ts`). Los E2E de Playwright necesitan navegador y arneses propios, y no se ejecutan aquí.
- Las subpruebas con el mismo nombre dentro del mismo archivo cuentan como una sola. `node:test` las anota con la misma línea y no hay forma fiable de distinguirlas desde la salida.
- Las pruebas padre no aparecen en la lista de fallos de `node:test`, aunque sí en su recuento: el número «fallos» del resumen puede superar al de fallos listados.
- Las pruebas que comparten `tests/.tmp` con otros procesos pueden fallar si otro agente ejecuta pruebas a la vez. Conviene lanzar la CI con el equipo tranquilo.

Encargo: `CLAUDE-CI-LOCAL`.
