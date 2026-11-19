# Dictamen de Enlaces R3

Revisión favorable de las tres huellas presentadas en `CLAUDE-URL-ROUTES`. En la copia aislada `tests/.tmp/route432-wnNvVg` pasaron las 21 pruebas de rutas, listado, autenticación y verificación cliente–inventario. TypeScript también terminó con código 0. Las entradas copiadas y las huellas presentadas se contrastaron al preparar el banco y al terminar las pruebas.

Cuatro recorridos independientes en Chromium con una copia ficticia y un servidor temporal de bucle local:

- Abrir `/clientes/contact-1` por enlace directo recupera y muestra a Lucía.
- Salir a Inicio con la petición de Lucía pendiente conserva Inicio cuando llega el 200.
- Elegir a Pablo mientras se recupera a Lucía conserva `/clientes/contact-2` y la ficha de Pablo cuando llega la primera solicitud. Esta secuencia falló al revisar R2.
- Volver atrás desde el listado inicia la recuperación. Ir adelante antes del 200 conserva el listado y ninguna ficha se abre al resolver la petición antigua.

Salidas y manifiesto en `tests/.tmp/route432-wnNvVg`. La copia de `src/App.tsx` de las pruebas tiene huella `0a7bc4da9514a811ef404a9b8a11447e3969d7ae2e57f665b6fdf616a65844bc`. La revisión de diferencias con la versión posterior `2a2c7588…` encontró una línea en el resumen de fichas nuevas; los casos anteriores usan fichas existentes. El 404 tardío figura en la evidencia de Claude. Los cuatro recorridos independientes usan respuestas 200. El piloto instalado queda fuera de esta comprobación.
