# Plan B · Sistema de interfaz (identidad «Consola de operaciones»)

Identidad vigente desde el 20/11/2026: **«Consola de operaciones»**. Sustituye a «Cuaderno · tinta y papel» (19/11/2026), que el usuario rechazó por desordenado, con huecos vacíos y piezas que se salían de su sitio. Antes hubo «Faro» y «Grafito». Plan B es lo que toma el mando cuando el CRM cae, y la interfaz es el puesto de operaciones de una oficina comercial. Un bastidor grafito sostiene el menú. La mesa de trabajo es un gris frío y liso. Cada bloque de trabajo es una **bahía** con su regla superior, como los módulos de una consola, y los registros son **tiras** claras encima. La pantalla entera trabaja: lo que no cabe se desplaza dentro de su bahía y no deja hueco.

Todo vive en `src/consola.css`, que se importa la **última** en `src/main.tsx` (después de `faro.css`) y gana la cascada. Las capas anteriores siguen cargadas por estructura, pero su aspecto queda sustituido. Las piezas con hoja propia (`src/app-shell/agenda.css` y similares) usan solo tokens. Brief de superficie y contrato de dirección: `.impeccable/surfaces/src-app-shell.md`.

## Tres tintas sobre la mesa

Cada tinta tiene un único significado. No se usan para decorar.

| Tinta | Significa | Claro | Oscuro |
| --- | --- | --- | --- |
| Cobalto (`--primary`, `--primary-text`) | lo que se pulsa, la selección, el foco y «hoy» | `#2853d0` · texto `#2049c0` | `#3d63db` · texto `#a9bdff` |
| Señal (`--danger`, sello `--seal`) | vencido, en riesgo, error | `#be2a1d` / `#fdebe9` · sello `#d92d20` | `#ff9b90` / `#381715` · sello `#ff8a7d` |
| Ámbar (`--warning`, sello `--seal-warn`) | pendiente de revisar, aviso | `#7f5200` / `#fcefd0` · sello `#d89614` | `#efc462` / `#2b2310` · sello `#efc462` |

Además, el **gris lápiz** (`--pencil`, trazo discontinuo) marca borradores, simulaciones y datos de prueba, y el **verde** (`--success`) solo confirma (hecho, sin riesgo).

| Superficie | Claro | Oscuro |
| --- | --- | --- |
| Mesa (lienzo, liso) | `#eceef2` | `#111318` |
| Bahía hundida (`--bay`) · tira (`--strip`) | `#e3e6eb` · `#ffffff` | `#0d0f13` · `#1e2127` |
| Hoja · apoyo · hover · activo | `#ffffff` · `#f4f5f7` · `#e7eaef` · `#e4eafb` | `#191c21` · `#1e2127` · `#262a31` · `#1f2947` |
| Bastidor del menú (en los dos temas) | `#1b1f26`; placa activa `#2f3541`, icono activo `#a9bdff` | `#0c0e11`; activa `#222731` |
| Texto 1 · 2 · 3 | `#14171c` · `#363d47` · `#565e6a` | `#e8ebef` · `#c4cad3` · `#9aa3ae` |
| Filete · borde · borde fuerte · borde de campo | `#e9ecf0` · `#dde1e7` · `#c5cbd4` · `#78818e` | `#23262d` · `#2a2e36` · `#3a3f49` · `#7a8390` |

Las etapas abiertas del tablero y de «Oportunidades abiertas» son diluciones del cobalto, de la primera (clara) a la última (plena). La ganada va en verde y la perdida en lápiz; el color guardado en cada etapa se ignora a propósito. Los componentes nuevos nunca llevan colores fijos, siempre tokens, para que el modo oscuro («la misma sala con la luz apagada») funcione solo. Las variables heredadas del cuaderno (`--paper`, `--ink`, `--pen`, `--seal`, `--pencil`…) se siguen definiendo porque otras hojas las usan. Todo par texto/fondo cumple AA en claro y oscuro. Lo comprueba `tests/design-tokens.test.ts` sobre los tokens efectivos (`planb-ui` → `faro` → `consola`).

## Estados como sellos y reglas

