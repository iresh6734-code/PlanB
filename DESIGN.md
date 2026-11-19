# Plan B · Sistema de interfaz (identidad Cuaderno)

Identidad vigente desde el 19/11/2026 («Cuaderno»; antes «Faro» y «Grafito»). Plan B es lo que una pyme usa cuando su CRM cae, y el plan B de siempre en una oficina española es **el cuaderno cuadriculado**: se apunta a mano, se tacha lo hecho, se subraya en rojo lo que vence y se marca con fluorescente lo que hay que revisar. La interfaz es ese cuaderno, ordenado y denso: papel con cuadrícula casi invisible, margen rojo, cuatro tintas y nada de decoración.

Todo vive en `src/cuaderno.css`, que se importa la **última** en `src/main.tsx` (después de `faro.css`) y gana la cascada. Las capas anteriores siguen cargadas por estructura; su aspecto queda sustituido. Brief de superficie: `.impeccable/surfaces/src-app-shell.md`.

## Las cuatro tintas

Un solo papel y cuatro tintas, cada una con un único significado. No se usan para decorar.

| Tinta | Significa | Claro | Oscuro |
| --- | --- | --- | --- |
| Azul (`--primary`, `--primary-text`) | lo que se pulsa, la selección y el foco | `#1d4ed8` · texto `#1c47c4` | `#2f5fe0` · texto `#94b2ff` |
| Boli rojo (`--danger`, `--pen`) | vencido, en riesgo, error | `#b42318` / `#fdecea` | `#ff8f85` / `#351b1b` |
| Fluorescente (`--warning`, `--highlighter`) | pendiente de revisar, aviso | `#664a00` / `#fff2a6` | `#f0d863` / `#2e2910` |
| Lápiz (`--pencil`) | borradores, simulaciones, datos de prueba (trazo discontinuo) | `#6b7079` | `#9ea5b0` |

| Papel | Claro | Oscuro |
| --- | --- | --- |
| Lienzo con cuadrícula · superficie · apoyo | `#f6f6f1` · `#fffffd` · `#f0f0ea` | `#15181d` · `#1b1f25` · `#20252c` |
| Menú lateral (papel más gris) | `#efefe8` | `#111419` |
| Margen rojo (borde entre menú y página) | `#e0a19d` | `#7d3a38` |
| Texto 1 · 2 · 3 | `#191d24` · `#383e48` · `#545a64` | `#e8ebf0` · `#c4c9d1` · `#9ea5b0` |
| Filetes · bordes · borde de campo | `#e7e9ec` · `#dcdfe3` · `#7a808a` | `#252a32` · `#2c323b` · `#79808c` |
| Éxito | `#1d6b3c` / `#e4f2e8` | `#82d6a0` / `#15291d` |

La cuadrícula es de 16 px (`--grid-line`, opacidad 7,5 % en claro y 4,5 % en oscuro) y solo se dibuja en el lienzo, nunca dentro de tarjetas ni tablas. Nunca colores fijos en componentes nuevos: siempre tokens, para que el modo oscuro («el cuaderno bajo la lámpara») funcione solo. Todo par texto/fondo cumple AA en claro y oscuro; lo comprueba `tests/design-tokens.test.ts` sobre los tokens efectivos (`planb-ui` → `faro` → `cuaderno`).

## Estados como trazos

Los estados se escriben como se haría a mano, no como pastillas de colores:

- **Vencido:** texto rojo subrayado con 2 px (`Vencida · 16 d`), punto cuadrado rojo en la línea semanal.
- **Aviso / por revisar:** fondo de fluorescente bajo el texto (no la caja entera).
- **Hecho:** verde, o tachado cuando la tarea se cierra.
- **Datos de prueba / simulación:** recuadro de trazo discontinuo («lápiz»).
- **Hoy:** línea roja vertical, como el margen.
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
- **Menú:** cinco lugares (Inicio, Hoy, Clientes, Continuidad, Ajustes) y Laboratorio, en acordeón; los recuentos se escriben como cifras subrayadas (rojo si hay vencidas). En móvil, barra inferior y «Más» (paleta).
- **Inicio:** título y saludo en una línea; «La semana en una línea» siempre visible como regla de días (fines de semana sombreados, hoy en rojo) con los recuentos al lado; después «Tu siguiente paso» como una línea escrita en tinta, y a la derecha el estado de la copia.
- **Hoy y Propuestas:** pestañas subrayadas con recuento, cola como hoja de cuaderno (grupos con cabecera gris, filas de 32 px, «Abrir →» discreto y toda la fila pulsable).
- **Listas:** cabecera con búsqueda, filtros rápidos y vistas; en móvil, tarjetas con pares etiqueta · valor.
- **Oportunidades:** tablero plano; las columnas se separan con un filete vertical, sin cajas de color.
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
