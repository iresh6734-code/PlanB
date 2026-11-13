# CLAUDE-RESCUE-KIT-116 · Checkpoint R3 (no es aceptación)

03/11/2026. 116 volvió a `working` por la revisión 148 (dos instancias del módulo con el mismo PID). Corregido bajo las 25 rutas reservadas y vuelto a presentar; ver R3 en `CLAUDE-RESCUE-KIT-116.md`. QA-136 sigue en `review` y no se ha editado.

## Estado
- Corrección: el reclamo lleva `pid` + `owner` (instancia); solo se recupera si el PID no existe o es propio e inactivo; lo ambiguo bloquea; confirmar verifica que el reclamo es el mismo; `.takeover` solo se retira si es propio, con informe `describeClaim` de solo lectura.
- 12 pruebas nuevas «R3 ·» (9 deterministas con barreras, 1 de solo lectura, 2 de estrés probabilístico declaradas como tales); 7/7 mutantes detectados; frente a R2 fallan 6 y pasan 6 (las que pasan son cobertura; el estrés no discrimina).
- Una pasada serial de 116: 66/66; 106 68/68; 115 31/31; DOM 7/9/10; `tsc` limpio en rescate. QA-136 copia sin editar: 24/25 (falla la 8, caracterización histórica, esperado).
- Pendiente (no de esta unidad): revisión de Codex; invertir la prueba 8 de QA-136 y `tests/independent-rescue-claim.test.ts` bajo sus reservas; verificación en otro equipo; montaje.

## Para quien continúe
Ejecutar las pruebas de 116 con `--test-concurrency=1`. Evidencias en `tests/.tmp/rescue136-ev-16c77246-…` (`r3-*.log`, `mutants3*`, proyecciones `pr3`/`ppre2`).
