# H4 · Selección y fechas de actividades HubSpot

CODEX-HS-023 · Codex · 29/10/2026, Europe/Madrid. Diseño local basado en código y documentación pública; sin llamadas autenticadas, fuentes enviadas a Claude o cambios de permisos. No implementa ni acredita recencia global.

## Hallazgo y decisión

`TeamOAuth.context` elige hasta dos asociaciones por tipo en dos vueltas, ocho detalles en total, y después ordena sus `hs_timestamp` como texto. El primer límite es de selección: ordenar ocho registros no recupera uno reciente que nunca se leyó. El segundo es temporal: cadenas con offsets o milisegundos Unix no tienen un orden lexicográfico cronológico. Además, una tarea puede tener vencimiento futuro: mezclarlo sin etiqueta con llamadas induce a interpretar una acción pendiente como una interacción ya ocurrida.

Se conserva la muestra diversa y su aviso explícito de cobertura parcial. La siguiente entrega corrige únicamente la interpretación y el orden de las fechas de esa muestra, sin nuevas rutas, propiedades, permisos o lecturas. La selección remota reciente requiere otra entrega con las puertas de contrato indicadas abajo.

## Contratos primarios consultados

| Tipo | Propiedad actual y significado documentado | Lectura actual |
| --- | --- | --- |
| Nota | `hs_timestamp`: creación de la nota; UTC o Unix en milisegundos. | `GET /crm/v3/objects/notes/{id}` |
| Tarea | `hs_timestamp`: vencimiento, no creación ni ejecución. | `GET /crm/v3/objects/tasks/{id}` |
| Reunión | `hs_timestamp`: momento de reunión; puede tomar `hs_meeting_start_time`. | `GET /crm/v3/objects/meetings/{id}` |
| Llamada | `hs_timestamp`: creación indicada en la guía de llamada. | `GET /crm/v3/objects/calls/{id}` |
| Correo CRM | `hs_timestamp`: creación indicada en la guía de correo. | `GET /crm/v3/objects/emails/{id}` |

Fuentes de cada fila: [notas](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/notes/guide), [tareas](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/tasks/guide), [reuniones](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/meetings/guide), [llamadas](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/calls/guide), [correos](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/emails/guide). «Creación» del registro CRM no prueba envío, recepción efectiva o realización de la actividad.

La guía actual de búsqueda incluye los cinco tipos y el filtro genérico `associations.contact`, un único criterio de orden, páginas de hasta 200, tope de 10.000 resultados y cinco peticiones por segundo/cuenta; advierte demora de indexación y exclusión de archivados. Esto propone una vía, pero no acredita que la combinación concreta filtro por contacto + orden elegida funcione para cada actividad con nuestros permisos. [Guía oficial de búsqueda](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm).

La guía de asociaciones ofrece GET y lectura batch, pero no establece orden temporal de los IDs. Inferencia de diseño: no basar la recencia en el orden recibido. La guía consultada no basta para fijar el contrato de cursor y límite de cada endpoint. [Asociaciones](https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associate-records/guide).

## Dos estrategias de selección

**A. Enumerar asociaciones y leer metadatos.** GET paginado de asociaciones de contacto a cada tipo, seguido de lectura de IDs y fecha; seleccionar y traer cuerpos solo para los elegidos. Mantiene lectura explícitamente ligada al contacto y permite distinguir cobertura completa de truncada. Exige recorrer todo el conjunto candidato para demostrar recencia global. Si un límite de páginas, candidatos o tiempo impide acabar, solo garantiza orden del subconjunto leído. No permite prometer a la vez cobertura ilimitada y presupuesto fijo. No implementarla escondiendo cientos de detalles bajo el límite de ocho cuerpos.

**B. Buscar por contacto y ordenar en servidor.** Candidata preferida tras confirmar contratos: una búsqueda por tipo, filtro de asociación al contacto exacto, dos candidatos por tipo y fecha descendente; repartir ocho detalles como ahora. Evita leer todos los cuerpos. Contrapartidas: indexación eventual, cinco búsquedas nuevas, throttling compartido y ausencia de snapshot consistente. La recencia sería la del índice y del criterio elegido, sin promesa de historial completo o visibilidad inmediata. Si el proveedor rechaza un filtro o falta permiso, no buscar globalmente ni ampliar permisos para sortearlo.

