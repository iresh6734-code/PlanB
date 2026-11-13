# RELATION062 · Selección de relaciones sin pérdida de identidad o errores

30/10/2026, Europe/Madrid. Codex. **15/15 unitarias, 3/3 regresiones de Modal, 7/7 E2E finales, typecheck y Vite correctos.** El recorrido anterior completo de continuidad pasa sobre el mismo TypeScript funcional y backend, antes de los ajustes finales de CSS. Fuentes presentadas para revisión independiente; no instalación o autoaceptación.

## Defectos reproducidos antes de corregir

Tres casos sobre el componente anterior exacto fallan por causas concretas: un éxito de búsqueda borra el error al cargar la ficha elegida; cambiar entidad conserva temporalmente una etiqueta de otra entidad; una respuesta antigua válida sustituye las opciones de una consulta nueva si el transporte ignora abort. Resultado baseline **0/3**, sin skips/TODO. No se atribuyen a Claude ni se presenta el selector comercial del piloto como afectado: es ReferenceSelect del CRM completo.

Fuente original congelada en tests/.tmp/relation062-original.tsx antes de editar. Baseline definitivo en tests/.tmp/relation062-944d17ba-7564-4632-af08-ddc839c8a1bf/baseline-sensitivity.log, usando el test exacto congelado y PLANB_REFERENCE_SRC al original. El primer intento de este arnés tenía un defecto en su función de texto que recursaba con undefined: se corrigió solo el arnés y se repitió; log inicial separado. Los tres fallos definitivos son de aserciones de producto, no errores de preparación.

## Cambio funcional

- Estados de ficha elegida y búsqueda independientes, cada uno ligado a identidad de campo, entidad, valor/consulta y número de reintento. Una respuesta ajena no se pinta ni borra un aviso actual. Se abortan ambas lecturas al cambiar contexto o desmontar, con guardas adicionales si el transporte ignora la cancelación.
- El ID controlado por el padre se conserva. Si falta su ficha, una opción explícita deshabilitada muestra que está cargando o sin verificar; nunca se elige el primer registro, se borra el valor o se llama onChange automáticamente. Una selección válida se conserva aparte de la primera página/filtro.
- Todas las opciones incluyen ID, también los homónimos. Se valida entidad/ID de la ficha y la lista, duplicados y límite de cincuenta. Un total contradictorio con la primera página no se anuncia como vacío legítimo. Un servidor antiguo sin total conserva resultados acotados e invita a afinar, sin inventar un total.
- Errores y reintentos separados de relación/búsqueda. Consulta con límite de 200 caracteres, mensajes de carga, cero coincidencias y «50 de N» explícitos. Una relación de solo lectura carga su etiqueta sin buscar alternativas. Handlers rechazan IDs fuera de las opciones actuales, funciones antiguas tras cambiar contexto y cualquier selección cuando disabled.
- Select nativo y búsqueda con controles de 44px, estados ARIA y disposición apilada de ancho completo. CSS acotado al componente; no se cambia el piloto o estilos globales. LABEL063 reserva aparte el padre para proporcionar el nombre del campo, evitando que los mensajes/reintentos contaminen el nombre accesible del select.

Solo GET existentes; no backend, API nueva, proveedor o automatización de cambios. Un usuario aún puede guardar otros campos con una relación sin verificar: se conserva su ID y el backend mantiene la validación existente al guardar. Esta unidad no inventa una autorización transaccional ni afirma que una relación siga existiendo indefinidamente después de leerla.

## Pruebas unitarias y de integración del componente

tests/reference-select.test.ts ejecuta el módulo real transpila­do con hooks controlados y transporte diferido que ignora abort. No es React DOM ni una prueba de lector de pantalla. **15/15**, 4.65s en snapshot congelado: errores independientes/reintentos, cambio de entidad, éxito/error tardíos, selección fuera de cincuenta, IDs y listas incoherentes, totales contradictorios, handler antiguo tras disabled, desmontaje sin escrituras y relación de solo lectura.

Comando conservado: node --require ./scripts/block-external.cjs --import tsx --test tests/reference-select.test.ts; para el snapshot, PLANB_REFERENCE_SRC apunta a su componente congelado. Log unit-frozen.log en relation062-final-769340ab-01ca-47f1-aad2-b49da49555ec. Los quince casos son idénticos a los del snapshot final y el TypeScript funcional no cambió después. No se repiten unitarias por un delta exclusivamente CSS o de instrumentación E2E.

Tres casos Modal de ui-journeys.test.ts pasan con el padre components.tsx cambiado: cierre con guarda, estabilidad de foco/listener y exclusión de pantalla inerte. Log modal-regressions.log en la primera preparación. Solo cambió pasar label, ninguna lógica Modal.

## Navegador y evidencia final

Siete recorridos reales del selector sobre fixture nueva con 164 contactos, selección al final y homónimos. Chromium headless de caché con perfil temporal propio; Browser plugin no disponible, flujo Playwright del repositorio. Un trabajador, entorno de hijos permitido del SO, block-external y origen exclusivo 127.0.0.1:4398. Datos/cuentas/contraseñas de ensayo nuevos; no instalaciones 4331/4334, claves anteriores o navegador del usuario.

