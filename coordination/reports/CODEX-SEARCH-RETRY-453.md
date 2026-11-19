# Resultados de búsqueda tras un conflicto al abrir una ficha

Un 409 al abrir una ficha invalida toda la página de resultados. El diálogo retira las filas, sus recuentos, la procedencia y la paginación. El botón «Actualizar resultados» vuelve a la primera página, sin reutilizar la revisión de los resultados descartados. Sigue exigiendo la identidad que entregó el estado de la aplicación.

Los fallos transitorios de apertura conservan su mensaje y la lista disponible. Los resultados incompatibles con la identidad de la app siguen rechazándose.

- Chromium con rutas interceptadas, 2/2. El control de conflicto falla en la fuente anterior porque conserva la lista. El control del 503 pasa en ambas versiones.
- Las 29 pruebas existentes de búsqueda e identidad y TypeScript pasan.
- Chromium con la aplicación compilada de la candidata 444 y el componente de esta entrega. Se restaura una copia ficticia con el mismo ID y fecha. La ficha anterior devuelve 409 y sus resultados desaparecen. «Actualizar resultados» pide el offset 0 y el servidor rechaza el contexto anterior. Al provocar la lectura auténtica del estado de la app, la búsqueda recibe el contexto vigente y abre la ficha restaurada. Cero escrituras del navegador, conexiones externas y errores de página. Servidor de prueba cerrado.

Evidencia en `tests/.tmp/search453-app-6oCtmE/result.json`. El refresco automático del estado desde el botón sigue pendiente del montaje que es dueño de ese estado. La verificación usó una compilación y una base ficticia separadas.

## Integración 456

El montaje transmite al diálogo la lectura de estado de la aplicación. Después de un 409, el botón actualiza primero ese estado y solo entonces vuelve a buscar. El control 453 sin montaje continúa reproduciendo el comportamiento de los llamadores que carecen de la lectura. Pasaron sus dos regresiones junto con tres nuevas y un recorrido por el montaje real. [Evidencia 456](CODEX-SEARCH-WORKSPACE-REFRESH-456.md)
