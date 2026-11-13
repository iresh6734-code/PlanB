# Revisión independiente CODEX-HS-023

29/10/2026, Europe/Madrid. Revisor Codex review_h2, distinto del autor. **Aceptar el documento de diseño**, sin declarar H4 implementada o recencia global acreditada. Se cotejó el hash presentado y se consultaron código actual y fuentes públicas primarias. No se modifica código ni se ejecutan servicios autenticados, cuentas, credenciales o envío de fuentes aClaude. Contexto/panel corresponden al coordinador en su reserva vigente.

## Correspondencia con código y presupuesto

El plan describe la selección actual por dosvueltas/8detalles/2portipo y el orden posterior textual, junto a la diferencia entre ordenar leídos y elegir los recientes. readonlyFetch permitePOSTsearch solo de los cuatro tipos enumerados; añadir otras actividades exige cambio exacto, no comodín. Scopes del código se presentan como configuración, no prueba de suficiencia. La siguiente entrega temporal no cambia rutas o lecturas y se distingue de la búsqueda remota futura.

El presupuesto actual es diezlecturaslógicas y hasta veinteGETfísicos con el retry429. Cinco búsquedas adicionales elevarían quinceoperaciones/treintaintentos si tuvieran retry propio; el plan obliga a redefinir presupuesto antesdeactivarlas, manteniendo30s trasaccess. La estrategia de enumeración exhaustiva no promete cobertura ilimitada con tiempo fijo. La estrategia preferidaB queda bloqueada por contratos/scopes/filtro; no es permiso de implementación o prueba remota.

La palabra generación en invariantes futuras se interpreta como requisito de diseño, no como generación única ya existente: el códigoactual compara portal/tipo/verified_at/status y conserva su límite temporalABA. Autorización/presencia inicial yfinal de captura siguen en la ruta actual. No se atribuye aestaunidad corregir ese límite.

## Comprobación de fuentes primarias

Se abrieron las cinco guías de actividad citadas. La tabla del plan coincide: timestampdenota creación de nota/llamada/correoCRM, vencimiento de tarea y momento de reunión, con fallbackdocumentado de reunión alinicio. No prueba envío/recepciónreal o ejecución de laactividad. Fuentes consultadas:

- [Notas](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/notes/guide).
- [Tareas](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/tasks/guide).
- [Reuniones](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/meetings/guide).
- [Llamadas](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/calls/guide).
- [Correos](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/emails/guide).

La [guíaSearch](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm) lista los cinco endpoints versionados y las propiedades creadas/modificadas. Documenta filtrogenérico de asociación, una regla deorden, hasta200porpágina/10000porconsulta y5peticionesporsegundocuenta, conindexacióndiferida yarchivados excluidos. Eso respalda una vía candidata, no garantiza la combinación porcadaactividad con lospermisos actuales. Se mantienen las puertas explícitas para corroborarla.

La [guíaAsociaciones](https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associate-records/guide) describeGET/batchread deIDs y etiquetas; no ofrece aquí una garantía de orden porfecha. No asumir recencia del orden recibido es una inferencia prudente deldiseño. Cursor/límite concretos deben verificarse por endpoint.

El enlace directo al [anunciohistórico deemailengagements](https://developers.hubspot.com/changelog/announcement-new-scope-required-to-get-the-content-of-email-engagements) devolvió404 enopen en esta revisión; la búsqueda pública del mismo dominio recuperó su contenido de24/10/2019 y el alcance sales-email-read paraEngagements. Se registra esa limitación de acceso. Esa evidencia histórica no se traslada a una matrizactual de scopesCRM. No se considera dicha matriz comprobada por este revisor.

## Dictamen y límites

No hay errores materiales decontrato/presupuesto/atribución en elplan. Su aceptación autoriza el diseño y siguienteunidad local acotada, no búsquedasautenticadas, ampliación descopes/POST, publicación ovalidaciónAPI. No se ejecutaron pruebasruntime sin cambios decódigo; el requisito de repetir69afectadas/typecheck corresponde a integración futura. Fechas de tareas y etiquetaUI posterior siguen separadas; normalizar yordenar la muestra no cerraráH4.

Hash vigente:

- coordination/plans/HUBSPOT-ACTIVITY-RECENCY.md: bb5562cec0e228d4f90df2c08c5a7ef7686c15fd3cf3ac8a28e25ddb49834d7a

Coincide con la presentación. CODEX-HS-023 aceptada por revisor distinto del autor. Este propio informe se presenta para revisión del coordinador sin autoaceptarlo.
