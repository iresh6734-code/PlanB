# CLAUDE-PERF-BUDGETS · Presupuestos de rendimiento (E3)

**Autor:** Claude (Opus 5.5), sesión «planb-rendimiento» · **Fecha:** 18/11/2026, Europe/Madrid
**Origen:** mejora E3 de `CLAUDE-INFORME-MEJORAS-GEMINI-2026-11-13.md`, por orden del usuario del 18/11.
**Archivos (todos nuevos):** `tools/perf/fixture.ts`, `tools/perf/measure.ts`, `tools/perf/bundle.mjs`, `tools/perf/budgets.json`, `tools/perf/README.md`, `tests/perf-budgets.test.ts`, este informe.

## Qué hay

- **`tools/perf/fixture.ts`**: captura ficticia y determinista de exactamente 10.000 registros (1.500 empresas, 5.000 clientes, 2.000 oportunidades, 1.500 tareas), con 12.000 relaciones resolubles, válida con `SnapshotSchema` y marcada `isTestData: true`. Correos en `@example.com`.
- **`tools/perf/measure.ts`**: siembra un almacén **cifrado de verdad** en `tests/.tmp/perf-run-*`, monta la App real (`createBaseApp`) y mide por `app.inject` siete operaciones. Da mediana y p95 y, con `--check`, falla si una mediana supera su presupuesto. Borra su carpeta al terminar.
- **`tools/perf/bundle.mjs`**: compila con Vite en `tests/.tmp/perf-build/dist` y mide lo que el navegador descarga antes de pintar: script de entrada, módulos precargados y CSS enlazado en `index.html`. Se niega a compilar en `dist/` o `build/`.
- **`tools/perf/budgets.json`**: techos de regresión. **`README.md`**: comandos, definiciones y objetivos de producto.
- **`tests/perf-budgets.test.ts`**: 7 pruebas. Tres sobre el generador y la lógica de comparación, una medición real con 10.000 registros frente a los techos, dos sobre el análisis del paquete y su carpeta, y una del paquete compilado. Esta última se omite si no hay compilación de medida.

Sin datos reales, red, puertos, servicios externos ni dependencias nuevas. No se ha usado `npm run build`.

## Medidas (18/11/2026, 10.000 registros, CPU del equipo al 90–93 % por otras sesiones)

`NODE_ENV=test npx tsx tools/perf/measure.ts --repeats 7 --check`:

| Medida | Mediana | p95 | Techo |
| --- | --- | --- | --- |
| Lista de clientes en frío (`/api/v2/state` + primera página, almacén recién abierto) | **931 ms** | 1.404 ms | 2.500 |
| Lista en caliente (una página) | 117 ms | 134 ms | 500 |
| Filtro de la lista (`?q=`) | 189 ms | 215 ms | 750 |
| Abrir una ficha | 1,6 ms | 2,5 ms | 50 |
| Búsqueda global | **472 ms** | 641 ms | 1.800 |
| Abrir un resultado de búsqueda | **368 ms** | 431 ms | 1.800 |
| Guardar un cambio | 87 ms | 177 ms | 500 |

`node tools/perf/bundle.mjs`, paquete inicial:

| | Bytes | gzip |
| --- | --- | --- |
| JS inicial (`index-*.js`) | 677,4 KB | 203,5 KB |
| CSS inicial | 308,7 KB | 53,5 KB |
| **Total inicial** | 986 KB | **256,9 KB** |
| JS diferido (todos los trozos) | 641,3 KB | — |
| Trozo diferido mayor (`TeamApp`) | 258,2 KB | — |

El informe de mejoras daba ~613 KB de JS inicial; hoy son 677 KB (+10 %). Techos del paquete: JS 760 KB, JS gzip 230 KB, CSS 340 KB y total gzip 290 KB.

Los techos son lo medido con un margen de ~2,5× en tiempos (equipo cargado) y ~12 % en bytes. **No son objetivos**: los objetivos están en `tools/perf/README.md` y hoy no se cumplen en la lista en frío, la búsqueda ni el paquete.

## Cuellos de botella encontrados (con medida)

Desglose con un script de sondeo temporal, ya borrado. Son medianas de 5 repeticiones con el mismo almacén de 10.000 registros.

### 1 · `/api/v2/state` analiza la captura completa unas cuatro veces por petición (435–620 ms)

La captura guardada en `meta` incluye los 10.000 registros: 4,5 M caracteres cifrados. Cada lectura de `store.snapshot` cuesta **~80 ms** (descifrado ~28 ms + `JSON.parse` ~51 ms). Una sola petición de estado la lee varias veces:

- `readState` lee `store.snapshot` una vez y el getter `ready` otra;
- `workspaceSearchIdentity()` llama a `ready`, que lee la captura otra vez, y después a `identityForReadyStore`, que la lee de nuevo y calcula `sha256(JSON.stringify({…snapshot…}))` (~59 ms más);
- después se compacta (`records: []`), así que todo ese trabajo se tira.

