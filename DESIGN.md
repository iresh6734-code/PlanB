# Plan B · Sistema de interfaz (identidad Cuaderno · tinta y papel)

Identidad vigente desde el 19/11/2026 («Cuaderno»; antes «Faro» y «Grafito»), con la paleta «tinta y papel» del mismo día. Plan B es lo que una pyme usa cuando su CRM cae, y el plan B de siempre en una oficina española es **el cuaderno**: se apunta a mano, se tacha lo hecho, se sella lo que vence y se marca lo que hay que revisar. La interfaz es ese cuaderno de papelería, ordenado y denso: papel marfil con trama de puntos, tapas de cartón kraft para el menú, un margen de lacre, cuatro tintas y nada de decoración.

Todo vive en `src/cuaderno.css`, que se importa la **última** en `src/main.tsx` (después de `faro.css`) y gana la cascada. Las capas anteriores siguen cargadas por estructura; su aspecto queda sustituido. Brief de superficie: `.impeccable/surfaces/src-app-shell.md`.

## Las cuatro tintas

Un solo papel y cuatro tintas, cada una con un único significado. No se usan para decorar.

| Tinta | Significa | Claro | Oscuro |
| --- | --- | --- | --- |
| Ultramar (`--primary`, `--primary-text`) | lo que se pulsa, la selección y el foco | `#2f3e9e` · texto `#2c3a96` | `#5566d6` · texto `#aeb9f4` |
| Lacre (`--danger`, `--pen`, sello `--seal`) | vencido, en riesgo, error | `#a3302b` / `#f8e6e1` · sello `#a3302b` | `#f19a8d` / `#3a1e1a` · sello `#e77d6f` |
| Ocre (`--warning`, sello `--seal-warn`) | pendiente de revisar, aviso | `#6b4800` / `#f5e3b5` · sello `#c08a1e` | `#e9c66b` / `#2f2713` · sello `#d7aa45` |
| Lápiz (`--pencil`) | borradores, simulaciones, datos de prueba (trazo discontinuo) | `#7a7262` | `#a8a092` |

| Papel | Claro | Oscuro |
| --- | --- | --- |
| Lienzo punteado · superficie · apoyo | `#f5f1e6` · `#fffcf4` · `#efe9db` | `#191815` · `#201e1a` · `#26241f` |
| Menú lateral (cartón kraft; de noche, cuero) | `#e6d9bf` · pestaña activa `#f7f1e2` | `#12110e` · activa `#272b47` |
| Margen de lacre (borde entre menú y página) | `#d8a397` | `#6e3a33` |
| Texto 1 · 2 · 3 | `#1f1c17` · `#3d382f` · `#5b5447` | `#ede7da` · `#cfc8b9` · `#a8a092` |
| Filetes · bordes · borde de campo | `#e9e2d3` · `#ddd5c4` · `#7d7565` | `#2a2723` · `#34312b` · `#877f71` |
| Verde botella (solo confirma: hecho, sin riesgo) | `#2c6643` / `#e2eee3` | `#93d1a7` / `#172a1f` |

La trama es de puntos cada 16 px (`--grid-line`) y solo se dibuja en el lienzo, nunca dentro de tarjetas ni tablas. Las etapas abiertas del tablero y de «Oportunidades abiertas» son diluciones de la tinta ultramar (de clara a plena según avanzan); ganada en verde botella y perdida a lápiz. El color guardado en cada etapa se ignora a propósito. Nunca colores fijos en componentes nuevos: siempre tokens, para que el modo oscuro («el cuaderno bajo la lámpara») funcione solo. Todo par texto/fondo cumple AA en claro y oscuro; lo comprueba `tests/design-tokens.test.ts` sobre los tokens efectivos (`planb-ui` → `faro` → `cuaderno`).

## Estados como sellos y trazos

Los estados se escriben como se haría a mano, no como pastillas de colores:

- **Vencido:** sello cuadrado de lacre de 6 px y texto en lacre (`■ Vencida · 16 d`); sin subrayado ni fondo. En «Tu siguiente paso», el mismo sello de 8 px delante del título.
- **Aviso / por revisar:** sello ocre y texto ocre; el fondo ocre solo en recuentos y avisos de bloque.
- **Hecho:** verde botella, o tachado cuando la tarea se cierra.
- **Datos de prueba / simulación:** recuadro de trazo discontinuo («lápiz»).
- **Hoy:** línea de lacre vertical, como el margen.
- Ninguna tarjeta ni aviso lleva franja de color a la izquierda: la marca, si existe, es de 1 px.

## Tipografía

- Una sola familia de trabajo: «Faro Sans» = Inter (variable, latín, SIL OFL, empaquetada en `src/assets/fonts/`). La serif editorial ya no se usa en la interfaz.
- Escala: h1 20 px, cuerpo 13, secundario 12, metadatos 11, cifras destacadas 15. Cifras tabulares en tablas, recuentos, fechas e importes.
- Los títulos de página son el nombre del apartado del menú («Hoy», «Continuidad», «Exportar»…), no un eslogan: la persona sabe siempre dónde está.
- Español en toda la interfaz; vocabulario en `docs/voz.md`.

