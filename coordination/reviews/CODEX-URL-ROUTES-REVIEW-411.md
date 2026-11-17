# Revisión de enlaces a fichas y navegación pendiente

Dos controles reproducidos en Chromium sobre la candidata f992ac95-6466-42a0-bb7c-1b1fa2993e35 y una copia ficticia. Cotejadas las tres huellas de la entrega. El App de esta candidata queda fijado en `9b8308d8…53e0`.

| Mientras se retiene el 200 real de la ficha pedida por enlace | Resultado al responder |
| --- | --- |
| La persona permanece en el enlace de Clientes | Se abre la ficha del contacto y la dirección se conserva. |
| La persona pulsa Inicio, que se muestra antes de resolver la lectura | La dirección aún conserva el enlace de Clientes. Al responder, la ficha se abre y sustituye Inicio. |

No se reemplazó `fetch`. La ruta de navegador solo demoró la entrega de la respuesta real. Hubo una petición de ficha por caso. Se observaron cero errores de página sin capturar, desbordamientos y solicitudes fuera de origen. Se verificó el cierre del servidor. Banco `tests/.tmp/routes411-c1Wxf7`, fichero `results.json` y capturas.

La navegación cambia la vista, pero deja pendiente la lectura inicial. Su efecto suprime la sincronización de dirección y todavía puede aplicar el resultado. Para R2, vincular la lectura al destino vigente y retirarla al navegar o al cambiar mediante Atrás/Adelante a un destino distinto. Probar que Inicio y su ruta permanecen cuando responde la ficha anterior, que el error anterior tampoco se muestra y que el enlace sin abandonar sigue abriendo la ficha. Coordinar los cambios de App con el trabajo simultáneo de Deshacer y CSV.