`ready` sola cuesta 75–100 ms porque analiza la captura entera solo para saber si existe. **Esto explica casi toda la lista en frío**: estado ~450 ms + primera página con caché fría ~250 ms. El estado se pide al abrir la App y tras muchas acciones.

**Propuesta** (archivos ajenos, no editados):
- (a) `server/store.ts`, reservado por Codex (`CODEX-RESTORE-TRANSACTION-388`, en revisión): que `ready` compruebe la existencia con `SELECT 1 FROM meta WHERE key='snapshot'` sin analizarla. Otra opción es un caché del valor analizado de `snapshot` indexado por el texto cifrado, como el de registros: es el mismo tipo de dato y no son metadatos con credenciales (la R2 de 357 excluyó la caché de `meta` por los tokens de réplica, no por la captura).
- (b) `server/app.ts` (`readState`) y `server/workspace-search.ts` (reservado por `CODEX-SEARCH-STALE-CONTEXT-207`): leer la captura una vez y pasarla a la identidad. La `contextRevision` puede derivarse del `id` y `capturedAt` de la captura más la revisión de la generación, en vez de serializarla entera.

Estimación: el estado bajaría de ~450 ms a ~100 ms. Habría que medirlo con `tools/perf/measure.ts`.

### 2 · La búsqueda global normaliza 57.500 textos en cada petición (~470 ms)

`searchWorkspace` (`shared/workspace-search.ts`) llama a `normalizeSearch` para cada campo de cada registro en cada búsqueda: `normalize('NFD')` + `toLocaleLowerCase('es-ES')`. Además, la ruta calcula `sha256(JSON.stringify({spec, records}))` en cada búsqueda y en cada apertura de resultado (~39 ms), más la identidad del punto 1.

- Medido sobre los 57.500 textos de la captura: con `es-ES`, **107 ms**; con `toLowerCase()` y un atajo que salta `normalize` en textos ASCII, **38 ms**. **Mismo resultado en los 57.500 textos.** La minúscula dependiente del idioma solo cambia algo en turco, azerí y lituano.
- `searchWorkspace` entera: ~310 ms por consulta. Lo demás son `flatMap` por registro, búsqueda lineal de la etiqueta de cada opción y `includes` por término.

**Propuesta:** un índice normalizado por registro, calculado una vez por revisión de datos (la revisión ya existe) y reutilizado entre consultas, más la normalización rápida. Toca `shared/workspace-search.ts` (sin reserva activa) y `server/workspace-search.ts` (reserva de Codex 207). La apertura de un resultado (368 ms) no necesita buscar: basta con comparar la revisión, y esa revisión puede venir del recuento de cambios y la época de la copia en vez de serializar 10.000 registros.

### 3 · Lista de clientes: `page()` recorre y une todos los valores aunque no haya filtro (~100–130 ms)

`Store.page` construye `names` (un `Map` con `Object.values(values).join(' ')` de los 10.000 registros, ~16 ms) aunque la consulta esté vacía. Después recorre los 10.000 registros para filtrar por entidad. **Propuesta** (`server/store.ts`, reserva 388): crear `names` solo si hay `needle` y leer solo la entidad pedida (`records(entity)`). Ganancia estimada: 20–40 %. Menor que la de los puntos 1 y 2.

### 4 · El paquete inicial lleva el Laboratorio y zod

En el trozo inicial aparecen 47 veces `commitment`, 38 `Radar` y 14 `date-check`, y además `ZodError` (zod 4 completo). Son indicios, no una atribución exacta de bytes: medirlo bien pide un analizador de paquetes, es decir, una dependencia nueva que el usuario no quiere. Propuesta para quien tenga `src/App.tsx` y `src/app-shell/lazy-pages`: comprobar qué importaciones estáticas arrastran módulos del Laboratorio y de `shared/` con zod al trozo inicial, y pasarlas a carga diferida.

## Encargos aparte que propongo (no registrados para no pisar reservas)

| Propuesta | Archivos | Dueño actual | Ganancia esperada |
| --- | --- | --- | --- |
| PERF-STATE · estado sin reanalizar la captura | `server/store.ts`, `server/app.ts`, `server/workspace-search.ts` | Codex (388, 207) | Lista en frío de ~930 a ~400 ms |
| PERF-SEARCH · índice de búsqueda por revisión y normalización rápida | `shared/workspace-search.ts`, `server/workspace-search.ts` | Libre / Codex (207) | Búsqueda de ~470 a ≤ 150 ms |
| PERF-PAGE · página sin unir todos los valores | `server/store.ts` | Codex (388) | 20–40 % por página |
| PERF-BUNDLE · Laboratorio y zod fuera del trozo inicial | `src/App.tsx`, `src/app-shell/lazy-pages*` | Sesión principal / Faro | Por medir |

Cada arreglo puede comprobarse con `NODE_ENV=test npx tsx tools/perf/measure.ts --check`. Cuando se alcance un objetivo, se baja su techo en `budgets.json`.

## Verificación

