# SEARCH053 · Búsqueda global de la copia local

## Corte presentado ·2/11/2026,Europe/Madrid · corrección de143/145

053se devolvióaworking por dictamen143antesdeeditar. Se corrige la identidad de búsqueda:estadoApprecibecontextoatómicodeinstancia/capturacompleta/generación/sesión;hash de búsqueda lo incorpora;APIrechazaseleccionesajenas yclienterechazafuentesdistintas/lecturastardías. Servidorantiguosinidentidadbloqueabúsquedasconmensaje explícito. Detalles,riesgos ycontratos en CODEX-SEARCH-IDENTITY-145.md;no editar elobservacional143de otrorevisor.

Verificaciónpropiaactual:150/150Nodefocales,tscfocal/App/mainydependenciaslimpio,Viteaislado,11/11DOMdebúsqueda(6existentes+5nuevos),cincomutantescausales. Snapshotfinal tests/.tmp/search145-2467b143-69ee-46db-89e1-9a21d593abb3.143originalpasaenAPIpre145reproduciendocolisión yfallaenactualporrevisionesdistintas;078/QA060conasercionesintactaspasanactual yfallanF3baseline075. PrimerDOM8/11porselectorpropiomalsupuestoúnicoresultadoqcontact-1,se corrigiósoloIDexactoyrepitiócortecompleto;historiapreservada.

Esta presentación mantiene otros montajes053 ya documentados;140fuedictaminada/aceptadaen142porseparado.053completa **requiere dictamen independiente nuevo**,no se autoacepta por150/11. No preview144,reinicio4591/4331/4334,proveedores,worktree,commit/push,rootbuild odespliegue. La fuente actual está vinculada a los nuevos hashes de submit;los hashes anteriores describen cortes históricos. Permanecen límiteslegacy/CAS/D7ylecturas frenteaescritoresexternos. El informe original ylas secciones históricas siguientes no son pruebas adicionales de este corte.

30/10/2026, Europe/Madrid. Codex. El usuario pide desarrollo continuado mientras se revisa QA052 de Opus. **Mejora visible implementada en el CRM completo;13/13 Node/API,6/6 recorridos de navegador, typecheck y build aislados correctos. Fuente presentada para revisión; ninguna instalación actualizada.**

## Problema y comportamiento

Antes había que elegir una entidad y buscar dentro de su tabla. Ahora el botón «Buscar en toda la copia» y Ctrl/Cmd+K abren una búsqueda conjunta de clientes, empresas, oportunidades y tareas. Se consulta únicamente la copia activa local y sus campos declarados; no se buscan datos de HubSpot, de la candidata sin activar o de campos ocultos.

Todos los términos deben coincidir en ID/campos del registro; acentos, mayúsculas y espacios se normalizan. Prioridad determinista por ID exacto, nombre exacto, prefijo y resto de coincidencias; homónimos distinguidos por entidad/ID. Filtro por tipo, recuentos completos antes del límite y paginación. Vistas previas con nombre del campo y recorte explícito; se muestra el contexto próximo a una coincidencia tardía sin partir Unicode. Nunca se interpreta la búsqueda como expresión regular.

GET /api/v2/search incluye captura, portal, revisión, fecha y clase de datos. Usa datos activos síncronos y hereda protección local/Host/Origin/no-store. Query estricta:2–160caracteres, máximo12términos, offset0–10000, límite1–50, filtros únicos entre cuatro entidades. El consumidor muestra20resultados por página y vincula las páginas siguientes a la revisión de la primera; si cambia la copia,409 y actualización explícita.

Abrir resultado usa GET /api/v2/search-record con entidad/ID/captura/revisión. Comprueba la revisión de forma síncrona antes de retornar el registro completo actual y sus relaciones; nunca envía el preview recortado al editor. Cambios durante la búsqueda impiden abrir la versión anterior. Solo al pulsar Abrir se navega a la entidad y al editor existente; la búsqueda no escribe fichas, completa tareas o llama proveedores.

