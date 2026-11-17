# Plan B · Sistema de interfaz (identidad Faro)

Identidad vigente desde el 11/11/2026 («Faro», antes «Grafito»): software para que una pyme siga trabajando si su CRM falla. Sobrio, denso donde se consulta y cómodo donde se escribe. Todo vive en `src/faro.css`, que se carga la última; los valores de esta página son los de ese archivo. Historial y decisiones: `coordination/reports/CLAUDE-FABLE-UI-GRAFITO.md`.

## Color

Tokens en `:root` y su versión oscura en `html[data-theme="dark"]`. Nunca colores fijos en componentes nuevos: siempre tokens, para que el modo oscuro funcione solo.

| Uso | Claro | Oscuro |
| --- | --- | --- |
| Lienzo · superficie · capa de apoyo | `#eef1ee` · `#ffffff` · `#f4f6f3` | `#0d1719` · `#142326` · — |
| Barra lateral (petróleo) | `#0e2a2f` | `#081113` |
| Texto 1 · 2 · 3 | `#14211f` · `#364643` · `#55645f` | `#e8f0ee` · `#c4d2cf` · `#9ab0ac` |
| Bordes · bordes marcados | `#dbe2dd` · `#c2cdc6` | `#253a3e` · — |
| Acción (verde petróleo) · texto de acción | `#0d6b63` · `#0b5f58` | `#0f766c` · `#6fd6c8` |
| Señal (ámbar: página actual, avisos de la copia) | `#f0a92b` | — |
| Éxito · aviso · error (texto / fondo) | `#1b6a45` / `#e2f2e8` · `#7c4c06` / `#fbeed0` · `#a8281f` / `#fbe9e6` | `#7fd9ab` · `#f2c46f` · `#ffa197` |

Tonos de etiqueta `--tone-0` … `--tone-5` con su versión oscura. Todo texto cumple AA (4,5:1; 3:1 en grande); lo comprueba `tests/design-tokens.test.ts` y la auditoría de abajo.

## Tipografía

- **Texto:** «Faro Sans» = Inter; **títulos:** «Faro Serif» = Source Serif 4. Variables 400–700, subconjunto latino, licencia SIL OFL, empaquetadas en `src/assets/fonts/` (sin peticiones externas). Respaldo: Segoe UI Variable / Sitka del sistema.
- Escala: h1 23 px, h2 y texto destacado 14, cuerpo 13, secundario 12, metadatos 11. Cifras tabulares en datos.
- Español en toda la interfaz; vocabulario en `docs/voz.md`. Ni identificadores internos ni mensajes técnicos del navegador a la vista.

## Densidad y tamaños

- Listas, tablas y navegación de escritorio: densas (controles de 30 px, filas de 36).
- Superficies donde se escribe o confirma (ficha, acceso, comprobación manual, preparación, historial, revisión de copia): controles de 44 px.
- Móvil (≤ 600 px): todo control de 44 px como mínimo.
- Radios 7 px (controles) y 10 px (tarjetas); borde de 1 px; sombras solo en capas flotantes.

## Estados (comunes a toda la app)

- **Cargando:** clase `ui-loading` sobre el mismo párrafo de siempre (indicador que gira y líneas con la forma del contenido); sin animación con movimiento reducido.
- **Vacío:** `ui-empty` (neutro: «no hay datos») y `ui-empty-ok` (✓ «todo en orden», solo si hay copia que mirar).
- **Error:** recuadro con acento rojo y «!»; mensaje en español. Sin respuesta del servidor local: «No hubo respuesta de tu copia local…» (solo para el error de red del navegador; los demás conservan su detalle).
- Los textos de estos estados no se cambian por estilo: las pruebas los buscan literalmente.

## Composición

- **Menú de cinco lugares** (Inicio, Hoy, Clientes, Continuidad, Ajustes) y **Laboratorio** con datos de prueba. En móvil, barra inferior y «Más» (paleta).
- **Paleta de órdenes** (Ctrl J): ir a cualquier apartado, acciones y buscar registros.
- **Listas:** cabecera con búsqueda, filtros rápidos y vistas (inteligentes y guardadas); en móvil, tarjetas con pares etiqueta · valor. Los recuentos dicen si un filtro solo ve la página cargada.
- **Continuidad:** pestañas Estado · Evidencia e impacto · Copias y archivo · Operaciones; cronología de 14 días; parte para compartir.
- **Avisos de la copia:** insignia en el menú y lista en Inicio, cada aviso con un botón a donde se arregla.
- **Espacio de equipo (`/team`):** misma identidad; en móvil, rejilla con todas las secciones a la vista y tablas como tarjetas.
- Capas flotantes (paneles, práctica guiada) nunca tapan los botones de una ficha abierta.

## Comprobación antes de dar algo por bueno

`tools/visual/`: `a11y.mts` (contraste, nombres, foco, h1; `PLANB_THEME=dark`, `PLANB_VIEWPORT=390x844`), `dark-scan.mts` (superficies claras en oscuro), `check.mts` (18 vistas × 4 medidas, desbordes), `nav.mts` (navegación por la paleta). Contra el CRM real, siempre en solo lectura.

## Contextos y verdad de producto

App local y equipo comparten vocabulario visual pero mantienen bases y permisos separados. El contexto debe estar identificado; no suplantar autenticación ni mezclar datos mediante el diseño. Logos oficiales se sirven localmente. Demo, simulación, aceptación del proveedor, verificación y resultado incierto se distinguen siempre.

Referencia estructural, auditoría y decisiones: `UX-ARQUITECTURA-0.6.md`. Esta etapa forma parte del cierre 0.6 y no declara aceptada la nube.

## Correo comercial

Preferencia del usuario, 27/10/2026: sobrio y personal. Texto con contexto comprobable, sin falsa familiaridad ni acuerdos inventados; firma opcional y reunión claramente separada. La vista previa conserva un ancho legible, párrafos y fecha/hora de Madrid. Sin cabeceras promocionales, imágenes remotas ni ornamentación de newsletter. Alternativas HTML/texto generadas desde el mismo contenido revisado. Aislar las tablas de presentación del correo de los estilos de tablas de datos del CRM; no heredar `nowrap`, alineación de la última columna ni alturas de filas. Un cambio de firma o formato invalida la aprobación igual que un cambio de destinatario.
