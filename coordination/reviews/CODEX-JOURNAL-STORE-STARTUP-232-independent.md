# Revisión independiente de Store 055 y arranque 232

5/11/2026, Europe/Madrid. Dictamen favorable sobre las cuatro huellas vigentes de `CODEX-INTEGRITY-055` y las dos de `CODEX-JOURNAL-STORE-STARTUP-232`.

Una fila de metadatos heredada y no JSON bajo `task-intent:` se conserva al abrir la base de archivo. El lector del diario puede aislarla y la copia activa sigue disponible. Las filas legibles conservan su migración a cifrado. La excepción se limita a ese prefijo en la tabla de metadatos y al fallo de parseo. Un valor no JSON bajo `task-intent-other:` sigue impidiendo el arranque. Las reglas de `recoveryPlan` mantienen su comportamiento.

Se cotejaron 141 entradas en cada corte congelado y las seis huellas vigentes en el tablón. Store tiene SHA-256 `990baafc88e636a667fbf9848ce2bbd5f87aae318398d1ced3e5d3f19d6af12c`. Recovery y la matriz de 055 coinciden con el corte anterior. El diff de Store entre ambos cortes contiene únicamente la tolerancia acotada del arranque. Las huellas detalladas quedan en `tests/.tmp/review234/submitted.json`.

| Comprobación repetida | Resultado |
| --- | --- |
| Misma prueba de arranque en `s232-before-00f8f7ae` | Una prueba falla en `Store.migrateEncryption` con `SyntaxError`. El control ajeno pasa. |
| Corte `s232-after-8981b46f` | 62/62. Dos pruebas de arranque, 16 de recuperación y 44 del diario R3 preservado, incluidas las siete sondas anteriores. |
| Compatibilidad con el adaptador R3 en raíz nueva | Estado HTTP 200, una entrada en cuarentena y un borrador recuperable. La poda conserva ambas. La fila dañada conserva sus bytes y la legible está cifrada. |
| Tipos focales de las suites | Exit 0. |

Evidencia de la repetición en `tests/.tmp/review234/`, con `before.log`, `after.log`, `types.log` y `compat-result.json`. Se usó SQLite de archivo con claves nuevas de tipo test y Fastify inject. Para la sonda de compatibilidad se conservó el código del autor con las cuatro importaciones dirigidas a la copia congelada y las salidas en la raíz del revisor. Las 16 pruebas de recuperación cubren la normalización de envíos inciertos y las defensas de 111 en estas fuentes. Los bundles de main y runtime son evidencia del autor. Esta revisión acredita el arranque mediante la factoría y la conservación de datos e historial tras dos aperturas.

El registro ilegible heredado sigue en disco con sus bytes originales, incluidos los que ya estaban en texto plano. El contrato del diario 208 sigue su revisión R4. Su API protegida y la superficie de recuperación requieren su propio montaje antes de preparar el siguiente corte servido.
