# Plan B 0.3.0 · Candidata para piloto autónomo

Esta entrega incorpora producción en lectura y recuperación manual verificada. Su disponibilidad técnica no acredita todavía un piloto con clientes: faltan la aceptación humana autónoma, una devolución auténtica de ensayo y la revisión de condiciones del primer cliente. Consulta las evidencias asociadas al hash de tu entrega.

## Abrir y preparar

1. Extrae el ZIP completo en una carpeta nueva de este Windows. No uses el PC corporativo original ni copies sus datos, claves o sesiones.
2. Abre **ABRIR PLAN B.cmd**. El iniciador abre el navegador y reutiliza la instancia de esa misma carpeta. No necesitas instalar Node ni usar terminal. Vuelve a abrir el iniciador para recuperar la dirección.
3. En **Continuidad → Preparación de tu Plan B**, configura una contraseña local. Custódiala: no hay recuperación de contraseñas.
4. Prueba primero **Preparar aplicación → Agencia Norte**. Para tu portal, usa **Conectar HubSpot**, una clave propia de lectura y su ID. No envíes claves por chat ni correo.
5. En HubSpot, Desarrollo → Claves → Claves de servicio, concede lectura de contactos, empresas y oportunidades y sus esquemas. Revisa los permisos del formulario; nunca añadas escritura para capturas. Un administrador debe crear o confirmar la credencial.
6. Selecciona **Ensayo** para DEVELOPER_TEST/SANDBOX o **Cliente real · solo lectura** para STANDARD. Confirma la autorización del cliente y el ordenador de custodia, revisa los campos y guarda. Esto no inicia capturas automáticamente.
7. Pulsa **Capturar ahora** y después **Probar mi Plan B**. Cada copia requiere su propio simulacro. Comprueba fecha, recuentos y límites. Una captura incompleta nunca sustituye la válida.
8. Abre la copia con **Continuar trabajando**. Se pausan capturas e IA durante la sesión. Para cerrar y mover una instalación, detén su proceso; no muevas SQLite mientras está abierto.

## Recuperación que debes ensayar

Con la copia activa, **Exportar → Solo copia cifrada** o **Descargar aplicación independiente**. Elige una contraseña de recuperación de al menos 12 caracteres. Guarda el archivo fuera del PC y la contraseña por separado; confirma la custodia desde Continuidad. Descargar no prueba la restauración: ensaya el archivo en una carpeta nueva.

En el destino configura primero una contraseña local, pulsa **Restaurar archivo**, selecciona el JSON cifrado e introduce la contraseña de recuperación. El ZIP independiente contiene el JSON y no incluye conectores ni claves del CRM/IA. No transfieras solo la base: DPAPI la vincula al usuario Windows original. Tras reiniciar debes desbloquear la sesión de nuevo.

## Volver al CRM

- **Producción:** Plan B no escribe en HubSpot. Exporta CSV/JSON desde Cambios y revisa con la agencia el estado final de cada ficha. Esos archivos contienen datos: trátalos con la misma custodia que el CRM. Aplica los cambios manualmente, indica los IDs remotos de las altas y pulsa **Comprobar resultado en HubSpot**. Diferencias en valores o relaciones mantienen la sesión pendiente. Coordina una ventana sin otras ediciones: la comprobación es una lectura puntual. Exportar nunca equivale a devolver.
- **Ensayo:** el generador conserva la devolución revisada. Una escritura necesita credencial aparte y aprobación explícita. Un envío incierto no se repite automáticamente. Las relaciones pendientes de un registro confirmado pueden completarse después de comprobarlo y aprobar otra vez, sin repetir el alta.

## Operación y límites

Un operador, un portal por carpeta y 10.000 registros totales. Copias horarias solo con PC encendido, sesión Windows abierta y servicios habilitados; aviso a los 75 minutos y simulacro mensual. El iniciador no instala servicios ni inicio automático. Tras reiniciar Windows vuelve a abrir Plan B. Se respetan los controles de Windows.

Se conservan contactos, empresas, oportunidades, tareas, campos básicos, personalizados seleccionados y relaciones disponibles. No cubre adjuntos, correos, campañas, cuerpo/tipo/recordatorios de tareas ni todas las reglas o automatizaciones del CRM. Las capturas paginadas detectan inconsistencias de recuentos, pero no son una transacción atómica de HubSpot.

IA desactivada para datos reales. Sin multiusuario, facturación, borrados remotos ni sincronización bidireccional. El cifrado protege valores almacenados y exportaciones cifradas; una sesión Windows comprometida queda fuera de esa garantía. No se ofrece SLA ni certificación.

Ante un fallo, conserva la carpeta y descarga el diagnóstico sin fichas ni claves desde Continuidad. Credencial rechazada: revisa su validez en el portal. Permisos insuficientes: revisa la clave sin ampliarla a escritura. Sin espacio: exporta y revisa el historial; nunca borres bases manualmente. Una copia antigua sigue accesible con su aviso.

Las actualizaciones se preparan en otra carpeta y se prueban restaurando una exportación cifrada; nunca se sobrescribe una sesión pendiente. La agencia debe acordar soporte, custodia, tratamiento, retención y autorización antes de activar un cliente real. El proveedor no recibe automáticamente datos, diagnósticos ni telemetría.
