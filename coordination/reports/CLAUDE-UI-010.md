# CLAUDE-UI-010 · Mesa de trabajo comercial de Plan B · informe

Autor: Claude (Sonnet 5.5). Estado: **pendiente de revisión de Codex**. No he hecho `submit`, ni he aceptado, ni he tocado el tablón.

## Archivos entregados (los seis reservados, nada más)

- `design/claude/workspace-v2/index.html`
- `design/claude/workspace-v2/styles.css`
- `design/claude/workspace-v2/app.js`
- `design/claude/workspace-v2/README.md`
- `design/claude/workspace-v2/components.md`
- `coordination/reports/CLAUDE-UI-010.md` (este informe)

Antes de escribir comprobé las seis rutas con `check-path CLAUDE-UI-010 claude <ruta>` y las seis devolvieron `allowed: true`. No he leído otros archivos del repositorio (ni `AGENTS.md` ni `COORDINACION.md`: el encargo lo prohíbe expresamente y prevalece sobre la lectura general de `CLAUDE.md`), ni secretos, configuraciones, clientes o sesiones. No he usado agentes secundarios, red, MCP, cuentas, instalaciones, git, ni cambios de permisos, ni he modificado la app, CSS globales, `package.json`, lockfile, `AGENTS.md` o `CONTEXTO-PROYECTO.md`. Los scripts de comprobación viven en el directorio temporal de la sesión, fuera del repositorio.

## Qué se ha construido

Prototipo navegable (abrir `index.html`) con tres vistas (Hoy, Comercial, Integraciones), ficha lateral modal y selector de escenarios del prototipo (vacío, carga, error, solo lectura, origen desactualizado, datos de muestra). Detalle de flujos, límites y comprobaciones en `README.md`; contratos de componentes React, propiedad del estado y plan de tres entregas en `components.md`.

## Decisiones

1. **Núcleo puro + vista.** Las transiciones de selección, borrador, revisión y panel están en `reduce` y funciones auxiliares sin DOM, reloj ni azar (fechas e IDs entran por la acción). Es lo que se puede portar y probar; la vista solo traduce estado a nodos DOM.
2. **Una sola selección** (`selectedId`) para Hoy, Seguimiento, Archivos y ficha. El borrador se indexa por `espacio:cliente`, así que no puede aparecer en otro contexto.
3. **Borrador sin cliente** como respuesta al «vacío honesto»: permite abrir la mesa de preparación sin inventar clientes. Su destinatario es un correo editable que no afirma identidad CRM. Las acciones internas no se ofrecen allí (no tendrían cliente al que asociarse).
4. **«Acciones» que obligan a revisar de nuevo.** Como las acciones externas son interruptores deshabilitados (no cambian), la parte editable de «acciones» es la opción *acción interna* del borrador (con fecha). Cambiarla invalida la revisión; al marcar la revisión local crea esa acción interna, solo en memoria.
5. **Cola como lista de botones** con `aria-current`, no combobox: evita prometer un patrón de teclado completo que no se ha probado. En móvil se convierte en un botón desplegable que muestra el cliente elegido.
6. **Sin regiones `role=alert` reconstruidas.** Como la interfaz se vuelve a pintar en cada acción, los avisos viven en dos regiones persistentes (`status`/`alert`) y solo se anuncian al cambiar un contador de eventos discretos; no se anuncia nada al teclear y un mismo mensaje no se repite en 3 s.
7. **Foco por clave estable** (`data-pbw-key`), no por índice, para devolver el foco al cerrar la ficha y tras re-pintar. Los campos de texto y de búsqueda no se reconstruyen al teclear (solo se actualizan las regiones derivadas).
8. **Operación simulada de 350 ms** para crear/completar acciones internas: da sentido real a la causa «operación en curso», evita duplicados por doble clic y permite probar el deshabilitado.
9. **«Requieren revisión»** solo agrupa avisos calculables (vencida, sin correo, solo lectura, sin oportunidad, origen no activo). No hay clasificación de urgencia.
10. **Carga en Node.** El `package.json` del proyecto trata `.js` como ESM, así que el núcleo también se expone en `globalThis.PBWorkspace` (y en `module.exports` bajo CommonJS). En el navegador es un script clásico.

## Resultados reales de las comprobaciones

| Comprobación | Resultado |
|---|---|
| `node --check app.js` | Correcto |
| 17 grupos de pruebas de transiciones puras (Node) | 17/17 superados |
| Prueba de humo con DOM **simulado** mínimo (no es un navegador): 6 escenarios × 3 vistas, búsqueda y filtros, ficha (foco/`inert`/Escape/devolución de foco/doble envío), preparar, guardar, revisar, invalidar, Archivos, cola, aviso de cambio de espacio | Sin errores de ejecución |
| Búsqueda estática de `innerHTML`, `eval`, `fetch`/XHR, almacenamiento/cookies, URLs externas, TODO, relleno | Sin coincidencias (solo el espacio de nombres SVG como constante) |
| CSS sin selectores globales fuera de `.pbw-root` / prefijo `pbw-` | Verificado por búsqueda |

Durante las pruebas encontré y corregí un fallo real: `refreshToday`/`refreshQueue` pasaban un array a `replaceChildren`, que lo habría convertido en texto. Ahora usan un helper que acepta arrays.

## Límites y lo que NO se ha verificado

No se ha abierto ningún navegador (no había herramienta disponible ni permitida). Por tanto **no afirmo**: QA visual, contraste medido, navegación real con teclado, comportamiento con lector de pantalla, ni los cinco anchos pedidos (1440, 1024, 768, 390, 320). El diseño responsive está escrito (puntos de corte a 1180, 899 y 480 px, tablas con contenedor propio, sin anchuras fijas por encima de `100%`) pero sin comprobar. La lista de comprobaciones para Codex está al final de `README.md`.