1. Selección fuera de las primeras cincuenta, recuento total y conservación aparte; búsqueda de homónimos, elección por ID y PATCH real con el ID exacto.
2. Error de ficha 404 junto a lista correcta: el aviso permanece, ID preservado, reintento recupera ficha y el nombre accesible sigue «Cliente».
3. Error de lista 503 junto a selección verificada: etiqueta/ID conservados; reintento independiente.
4. GET antiguo válido retenido, transporte sin señal y resultado posterior real. Tras consumir el cuerpo antiguo siguen la opción nueva y selección controlada, sin escrituras.
5. Ficha de entidad incorrecta rechazada, sin presentar su etiqueta como elección.
6. Campo de solo lectura carga etiqueta y no emite consulta de alternativas. La medición distingue las consultas del selector de la lectura de la tabla de la página anterior.
7. Teclado/foco, altura 44px, ancho completo y controles apilados a1440/390/320; 401 real tras bloquear sesión oculta editor y presenta protección local.

**7/7 finales, 19.6s, sin skipped/flaky.** Snapshot tests/.tmp/relation062-verified-da1bab0c-f8be-44a9-b002-1a90a6d39689: manifest.json con hashes de los cinco overlays, artefactos y cadena de preparaciones; typecheck.log, vite.log y browser.log. Backend compilado idéntico al baseline final TODAY059; se recompila únicamente frontend cuando cambia CSS. No se declara esta variante de pruebas como candidata formal aprobada.

Evidencias visuales/JSON: C:/Users/iresh/.codex/visualizations/2026/10/29/01a1896e-06ff-7690-9644-4f6de90c2826/relation062/relation062-verified-da1bab0c-f8be-44a9-b002-1a90a6d39689/. results.json y relation062-1440.png/390/320. Capturas desktop y320 inspeccionadas: controles y mensajes legibles, sin columnas estrechas, datos de ensayo identificados. Los valores largos pueden truncarse dentro del select nativo cerrado; las opciones conservan nombre/ID completos al abrirlo. Sin lector de pantalla u otro motor comprobados.

El recorrido antiguo «preparación y continuidad con todo el tráfico externo bloqueado» pasa en primera preparación, 12.2s, con server.mjs compilado y fixture nueva4399: preparar/activar, editar cliente, avanzar oportunidad, crear/completar tarea con relación por select, recargar, exportar CSV y aprobar/ejecutar devolución simulada. Fuente y aserciones intactas. Ese resultado se atribuye a su snapshot, cuyo TypeScript/backend son iguales al final; los deltas posteriores son CSS y prueba nueva. No se suman repeticiones como casos distintos.

## Incidencias propias conservadas

El primer E2E omitía abrir «Trabajar» antes de pulsar «Tareas»: siete fallos de navegación del arnés, un recorrido antiguo correcto. Se corrigió ese paso y se preparó copia nueva. Un intento de generar config trató RegExp como JSON: se corrigió el arnés reutilizando el snapshot ya typechecked, sin relanzar una app distinta ni atribuirlo al producto.

La segunda corrida dio5/7: un contador incluía la consulta de tabla anterior y el CSS empataba con una regla global que dejaba un control32px. Se acotó la instrumentación y corrigió la especificidad del CSS. La siguiente dio7/7 funcionales, pero la inspección de capturas detectó que .field>span imponía flex y estrechaba controles/mensajes. Se corrigió la disposición solo en CSS propio y se añadió aserción geométrica de ancho/apilado. La corrida final7/7 es posterior a esa inspección, con capturas revisadas de nuevo. No se relajó la exigencia44px o se editó CSS de Claude.

## Coordinación y límites

Cinco archivos exactos de RELATION062. components.tsx está reservado por LABEL063 en una asignación nueva previa a editar; no se amplió implícitamente esta reserva. Fuentes de Claude y QA056/QA060 intactas. Los cambios quedan para revisión, sin fuente autoaceptada o despliegue. El label del padre debe acompañar esta integración para conservar el nombre accesible exacto.

Las búsquedas siguen el endpoint anterior: filtran por valores y referencias según Store.page, no incorporan búsqueda por ID o paginación nueva al backend. Se identifica la elección por ID en las opciones y se informa del límite; no se promete que todos los IDs sean consultas encontrables por texto. El contexto no incluye una revisión transaccional de captura: controles del backend y revisión de edición existente conservados, sin reclamar protección ante todos los cambios externos posibles.

Sin dependencia nueva, build/dist raíz, proveedor, datos originales, commit/push o instalación. Siguiente: revisión independiente de estas dos unidades sobre hashes presentados, sin apropiarse de reservas QA056/QA060.

## Hashes de fuente/pruebas cotejados

- src/ReferenceSelect.tsx: 9d7a0c1818784b2e0d4b3b67e39c16bcd77947008688793b1bd5454125fb4b08
- src/reference-select.css: 1df155e0e10effa11989287beb61844f87a471f7c2d4e4213650f878222d4c8f
- tests/reference-select.test.ts: cd0aa1b052554495af43071c1b229ff40c90f53447d31e5ed1995c6617eb84db
- tests/e2e/reference-select.spec.ts: 4b336ea1118a6f1c3d63ff7d313cb1bd5f362a2c3f99cf37c780aca670e4f4d7

El informe registra su hash mediante submit. Parent components pertenece a LABEL063 y su hash figura allí.
