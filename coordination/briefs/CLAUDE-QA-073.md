# QA073 · Auditoría adversa de interfaces, activación y réplica

Trabaja en D:/AI/Plan-B-CRM-v2.1/source. Lee AGENTS.md, COORDINACION.md, CONTEXTO-PROYECTO.md y coordination/plans/REVISION-INTERFACES-071.md. Tu misión es una revisión independiente capaz de detectar aceptación incorrecta de RELATION062/LABEL063, HISTORY064, CONNECTION065, ACTIVATION066, MANUAL067, TEAM069 y AUTH070. No se busca una cifra de tests ni que todo termine verde: un fallo reproducible bien atribuido tiene más valor que una matriz que solo confirma el código actual.

**Dos sesiones distintas pueden trabajar sin solapes:** QA060 audita búsqueda/exportación/ensayo/Hoy; QA073 audita estas interfaces y contratos. Una sola sesión toma QA073. No uses subagentes ni consideres tuyas las reservas de otra sesión llamada claude. QA056 ya está done como revisión; sus bancos e informe son historia. No los edites.

## Reserva y congelación

    node tools/coordination/board.mjs brief CLAUDE-QA-073
    node tools/coordination/board.mjs claim CLAUDE-QA-073 claude

Antes de congelar cada fuente, exige su unidad en review y que todos los hashes presentados coincidan con el disco. No exijas done: estás revisando antes de aceptar. Si AUTH070 sigue working, espera su presentación para esa parte y revisa las otras fuentes ya congeladas sin inventar evidencia de la versión intermedia. Si cualquier fuente cambia, detén solo sus conclusiones y pide nueva presentación. Registra dependencias Store/Recovery/App/componentes/CSS global, no solo el módulo que te interesa.

Siete rutas nuevas exactas, con check-path antes de escribir:

1. tests/helpers/independent-interface-harness.ts
2. tests/independent-interface-contexts.test.ts
3. tests/independent-history-contracts.test.ts
4. tests/independent-activation-contracts.test.ts
5. tests/independent-replica-contracts.test.ts
6. tests/e2e/independent-interface-flows.spec.ts
7. coordination/reviews/CLAUDE-QA-073.md

No edites fuentes, tests de Codex, QA060/QA056, memoria/panel o el tablón a mano. El helper es propio y solo puede utilizarse desde tus pruebas; no refactorices el arnés de otro autor para reutilizarlo. No heredes los resultados de Codex como pruebas ejecutadas por ti.

Datos ficticios y carpetas UUID nuevas bajo tests/.tmp/qa073. Conserva evidencia acotada, sin borrados recursivos. No dependencias nuevas, proveedores, cuentas, claves reales, perfiles personales, CLI general de Claude, MCP nuevo, puertos4331/4334, equipo corporativo original, build/dist raíz, despliegue, commit/push o autoaceptación. Usa las dependencias y Chromium de caché existentes. Un trabajo pesado a la vez. Si no hay capacidad, separa el fallo del arnés del producto; no bajes las aserciones para producir verde.

## Método común: probar el contrato sin copiar su implementación

Escribe expectativas de identidad, secuencia y conteos desde fixtures pequeños y explicables antes de llamar al componente/algoritmo. No compares dos llamadas a la misma función como oráculo. Un mock con source:{} rechazado por formato no prueba la guarda de antigüedad. Un AbortError nativo tampoco demuestra que un transporte que ignore la señal sea descartado.

En tu helper controlado de hooks comprueba orden de efectos/cleanup, refs, setters funcionales y rerender; declara qué no es DOM real. Complementa los caminos importantes con navegador React real. Un resultado adverso de un hook simulado puede ser un fallo del propio arnés: reproduce o explica esa posibilidad.

Para una carrera representativa, retén la respuesta **válida** del contexto inicial, con IDs/captura/revisión legítimos. Cambia el contexto, termina una petición posterior y después libera la primera. Haz que el transporte ignore solo la señal de esa petición. Comprueba el estado actual positivo, además de la ausencia de texto viejo; observa spinner, error y reapertura. Repite con un error tardío válido. A→B→A no debe resucitar una autorización o resultado retirado.

Los acuses HTTP200 no son suficientes por sí solos: identifica qué campo confirma la operación. Separa operación confirmada de lectura local posterior fallida, y comprueba que el reintento no repite POST/PUT. Controla callbacks y handlers capturados antes del último render, no solo botones disabled en el DOM actual.

## A · Relaciones062 y nombre accesible063

Lee ReferenceSelect, su CSS propio y el consumidor en components.tsx. No es CustomerCombobox del piloto: no mezcles productos ni reservas.

