# Hoy · Conservar el borrador cuando el 409 corresponde a otra copia

11 de noviembre de 2026, Europe/Madrid. Entrega 335. Tras sustituir una copia con la misma identidad pública, el modelo del comparador compara también la huella observada. Mantiene la vista «No se puede combinar esta tarea», muestra lo que escribió la persona y retira las opciones para combinar o preparar otro guardado. La ficha conserva el borrador al volver al formulario, con Guardar deshabilitado hasta cerrar y abrir la tarea desde Hoy.

## Evidencia desde la App compilada

El recorrido nuevo abre la tarea en Hoy, escribe un borrador y sustituye la captura ficticia entre la comprobación previa y la llegada del PATCH al servidor. Cuenta, instalación, captura y marcas de tiempo permanecen iguales. Cambia la huella. Fastify devuelve un 409 real y SQLite mantiene cero filas de historial. La vista no muestra los valores exclusivos de la captura nueva. Volver al formulario conserva el borrador y no envía otra petición. Tras descartar y abrir la tarea de nuevo, un guardado explícito produce una sola fila de historial y deja la tarea homónima intacta.

- `comparator335-new-6JKEJY`: 16/16 Chromium, 8/8 Node y tipos limpios, con 368 entradas cotejadas y 15 arranques y cierres del arnés Hoy. Incluye el recorrido nuevo, las 14 pruebas de guardado condicionado y el acuse compacto. La App usa el guardado condicionado actual de Hoy y una base ficticia de archivo. El recorrido nuevo vigila errores de página y conserva una captura.
- `comparator335-component-XcWC25`: 10/10 Chromium, 22/22 Node y tipos limpios con las pruebas aceptadas de 199 en un banco de 370 entradas.
- `comparator335-old-oNYnTD`: las dos sondas de cambio de copia fallan con el corte anterior, que presenta un aviso en lugar del comparador de incompatibilidad.
- `comparator335-causal-YnZJhd`: restaurar temporalmente la comparación de seis campos en el modelo permite mostrar el comparador de mezcla, con opciones y el valor de la captura nueva. Falla la prueba. Se restauró y cotejó la fuente de la copia.

La primera batería completa pasó 15/16. La prueba de Resultados agotó el tiempo buscando «Ver detalle», un botón retirado. Al usar el resumen nativo «Lo que escribiste» pasó en el corte anterior y en el corregido. La entrega 336 aplica solo ese localizador y la batería final conserva las aserciones de adopción, escritura e historial.

Se usó Chromium de caché y Playwright porque el plugin Browser no estaba disponible. La red de pruebas se limitó a loopback. No se comprobó lector de pantalla ni se instaló una candidata. El cliente de intenciones A4 de Claude y el montaje de su API en la App siguen bajo sus propias entregas. La demo Jornada 299 queda fuera de este ensayo.
