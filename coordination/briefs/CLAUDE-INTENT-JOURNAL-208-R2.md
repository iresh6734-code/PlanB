# Diario 208. Corrección R4 vigente

## Encargo vigente · R5

Las seis huellas de R4 coinciden. Pasan las 56 pruebas propias y de revisión anterior. Conserva tus seis rutas y reproduce las cinco sondas de `tests/.tmp/journal-r4-vdVBO2/s/tests/independent-intent-journal-r4-scope.test.ts`. El diario tiene APIs asíncronas y sus entradas pueden cambiar mientras espera al almacenamiento.

1. Fija el ámbito e identidad al entrar, antes del primer await. En `saveDraft` y `attempt`, compara el borrador leído con la intención preparada. Una solicitud iniciada en A no adquiere acceso a B porque el llamador cambie el objeto compartido durante `readAll`. Aplica la misma regla a `boot`, anotación de evidencia, aceptación y abandono. Revisa también el ID y el registro base usados tras una espera. La intención que se persiste, envía y liquida debe corresponder al mismo ámbito inicial.
2. Entrega al callback de envío una copia del registro. Conserva una referencia propia para determinar qué intento se liquida tras un acuse. Cambiar el objeto recibido por el transporte nunca debe alterar el ID del seguimiento interno o liquidar otro intento. Prueba el ID, el ámbito y el parche, además del caso feliz y de un error de transporte.
3. Repite las cinco sondas con la entrega anterior, confirma sus fallos causales y añade regresiones a tus pruebas. Deben pasar los 56 controles existentes y estas fronteras. Conserva el rechazo sin callback, los bytes del borrador de otra captura, la clasificación de lectura y el registro incierto ajeno. La propuesta privada `proposed-task-intent-journal.ts` pasa 61/61 y tipos, y queda como referencia para tu corrección completa.

El montaje del piloto 251 sigue condicionado a aceptar el diario. Sus garantías de reinicio y cero reenvíos requieren el recorrido compilado que describe ese brief.

## Encargo anterior · R4

Conserva tus seis rutas. Las siete sondas anteriores y 37 pruebas pasan. Reproduce tests/.tmp/j231-9e74a6ed/s/tests/independent-intent-journal-r3-writes.test.ts. El diario debe validar antes de persistir y antes de invocar send. Un fallo de entrada conserva el intento existente y sus bytes.

1. Comprueba valores y límites de patch y baseline antes de serializar. Rechaza NaN e infinitos sin normalizarlos a null y conserva null explícito como valor permitido. Evita que una entrada inválida ocupe una plaza o provoque poda. Comprueba la igualdad entre el registro aceptado y la intención que recibe el callback.
2. Comprueba calendario, forma y coherencia en las escrituras propias, incluidas anotación de evidencia y transiciones. Si falla una entrada o el reloj, conserva la versión anterior y devuelve un rechazo de entrada. Ningún send se invoca con una intención que el arranque no puede clasificar. Mantén CAS, cuarentena para los datos heredados y retención.
3. Repite las 37 pruebas, las siete sondas anteriores y el control con null, más las dos regresiones. Incluye un control de promoción de borrador con entrada inválida que preserve el original. Valida los tipos y registra hashes y el comportamiento de los rechazos. El control privado ilustra una guarda viable, pero la entrega debe contemplar el orden de validación antes de poda.

El montaje HTTP, la vinculación entre lo que revisó la persona y su aceptación, Store y el propietario del gestor siguen en sus propias unidades.

---

**Corrección R3 vigente del diario 208**

Las cinco reproducciones originales ya pasan en R2. Conserva las seis rutas reservadas. Reproduce las dos sondas adicionales de `tests/.tmp/j210r2-0fdc463a/s/tests/independent-intent-journal-r2-races.test.ts` antes del cambio y añádelas a tus suites.

1. Haz que la exigencia de evidencia applied y la liquidación por aceptación se refieran a la misma versión del registro. La sonda interfiere una lectura válida después de tomar el snapshot y antes de que vuelva al llamador. Un segundo diario registra diverged. La aceptación debe rechazar con conflicto o falta de evidencia y conservar byte a byte ese valor nuevo. Repite con unchanged y con retirada de evidencia. Conserva el control positivo sin carrera, su procedencia humana, el rechazo por contexto y las comprobaciones de fase. La prueba debe comprobar resultado, fase, evidencia y bytes.
2. Valida las fechas del metadato con el calendario y los formatos ISO definidos. El 30 de febrero con hora y zona UTC debe quedar en cuarentena, sin operar ni purgar. Mantén las formas válidas que ya admite el contrato, incluidos los ejemplos sin milisegundos. Añade un control de año bisiesto válido y otro inválido, y comprueba que un terminado válido vencido sí se retira. Aplica la regla coherentemente a createdAt, updatedAt y evidence.at.
3. Repite las 31 pruebas actuales, las cinco sondas originales y las dos nuevas. Demuestra la sensibilidad de las nuevas regresiones sobre R2 preservada. Actualiza contrato e informe con las seis huellas vigentes y los límites. Mantén el montaje, Store, Recovery y las rutas de otras sesiones bajo sus propios encargos. Presenta por el tablón y conserva las reservas para revisión.

---

**Encargo anterior R2 · histórico**

# Claude · Diario de intención 208 R2

Continúa dentro de las seis rutas ya reservadas de 208. Lee el [dictamen independiente](../reviews/CLAUDE-INTENT-JOURNAL-208-independent.md) y reproduce sus cinco casos antes del primer cambio. Las sondas se conservan en `tests/.tmp/j210-98fe684e/s/tests/independent-intent-journal.test.ts`. Incorpora las regresiones a las suites que ya posees.

1. Para cualquier mutación de un borrador existente, comprueba primero identidad completa de instalación y captura y coincidencia del ID de tarea. Incluye intento desde otra captura, otra instalación y otra tarea en la misma captura. En cada rechazo exige cero callbacks y cero cambios de bytes. Prueba la actualización de borrador existente y la promoción válida, conservando el ID y la fecha de creación.
2. Guarda juntos el parche, el valor base de los campos efectivamente enviados y la revisión revisada. Comprueba qué lee el callback, qué quedó escrito y qué clasifica una nueva instancia del diario. Retén un fallo de escritura y prueba que el callback queda sin ejecutar.
3. Haz cumplir el límite de altas con IDs distintos en el punto de escritura. Prueba la carrera sobre el último hueco con dos instancias del diario que comparten la base. Comprueba que se conserva el límite, que solo gana una alta, que un intento rechazado no llama a su callback y que pueden editarse registros existentes cuando la base está llena. Distingue el alcance probado de la exclusión entre procesos.
4. Rechaza forma incoherente antes de clasificar, operar o purgar. Incluye fechas inválidas con checksum coherente, una fase y procedencia incompatibles y un ID interno distinto de la clave. La retención requiere una fecha de liquidación válida y vencida. Demuestra que el registro inválido se conserva byte a byte y que el terminado válido y vencido sí sale.
5. Actualiza contrato e informe con límites, hashes, pruebas y contrapruebas en raíz aislada. Documenta qué puede afirmar el arranque cuando la lectura completa falla y qué exige una aceptación de lectura. Si corregir algo requiere tocar Store, Recovery, rutas HTTP, App o las entregas de otra sesión, identifícalo y mantenlo fuera de R2. Presenta por el tablón y deja las seis reservas para revisión.
