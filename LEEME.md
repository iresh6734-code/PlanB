# Plan B CRM · Demo local

Una aplicación de continuidad en español para un operador y datos ficticios. Esta fase demuestra importación normalizada, generación de una especificación declarativa, edición con SQLite y exportación portable. No es una beta para datos reales de empresas.

## Arranque en Windows

1. Extrae TODO el ZIP en una carpeta con permiso de escritura.
2. Abre **ABRIR PLAN B.cmd**. No hace falta instalar Node ni descargar paquetes.
3. Abre la dirección local que aparece en la ventana: normalmente http://127.0.0.1:4317.
4. Mantén la ventana del servidor abierta mientras utilizas la aplicación. Para cerrarla, pulsa Ctrl+C.

El ZIP principal incluye el generador y una copia de Agencia Norte ya preparada como **especificación de ensayo**. Puedes usarla directamente o entrar en Preparación para elegir otro conjunto ficticio. El ZIP independiente contiene solo el servidor de continuidad y empieza normalmente en el puerto 4318.

La primera ejecución crea **data/planb.sqlite**. Los siguientes arranques utilizan esa base, sin reinicializarla. Para trasladar la aplicación, cierra el servidor y mueve la carpeta completa, incluida data. El JSON de inicio se usa únicamente si todavía no existe una captura en la base local.

## Demostración de cinco minutos

1. En Clientes, comprueba **Modo independiente**. En el generador también puedes usar Desconectar servicios.
2. Edita el teléfono de Lucía Martín y guarda.
3. En Oportunidades, abre una tarjeta, cambia la Etapa a Propuesta y guarda. Necesita un Servicio seleccionado.
4. En Tareas, crea una con asunto y fecha límite.
5. Cierra el servidor, vuelve a abrirlo y comprueba los tres cambios.
6. Exportar permite descargar otra aplicación independiente, un JSON completo y el historial en JSON o CSV.

Para comparar configuraciones, entra en Preparación → Origen y elige Distribuidora Atlas. Verás Código de cliente, Referencia del pedido, Fecha de entrega y otras etapas. El servidor exige una referencia para pasar a En entrega. Si hay cambios locales, exporta primero y marca la casilla de sustitución. La importación guarda además un archivo interno de la copia previa en SQLite; no hay una interfaz de restauración de archivos internos en esta versión.

## IA

La generación con un proveedor de IA está aparcada en Verifica: el código se conserva en la rama `archivo/aparcado-2026-11-22`. La app no llama a ningún modelo ni guarda claves de IA.

La opción **Crear especificación de ensayo** es determinista y gratuita. Conserva las reglas de la captura y se identifica como ensayo en todas las vistas.

## HubSpot de prueba

1. Crea/inicia sesión en una cuenta de desarrollador y una cuenta **DEVELOPER_TEST** o **SANDBOX**. Usa exclusivamente datos ficticios.
2. Obtén una Service Key con acceso de lectura si tu cuenta dispone de esta función. Si no, utiliza el flujo OAuth permitido en tu cuenta de prueba para conseguir un token de acceso. Esta demo recibe el token, no implementa el servidor de autorización OAuth ni renueva tokens expirados.
3. Habilita lectura para contactos, empresas, oportunidades, tareas, propiedades/esquemas, pipelines y asociaciones; el endpoint de información de cuenta requiere external-settings-access. Los nombres exactos de los permisos dependen del tipo de credencial y acceso disponible en HubSpot.
4. En Preparación → Origen → Conectar HubSpot introduce el ID de la cuenta y el token. El servidor verificará ambos y rechazará cuentas STANDARD o APP_DEVELOPER.

No necesitas crear aplicaciones privadas antiguas para esta demo. El token introducido en la interfaz solo permanece durante la importación y no se guarda. Opcionalmente el generador admite PLANB_HUBSPOT_TOKEN en su entorno.

