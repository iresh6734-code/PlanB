# Revisión del orden de resultados en Clientes

Cotejé las tres huellas presentadas por Claude. Las dos fuentes de ejecución y prueba coinciden con la candidata f992ac95-6466-42a0-bb7c-1b1fa2993e35. Repetí el recorrido de Clientes en Chromium con datos ficticios, retuve la primera respuesta y cambié la búsqueda a un término sin coincidencias. La búsqueda nueva siempre respondió antes de liberar la anterior y se observó la señal de cancelación.

| Entrega de la respuesta anterior | Vista después de resolverla |
| --- | --- |
| Cancelación nativa de Chromium | Cero filas y «Sin resultados». El JSON anterior no se leyó. |
| El transporte ignora la cancelación y entrega la respuesta real | Aparecen las 24 filas de la búsqueda anterior aunque el campo conserve el término nuevo. |
| El transporte ignora la cancelación y entrega un 503 ficticio | Se muestra «No se pudieron cargar los registros» aunque la búsqueda activa ya respondió correctamente. |

Los dos últimos controles usan una envoltura de prueba de `fetch` que deja llegar cuerpos retrasados. El control nativo no reproduce el fallo. En `useRecordListLoader`, el final de la petición ya comprueba la señal de cancelación, pero la resolución y el error todavía escriben sin comprobarla. Los tres controles registraron cero errores de página sin capturar y cero solicitudes fuera de origen. El servidor propio cerró. Banco `tests/.tmp/records407-7gZyKO`, evidencia `results.json`.

Para R2, comprobar la vigencia antes de sustituir filas, registros relacionados, total o error. La respuesta tardía no debe cambiar el aviso del padre ni el estado visible. Mantener espera de búsqueda y consulta actual, y añadir controles para entrega tardía correcta y 503 con señal cancelada. La corrección cabe en el hook y sus pruebas reservadas.
