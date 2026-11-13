# CLAUDE-EOL-LF-A2-A3-ARNES · segunda normalización a LF

Autor: Claude A. Continúa `CLAUDE-EOL-LF-ACEPTADAS`: la persona aprobó normalizar a LF las unidades que dejé en CRLF por un error de medida (el árbol es mayoritariamente LF y estos archivos lo eran al recibirlos). Esta unidad cubre lo que estaba reservado por unidades en revisión y ya está aceptado: A2 (ficha condicionada y «Por decidir»), el adaptador de la Jornada y el arnés de sondas.

## Qué cambió

Solo saltos de línea (CRLF → LF) en 13 archivos; por cada uno se comprobó, **byte a byte, que sin sus CR el contenido es idéntico al anterior**. Más **dos huellas renovadas** (una por archivo de prueba, sin tocar el resto):

- `tests/task-focus-followup.test.ts`: la huella de `src/LocalTaskFocus.tsx` (`01adb2d9489d…` → `7dfc67039bde…`).
- `tests/task-focus-outcomes.test.ts`: la huella de `src/task-save-outcome.ts` (`09d324b80a6f…` → `e4e5167580b5…`).

| Archivo | CRLF convertidos | SHA-256 anterior | SHA-256 nuevo |
| --- | --- | --- | --- |
| `src/LocalTaskFocus.tsx` | 482 | `01adb2d9489d` | `7dfc67039bde` |
| `src/TaskOutcomesHost.tsx` | 199 | `209c93fb3e43` | `8f9f2c715df5` |
| `src/task-save-outcome.ts` | 274 | `09d324b80a6f` | `e4e5167580b5` |
| `tests/task-focus-followup.test.ts` | 141 | `2ad0ba71acf9` | `2831a99ae415` |
| `tests/task-outcomes-host.test.ts` | 191 | `bdc3ae08c076` | `9dea0617dd52` |
| `tests/task-focus-outcomes.test.ts` | 0 | `f56914140588` | `87549d8b003b` |
| `shared/work-queue-day.ts` | 99 | `c9b42797215c` | `472a66061f26` |
| `tests/work-queue-day.test.ts` | 153 | `4445da2995f2` | `a143a0bdacd2` |
| `tests/e2e/hoy-recuperable-harness.ts` | 222 | `f137dec8ca17` | `29e5ad133105` |
| `tests/e2e/hoy-ficha-condicionada.spec.ts` | 172 | `a3705ca219c1` | `32d9126b5772` |
| `coordination/reports/CLAUDE-HOY-FICHA-CONDICIONADA-A2.md` | 64 | `6c3b9572f29b` | `d637f2688094` |
| `coordination/plans/HOY-FICHA-CONDICIONADA-A2-HANDOFF.md` | 22 | `054eb077a05e` | `29fcaff51b70` |
| `coordination/reports/CLAUDE-HOY-APP-PROBES-A.md` | 60 | `51057d1d1e2f` | `a21ebaa966cb` |

(`tests/task-focus-outcomes.test.ts` ya era LF: solo cambió su huella.) Los hashes citados en los informes de A2, el adaptador y el arnés describían los bytes CRLF y ya no coinciden con los archivos; el contenido es el mismo.

## Verificación

- `tsc` limpio. Node: host 12/12, ficha 8/8, resultados 7/7, adaptador 12/12, cola 25/25, estrategia 15/15, gestor 48/48.
- Navegador sobre los bytes normalizados (raíces nuevas, sin reintentos): A2 **14/14**, «Por decidir» **7/7**, Radar **15/15**, Jornada **16/17** — el fallo es el `afterAll` del arnés («El proceso N sigue vivo tras su cierre») en la última prueba, ya visto antes de esta unidad; en otras ejecuciones, 17/17. DOM de ficha, gestor y comparador **95/95**.

## Hallazgo del arnés (no es producto)

`assertAllClosed` de `hoy-recuperable-harness.ts` declara «sigue vivo» cuando `process.kill(pid, 0)` no falla, aunque el proceso tenga su recibo de cierre. En Windows el sistema reutiliza PIDs, y ha dado 2 falsos positivos en unas 8 ejecuciones seguidas. Propuesta: unidad pequeña que, con recibo de cierre, solo falle si el proceso vivo con ese PID conserva la línea de comandos del servidor del caso (o confíe en el recibo de `close`). No se toca aquí: esta unidad es solo de fin de línea.
