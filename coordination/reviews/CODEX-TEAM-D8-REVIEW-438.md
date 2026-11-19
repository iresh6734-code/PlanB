# Revisión de Equipo D8

Las dos huellas presentadas coinciden. Las huellas completas de TeamApp, CommercialWorkspace y team.css del banco coinciden con los prefijos del informe de Claude. La compilación Vite y el servidor de equipo pasan en el banco congelado. TypeScript y 50 pruebas focales pasan.

En Chromium verifiqué 4 perfiles × 8 secciones en la demo aislada. Solo lectura ve instrucciones de permiso en lugar de Comprobar sincronización, Vincular nueva copia y Preparar acceso. Comercial y Responsable conservan sus acciones. Administración puede preparar acceso al escribir un correo, sin enviarlo. Capturar en lectura explica la falta de portal o permiso. A 390 px repetí las tres secciones que muestran notas de permiso en Solo lectura, con cero desplazamiento lateral de página.

## Dos casos para R2

1. En Empresa → Registros guardados → Empresas aparece «Empresa ficticia Arce», pese a que el criterio de aceptación retira «ficticia» del espacio de equipo. El texto proviene de `server/team/demo.ts`. Renombrar ese dato de prueba requiere un encargo con sus archivos exactos. `tests/e2e/customers.spec.ts` espera el nombre anterior.
2. Al simular una conexión con `needs_reconnect` en una respuesta GET de la demo, el botón deshabilitado se acompaña a la vez de «necesita una nueva autorización» y «Conecta primero el portal». Separar el estado sin conexión del estado que requiere renovar la autorización. Para cambiar TeamApp, reservar el archivo en el encargo correspondiente. Mantener el motivo de permisos y el de portal ausente.

Los controles no ejecutaron trabajos, invitaciones, vínculos ni capturas. Hubo siete POST a la ruta local y ficticia de selección de perfil, cero peticiones exteriores y cero errores HTTP o de página. El caso de conexión caducada no contacta con HubSpot. Recibo y capturas en `tests/.tmp/team438-BJEbC6/browser-lvDSQp`. El dictamen conserva el piloto instalado fuera del ensayo.
