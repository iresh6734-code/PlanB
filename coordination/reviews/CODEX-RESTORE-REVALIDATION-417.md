# Restauración atómica con la guarda actual de guardado

Se cotejaron Store, la ruta v2 y las pruebas con el corte congelado 414 y con el checkout. La diferencia de Store respecto de la presentación 388 añade latestChange y las opciones guard y onChange del guardado. La función restoreBundle conserva su implementación.

Las ocho regresiones de restauración pasaron. Incluyen otra conexión que edita antes de adquirir el bloqueo, el rechazo por portal, tres errores de persistencia, dos excesos de capacidad y la restauración de arranque. En una copia temporal se retiró exclusivamente la transacción de restoreBundle. Los tres casos de error de persistencia fallaron al comprobar que las tablas persistidas conservaban sus bytes. Tras restaurar la fuente, la batería conjunta pasó 30/30 con las pruebas de caché y las regresiones existentes de Deshacer. La comprobación de tipos dio código 0.

Este cotejo acredita la restauración y la compatibilidad con el guardado actual. La identidad de Deshacer después de restaurar conserva el hallazgo y la corrección pendiente de 399.

Banco `tests/.tmp/restore417-PoEnZp`. Las cinco huellas están en pins.json. Los resultados directos, la contraprueba y la repetición están en restore.log, without-restore-transaction.log, focused.log, types.log y result.json. Las fuentes congeladas conservaron sus huellas al finalizar.
