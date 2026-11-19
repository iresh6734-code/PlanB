# Ficha comercial · 19/11/2026

## Qué es

**Plan B** es la copia de trabajo de tu CRM (HubSpot) que vive en tu ordenador. Mientras el CRM funciona, guarda capturas cada hora y comprueba que se pueden recuperar. Si el CRM cae, sigues trabajando con clientes, empresas, oportunidades y tareas, y al volver devuelves los cambios revisados. Tus datos no salen de tu ordenador.

**Para quién:** equipos comerciales pequeños y agencias que dependen de HubSpot y no pueden quedarse un día sin su cartera, y para responsables que deben demostrar ante una auditoría que tienen un plan de continuidad.

## Por qué se compra

1. **Sigue vendiendo con el CRM caído.** Clientes, empresas, tablero de oportunidades y tareas del día funcionan sin conexión.
2. **Demuestra que la copia sirve.** Simulacros guiados en un entorno aparte, calendario de simulacros y un pasaporte de continuidad imprimible con huella SHA-256 para el auditor.
3. **Vuelve sin perder nada.** Devolución revisada de los cambios; si la conexión es de solo lectura, lista imprimible para aplicarlos a mano y comprobación posterior.
4. **Mejor que el CRM para el día a día.** Hoy, «Despachar vencidas», barrido de la mañana, seguimiento al completar, recordatorios, cambio en bloque y vistas de oportunidades paradas.

## Qué incluye hoy

| Área | Funciones | Estado |
|---|---|---|
| Continuidad | Capturas cada hora, franja de preparación «n de 5», libro de capturas por día, fiabilidad de procesos, calendario de simulacros (cada 30 días), parte para compartir e informe del mes. | Comprobado con pruebas unitarias y build. Ver en casa. |
| Auditoría | Pasaporte de continuidad en HTML A4 + JSON con huella SHA-256, resumen por evidencia (observado, declarado, sin comprobar) y bloque de firma. | Comprobado con pruebas unitarias y build. Ver en casa. |
| Recuperación | Devolución revisada a HubSpot; con conexión de solo lectura, lista imprimible por pasos (empresas → contactos → negocios → tareas) y comprobación por lectura. | Lógica comprobada; lista nueva sin revisión visual. Ver en casa. |
| Trabajo diario | Hoy, Despachar vencidas (mañana o lunes), barrido de la mañana, siguiente paso al completar, recordatorio 15 minutos antes, deshacer en 8 s, paleta de órdenes (Ctrl J) y atajos. | Comprobado con pruebas unitarias y build. |
| Cartera | Orden y filtro sobre todos los registros, tablero con sumas reales por etapa, vistas «Sin próximo paso», «Paradas 14 días» y de cierre, cambio en bloque, importación CSV con aviso de duplicados. | Comprobado con pruebas unitarias y build. |
| Planes | Apartado «Ajustes › Plan y licencia», licencias firmadas que se comprueban sin conexión y 14 días de gracia. | Comprobado con pruebas unitarias y build. Falta generar la clave de venta. |

«Ver en casa» quiere decir que falta mirarlo en pantalla y con recorridos de navegador en el otro ordenador; en este equipo solo se han pasado pruebas unitarias y el build.

## Planes

| | Personal | Pro | Equipo |
|---|---|---|---|
| Copias manuales y trabajo sin conexión | Sí | Sí | Sí |
| Simulacros de caída | Sí | Sí | Sí |
| Capturas programadas cada hora | — | Sí | Sí |
| Pasaporte de continuidad | — | Sí | Sí |
| Previsión «si el CRM cae ahora» | — | Sí | Sí |
| Informe mensual | — | Sí | Sí |
| Cambio en bloque | — | Sí | Sí |
| Espacio de equipo | — | — | Sí |
| Precio | Gratis | A decidir | A decidir por puesto |

La tabla sale de `shared/license.ts`. Hoy no se bloquea ninguna función: qué limitar y a qué precio es una decisión pendiente.

## Promesas que podemos sostener

- Los datos del CRM se guardan cifrados en este ordenador y no se envían a ningún servidor de Plan B.
- Los documentos exportados (parte, informe, pasaporte) no llevan nombres de clientes; la lista de recuperación manual sí, y lo avisa.
- Una prueba superada acredita esa copia concreta, no las posteriores; los documentos lo dicen.

