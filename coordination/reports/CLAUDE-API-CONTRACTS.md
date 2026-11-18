# CLAUDE-API-CONTRACTS · Pruebas por contrato de las rutas principales (E2)

**Autor:** Claude (Opus 5.5), sesión «planb-rendimiento» · **Fecha:** 18/11/2026, Europe/Madrid
**Origen:** mejora E2 de `CLAUDE-INFORME-MEJORAS-GEMINI-2026-11-13.md`, por orden del usuario del 18/11.
**Archivos:** `tests/api-v2-contracts.test.ts` (nuevo) y este informe.

## Qué comprueban

Montan la App real (`createBaseApp`) con base en memoria y la captura ficticia de `shared/fixtures.ts`, y validan **códigos HTTP y forma de las respuestas** con esquemas zod. Los contratos se componen a partir de los esquemas de `shared/`: `SnapshotSchema`, `AppSpecSchema`, `GenerationSchema`, `RecordSchema`, `EntityNameSchema`, `BundleSchema` y `parseWorkspaceSearchContext`. **No se cotejan huellas de archivos**: un cambio legítimo de implementación no las rompe; sí las rompe un cambio de contrato.

| Ruta | Casos |
| --- | --- |
| `GET /api/health` | `{ok, version = APP_VERSION, instanceId uuid}` cerrado |
| Todas | Cabeceras `nosniff`, `no-store`, `no-referrer` y CSP. Host ajeno, Origin ajeno u Origin inválido → 403 con el sobre de error |
| `GET /api/v2/state` | Sin copia: `snapshot: null`, `ready: false`, sin identidad de búsqueda. Con copia: esquemas de `shared/`, captura compacta (sin registros ni relaciones, con recuentos) e identidad de búsqueda válida |
| `GET /api/v2/records/:entity` | Página cerrada `{records, related, total, offset, limit}` para las 4 entidades, relacionados incluidos, filtro `q`, `offset` fuera de rango → vacío. `limit` 0 o 101, `offset` negativo, entidad desconocida o `q` > 200 → 422 |
| `GET /api/v2/records/:entity/:id` | Ficha igual a la del almacén. Inexistente → 404 con `details: null`. Entidad desconocida → 422 |
| `PATCH` / `POST /api/records/:entity` | `{record, change{id, at}}` con identificadores crecientes. Cuerpo vacío, valor anidado, campo de más, `Infinity` o entidad desconocida → 422 |
| `GET /api/v2/changes` | Cada cambio con `{id, at, entity, recordId, operation, before, after}`, y el guardado reflejado |
| `GET /api/v2/search` | Contrato cerrado de resultados y `source`; recuentos que suman el total; filtro por entidad. Sin copia → 409. `q` corto, `limit` 51, entidad desconocida o repetida, o revisión mal formada → 422. Revisión antigua → 409 |
| `GET /api/v2/search-record` | Resultado con relacionados. Inexistente → 404. Otra copia → 409. Datos cambiados tras buscar → 409 |
| `GET /api/export/bundle` | Adjunto con su nombre y cuerpo válido con `BundleSchema` |
| `/api/v2/auth/*` | Estado sin protección. Contraseña corta → 422. Alta con cookie `HttpOnly; SameSite=Strict`. Segunda alta → 409. Sin sesión → 401 en estado y registros. Contraseña mala → 401. Entrada correcta y bloqueo, que invalida la cookie |

Una prueba más comprueba el **propio oráculo**: los contratos rechazan regresiones plausibles. Por ejemplo, un campo de más en una página cerrada, `total` como texto, una entidad desconocida, un valor anidado, una captura sin `manifest`, `ready` como texto, un título vacío o un error sin `error`.

## Verificación

- `NODE_ENV=test npx tsx --test tests/api-v2-contracts.test.ts` → **11/11** (8,5 s).
- `npx tsc --noEmit -p tsconfig.json` → código 0. Se usan las formas actuales de zod 4 (`z.uuid()`, `z.iso.datetime()`, `.loose()`).
- Contraseñas, correos y valores son ficticios. Carpetas propias `tests/.tmp/contract-*` que se borran al terminar.

## Lo que no cubre (propuesta para siguientes unidades)

- Rutas `/api/v2/return/*`, `export/encrypted|package`, `restore`, `connection*`, `captures`, `drills`, `session/*` y `/api/v3…v7`. Necesitan conexión simulada o estados de recuperación; conviene hacerlas con cada autor.
- Las respuestas de `state` y `changes` se validan como **abiertas** (`.loose()`): incluyen campos que hoy no tienen esquema en `shared/` (`usage`, `candidate`, `plan`, `recoveryIntegrity`…). Propuesta para Codex, que coordina los contratos comunes: exportar `StateResponseSchema`, `RecordsPageSchema`, `ChangeSchema`, `SearchResultSchema` y `WorkspaceSearchContextSchema` (hoy no se exporta) desde `shared/`. Así el cliente y estas pruebas validarían contra la misma definición.
- `/api/v2/state` y `/api/records/*` no se validan en el cliente (`src/api.ts` confía en el JSON). Validar en el cliente es otra unidad.

## Huellas (SHA-256)

| Archivo | Huella |
| --- | --- |
| `tests/api-v2-contracts.test.ts` | `5bd99c591116e594978cd6b703e491f7abf33f23026b2fc57d6ab2644e37c2f7` |
