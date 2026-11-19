# CLAUDE-API-CONTRACTS-R2 · Contratos de la importación CSV y de deshacer (E2)

**Autor:** Claude (Opus 5.5), sesión «planb-rendimiento» · **Fecha:** 18/11/2026, Europe/Madrid
**Orden:** del usuario, vía la sesión principal: ampliar las pruebas por contrato a `/api/v2/import/csv/preview` y `/api/v2/changes/undo-last`.
**Archivos:** `tests/api-v2-contracts-csv-undo.test.ts` (nuevo) y este informe. Es un archivo nuevo para no editar `tests/api-v2-contracts.test.ts`, ya presentado. Solo se leen `server/csv-import.ts`, `server/undo.ts` y `shared/csv-import.ts` (de la sesión principal); no se editan.

## Qué comprueban

App real (`createBaseApp`, base en memoria, captura ficticia). `registerCsvImport` se monta igual que en `server/main.ts:40`, porque `createBaseApp` no la incluye. Esquemas zod compuestos con `RecordSchema` y `EntityNameSchema` de `shared/`. Los errores con código se validan como `{ error, details: { code } }`.

| Ruta | Casos |
| --- | --- |
| `POST /api/v2/import/csv/preview` | Contrato cerrado: cabeceras, mapeo, columnas ignoradas, recuentos, vista previa (≤ 50 filas), errores por línea y marca SHA-256. Una fila sin nombre es inválida (línea 3). La vista previa **no escribe** (registros y cambios iguales). Misma petición, misma marca; otro mapeo, otra marca |
| Errores de la vista previa | Sin copia activa → 409. Más de 1.000 filas → 413. Cuerpo vacío, CSV vacío, entidad desconocida, campo de más, mapeo no textual o CSV > 1 MB → 422 |
| `POST /api/v2/import/csv/apply` | Con la marca: da de alta las 2 válidas, omite 1 y no falla ninguna; las altas quedan guardadas. La misma marca después de cambiar la copia → 409 `STALE_PREVIEW`; una marca falsa → 409 `STALE_PREVIEW`; sin marca o con marca mal formada → 422 |
| `POST /api/v2/changes/undo-last` | Deshace exactamente el último guardado: ficha igual a la del almacén, valor anterior y un inverso con identificador mayor y la misma época de copia. Repetirlo → 409 `NOT_LATEST`, sin segundo inverso. Un campo que la edición añadió vuelve a quedar vacío |
| Rechazos de deshacer | Sin cambios → 404 `NO_CHANGES`. Alta → 409 `NOT_AN_UPDATE`. Otra copia → 409 `OTHER_COPY`. Registro cambiado fuera del historial → 409 `RECORD_CHANGED`. Cuerpo vacío, `changeId` 0, campo de más, copia vacía o fecha demasiado larga → 422 |

## Verificación

- `NODE_ENV=test npx tsx --test tests/api-v2-contracts-csv-undo.test.ts` → **5/5**.
- `npx tsc --noEmit -p tsconfig.json`: sin errores en este archivo. Los únicos errores actuales están en `tests/return-explain.test.ts`, que es trabajo en curso de la sesión principal.
- Datos y correos ficticios (`@example.com`). Carpetas `tests/.tmp/contract-r2-*` que se borran al terminar.

## Observación para la sesión principal

`registerCsvImport` solo se monta en `server/main.ts`, no en `createBaseApp` ni en `server/runtime.ts`. Si el paquete independiente (`runtime.ts`) debe ofrecer la importación, falta montarla allí. Si no debe, conviene dejarlo escrito. No lo he comprobado más allá de esta búsqueda.

## Huellas (SHA-256)

| Archivo | Huella |
| --- | --- |
| `tests/api-v2-contracts-csv-undo.test.ts` | `676b570002ee46dace2765e370b6db139512a52f2e41a21743e3107427b109af` |