El importador pagina objetos y asociaciones, compara los recuentos de objetos con búsquedas independientes, comprueba destinos de relaciones y solo sustituye la captura tras validar el conjunto. Las respuestas parciales y cursores repetidos se rechazan. No es una captura transaccional del servicio remoto: durante la prueba evita editar HubSpot mientras importas. Se conservan los objetos activos y las propiedades estándar seleccionadas y personalizadas visibles, hasta 60 propiedades y 10000 registros por objeto. Los campos calculados, datetime y selecciones múltiples se conservan como solo lectura. Las relaciones múltiples permanecen en la captura; el formulario muestra una relación principal.

La configuración importada no contiene todas las reglas privadas de negocio de HubSpot. Las funciones no reproducidas se enumeran en cobertura. No se conserva un portal completo de HubSpot ni se devuelven cambios automáticamente.

**Validación externa pendiente:** las pruebas de los conectores usan respuestas controladas. No se ha completado una importación con una cuenta real de prueba de HubSpot ni una generación con el proveedor que añadas después.

## Datos y exportaciones

- Captura original: campos, registros, etapas, relaciones y reglas con procedencia.
- Registros activos: copia editable guardada en SQLite.
- Historial: fecha, entidad, ID, antes/después y tipo de operación.
- JSON completo: captura + especificación + registros actuales + historial.
- CSV de cambios: una fila por operación; antes_json y despues_json contienen los campos completos. No es un CSV separado por cada tipo de registro.
- Paquete independiente: runtime.mjs, recursos locales, dependencias, node.exe, copia inicial y lanzador. No contiene importadores ni adaptadores de IA. La base activa prevalece sobre el JSON inicial.

No hay alojamiento ni telemetría. El servidor solo escucha en 127.0.0.1, valida Host y Origin y restringe los recursos del navegador al mismo origen. El modo desconectado impide nuevas importaciones de HubSpot y generaciones con IA. El servidor independiente no registra esas rutas. No se necesita internet para las operaciones cubiertas.

## Desarrollo y pruebas

Código fuente en source/. Node.js 24 o superior.

    npm ci
    npm test
    npm run build
    npm run start
    npm run test:e2e

Las pruebas de navegador usan Edge instalado y levantan una base aislada en el puerto 4337. Bloquean solicitudes externas del navegador y ejecutan el servidor con scripts/block-external.cjs. El paquete incluye los resultados y capturas en pruebas/. No se ha modificado el firewall del ordenador.

Para volver a empaquetar: preparar dependencias con scripts/prepare-deps.ps1, compilar y ejecutar npm run package:demo. El script utiliza el Node que lo ejecuta; el lanzador Windows requiere node.exe de Windows. No mezcles el código fuente con tus archivos privados .env o .ai.local.json.

## Límites conocidos

No incluye facturación, pagos, campañas, extensiones, archivos adjuntos, automatizaciones complejas, permisos multiusuario, sincronización ni restauración automática al origen. No hay cifrado de base de datos ni autenticación multiusuario. Usa un único servidor por carpeta; cierra la app antes de moverla o hacer una copia manual de SQLite. El formato exportado se valida estructuralmente, pero no está firmado criptográficamente.

Esta entrega verifica capacidad técnica local y una demo comercial. No acredita disponibilidad, ingresos, cobertura total del CRM ni seguridad para producción.

## Referencias oficiales

- HubSpot: https://developers.hubspot.com/developer-platform-basics
- Cambios de credenciales: https://developers.hubspot.com/changelog/fall-2026-spotlight
- OpenRouter JSON Schema: https://openrouter.ai/docs/guides/features/structured-outputs
- Gemini API compatible: https://ai.google.dev/gemini-api/docs/openai
- DeepSeek JSON: https://api-docs.deepseek.com/guides/json_mode/
- Ollama compatible: https://docs.ollama.com/api/openai-compatibility

Node.js y las dependencias conservan sus licencias incluidas. La demo no está afiliada a HubSpot ni a los proveedores de IA.
