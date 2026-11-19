# Documentos del cliente · 28/10/2026

Entrega dentro de0.6. El objetivo es seleccionar documentos expresamente y conservar su vínculo con el cliente correcto sin compartirlos ni modificarlos en Google.

## Recorrido

Desde Contactos, abrir la ficha y su sección Documentos del cliente. También está disponible en Comercial → Archivos. Los vínculos guardados se consultan localmente al abrir la sección; no se lee el documento ni se consulta Drive de forma automática.

Seleccionar archivos autorizados carga metadatos de Docs/Sheets accesibles para esta app. Búsqueda y filtro operan sobre los archivos cargados; Cargar más recorre páginas adicionales. Se admiten hasta diez archivos por selección y se exige revisar archivos/cliente antes de vincular. Se vuelven a comprobar la cuenta y la fuente en servidor.

Leer contexto del documento realiza una lectura explícita de hasta20.000 caracteres y los muestra como texto, nunca HTML ni instrucciones ejecutables. Abrir en Google utiliza una URL construida por el servidor. Quitar vínculo requiere confirmación dentro de Plan B, conserva el archivo en Google y permite volver a vincularlo sin duplicar la fila.

Los vínculos están separados por empresa, fuente local/portal, cliente y cuenta Google. Un contacto CRM no necesita una copia local editable. Cambiar la cuenta oculta vínculos de la identidad anterior y bloquea lecturas/selecciones obsoletas. Los vínculos históricos sin cuenta/fuente comprobables se conservan sin atribuirlos automáticamente a la conexión actual.

## Google Picker

Implementado el selector por redirección documentado por Google: OAuth con PKCE y estado de un solo uso ligado a actor, empresa, cliente, fuente y revisión de conexión. Pide exclusivamente `drive.file`, con `include_granted_scopes=false` y `trigger_onepick=true`; usa el callback Google existente, sin cambiar su cliente OAuth ni crear una API key de navegador.

El retorno comprueba por Drive la cuenta autorizada, rechaza permisos adicionales o una cuenta distinta, guarda cifrada una credencial separada de solo archivos y vincula únicamente los IDs seleccionados que Drive confirma accesibles. No sustituye la conexión general Gmail/Calendar. No entrega tokens al navegador. Cancelar no intercambia el código ni modifica la conexión principal. Una desconexión durante la autorización impide restaurar credenciales.

Google Picker API (`picker.googleapis.com`) fue habilitada realmente en el proyecto propio `planb-crm-piloto-20261027` tras confirmación específica del usuario, que inició sesión personalmente y autorizó aceptar las Google APIs Terms of Service. La consola mostró después Inhabilitar API y la ruta de métricas del servicio habilitado. Solo se modificó esa API. No se crearon archivos, se seleccionaron documentos, se enviaron mensajes, se publicó una app o se contrataron recursos.

El piloto activa el selector con `google-picker.json` y `{"enabled":true}` en su carpeta independiente, después de comprobar la API habilitada. En despliegue gestionado se usa `GOOGLE_PICKER_ENABLED=1`. El flag por defecto está apagado: habilitar una interfaz no equivale a conceder acceso a archivos concretos. El usuario debe seleccionarlos y consentir en Google; esa aceptación remota completa sigue pendiente hasta comprobar un retorno real.

Referencias primarias: [Picker mediante redirección](https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker), [alcance Drive por archivo](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## Contratos

- GET `v6/files?cursor=...`: página de metadatos, cursor y revisión de conexión; roles de lectura.
- GET `v6/file-links?contactId=...&source=active|local`: vínculos de la cuenta/fuente actuales, sin red externa.
- POST `v6/file-links`: revisión, cliente, fuente, revisión de conexión y hasta diez IDs. Acepta el contrato histórico de un solo `fileId`.
- POST `v6/file-links/:id/detach`: retirada interna recuperable. No invoca la API de permisos ni borra archivos remotos.
- GET `v6/file-links/:id/context`: lectura explícita ligada al vínculo/identidad actuales.
- POST `v6/files/picker/begin|complete|cancel`: autorización por archivo solo para el rol que administra conexiones; verificación de cuenta, PKCE, caducidad y estado no reutilizable.

`team_file_links` amplía su procedencia y retirada lógica. `team_google_picker_states` y `team_google_file_connections` tienen RLS por empresa y secretos cifrados. La migración conserva las filas históricas sin inventarles cuenta o fuente.

## Validación y pendientes

Build correcto y189/189 pruebas generales. **8/8 recorridos finales de navegador correctos**, incluidos retorno y cancelación Picker, selector, persistencia, lectura explícita, retirada y recorridos existentes. Se prueban con servidores/proveedores ficticios y red externa bloqueada, en escritorio/390/320px. Se corrigió una carrera de revisión al guardar borradores y se exige esperar a su confirmación antes de aprobar. Evidencias en la carpeta `qa-files-2026-10-28` del chat.

Después de la batería de ocho se amplió y repitió la comprobación visual de la selección adicional en escritorio/390/320, correcta y sin lecturas Drive previas. El JSON más reciente corresponde a esa prueba focalizada; la batería completa de ocho consta en el registro de ejecución de herramientas. Se conservan además logs de compilación y de las189 pruebas generales, capturas del selector/documentos y evidencia real de la API habilitada.

La API de Picker está habilitada y el piloto actualizado. La aceptación de una selección real y el nuevo formato Docs/Sheets requieren operaciones concretas revisadas; no se acreditan por las pruebas simuladas. Permanecen pendientes la profundidad/eventos HubSpot, nube/identidad0.5, IA en entorno propio autorizado y autonomía0.7. No se accede a IFR ni al buzón Gmail.
