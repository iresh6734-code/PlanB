# Revisión independiente CODEX-HS-010

29/10/2026, Europe/Madrid. Revisor Codex review_h2, distinto del autor. **Dictamen final: aceptar tras corrección del hallazgo, retest independiente8/8 y cotejo de hashes vigentes.** Solo informe reservado, sin fuentes/tests del autor editados o proveedor real. Coordinador conserva memoria/panel reservados.

## Hallazgo

P2: SymbolnotFound evita confundir actividad200null con404, pero ownerResult200null se convierte en ownernull y devuelve una ficha válida sin declarar omisión. Eso oculta un fallo de respuesta que el alcance exige rechazar; solo404 debe tolerarse. El testnulloriginal cubre actividad, no propietario.

Reproducido independientemente porstdin con PGlite separado y transporte sintético/redbloqueada: contacto devuelve owner7; GETowner devuelve Response.json(null). Resultado observado returnedtrue, ownernull, ownerPermissiontrue, omissionDeclaredfalse. No se modificó fuente para reproducir. Se comunicó para validar respuestaJSONobjeto noNull/noArray y cubrir los tres puntos contacto/actividad/owner; El helper final exige objeto noNull/noArray tras parsearJSON en los tresGET; si falla lanza AppError502 seguro. El sentinel exclusivo404 permanece separado.

## Inspección restante

Solo getoptionaltrue ystatus404 devuelve sentinel; contacto usa get obligatorio. 401,403,429y5xx siguen lanzando error sanitizado, sin leer texto remoto. Red/JSONsintácticamenteinválido no son capturados como404. Detalles omitidos no se rellenan con más asociaciones ni generan reintentos, por lo que el presupuesto sigue siendo8 intentosdedetalle/2portipo yownerfuera. ownerPermission describe scopes y no existencia de la persona. El contador deactividad y avisoowner distinguen vacío de omisiones.

assertCurrent sigue antes de cadaGET y al final; retirar conexión enun404 se detecta antes del siguiente detalle o al cierre delowner. La descripción conserva muestra parcial y sinpromesa de recencia. H5 global, paginación, retry o tolerancia403 no forman parte de esta entrega.

Retest del hallazgo completado y presentación/hashes finales cotejados. La suite49/49 ytypecheck correctos son evidencia del autor, no repetida por el revisor. SinQAvisual/APIreal, sinfuentes aClaude o acceso de cuentas.


## Retest de la corrección

Ejecutado por este revisor:

    node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-context-partial.test.ts

**8/8 correctas** sobre versión corregida. El caso nuevo recorre contact/actividad/owner con200null/array/número/string y rechaza los12 casos con502; los404opcionales siguen devolviendo resultado parcial declarado y no causan más tráfico. Errores sintácticosJSON ytransporte siguen fallando. No se exige un esquema remoto completo: la guarda valida que sea un objeto; no acredita validación exhaustiva de cada campoHubSpot. La matriz49/49 ytypecheck final constan en el informe del autor, con límites/atribuciones correctos.


## Versiones aceptadas

- server/team/oauth.ts: 3d5f3f54b594edb9214e2fd7a8a20e4fbc378af5888ea190698b12774d4b7ed0
- tests/hubspot-context-partial.test.ts: 2c3782efcdc919f60d665ed46a045e2878627be643264c5e7086898c3bd44819
- coordination/reports/CODEX-HS-010.md: 9e143a6897c1bb373554914040b3c7c4d68eb3799a14b9c76bd34a014fcda073

Los tres hashes coinciden con la presentación y fuentes/pruebas son las del retest independiente. Sin problemas materiales restantes en este alcance estrecho. El plazo acumulado de GET/cuerpoJSON yreintentos siguen pendientes separados; no se considera H5 global cerrado. CODEX-HS-010 aceptada por el revisor distinto del autor. Este propio informe se presenta para revisión del coordinador sin autoaceptarlo; el coordinador actualiza contexto/panel que mantiene reservados.