## Interfaz y concurrencia

Diálogo propio, input enfocado, Escape/clic fuera/cerrar, foco contenido y restaurado al salir; desplazamiento del fondo bloqueado mientras está abierto. No se abre encima de una ficha sin guardar con el atajo y el botón queda deshabilitado cuando hay una ficha abierta. Controles nativos44px, filtro y panel adaptados a1440/390/320. No dependencia nueva o cambio a estilos globales; CSS contenido a workspace-search.

Debounce200ms; claves por captura/revisión local/query/filtro/página, abort y descarte de respuestas tardías al cambiar consulta/cerrar/desmontar. La apertura tiene su propio abort/validación de identidad y se descarta si el contexto cambió. Sin polling adicional, localStorage o persistencia de términos. Estados inicial/carga/vacío/error/reintento,404de servidor anterior y401 que retira toda la aplicación con el mecanismo de bloqueo existente.

## Evidencia propia

Snapshot final `tests/.tmp/search053-final-f40a4cca-4023-4c12-b566-00fdd78a55ab`, manifest.json con hashes de cada fuente. Cotejadas las entradas después: sin diferencias. Logs logic-api.log/typecheck.log/vite.log/browser.log y api-regressions.log. No usar el snapshot inicial como versión definitiva después del ajuste de scroll del diálogo.

- **13/13 lógica/API:** términos entre campos, acento/espacios, facetas antes del filtro/límite, ranking/IDs/homónimos, campos ocultos no expuestos, enum/bool/número, Unicode y preview tardío,10.000registros y último resultado, límites estrictos, fuente activa frente a candidata, GET sin mutaciones, apertura con valores completos,409tras edición y auth/Host/Origin.
- **6/6 navegador finales**, Chromium headless propio, un trabajador y fixture nueva en **127.0.0.1:4391**: las cuatro entidades, conteos/filtros, foco/atajo/Escape, móvil, homónimos porID con teléfono completo de más de400caracteres, paginación26registros y vacío, respuesta vieja retenida,409al abrirtrascambio y refresco,404antiguo/401sinresultadosvisibles. Recorridos de búsqueda GET; sin redexterna/errorconsola en el flujo principal.
- Typecheck completo y Vite aislados correctos; backend fixture compilado con esbuild. No npm run build o directorios build/dist raíz.
- **13/13 regresiones de API radar/comparador** contra el snapshot final al compartir createBaseApp; resultado en log específico. No nueva prueba de proveedor o instalación.

Artefactos de navegador: `C:/Users/iresh/.codex/visualizations/2026/10/29/01a1896e-06ff-7690-9644-4f6de90c2826/search053/`. JSONfinal en final/results.json. Capturas viewport search053-1440.png/search053-390.png/search053-320.png inspeccionadas, cuadro legible/contenido y desbordamiento dentro del diálogo, sin overflow de página. Identidad de página/título y primera pantalla comprobadas antes de abrir, sin overlay de framework observado. No Browserplugin/skill disponible; usado el flujo Playwright existente con navegador de caché, sin perfil personal.

Incidencias propias resueltas: primera aserción de orden comparaba respuestas con distinta capitalización de query; se corrigió el input del test manteniendo su expectativa de orden. Primer E2E5/6: la interceptación general usaba continue y saltaba el handler de la respuesta retenida; corregido solo arnés a fallback. Un intento de grep pasó string en configuración en vez de RegExp; corregida solo configuración temporal. Recheck1/1 y suite final6/6. No son fallos atribuidos a Opus ni repeticiones contadas como casos nuevos.

## Coordinación, límites y siguiente paso

Diez archivos exactos reservados en SEARCH053, incluyendo App y registroAPI, ninguno compartido con QA052. QA052 avanzó a tres archivos de pruebas; todavía working al cotejo, informe final pendiente. No se editó su suite ni las fuentes BACKUP041/SAFE049/REL046 bajo auditoría. Memoria/panel bajo LAB035 solo documental.

