# CLAUDE-A11Y-D7 · Accesibilidad sostenida

**Autor:** Claude (Opus 5.5) · **Fecha:** 17/11/2026 · **Origen:** mejora D7 del informe, por orden del usuario. Los archivos compartidos se editaron con su autorización y quedan sus huellas.

## Qué cambió

### 1. Foco de las ventanas y de la paleta

- **`Modal` y `useDialogFocus`** (`src/components.tsx`) ya no quitan el foco a un campo con `autoFocus`. Solo enfocan el primer control si el foco no está ya dentro de la ventana. Además, `Modal` enfoca el primer botón de **su** ventana: antes buscaba `[role="dialog"] button` en todo el documento y, con dos ventanas abiertas, podía enfocar la otra.
- **Al cerrar, el foco vuelve a quien abrió la ventana.** Ese elemento se anota en el primer pintado (`useState(focusedElement)`). La primera versión lo leía en el efecto y, con `autoFocus`, anotaba el propio campo. La prueba de la paleta de Codex (419) lo cazó y está corregido. Se aplica también a la ficha (`RecordDrawer`).
- **La paleta** (`CommandPalette.tsx`) enfoca su buscador con `autoFocus`, en lugar de un temporizador de 30 ms que el modal podía adelantar.

### 2. La página del Radar tiene título principal

Sin escenario activo, la vista Radar no tenía `h1`: `CommitmentRadarEntry` usaba un `h2` y solo se usa como página entera. Ahora es `h1`, con su regla CSS adaptada.

### 3. Objetivos de toque

- **Medición** (`tools/visual/a11y.mts`). Mide ancho y alto con dos umbrales:
  - 24 px en escritorio (WCAG 2.2 · 2.5.8, AA);
  - 44 px en móvil (2.5.5 y guías de iOS/Android).

  Exime, como la norma, los enlaces y botones dentro de una frase, las casillas dentro de su etiqueta y la rejilla de días.
- **Corrección en escritorio** (`src/faro.css`):
  - el nombre de cada registro en las tablas sube de 17–22 a 24 px;
  - el selector de estado de las tareas sube de 22 a 24 px, en su propia regla de Faro.
- **Corrección en móvil (< 768 px):**
  - todo botón, selector, pestaña y campo mide al menos 44 × 44;
  - la barra superior pasa de 34 a 52 px para que sus botones no queden recortados;
  - la paginación sube de 24 a 44 px.

## Verificación

**Auditoría** (`tools/visual/a11y.mts` sobre el ensayo aislado, 18 vistas y 7 capas):

| | Antes | Después |
| --- | --- | --- |
| Escritorio 1366 | 235 avisos | **0** |
| Móvil 390 | 608 avisos | 26 → **0** |

- Los 26 avisos de móvil tras la auditoría final venían de dos causas: la paginación, que una regla de Faro fijaba a 24 px, y tres botones de texto de menos de 44 px de ancho. Se corrigieron y se comprobaron midiendo en la página Clientes e Inicio, donde aparecían: 0 controles por debajo de 44 y sin desbordamiento horizontal.
- No se repitió la auditoría completa de 25 minutos. Queda como comprobación pendiente.

**Pruebas de navegador** (`tests/e2e/dialog-focus.spec.ts`, nueva y autocontenida, con el fixture compilado con esbuild y sin servidor): **3/3**.

1. Lo escrito tras Ctrl J llega al buscador.
2. La ventana enfoca su primer control, encierra el Tab en ambos sentidos y Escape devuelve el foco.
3. Un campo con `autoFocus` conserva el foco y, al cerrar, el foco vuelve a quien abrió.

La prueba 3 fallaba antes del cambio. La 1 pasaba también antes: Playwright tarda más de 30 ms entre teclas y no reproduce la carrera vista a mano, así que queda como protección contra regresiones.

**Otras comprobaciones:**

- `tests/e2e/command-palette.spec.ts` (Codex, 419): 2/2.
- Suites unitarias de interfaz: `ui-journeys` 60/60, `independent-interface-contexts` 47/47, `auth-parent` 4/4, `independent-workspace-contracts` 32/32 y `customer-dossier-focus` 22/22.
- `tsc` 0.
- Revisión visual en móvil de Inicio, Tareas, Clientes y Continuidad.

## Huellas

| Archivo | Antes | Después |
| --- | --- | --- |
| `src/components.tsx` | `b5a18e6b9930` | `49c606c3386d` |
| `src/app-shell/CommandPalette.tsx` | `d4a74e3983d4` | `4fc059535180` |
| `tools/visual/a11y.mts` | `fc9f52f69f9d` | `cd99d5601c2d` |
| `src/CommitmentRadarEntry.tsx` | `a69e8637f4f3` | `c4565890d32c` |
| `src/faro.css` | `3bbb4a29816f` | `8a590f91a5d4` |
| `src/commitment-radar.css` | `fc47d8206f50` | `618d73a604a8` |
| `tests/e2e/dialog-focus.spec.ts` | — | `42ae5ffd6e2c` (nuevo) |

## Pendiente

- **Llevar la auditoría a la CI local** («llevarlo a la batería», en el informe). Necesita un servidor en marcha y `tools/ci/run.mjs` no lo arranca. Encaja como paso opcional `--a11y` cuando se toque la CI.
- **Para D5 (móvil):** la barra superior tiene más contenido del que cabe en 390 px (632 px) y recorta la etiqueta «Datos de prueba». Ya pasaba antes de este cambio.
- **Repetir la auditoría completa** en móvil para confirmar el 0 en todas las vistas.
