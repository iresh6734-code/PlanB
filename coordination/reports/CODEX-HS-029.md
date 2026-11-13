# HS029 · Actividades seleccionadas por creación CRM

1/11/2026, 11:30:27, Europe/Madrid. Autor Codex. Fuente para revisión independiente, sin instalación o acceso real aHubSpot. HS025está done y su hash01eb08d4 fue cotejado antes de ejecutar: se cumple la puerta documental, no una prueba autenticada del filtro.

## Problema y comportamiento nuevo

Ordenar fechas de ocho actividades elegidas por los primerosIDs de asociaciones no recuperaba una actividad nueva que quedaba fuera de esosIDs. Ahora el contacto determina qué tipos están observados y los cupos se fijan antes de buscar: primera plaza por tipo, segunda vuelta hasta ocho, máximo dos/tipo. No se intenta completar huecos después de búsquedas vacías o parciales.

Se sustituye cadaGETindividual deactividad por un POSTsearch2026-09por tipo, con filtro associations.contactEQalIDexacto, sorts:['-hs_createdate'], propiedades necesarias completas y limit igual al cupo. Sin queryglobal, cursor, after, segunda página, GETposteriores o relleno. Un GETcontacto+cincoPOSTsearch+GETowner es máximo7operacioneslógicas/14intentos físicos porlectura tras access. Contadores explícitos, un único retry429poroperación con mismosbytes/signal/plazos;12s poroperación y30s globaltrasaccess, incluyendoDB/espera/JSON. OAuthaccess/renovación sigue aparte como antes.

La allowlist admite únicamente cuatroPOSTsearchnuevos (notes/meetings/calls/emails) en2026-09; tasks yaestaba. No se añadePOSTv3para esos cuatro, create/update/batch de escritura, host ajeno o redirecciones. ScopesOAuth ypermisos deusuario sin cambios. La ruta sigue comprobando pertenencia/captura antes y después de la lectura. La identidadportal/tipo/verifiedAt se revalida antes de cada intento y tras respuesta/JSON; renovación delmismocontexto sigue permitida. Nunca se mantiene una transacción durante red.

Validación:contactoexacto ymapas válidos; IDsdecontacto numéricos de hasta100caracteres; IDsdeactividades opacos no vacíos,alfa-numéricos/guion/guionbajo hasta100. Se rechazan arraysmalformados/excesodecupo/IDsduplicados dentrodeltipo/objetosarchivados/mapas inválidos/creación ausente o imposible/orden de creación contradictorio. IDigual entre tipos sigue válido. total si viene debe ser entero seguro y al menos los resultados recibidos; no se usa como cobertura global. Timestamp deactividad sigue normalización anterior (incluye desconocido), independiente de hs_createdate; una tarea futura sigue vencimiento, no evento ocurrido. Contenido de cada tipo se toma solo de sus campos solicitados: no se rellena Nota con un campo de correo no solicitado.

Search404ahora es error fatal del endpoint, no «actividad eliminada» omitida. Solo propietario404conserva omisión explícita. El índice vacío se describe como muestra parcial con demora/archivados/campos indisponibles; no ausencia dehistorial. Se conserva orden visible porfecha deactividad/vencimiento, sin atribuirle recencia global o última interacción. DTOmantiene forma paraelcliente.

## Contrato público contrastado

Se releyóHS025aceptado y referencias públicas actualesel1/11/2026. La composición filtro+orden es una inferencia documentada de diseño; no se probó con un token/portal real. La guía genérica muestra otro formato de sort en un ejemplo, así que se sigue el string[] y prefijo negativo de las referencias específicas.

- [BúsquedaCRM: asociaciones, propiedades de creación, indexación y límites](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm).
- Referencias2026-09: [notas](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/notes/search/search-notes), [tareas](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/tasks/search/search-tasks), [reuniones](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/meetings/search/search-meetings), [llamadas](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/calls/search/search-calls), [correos](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/emails/search/search-emails). No fuentes internas/especificaciones privadas o contenido externo ejecutado.

## Pruebas propias

**Corte final:** D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/hs029-cc98fbd1-c481-4821-80fb-153890a254a6/final-14fbed78-d169-43d2-9865-7515cc5fc717 contiene proyección de integración358fuentes: candidata357congelada previa más rutas exactasHS029. Todos los archivos de producto no propios se cotejaron iguales al checkout al crearla; las pruebas en curso deQA079/081/091 se dejan fuera y se conservan sus versiones previas. No es una candidata de release completa ni verificación del árbol actual de borradores de pruebas. inputs.json registra hash/origen de cada archivo. Ningún archivo de esa proyección cambió durante las verificaciones; hashes propios finales coinciden con lo presentado.

