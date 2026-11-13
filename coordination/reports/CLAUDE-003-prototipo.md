# CLAUDE-003 · Prototipo interactivo local de Hoy, Comercial y Conexiones

31/10/2026, Europe/Madrid. Prototipo de diseño, **no integrado en la app y no conectado a nada**. Es una propuesta para validar, no una funcionalidad terminada.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `design/claude/prototipo.html` | Estructura estática: aviso, navegación, controles de comparación, tres vistas, ficha lateral, región de anuncios. |
| `design/claude/prototipo.css` | Estilos con los tokens de `DESIGN.md`. Las composiciones responden al ancho del **contenedor** (`@container`), no solo al de la ventana, porque el lateral cambia el espacio útil. |
| `design/claude/prototipo.js` | Estado en memoria y render de ambas composiciones. Sin dependencias. |
| `coordination/reports/CLAUDE-003-prototipo.md` | Este informe. |

No se ha editado ningún archivo de la app (`src/`, `server/`, `shared/`), ni `design/claude/workspace-v2`, ni el tablón.

## Cómo abrirlo

Abrir `design/claude/prototipo.html` como archivo local (doble clic o `file:///D:/AI/Plan-B-CRM-v2.1/source/design/claude/prototipo.html`). No necesita servidor, red ni instalación. Necesita JavaScript activado.

Para que Codex abra un estado concreto en la comprobación visual, el fragmento de la URL admite estos parámetros (solo leen y fijan el estado inicial; no hay almacenamiento):

`#vista=hoy|comercial|conexiones&comp=A|B&datos=estructura|vacio&sel=r1|r2|r3&cap=hubspot|gmail|calendar|drive|docs|sheets&abierto=1&ficha=1`

Ejemplos: `#vista=comercial&comp=B`, `#vista=comercial&comp=A&abierto=1`, `#vista=hoy&comp=B&ficha=1`, `#vista=comercial&datos=vacio`. `abierto=1` despliega el cliente seleccionado en la composición A; `ficha=1` abre la ficha lateral.

## Qué contiene

**Controles locales (lateral en escritorio, bloque superior en móvil):**
- *Composición* A · Lista operativa / B · Mesa de preparación. Aplica a las tres vistas y se indica junto al título de cada una.
- *Estado de los datos*: «Estructura con campos vacíos» (tres posiciones «Registro vacío n», sin nombre, empresa, importe ni fecha) o «Sin capturas» (estado vacío real, sin reservar columnas).
- Bajo el control, la recomendación de CLAUDE-002 para la vista activa (Hoy: A; Comercial: B con degradación en estrecho; Conexiones: sin recomendación).

**Banner persistente** «Prototipo local sin conexión», siempre visible sobre todo (también con la ficha abierta).

**Hoy**
- Franja de cuatro cifras con «Sin dato» y franja de compromisos vacía (sin lateral, como pide `DESIGN.md`).
- **A (fila rica):** una lista; cada fila lleva prioridad, cliente/empresa, motivo, etapa e importe, días sin contacto y **sus propias acciones** («Abrir ficha», «Preparar seguimiento»). En ancho: 6 columnas con cabecera; en medio: 3 filas de rejilla; en estrecho: apilada con rótulos visibles.
- **B (mesa):** cola estrecha a la izquierda (selección) y panel ancho «Siguiente seguimiento» con los mismos campos. En estrecho la cola pasa a un selector.
- «Preparar seguimiento» **solo navega** a Comercial y enfoca el destinatario del borrador; no crea ninguna propuesta.

**Comercial**
- **A (lista con acordeón):** buscador y lista de clientes; al elegir uno se despliega *en el sitio* contexto, borrador, resumen de efecto y pie de revisión. Una sola columna.
- **B (mesa):** cola de clientes + buscador a la izquierda; a la derecha tres bandas apiladas (Contexto con cronología, Borrador con acciones externas al lado, Efecto y revisión) y **pie de revisión pegajoso** cuando la altura lo permite (≥640 px). En estrecho la cola pasa a selector y el pie sigue siendo accesible.
- Campos editables **temporales**: destinatario, asunto, cuerpo y cuatro acciones externas. El resumen de efecto («Enviaría un correo a «…»», «Falta el destinatario») se recalcula al escribir. La casilla «He revisado…» se desmarca sola si cambia el contenido y anuncia el cambio. «Restablecer campos» limpia todo.
- **Deshabilitados y explicados** (texto visible asociado con `aria-describedby`): «Aprobar propuesta», «Ejecutar acciones aprobadas».

**Conexiones**
- Leyenda de cuatro términos (Configurada, Autorizada, Alcance, Verificada con operación) y nota de que «Sin comprobar» no significa fallo.
- Capacidades que ya existen en la app (HubSpot, Gmail, Calendar, Drive, Docs, Sheets) con su descripción tomada de `SalesWorkspace.tsx`. Cada una muestra configuración, autorización, alcance y evidencia **por separado** como «○ Sin comprobar» / «Sin dato». Ninguna aparece conectada ni verificada.
- **A:** comparativa por filas. **B:** selector de capacidad y detalle con los cuatro estados en bloques.
- «Conectar o autorizar una cuenta» está deshabilitado con su explicación; no simula una autorización.

**Ficha lateral** (se abre desde Hoy y Comercial): estructura de `CustomerDossier` — origen («○ Prototipo · sin captura»), hechos sin dato, Oportunidades con «Preparar seguimiento» **deshabilitado** más las cuatro causas de bloqueo que la app ya contempla (mejora 4 de CLAUDE-002), «Próxima acción» con edición temporal y «Guardar» deshabilitado/explicado, y «Actividad guardada» vacía con la razón posible (mejora 10).

