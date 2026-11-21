# CLAUDE-CI-STEPS · CI local con pasos opcionales y un informe único (E1)

**Autor:** Claude (Opus 5.5), sesión «planb-rendimiento» · **Fecha:** 19/11/2026, Europe/Madrid
**Orden:** del usuario, vía la sesión principal: añadir `--perf`, `--mobile` y `--e2e [filtros]` a la CI local, apagados por defecto y con un único informe.
**Archivos:** `tools/ci/full.mjs` (nuevo), `tests/ci-full.test.ts` (nuevo), `tools/ci/README.md` (sección nueva al final) y este informe.

## Por qué un archivo nuevo y no `run.mjs`

La sesión principal propuso editar `tools/ci/run.mjs`. Al revisar el tablón, ese archivo está reservado por **`CODEX-CI-FAILURE-EVIDENCE-421`** (Codex, en revisión): editarlo invalidaría esa entrega a mitad de revisión. Por eso los pasos opcionales viven en `tools/ci/full.mjs`, que ejecuta `run.mjs` **sin cambios** como paso base:
- importa y reutiliza sus funciones `run` (entorno acotado y terminación del árbol en Windows), `parseArgs` (validación) y `UsageError`;
- `run.mjs` conserva su huella: `311421354a4009a0281876135c3ef861f8cf6391238089b608676568d6de1df7`.

**Integración propuesta** cuando se cierre la 421: si se prefiere una sola orden, `run.mjs` puede aceptar `--perf`, `--mobile` y `--e2e` y delegar en `planSteps` y `runFull` de `full.mjs`, añadiendo su propio informe como paso base. Son unas pocas líneas, a decidir con Codex.

## Qué hace

| Opción | Paso | Orden |
| --- | --- | --- |
| (siempre) | CI de siempre | `node tools/ci/run.mjs` + las opciones de `run.mjs` reenviadas |
| `--perf` | Presupuestos de rendimiento | `tsx tools/perf/measure.ts --check` con `NODE_ENV=test`. Usa su propia carpeta `tests/.tmp/perf-run-*` y, desde la R2 de 445, solo aprueba con los 10.000 registros de referencia |
| `--mobile` | Autotest del escáner móvil | `tsx tools/visual/mobile-scan.mts --self-test`. No necesita servidor, pero abre Chromium sin interfaz |
| `--e2e [filtros…]` | E2E aislados | `node tools/e2e/isolated.mjs [filtros…]`. Compila en `tests/.tmp/e2e-build`, nunca en `dist/` ni `build/` (lo vigila el propio arnés) |

- Las opciones de `run.mjs` se validan con su propio `parseArgs` **antes de ejecutar nada**. Una opción repetida, desconocida o un patrón no admitido dan código 2.
- Los filtros de Playwright van detrás de `--e2e` hasta la siguiente opción de la CI. Por ejemplo, `--e2e tests/e2e/ux.spec.ts -g "menú" --perf`.
- Cada paso pedido se ejecuta aunque falle uno anterior, con un tope propio: rendimiento 20 min, móvil 15 min y E2E 180 min; la base ya lleva el suyo, 60 min.
- **Informe único:** `tests/.tmp/ci/<fecha>-completa/report.json`, con los cuatro pasos siempre en el mismo orden. De cada uno guarda:
  - el estado: `correcto`, `con problemas`, `tiempo agotado` o `no ejecutado`;
  - el código de salida, la duración, las últimas 12 líneas de salida (sin colores y recortadas) y la ruta de su registro;
  - en el paso base, el `report.json` de `run.mjs`;
  - en el paso E2E, los filtros usados.
- **Códigos de salida:** 0 solo si todos los pasos ejecutados terminan bien; 1 si alguno falla o se agota su tiempo; 2 si la línea de órdenes no es válida.
- **No toca** `tools/visual/**` ni `tools/e2e/**` (los llama), ni `compare.mjs`, `known-failures.json` o `run.mjs`.

## Verificación

- **`tests/ci-full.test.ts` → 7/7**, con la ejecución **inyectada**: no lanza navegadores, no compila y no ejecuta la batería. Comprueba:
  - sin opciones solo se ejecuta la base y los demás figuran como «no ejecutado», en un único `report.json`;
  - el orden de los pasos, la orden exacta de cada uno, su entorno, su tope y su registro, y que ninguno apunta a `dist/` ni `build/`;
  - un paso que falla no impide los siguientes, y el código final es 1;
  - el tiempo agotado y los estados quedan en el informe;
  - solo cuenta el código 0: el 2, el 3, un código nulo y un error al lanzar el paso cuentan como «con problemas»;
  - el informe de `run.mjs` se incorpora cuando su salida dice dónde quedó;
  - la salida resumida quita colores y líneas vacías y recorta;
  - la línea de órdenes: repeticiones, filtros de `--e2e` y validación real de `run.mjs`.
