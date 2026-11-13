# Revisión cruzada del contrato A4

9 de noviembre de 2026, Europe/Madrid. Contrato revisado `9eec52e6f0daf3b1764f674ce819352f419dcfd9e88260fd5a59f94010c4571c`. Se leyó junto al diario208, el adaptador de Store, el escritor condicionado y el gestor del cliente. Las rutas propuestas aún necesitan implementación. El dictamen pide dos precisiones antes de cerrar el contrato.

## Puntos que encajan con los módulos existentes

Persistir intención antes de ejecutar, reclamar ID y huella atómicamente, revalidar contexto y permiso antes del escritor y conservar incertidumbre tras entrar en él son compatibles con el modelo existente. El escritor puede confirmar una transacción y después fallar al construir su resultado. El contrato trata ese corte como incierto. También acierta al evitar transacciones anidadas de Store y al exigir una sola aceptación CAS ligada a la secuencia, revisión y evidencia de lectura. La aceptación humana conserva su propia procedencia. La cobertura pública permanece desconocida mientras haya otros productores sin instrumentar.

## F1 · La retención necesita conservar la identidad de ejecución

El contrato permite replay del mismo ID sin ejecutar otra vez y reutiliza208, pero no define la vida del reclamo frente a su retención. `SETTLED_TTL_MS` vale14 días y `prune()` elimina registros liquidados. Al alcanzar capacidad, el propio modelo puede ejecutar esa poda. La unidad del servidor necesita una política explícita para la marca de ID y huella después de quitar el detalle. Un claim eliminado junto al diario permitiría tratar la misma operación como nueva.

En `tests/.tmp/a4-contract304-0NQupp/result.json`, el modelo208 real aceptó un intento, lo liquidó, avanzó el reloj más allá del TTL, quitó la única fila y aceptó de nuevo el mismo ID y contenido. El callback pasó de una a dos invocaciones. Es una prueba del diario en memoria, sin el futuro claim HTTP y sin efecto de tarea. Demuestra que reutilizar el diario por sí solo no conserva la identidad. No prueba un duplicado en la API inexistente.

Pedir en el contrato un reclamo o marca duradera que sobreviva a la poda del detalle, con política de capacidad y error cuando falte o esté corrupta. Un registro conocido con detalle vencido puede producir una respuesta de expiración y cero llamadas al escritor. Debe probarse replay después de TTL, poda bajo capacidad y reinicio. Los GET conservan su regla de cero escrituras. Los metadatos mínimos y el tope deben evitar una retención sin límite accidental.

## F2 · El límite de respuesta necesita un desenlace tras el efecto

El contrato fija512KiB y admite `writeResult:TaskRevisionResult|null`. Un cambio de130 bytes puede devolver un `TaskRevisionResult` de600.384 bytes porque el campo no modificado de una tarea válida ya contiene600.000 caracteres. El esquema público de registro lo admite. La sonda usa los esquemas reales y no ejecuta el escritor.

Hay que fijar qué ocurre si el resultado exitoso excede el límite. Si se descubre después del efecto, un413 genérico podría confundirse con rechazo previo, perder el acuse o fomentar otra operación. Una opción es persistir el desenlace confirmado y devolver un recibo acotado con `writeResult:null` y motivo cerrado de omisión por tamaño. Otra opción debe conservar la misma claridad de ejecución. Las rutas de detalle y check también necesitan su error explícito cuando los valores exceden el presupuesto, manteniendo el intento original consultable mediante metadatos.

La implementación debe probar una tarea grande con parche pequeño y distinguir el tamaño de petición del tamaño de respuesta. Se conserva la prohibición de reenviar automáticamente. Cambiar límites o recortar valores silenciosamente no cumple ese caso.

## Validación y siguiente paso

La sonda solo importó módulos puros con datos inventados y guardó medidas y hashes. La revisión no modificó el contrato reservado ni montó rutas. El coordinador debe presentar la precisión de retención y respuesta sobre su ruta propia. Después se cotejará la nueva huella para aceptar la arquitectura y registrar los esquemas públicos y el almacenamiento de reclamo.

## R2 · Dictamen favorable del contrato

9 de noviembre de 2026, Europe/Madrid. Revisada la huella `90118764355a179473a02c8ba5f89ae277013c09471df5e9afd11666708e56a7`. Las dos observaciones quedan atendidas en el documento. F1 exige marca de ID y huella que sobreviva a la retención208, replay vencido sin despachar, límites de 10.000 marcas, 4KiB individuales y 16MiB agregados, y rechazo previo cuando el índice falta o pierde consistencia. La inicialización queda limitada al primer POST autorizado de una instalación sin actividad A4; GET no escribe. Se añaden TTL, poda por capacidad y reinicio a los criterios. El retroceso coherente de una copia externa sigue siendo un límite declarado.

F2 fija liquidación confirmada y acuse compacto cuando la respuesta completa supera512KiB: changed, revisión, ID y ámbito se conservan; writeResult:null lleva motivo response-too-large. Si falla la liquidación se conserva incertidumbre. Detalle y check conservan metadatos con omisión explícita, sin recortar el original, sin evidencia aplicada y sin habilitar aceptación. El413 de petición queda separado del efecto confirmado.

Se acepta la arquitectura documental. No hay API A4 implementada ni pruebas HTTP nuevas que puedan darse por pasadas. La sonda anterior sigue acreditando la necesidad de estas reglas, no su implementación. La siguiente unidad deberá probarlas sobre almacenamiento y escritor reales antes de su montaje.
