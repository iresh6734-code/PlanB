# D4 y selector de relaciones

La huella del informe D4 y las tres huellas compartidas se cotejaron al preparar el banco. Se repitieron las 60 pruebas de contextos y combobox, y las 10 pruebas de diseño. Pasaron las 70.

Las pruebas de `CODEX-RELATION-062` conservaban una expectativa del texto antiguo. Con la misma suite, el selector anterior pasó 15/15 y D4 pasó 14/15. El único fallo exige el ID visible de una relación cuyo nombre es único y ya está verificado. La opción seguía fijada fuera de las 50 filas y conservaba su ID de selección. La entrega D4 pide ocultar ese ID visible y mantenerlo para homónimos o estados sin verificar.

La versión de prueba propuesta comprueba el nombre único sin el sufijo, el valor exacto del control y la selección fijada. El E2E usa la ruta actual Clientes → Tareas y conserva sus comprobaciones de dos homónimos con IDs distintos, errores, reintento, identidad y revocación de sesión. En los cuatro puntos donde el E2E comprueba el nombre único verificado se actualiza el texto esperado. Las expectativas del ID en errores de verificación no cambian.

## Comprobación final

- Las pruebas adaptadas pasaron 15/15 en Node y 7/7 en Chromium, con tipos limpios y compilación de frontend y backend. El E2E comprobó los tamaños a 1440, 390 y 320 px, y confirmó que los homónimos se guardan por el ID seleccionado. El nuevo banco de loopback confirmó el cierre del proceso.
- En Chromium a 1366 px, el texto seleccionado de «Habilidad» medía aproximadamente 153 px y tenía unos 307 px disponibles, descontando relleno y flecha. La pantalla no desbordó horizontalmente. A 390 px, la banda de Hoy mostró el texto completo en varias líneas. El texto tenía `white-space: normal`, sin desbordamiento horizontal ni vertical. Se cotejó la captura anterior de la autora, que muestra la elipsis, con la repetición propia. Los controles registraron cero errores de página y cero solicitudes a otros orígenes.
- Se incorporaron únicamente las dos pruebas verificadas y la entrada técnica a `CODEX-RELATION-062`, dentro de su reserva. Se presentó el componente D4 con su huella intacta, y las dos pruebas coinciden byte a byte con las ejecutadas. El dictamen favorable de D4 cubre su informe. Las reservas de interfaz y sus demás E2E conservan su estado.

Evidencias en `tests/.tmp/review393-394-fdGyVm/reference-repeat-WBlewk` y `D4-layout-sOsDav`. Las capturas de la autora están en `tests/.tmp/ensayo-1711/shots/d4a` y `d4b`. Se usó Chromium con Playwright al faltar el complemento Browser. Falta adaptar los otros E2E que aún usan los textos de la navegación anterior.
