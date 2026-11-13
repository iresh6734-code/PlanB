# Revisión independiente de CODEX-HS-025

29/10/2026, Europe/Madrid. Revisor Codex distinto del autor. Alcance: únicamente el contrato documental de búsqueda de actividades; sin cambios de aplicación.

## Dictamen

Favorable, sin hallazgos materiales dentro de este alcance. La matriz resuelve los nombres y alternativas de scopes mediante referencias públicas específicas. Conserva explícitamente las puertas pendientes para filtro combinado, permisos efectivos, contenido, indexación y cuenta real. No declara implementada ni terminada H4.

## Evidencia independiente

Antes de la interrupción por límite de uso de esta misma revisión se comprobaron las quince referencias HTML oficiales: GET v3, Search v3 y Search 2026-09 para notes, tasks, meetings, calls y emails. Las quince devolvieron HTTP 200 y contenían la ruta de operación correspondiente. Se inspeccionó el texto público HTML/MDX, sin ejecutar JavaScript remoto ni guardar HTML en el repositorio.

Las llamadas reales a ScopesList contienen crm.objects.contacts.read para notes/tasks/meetings/calls. Las tres referencias de emails contienen crm.objects.contacts.read y sales-email-read. La descripción predeterminada del componente dice “This API requires one of the following scopes:” y las llamadas examinadas no la sustituyen: son alternativas, no una obligación conjunta. Esto respalda el alcance de entrada documentado; no acredita que todos los campos de contenido sean visibles con cualquier token o cuenta.

Se contrastaron, entre otras, las referencias de [GET email v3](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/emails/get-email), [Search email 2026-09](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/emails/search/search-emails), [Search notes 2026-09](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/notes/search/search-notes) y la [guía Search](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm). La referencia de notes 2026 confirma sorts como string[] y el prefijo descendente -. La guía respalda associations.contact, EQ y propiedades predeterminadas, sin probar remotamente su composición para cada tipo.

El primer intento de fetch público en el entorno restringido falló ENOTFOUND. La repetición autorizada, limitada a HTML público oficial, permitió verificar las quince referencias. Esa evidencia corresponde a la fase anterior de esta revisión; al reanudar no se repitieron las quince descargas. Los diez JSON /docs/specs con 404 son evidencia atribuida al autor y no se presentan como comprobados por este revisor.

## Contraste con el código y el presupuesto

Al reanudar se cotejaron el documento y server/connection.ts y server/team/oauth.ts actuales. La allowlist existente admite Search solo para contacts/companies/deals/tasks y no implementa aún la ampliación propuesta. El plan exige una reserva posterior y rutas exactas para las otras cuatro actividades, preservando restricciones de escritura y origen.

El diseño reemplaza los GET de detalles por hasta cinco Search con propiedades y cupos fijados antes de pedir resultados; no añade búsquedas encima de ocho GET. Un contacto, cinco búsquedas y un propietario suman siete operaciones lógicas y como máximo catorce intentos con un único retry 429, dentro de los topes actuales de diez/veinte. Máximo ocho detalles y dos por tipo, sin páginas adicionales ni relleno. La espera y el JSON deben seguir dentro de los 12 s por operación y 30 s globales tras access. Se preservan comprobación de identidad antes de cada intento y al final, autorización de captura y normalización de fechas.

Es correcto distinguir Search 404 como fallo del endpoint de un GET opcional 404 de objeto eliminado. La propuesta no amplía scopes ante 403 ni usa GET adicionales para completar campos. La asociación observada, la creación CRM, el vencimiento de tareas y la interacción real mantienen significados distintos; índice vacío y empates no acreditan ausencia de historial ni recencia global.

## Límites y versión

Sin pruebas runtime nuevas: la entrega cambia solo documentación. No hubo API autenticada, datos de clientes, secretos, ventanas, despliegue ni nuevas fuentes enviadas a Claude. No se atribuye una prueba remota o de permisos efectivos a estos cotejos documentales. Las referencias públicas pueden cambiar después de esta fecha.

Hash vigente de coordination/plans/HUBSPOT-ACTIVITY-SEARCH-CONTRACT.md: 01eb08d477e38ac40ad70e3601503d563c2b5e62803b02eb7b7e3efab0ae661c.

La versión coincide con la entrega presentada y se acepta CODEX-HS-025 como revisor distinto del autor. Este informe queda presentado para revisión del coordinador, sin autoaceptación. La actualización de memoria y panel corresponde a su encargo reservado.