## Densidad y medidas

- Todo mide múltiplos de 4 px. Controles de 28 px, filas de 32 px, barra superior de 40 px, menú de 200 px (188 px por debajo de 1150 px).
- Radios de 2–4 px (6 px en capas flotantes). Filetes de 1 px. Sombra solo en capas flotantes (menús, paleta, ventanas).
- Móvil (≤ 600 px): controles de 40 px y filas de 44 px; objetivos táctiles de 44 px.

## Composición

- **Barra superior:** a la izquierda, el estado de la copia (con su antigüedad) y el modo de datos (`Producción · lectura` o `Datos de prueba`, este último en trazo de lápiz); a la derecha, solo iconos con nombre accesible: tema, órdenes (Ctrl J), bloquear y ayuda. El nombre de la copia vive al pie del menú.
- **Menú:** cinco lugares (Inicio, Hoy, Clientes, Continuidad, Ajustes) y Laboratorio, en acordeón; los recuentos se escriben como cifras subrayadas (lacre si hay vencidas). En móvil, barra inferior y «Más» (paleta).
- **Inicio:** título y saludo en una línea; «La semana en una línea» siempre visible como regla de días (fines de semana sombreados, hoy en lacre) con los recuentos al lado; después «Tu siguiente paso» como una línea escrita en tinta (el único botón lleno de la pantalla), y a la derecha fichas de consulta (estado de la copia, Radar, calidad) con botones de contorno. Todas las tarjetas llevan la misma cabecera: rótulo y acción sobre un filete.
- **Hoy y Propuestas:** pestañas subrayadas con recuento, cola como hoja de cuaderno (grupos con cabecera gris, filas de 32 px, «Abrir →» discreto y toda la fila pulsable). El título de la tarea «Acción · Cliente» se escribe con la acción en tinta y el cliente a lápiz; con ↑ ↓ se pasa de una tarea a otra.
- **Listas:** cabecera con búsqueda, filtros rápidos y vistas; en móvil, tarjetas con pares etiqueta · valor.
- **Oportunidades:** tablero plano; las columnas se separan con un filete vertical y su cabecera lleva un filete de 2 px en la tinta de la etapa. El cierre de cada ficha es una nota al pie con sello. Con ↑ ↓ se recorre una columna y con ← → se salta a la vecina (Alt + ← → mueve la ficha).
- **Continuidad:** pestañas Estado · Evidencia e impacto · Copias y archivo · Operaciones; parte para compartir.
- Capas flotantes (paneles, práctica guiada) nunca tapan los botones de una ficha abierta.

## Estados de carga, vacío y error

- **Cargando:** `ui-loading` sobre el mismo párrafo de siempre; sin animación con movimiento reducido.
- **Vacío:** `ui-empty` (neutro) y `ui-empty-ok` (✓ «todo en orden», solo si hay copia que mirar); recuadros vacíos en trazo discontinuo.
- **Error:** texto rojo con «!» y qué hacer; sin respuesta del servidor local: «No hubo respuesta de tu copia local…».
- Los textos de estos estados no se cambian por estilo: las pruebas los buscan literalmente.

## Comprobación antes de dar algo por bueno

`tests/design-tokens.test.ts` (contraste efectivo y orden de carga) y `tools/visual/`: `a11y.mts` (contraste, nombres, foco, h1; `PLANB_THEME=dark`, `PLANB_VIEWPORT=390x844`), `dark-scan.mts` (superficies claras en oscuro), `check.mts` (vistas × medidas, desbordes), `nav.mts`. Revisar siempre a 1440, 1366 y 390 px, en claro y oscuro. Contra el CRM real, siempre en solo lectura.

## Contextos y verdad de producto

App local y equipo comparten vocabulario visual pero mantienen bases y permisos separados. El contexto debe estar identificado; no suplantar autenticación ni mezclar datos mediante el diseño. Logos oficiales se sirven localmente. Demo, simulación, aceptación del proveedor, verificación y resultado incierto se distinguen siempre.

Referencia estructural, auditoría y decisiones: `UX-ARQUITECTURA-0.6.md`.

## Correo comercial

Preferencia del usuario, 27/10/2026: sobrio y personal. Texto con contexto comprobable, sin falsa familiaridad ni acuerdos inventados; firma opcional y reunión claramente separada. La vista previa conserva un ancho legible, párrafos y fecha/hora de Madrid. Sin cabeceras promocionales, imágenes remotas ni ornamentación de newsletter. Alternativas HTML/texto generadas desde el mismo contenido revisado. Aislar las tablas de presentación del correo de los estilos de tablas de datos del CRM; no heredar `nowrap`, alineación de la última columna ni alturas de filas. Un cambio de firma o formato invalida la aprobación igual que un cambio de destinatario.
