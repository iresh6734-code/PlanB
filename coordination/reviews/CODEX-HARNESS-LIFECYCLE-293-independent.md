# Revisión independiente de 293

8/11/2026, Europe/Madrid. Autor: chat Codex «Prepara un plan potente para Claude». Se acepta la unidad de infraestructura de pruebas; no acredita una función nueva del producto.

## Corte revisado

| Archivo | SHA-256 |
| --- | --- |
| tests/e2e/hoy-recuperable-harness.ts | 8e071e2be3336eca4c0661b7b71ae8ff1bf737a15a5d5ac51b392d9020439d17 |
| tests/hoy-harness-lifecycle.test.ts | 1109da4fbf303f2b14a2bf390c3027ab9e60b8cc82f177b30533838941668d19 |
| coordination/reports/CODEX-HOY-HARNESS-LIFECYCLE-293.md | 8511d1f534374eee4063244ea63a48e5cbfacc05663b378ee4e3797eec8c90ae |

La lectura estática confirma seguimiento por ChildProcess original y recibo close, también para arranques fallidos. El doble start no sustituye un hijo pendiente; stop espera close aunque exit ya haya ocurrido. Un recibo público inventado no sustituye al original. No se consulta un PID histórico que pueda pertenecer a otro proceso. Reiniciar comprueba handles, sin exigir que el sistema nunca reutilice un PID.

## Comprobación propia

Banco nuevo `tests/.tmp/harness293-independent-S0RIS8`, script `tests/.tmp/review-harness293.cjs`. Base aceptada 288 congelada y superposición explícita de los dos archivos de prueba 293. SQLite ficticia de archivo y servidores locales reales, sin navegador. Manifiesto y resultados en result.json.

- Node: **7/7**, un padre y seis controles, 40,75 s; cero fallos, omisiones, cancelaciones o TODO. Cubre hijo activo/doble arranque, recibo falsificado, PID reutilizado simulado, ausencia del recibo original, reinicio con datos conservados y salida antes de LISTEN.
- Tipos focales: exit 0. Fuentes y las tres huellas presentadas cotejadas antes y después.
- Consulta CIM posterior limitada al banco: ningún proceso vivo.

No se editaron los tres archivos del autor. La contraprueba causal sobre la versión anterior es evidencia del autor, leída pero no repetida en este banco. No se ejecutaron navegador, npm test completo, montajes de App ni actualización de 4601. Los resultados anteriores de Jornada no se convierten retroactivamente en verdes.

## Decisión

Sin hallazgos bloqueantes en este alcance. Se acepta CODEX-HOY-HARNESS-LIFECYCLE-293 sobre las huellas anteriores. Este dictamen se presenta por separado para revisión del otro chat Codex.
