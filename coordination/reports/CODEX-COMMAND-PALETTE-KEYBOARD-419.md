# Paleta de órdenes · selección de teclado y combinación con D7

La flecha abajo con cero opciones podía fijar el índice en -1. Al llegar una búsqueda posterior al mismo texto, ninguna opción quedaba activa y pulsar Intro no ejecutaba la primera. La corrección de Codex limita el índice mínimo a cero.

La regresión de Chromium falla con la fuente anterior: la primera opción existe, pero aria-selected es false. La navegación normal sí pasa. Con la corrección de una expresión, ambos recorridos pasan 2/2. Cubren apertura con Ctrl J, resultados retenidos, dos pulsaciones de flecha abajo mientras no hay opciones, selección activa al llegar, ejecución única, flechas en ambos límites, Escape, foco de retorno y reapertura. Typecheck terminó con código 0.

## Estado de la composición

Mientras se verificaba 419, CLAUDE-A11Y-D7 cambió las líneas de foco en CommandPalette y el Modal compartido. La corrección del índice de Codex continúa presente. D7 elimina el temporizador del buscador, añade autoFocus y evita que Modal quite ese foco inicial.

La repetición con ambas fuentes fijadas da 1/2. La selección pasa. En el segundo caso, Escape cierra la paleta pero el botón que la abrió queda sin foco. Esa prueba pasaba antes de los cambios D7. El archivo combined-pins.json registra el Modal e61d5505…3b4f y la huella de la paleta combinada.

Para cerrar D7 y 419, restaurar el foco al disparador que estaba activo antes del montaje incluso cuando el campo tiene autoFocus. Las dos lecturas de document.activeElement hechas en efectos de Modal ya pueden encontrar el campo interior. La regresión disponible exige que Escape vuelva a «Abrir órdenes». Conservar el primer foco inmediato que se pretende en D7 y repetir los dos casos de 419.

## Evidencia

Banco tests/.tmp/palette419-e1bf5e188bce44fa9d31c4b35ad3284d. baseline.log contiene 1 fallo de selección y 1 control correcto. after.log registra 2/2 antes de D7. combined.log registra la regresión de foco con D7. Los JSON y trazas provienen de Chromium con contenido ficticio servido por page.route. El primer lanzamiento del banco tuvo una expectativa errónea de separación de texto en el nombre accesible de la opción. Se corrigió antes de obtener el fallo causal de selección.

419 conserva sus tres reservas y sigue en trabajo hasta verificar la composición final. El foco inicial en el ensayo aislado funcionaba con la versión anterior, así que esta entrega de Codex acredita el arreglo de selección. El cambio de foco pertenece a D7.

## Repetición tras la corrección D7 · 17/11/2026 21:27 Europe/Madrid

La nueva iteración D7 captura el elemento activo antes del montaje de los campos con autoFocus. Con components.tsx 5600cad150fd4ccea7c062c36c320295fbb0822f9973aefebbbde87fa550ca48 y CommandPalette.tsx 4fc059535180b56400964d1ea874ae471bad65ca43f1b633d875141bfd69b63b, los mismos dos casos pasan 2/2 en Chromium. Escape devuelve el foco al disparador y la selección tras llegar los resultados sigue funcionando. Las huellas comprobadas al terminar coinciden con combined2-pins.json.

combined2.log y combined2.json registran el resultado; combined2.exit es 0. El chequeo focal de tipos incluye ambos componentes, sus importaciones y la prueba: combined2-types.exit es 0. El chequeo completo anterior también terminó con 0; no se atribuye su resultado a la última edición de D7.

La regresión de composición descrita arriba queda corregida en estas huellas. 419 se presenta de nuevo con sus tres reservas. Esto no acepta D7: sigue trabajando y aún falta su informe con la auditoría de escritorio/móvil. Tampoco sustituye la revisión de la nueva huella del componente compartido en 063.

## Límite adicional 420

Los tres casos propios de D7 pasan en el montaje sencillo, pero la copia temporal con StrictMode, utilizado en src/main.tsx, falla en el foco inmediato de la paleta y en el campo autoFocus (1/3). La revisión CODEX-D7-STRICT-REVIEW-420 documenta este límite de desarrollo y lo devuelve a D7. La corrección de índice de 419 permanece intacta. No se interpreta el 2/2 anterior como validación del foco en StrictMode.

