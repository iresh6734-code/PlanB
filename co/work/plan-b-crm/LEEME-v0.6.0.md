# Plan B · 0.6.0 · Trabajo comercial conectado

27/10/2026, Europe/Madrid. Implementación y ensayo local. No se presenta como aceptación de cuentas reales: siguen pendientes el despliegue/identidad de 0.5 y la prueba integrada de OAuth y operaciones en cuentas de ensayo.

## Interfaz

«Trabajar» despliega Clientes, Empresas, Oportunidades y Tareas justo debajo, con apertura/cierre accesibles, foco por teclado, indicador de expansión y movimiento de 190 ms. Entrar directamente desde Preparación también abre sus apartados. El movimiento se elimina con `prefers-reduced-motion`. En móvil los apartados ocupan una fila propia dentro del menú.

Integraciones conserva blanco/azul y utiliza los logos oficiales de HubSpot, Gmail, Calendar, Drive, Docs y Sheets. HubSpot es SVG; los productos de Google usan PNG multicolor de 96 px para una presentación de 35 px. Los archivos se sirven localmente, sin llamadas a dominios de logos al navegar. `public/integrations/sources.json` conserva origen y SHA-256; se identifican servicios, sin atribuir asociación comercial ni modificar sus marcas.

El botón «Abrir espacio comercial» conduce a la empresa del servicio de equipo autorizado por esta instalación. La consola añade Comercial, con Seguimientos, Archivos e Importar Sheets.

## Capacidades implementadas

- Borradores editables con destinatario, mensaje, horario, propuesta documental y selección de acciones. Los cambios sin guardar bloquean la aprobación. La aprobación se liga a contenido, revisión de datos y conexión Google; una ejecución exige otra acción explícita.
- Tarea interna persistente, sin alta automática en HubSpot. Una ejecución simultánea por empresa, compartiendo exclusión con la cola de capturas. Propuestas, evidencias, tareas, vínculos y vistas previas tienen aislamiento RLS.
- Gmail: envío autorizado mediante `gmail.send`, MIME UTF-8 y aceptación identificada por la API. **Aceptación no equivale a entrega ni lectura.** Los borradores permanecen en Plan B; no se solicita lectura de buzón ni `gmail.compose`.
- Calendar: disponibilidad de agenda propia, evento con ID determinista, invitación revisada y lectura posterior para comprobar destinatario, contenido y horario. No se activa Meet ni se presupone disponibilidad de los invitados.
- Drive/Docs: lista acotada de archivos autorizados para la app, vínculo a cliente, lectura acotada de un documento seleccionado y propuesta nueva desde un borrador revisado. El contenido externo es texto, no instrucciones ejecutables.
- Sheets: informe con celdas de texto literal para impedir interpretación de fórmulas; lectura posterior de comprobación. Importación de hasta cien filas con cabecera, correspondencia de cuatro columnas, validación de reglas del CRM, duplicados y revisión. Importar escribe solo en Plan B; conserva la hoja y HubSpot. Repetir la misma importación no duplica filas.
- HubSpot: ficha de contacto con propietario cuando está autorizado, notas y muestra de tareas/reuniones/llamadas/correos asociados. Se solicitan hasta dos detalles por tipo y ocho detalles en total; la UI declara el alcance parcial. Comparación de las dos capturas guardadas más recientes, identificadas por ID, con altas, ausencias, modificaciones y relaciones. No hay sincronización incremental ni webhook todavía.

## OAuth y ejecución

Google utiliza cliente OAuth propio, PKCE S256, estado de un uso ligado a empresa/persona/cuenta esperada, correo verificado, tokens cifrados y renovación. Las conexiones nuevas o retiradas invalidan aprobaciones. Cada petición de una ejecución comprueba que continúa la misma conexión; cambiar de cuenta a mitad no puede trasladar las acciones restantes a la cuenta nueva. La demo usa exclusivamente adaptadores ficticios, aunque hubiera configuración Google en su entorno.

Permisos operativos: `gmail.send`, `calendar.events.owned`, `calendar.freebusy` y `drive.file`, además de identidad básica. `drive.file` permite archivos creados o ya autorizados para la app; no es una búsqueda global en todo Drive. La selección inicial de archivos ajenos mediante Google Picker queda pendiente. Los permisos y la publicación de la aplicación deben revisarse en Google antes de clientes reales.

La lectura adicional de propietarios de HubSpot se solicita solo marcando su opción y repitiendo autorización. No amplía conexiones ya guardadas. HubSpot mantiene transporte de lectura; no se escribe en sus objetos.

Las ejecuciones se registran antes de contactar al proveedor. Se acotan a 100 segundos de peticiones Google, con 15 segundos por petición. Una respuesta perdida, una operación parcial o un proceso interrumpido conserva evidencias y estado incierto. No hay reenvío automático. Se recupera la visibilidad de ejecuciones interrumpidas al volver a consultar el espacio. Las acciones se ejecutan durante la petición revisada; el procesamiento autónomo programado pertenece a 0.7.

## Configuración y demo

El servicio necesita ejecutar la migración actualizada. Nuevas variables de Secret Manager: `GOOGLE_WORKSPACE_CLIENT_ID`, `GOOGLE_WORKSPACE_CLIENT_SECRET` y clave AES existente de 32 bytes. Callback exacto: `ORIGEN/team/oauth/google/callback`. Configurar usuarios de ensayo, APIs de Gmail/Calendar/Drive/Docs/Sheets y consentimiento OAuth. Terraform añade `enable_workspace=false` por defecto y secretos sin valores; se conserva la revisión de coste/proyecto antes de provisionar.