Otros límites: sin modo oscuro ni impresión; la cola pagina de 60 en 60 sin virtualizar; las tareas CRM de muestra no se pueden completar; todo es memoria de la pestaña y desaparece al recargar. Los datos de muestra pertenecen solo a este prototipo y no deben insertarse en Plan B.

## Corrección tras la revisión real de Codex (ronda 2)

Codex revisó el prototipo en un navegador (15 checks de ancho sin overflow y 17 funcionales correctos, según su mensaje; no los he leído ni los repito) y no aceptó por un fallo reproducido de contraste: el botón «Preparar seguimiento» calculaba `color: rgb(18,39,67)` sobre `rgb(31,78,140)` (ratio 1,81). Mi QA anterior no podía verlo porque no usé navegador.

**Causa confirmada.** El reset `.pbw-root button { font: inherit; color: inherit }` tenía especificidad (0,1,1) y ganaba a las clases de variante (0,1,0), como `.pbw-btn--primary`. El mismo defecto afectaba a más cosas de las reportadas:
- `color` de `.pbw-tab` (pestaña inactiva) y de otros botones con clase.
- `font-weight`/`font-size` de `.pbw-btn` y de `.pbw-select--title`, también anulados por `font: inherit`.
- Los resets `.pbw-root p, ul, h1…h3, fieldset { margin:0; padding:0 }` anulaban `margin`/`padding` de clases pbw-* (por ejemplo el margen de `.pbw-banner__title` y el relleno superior de `.pbw-preview__body`).
- Una segunda regla, `.pbw-state--error .pbw-btn { color }` (0,2,0), habría repetido el fallo en «Reintentar» (botón principal dentro de un estado de error).

**Cambios** (solo en mis archivos reservados, sin `!important`):
1. `styles.css`: los tres resets pasan a `:where(.pbw-root …)`, que tiene especificidad 0 y se queda dentro de `.pbw-root`, así que nunca ganan a una clase y no afectan fuera. Eliminada `.pbw-state--error .pbw-btn { color }`, innecesaria porque `.pbw-btn` ya fija su color.
2. `index.html`: favicon SVG autocontenido en `data:` (cuadrado azul con una «P»), sin archivo nuevo ni red, para evitar el 404 de `favicon.ico`.
3. `README.md`: reflejado el cambio y la comprobación de cascada.

**Comprobación de esta ronda (sin navegador).** Escribí un resolvedor mínimo de cascada (especificidad + orden sobre `styles.css`, selectores simples; no es un navegador y no evalúa `@media`). Lo validé primero con el reset anterior, reconstruido en una copia temporal: reproduce el defecto (el color ganador es `inherit` desde `.pbw-root button`). Con el CSS corregido, los colores ganadores y el contraste calculado a partir de los tokens son:

| Variante | Color | Fondo | Ratio calculado |
|---|---|---|---|
| Principal («Preparar seguimiento») | `#ffffff` | `#1f4e8c` | 8,31 |
| Principal dentro de estado de error | `#ffffff` | `#1f4e8c` | 8,31 |
| Principal deshabilitado | `#53607a` | `#f3efe8` | 5,52 |
| Secundario / deshabilitado | `#122743` / `#53607a` | `#ffffff` / `#f3efe8` | 15,03 / 5,52 |
| Quiet | `#173b6b` | transparente sobre `#fbf9f5` | 10,65 |
| Actual | `#122743` | `#e6eef8` | 12,85 |
| Pestaña inactiva / activa | `#53607a` / `#173b6b` | transparente sobre `#fbf9f5` | 6,01 / 10,65 |
| Botón de icono | `#122743` | transparente sobre `#fbf9f5` | 14,30 |

Además, ningún selector `.pbw-root <etiqueta>` queda fuera de `:where`. El foco visible no cambia: sigue siendo `.pbw-root :focus-visible` (contorno de 3 px `#0b5fd6` con separación de 2 px y anillo blanco), que por especificidad (0,2,0) no lo pisa ningún reset; el estado deshabilitado conserva su regla propia `:disabled` (0,2,0), comprobada arriba.

Con `node --check` y las dos baterías de Node (17 grupos de lógica y prueba de humo con DOM simulado) siguen sin errores: el cambio no toca `app.js`.

**Lo que no he hecho y debe confirmar Codex en navegador.** Estos ratios salen de los tokens, no de `getComputedStyle`; no he medido nada en un navegador y no afirmo haber hecho el QA que hizo Codex. Como ahora sí se aplican los `margin`/`padding`/`font-weight`/`font-size` de las clases que antes quedaban anulados, el espaciado y la tipografía de botones, `.pbw-banner__title`, `.pbw-preview__body` y el selector de espacio cambian ligeramente respecto a lo que Codex midió. Conviene repetir sus checks de overflow a 1440, 1024, 768, 390 y 320 px sobre la versión nueva, además de los de contraste y foco visible. El tablón ha devuelto CLAUDE-UI-010 a *working* con reserva vigente; no hago `submit`. No he escrito archivos de Claude2 (UI-011) ni leído pruebas o informes de Codex.

## Para Codex

Revisar y decidir qué se integra. Sugerencia: empezar por la Entrega 1 de `components.md` (selector compartido), que es la que menos depende del backend. Pendiente de vosotros: `submit`/aceptación en el tablón y la verificación en navegador listada en el README.
