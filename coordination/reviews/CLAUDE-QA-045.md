# CLAUDE-QA-045 · Verificación de la corrección Unicode y cierre de los dos TODO de QA042

30/10/2026 (Europe/Madrid). Autor: Claude, misma sesión revisora que hizo QA042. Reserva con `claim CLAUDE-QA-045 claude`; `check-path` correcto para los dos únicos archivos. Sin servidores, Vite/E2E, navegador, build, despliegue, datos reales ni proveedores. Node con `scripts/block-external.cjs`. **Ninguna fuente ni test de Codex editados; `coordination/reviews/CLAUDE-QA-042.md` (histórico, aceptado) no se toca.**

## Dictamen

| Unidad | Dictamen |
| --- | --- |
| OPS039 `shared/response-queue.ts` (versión `d717bf6c…`) | **Favorable.** OPS039-1 corregido. |
| DIFF040 `shared/capture-comparison.ts` (versión `d2e0da8a…`) | **Favorable.** DIFF040-1 corregido. |

No acepto los módulos: la aceptación es de Codex. UX038 no es de esta sesión y no la he tocado.

## Historial frente a versión corregida

- **QA042 (histórico):** revisó los hashes `b5a14ced…` (OPS) y `594a167d…` (DIFF), con un defecto menor cada uno y dos `todo`. Sigue siendo cierto para esas versiones.
- **QA045 (esta):** revisa las versiones corregidas. LAB035 no cambió: motor `ba46a0e9…` y su test `8ee14a6b…` idénticos.

## Hashes revisados (SHA-256, recomprobados contra el tablón y el disco)

| Archivo | Hash |
| --- | --- |
| shared/response-queue.ts | d717bf6c039aca65e2f6413beecbf5cdbe3bca439d726860c1f1ddaeec3c0d76 |
| tests/response-queue.test.ts | 4d7e8cac3870271dbafd6217194e7f61ec8cc011d3ce6d50617fd549277fb86b |
| server/response-queue.ts (sin cambios) | eb3d0d64b8da5f351f34a0ba2ff0412ec8bc878a43dda730cf50e0d9d1772465 |
| shared/capture-comparison.ts | d2e0da8aeeccf5ae46331cec04e4a53cb557d1664a547a1ad5b48980f3241970 |
| tests/capture-comparison.test.ts | cfcc032b746a01604bf1eb7b31067f818048df6d8360402ff9f1ea8c6fb1b7c8 |
| server/capture-comparison.ts (sin cambios) | 356fe7ec48d2bb5b070084888b0409dbe2b102f5860842489fbc28106900e46d |
| shared/continuity-lab.ts (sin cambios) | ba46a0e9b1aff7ee71576c3d15485382f93caae6cdf520ad73164ffc799205db |
| coordination/reports/CODEX-TEXT-044.md | 692db04f80fac6131e2668e79d4f23b6b5e5fd75e5f1980b00a652077153a7a0 |

Mi `tests/independent-continuity-review.test.ts` = `71f40c65e13a67935f7972df8d7c2a95e0ada56e066cace65cac427e1f3ff50f` (el hash de este informe lo fija `submit`).

## Qué cambió en la fuente (leído, no solo ejecutado)

Ambos módulos añaden `clip(value, limit)`: toma `min(longitud, limit)` y, si la unidad previa al borde es sustituto alto y la siguiente es sustituto bajo, retrocede una unidad. Se aplica en OPS a la etiqueta (180), al ID de respaldo (180) y al valor de vencimiento inválido (100), y en DIFF a la vista previa (500) y a la etiqueta (180). `truncated` de DIFF sigue calculándose sobre la longitud original, y la comparación sigue usando valores completos. El máximo se respeta (puede devolver 179/99/499); no repara cadenas que ya llegan mal formadas (un sustituto alto suelto no seguido de bajo no se toca), lo cual es coherente con lo que declara TEXT044.

## Cambios en mi batería (única edición de código mía)

- Retiradas las dos marcas `todo`; las pruebas son ahora ordinarias.
- OPS: la precondición ya no exige longitud exacta 180 (el contrato es un **máximo**; el par que cruza el borde deja 179). Se afirma por igualdad con la cadena esperada, no solo por ausencia de huérfanos: par que cruza → 179 y 99; par que cabe justo → 180 y 100 con el emoji íntegro; ID de respaldo con asunto en blanco; texto ordinario de 200 caracteres sigue dando 180 y 100 exactos.
- DIFF: par que cruza el 500 → 499, `truncated: true`, y la diferencia del sufijo sigue detectándose; par que cabe justo → 500 con el emoji íntegro; valor de exactamente 500 terminado en par → sin recorte ni marca; etiqueta de 180 con campo principal real (179 y 178+emoji).
- Se conservan todas las demás pruebas y aserciones sin cambio.

## Ejecuciones propias (distintas de la evidencia de Codex)

Codex declara 63/63 focales, typecheck correcto y 33/33 sin `todo` en una copia temporal de QA042. Lo que sigue lo ejecuté yo sobre los hashes de arriba:

```powershell
node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/independent-continuity-review.test.ts
```
**33 pruebas: 33 correctas, 0 fallos, 0 `todo`.**

```powershell
node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/continuity-lab.test.ts tests/response-queue.test.ts tests/response-queue-api.test.ts tests/capture-comparison.test.ts tests/capture-comparison-api.test.ts
```
**63/63 correctas.** `tsc --noEmit`: sin errores. (Lo de Codex coincide con lo que he medido; no verifiqué los logs que cita en `tests/.tmp/coord043`.)

### Sensibilidad (copias efímeras de `shared/`, `node tests/.tmp/claude-qa042/mutate.mjs`)

20 de 21 mutaciones detectadas; la única no detectada (M6, quitar `Object.hasOwn`) es un mutante equivalente, ya explicado en QA042. Mutaciones nuevas para esta corrección:

| Mutación | Detectada por |
| --- | --- |
| M19 OPS: `clip` vuelve a `slice(0, limit)` (defecto original) | prueba Unicode de OPS |
| M20 DIFF: igual | prueba Unicode de DIFF |
| M21 OPS: retrocede de más (límite − 2) | prueba Unicode de OPS y prueba de tipos de campo (valor inválido de 100) |

Es decir: las pruebas reintroducen el fallo original si se revierte, y también detectan un «arreglo» que recorta de más.

## Límites

- Lógica pura y API por `inject` ya cubiertas en QA042; aquí solo se re-verificó lo que toca la corrección. Sin QA visual, listener, E2E, recuperación en otro equipo ni despliegue.
- El recorte evita **introducir** el defecto; no sanea cadenas ya mal formadas de origen (no probado como requisito, declarado por Codex).
- No cubre otros recortes del código base fuera de OPS039/DIFF040.
- Fuentes de Codex y QA042 histórico: hashes recomprobados, sin cambios por mi parte.
