# CLAUDE-EOL-LF-ACEPTADAS · Normalización a LF de las unidades 233, 230 y 208

7/11/2026, Europe/Madrid. Corrección de un error propio, aprobada por el usuario («Sí, normaliza»).

## Qué pasó

En mis informes de 233, 230 y 208 (y después en A2, adaptador A3 y arnés) escribí que «el árbol de trabajo está en CRLF». Era falso: comprobé los saltos de línea con `grep -c $'\r'`, que en esta shell cuenta todas las líneas. Con un contador exacto de bytes el árbol es **mayoritariamente LF** (p. ej. `src`: 81 solo-LF, 26 solo-CRLF, 6 mixtos) y los archivos que recibí eran LF. Al «conservar CRLF» los convertí yo.

## Qué hace esta unidad

**Solo cambia terminaciones de línea (CRLF → LF)** de **16 archivos existentes** de las unidades aceptadas (más este informe, nuevo y en LF). Para cada archivo el script comprueba que no queda ningún CR suelto y que, quitando los CR de ambos lados, el contenido es **idéntico byte a byte** al anterior; solo entonces escribe. La diferencia de tamaño de cada archivo es exactamente su número de saltos de línea.

| Archivo | Saltos | SHA-256 nuevo (16 primeros) |
|---|---|---|
| `shared/local-operations.ts` | 132 | `8f37462742e08bf7` |
| `server/local-operations.ts` | 189 | `6d3208b22145713e` |
| `src/local-operations-client.ts` | 68 | `d65856ac4709715b` |
| `tests/local-work-queue.test.ts` | 407 | `e8fcc2311f7b60c9` |
| `coordination/reports/CLAUDE-TODAY-WORKQUEUE-230.md` | 110 | `989bef1b61bfc52f` |
| `coordination/plans/TODAY-WORKQUEUE-230-HANDOFF.md` | 37 | `052608052863ad4a` |
| `shared/task-intent-journal.ts` | 287 | `777b8235b048c4d7` |
| `server/task-intent-storage.ts` | 51 | `c5de864b9c0f68f8` |
| `tests/task-intent-journal.test.ts` | 370 | `abbea7f1f14c57bb` |
| `tests/task-intent-storage.test.ts` | 180 | `80454300bdae6cc9` |
| `coordination/plans/INTENT-JOURNAL-208-CONTRACT.md` | 97 | `a54bd95bfeea274c` |
| `coordination/reports/CLAUDE-INTENT-JOURNAL-208.md` | 123 | `aedf656edf9076d0` |
| `src/task-revision-strategy.ts` | 85 | `b227925df603c2e2` |
| `tests/task-revision-strategy.test.ts` | 166 | `19ff5ca16019ee22` |
| `coordination/reports/CLAUDE-TASK-REVISION-STRATEGY-233.md` | 85 | `550e3f84c082dda0` |
| `coordination/plans/TASK-REVISION-STRATEGY-233-HANDOFF.md` | 28 | `05c48a503260c7c2` |

## Verificación

Repetidas **220/220** pruebas Node (estrategia 233, gestor y adopción, cola estructurada 230 y toda su familia de Hoy, diario y almacenamiento 208, adaptador de la Jornada, host y `task-focus-outcomes` con sus huellas) y `tsc --noEmit` limpio. Ningún archivo con huella fijada está entre los 16, así que ninguna prueba de huella cambia.

## Límites y lo que queda

- **`src/task-save-outcome.ts` (233) sigue en CRLF a propósito**: su huella está fijada en `tests/task-focus-outcomes.test.ts`, que reserva `CLAUDE-HOY-POR-DECIDIR-A2` mientras esté en revisión. Se normalizará junto con esa huella en una unidad posterior.
- **Los hashes citados en los informes anteriores** (233, 230, 208 y sus traspasos) describían los bytes CRLF y ya no coinciden con los archivos: el contenido es el mismo salvo los saltos. Los dictámenes de Codex siguen siendo válidos para el texto, pero cualquier cotejo por huella debe usar los de esta tabla.
- **Unidades todavía en revisión** (`A2`, adaptador A3 y arnés R2) conservan CRLF porque no se pueden tocar presentadas: se normalizarán cuando se devuelvan o se acepten.
- Los archivos que ya eran LF no se tocan.
