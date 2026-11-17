# CLAUDE-UI-NAV-LAB · Menú en cinco lugares y apartado Laboratorio

**Autor:** Claude (Opus 5.5) · **Fecha:** 17/11/2026, Europe/Madrid
**Origen:** mejoras C1 y D1 del informe de mejoras. Las tres decisiones son del usuario (17/11): «Apartado Laboratorio», «Sí, cinco lugares» y «Tómalos y avisa».
**Encargos:** `CLAUDE-UI-NAV-LAB` (archivos nuevos) y `CLAUDE-UI-NAV-LAB-HOST`, que documenta los archivos compartidos. El tablón no asigna este segundo encargo porque esos archivos siguen reservados por `CLAUDE-OPUS-UI-OPERACIONES-CLARAS` y `CLAUDE-FABLE-UI-GRAFITO`, que ahora tiene Codex. Se editaron con autorización expresa del usuario, con aviso previo en el chat del tablón y con copia de los 62 archivos modificados en el scratchpad de la sesión.

## Qué cambia para quien usa la App

**Antes:** unas 18 entradas en cuatro grupos (Trabajo, Operaciones, Tu copia, Ajustes), con acciones mezcladas con lugares y pantallas de ficción junto al trabajo real.

**Ahora** hay cinco lugares, y cada uno despliega sus apartados:

| Lugar | Apartados |
| --- | --- |
| Inicio | — |
| Hoy | Tareas de hoy · Propuestas (antes «Agentes») |
| Clientes | Clientes · Empresas · Oportunidades · Tareas |
| Continuidad | Estado · Cambios · Exportar · Copia de equipo |
| Ajustes | Integraciones · Proveedor de IA (solo con datos de prueba) · Preparación |

Además:
- **Laboratorio** (Radar y Comprobar una fecha) aparece aparte, bajo «Con datos de prueba», solo si la copia es de prueba o todavía no hay copia. El servidor ya rechazaba esas rutas con datos reales.
- **Bloquear** pasa a la barra superior: es una acción, no un lugar. En móvil se queda solo el candado.
- La navegación móvil queda en Inicio, Hoy, Clientes, Continuidad y Más.
- Al cambiar de lugar se despliega solo el suyo, para que el menú no crezca al navegar.

**Con una copia de datos reales**, ninguna superficie ofrece el Laboratorio:
- el menú y la navegación móvil;
- Inicio, que no lee ni enseña el Radar;
- la entrada «Ensayar mi semana» de Hoy;
- la paleta Ctrl J;
- los atajos G R y G F.

Además, un apartado del Laboratorio recordado en la sesión vuelve a Inicio.

## Archivos

| Archivo | Tipo | Antes (SHA-256) | Después |
| --- | --- | --- | --- |
| `src/app-shell/navigation.ts` | nuevo | — | `2cff289e…72e6` |
| `tests/navigation-model.test.ts` | nuevo | — | `330d7aa8…c6f707` |
| `src/app-shell/Sidebar.tsx` | reescrito sobre el modelo | `a5ab11b6…4cf48` | `334b0b58…c35` |
| `src/app-shell/MobileNav.tsx` | reescrito | `30fb9a8c…1e806` | `fe72e43d…afe3f` |
| `src/app-shell/TopBar.tsx` | botón Bloquear | `20f8d3d7…4ff8` | `5d8db834…b37` |
| `src/app-shell/useShortcuts.ts` | opción `lab` | `b7207dce…81921` | `6fcab32f…c33b` |
| `src/HomeOverview.tsx` | propiedad `lab` | `bc217f6d…98904` | `63bf23cb…3a7` |
| `src/App.tsx` | modelo, vuelta a Inicio, paleta, Bloquear y `lab` | `37ee4ea8…e351` | `8e7b5699…ef56` |
| `src/faro.css` | 2 reglas añadidas al final | `ce207ab1…710f` | `d8dead10…2ae` |

Las huellas completas están en el scratchpad (`hashes-before-nav.txt`). Todas las ediciones son aditivas sobre el estado que había, con los cambios ajenos sin guardar incluidos, y no se descartó ningún cambio ajeno. Se reutilizan las clases CSS del menú anterior (`work-toggle`, `work-disclosure`, `work-subnav`), así que el aspecto de cada entrada no cambia.

## Verificación

- `tests/navigation-model.test.ts` **6/6**:
  - cinco lugares más el Laboratorio aparte;
  - con datos reales no aparecen el Laboratorio ni el proveedor de IA;
  - la copia independiente no ofrece Hoy, Propuestas, Integraciones, copia de equipo ni Preparación;
  - cada apartado de `PAGES` tiene su grupo;
  - vuelta a Inicio del apartado recordado;
  - entradas de registros activas solo con su tipo abierto.
- Las pruebas existentes que leen `App.tsx` o la interfaz pasan **163/163**:

  | Suite | Resultado |
  | --- | --- |
  | auth-parent | 4/4 |
  | independent-interface-contexts | 47/47 |
  | continuity-home-hub | 5/5 |
  | task-outcomes-host | 12/12 |
  | design-tokens | 10/10 |
  | ui-journeys | 60/60 |
  | ui-kit | 6/6 |
  | saved-views | 5/5 |
  | navigation-model | 6/6 |
  | continuity-alerts | 8/8 |
- `tsc --noEmit` 0.
- **Navegador, en el ensayo aislado** (servidor desde el código actual en 4421, carpeta de datos nueva, red exterior bloqueada, sin `.env.local`; Vite en 5199; Chromium sin interfaz):
  - con datos de prueba, a 1366 y 390 px, recorrido por Inicio, Hoy, Clientes, Continuidad, Ajustes y Laboratorio sin desbordamiento horizontal (`scrollWidth − innerWidth = 0` en las 10 vistas);
  - con una copia ficticia clasificada como **datos reales** (v3, HubSpot STANDARD de producción, protegida con una contraseña de prueba generada en el momento): el menú tiene solo los cinco lugares, la sesión que recordaba el Radar abre en Inicio, Inicio no muestra el Radar (0 coincidencias), G R no navega y la paleta no encuentra «Radar»;
  - la primera pasada mostró dos defectos, ya corregidos: Bloquear deformado y el menú acumulando grupos abiertos.
- La consola registró un único error, un 404 de un recurso, igual en todas las vistas, y no viene de este cambio.

## Límites y pendiente

- **E2E de Playwright sin actualizar.** 20 especificaciones de `tests/e2e/` mencionan «Trabajar», «Proteger / bloquear» o «Comprobar una fecha». Algunas montan páginas sueltas y no el menú, pero otras recorren la navegación y habrá que adaptarlas. No se han ejecutado.
- No desplegado en 4331 ni en 4334.
- Codex debe volver a presentar `CLAUDE-OPUS-UI-OPERACIONES-CLARAS` y `CLAUDE-FABLE-UI-GRAFITO` sobre las huellas nuevas.
