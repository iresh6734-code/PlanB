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

## CI completa: pasos opcionales y un único informe

`tools/ci/full.mjs` ejecuta la CI de arriba como paso base y añade pasos opcionales, **apagados por defecto**:

```bash
node tools/ci/full.mjs                         # igual que run.mjs
node tools/ci/full.mjs --perf                  # + presupuestos de rendimiento (tools/perf/measure.ts --check, ~30 s)
node tools/ci/full.mjs --mobile                # + autotest del escáner móvil (sin servidor; abre Chromium sin interfaz)
node tools/ci/full.mjs --e2e [filtros…]        # + E2E aislados (tools/e2e/isolated.mjs; compila en tests/.tmp/e2e-build)
node tools/ci/full.mjs --skip-types --tests "tests/store-*.test.ts" --perf --mobile
```

- **Opciones:** las de `run.mjs` (`--skip-api`, `--skip-types`, `--tests`, `--known`) se reenvían tal cual y se validan antes de ejecutar nada. Los filtros de Playwright van detrás de `--e2e` (archivos, `-g "nombre"`, `--project=…`) hasta la siguiente opción de la CI.
- **Ejecución:** cada paso pedido se ejecuta aunque falle uno anterior, con el entorno acotado de `run.mjs` y un tope propio: rendimiento 20 min, móvil 15 min y E2E 180 min.
- **Informe único:** `tests/.tmp/ci/<fecha>-completa/report.json` recoge, de cada paso, su estado (`correcto`, `con problemas`, `tiempo agotado` o `no ejecutado`), código, duración, últimas líneas de salida y registro (`<paso>.log`). Incluye además el `report.json` de la CI base.
- **Códigos de salida:** 0 solo si todos los pasos ejecutados terminan bien; 1 si alguno falla; 2 si la línea de órdenes no es válida.
- **Lo que no toca:** `full.mjs` no escribe en `dist/` ni `build/`, y no modifica los arneses que llama.

Pruebas: `tests/ci-full.test.ts`, con la ejecución inyectada: no lanza navegadores ni compila. Encargo: `CLAUDE-CI-STEPS`.
