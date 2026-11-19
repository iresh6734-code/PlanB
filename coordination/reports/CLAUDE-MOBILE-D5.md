# CLAUDE-MOBILE-D5 · El móvil sin recortes ni desplazamiento lateral

**Autor:** Claude (Opus 5.5) · **Fecha:** 18/11/2026 · **Origen:** mejora D5 del informe (parte), por orden del usuario. `src/faro.css` es compartido; se editó con autorización y quedan sus huellas.

## Qué se encontró

Se midieron 10 vistas a 390 y 320 px en Chromium móvil, con pantalla táctil, sobre el ensayo aislado con datos de prueba.

1. **La barra superior recortaba «Datos de prueba» en todas las vistas.** Una regla móvil antigua (`design-system.css`, de cuando la etiqueta iba en su propia línea) le daba `width: 100%`. La barra actual de Faro es de una sola línea y oculta lo que sobra: tenía 630 px de contenido en 390.
2. **A 320 px el nombre del espacio y del lugar quedaban en «A. /»,** letras sueltas sin sentido.
3. **En Clientes a 320 px la página se desplazaba de lado 2 px.** El culpable era un correo largo (`adrian.pascual@example.com`) que no cabía en su tarjeta.
4. **Lo que no es un problema:** las filas de filtros (Hoy), las vistas guardadas, las pestañas de Continuidad y la semana de Inicio se salen de la pantalla, pero desplazan por sí mismas (`overflow-x: auto`). Es un patrón buscado y se deja.

## Qué cambió

Todo va en `src/faro.css`, solo en móvil, dentro del bloque de D7 y D5:

- **Barra superior:**
  - la etiqueta ocupa su ancho;
  - el nombre del lugar cede con puntos suspensivos;
  - el nombre del espacio de trabajo no se muestra en el móvil (se encogía hasta desaparecer).
- **Menos de 360 px:**
  - el botón de tema queda solo con su icono, y su nombre accesible «Modo oscuro» se mantiene;
  - el lugar tampoco se muestra, porque el título de la página ya lo dice.
- **Página:**
  - `.main-content` recorta su desbordamiento horizontal con `overflow-x: clip`. A diferencia de `hidden`, no crea un contenedor de desplazamiento, así que no rompe lo fijo ni las filas que desplazan;
  - los textos de las tarjetas de registros parten la línea (`overflow-wrap: anywhere`) en lugar de salirse.

**`tools/visual/mobile-scan.mts`** (nuevo) mide en cada vista y anchura (`PLANB_WIDTHS`, por defecto 390 y 320) tres cosas:

- si la página se desplaza de lado;
- si hay contenido que se sale de la pantalla sin estar en una fila que desplace;
- si hay controles recortados por un contenedor que oculta su desbordamiento.

Reconoce las filas que desplazan por su estilo real, no por su nombre de clase. Sale con código 1 si hay problemas, así que sirve como comprobación.

## Verificación

- **`mobile-scan`:**
  - antes: «Datos de prueba» se salía entre 228 y 296 px en todas las vistas, y Clientes a 320 tenía 322 px de página;
  - después: **sin problemas en las 20 vistas** (10 vistas por 2 anchuras), con código 0.
- **La herramienta detecta el fallo:** al quitar solo la regla de la etiqueta vuelve a señalar «se sale 190 px: «Datos de prueba»».
- **Objetivos de 44 px intactos:**
  - a 390 px: Modo oscuro 74 × 44, Órdenes 44 × 44 y Bloquear 44 × 44;
  - a 320 px: los tres botones a 44 × 44.

  La etiqueta mide 106 × 24, pero no es un control.
- **Capturas a 2×** de Tareas y Clientes a 320 y 390 px, revisadas a ojo. Están en el scratchpad (`d5-*.png`).

## Fuera de este encargo

- **La ficha a pantalla completa con gesto de cierre**, del texto de D5, queda fuera. La sesión Faro está trabajando ahora en la ficha (RecordSummary, ficha nueva con valores de partida), y tocarla a la vez sería pisarse.
- **Una pista visual en las filas que desplazan** (un degradado en el borde) sería una mejora de diseño. Se deja a Faro.
- **Commit:** `src/faro.css` lleva trabajo en curso de la sesión Faro, así que no se commitea en este encargo. El aviso va por el chat.

## Huellas

| Archivo | Antes | Después |
| --- | --- | --- |
| `src/faro.css` | `ea1e31b8845d` | `bee58331cb2d` (incluye trabajo ajeno en curso) |
| `tools/visual/mobile-scan.mts` | — | `7c8ac3c1b69a` (nuevo) |

## R2 · Revisión 437 de Codex (escáner e informe)

**La barra** recibe dictamen favorable en 20 vistas independientes. **El escáner** tenía dos huecos, los dos correctos:

1. Si todas las rutas redirigían a `/sesion`, medía esa página y decía «Sin problemas».
2. Solo miraba el contenedor que recorta más cercano: un botón que cabía en el interior (220 px) pero quedaba oculto por el exterior (100 px) pasaba.

**Corrección** (`tools/visual/mobile-scan.mts`, todo en `scanPage`):

- **Llegar a la vista** exige tres cosas: respuesta HTTP 200, la misma dirección final (sin redirección) y el título de la vista (`main h1`) visible. Si falta algo o se agota el tiempo (30 s), la vista cuenta como **fallida**.
- **Recortes en toda la cadena de contenedores** hasta la vista, no solo el más cercano. Dentro de una fila que desplaza por sí misma, el control se alcanza desplazándola: desde ahí se mide la fila contra lo de fuera, así que esas filas siguen siendo válidas.
- **`--self-test`**: seis controles con páginas sintéticas servidas por `page.route`, sin servidor ni red. Pasan **6/6**:
  - una vista correcta pasa;
  - una redirección a `/sesion` falla («acabó en /sesion»);
  - sin título, falla;
  - el recorte por un contenedor exterior se detecta;
  - el recorte directo se sigue detectando;
  - una fila que desplaza es válida.

**Con la App real** (ensayo aislado), las 10 vistas a 390 y 320 px dan **sin problemas en 20 vistas**, con código 0 y las comprobaciones nuevas.

**Corrección del informe.** El «sin problemas» de R1 se midió sin comprobar que se llegaba a cada vista. Ahora queda confirmado con las comprobaciones de llegada.

**Huella R2:** `tools/visual/mobile-scan.mts` `f4ca79961134…`.
