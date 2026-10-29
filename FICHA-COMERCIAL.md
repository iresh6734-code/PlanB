# Ficha comercial · 28/10/2026

Parte de la fase0.6. No completa la aceptación de nube, las integraciones remotas restantes o la autonomía.

Ampliación documental posterior de la misma fecha: la ficha incorpora Documentos del cliente, con selección de archivos autorizados, vínculos por cuenta/fuente, lectura explícita y retirada recuperable. Picker/API activados en proyecto propio; selección y consentimiento de archivos todavía pendientes del usuario. Consultar `DOCUMENTOS-CLIENTE.md` para contratos, validación actual y límites.

Desde **Contactos**, pulsar el nombre para abrir la ficha lateral. Muestra la procedencia, empresa, datos de contacto, oportunidades y etapa, responsable conservado y tareas vinculadas. La captura se identifica por fecha; no se atribuye actualidad a datos históricos. Si no consta el responsable o la moneda, se indica su ausencia. Las fechas de las tareas CRM son vencimientos, no un historial de comunicaciones. Se muestran hasta100 tareas de la captura y100 acciones internas de la ficha.

**Próxima acción** guarda título y fecha futura en Plan B. Permite completar y reabrir; recargar conserva el estado. No crea tareas CRM ni envía comunicaciones. Un UUID de operación evita altas duplicadas, incluso concurrentes; reutilizarlo con otro contenido produce conflicto. Cambios de estado usan una versión para evitar sobrescribir una edición concurrente.

**Preparar seguimiento** abre Comercial con el borrador nuevo y Gmail, Calendar, Docs y Sheets apagados. Se vuelve a comprobar la fuente dentro de la preparación. Con HubSpot como fuente activa, un contacto de Copia local no puede preparar un seguimiento con datos de esa captura: debe seleccionarse el contacto de la fuente activa.

El asistente por reglas considera las acciones internas abiertas con vencimiento dentro de siete días. Completar una acción vuelve a evaluar la oportunidad. Una acción lejana no equivale a seguimiento próximo. No se invoca un modelo ni se habilita Copilot Studio.

## Contratos y almacenamiento

- GET `/api/team/spaces/:tenant/v6/customers/:contact?source=active|local`: ficha desde el repositorio, sin proveedor de red.
- POST a `/actions`: idUUID,sourceKey,title,dueAt. Solo rol con escritura; comprueba contacto y fuente.
- POST a `/actions/:id`: sourceKey,version,status(open/completed). Rechaza cambios de otra ficha/empresa o revisión obsoleta.
- `team_customer_actions`: RLS por empresa, índice de contacto/fuente y fuente separada local/portal. No modifica los registros CRM ni las propuestas históricas.
- Preparación comercial acepta una intención interna ligada a sourceKey y vuelve a comprobarla en servidor. Las rutas antiguas son compatibles.

## Validación y límites

Build final correcto. Batería general179/179 y, después de la ampliación del asistente,13/13 pruebas afectadas. Cuatro recorridos de navegador finales correctos: persistencia/cierre/preparación, destinatario ajeno bloqueado en interfaz, sidebar/logos y flujos comerciales existentes. Escritorio,390 y320px, Escape/foco, sin overflow ni errores de aplicación. Servidores y perfil nuevos de prueba, con red externa bloqueada; ninguna sesión personal se utiliza para esas pruebas. Capturas e informe JSON en la carpeta `qa-2026-10-28` de evidencias de este chat.

El navegador integrado CUA no inicializa sus assets. La QA anterior no representa una inspección autenticada de la instalación del usuario. Piloto actualizado, salud correcta y API sin sesión401; el reinicio exige desbloquear otra vez. El fallo inicial del lanzador queda registrado sin inventar su causa; se recuperó el servicio con ejecución supervisada.

Pendientes: nombres de responsables no conservados, actividad CRM completa/paginada, Picker y vínculo documental de clientes HubSpot, formato de archivos comprobado remotamente con aprobación concreta y aceptación de nube. No se leen correos de Gmail ni se usan recursos IFR.