- Un ID seleccionado fuera de los primeros50 debe seguir visible y conservarse al guardar. Dos fichas homónimas o IDs iguales en entidades distintas no se confunden. La etiqueta no sustituye al ID.
- Ficha seleccionada y lista tienen errores independientes: falla una, la otra se conserva; sus reintentos no limpian una selección válida. Ausencia404 no equivale a ficha válida vacía.
- Cambia entidad, valor, consulta, componente visible y contexto de captura durante peticiones. Comprueba éxito/error tardíos, desmontaje, reapertura y transporte sin cancelación.
- Respuestas de otra entidad, ID incorrecto, IDs duplicados, payload incompleto y lista fuera del contrato no deben convertirse en opciones elegibles. No permitas seleccionar una ficha de contexto retirado mediante un handler viejo.
- El nombre accesible de un campo reference debe conservar field.label exactamente. Compruébalo en Modal real con getByRole, no contando únicamente un prop aislado.
- Teclado, Escape, foco, etiquetas, opción de borrar si está admitida, límite50 explícito y objetivo44px a1440/390/320. Captura la composición completa con CSS global para detectar reglas que estrechan input/lista aunque el flujo funcional pase.

## B · Historial064: completo y tipado

Usa un historial inventado con más de100 operaciones, primeras/últimas identificables, varias operaciones sobre la misma ficha y IDs obtenidos realmente del fixture (autoincrement no se reinicia necesariamente al importar).

- Las122 operaciones de un caso representativo se alcanzan sin saltos ni duplicados por páginas20. Recorte visual no se presenta como total completo. Al reducir el filtro, una página antigua se ajusta a un rango válido.
- Compón entidad/operación/marca y todos los términos de búsqueda entre ID, campo y antes/después. Preserva el orden del historial original y no cambies los objetos al filtrar.
- Ausente, null, texto vacío,0,false, número como número y texto con dígitos son diferentes. Un update compara el estado anterior correcto; un create no inventa un registro previo.
- Valores largos con Unicode no pierden identidad o información al abrir; revisa wrapping, controles y expansión por teclado. No conviertas un preview en el valor final.
- La marca de devolución indica lo incluido en la marca, no que HubSpot lo conserve ahora ni que una simulación haya devuelto datos. Prueba límites exactamente en el watermark y después; no fabriques verificación remota.
- Consultar/buscar/paginar es local y no escribe ni hace POST. Contrasta el estado de origen antes/después con un oráculo ajeno a la función de historial.

## C · Conexión065: inspección, selección y acuse

Todos los POST con forma de proveedor deben estar interceptados; el backend del fixture sigue connection:null. No envíes credenciales a un servicio, aunque el token sea inventado. No conviertas un formulario simulado en evidencia de HubSpot real.

- Doble submit de inspección y guardado antes del render: una petición por acción. Credenciales/modo/cuenta quedan congelados mientras la operación está activa; un handler anterior no debe editar ese contexto.
- La inspección solo habilita el guardado para el portal, modo y tipo solicitados. Prueba portales distintos, STANDARD/test incompatibles, estructura incompleta y claves de campo duplicadas. No rebajes los controles positivos del schema válido.
- Volver a revisar retira los campos seleccionados y la autorización anterior. El máximo60 por entidad se mantiene incluso con un handler capturado antes de llegar al límite. No envíes campos ajenos a la inspección.
- Cerrar/desmontar y recibir una inspección válida antigua no reabre ni sustituye un diálogo nuevo. El error tardío tampoco aparece en la instancia nueva.
- saved:true seguido de refresh fallido debe informar guardada, retirar la credencial visible y ofrecer solo lecturas. saved:false/ausente no se anuncia como éxito. No exijas borrado criptográfico de strings JavaScript: no se promete.
- Inspecciona el fieldset exterior y las listas anidadas: no basta que no haya overflow horizontal si la identidad/acciones quedan en un scroll de200px inesperado.

## D · Activación066: revisión exacta, bloqueos y atomicidad

Usa API protegida con Store en memoria y capturas/spec inventadas. Escribe el oráculo desde qué objetivo está activo/candidato y qué debe conservarse tras rechazo, no desde activationReview().revision comparada consigo misma.

