# Presupuestos de rendimiento (E3)

Herramienta para medir Plan B con **10.000 registros ficticios** (el máximo del piloto) y fallar si empeora. Encargo `CLAUDE-PERF-BUDGETS`; medidas y cuellos de botella en `coordination/reports/CLAUDE-PERF-BUDGETS.md`.

No usa datos reales, red, puertos ni dependencias nuevas. Todo se crea en `tests/.tmp/perf-*` y se borra al terminar (salvo la compilación de medida, que se reutiliza).

## Comandos

```bash
NODE_ENV=test npx tsx tools/perf/measure.ts            # tiempos (mediana y p95)
NODE_ENV=test npx tsx tools/perf/measure.ts --check    # además, código 1 si se supera un presupuesto
NODE_ENV=test npx tsx tools/perf/measure.ts --json --repeats 11 --records 5000
node tools/perf/bundle.mjs                             # compila en tests/.tmp/perf-build/dist y mide el paquete inicial
node tools/perf/bundle.mjs --no-build --check          # mide la última compilación de medida
NODE_ENV=test npx tsx --test tests/perf-budgets.test.ts
```

`--check` solo puede aprobar una medida con exactamente los registros de `budgets.json` (10.000). Con `--records` distinto, la medida es **exploratoria**: se muestra, pero `--check` sale con código 1 y lo dice.

`bundle.mjs` se niega a compilar en `dist/` o `build/` (las carpetas que sirve el piloto). La prueba del paquete se omite si no hay compilación de medida.

## Qué se mide

| Clave | Qué es |
| --- | --- |
| `coldList` | Abrir el almacén de nuevo (sin caché) y pedir `/api/v2/state` + la primera página de clientes: lo que espera la persona al abrir la App |
| `warmList` | Una página de clientes con el almacén ya abierto |
| `listSearch` | Filtro de la lista (`?q=`) |
| `openRecord` | Abrir una ficha (`/api/v2/records/contacts/:id`) |
| `globalSearch` | Búsqueda global (`/api/v2/search`) |
| `openSearchResult` | Abrir un resultado de la búsqueda (`/api/v2/search-record`) |
| `saveRecord` | Guardar un cambio en una ficha |
| `initialJs`, `initialCss`, `initialGzip` | Lo que el navegador descarga antes de pintar: script de entrada, módulos precargados y CSS enlazado en `index.html` |

Cada medida es por HTTP con `app.inject` sobre la App real (`createBaseApp`) y un almacén **cifrado** de verdad. No incluye red ni pintado del navegador.

## Presupuestos y objetivos

`budgets.json` guarda **techos de regresión**: lo medido el 18/11/2026 con el equipo al ~90 % de CPU, con ~2,5× de margen en tiempos y ~12 % en bytes. Si una prueba falla, algo ha empeorado de verdad.

Los **objetivos de producto** son más exigentes y hoy no se cumplen todos; cuando un arreglo los alcance, baja el techo correspondiente en `budgets.json`:

| Medida | Hoy (mediana, equipo cargado) | Objetivo |
| --- | --- | --- |
| Lista en frío | ~930 ms | ≤ 400 ms |
| Lista en caliente | ~115 ms | ≤ 100 ms |
| Ficha | ~2 ms | ≤ 50 ms |
| Búsqueda global | ~470 ms | ≤ 200 ms |
| Paquete inicial (gzip, JS + CSS) | 257 KB | ≤ 200 KB |

Con la máquina cargada los tiempos suben; un fallo dudoso se confirma ejecutando la prueba sola.
