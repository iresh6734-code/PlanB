# La búsqueda recupera la copia vigente desde el diálogo

Después de un 409 en la búsqueda o al abrir una ficha, «Reintentar búsqueda» o «Actualizar resultados» leen primero `GET /api/v2/state` mediante el montaje autenticado de App. El diálogo reanuda la búsqueda desde la primera página, con el criterio más reciente y la identidad que recibió la app. Si falla la lectura de estado, el mensaje ofrece otro intento de actualizarlo. Al cerrar, se cancela la petición y se descarta el resultado tardío.

En Chromium, las tres regresiones nuevas fallan con la versión anterior y pasan con la integración. Cubren cambio de criterio durante una lectura pendiente, fallo de estado seguido de reintento y cierre antes de recibir respuesta. Pasan además los dos recorridos anteriores y TypeScript. El primer intento del banco actual agotó el plazo durante la compilación del arnés. Se repitió con tiempo suficiente para la compilación, con las mismas aserciones.

El recorrido de la app compilada usó SQLite nuevo y una restauración ficticia con el mismo ID y fecha. Al abrir el resultado anterior, recibió 409 y retiró la lista. El botón hizo exactamente dos lecturas en orden, `/api/v2/state` y `/api/v2/search`. La segunda llevaba el contexto nuevo y offset 0. Se abrió la ficha restaurada desde el mismo diálogo. Cero escrituras del navegador, tráfico externo y errores de página. El servidor del banco se cerró.

Evidencia en `tests/.tmp/search456-app-uaIOsw/result.json`. El montaje de `src/App.tsx` se modificó exclusivamente en su reserva Codex, transferida por el usuario, y el diálogo se presentó bajo 453. La comprobación se hizo en una compilación aislada.
