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
