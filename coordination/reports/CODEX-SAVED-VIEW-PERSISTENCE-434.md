# Guardado y borrado de vistas

El fallo se reproducía cuando el navegador rechazaba la escritura. El listado añadía la vista a la sesión y mostraba «guardada» aunque el almacenamiento no hubiera cambiado. El borrado usaba el mismo camino y quitaba la vista de la pantalla aunque la copia persistida siguiera existiendo.

El listado actualiza las vistas y confirma la acción únicamente después de una escritura satisfactoria. Si falla el guardado, conserva el nombre para reintentar. Si falla el borrado, conserva la vista. Ambos errores se anuncian por el aviso de la lista. La lectura tolera que el navegador impida acceder a `localStorage`; una escritura sin almacenamiento devuelve `false`.

## Verificaciones

- Chromium con datos ficticios, la pantalla real de registros y una página interceptada. El código previo falla en la aserción del aviso de guardado y muestra «guardada» en la captura de accesibilidad. Con la corrección el recorrido pasa, incluidos reintentos, recargas y contenido persistido después de cada acción.
- 19/19 pruebas de vistas, listado y navegación con solicitudes externas bloqueadas. La regresión unitaria fallaba con el almacenamiento ausente antes de aplicar la corrección.
- `tsc --noEmit` termina con código 0. La comprobación de diferencias no encontró errores de espacios.

Salidas y huellas de las cuatro entradas propias en `tests/.tmp/view434-*`. Se probó el escenario de almacenamiento rechazado en Chromium. El piloto instalado no se usó para esta entrega.
