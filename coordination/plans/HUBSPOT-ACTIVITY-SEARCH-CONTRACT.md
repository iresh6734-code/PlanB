# HS025 · Contrato público para buscar actividad HubSpot

29/10/2026, Europe/Madrid · Codex. Solo documentación pública oficial y código local. No API autenticada, cuentas, credenciales, fuentes nuevas enviadas a Claude o cambios de producto. Completa la matriz pendiente de HS023; no implementa H4 ni prueba el portal personal.

## Resultado comprobado

Las referencias por operación publican los scopes dentro del HTML/MDX que entrega la página, aunque el extractor de texto omita sus valores. Se leyó ese contenido como texto, sin ejecutar JavaScript del sitio. La guía general de notas mezcla lectura y escritura; no se usó su lista agregada como requisito de cada GET.

El componente de documentación ScopesList tiene la descripción «This API requires one of the following scopes:». En las referencias comprobadas no se sobrescribe esa descripción: **los nombres de la lista son alternativas, no una conjunción inferida**. En correos aparecen contacts.read y sales-email-read como alternativas. Esto corrige la tentación de pedir un permiso adicional solo por ver dos nombres. No acredita que cualquier propiedad de contenido sea visible para todo token ni sustituye restricciones de cuenta/usuario. [Lectura de correo](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/emails/get-email), [búsqueda de correo actual](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/emails/search/search-emails).

## Matriz por operación

Prefijos exactos: **GET v3** `/crm/v3/objects/`; **POST v3** `/crm/v3/objects/`; **POST2026-09** `/crm/objects/2026-09/`. Cada enlace se recuperó con HTTP200. Los scopes de las tres operaciones coinciden por fila.

| Tipo | GET v3: sufijo y referencia | POST v3: sufijo y referencia | POST2026-09: sufijo y referencia | Scope documentado por operación |
| --- | --- | --- | --- | --- |
| Notas | [notes/{noteId}](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/notes/get-note) | [notes/search](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/notes/search/search-notes) | [notes/search](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/notes/search/search-notes) | `crm.objects.contacts.read` |
| Tareas | [tasks/{taskId}](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/tasks/get-task) | [tasks/search](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/tasks/search/search-tasks) | [tasks/search](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/tasks/search/search-tasks) | `crm.objects.contacts.read` |
| Reuniones | [meetings/{meetingId}](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/meetings/get-meeting) | [meetings/search](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/meetings/search/search-meetings) | [meetings/search](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/meetings/search/search-meetings) | `crm.objects.contacts.read` |
| Llamadas | [calls/{callId}](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/calls/get-call) | [calls/search](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/calls/search/search-calls) | [calls/search](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/calls/search/search-calls) | `crm.objects.contacts.read` |
| Correos | [emails/{emailId}](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/emails/get-email) | [emails/search](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/emails/search/search-emails) | [emails/search](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/emails/search/search-emails) | `crm.objects.contacts.read` **o** `sales-email-read` |

No se inventan scopes `crm.objects.notes.read` o equivalentes. El código OAuth ya solicita contacts.read; no hace falta ampliar su lista solo para cumplir el requisito de entrada publicado de estas operaciones. La visibilidad efectiva de campos, redacciones y permisos del usuario siguen sujetos al proveedor. Un cuerpo ausente no se debe presentar como ausencia demostrada de actividad. La [tabla oficial de scopes](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/scopes) identifica sales-email-read con email engagements individuales; no equivale a autorización Gmail ni a permiso nuevo concedido en Plan B.

## Filtro, orden y cobertura

La [guía pública Search](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm) lista estos cinco tipos, la pseudopropiedad `associations.contact`, filtros EQ y un criterio de orden. Indica indexación diferida y exclusión de archivados, cinco peticiones por segundo/cuenta y hasta200 resultados por página. Eso respalda una composición documentada; **no constituye una prueba autenticada de la combinación en cada actividad**. Las referencias específicas aceptan propertyName libre, sin enumerar qué asociaciones son válidas por tipo.

La referencia actual de [búsqueda de notas](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/notes/search/search-notes) define `sorts` como string[] y el prefijo `-` para orden descendente. No copiar el objeto de orden de un ejemplo de otra guía en un contrato que espera strings. Propuesta de lectura por creación CRM:

```json
{
  "filterGroups": [{"filters": [{"propertyName": "associations.contact", "operator": "EQ", "value": "CONTACT_ID_VALIDADO"}]}],
  "sorts": ["-hs_createdate"],
  "properties": ["hs_createdate", "hs_timestamp", "PROPIEDADES_ACTUALES_DEL_TIPO"],
  "limit": 1
}
```

