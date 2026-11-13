# Claude B · R2 del verificador de migraciones — atendida

Actualización8/11/2026: R2ha pasado la repetición independiente de24pruebas de Claude+7sondas propias y tipos focales0. Los hallazgos de esta devolución están corregidos y sus cinco huellas pueden aceptarse. **No repitas este encargo ni sigas editando la entrega aceptada.** La siguiente unidad de interfaz/informe visual requiere nuevas reservas y la puerta de Fase4; no queda autorizada por el cierre del motor.

Las instrucciones siguientes son históricas y se conservan para trazabilidad.

---

Después de la devolución formal de `CLAUDE-MIGRATION-VERIFIER-CORE`, corrige exclusivamente sus cinco rutas reservadas: shared/migration-verifier.ts, shared/migration-report.ts, shared/migration-demo.ts, tests/migration-verifier.test.ts y coordination/reports/CLAUDE-MIGRATION-VERIFIER-CORE.md. Sigue AGENTS/COORDINACION y check-path. No toques contexto,287,App,main,UI,comparador vigente ni4601.

Lee `coordination/reviews/CLAUDE-MIGRATION-VERIFIER-independent-287.md`. Tus19pruebas pasan. Dos controles positivos y cinco sondas independientes delimitan tres hallazgos reproducidos. Este trabajo va después de presentar la corrección activa de Zendesk si todavía la estás editando; no multipliques reservas ni mezcles entregas.

1. **Los datos deben ser propios del objeto.** Claves, campos, relaciones y traducciones nunca se leen de Object.prototype. `constructor`/`toString` ausentes no deben crear correspondencias ni campos presentes; `valueMap:{}` no debe traducir esos valores. Conserva propiedades propias legítimas con esos nombres. Prueba objetos obtenidos por JSON.parse, propiedades propias y ausentes; verifica candidatos, avisos y ausencia de un falso sin diferencias. No basta con una prueba de que Object.prototype no se contaminó.

2. **Valida días reales.** En type:date, `2026-02-30`, `2025-02-29`, `2026-04-31` son sin concluir aunque los dos lados coincidan. Date.parse finito no basta. Conserva bisiestos válidos, límites de mes y comportamiento de zonas/DST de datetime. No conviertas una fecha inválida en otra fecha ni la presentes como igual o diferencia confirmada.

3. **Declara todos los recortes.** Dudosos y relaciones deben informar en el HTML si solo se muestran los primeros200deN, igual que las otras listas. JSON, contadores, candidatos y límites permanecen coherentes. Prueba más de200elementos en ambas ramas, sin inventar detalles de lo recortado. No afirmes validación visual nueva si no ejecutas navegador; no lo necesitas para cerrar estas regresiones Node.

Integra regresiones en tu archivo propio y demuestra que fallan con R1 en una copia temporal, pasan con R2 y conservan las19anteriores. Las reproducciones de Codex están en tests/.tmp/migration287-probes.ts; no modifiques ese banco. SHA/Unicode/canonización pasaron controles propios: no cambies el algoritmo sin evidencia. Ejecuta tipos apropiados y mide únicamente lo realmente comprobado.

Actualiza informe, límites y nuevas huellas; submit y detén la edición. Sin autoaceptación. La unidad sigue interna: sin endpoint, navegación, archivos reales, proveedor o permisos nuevos. La confirmación del mapa continúa siendo un nombre declarado mientras no haya identidad autenticada. Si esperas revisión, elige otra tarea con rutas libres y dependencias satisfechas.