**Piloto local real, 27/10/2026:** disponible separadamente en `http://localhost:4334/team?view=commercial`, con contraseña propia de un operador y configuración protegida por Windows DPAPI. OAuth y lectura Drive comprobados; ensayo aprobado de Gmail a cuenta propia y reunión Calendar del 28/10/2026, 16:30–17:00 Europe/Madrid, ejecutado y verificado mediante API/interfaz de Google. Tarea interna y evidencias persisten tras recargar. Docs/Sheets desactivados en ese ensayo y pendientes de escritura real. Arranque `npm run start:google-pilot`; límites y evidencias en [GOOGLE-PILOTO-LOCAL.md](GOOGLE-PILOTO-LOCAL.md). No usa perfiles ficticios ni sustituye la identidad gestionada o la aceptación de nube. Las demos anteriores permanecen simuladas.

[Procedimiento GCP y estimación](infrastructure/gcp/README.md). No se han contratado recursos, utilizado sesiones de otras instalaciones ni conectado con el ordenador corporativo excluido. No se introdujeron claves Google en esta tarea.

Demo nueva en carpeta `planb-local-v0.6.0-2026-10-27`: CRM local en **http://127.0.0.1:4329/** y consola de equipo en **http://127.0.0.1:4330/team?view=commercial**, con sus bases propias, cuentas y actividad ficticias. `INICIAR.cmd` inicia ambos servicios en loopback con tráfico externo bloqueado. Los módulos se vinculan al checkout; no es un paquete portable distribuible.

## Validación y pendientes

Pruebas de lógica/API cubren aislamiento, edición/aprobación obsoleta, resultados inciertos, exclusión de trabajos, cuenta cambiada durante ejecución, OAuth/PKCE, importación deduplicada, Docs seleccionado y adaptadores REST con respuestas controladas. Los recorridos de Chrome comprueban menú, foco, logos locales, ficha, seguimiento revisado, evidencias, importación y móvil. La revisión visual auxiliar con GPT‑6.1 Terra no sustituye esas pruebas.

Pendiente de aceptación: Google/HubSpot auténticos, funcionamiento de OAuth bajo las políticas del proyecto, Cloud SQL/Tasks/OIDC en despliegue real, recuperación del servicio gestionado y prueba humana del proceso. Pendientes funcionales de 0.6: Picker para seleccionar nuevos archivos ajenos a la app, profundidad/paginación completa de actividad y etiquetas de relaciones, sincronización HubSpot incremental/webhooks. La conciliación asistida ya dispone de implementación y pruebas controladas; su aceptación remota real sigue pendiente. La lectura amplia de Gmail mantiene su puerta de publicación separada. No se activa autonomía 0.7 por esta entrega.

Referencias oficiales: [Gmail send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send), [Calendar events](https://developers.google.com/workspace/calendar/api/guides/create-events), [Drive y alcance por archivo](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Docs batchUpdate](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate), [Sheets create](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/create).

Resultado de cierre: **147/147** pruebas de lógica/API, **14/14** E2E Chrome (2,0 min), compilación/TypeScript correctos, **11/11** comprobaciones comerciales repetidas tras el último ajuste, Terraform válido y auditoría npm con **0 avisos**. La apertura por la herramienta de Codex quedó en cola; el controlador nativo de navegador no pudo inicializarse en el cierre. Las capturas y pruebas Chrome sí se ejecutaron sobre los servidores de ensayo. Evidencias en `C:/Users/iresh/.codex/visualizations/2026/10/26/01a179cf-4d25-75a0-9cab-061933f2b4d8/v0.6.0/`.


## Revisión de estructura y UX · 27/10/2026

Auditoría y alternativas en `UX-ARQUITECTURA-0.6.md`, sistema mantenible en `DESIGN.md`. Cambios de composición y componentes reales en toda la aplicación, conservando tablas, edición lateral, identidad azul y permisos. La demo de esta revisión es independiente: **http://127.0.0.1:4331/** y **http://127.0.0.1:4332/team?view=commercial**, carpeta `planb-local-ux-2026-10-27`. Las demos 4329/4330 conservan el build anterior; recargarlas no muestra esta revisión. Esta carpeta de evidencia se denomina `ux-0.6.1`; el manifiesto continúa en 0.6.0, sin nuevo ZIP distribuido.

Una propuesta incierta ofrece «Comprobar sin repetir acciones». Es una petición humana con revisión de hash y permisos. Se comprueba la tarea interna existente; Calendar lee el ID determinista, Docs/Sheets solo consultan referencias conservadas. Gmail conserva únicamente la aceptación ya registrada: no consulta el buzón ni reenvía. El servicio no declara completo un resultado sin todas las evidencias requeridas. La conciliación dura hasta 60 s de lecturas, comparte la exclusión por empresa y registra sus conclusiones. Si cambia la cuenta, hace falta reconectar la identidad original. Los resultados sin referencia o sin identidad histórica quedan pendientes de revisión humana.

Validación vigente de la revisión UX: build/TypeScript correctos, 151/151 lógica/API y 16/16 E2E Chrome (1,2 min); 19 capturas de auditoría final y comprobaciones en móvil. Detalles/evidencias y límites en `UX-ARQUITECTURA-0.6.md`. Las cifras de cierre anteriores de esta guía corresponden al build previo.
