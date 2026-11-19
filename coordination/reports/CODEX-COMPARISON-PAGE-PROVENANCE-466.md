# Comparación paginada con la misma pareja de capturas

19/11/2026, Europe/Madrid.

Al pedir otra página, el comparador retiene las dos huellas que acompañaban la primera respuesta. Comprueba los identificadores, el offset y las huellas antes de mostrar cada página. Volver a la primera página conserva la pareja fijada; pulsar «Comparar capturas» inicia una comparación nueva desde la primera página. Una respuesta sin las dos huellas tampoco se muestra.

Al cambiar una huella se retiran los resultados y la paginación, quedan elegidos los mismos IDs y el foco vuelve a «Comparar capturas». La recuperación requiere iniciar la comparación explícitamente. El nuevo control usa las huellas que el servidor ya enviaba y mantiene las consultas GET.

## Evidencia

- Cuatro regresiones causales: cambio de cada lado, mismo cambio al volver a la primera página y respuesta sin una huella. Antes pasaban 14 de 18 casos. Después, 18 de 18.
- 70/70 en las suites focales y TypeScript sin errores.
- Chromium y servidor Vite/Plan B compilados en «tests/.tmp/compare466-5AZpR9». Dos capturas del mismo portal ficticio con 32 registros distintos. Entre las páginas 1 y 2, una segunda conexión SQLite eliminó la captura antigua mediante la poda real y guardó un contenido diferente con el mismo ID y fecha. El servidor devolvió HTTP 200 y la nueva huella. El cliente descartó esa página, mantuvo la selección y movió el foco al botón de comparar. Tras iniciar de nuevo, las páginas 1 y 2 compartieron las mismas dos huellas. Cero peticiones externas ni errores de página. El servidor de ensayo se cerró.

Registros en «tests/.tmp/compare466-before.log», «tests/.tmp/compare466-after.log» y «tests/.tmp/compare466-5AZpR9/result.json». El piloto instalado queda fuera del ensayo.

## Corrección pedida: contrato del radar con el espacio (19/11/2026, 12:40)

Hecha por Copilot con autorización de la usuaria, en lugar de Codex.

`RadarPanel` acepta la prop opcional `workspaceContextRevision`:
- **Sin la prop**, el radar se comporta exactamente como antes. Las pruebas previas siguen igual.
- **Con una revisión**, la consulta añade `contextRevision` y la clave incluye la revisión. Si la revisión cambia, se aborta la lectura anterior. Una respuesta de otra copia se descarta con «otra copia activa» y se ofrece «Actualizar contexto».
- **Con `null`**, no se consulta y se muestra «No se pudo verificar la identidad de la copia activa».
- **Ante un 409 `RESPONSE_QUEUE_CONTEXT_CHANGED`**, desaparece «Reintentar consulta» y «Actualizar radar» queda desactivado. «Actualizar contexto» refresca el padre sin repetir la revisión caducada.

Siguiendo la nota de la corrección, el montaje en `ContinuityOperations`/`ContinuityHome` no se ha tocado: esa reserva sigue en Grafito.

Evidencia: tres pruebas nuevas del radar anclado. Antes fallaban 3 y ahora pasan 26/26 junto con 464 y 468. No se repitió la prueba en navegador: la usuaria pidió no lanzar servidores ni navegadores en este equipo. La comprobación en navegador de las páginas del comparador anterior sigue siendo válida, porque el comparador no ha cambiado.