- `NODE_ENV=test npx tsx --test tests/perf-budgets.test.ts` → **7/7** (27 s, de ellos 23 s de la medición real).
- `npx tsc --noEmit -p tsconfig.json` → código 0 (incluye `tools/perf/*.ts` a través de la prueba).
- `measure.ts --check` → todas las medidas dentro de presupuesto. `bundle.mjs` → compilación en `tests/.tmp/perf-build` en 16 s.
- Al terminar no queda ninguna carpeta `perf-run-*`, `perf-probe-*` ni `perf-bundle-*` en `tests/.tmp`. Solo se conserva `perf-build`.
- Comprobado que la comparación detecta medidas por encima del techo y medidas ausentes, y que `build()` rechaza `dist/`, `build/` y sus subcarpetas.

## Límites

- Las medidas son por HTTP en proceso (`inject`): no incluyen red local, pintado del navegador ni el trabajo de React. El tiempo que ve la persona es mayor.
- Equipo cargado al 90 % por otras sesiones: con la máquina tranquila los tiempos deberían bajar. Los techos tienen margen para no dar falsos fallos en la batería; un fallo dudoso se confirma ejecutando el archivo solo.
- La primera vez que se abre una clave nueva se llama a DPAPI por PowerShell. Esa vuelta no se cuenta (calentamiento).
- No se ha medido en 4331 ni en 4334, ni con datos reales.

## Huellas (SHA-256)

| Archivo | Huella |
| --- | --- |
| `tools/perf/fixture.ts` | `ef46461718b213aa79d7fbb92a8dfdc7085fef12be1be0da7ab8f40770c82b1f` |
| `tools/perf/measure.ts` | `3d99691ac6bbd0443e0db792292253fc410f771c7fd81490beb45614a62a0d5b` |
| `tools/perf/bundle.mjs` | `0564d8dcdf878a3db6b5486b48dd6e504a1ee0a0800336174f95f4d70851148b` |
| `tools/perf/budgets.json` | `c973ee2209f60a08c38d64d874f3726ba5269c0f2330a01e16c3ab6eb1ef460f` |
| `tools/perf/README.md` | `bfc354789219db226be0952b6e69b04d6bd19c31af32522dc244d83e94b6e3fc` |
| `tests/perf-budgets.test.ts` | `2c5d7489f4538b35d427ec0cc142537fd0c6d5fa0c6f58bb173d1e93d752749b` |

## R2 · Correcciones pedidas en CODEX-CLAUDE-TOOLING-REVIEW-445 (19/11/2026)

**1 · Una muestra que no tiene el tamaño de referencia ya no aprueba.** Codex lo confirmó: `--check` comparaba los tiempos, pero ignoraba cuántos registros tenía la muestra, así que una medida con 200 registros podía salir aprobada.
- `overBudget` añade un fallo `muestra exploratoria: N registros; los presupuestos exigen exactamente 10000` cuando `result.records !== budgets.records`, aunque ningún tiempo supere su techo. `isReferenceSize()` lo expone.
- La salida de texto marca la medida como **EXPLORATORIA**, `--json` añade `reference: false` y `--check` sale con código 1 («Sin aprobado»). `--records` toma por defecto el tamaño de `budgets.json`.
- Siguen siendo posibles las medidas manuales con otros tamaños; simplemente nunca dan un aprobado.
- Comprobado por línea de comandos: `measure.ts --records 200 --check` → código 1 con ese motivo.

**2 · Cifras del generador corregidas.** Eran 1.500 empresas, **5.000** clientes, 2.000 oportunidades, 1.500 tareas y **12.000** relaciones; el informe decía 6.500 y 14.000 por error mío. Corregido arriba. La prueba fija ahora esas cifras exactas para que el informe no pueda volver a desviarse.

**3 · Mediciones.** Se entienden como evidencia del entorno observado: un equipo al 80–100 % de CPU por otras sesiones. Los techos de `budgets.json` son techos de regresión, no objetivos de producto, como ya decía el README.

**Verificación:** `tests/perf-budgets.test.ts` → **8/8**. La prueba nueva cubre 200, 9.999 y 10.001 registros sin aprobado, y 10.000 aprobado. `tsc` no da errores en estos archivos; los únicos actuales son de `tests/return-explain.test.ts`, trabajo en curso de la sesión principal.

| Archivo (R2) | SHA-256 |
| --- | --- |
| `tools/perf/measure.ts` | `ad6a1d6003633e40840469b694f5f4052cc3ef14d75131ed9ba0682ca2a3c08c` |
| `tools/perf/README.md` | `28a22ac7f905360e78a3d60c00e0eaef61cfa59089d497db3d3c624e33ce7059` |
| `tests/perf-budgets.test.ts` | `24c037b6fa373ab43fac36d3717a9f56ef1b242eb4fe1e19e485f64f41ec32c3` |

Sin cambios: `tools/perf/fixture.ts`, `tools/perf/bundle.mjs` y `tools/perf/budgets.json` (huellas de la primera entrega).