Es un esquema de diseño, no payload enviado: sustituir ID, propiedades y cupo exactos al implementar. `hs_createdate` consta entre propiedades predeterminadas de búsqueda de actividades en la guía. Se seleccionaría por creación del registro, conservando el significado de hs_timestamp (incluido vencimiento de tarea) al mostrarlo. No llamarlo última interacción ni historial completo. Empates no tienen segundo criterio de orden garantizado; no inventar exhaustividad entre instantes iguales.

## Presupuesto recomendado sin aumentar los topes actuales

Reemplazar los GET de detalles por resultados Search con las propiedades necesarias, en vez de añadir cinco búsquedas y mantener ocho GET. Con el contacto ya leído, fijar cupos antes de consultar: primera plaza por tipo con asociaciones disponibles, segunda vuelta hasta ocho, máximo dos por tipo. Cada búsqueda lleva limit igual a su cupo; nunca pedir diez cuerpos para después ocultar dos. Ocho objetos como máximo, sin segunda página ni rellenos automáticos.

Hasta un GET contacto + cinco POST Search + un GET owner = **siete operaciones lógicas y catorce intentos físicos** con un único retry429 por operación. Queda por debajo de los máximos existentes10/20; mantener12s por lectura y30s global tras access, incluyendo espera/JSON. No se suman GET posteriores para completar campos: ausencias deben explicarse o rechazar contrato, sin ampliar el tráfico silenciosamente. Search404 es endpoint fallido, no actividad individual eliminada; no convertirlo en omisión inocua. Cinco búsquedas no son un limitador compartido de cuenta:429 y presupuesto siguen siendo necesarios.

La disponibilidad por tipo provendría de las asociaciones observadas del contacto, que tampoco garantizan cobertura completa. Puede haber cupos sin usar por indexación, cambios concurrentes o búsquedas vacías; no reconsultar para llenar la cuota. La descripción debe decir selección por creación dentro del índice y tipos observados, muestra parcial y sin garantía de última interacción global. Si se requiere recencia de todas las asociaciones, este diseño no la acredita.

## Siguiente unidad y puertas

Proponer nueva reserva exacta antes de implementar: `server/team/oauth.ts`, `server/connection.ts`, `tests/hubspot-context-search.test.ts`, `tests/hubspot-context-retry.test.ts`, `tests/hubspot-context-sampling.test.ts`, `tests/hubspot-context-dates.test.ts`, `tests/hubspot-context-partial.test.ts` y un informe nuevo. Revisar otros tests que dependan de rutas antes de añadirlos con un encargo nuevo; no editar fuera de esa reserva.

La allowlist actual solo permite search contacts/companies/deals/tasks. Añadir únicamente POST de las otras cuatro actividades en2026-09 si esa es la versión elegida; conservar rutas v3 anteriores y rechazar create/update/batch de escritura, host ajeno y redirecciones. La ficha actual usa GET v3 y no se migra implícitamente. Conservar identidad portal/modo/verified_at antes de cada intento y al final, autorización de captura al inicio/final, normalización de fechas y límites de la generación temporal actual.

Pruebas causales: un ID viejo primero en asociaciones no desplaza el resultado reciente del filtro; cuerpo exacto contact/orden/cupo/propiedades; cinco tipos con máximo8objetos/14intentos propuestos; campos/IDs duplicados o respuesta malformada; índice vacío sin declarar historial vacío; cambios de conexión y cancelación durante POST/JSON/retry;403 sin ampliar scopes;429 sin nuevo presupuesto; rutas de escritura rechazadas. Prueba de API personal y visibilidad real de contenido quedan separadas, bajo autorización vigente cuando exista conexión. No se declaran cerradas por mocks.

## Método y límites de esta comprobación

El índice público [llms.txt](https://developers.hubspot.com/docs/llms.txt) enlaza JSON bajo /docs/specs; los diez enlaces concretos de estos cinco tipos en v3/2026-09 devolvieron404. No se insistió por rutas internas ni se usó el repositorio de especificaciones para uso interno. Se pasó a quince referencias HTML públicas por operación; sus listas ScopesList y la descripción por defecto resolvieron el hueco. No se ejecutó el código descargado ni se copiaron especificaciones completas al repositorio. El contenido público puede cambiar; las referencias son evidencia de esta fecha, no un snapshot inmutable del proveedor.

Solo documento y cotejo estático del código. Sin pruebas runtime nuevas por no haber cambios de aplicación. La matriz de nombres/alternativas está resuelta documentalmente; filtro combinado, contenido efectivo, indexación y cuenta real siguen sin verificación remota. Revisión independiente requerida antes de cerrar HS025 y antes de implementar la estrategia.
