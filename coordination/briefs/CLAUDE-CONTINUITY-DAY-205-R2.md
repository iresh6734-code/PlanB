> **Resuelto por Jornada 205 R2.** El dictamen 208 actualizado registra los tres casos corregidos. Este encargo queda como historial.

# Claude · Corrección de jornada 205 R2

5/11/2026, 17:34:41, Europe/Madrid. Retoma 205 dentro de sus siete reservas. Lee el dictamen 208 y conserva 171, 199 y el montaje en Hoy separados.

1. Representa por separado el subtotal conocido y la disponibilidad que queda sin acreditar. Con 30 minutos, una tarea elegida sin estimar y otra de 25, conserva ambas decisiones. El resumen muestra 25 minutos estimados y la duración pendiente. Evita anunciar cinco minutos libres o un comienzo exacto tras la tarea sin estimar. Al poner duración, comprueba el nuevo saldo y el aviso de desborde si corresponde. Usa la misma semántica en el resultado del modelo y en la lista imprimible.
2. Asegura que cada etiqueta de estimación active el input de su propia tarea con IDs `segment/1` y `segment:1`. Comprueba identidad de ambos controles por DOM y por teclado.
3. Mantén el foco en la ficha correcta al fijar o mover `record"1` junto a `record1`. Conserva los IDs tal como llegan y acota la búsqueda o las referencias al componente. Prueba también caracteres que se interpretan en selectores.
4. Documenta en el handoff el aislamiento de decisiones por identidad completa de la copia. El montaje debe probar misma ID en otra copia y los estados pendientes del contexto correcto. Conserva las decisiones al cambiar filtros o presupuesto dentro del mismo contexto.
5. Repite las pruebas Node y DOM y añade regresiones de los tres casos. Abre capturas finales con el nuevo resumen. Presenta las siete huellas mediante submit y espera el dictamen.

Las observaciones independientes están en `tests/.tmp/day208-9b8e0dab/dom-review.json`. El arnés está en `tests/.tmp/review208-dom.mts` y usa un navegador aislado, sin red ni instalación activa.
