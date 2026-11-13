# Revisión independiente CODEX-HS-022

29/10/2026, Europe/Madrid. Revisor Codex review_h2, distinto del autor. **Dictamen final: aceptar tras limpieza429 corregida, comprobaciones independientes y cotejo de hashes vigentes.** Solo este informe reservado; sin fuentes o tests del autor editados, navegador/proveedores/cuentas/secretos o nuevas fuentes aClaude. Memoria/panel corresponden al coordinador.

## Política y preservación de límites

El bucle admite dos intentos por lectura lógica y solo el429 del primero abre el reintento. Segundo429 falla con error local seguro;401/403/404/5xx/red yJSONinválido no habilitan reintento. Cada intento vuelve a consultar identidad enBD y comprueba señal después de esa espera; no cambia portal/token para repetir. Owner y detalles usan el mismo helper y conservan404opcional.

Retry-After solo interpreta como segundos una secuencia entera no negativa; cabecera ausente/malformada usa1s. La puertaweekday para Date.parse evita tratar valoresnegativos/fraccionarios como fechasaccidentales; fechaHTTP futura espera hasta suinstante ypasada produce0. Esperas superiores5s o nofinitas se rechazan en lugar derecortarlas para reintentarantes. La validación deHTTPdate usa Date.parse traselprefijoweekday, no un parserHTTPexhaustivo.

El bounded se crea una sola vez para ambosintentos, pausa ycuerpoJSON; conserva12s porlecturalógica y30sglobal máximos, reducciones internas vigentes. pause limpia timer/listener en éxito/aborto y rechaza conrazónsegura delbudget. Traspausa vuelve al assertCurrent y no comienzaGETsi agotóplazo odesconectó. Datos tardíos deJSON siguen descartados.

Se mantienen8objetosdedetalle/2portipo, pero las peticiones físicas pueden duplicarse: hasta2 porcontacto+8detalles+owner, veinteGETmáximo. No se debe seguir describiendo como tope diezGET. El scope temporal empieza despuésdeaccessOAuth, límite preexistente ydeclarado.

## Evidencia independiente

Ejecutado por este revisor:

    node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-context-retry.test.ts

**10/10 correctas**, PGlite separado ytransporte sintético/redbloqueada. Relojvirtual controla segundos/fechas/fallback, no adelantar esperalarga,429repetido, límites originalestotal/individual, JSONsegundo intento, cancelación/limpieza, cambioportal y404opcional. Las fechas seprueban con Date virtual en cada vuelta yreset explícito. No sehan ejecutado suiteafectada otypecheck por esterevisor.

## Observación de limpieza

PrimeraResponse429 observada no consume/cancela response.body antes deespera o rechazo porRetry-After largo. Se recomienda descarte best-effort sinespera incontrolada y sinqueun error de cancelación oculte la política. No se exige leer texto remoto sensible oJSON429. Corregido en versión final observada: cancelbest-effort se invoca para toda respuesta429 antes de esperar o fallar, sinawait; captura lanzamiento síncrono yrechazo asíncrono sin ocultar política. Uncancelque no termina no bloquea retry.

## Límites

NoAPIreal, UI/QAvisual orecencia deactividad. Esperas ytimeouts JS no interrumpen CPU/eventloop bloqueado ni cancelan físicamenteBD/transporte no cooperativo. No jitter ocoordinación global de clientes ante rate-limit. Conserva errores deterministas del helper; no amplía POST/scopes, no modifica archivosajenos.


## Comprobación de las dos adiciones

El autor añadió pruebas de limpieza y máximo físico. Este revisor ejecutó ambos casos nuevos por separado con --test-name-pattern sobre el archivo real: libera el cuerpo descartado y veinte GET. **1/1 y1/1 correctos**, adicionales a los10/10 previos. El primer patrón incluía una segunda frase que no coincidía con el título real; por ello se ejecutó explícitamente el caso veinteGET después yno se atribuye al primer comando.

Limpieza cubre respuesta normal429, espera larga, cancelrechaza ycancelque no termina. El máximo físico prueba contacto+8objetos+owner con un429 por cada ruta antesdeléxito: veinteGET, dosporpath, ochoactividades ycinco tipos. El descartedelcuerpo no obtiene unpresupuesto nuevo o lector de texto remoto. La suite final69/69 ytypecheck correctos constan en el informe del autor. No se atribuyen como ejecutados por este revisor; las pruebas propias son diez iniciales y los dos casos nuevos.


## Versiones y aceptación

- server/team/oauth.ts: 28d6d166e85e78850cc7bde3a22b3c20a0e891c4e4ff60f7655eefea06337c20
- tests/hubspot-context-retry.test.ts: 19eb3bed5d83fdb9315935a145d970a4aa68df58f050ef1558994ea90dfd9009
- coordination/reports/CODEX-HS-022.md: 9ceb0f75dd49152d934845a12f7455f649fb1e0756a47445ed33b877ba7ec66e

Los tres hashes coinciden con la presentación final; la fuente ylosdoscasosnuevos corresponden a la versión revisada. El reporte conserva la política local, maxveinteGET, límites Date.parse/plazo y la atribución de cada comprobación. Las referencias públicas son del autor; no se presenta este dictamen como validación de laAPIreal. No problemas materiales restantes dentro del alcance acotado. CODEX-HS-022 aceptada por un revisor distinto del autor. Este propio informe se presenta para revisión del coordinador sin autoaceptarlo; contexto/panel siguen a cargo del coordinador en su reserva vigente.