- `tests/ci-compare.test.ts`, la prueba existente de la CI: 20/20, sin cambios.
- `tsc`: sin errores en estos archivos. Los únicos errores actuales están en `tests/return-explain.test.ts`, trabajo en curso de la sesión principal.
- **Ensayo real corto:** `node tools/ci/full.mjs --skip-types --skip-api --tests "tests/ci-full.test.ts" --perf --mobile` → **código 0 en 65 s**:
  - base `correcto` (7/7), con su informe incorporado;
  - perf `correcto` en 26,8 s;
  - mobile `correcto` en 37 s (autoprueba 6/6);
  - e2e `no ejecutado`.
- **Errores de uso reales:** `--perf --perf` y `--tests "tests/**/*.test.ts"` → código 2 con su mensaje.

**No se ejecutó `--e2e` de verdad:** compila la App entera y lanza Playwright, y lo está usando la sesión principal (puertos 4337/4341). Está cubierto por las pruebas con ejecución inyectada; su comportamiento real es el de `tools/e2e/isolated.mjs`.

## Huellas (SHA-256)

| Archivo | Huella |
| --- | --- |
| `tools/ci/full.mjs` | `8f94314bb211c625a93e3daace8d8c9f3e64d4714d68150d986da207518d7a22` |
| `tests/ci-full.test.ts` | `972d6f47b65041ef326253b07a9f7c8c0d67c8f84af8024913b9da3cf25387cf` |
| `tools/ci/README.md` (antes `4bd3bd6c059732cd882d116021b98809f2c70a10072d15ae03bde05c76725a2a`) | `61e43746859c673cdd46b3b81a65877c226adb8f6c9257798c70a97c114e998c` |

## R2 · Correcciones pedidas en CODEX-CI-MOBILE-REVIEW-462 (21/11/2026)

**F1 · Un paso E2E «correcto» sin pruebas ejecutadas.** Corregido: `e2eEvidence()` lee el resumen final de Playwright (`N passed`, `failed`, `flaky`, `skipped`). El paso solo es «correcto» con código 0, al menos una prueba pasada y ninguna fallida. Un listado, `Running 0 tests`, «No tests found» o una salida vacía dan «con problemas», con `reason: «no consta ninguna prueba ejecutada…»`. Una prueba fallida con código 0 da «1 pruebas fallidas». El recuento queda en `report.steps.e2e.tests`.

**F2 · `--no-build` y `--config` reenviados como filtros.** Corregido: `validateE2eFilters()` solo admite selección de pruebas: `tests/e2e/…/*.spec.ts` (con `:línea`, sin `..`), `-g`/`--grep`, `--grep-invert` (con texto), `--grep=…`, `--grep-invert=…` y `--project=NOMBRE`. Todo lo demás da error de uso antes de ejecutar nada: `--no-build`, `--config`/`-c`, `--list`, reporteros, `--update-snapshots`, `--headed`, rutas fuera de `tests/e2e`… Comprobado por línea de órdenes: `--e2e --list`, `--e2e --no-build`, `--e2e --config otra.ts` y `--e2e tests/e2e/../../x.spec.ts` → código 2.

**Arnés compartido.** No he tocado `tools/e2e/**`. Queda documentado en `tools/ci/README.md` que usa carpeta y puertos fijos. Además, `full.mjs` lee esos puertos de `tools/e2e/playwright.isolated.config.ts` (hoy 4337 y 4341) y los sondea antes de lanzar el arnés. Si alguno está en uso, **no lo ejecuta** y deja el paso «con problemas» con el motivo («arnés E2E ocupado: puertos … en uso»). El sondeo se inyecta en las pruebas y se comprueba con un servidor real (un puerto en uso frente a uno libre).

**Pruebas:** `tests/ci-full.test.ts` → **12/12** (5 nuevas de R2; las 7 anteriores adaptadas: el ejecutor falso informa ahora de «3 passed» en E2E y los filtros de ejemplo están bajo `tests/e2e/`). `tests/ci-compare.test.ts` → 20/20. `tsc` → 0.

**Lo que sigue sin verificarse de verdad:** no he lanzado el arnés E2E real, que compila la App entera y usa 4337/4341. La exigencia de ejecución real queda garantizada por el contrato («correcto» solo con pruebas pasadas en la salida de Playwright) y probada con salidas inyectadas; no con una ejecución completa.

| Archivo (R2) | SHA-256 |
| --- | --- |
| `tools/ci/full.mjs` | `532daabd7b878c7ec0a552f8b3e18cc9f94ee67a6fef295a3983c2f81c917fd9` |
| `tools/ci/README.md` | `a09c0a2866b52d8edb6cb665e44ef101d9bff0a68aa0c85cb9fcc9cae178d3fd` |
| `tests/ci-full.test.ts` | `81dec9b00e903558f24adf499bebf7678750769737f298a2c4dfd5bb31cc0c00` |
