# CODEX-NAVIGATION-117 · Preparación plegable y pantallas operativas montadas

2/11/2026 Europe/Madrid. Para revisión independiente; no autoaceptada. Se mantiene el checkout y las reservas exactas. La petición humana y autorización de coordinación se comprobaron en el chat «Prepara un plan potente para Claude», ID01a1979f-9475-7e01-9b05-f51ca3b83ea5. Este chat es01a1896e-06ff-7690-9644-4f6de90c2826.

## Resultado visible

Preparación conserva un botón accesible que expande/contrae Origen, Procesos y Generar. Al plegar se conserva el paso y el borrador del componente montado; al salir se oculta el submenú. Su contenido hidden/inert no recibe foco. Tres pasos, sin duplicar Exportar global, y guardas sin captura. Sus nuevos controles miden al menos44px. CSS limitado a preparation-navigation; no se editó Preparation.tsx o el sistema de estilos global.

App monta LocalOperations para Hoy/Agentes con key por página y callbacks al workspace real de tareas/oportunidades y preparación. La captura importada muestra tareas sin necesitar activar ni generar IA; editar sigue requiriendo activación. LocalIntegrations sustituye la lista de simulaciones en la página Integraciones, con callback al flujo real ya existente de Continuidad/ConnectionDialog. No se crean nuevos conectores.118 y119 se conservan byte a byte; la primera la aceptó este revisor distinto del autor después de R2;119 fue aceptada por el otro chat122.

Los cambios de App pertenecen a SEARCH053, devuelta a working antes de editar;117 reserva cinco archivos nuevos,120 tres archivos nuevos y125 un informe nuevo. No se duplican reservas ni se libera una unidad en revisión para eludir el protocolo. Los montajes de la API están documentados en120.

## Conciliación de la propuesta072

Se localizó el baseline App.before-072 cuyo hash8e0abbe1e966000e… coincide con el submit053 anterior. La propuesta ajena6cd5a8d29a12e406… se archivó antes de tocarla. Su diff contiene únicamente tres cambios semánticos: estado lockEpoch, listener planb:locked que lo incrementa y Protection con key/async done que espera refresh. La reconstrucción normalizada a LF coincide; había diferencia de fines de línea, no código adicional oculto. auth072-proposal.diff/auth072-reconciliation.json conservan evidencia. Cuatro pruebas del padre pasan y fallan4/4 causalmente con el baseline antiguo; tres flujos DOM de autenticación vuelven a pasar en el build final. Se conserva la propuesta tras revisión, sin atribuirle una reserva válida retroactivamente ni marcar072done. SEARCH053 presenta hashes nuevos, nunca acepta el antiguo del App.

## Verificación propia

| Capa | Resultado |
| --- | --- |
|Node focal final |132/132,0fail/skip/TODO; incluye17de118R2,18de119,7propias120,4auth,11Protection,60UI y15búsqueda/API |
|App completa, build final |11/11 E2E,0skip/flaky; ocho recorridos nuevos117 y tres auth072 en copia de prueba con solo puerto cambiado |
|Búsqueda global adicional |1/1 ampliación de un recorrido ya contado; mismo build, encuentraLucía y abre contact-1 porID con ficha actual |
|Typecheck/Vite |Proyecto focal/imports limpio y14artefactos; no rootbuild/dist |
|Preview con backend principal compilado |1/1 nuevo recorrido125 con UI real, revisión local persistida, recarga,18tareas,14abiertas,1440/390/320 |

El132 es un conjunto focal, no toda la suite del producto. El recheck de búsqueda amplía un caso de los11 y no se suma como duodécimo caso único de ese spec. No se repitieron los seis E2E históricos completos de búsqueda; sí su lógica/API y la apertura porID en la App actual. No se repitió la matriz completa de mutantes de otras unidades.

Snapshot final: D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/navigation117-3815e3c2-b659-474e-a2b4-5b6e53ac8849/app120-final-4a912811-7757-4061-9232-3dc8931cf44f. Registros en node.log, typecheck.log, browser.log, browser-results.json, result.json;14 artefactos y hashes/imports consumidos conservados. Los inputs realmente consumidos por Vite seguían coincidiendo al cierre. La última ampliación del test de búsqueda se guardó por separado en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/navigation117-3815e3c2-b659-474e-a2b4-5b6e53ac8849/app120-final-4a912811-7757-4061-9232-3dc8931cf44f/search-recheck-82078fbb-b9d5-4ad3-ae3e-090d0063aa27, con su hash; no cambia artefactos o fuente de runtime.