**Interacción real:** navegación local entre vistas (mueve el foco al título y lo anuncia), comparación A/B, abrir y cerrar ficha (botón, Escape o clic fuera; el foco vuelve al control que la abrió; el resto de la página queda `inert` y el tabulador se mantiene dentro), búsqueda, desplegar clientes, edición temporal y restablecer.

## Diferencias de composición (no solo estéticas)

| Vista | A | B |
| --- | --- | --- |
| Hoy | Una lista; la información y la acción están **en la fila**. | Cola de selección + panel de detalle del elemento activo; la acción está en el panel. |
| Comercial | Acordeón en una columna; el contexto y el borrador aparecen bajo el cliente. Pie de revisión al final del panel. | Cola persistente + tres bandas; el cliente activo, el contexto, el borrador y la revisión conviven; pie pegajoso. |
| Conexiones | Tabla comparativa de todas las capacidades. | Una capacidad cada vez con sus cuatro estados. |

Ambas usan los mismos campos, estados y textos.

## Verificación realmente hecha

- `node --check design/claude/prototipo.js`: **sintaxis correcta** (sin salida de error).
- Revisión estática con comandos locales de solo lectura: equilibrio de llaves del CSS (0), sin ids duplicados en el HTML, y todos los ids que el JS busca por selector fijo existen en el HTML (los prefijos `#t-…`, `#vista-…` y `#sin-resultados` se resuelven o crean en tiempo de ejecución).
- Búsqueda de APIs prohibidas en los tres archivos (`fetch`, `XMLHttpRequest`, `WebSocket`, `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `sendBeacon`, `eval`, `innerHTML`, `url(`, `@import`, `http(s)://`): sin coincidencias salvo la frase explicativa del comentario inicial del JS. El HTML solo enlaza `prototipo.css` y `prototipo.js` locales.
- Repaso manual del código buscando errores de ejecución evidentes (se corrigió uno: el texto inicial de la nota de revisión).

## Lo que NO se ha comprobado

- **No he abierto el archivo en ningún navegador ni ejecutado el JavaScript.** No sé si renderiza como espero. Todo el comportamiento descrito arriba procede de la lectura del código, no de haberlo visto funcionar.
- Sin comprobar a 1440 / 1024 / 390 / 320 px: ausencia de desbordamiento, columnas vacías, recortes del pie pegajoso, solapes de rejilla ni el ancho real de la ficha. Las reglas están pensadas para esos anchos pero son hipótesis hasta que Codex las renderice. Puntos a mirar primero: filas de Hoy A en el tramo medio (≈760 px de contenedor a 1024), cabecera de la tabla de Conexiones A, comportamiento del `position: sticky` del pie en B dentro del contenedor desplazable, y la altura del bloque de controles a 320 px.
- Contraste: usé los tokens de `DESIGN.md` y estimé la relación de los pares principales a ojo; **no la he medido con herramienta**. Los botones deshabilitados usan `#5b6b82` sobre `#eaf0f6` para mantenerlos legibles.
- Accesibilidad: no probé lector de pantalla ni teclado real. Foco visible (`:focus-visible`), orden, `aria-current`/`aria-expanded`/`aria-pressed`, diálogo modal con `inert` y trampa de tabulación son diseño, no resultado medido. Pendiente confirmar que `inert` y `@container` se comportan en el navegador de pruebas de Codex.
- La metaetiqueta de política de seguridad (CSP) del HTML solo bloquea conexiones, imágenes, fuentes, marcos y objetos como refuerzo; no la he visto actuar. No restringe los scripts ni estilos locales, para no impedir la apertura como archivo.
- Objetivos táctiles de 44 px a ≤600 px y 36 px en escritorio: así están en el CSS, sin medir.

## Límites de honestidad del propio prototipo

- Los «Registro vacío 1–3» son posiciones de maquetación, no clientes. No hay nombres, correos, empresas, importes, fechas, métricas ni mensajes enviados.
- «Sin comprobar» no es un estado del producto real: significa que el prototipo no tiene información.
- Nada se guarda: recargar borra lo escrito. El fragmento de URL solo fija el estado de las pantallas.
- Ninguna acción de envío, aprobación, ejecución, autorización o guardado está operativa, y ninguna muestra éxito.
- No hay IA, red, ni lectura de `data/`, `.env*` o instalaciones locales.

## Decisiones que conviene revisar

1. **Un único control A/B para las tres vistas.** La recomendación de CLAUDE-002 es distinta por vista (Hoy A, Comercial B); el control global permite compararlas lado a lado y la recomendación de la vista activa se muestra debajo. Si Codex prefiere un control por vista, es un cambio pequeño en `prototipo.js`.
2. **Conexiones sin recomendación.** CLAUDE-002 no elige A/B para Integraciones; se ofrecen ambas y la revisión visual debería decidir si la tabla (A) o el detalle (B) comunica mejor la separación configurada/autorizada/verificada.
3. **«Preparar seguimiento» navega, no crea.** Refleja la mejora 1 (acción propia en la fila) sin simular una propuesta.
4. **Cambios que esta forma de prototipar no valida:** volumen real de clientes, comportamiento con textos largos reales y los estados de carga/error/permiso (solo se muestran el vacío y las causas posibles de bloqueo).

## Siguiente paso

Revisión visual de Codex en un perfil de pruebas separado (escritorio y móvil); si pide correcciones, una ronda acotada con `revise`. No se declara este prototipo integrado ni conectado. La presentación (`submit`) la hace el agente principal.
