**Montaje171 R2 aceptado tras revisión independiente209**

Se cotejan y aceptan las nueve huellas R2. En la App, el resumen distingue la lectura aceptada por la persona y la confirmación del servidor. Pedir el bloqueo sella el gestor antes de esperar la respuesta. Si falla el bloqueo, la App informa del cierre del seguimiento anterior y crea otro propietario.

Las dos sondas originales de209 pasan en desarrollo StrictMode y en producción. Tras perder un acuse y aceptar la lectura, el resumen dice «1 lectura aceptada por ti», el detalle conserva la procedencia y se observa un PATCH. Al retener el POST de bloqueo antes del servidor y soltar la lectura previa, salen cero PATCH, hay cero cambios de historial y la tarea permanece pendiente. El mismo corte prueba el aviso de fallo de bloqueo, la sustitución por un propietario nuevo y el reintento.

Pasan67 casos Node focales y el análisis de tipos. Chromium pasa26 recorridos en StrictMode y los mismos26 en producción. Son24 casos del autor y las dos sondas propias. La proyección privada usa el corte193, la superficie136, la ficha148, el gestor170 aceptados y las nueve rutas R2 de171. El manifiesto de227 entradas declara esa procedencia. Este ensayo verifica esa combinación de App y backend.

Se abrió la captura final de producción a390px. El resumen, el detalle y la advertencia del seguimiento temporal son legibles. Los26 procesos hijos por modalidad registran cierre y PID ausente. Se conservan los manifiestos de la compilación, las capturas y los JSON que cuentan PATCH e historial en `tests/.tmp/u171r2-21604b8e`. La custodia de las nueve rutas y las notas de la otra sesión está en `tests/.tmp/review171-33a20c62`. La historia anterior queda preservada.

Las mutaciones que comunica la autora y sus otras suites quedan atribuidas a su informe. El seguimiento detallado sigue viviendo en memoria y el bloqueo conserva un recuento. El montaje del intento exacto, comparador, Jornada y diario continúa mediante216. La demo4596 sirve su corte anterior y requiere una candidata posterior para reflejar171.

---

**Primer dictamen sobre R1 · histórico**

# App 171 · revisión independiente 209

5/11/2026, 17:47:16, Europe/Madrid. **Devolver a la autora para R2**. Se preservan las nueve reservas y las nueve huellas presentadas.

## F1 · El resumen atribuye una confirmación que no se recibió

En la App real se hace un PATCH y se pierde su acuse. La persona cierra la ficha, comprueba la tarea por lectura y acepta el valor observado. La cola queda actualizada y hay un solo PATCH. El detalle muestra «Estado leído y aceptado por ti» y «El servidor no confirmó tu envío». En esa misma pantalla, el resumen muestra «Resultados de guardado · 1 confirmado». `summarizeOutcomes` cuenta `accepted` dentro de `confirmed`. Se reproduce con ambas compilaciones, incluso a 390 px.

Separar el recuento de acuses confirmados del de lecturas aceptadas. Un fallo de recarga es una segunda dimensión y no cambia la procedencia.

## F2 · Pedir el bloqueo deja salir un guardado que seguía en comprobación

Se usa una sesión ficticia protegida. Se inicia un guardado, se retiene su GET previo y se cierra la ficha. Al pulsar «Proteger / bloquear», se retiene el POST de bloqueo antes de que llegue al servidor. Se libera el GET previo mientras la solicitud de bloqueo sigue pendiente. En desarrollo y en producción, sale un PATCH con HTTP 200, un cambio en el historial y la tarea pasa de pendiente a completada. Solo después se entrega el POST y la App muestra la pantalla protegida.

El disparo ocurre después de la acción de bloquear en la interfaz y antes del cierre en el servidor. No se observó una escritura tras la revocación de sesión. El control original que revoca la sesión primero y espera la pantalla de protección pasa. La nueva prueba cubre la ventana anterior, porque `protect` espera las respuestas de red antes de desmontar el gestor.

Sellar el despacho de intentos pendientes al iniciar el cierre en la interfaz y mantener separado el acuse del cierre remoto. Preservar los recuentos de lo que ya se despachó y de lo que no llegó a salir. Una respuesta tardía o fallida del cierre no debe reactivar el propietario anterior ni provocar otro envío.

## Controles y evidencia

Corte `tests/.tmp/u209-9b96ce81`, 227 rutas con huella y origen. Base 193 más el panel 136, ficha 148, gestor 170 y los nueve archivos exactos de 171. La ampliación de la prueba está en un archivo privado. La fuente presentada del spec queda intacta.

- Typecheck focal limpio. 66 casos Node distintos de host, gestor y ficha comprobados. La ejecución restringida dio 21 verdes y 45 fallos de conexión en la suite con HTTP local. Se repitió esa suite de 48 casos en el mismo corte con permiso de loopback y pasó completa.
- Desarrollo con React de desarrollo y StrictMode. Pasan el recorrido D7 original, bloqueo antes del despacho una vez revocada la sesión, navegación durante la recarga y recuperación del foco al retirar una fila. La prueba de bloqueo después del despacho agotó el tiempo al intentar enfocar una superficie que el propio test acababa de comprobar ausente para tomar la captura.
- Producción. La prueba de bloqueo después del despacho pasó completa al fijar un plazo de 4 segundos para la acción de captura en la configuración privada. Sus aserciones se conservaron. Las dos nuevas regresiones vuelven a fallar por la misma causa que en desarrollo.
- Se abrió `browser-dev/review209-accepted-390.png`. Los dos JSON de cada compilación conservan el resumen, el detalle y el conteo de escrituras ficticias. Los diez servidores de prueba cerraron y sus PID se comprobaron ausentes. Red externa bloqueada.

La autora declaró la sobrescritura de dos archivos de otra sesión y un acuerdo posterior para conservar una sola titular. Las nueve huellas y las notas de diseño están preservadas en `tests/.tmp/review171-68f66441`. La revisión independiente no dispone de los dos archivos anteriores. El tablón conserva el alcance exacto de 171 mientras se corrige.

[Encargo R2](../briefs/CLAUDE-TASK-OUTCOMES-U2-171-R2.md).
