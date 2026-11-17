# Aviso de copia antigua con la cabecera actual

Se cotejaron las dos huellas de 367 en el checkout y en la candidata 395. La cabecera actual incorpora el botón de bloqueo aportado por la navegación. Se conserva ese cambio y se vuelve a presentar la huella verificada bajo la reserva de 367.

| Control en Chromium | Resultado |
| --- | --- |
| Copia activa de tres horas, archivo reciente distinto, 320 × 720 | El aviso identifica la copia activa. Su rectángulo queda entre x=12 y x=308 y termina a y=88. El candado es visible. Enter sobre el aviso abre Continuidad y desaparece el aviso duplicado de esa pantalla. |
| Misma copia antigua, 1366 px | El aviso móvil está oculto. El botón de la cabecera indica la edad de la copia activa y abre Continuidad con Enter. |
| Copia activa reciente, 320 px | La cabecera es visible y el aviso no está presente. |

Los tres controles registraron cero desbordamiento horizontal, cero errores de página y cero solicitudes fuera del origen de ensayo. Cada base se creó para este banco con registros ficticios. La prueba verificó los recibos de inicio y observó el cierre de los dos procesos.

El banco inicial de preparación se detuvo antes de arrancar la app porque faltaba `NODE_ENV=test` en el proceso que genera los datos. La repetición lo fijó para esa preparación y para los servidores de ensayo. Se usó Playwright con el Chromium local debido a la falta del complemento Browser.

Banco `tests/.tmp/mobile396-MSEtwz`, con `results.json` y capturas de los tres controles. Huellas cotejadas `5d8db834bc76946e2878a98cf3da022cab222191cd679d27d9852d12f50ab313` para la cabecera y `3fb366fdab66df4319d6df9dac29a7e61f6e68eca0ae95d18a71a694d036486d` para el CSS. La evidencia corresponde a la candidata aislada 395.

## Repetición con los textos D2

Candidata aislada f992ac95-6466-42a0-bb7c-1b1fa2993e35, banco `tests/.tmp/mobile396-xnHrK6`. Tres controles pasaron de nuevo y se verificó el cierre de los dos servidores. A 320 px el aviso de copia antigua volvió a quedar entre x=12 y x=308, con borde inferior en y=88. Enter abrió Continuidad. A 1366 px abrió Continuidad el acceso de escritorio y el aviso móvil estuvo oculto. A 320 px con la copia reciente, el aviso estuvo ausente. Cero desbordamientos, errores de página y solicitudes fuera de origen.

Se verificaron en la candidata y en el checkout la cabecera D2 `d7135534aebb80cb3cc5d530bca96ff7dd01541a610c01b2eb3c6e92c26aa10a` y el CSS `3fb366fdab66df4319d6df9dac29a7e61f6e68eca0ae95d18a71a694d036486d`. Esta repetición se hizo en Chromium con bases ficticias nuevas.
