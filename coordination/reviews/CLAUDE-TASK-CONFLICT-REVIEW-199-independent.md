# Comparador 199 R2 · dictamen independiente favorable

Se acepta el modelo y el componente independiente sobre las siete huellas registradas. El comparador conserva el borrador y prepara una propuesta. Su conexión a la ficha y el guardado requieren una entrega posterior.

Las cuatro sondas originales pasan con R2. Cubren la clave propia `constructor`, las reglas aplicadas a la combinación de campos, el rechazo de registros ajenos a tareas y la exigencia de identidad mínima de la copia. En total pasan 26 casos Node, incluidos los 22 de la autora, y el análisis focal de tipos. Chromium repite los 10 recorridos del arnés, incluidos los tamaños 1440, 390 y 320, el texto hostil y el cambio de lectura.

La prueba independiente de React cambia las notas de la lectura actual y llama a `form.requestSubmit()` en un efecto de layout del padre, antes de ejecutar los efectos pasivos. En la R1 preservada, el botón aún aparecía habilitado y se emitía una propuesta. En R2, el botón se deshabilita en el mismo commit y salen cero propuestas. Ambas pasadas usan un callback en memoria y registran cero peticiones y errores. El ensayo fuerza esa frontera de forma sintética.

El corte privado `tests/.tmp/q210-0f1a73d4` conserva manifiesto, resultados Node, análisis de tipos, Chromium y `before-passive.json`. Las siete huellas del autor coinciden con el corte. Las seis mutaciones que comunica la autora quedan como evidencia de su informe. Se probaron datos ficticios en Chromium aislado.

Para el montaje, el anfitrión debe vincular las elecciones y el borrador a la revisión exacta que leyó, incluso si otra revisión devuelve el mismo contenido. Antes de guardar debe aplicar el contrato de concurrencia de la ficha y permitir una nueva revisión cuando el servidor la requiera. Esta entrega acredita la preparación de la propuesta en el componente.

---

## Primer dictamen · histórico

# Comparador 199 · revisión independiente 204

5/11/2026, 17:05:04, Europe/Madrid. **Devolver 199 para corrección**. Se preservan sus siete reservas. La suite presentada pasa 16/16 y el typecheck focal pasa. Las cuatro sondas independientes fallan por las aserciones previstas con el modelo presentado.

## F1 · Un campo permitido se confunde con una propiedad heredada

`FieldSchema` acepta el campo de texto `constructor`. La sonda usa una base, una propuesta propia y un valor ajeno distintos. `validateDraft` devuelve un objeto sin incidencias propias para la propuesta. `whyNotApplicable` accede al resultado por clave sin comprobar propiedad propia y obtiene `Object.prototype.constructor`. La fila queda en `incompatible` con el texto «function Object() { [native code] }» y el comparador fuerza conservar el valor ajeno. Ese caso debe exigir una elección explícita.

Las búsquedas de elecciones también deben comprobar propiedad propia y valor permitido. Tras corregir la primera búsqueda, la lectura heredada en `pendingDecisions` seguiría tratando una clave como `constructor` como decidida. Este segundo efecto se deduce del código. La reproducción del corte se detiene en la clasificación errónea.

## F2 · Una regla entre campos descarta parte de un borrador válido

Las notas solo son obligatorias cuando la tarea está completada. La persona cambia el estado a pendiente y vacía las notas. La validación del parche conjunto devuelve cero incidencias. `whyNotApplicable` valida las notas aisladamente contra el estado anterior, las marca incompatibles y obliga a conservarlas. La resolución devuelve `ready` con `{status:'pending'}`, aunque la decisión solicitada y válida incluía `notes:null`. Las reglas cruzadas deben evaluar la combinación elegida. Si se conserva el estado completado y se vacían las notas, esa propuesta sí debe quedar inválida.

## F3 y F4 · La identidad debe corresponder a una tarea y estar acreditada

En F3, dos registros tipados como contactos con el mismo ID y contexto pasan la comprobación de identidad y el modelo devuelve `ready`. El modelo solo comprueba que ambas entidades coincidan. Debe exigir la entidad de tarea en ambas lecturas y en el esquema que usa.

En F4, las dos lecturas tienen `instanceId:null` y los demás datos coinciden. El modelo devuelve `ready`. La igualdad de valores ausentes no acredita la identidad de instalación. Debe conservar el borrador y bloquear la combinación cuando falte la identidad necesaria. Los campos legítimamente opcionales del contrato, como la cuenta ausente en una ficción, conservan su tratamiento.

## Evidencia y alcance

Corte `tests/.tmp/q204-3679338b`, con siete huellas cotejadas antes y después. `author16.log` contiene la repetición 16/16. `independent.log` contiene cuatro fallos por aserción. `typecheck.log` corresponde al modelo, el componente y las dos suites Node. La primera versión de la sonda del revisor tuvo un error de tipos al construir la elección especial. Se corrigió en la sonda mediante una propiedad propia creada con `Object.fromEntries`. El corte final conserva los cuatro resultados y tipos limpios.

Los 10 casos DOM y las seis mutaciones descritos por la autora pertenecen a su entrega. Tras reproducir los defectos de modelo, esta revisión se limitó a Node y tipos. El comparador sigue siendo un componente de preparación. Las sondas no enviaron peticiones y no reproducen un guardado de la App.

La corrección se solicita en [el encargo R2](../briefs/CLAUDE-TASK-CONFLICT-REVIEW-199-R2.md). La unidad 171 conserva su trabajo independiente. El dictamen 204 se presenta para revisión ajena.
