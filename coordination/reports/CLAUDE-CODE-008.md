# Informe CLAUDE-CODE-008

Autor: Claude (Sonnet 5.5). Estado: entregado para revisión del coordinador. No se autoacepta.

## Archivos (solo estos tres, todos nuevos)

- `shared/crm-capture-contract.ts`: módulo puro TypeScript, sin dependencias.
- `tests/crm-capture-contract.test.ts`: pruebas con `node:test` y `node:assert/strict`.
- `coordination/reports/CLAUDE-CODE-008.md`: este informe.

No se leyó ni editó ningún otro archivo (ni `tests/crm-capture-contract.acceptance.test.ts`). No se usó red, git, subagentes, instalaciones ni el runner general.

## Qué implementa

API exportada exactamente la pedida: `Entity`, `CaptureBinding`, `CapturePage`, `CaptureLimits`, `CaptureSummary`, `CaptureContractError` (con `readonly code`) y `CrmCaptureContract` (`constructor`, `addPage`, `finalize`). No hay otras exportaciones. El módulo no está conectado a ningún importador.

Estado interno por entidad: cursor esperado, `done`, páginas, registros, total declarado, `Set` de IDs y `Set` de cursores usados. Solo se guardan IDs y metadatos de control. La memoria queda acotada por `maxRecords` y `maxPages`, y el coste es lineal en los IDs. Al invalidar o finalizar se vacían los conjuntos.

## Decisiones donde el enunciado dejaba margen (a contrastar)

| Caso | Decisión adoptada |
|---|---|
| Orden de comprobación en `addPage` | estado (`FINALIZED`/`INVALIDATED`) → binding → entidad → cursor → forma de la página → `EMPTY_PAGE` → límites → duplicados → bucle de `nextCursor` → `TOTAL_CHANGED` → `COUNT_MISMATCH` |
| Binding mal formado (no objeto, campo no canónico) | `INVALID_INPUT`. Bien formado pero distinto → `BINDING_MISMATCH`. |
| Entidad no configurada, o valor no string | `UNKNOWN_ENTITY` en `addPage`. En el constructor, un tipo no admitido es `INVALID_INPUT`. |
| `addPage` sobre una entidad ya terminada | `CURSOR_MISMATCH` (`FINALIZED` queda reservado para tras `finalize`) |
| `CURSOR_LOOP` | `nextCursor` igual al cursor de la llamada o a uno ya consumido, o cursor entrante ya consumido. Un cursor entrante `null` repetido es `CURSOR_MISMATCH`. |
| `COUNT_MISMATCH` | Solo se evalúa en la página terminal (`nextCursor = null`), como pide el enunciado. No se rechaza antes por exceso parcial. |
| Total en página terminal | Se usa el total de esa página o, si no lo hay, el declarado antes. |
| Páginas con total inválido, `ids` no array o `nextCursor` no `null`/string | `INVALID_INPUT` |
| `finalize` ya finalizado con binding distinto | Lanza `BINDING_MISMATCH` y conserva el resumen y el estado. |
| Excepción no controlada (p. ej. getter hostil) | Se convierte en `INVALID_INPUT` e invalida. |
| Límites | Contadores globales entre entidades. La longitud de `ids` se compara con el cupo restante antes de recorrerlo. |
| Resumen | Objeto congelado en profundidad, devuelto por la misma referencia en `finalize` repetidos. Incluye solo las entidades configuradas. |
| Atomicidad por página | Toda la validación va antes de mutar. El bloque de aplicación no tiene ramas que lancen. |

## Pruebas realmente ejecutadas

Comando: `node --import tsx --test --test-concurrency=1 tests/crm-capture-contract.test.ts`

Resultado: **49 pruebas, 49 pasan, 0 fallan, 0 canceladas, 0 omitidas** (≈434 ms). Se ejecutó una sola vez, tras corregir antes una línea errónea que había escrito en una prueba. Esa línea nunca llegó a ejecutarse.

Cobertura:
- Recorrido multientidad con paginación, intercalado de entidades y vacío terminal.
- Mismo ID en tipos distintos válido, e IDs no normalizados.
- Constructor: 19 entradas inválidas (`INVALID_INPUT`) más la aceptación de `generation` 0 y de límites `undefined`.
- Los 13 códigos de error: `INVALID_INPUT`, `BINDING_MISMATCH`, `UNKNOWN_ENTITY`, `CURSOR_MISMATCH`, `CURSOR_LOOP`, `DUPLICATE_ID`, `TOTAL_CHANGED`, `COUNT_MISMATCH`, `EMPTY_PAGE`, `LIMIT_EXCEEDED`, `INCOMPLETE`, `INVALIDATED` y `FINALIZED`.
- Fallo cerrado: tras cada error, `addPage` y `finalize` lanzan `INVALIDATED`.
- Deep freeze del resumen, con asignaciones que lanzan `TypeError`.
- No retención de referencias mutables, e idempotencia de `finalize`.
- `FINALIZED` sin destruir el resumen.

Las pruebas usan solo fixtures sintéticos, sin red ni archivos.

## Límites y no verificado

- No se ejecutó `tsc` ni ninguna comprobación de tipos, porque no estaba permitido. `tsx` transpila sin comprobar tipos. Los campos privados `#` requieren un `target` ≥ ES2015. No he podido comprobar el `tsconfig` ni el linter del proyecto.
- No se ejecutó la suite general ni la prueba de aceptación de Codex. Las decisiones de la tabla pueden diferir de lo que esa prueba espera, sobre todo `CURSOR_LOOP` frente a `CURSOR_MISMATCH` en cursores repetidos, y el código para `addPage` sobre una entidad terminada.
- El módulo valida la coherencia del recorrido. No detecta registros omitidos por el proveedor, ni cambios de identidad intermedios si el binding no los refleja, ni garantiza una instantánea consistente. `complete: true` significa solo que todas las entidades terminaron sin violar el contrato.
- No hay integración con importadores, despliegue ni prueba contra ningún proveedor real.

## Pendiente del coordinador

Revisión, `submit` y aceptación. No he reclamado ni presentado el encargo.