## Lo que todavía no prometemos

- Lectura completa de la actividad del CRM (correos, llamadas) ni nombres de responsables.
- Aceptación de despliegue en la nube ni integraciones remotas aparte de HubSpot.
- Fusión de duplicados, previsión ponderada y asistente de devolución por pasos: están en el plan (`docs/super-plan.md`), no construidos.

## Anexo · Ficha del cliente y próxima acción (28/10/2026)

Parte de la fase0.6. No completa la aceptación de nube, las integraciones remotas restantes o la autonomía.

Ampliación documental posterior de la misma fecha: la ficha incorpora Documentos del cliente, con selección de archivos autorizados, vínculos por cuenta/fuente, lectura explícita y retirada recuperable. Picker/API activados en proyecto propio; selección y consentimiento de archivos todavía pendientes del usuario. Consultar `DOCUMENTOS-CLIENTE.md` para contratos, validación actual y límites.

Desde **Contactos**, pulsar el nombre para abrir la ficha lateral. Muestra la procedencia, empresa, datos de contacto, oportunidades y etapa, responsable conservado y tareas vinculadas. La captura se identifica por fecha; no se atribuye actualidad a datos históricos. Si no consta el responsable o la moneda, se indica su ausencia. Las fechas de las tareas CRM son vencimientos, no un historial de comunicaciones. Se muestran hasta100 tareas de la captura y100 acciones internas de la ficha.

**Próxima acción** guarda título y fecha futura en Plan B. Permite completar y reabrir; recargar conserva el estado. No crea tareas CRM ni envía comunicaciones. Un UUID de operación evita altas duplicadas, incluso concurrentes; reutilizarlo con otro contenido produce conflicto. Cambios de estado usan una versión para evitar sobrescribir una edición concurrente.

**Preparar seguimiento** abre Comercial con el borrador nuevo y Gmail, Calendar, Docs y Sheets apagados. Se vuelve a comprobar la fuente dentro de la preparación. Con HubSpot como fuente activa, un contacto de Copia local no puede preparar un seguimiento con datos de esa captura: debe seleccionarse el contacto de la fuente activa.

El asistente por reglas considera las acciones internas abiertas con vencimiento dentro de siete días. Completar una acción vuelve a evaluar la oportunidad. Una acción lejana no equivale a seguimiento próximo. No se invoca un modelo ni se habilita Copilot Studio.

### Contratos y almacenamiento

- GET `/api/team/spaces/:tenant/v6/customers/:contact?source=active|local`: ficha desde el repositorio, sin proveedor de red.
- POST a `/actions`: idUUID,sourceKey,title,dueAt. Solo rol con escritura; comprueba contacto y fuente.
- POST a `/actions/:id`: sourceKey,version,status(open/completed). Rechaza cambios de otra ficha/empresa o revisión obsoleta.
- `team_customer_actions`: RLS por empresa, índice de contacto/fuente y fuente separada local/portal. No modifica los registros CRM ni las propuestas históricas.
- Preparación comercial acepta una intención interna ligada a sourceKey y vuelve a comprobarla en servidor. Las rutas antiguas son compatibles.

### Validación y límites

Build final correcto. Batería general179/179 y, después de la ampliación del asistente,13/13 pruebas afectadas. Cuatro recorridos de navegador finales correctos: persistencia/cierre/preparación, destinatario ajeno bloqueado en interfaz, sidebar/logos y flujos comerciales existentes. Escritorio,390 y320px, Escape/foco, sin overflow ni errores de aplicación. Servidores y perfil nuevos de prueba, con red externa bloqueada; ninguna sesión personal se utiliza para esas pruebas. Capturas e informe JSON en la carpeta `qa-2026-10-28` de evidencias de este chat.

El navegador integrado CUA no inicializa sus assets. La QA anterior no representa una inspección autenticada de la instalación del usuario. Piloto actualizado, salud correcta y API sin sesión401; el reinicio exige desbloquear otra vez. El fallo inicial del lanzador queda registrado sin inventar su causa; se recuperó el servicio con ejecución supervisada.

Pendientes: nombres de responsables no conservados, actividad CRM completa/paginada, Picker y vínculo documental de clientes HubSpot, formato de archivos comprobado remotamente con aprobación concreta y aceptación de nube. No se leen correos de Gmail ni se usan recursos IFR.