- **Vencido:** sello cuadrado de 6 px en señal y texto en señal (`■ Vencida · 16 d`). Sin fondo ni subrayado. Nunca un bloque rojo.
- **Aviso / por revisar:** sello y texto ámbar. El fondo ámbar solo va en recuentos y avisos de bloque.
- **Hecho:** verde, o tachado cuando la tarea se cierra.
- **Datos de prueba / simulación:** recuadro de trazo discontinuo.
- **Hoy:** regla cobalto (columna de Inicio, carril de Agenda, «Hoy» de la semana).
- **Tipo de elemento en la Agenda:** el mismo sello de 6 px, gris para tareas, cobalto para cierres y señal si vence.
- Ninguna tarjeta, ficha ni aviso lleva franja de color a un lado. La regla de color solo va **arriba** de una bahía (la etapa del tablero) y mide 2 px.

## Tipografía

- Una sola familia de trabajo: «Faro Sans» = Inter (variable, latín, SIL OFL, empaquetada en `src/assets/fonts/`).
- Escala: h1 20 px; h2 y cuerpo 13; secundario 12; metadatos 11; cifras destacadas 15–20. Cifras tabulares en tablas, recuentos, fechas e importes.
- La jerarquía sale de la escala y del peso, no del color. Hay **una sola cifra grande por pantalla**, la que dice qué urge.
- Los títulos de página son el nombre del apartado del menú («Hoy», «Agenda», «Continuidad»…), no un eslogan.
- Español en toda la interfaz; vocabulario en `docs/voz.md`.

## Densidad y medidas

- Todo mide múltiplos de 4 px.
  - Controles de 28 px y filas de 32 px.
  - Barra superior de 40 px.
  - Menú de 200 px (192 px por debajo de 1150 px).
  - Márgenes de página de 24 / 16 / 12 px.
- Radios de 2–4 px, 6 px en capas flotantes y en la esquina de la mesa contra el bastidor. Filetes de 1 px. Sombra solo en capas flotantes (menús, paleta, ventanas).
- Densidad «cómoda» (Órdenes → Densidad): filas de 40 px y controles de 32 px, solo por encima de 600 px.
- Móvil (≤ 600 px): controles de 40 px, filas de 44 px y objetivos táctiles de 44 px.

## Composición

- **Marco:** bastidor grafito (menú) y mesa lisa con la esquina superior izquierda redondeada. Sin tramas ni texturas.
- **Barra superior:** una línea de estado.
  - A la izquierda, la copia con su antigüedad y el modo de datos (`Datos de prueba` en trazo discontinuo).
  - A la derecha, solo iconos con nombre accesible.
  - En móvil, el rótulo «Copia activa ·» se oculta a la vista (lo siguen leyendo los lectores de pantalla) y queda solo la antigüedad, con elipsis. La ayuda «?» se abre desde la paleta de Órdenes.
- **Cabecera de página:** una fila con título, contexto (periodo, recuento) y controles a la derecha. Si no caben, las acciones pierden la etiqueta Pro y el título se recorta con elipsis, nunca se parte.
- **Inicio:**
  - Los bloques van separados por el mismo hueco de 16 px (lo pone el `gap` de la columna; los márgenes heredados se anulan).
  - «La semana en una línea» es la pieza de firma: una columna por día, fines de semana sombreados, hoy con regla cobalto y compromisos del Radar como rombos (también en la leyenda).
  - Debajo, «Tu siguiente paso» (el único botón lleno de la pantalla) y las tarjetas de trabajo.
  - A la derecha, las fichas de consulta.
  - Todas las tarjetas comparten cabecera (rótulo y acción sobre un filete) y el rótulo queda alineado a 16 px del borde en todas.
- **Agenda (a toda altura en escritorio):**
  - La página mide exactamente el alto de la ventana, sin desplazamiento del documento.
  - El calendario lleva dentro su regla de cifras (tareas, cierres con importe, vencidas aquí, sin fecha), la de más carga y las acciones «Copiar semana/mes» y «Al calendario».
  - **Semana:** siete carriles de día a toda altura, con una línea de capacidad.
  - **Mes:** filas que reparten el alto.
  - El panel del día (320 px) se desplaza por dentro. Lleva lo vencido sin resolver con su recuento grande en señal, «A 7 días» para los cierres y la nota al pie.
  - En móvil, las cifras forman una regla de cuatro columnas (número sobre rótulo) y los días se apilan.
