# Plan B CRM v2 · Continuidad local

Esta entrega amplía la demo: versión activa protegida frente a actualizaciones fallidas, capturas con historial, simulacro aislado, exportación cifrada y devolución revisada. Continúa siendo una versión para datos de ensayo. Los resultados locales no equivalen a una validación con empresas.

## Abrir en Windows

Extrae el ZIP completo, abre **ABRIR PLAN B.cmd** y entra en la dirección local de la ventana (normalmente http://127.0.0.1:4317). No necesitas instalar Node ni descargar dependencias. El paquete principal incluye Agencia Norte ya preparada con datos ficticios. El independiente usa normalmente el puerto 4318.

La primera ejecución crea data/planb.sqlite y data/.planb-key. Los valores de negocio se cifran con AES-256-GCM; la clave se protege para tu usuario de Windows con DPAPI. No borres ese archivo. La migración de una base v1 válida se realiza al abrirla; conserva antes una exportación v1.

Los paquetes sin contraseña incluidos en esta entrega contienen únicamente datos ficticios. Las exportaciones que hagas desde **Exportar** requieren una contraseña de recuperación.

## Recorrido

**Continuidad:** fecha y antigüedad de capturas, historial, trabajos y último simulacro. Preparación permite elegir Agencia Norte o Distribuidora Atlas, importar una cuenta de prueba y revisar una especificación. Una candidata fallida no sustituye ni bloquea la aplicación activa.

**Trabajar:** Clientes, Empresas, Oportunidades y Tareas; formularios con reglas, búsqueda y páginas de 50 registros. El tablero distingue los pipelines importados. Las relaciones se buscan en el servidor. Las fechas con hora se muestran en la zona del navegador y se conservan en UTC.

**Cambios:** historial antes/después, descarga CSV/JSON y devolución supervisada.

**Exportar:** copia cifrada o paquete independiente cifrado. La contraseña de recuperación se necesita en otro equipo y no se guarda en el paquete. La contraseña local protege el acceso a la app y es distinta de la de recuperación.

## Simulacro

Pulsa **Probar mi Plan B**. Se ejecuta en un proceso Node independiente, con una copia temporal y bloqueo de fetch, DNS y sockets externos. Prueba editar un cliente, avanzar una oportunidad, crear/completar una tarea y reabrir SQLite. No escribe en tu espacio operativo ni en HubSpot. El informe indica conjunto utilizado, cinco comprobaciones, duración y limitaciones.

Si una cuenta importada necesita campos obligatorios o reglas que el simulacro no pueda satisfacer, el proceso fallará con una explicación; no se inventará un resultado positivo. El informe es evidencia técnica, no certificación ni SLA.

## Sesión de continuidad

**Continuar trabajando** abre una captura verificada y pausa importación e IA. Si hay cambios pendientes, no se abre otra captura encima. Una captura antigua se puede utilizar, pero su antigüedad permanece visible.

Una sesión con cambios pendientes no se cierra como si se hubieran devuelto. Las pruebas con destino simulado tampoco los marcan como devueltos a HubSpot. Puedes seguir trabajando o conservar una exportación.

## Capturas automáticas e inicio de sesión

Configura antes una contraseña local con **Proteger / bloquear** y guarda una Service Key/token de lectura e ID de cuenta en **Configurar cuenta HubSpot de prueba**. Solo se admiten DEVELOPER_TEST y SANDBOX. Las credenciales de lectura y el proveedor IA quedan cifrados para Windows, fuera de los archivos exportados.

Habilita servicios y **Capturas y simulacro mensual automáticos**. Se intenta una captura cada hora mientras el servidor esté abierto, conectado y fuera de una sesión de continuidad. Una captura fallida no modifica el espacio de trabajo. Una captura completada queda en el historial; abrirla es explícito.

Para arrancar el servidor al iniciar sesión en Windows, ejecuta desde la carpeta extraída:

    powershell -NoProfile -File ".\INICIO AUTOMATICO.ps1"

Se registra una tarea del usuario, con permisos limitados, que llama al iniciador oculto. No se ejecuta con privilegios de administrador ni se cambia la política de ejecución. Si Windows o tu organización no permiten scripts o tareas, conserva el arranque manual. Para quitar la tarea antes de trasladar la carpeta:

    powershell -NoProfile -File ".\INICIO AUTOMATICO.ps1" -Quitar

No se ha instalado una tarea de inicio en el ordenador de desarrollo. El script se entrega para activación explícita por el usuario; su registro no se ha probado en un perfil distinto.

Las copias solo avanzan con ordenador encendido, sesión iniciada y servidor conectado. Se avisa a los 75 minutos. No hay SLA ni actualizaciones con el PC apagado. Retención: 24 capturas de las últimas 24 horas y 30 diarias; la activa y la base de una sesión pendiente permanecen protegidas. El límite preventivo de almacenamiento lógico es 2 GB, incluyendo valores de registros, historial y capturas. Revisa espacio libre y exporta periódicamente a otro medio.

## Devolución revisada

La interfaz empieza en **destino simulado**, claramente identificado, para ensayar sin escribir en HubSpot. Desmarca esa opción únicamente para una cuenta HubSpot de prueba y aporta permiso de escritura cuando sea necesario.

1. Preparar revisión consulta el portal y compara origen, cambios locales y valores remotos.
2. Cada conflicto exige elegir local o remoto.
3. Revisa workflows con la agencia y coordina una ventana sin ediciones simultáneas.
4. Aprueba el plan y pulsa Aplicar a HubSpot de prueba.
5. El motor relee antes de actualizar, registra cada operación y verifica los valores después.

Se devuelven altas y modificaciones de los cuatro objetos, y adiciones de relaciones compatibles. Las empresas se crean antes de contactos, oportunidades y tareas para resolver los IDs locales. Los campos calculados son solo lectura. Cambiar/quitar una relación principal requiere revisión manual: esta versión no borra asociaciones ni registros remotos.

Si una respuesta se pierde, la operación queda **incierta**. No se vuelve a crear automáticamente. La agencia debe aportar el ID remoto y verificarlo; si quedan relaciones pendientes, requiere revisión manual. Si HubSpot cambia desde la revisión, actualiza los conflictos y vuelve a aprobar. No hay transacción global ni garantía frente a ediciones remotas simultáneas.

Las copias v2 conservan el diario de devolución, los IDs remotos confirmados y el último cambio devuelto. Tras restaurar se revisa de nuevo cualquier aprobación pendiente. Una devolución parcial bloquea nuevas ediciones hasta resolverla, para conservar una base coherente. Un resultado incierto sigue siendo incierto después de trasladar el paquete.

Las automatizaciones del CRM pueden ejecutarse al escribir. La aplicación no las desactiva ni reproduce todos los estados intermedios. El servicio de devolución real sigue limitado a cuentas de prueba hasta completar la validación externa.

## Recuperar en otro equipo

1. Exporta el paquete cifrado desde la app y guarda su contraseña por separado.
2. Extrae el ZIP en el otro Windows y abre ABRIR PLAN B.cmd.
3. En la pantalla local pulsa Restaurar archivo.
4. Selecciona continuity.encrypted.json del paquete e introduce la contraseña.
5. La app valida los datos y el historial y crea una base cifrada para el usuario de ese equipo.

Copiar únicamente una base cifrada a otro usuario de Windows no transfiere DPAPI. Usa siempre la exportación para ese caso. Mover la carpeta completa dentro del mismo usuario sí mantiene su clave local. Una contraseña de recuperación perdida no se puede restablecer a través de Plan B.

Los archivos v1 válidos se importan desde Restaurar archivo sin contraseña. La importación comprueba coherencia del historial con la captura y el estado final. La base activa no se sustituye si falla esa comprobación.

## IA

La generación con un proveedor de IA está aparcada en Verifica: el código se conserva en la rama `archivo/aparcado-2026-11-22`. La app no llama a ningún modelo ni guarda claves de IA.

## Validación y límites

Los informes de la entrega distinguen pruebas locales, respuestas controladas y conexiones auténticas. La cuenta real de ensayo HubSpot y el proveedor IA elegido se documentan separadamente cuando se verifiquen. No se presentan pilotos pagados ni ingresos como hechos.

Un portal, un responsable, Windows, hasta 10.000 registros totales. Sin campañas, correo, facturas, adjuntos, borrados remotos, sincronización bidireccional continua, multiusuario ni custodia en nuestra nube. No se habilitan datos empresariales reales con esta entrega.

La protección de sesión usa cookie HttpOnly y SameSite=Strict; una contraseña de 12 caracteres como mínimo, límite de intentos y caducidad de 30 minutos sin uso interactivo. El servidor solo escucha en 127.0.0.1 y valida Host y Origin. La app local no protege frente a malware que ya tenga acceso a tu usuario de Windows.

## Código y pruebas

El código está en source/. Node 24 y Microsoft Edge instalados permiten:

    npm ci
    npm test
    npm run build
    npm run test:e2e

El ZIP incluye sus propias dependencias de producción y Node para ejecutarse sin npm. El generador y el runtime tienen entradas separadas; el paquete independiente no incluye adaptadores de HubSpot ni IA. El servidor independiente devuelve 404 a rutas de importación, generación y devolución.

Para reenvasar desde source/, prepara runtime-assets/node_modules con las dependencias de producción. Puedes copiar las de la raíz de la entrega: crea runtime-assets/ y copia ../node_modules/ dentro. Después ejecuta npm run package:demo y python scripts/verify-package.py. Esos scripts usan ../../outputs respecto a su directorio de trabajo; ajusta esa ruta si organizas el código fuera del espacio de trabajo original.

Al reenvasar se utiliza el Node que ejecuta el script: hazlo en Windows si necesitas node.exe. El directorio de construcción del paquete v2 se regenera; los ZIP v1 se conservan.
