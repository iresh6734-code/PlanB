# Arranque real del ZIP mediante ABRIR PLAN B.cmd

9 de noviembre de 2026, Europe/Madrid. Banco `tests/.tmp/launcher302-Tg9JkR`. El ZIP provisional 301 se extrajo de nuevo en una carpeta sin datos. El archivo pesa 48.864.571 bytes y conserva la huella `197150b9a99e4abbd555bf013869a2746372706cf20104e74e319272b4951fd9`. Se verificaron los bytes del iniciador272, el Node incluido, el runtime301 y los 15 activos. Se ejecutó **el comando original de Windows**, que llama a `node.exe launch.cjs runtime.mjs`. El propio iniciador recibió la opción de omitir la ventana del navegador. La generación y lectura de la protección local sucedieron mediante la App en la carpeta nueva. Las claves, contraseñas y cookies no se extrajeron a recibos.

| Prueba | Resultado |
| --- | --- |
| Primer arranque | El comando confirmó HTTP local en 4318, PID 28344, copia aún sin restaurar. El ejecutable y línea de comando pertenecen a la extracción. |
| Preparar y restaurar | Se configuró una contraseña ficticia y se restauró un bundle cifrado nuevo. Se obtuvieron 62 registros, evidencia y resumen protegidos con el mismo pin y recuentos desconocidos. |
| Segunda llamada al comando | Reutiliza PID 28344 con la misma fecha de creación, instalación y estado. Se comprobó un único runtime de esa carpeta. |
| Detener y reabrir | PID 16624. La instalación conserva `c86ccb1a-58bf-462d-a2ae-f0c88417a260`. La sesión anterior recibe 401 y el nuevo acceso devuelve los mismos registros, pin y revisión. |
| Cierre | Ambos procesos de la extracción tienen recibo de PID ausente. Para detenerlos se comprobó ejecutable, ruta de `runtime.mjs` y fecha de creación. |

`result.json`, los tres logs del comando y los recibos `stopped-28344.json` y `stopped-16624.json` recogen la evidencia. El arranque usa el modo Windows normal del paquete en el equipo actual. Para restaurar se creó una copia cifrada ficticia adicional, con su contraseña en memoria de la prueba. La prueba anterior de descarga y restauración del archivo incluido corresponde a 301.

La reapertura se probó después de detener el proceso de ensayo, y no a través de un cierre ordenado de la ventana. La apertura visual por Windows quedó desactivada en este banco. El runtime conserva `hubspotConfigured:false` y `aiConfigured:false`, y el controlador solo pidió su endpoint local. No se ejecutó una prueba de traslado a otro usuario o equipo. El resultado acredita el iniciador sobre este ZIP por bytes y queda separado de la revisión del código301, la candidata conjunta y la demo 4601.
