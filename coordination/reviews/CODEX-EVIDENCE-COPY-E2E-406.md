# E2E de Evidencia con el vocabulario actual

Reproduje el fallo del E2E original contra el código actual de Evidencia. El resultado visible decía «Preparación sin comprobar» mientras la prueba buscaba «Preparación sin demostrar». Cambié solo las tres aserciones de ese estado en la suite. Se conservan la comprobación de inventario, estados sin medir, el rechazo de un veredicto fabricado y la recuperación con la siguiente lectura genuina.

Con el mismo build aislado y la suite cambiada pasaron **9/9** en Chromium, incluida la navegación por teclado, los abortos y respuestas tardías, y el diseño a 1440, 390 y 320 px. El primer lanzamiento se detuvo en el acceso HTTP por las restricciones del sandbox. Los controles rojo y verde posteriores usaron el mismo banco ficticio local, 4518 y red externa bloqueada.

Evidencias en `tests/.tmp/evidence406-ac719c947a614e83ac830e81149535ad`: `pins.json`, `before-local.log`, `after-local.log`, `after.sha256` y las capturas. La vista de ensayo y el componente conservan las huellas del banco.
