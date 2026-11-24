# Verifica · Reapertura tras una escritura fallida

24/11/2026 · Europe/Madrid. Verificación complementaria del corte 0 sobre `effc450` con el arreglo local. Usa HubSpot simulado y un archivo SQLite nuevo, cifrado con la clave de pruebas. No abre puertos ni contacta con cuentas reales.

La prueba deja un encargo con dos capturas y dos actas. Un disparador temporal de SQLite hace fallar la actualización del encargo después de intentar la rotación y de escribir la nueva captura y su acta. La lectura indica que falló. Tras cerrar y reabrir la app, se comparan todas las filas de Verifica con las anteriores al fallo y el índice de actas coincide. Se reintenta con el disparador retirado al cerrar la conexión. Una segunda reapertura conserva la captura anterior rotada y el acta nueva. La huella del acta coincide con los bytes de la captura guardada.

13/13 pruebas de encargos, lectura y reapertura con `NODE_ENV=test` y red externa bloqueada. `tsc --noEmit -p tsconfig.json` correcto en esta comprobación. Se cerró y reabrió la conexión SQLite tras un error controlado. No se simuló pérdida de corriente ni terminación forzada del sistema.