La búsqueda es una consulta simple de la copia activa, no búsqueda semántica/IA o inventario completo del portal. El campoID es explícito para evitar confundir homónimos. La apertura permite usar el editor existente y sus controles; no cambia sus reglas ni acredita nuevos permisos por rol. No se probaron otros motores o lector de pantalla. La prueba de10.000es de lógica, no benchmark contractual.

Pendiente revisión separada y, después, candidata integrada con prueba del runtime servido. No despliegue, cuentas/datos reales, proveedor, recursos corporativos, dependencias, commit o push. El objetivo de desarrollo continuado sigue activo; no significa vigilancia permanente o acceso a cuota restante del usuario.

## Hashes de fuentes presentadas

- shared/workspace-search.ts: 49344191ae70eb66d519d8fe178d3e0fcc6f314d40570fcf867a280453b5db84
- server/workspace-search.ts: 64b3d85ec755edb107b133cf85153e7bf1b653c0eaea6f089e08d6f9dba92d33
- server/app.ts: 62561ee91bf9e99f3f138bf4c9c6376b7c3f49b7ac3b0687979e568fdc486872
- src/WorkspaceSearch.tsx: 9df10b7b32960a3a07c4baebd23a0d9235ee08ffd5cc406a503d5cc94d447c3e
- src/workspace-search.css: 756aba711ed4d201d77c813acc07691b43abb28624cb2d5404b830a3c0f8211c
- src/App.tsx: 8e0abbe1e966000e65ea334901f791b524c2eca043bd09aab78feff686ade3b5
- tests/workspace-search.test.ts: 451a1ddbdf6766feb962029f8e65dfd77b98f52a6119d82d3a2cf496ca544c62
- tests/workspace-search-api.test.ts: 011339926cd221787f935bfc68dd535016ffba7f9d2c546160d98b793881fdeb
- tests/e2e/workspace-search.spec.ts: 0959a13d0961ebf39385f29170ea8e966d6fcbf99920afabecbd9cfec29c2347


## R2 · Hallazgos QA060 F1/F2/F3

Se omiten vínculos sin valor antes de resolverlos: undefined/null/cadena vacía no se convierten en IDs literales. El nombre vacío o solo espacios cae al ID;0yfalse siguen visibles. La paginación se liga al contexto local exacto y reinicia offset0 al cambiar; el efecto retira también secuenciasA→B→A.15pruebas de motor/API más la regresión de contexto078 incluidas en82/82. Con fuente075 anterior fallan dos regresiones de vínculos/nombres y la de contexto (offset20frente0); logs tests/.tmp/fixes075-baseline-6bceb5d0-deee-4148-8563-542a51128b00.6/6 E2E del consumidor real correctos tras preparar la fixture. La prueba nueva F3 usa arnés de hooks, no afirma reproducción DOM del antiguo rango21–5. App.tsx/serverapp/CSS se conservan, sin tomar AUTH_PARENT072.

## Verificación integrada propia · 31/10/2026, 14:32:45, Europe/Madrid

Candidata aislada **tests/.tmp/release-candidates/candidate-5e94390e-745e-40e1-ac1f-d412eaf4672f**,329fuentes,23artefactos: typecheck, Vite, seis bundles Node, public-assets y162pruebas Node correctos. approved:false/deployed:false/releaseEligible:false; conserva bloqueos de fuentes sin aceptar. No es una instalación o aceptación de las unidades. Todos los hashes de fuente se recotejaron antes de esta presentación.

Banco focal propio del snapshot: **82/82**, sin fallos/TODO/skip (tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/focal.log). Navegador: **29casos únicos correctos** repartidos en dos ejecuciones del mismo snapshot: activación6, manual6, historial3 e inspector8 en tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/browser-results.json, y búsqueda6 en tests/.tmp/final079-8a4e0c8e-ae18-44b0-aa37-b59b0b7abd12/evidence/browser-results.json. El primer arranque omitió la fixture de búsqueda: sus6fallos se conservaron; se corrigió solo el arnés y se repitió solo esa suite con datos ficticios nuevos. No se convierten los fallos iniciales en éxitos ni se suman reejecuciones como casos nuevos.