## Causalidad e incidencias preservadas

Primer corte90Node/tsc y navegador6/7: el fallo era un texto incorrecto en mi test («Revisa la» frente a «Revisa tu aplicación»), corregido solo el selector; recheck1/1. La inspección visual descubrió un defecto propio: la navegación nueva se comprimía en una columna del grid móvil. Se corrigió CSS local con span de fila completa y tres columnas; dos controles móviles nuevos fallan2/2 contra el artefacto anterior por texto fuera de su caja y pasan con la corrección, sin cambiar esas aserciones. Las primeras pruebas de no-overflow global por sí solas no lo detectaban. Se comprobaron también rectángulos sin solapamiento. Hubo un intento de editar un helper por node-e con quoting incorrecto en PowerShell; se detuvo ese helper y se usó here-string. Un recheck redundante repitió un control, no cuenta como evidencia adicional única. Logs/cortes anteriores preservados.

En118 apareció después de112Node/9DOM favorables el caso de snapshot válido con nombre101 que causaba422. Se devolvió R2 al autor, mantuvo12reservas, corrigió la proyección y se comprobó con100/101/501/Unicode sin modificar la captura ni perder filas. La misma nueva aserción falla con118anterior y pasa conR2;120 conserva ese dictamen, no se ocultó por el verde inicial.

## QA de interfaz

Browser plugin not available; CLI Playwright del repositorio y Chromium headless1228 instalado, contextos nuevos sin perfiles. Flujo: Continuidad → Preparación expandida/plegada → pasos/draft → Hoy importado/activo/vacío → Agentes/revisión conGET503 → tareas/oportunidades/búsqueda → Integraciones/diálogoHubSpot vacío. Puertos propios4581–4585 para fixtures, luego4591 para preview;4451 y las otras demos no se alteraron.

| Control | Evidencia |
| --- | --- |
|Identidad |Título Plan B y h1 de cada superficie, URLs/instancia propias |
|Contenido |Ninguna pantalla vacía en los flujos;14tareas visibles incluso sin activar |
|Overlay |No observado en capturas del build de producción |
|Errores |Sin pageerror; consola de los casos normales vacía. Un503 intencional en recarga y un401 de lectura previa al configurar protección en el fixture de conexión se registran y explican; no se promete consola global vacía |
|Capturas |1440/390/320 generadas; finalPreparación320/Integraciones1440 y previewHoy1440/320 inspeccionadas, además de cortes anteriores |
|Interacción |Teclado, foco fuera del submenú oculto, draft preservado al plegar, rutas/gates/acuse persistido y callback real de conexión |

La navegación no conserva un borrador del componente al desmontarlo para cambiar de página; la garantía ensayada es plegarlo sin desmontar. La etiqueta de actividad de un acuse es histórica y fechada; stale solo indica cambio de datos. No accesibilidad con lector, Edge, contraste medido, cuentaHubSpot/Google o RTO real.

## Código y límites de entrega

App actual SHA-256: 65daacfb784b503f9c9c96afa7ddf44cd596faa75bc93979c25a1670b39ba1a9; PreparationNavigation: 538a2b47424fe05026bc7966b93c1553dc208bf3abeb73d8932fd0c7ff05f680; CSS: 28378fd8ddddee8ef6669a1e6ab54e8dc3b4de1b9e8d6f94554216e0f3daab8c; prueba actual: fe6bd7872ad14de8dff0595001f74526ff0ad353c60d99140b13a765555e8113. El tablón registra los hashes completos del informe y brief al submit. No se aceptan fuentes propias053/117/120/125;121 del otro chat las revisará cuando estén presentadas. No se integró Rescate106/LAB036/Kit116 o tarea123 por este cambio.

No cuentas/proveedores, dependencias nuevas, worktree, commit/push o despliegue. Preview125 es una copia ficticia nueva con clave de prueba, no una instalación comercial protegida. URL/instancia/handle y límites en CODEX-PREVIEW-125.md.

Nota de cierre: el primer helper documental intentó consultar submitted de053 después de revise, que lo limpia por diseño. Falló antes de cualquier submit; se usó el manifiesto before053 preservado para cotejar los otros siete archivos. No cambió fuentes/pruebas o resultado de producto; informes escritos una sola vez y revalidación antes de submit.
