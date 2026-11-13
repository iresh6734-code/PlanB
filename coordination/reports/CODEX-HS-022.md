# CODEX-HS-022 · Recuperar una limitación 429 sin prolongar la lectura

29/10/2026, Europe/Madrid. Autor Codex; revisión independiente de otro agente Codex. Se retomaron las entregas de Claude y el cierre de HS011 conservando su atribución. Fuente reservada antes de editar; sin nuevas fuentes enviadas a Anthropic.

## Comportamiento

Una lectura lógica puede realizar como máximo dos GET, y solo el 429 del primer intento autoriza repetir. Se interpreta Retry-After como segundos enteros no negativos o fecha HTTP que comienza por día de semana; el segundo intento no ocurre antes de ese intervalo. Ante cabecera ausente o malformada se espera un segundo. Una espera mayor de cinco segundos o no finita se rechaza con mensaje local para volver más tarde: no se recorta para reintentar anticipadamente.

Es una política local conservadora para esta ficha, no una afirmación de que todos los límites de HubSpot tengan el mismo reinicio. El GET conserva su temporizador original, incluyendo espera, segundo intento y JSON; el plazo global de la fase tampoco se reinicia. Los máximos siguen siendo 12 segundos por lectura lógica y 30 segundos tras obtener la conexión. Cancelación o plazo agotado limpian la espera y evitan el segundo intento. Cada intento vuelve a comprobar la identidad en BD, usa el mismo token capturado, GET y redirect:error.

Segundo429, 401,403,404 principal,5xx,red o respuesta malformada rechazan sin más intentos. El404 opcional de una actividad o propietario continúa produciendo una omisión explicada, incluso tras el reintento. No se amplían permisos, POST, rutas o lectura capturada.

El cupo sigue siendo ocho objetos de actividad y dos por tipo. Al añadir un reintento, el máximo de peticiones físicas pasa a veinte: dos para contacto, dos por cada uno de ocho detalles y dos para propietario autorizado. No se sigue afirmando un máximo absoluto de diez GET físicos.

## Revisión de recursos

El revisor señaló que la respuesta429 descartada quedaba sin consumir/cancelar durante la espera, también ante Retry-After largo. Se añadió cancelación best-effort de su cuerpo, sin leer texto remoto. Un rechazo o excepción al cancelar no oculta la política, y una cancelación que nunca termina no retiene el flujo. Sus rechazos tardíos se consumen. Se comprueba también la respuesta429 final.

## Verificación

**69/69 pruebas afectadas y typecheck correctos sobre la versión final.** Doce pruebas nuevas usan PGlite separado, transporte sintético, reloj virtual y red externa bloqueada. El revisor ejecutó diez focales iniciales correctas y después los dos casos nuevos de limpieza/tope máximo correctos; no se atribuye al revisor la batería69 o el typecheck del autor.

Casos: segundos y fecha HTTP/pasada, fallback malformado sin parsear números como fechas, espera larga no recortada,429repetido, plazo global/individual durante espera, JSON del segundo intento sin tiempo nuevo, cancelación/listeners, desconexión durante espera,404opcional y otros errores sin retry, cancelación de cuerpo rechazada o pendiente, y máximo20GET con cinco tipos representados.

Comandos:

    node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-context-retry.test.ts tests/hubspot-context-budget.test.ts tests/hubspot-context-partial.test.ts tests/hubspot-context-sampling.test.ts tests/hubspot-context-isolation.test.ts tests/hubspot-oauth-refresh.test.ts tests/commercial.test.ts
    node node_modules/typescript/bin/tsc --noEmit

## Referencias y límites

Consultadas fuentes públicas primarias: [errores HubSpot](https://developers.hubspot.com/docs/api-reference/error-handling) y [RFC9110 Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after). La sección de reintentos de webhooks entrantes no se interpreta como contrato de esta petición CRM saliente. No se llamó a la API real del portal personal.

Date.parse tras comprobar prefijo de día no es un parser HTTP exhaustivo. No hay jitter, coordinación entre clientes o recuperación de cuota diaria; un solo reintento puede volver a fallar. Recencia real de actividad y paginación siguen pendientes. El plazo comienza después de access/refresh y JS no interrumpe CPU síncrona o SQL/transportes no cooperativos; termina la espera local y descarta resultados.

Sin piloto reiniciado, credenciales, cuentas externas, cambios en sus datos, despliegue, commit o publicación. Las pruebas y aceptaciones de otras entregas Claude se conservan como históricas según sus informes, sin reejecutarlas o apropiarse de ellas.

## Hashes finales

- server/team/oauth.ts: 28d6d166e85e78850cc7bde3a22b3c20a0e891c4e4ff60f7655eefea06337c20

- tests/hubspot-context-retry.test.ts: 19eb3bed5d83fdb9315935a145d970a4aa68df58f050ef1558994ea90dfd9009