Para «creados recientemente», verificar `hs_createdate` en cada tipo. Para agenda, usar el vencimiento de tareas separado de hechos ocurridos. Para «última modificación», verificar `hs_lastmodifieddate` y etiquetarlo así. Ninguno de estos nombres debe convertirse sin validación en «última interacción».

## Puertas previas a implementar B

- Rutas candidatas documentadas en versión actual: `POST /crm/objects/2026-09/{notes|tasks|meetings|calls|emails}/search`. No migrar implícitamente las lecturas v3 existentes. Comprobar referencia del endpoint, combinación de filtro/orden, propiedades y respuesta por cada tipo; no trasladar sin prueba el ejemplo de tickets.
- `readonlyFetch` solo admite hoy POST search de contacts/companies/deals/tasks en sus versiones enumeradas. Los otros cuatro tipos necesitan una ampliación exacta revisada y pruebas negativas; no un comodín. Hay que verificar además la variante de tasks antes de reutilizarla.
- **Scopes pendientes de corroboración por endpoint/versión.** El código pide `oauth`, `crm.objects.{contacts,companies,deals}.read`, `crm.schemas.{contacts,companies,deals}.read` y opcional `crm.objects.owners.read`; esto describe la configuración, no acredita todos los accesos de actividad. Las referencias consultadas muestran «Required Scopes» sin valores legibles en su extracción. No inventar `crm.objects.notes.read` ni deducir suficiencia de contacts.read. Obtener la matriz oficial exacta antes de activar búsqueda.
- El anuncio histórico `sales-email-read` se refiere al contenido de Engagements API: no basta para trasladarlo automáticamente al endpoint CRM/versionado. No activar correo, Gmail o nuevas autorizaciones a partir de esa inferencia. [Anuncio oficial de alcance](https://developers.hubspot.com/changelog/announcement-new-scope-required-to-get-the-content-of-email-engagements).
- Presupuesto actual: diez lecturas lógicas (contacto + ocho detalles + propietario), hasta veinte GET físicos con el único retry429, 12s por lectura y 30s global tras obtener acceso. B añadiría hasta cinco búsquedas: quince operaciones lógicas / treinta intentos si cada POST tuviera un retry propio. **No cabe en el máximo actual** sin un presupuesto nuevo explícito; el límite 30s debe conservarse y el tráfico compartido requiere diseño. Si se reusan resultados completos de búsqueda, demostrar reducción y cobertura de propiedades antes de eliminar lecturas.
- Invariantes: comprobar tenant/portal/generación antes de cada intento y al final; autorización de captura inicial/final; no sobrescribir credenciales; 404 solo opcional, otros errores fatales salvo retry acotado; descripción de cobertura/indexación visible.

## Siguiente unidad ejecutable sin esas puertas

Reservar `server/team/oauth.ts`, un nuevo `server/team/hubspot-activity-time.ts`, `tests/hubspot-context-dates.test.ts` y su informe exacto. Helper puro: aceptar UTC/offset ISO explícito y Unix milisegundos; rechazar fecha inválida, tipo inesperado y hora sin zona; normalizar a ISO UTC y ordenar por instante, desconocidos al final y empates estables. Mantener forma JSON (`at: string | null`), selección, cuotas, rutas y todas las guardas actuales. No declarar que la normalización soluciona H4. La etiqueta de vencimiento/zona visible requiere entrega UI posterior sobre `src/HubspotContext.tsx` con revisión de interfaz, sin tocar los archivos reservados por CLAUDE-FIX-023.

Regresiones adversariales: offsets que invierten el orden textual; formatos ISO y Unix equivalentes; fecha imposible/no finita/fuera de rango; ausencia de zona; nulos; empate estable; tarea futura no interpretada como creación; actividad reciente fuera de los IDs seleccionados; cinco tipos saturados; 404 tras 429; reconexión durante espera; presupuesto físico y deadline intactos. Repetir las 69 pruebas afectadas de HS022 y typecheck al integrar. Las pruebas de fechas deben fallar contra el código anterior.

## Estado de esta entrega

Solo documento. Comprobados código/rutas actuales y documentación pública; no se vuelven a ejecutar pruebas de runtime sin cambio. Matriz de scopes, filtro por tipo, paginación exhaustiva y prueba remota siguen pendientes. Revisión independiente de este documento requerida antes de cerrar HS023. La siguiente corrección temporal es ejecutable localmente; la búsqueda reciente todavía no lo es.
