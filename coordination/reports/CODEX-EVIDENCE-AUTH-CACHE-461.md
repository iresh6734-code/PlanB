# Caducidad de la sesión al publicar evidencia

La prueba fijaba cuatro accesos a `instanceId`. La caché de búsqueda reduce los accesos observados a dos. El resultado se reprodujo en el banco anterior a 459, con las mismas huellas de la prueba.

La prueba toma ahora del control autenticado la posición de la última lectura de identidad posterior al cálculo de evidencia. En la segunda petición hace vencer la sesión ahí mismo y exige 401 sin cabecera de atestación ni hechos publicados. Con el servicio real pasan el control 200 y el rechazo 401.

Como contraste, se adelantó solo la comprobación final de autorización en una copia aislada. El mismo test detectó la diferencia: esa copia devolvió 200 al vencer la sesión en la última lectura. El servicio real quedó intacto. La suite relacionada termina en 46/46.

Evidencia en `tests/.tmp/evidence461-pre459.log`, `evidence461-control.log`, `evidence461-variant.log` y `evidence461-result.json`. Sesiones y datos ficticios en una instancia de prueba.