- GET distingue objetivo inicial/candidato de activa; no expone arrays individuales de registros/links. Comprueba recuentos y blockers frente al fixture explícito.
- Tras obtener revisión, cambia por separado candidata, schema, generación, conciliación, registros locales, historial, sesión de continuidad o devolución ocupada. POST con revisión antigua debe rechazar409 y no activar/reemplazar nada. Un no-op pertinente no se inventa como cambio de contenido.
- Sin reviewed:true o con revision malformada el rechazo es422. Con runtime la activación guiada no está habilitada. Sesión/Host/Origin/no-store se conservan.
- Prueba éxito con revisión vigente y estado ready/candidata/records coherentes. Entre la comprobación y Store.activate no debe existir await que permita otro objetivo; demuestra la sensibilidad retirando la guarda en copia temporal.
- La UI retira la casilla al recargar/409/cambio de contexto;404 no hace fallback al endpoint legado. Error de activación más error de refresco sigue atendido sin abrir el espacio ni avanzar pasos en falso.
- **Compatibilidad conocida:** /api/activate legado conserva reviewed:true sin revisión. La garantía nueva corresponde a la UI/ruta nuevas; no informes ese contrato documentado como bypass nuevo de autenticación.
- **Diagnóstico ya corregido:** App ya adaptaba candidata antes de pasar props a Preparation. Un test aislado con props sin adaptar no prueba que el recorrido normal viejo mostrase la activa. Identifica esta distinción en tu dictamen.

## E · Devolución manual067: intención, mapeo y resultado

El backend ya comprobaba revisión al inicio/final y solo realizaba lecturas. No atribuyas a la nueva UI la corrección de un bypass de escritura o autorización que no se ha demostrado.

- Cambiar revisión, operaciones o IDs remotos retira la confirmación, también A→B→A. Los mapeos antiguos que ya no pertenecen a altas pendientes no se envían.
- Cada alta requiere ID numérico; duplicados remotos dentro de la misma entidad se rechazan; el mismo ID en entidades distintas es válido. Varias operaciones de una ficha requieren una comprobación final por identidad.
- Resultado completo por entity/localId: sin duplicados, sin fichas ajenas, sin huecos, passed coherente. Array vacío no equivale a todo correcto. Éxito exige manual_verified, misma revisión, watermark final, recuento e identidad/fecha válidos; rechaza informes viejos o de simulación.
- Doble click, cambio de revisión/desmontaje mientras llega respuesta y transporte sin abort: no añade un resultado/error obsoleto, no repite ni conserva autorización antigua.
- Comprobación confirmada seguida de refresh fallido reintenta solo la lectura local.409 retira autorización aunque el refresh posterior también falle; resultado negativo conserva pendientes y exige revisión humana nueva.
- En navegador se permite falsear solo el flag de origen mostrado para alcanzar la rama de producción, interceptando todos los POSTverify. Comprueba directamente que backend isTestData:true,connection:null,watermark0,manualReport:null siguen intactos. Informa que es una UI contrafactual, no un portal real.

## F · Réplica069: completitud local y edición por revisión

Prueba cliente real en memoria con fetcher propio que no pueda salir a red. No necesitas levantar un servicio remoto ni usar claves de una cuenta. Usa una empresaUUID y tokens inventados de64hex.

- Más de100 fichas de otras entidades antes de225 contactos: todos los contactos locales deben seguir accesibles. Una operación pendiente sobre el último registro se proyecta y no cambia el estado remoto guardado al consultar. Límite10000 real, no solo veinte muestras.
- totalRecords/recordsComplete describen **la réplica local guardada**, no que represente ahora todo el servidor remoto. Servidor antiguo o metadata discordante muestra aviso; no inventes filas ni rechaces una respuesta antigua legible por faltar metadata opcional.
- Búsqueda por todos los términos, ID/nombre/teléfono, acentos y valores0/false/null. Páginas20 con contadores correctos, último ID alcanzable, filtros y foco al limpiar sin escrituras. No midas completitud solo contando elementosDOM de una página.
- Revisión estable para lectura/lastSync, cambia al cambiar datos/outbox/cursor/empresa/destino/conflictos. No incluye el token como contenido visible. Guardado nuevo exige revisión exacta de apertura;409 no muta outbox ni hace tráfico remoto. Ruta v6 sin revisión422; v5 anterior sigue compatible y no representa la garantía nueva.
- Vinculación concurrente no sobrescribe otra réplica al volver; error libera el vuelo para otro intento. Si empezó una sesión de continuidad durante bootstrap, no se vincula. Duplicados de identidad no entran como réplica válida.
- Guardado409 conserva borrador, permite refrescar dentro del modal, presenta teléfono actual y exige revisión explícita antes de reintentar. Si la ficha desaparece, no elijas otra automáticamente.
- Acuses link/sync de otra empresa/destino no se muestran como éxito; queued:false no se anuncia como guardado. Acuse correcto+refresh fallido hace soloGET al reintentar. Un handler antiguo no repite el guardado después de cerrar.
- Simula éxito/error tardíos de carga con transporte que ignore cancelación. En E2E todos los requests de equipo se interceptan; GET directo al backend debe seguir linked:false/connection:null. Separa esta UI de las APIs en memoria que sí ejercitan contratos reales de TeamSyncClient.

