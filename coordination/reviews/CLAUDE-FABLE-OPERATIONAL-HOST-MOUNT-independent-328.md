# El recibo debe mostrar la decisión que guardó el Radar

10 de noviembre de 2026, Europe/Madrid. **Añadir este caso a R2 de CLAUDE-FABLE-OPERATIONAL-MOUNT.** El defecto se reproduce desde el host presentado y está en `src/OperationalRehearsal.tsx`, que pertenece a la unidad del ensayo.

1. Desde la App compilada, abrir Radar, activar el escenario, abrir la instalación y elegir «Usar equipos equivalentes del Almacén Sur».
2. Confirmar con Marta como responsable y «Confirmar los equipos equivalentes con Almacén Sur» como siguiente paso. El servidor guarda y responde 200. El navegador de prueba descarta esa respuesta.
3. Tras el mensaje de resultado desconocido, editar el formulario para poner Lucía y «Cancelar el pedido de mañana». Pulsar «Reintentar con la misma clave».
4. Las dos peticiones al Radar tienen el mismo cuerpo e identificador. La lectura real anterior y posterior al reintento conserva un evento con Marta y el paso original. El recibo de la App afirma que se guardaron Lucía y el paso nuevo.

La recuperación conserva el borrador original en `current.draft` y lo vuelve a enviar de forma idempotente. El texto de éxito toma responsable, paso y fecha del formulario editable. El origen del texto debe ser el evento aceptado o la evidencia inmutable verificada para ese intento. Si se permite editar durante la incertidumbre, esas ediciones requieren otro guardado explícito, con revisión actualizada. Si la decisión ya se guardó y falla el vínculo con el ensayo, ofrece recuperar la asociación con la misma clave y conserva la evidencia del Radar.

El banco `tests/.tmp/rehearsal328-paFPVe` congeló 380 entradas y compiló la App real con Vite. El servidor del banco sirve esa compilación por loopback con los montajes del Radar y el ensayo, una base ficticia nueva y un reloj fijo. La interceptación deja llegar el primer POST al servidor real y descarta exclusivamente su respuesta al navegador. El único test alcanza la pantalla de recibo y falla en la comparación del responsable. La captura y el contexto DOM quedan en `browser-artifacts`. El test independiente pasa el chequeo focal de tipos y queda fijado por SHA-256 `5c5ba3d7af74b21840b5837c12a07da1cb352ac06b10f3363da66b6407b9f396`.

En `tests/.tmp/rehearsal328-causal-BsfZnk`, se cambió solo la fuente del texto visible para conservar el borrador inmutable del intento confirmado. El mismo test pasó **1/1 en Chromium**, sin omisiones, y el servidor siguió acreditando un solo evento. Se restauró el archivo TypeScript experimental y se cotejaron las 380 huellas. La variante comprueba la causa del texto incorrecto. La corrección del vínculo entre el ensayo y la decisión sigue en R2.
