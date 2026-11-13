# Dictamen independiente 244 · CODEX-EVIDENCE-101

6 de noviembre de 2026, Europe/Madrid. **Devolver a `working`.** Conservar reserva. Hallazgo F1 en `server/continuity-evidence.ts`, función `technical`. Revisión del servicio, sin montaje.

## F1 · Cinco copias de una sola comprobación cuentan como éxito técnico declarado

La condición comprueba `passed`, `isolated`, longitud cinco y que todos los elementos declaren éxito. No identifica las cinco comprobaciones distintas. Con una Store SQLite nueva se guardaron dos informes ficticios de la misma captura. El control positivo contiene las cinco comprobaciones del trabajador. El otro repite cinco veces «Red externa bloqueada» y no contiene las cuatro comprobaciones restantes. `reviewContinuityEvidence` devuelve `declaredPassed: 2`. El GET 103 devuelve el mismo agregado. Esperado `declaredPassed: 1`. El caso no altera los hashes de las seis tablas ni inventa una medida de recuperación. La evaluación sigue en `unproven` y su tiempo es `null`. El problema es qué se cuenta como un informe técnico correcto y termina en el pasaporte, no un RTO falso.

El validador técnico del checkout `shared/drill-evidence.ts` exige las identidades canónicas, una vez cada una. Coordinar con `CODEX-DRILL-EVIDENCE-201`, en revisión al corte. La corrección debe distinguir registro guardado de resultado técnicamente coherente y conservar un control positivo con las cinco identidades, falsos por duplicado o sustitución y datos legado. Si el dueño decide que se quiere contar el bit de declaración en crudo, hace falta un contrato que lo separe del informe técnicamente correcto y consumidores que lo presenten como tal. Actualizar el control positivo antiguo que usa etiquetas inventadas `Check 0` a `Check 4` para que represente al trabajador real. Sin cambiar el vínculo limitado a ID ni ascender simulacros históricos a prueba de recuperación.

## Evidencia

- Coinciden 5 huellas de entrega con el tablón y 17 fuentes con la proyección histórica. Los 4 archivos de código/pruebas entregados coinciden entre ambas proyecciones y checkout. El informe se cotejó en el checkout.
- 49/49 Node en corte propio de 101, incluidos servicio, motor y cola. Los mismos 17 casos del servicio pasaron como parte de 64/64 en la proyección 103. La primera invocación del arnés falló por pasar una ruta de disco como URL ESM en Windows. Se repitió por la CLI de `tsx` sin cambiar fuentes.
- Reproducción independiente en `tests/.tmp/review244-kfO06p/CODEX-EVIDENCE-API-103/independent-244.test.ts`, primer caso. Log `independent-review.log`, fallo `2 !== 1`. La proyección de 103 conserva los mismos bytes del servicio 101. No hay llamadas externas, listener, credenciales reales, ni cambios a fuentes revisadas.