- **153/153** en18archivos,0fail/skip/TODO.13nuevas y regresiones de fechas/cupos/identidad/429/deadlines/JSON/cancelación/OAuthcomercial/captura/producción/roles/visor/UI decontexto. PGlite nuevo yfetchsimulado, sin tráfico real. Log evidence/backend-and-context.log.
- **Typecheck correcto** sobre la proyección358 deproductoactual+pruebascongeladas/propias; no se afirma typecheckde borradoresClaudeactuales. Log typecheck.log.
- **Dosbundles** de server/main.ts yserver/team/main.ts correctos en runtime nuevo; son los entrypoints afectados porconnection/OAuth. Hashes en evidence/final.json; no Vite/UIbundle nuevo ni losotroscuatroentrypoints recompilados. Sin cambio de frontend/CSS.
- **Baselinecuatrocontroles deversión:**0pass/4fail al ejecutar la prueba nueva contra TeamOAuth/connection de42c5f15c. Recencia devuelve1000/1001en vezde1099/1098;0POSTen lugar de1;404individual omitido en vezde error deSearch; nueva ruta delectura aún denegada. Llegan a aserciones de conducta/protocolo, sin fallo de importación. Los dosúltimos son cambios deliberados decontrato, no cuatro defectos antiguos independientes. Log baseline-causal.log.
-13nuevas cubren cuotas2/2/2/1/1, sparse/no-refill/pagingmalicioso no seguido,20formasmalformadas, IDs entre tipos, timestamp distinto de creación, asociaciones inválidas,14intentos, desconexión enfetch/JSON, cancelación queignoraabort, allowlistpositiva/negativa, IDacotado yno contenido de campos ajenos. Los testsantiguos se actualizan en rutas/formaPOST/presupuesto más estricto/semántica404documentada; no se retiran condiciones de permisos/reconexión/cancelación o pruebas dedatos.
- Dos iteraciones previas31/31 y56/56verdes antes del último límiteID/camposportipo; se conserva su evidencia y el corte final153las sustituye. No se suman repeticiones comopruebas únicas. Logs en run-48dcee5f... yrun-46b91591... bajohs029. diffcheckcorrecto.

## Límites y siguiente

H4selecciónqueda implementada en fuente, no acreditada contra unportal real. Indexación eventual, asociaciones observadas, cupos limitados y ausencia de snapshotremoto implican muestra parcial; nohistorialglobal, correos efectivamente enviados o actividades realizadas probadas.403noamplía permisos ni consulta sinfiltro. Sin nuevas autorizaciones, cuentas, secretos, envío de fuentes aCLIClaude, instalaciones4331/4334, equipooriginal, dependencias, build/dist raíz, autostart, commit/push o despliegue. App094conserva sus23artefactos anteriores aHS029.

Pendiente auditoría independienteHS096sobre hashespresentados; no autoaceptación. QA086R2aceptada como informe separadamente, noapruebaestaunidad. QA079/081/091intactas. AUTH_PARENT072yrestantesrevisiones conservan sus puertas.

## Hashes finales

- server/team/oauth.ts: `cd64d685b36da599f4f12f7f2ec399ff93d136f9a7c3ba9016853bd17ada8c5d`
- server/connection.ts: `371ac9cee0d4fa848dfc956ff7d854ec89d73f2b0bd86ae1921a49cde48ed257`
- tests/hubspot-context-search.test.ts: `966c4232c870be55a5992e524f3cbdaafae37a5eb80e0826aa72478942c79b5c`
- tests/hubspot-context-retry.test.ts: `3dba73b2dc564dc8872ebadfab8e77d1980244f5d4bbe4df25de9e01c6eb8d95`
- tests/hubspot-context-sampling.test.ts: `7cb002f89a42f3383547a22d0235f4433be9a811969b96db52ff56641e9e7ccc`
- tests/hubspot-context-dates.test.ts: `fb803a1572f331fd1e581639a49a0cad25753f380f7eb312c7dd343f25df734b`
- tests/hubspot-context-partial.test.ts: `2b8044bd1e033c1a61311988b256600079c7fef27436de61794cd00dc9a761a4`
- tests/hubspot-context-budget.test.ts: `3771dbdce8129dc723aec81e6af0b257ea9c430e16ef15b24b623ba74e7c7f8d`
- tests/hubspot-context-isolation.test.ts: `7060b30e155b36cdf7e17046b78f0bf07d4a9437ef6ca33bba3b721a5f2c63c7`
- tests/hubspot-oauth-refresh.test.ts: `295c7f7042798eb9045f7be1a1a8d2715e1bd10778dfe2b7b1e0018584cee459`
- tests/commercial.test.ts: `d52257e8df8cd18f1c874ba51baddd676e46f343cbdb9c4d6b8c0e9abe1305db`

El hash del informe lo registra submit.
