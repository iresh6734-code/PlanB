# CLAUDE-RECORD-LIST · Estado y carga de la lista de registros fuera de App.tsx

**Autor:** Claude (Opus 5.5) · **Fecha:** 17/11/2026 · **Origen:** mejora B2 del informe (primer paso), por orden del usuario. Los archivos compartidos se editaron con su autorización.

## Cambio

- `src/app-shell/useRecordList.ts` (nuevo):
  - **`useRecordListState()`**: ocho estados (búsqueda, página, embudo, filas, registros conocidos, total, carga y error) y su `reset()`;
  - **`useRecordListLoader(list, { active, entity, revision, onError })`**: la carga con cancelación de la petición anterior y espera de 180 ms mientras se escribe;
  - **`recordListPath`** y **`searchDelay`**, funciones puras.

  Son dos piezas porque `App.tsx` declara el estado arriba (otros efectos leen la búsqueda) y solo puede cargar cuando ya conoce la sesión y la revisión de datos.
- `src/App.tsx`: sin los ocho `useState`, sin el efecto de carga y con `openEntity` llamando a `list.reset()`. **La consulta a la API es la misma**, carácter por carácter, y lo prueba `record-list`.
- `tests/helpers/auth-parent-harness.ts` (reserva de `CODEX-AUTH-PARENT-RACE-380`): el arnés transpila `App.tsx` y convierte los módulos desconocidos en dobles vacíos. Ahora carga el `useRecordList` **real** con sus mismos React y transporte simulados, en lugar de un doble que devolvía `null`.

| Archivo | SHA-256 |
| --- | --- |
| `src/app-shell/useRecordList.ts` | `99896ae7…7b2b` |
| `tests/record-list.test.ts` | `44b74d45…185` |
| `src/App.tsx` | antes `3e36bac8…c7ed` · después `87d2c1e9…e310` (35,4 → 34,7 KB) |
| `tests/helpers/auth-parent-harness.ts` | antes `15093126…565f` · después `029c5e7b…0f59` |

## Verificación

- `tests/record-list.test.ts` **3/3**: la consulta mantiene el formato de la API y codifica búsqueda y embudo; la espera de búsqueda; y `App.tsx` ya no lleva ni el estado ni la carga de la lista.
- Suites que montan la App: `auth-parent` 4/4 (tras ajustar el arnés), `independent-interface-contexts` 47/47, `continuity-home-hub` 5/5, `task-outcomes-host` 12/12, `ui-journeys` 60/60 y `url-routes` 4/4. `tsc` 0.
- **Navegador** (ensayo aislado):
  - `/clientes` muestra 24 filas y «24 clientes»;
  - buscar «Marta» deja una fila, Marta Vega;
  - Tareas lleva a `/tareas` con 18 filas y la búsqueda limpia;
  - Empresas muestra 8 filas;
  - sin errores de página.

## Límites

- **B2 no está terminado.** El informe ponía como meta un `App.tsx` de menos de 8 KB, y sigue en 34,7 KB, porque otras unidades le han añadido funciones. Los candidatos siguientes son la lista de órdenes de la paleta, la sincronización de la dirección y el bloque de Deshacer, cada uno a su propio módulo.
