# Revisión de estados de error D3

Cotejé con la entrega las cinco huellas del checkout. Las cuatro fuentes de ejecución y prueba coinciden en la candidata f992ac95-6466-42a0-bb7c-1b1fa2993e35. En la candidata también quedaron fijados App y el CSS compartido. Las suites de estados, piezas UI y lista de registros pasaron 12/12.

| Recorrido de Chromium a 1366 px | Resultado |
| --- | --- |
| Un archivo de Cambios no se puede cargar | Aparece un aviso con «Recargar la página». Inicio abre desde el menú mientras Cambios está roto. Al liberar el archivo, el botón recarga Cambios y retira el aviso. |
| La primera carga de Clientes devuelve 503 | Aparece «Reintentar». Al liberar la API, el botón hace una sola petición, recupera las 24 filas y retira el aviso sin navegar ni recargar. |

Las comprobaciones registraron cero desbordamientos, solicitudes fuera de origen y errores de página sin capturar. El servidor del ensayo cerró. El primer banco inició el servidor, pero el sandbox impidió verificar la conexión HTTP. La repetición usó un puerto local aislado con la guardia de red externa y datos ficticios. No se probó con lector de pantalla.

Evidencias: `tests/.tmp/d3404-zRoCw6/results.json`, capturas en la misma carpeta. App quedó fijada en `9b8308d8…53e0` y el CSS en `8a4ab10a…8cec`. Esta revisión no modificó fuentes compartidas.