Browser plugin not available: PlaywrightCLI existente con Chromium headless-shell1228 propio, workers1, servidores nuevos4391/4401/4404/4406/4410, allowlist de entorno y bloqueo de red externa. Capturas1440/390/320; inspeccionadas visualmente las de inspector1440/320 y activación320. Controles44px medidos en navegador. Sin Edge, lector de pantalla, instalación4331/4334, datos reales, proveedor, dependencias, build/dist raíz, deploy, commit/push o acceso corporativo.

QA060/QA073 permanecen informes históricos aceptados como auditoría con hallazgos; no se reescribieron sus fuentes de pruebas/informes. La revalidación independiente nueva079 debe retirar TODO solo con causa y actualizar su caracterización H9 (búsqueda sin fechas implícitas). No se declara toda la batería del proyecto verde. AUTH_PARENT072 permanece pendiente y App.tsx no se modificó durante estas correcciones.


## Hashes de esta presentación (sustituyen tablas anteriores)

- shared/workspace-search.ts: `513a4f8344b52eefd6f0d1d9302897da54039393169666212109a68a6eb3fc33`
- server/workspace-search.ts: `a4539f4e497e6aeaa3c5e93ae76f24c4619d704c4e1a22ce959044810b9cf779`
- server/app.ts: `62561ee91bf9e99f3f138bf4c9c6376b7c3f49b7ac3b0687979e568fdc486872`
- src/WorkspaceSearch.tsx: `58b07fcba525971fe7a88eac817ece68678012d73ccfc3b65bfbef529c87d1be`
- src/workspace-search.css: `756aba711ed4d201d77c813acc07691b43abb28624cb2d5404b830a3c0f8211c`
- src/App.tsx: `8e0abbe1e966000e65ea334901f791b524c2eca043bd09aab78feff686ade3b5`
- tests/workspace-search.test.ts: `32351f0f878fc7246768c9e47e010ca911952a11bf744cbddcd85e27e8da1416`
- tests/workspace-search-api.test.ts: `46eb35de4645c4005f8140350f142ae393d028d2236fb786410175a676660bae`
- tests/e2e/workspace-search.spec.ts: `0959a13d0961ebf39385f29170ea8e966d6fcbf99920afabecbd9cfec29c2347`

El hash del informe lo registra submit. No autoaceptación.

## Revisión de alcance117/120 · App principal integrada · 2/11/2026

SEARCH053 se devolvió a working antes de editar. Se concilió explícitamente el App ajeno6cd5… frente al baseline presentado8e0…:tres cambiossemánticosAUTH072 revisados,4pruebascausales y3DOMpasan;noaceptaciónretroactiva de072nihashantiguo.

App montaPreparationNavigation propio117,LocalOperations118aceptada yLocalIntegrations119aceptada;server/app monta registerLocalOperations bajo guardasexistentes. No se editaron módulos118/119oPreparation/Store. Detalles en CODEX-NAVIGATION-117.md y CODEX-OPERATIONS-MOUNT-120.md.132/132Nodefocales,11/11AppDOM finales,tsc/Vite14artefactos;recheckbúsqueda1/1amplíaunrecorridoyabrecontact-1porIDconvaloractual. Se conservan historia/cortesprevios, sin sumar pruebas repetidas como nuevas.

App SHA-256 65daacfb784b503f9c9c96afa7ddf44cd596faa75bc93979c25a1670b39ba1a9;server/app 532785b9674d75e50c5edfc88385eeb0868446499b11776470b318d98e8ea8c4. Antes de esta presentación se cotejan los otros siete archivosfuente/testde053 sin cambios contra su submitanterior,informehistórico se amplíaenestasección. Nuevo submitnoesautoaceptación. Previewficticio1254591separado,4451intacta. Riesgos/alcances ylogs completos en informes117/120/125.