- **Hoy y Propuestas:** la cola es una lista de turno.
  - Pestañas subrayadas con recuento, grupos con cabecera gris y filas de 32 px.
  - «Abrir» es discreto y toda la fila es pulsable; con ↑ ↓ se pasa de una tarea a otra.
- **Listas:**
  - Título y acciones en la primera fila; búsqueda, vistas y totales debajo.
  - En móvil, tarjetas con pares etiqueta · valor. Correo y web ocupan la fila entera para no partirse.
- **Oportunidades:**
  - Cada etapa es una bahía hundida con la regla de 2 px de su etapa arriba y la cabecera en una línea (nombre, recuento y «+»), con el total y su barra de peso debajo.
  - Las fichas son tiras claras de tres filas: nombre e importe; empresa y contacto; cierre como nota al pie con sello.
  - Con ↑ ↓ se recorre una columna y con ← → se salta a la vecina (Alt + ← → mueve la ficha).
- **Continuidad:**
  - Pestañas Estado · Evidencia e impacto · Copias y archivo · Operaciones.
  - Estado abre con la franja de preparación (veredicto con sello, «n de 5» y cinco marcas) y una regla de constantes separadas por filetes. Debajo, «Si HubSpot cae ahora».
  - Todo se deriva en `src/app-shell/continuity-insights.ts` a partir de `/v2/continuity`, sin peticiones nuevas.
- **El aviso flotante** sale del bastidor: grafito en los dos temas.
- **Capas flotantes** (paneles, práctica guiada) nunca tapan los botones de una ficha abierta.

## Estados de carga, vacío y error

- **Cargando:** `ui-loading` sobre el mismo párrafo de siempre; sin animación si se pide movimiento reducido.
- **Vacío:** `ui-empty` (neutro) y `ui-empty-ok` (✓ «todo en orden», solo si hay copia que mirar). Los recuadros vacíos van en trazo discontinuo.
- **Error:** texto en señal con «!» y qué hacer. Si el servidor local no responde: «No hubo respuesta de tu copia local…».
- Los textos de estos estados no se cambian por estilo: las pruebas los buscan literalmente.

## Comprobación antes de dar algo por bueno

- **Pruebas seguras:** `node tools/safe-tests.mjs`.
  - Incluyen contraste y orden de carga (`design-tokens`), colores fijos (`color-guard`), reglas sin uso o duplicadas (`css-unused`) y el presupuesto de CSS inicial (`bundle-budget`, ≤ 380.928 B).
- **Revisión a ojo:** en la pestaña de la app ya abierta, a 1440, 1366 y 390 px, en claro y oscuro.
- **Sin** baterías de navegador, servidores nuevos ni datos reales.
- **Contra el CRM real,** siempre en solo lectura.

## Contextos y verdad de producto

La App local y la del equipo comparten vocabulario visual, pero mantienen bases y permisos separados. El contexto debe estar identificado; el diseño no suplanta la autenticación ni mezcla datos. Los logos oficiales se sirven localmente. Demo, simulación, aceptación del proveedor, verificación y resultado incierto se distinguen siempre.

Referencia estructural, auditoría y decisiones: `UX-ARQUITECTURA-0.6.md`.

## Correo comercial

Preferencia del usuario del 27/10/2026: sobrio y personal.

- Texto con contexto comprobable, sin falsa familiaridad ni acuerdos inventados.
- Firma opcional y reunión claramente separada.
- La vista previa conserva un ancho legible, los párrafos y la fecha y hora de Madrid.
- Sin cabeceras promocionales, imágenes remotas ni ornamentación de newsletter.
- Las alternativas HTML y texto se generan desde el mismo contenido revisado.
- Las tablas de presentación del correo se aíslan de los estilos de tablas de datos del CRM: no heredan `nowrap`, la alineación de la última columna ni la altura de las filas.
- Un cambio de firma o de formato invalida la aprobación, igual que un cambio de destinatario.