## G · Acceso070 y límite parental072

- Setup/login tienen un solo envío incluso antes del render; campos congelados. Valida longitudes/confirmación también ante submit programático que evite validaciónHTML.
- configured:true confirma setup, authenticated:true confirma login. HTTP200 con el campo del otro modo, false o ausencia no abre la app. Error401/429 es visible y reintentable sin continuación falsa.
- Credenciales se retiran al acuse válido; cancelar, desmontar o pasar setup→login→setup descarta callbacks/respuestas antiguas. No exigir borrado criptográfico de memoria JavaScript.
- Con done asíncrono que falla después del acuse, la UI conserva acuse y reintenta solo done sin otroPOST. Contrástalo con el caso de App real, no lo extiendas por inferencia.
- **Pendiente conocido AUTH_PARENT072:** el App actual llama setAuth(open) y void refresh en done; no devuelve su promesa. Así la capacidad anterior no cubre todavía ese refresco en el padre real. Hay diagnóstico ficticio separado: acuse válido+GETstate503 produce apertura del estado retenido y rechazo no atendido. No edites App (reservado por SEARCH053), no declares arreglado ese recorrido ni presentes esa observación conocida como hallazgo nuevo sin indicar su estado previo. Confirma o refuta su reproducción con tu propia evidencia y mantenla separada de las pruebas que pasan.
- Los E2E reales de setup/login se ejecutan únicamente con contraseña y carpeta ficticias nuevas. No operes la protección de una instalación del usuario. No bloquees sesiones existentes para probar revocación.

## H · Sensibilidad y validación de conjunto

Al menos una guarda de servidor (activación exacta o revisión de réplica) y una guarda de cliente (contexto/cierre/vuelo único) deben retirarse en copias temporales para mostrar que tu propio test falla por el motivo esperado. Conserva controles positivos. Un módulo ausente, types fallidos o payload inválido son problemas de preparación, no sensibilidad causal. No hace falta mutar todo el producto ni repetir por rutina builds enormes.

Inspecciona recorridos cruzados con CSS global real: selector dentro de formulario, modal después de refresco, pérdida de revisión con formulario abierto, lista filtrada/paginada y error de lectura con acuse conservado. Verifica título/URL, contenido no vacío, ausencia de overlay de framework, errores de consola atendidos, interacción efectiva y capturas1440/390/320. Controles nuevos44px, foco de teclado y texto largo. No afirmes lector de pantalla u otro motor sin usarlo.

No se necesita un único snapshot final que absorba cambios de todas las sesiones. Un snapshot por corte/área y hashes explícitos es preferible a una mezcla viva imposible de reproducir. Si preparas runtime de navegador, inventaría artefactos y no copies bases/.env/.ai.local.json. Distingue build de producto, artefactos reutilizados por hash, pruebas mecánicas y runtime instalado. No uses un build verde como autorización de release.

## Entrega

Informe nuevo con:

- Hashes antes/después de cada fuente y de tus siete archivos; comandos y carpetas de evidencia.
- Pass/fail/skip/TODO reales por banco, sin sumar repeticiones ni caracterizaciones como garantías. Una rama no ejercitada dentro de un test debe declararse aunque Node muestre0skip.
- Oráculos, fixtures y por qué las pruebas podrían fallar; mutaciones causales con aserción exacta, no solo exit1.
- Hallazgos con reproducción mínima y severidad razonada; dictamen separado por cada unidad. Si un problema ya está declarado (AUTH_PARENT072 o límites legacy), relaciónalo, no dupliques crédito ni lo ocultes.
- Capturas inspeccionadas y límites concretos: UI mock vsbackend real, tipo de proceso, symlink/junction, navegador/motor, proveedor/runtime no probados.

    node tools/coordination/board.mjs submit CLAUDE-QA-073 claude --note "Auditoría independiente interfaces062-070: hashes, contratos, carreras, acuses, completitud y sensibilidad; límites y dictamen por unidad, sin aceptar o desplegar"

Después de submit conserva reservas y deja de editar. Codex revisará la entrega; no cambies actor a codex ni autoaceptes. Un brief preparado no acredita que otra sesión lo haya leído o esté ejecutándose. Si QA073 ya está tomada por otra sesión, no la fuerces ni inventes un traspaso: sigue con tu unidad propia disponible.
