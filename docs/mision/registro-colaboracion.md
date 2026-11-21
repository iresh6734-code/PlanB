# Misión maestra · Registro de colaboración entre agentes

Registro breve de decisiones que se pueden comprobar. Cada entrada lleva fecha (Europe/Madrid), autor y cómo comprobarla. **No se anotan conversaciones ni acuerdos que no hayan ocurrido.**

## Quién trabaja en Plan B (comprobado el 21/11/2026)

| Agente | Dónde | Evidencia | Canal real |
| --- | --- | --- | --- |
| Claude, esta sesión | Ordenador con `D:\AI\Plan-B-CRM-v2.1` | Este registro y `docs/mision/` | Archivos del repositorio y Git |
| GitHub Copilot | Otro ordenador, por GitHub | Commits `a0f2fc5`, `56c1c9c`, `d19b6fa` y `59e7a47` (20/11) con «Co-authored-by: Copilot» | Git (`origin`, rama `planb-v0.3-local`) |
| Claude, sesión «planb-rendimiento» | Este ordenador | Chat del tablón del 21/11 y archivos sin commit en `tools/ci/`, `tools/team-audit/` y `tests/` | Chat del tablón |
| Codex | — | Última actividad en el tablón: 19/11 10:56 UTC | **Fuera de esta misión por orden de la usuaria (21/11)** |

No hay comunicación directa en tiempo real con el agente del otro ordenador. La coordinación se hace con este archivo, con los documentos `docs/mision/0*.md` y con commits por tema.

## Decisiones

| Fecha | Autor | Decisión | Cómo comprobarla |
| --- | --- | --- | --- |
| 21/11/2026 | Usuaria | «No quiero que coordines nada con Codex… olvídate de Codex». Esta misión no usa el tablón de Codex (`board.mjs`) | Instrucción en el chat de la sesión |
| 21/11/2026 | Claude | Auditoría con ensayo aislado propio (4571/4572, datos ficticios nuevos, `NODE_ENV=test`, red exterior bloqueada). No se tocaron `data/`, `planb-*` ni el piloto | `.claude/launch.json` (entradas `mision-api` y `mision-ui`); `tests/.tmp/mision/` |
| 21/11/2026 | Claude | Propuesta B0: conservar «Consola de operaciones» como identidad única y retirar capas, sin una sexta identidad | `03-superplan-b-experiencia.md` §B0. **Pendiente de confirmación de la usuaria** |
| 21/11/2026 | Claude | Reparto propuesto: Claude lleva interfaz, sistema visual y composición; el agente del otro ordenador, servidor, datos y pruebas de servidor | `05-hoja-de-ruta.md` §2. **Pendiente de que el otro agente lo lea y lo acepte o lo discuta aquí** |
| 21/11/2026 | Claude | Fase 1, P0 de interfaz (contraste del menú móvil, controles de 44 px y barra sin alarma roja permanente): los hace Claude en este ordenador | Ver la entrada siguiente |
| 21/11/2026 | Claude | **Tanda P0 cerrada.** (1) Token `--signal-ink` en `consola.css` (blanco en claro y `#14171c` en oscuro), usado por el apartado activo del menú móvil en `faro.css:508-509`: 6,48:1 y 9,76:1, antes 2,78:1. (2) `--control-h` móvil a 44 px en `consola.css`: campos y botones a 44. (3) `TopBar.tsx` y `faro.css`: «¿HubSpot caído?» neutro, mismo efecto y nombre accesible «HubSpot no responde: activar el modo contingencia». (4) `tests/commitments.test.ts` reanclado: no era una regresión. (5) Línea base de colores fijos de `faro.css` 126 → 124 | `design-tokens` (contraste nuevo), `color-guard`, `css-unused`, `design-k-block`, `record-sheet`, `ui-copy` y `commitments` en verde; `tsc` sin errores; `tests/.tmp/mision/p0-check.mts` y capturas `shots/p0-*` |

| 21/11/2026 | Usuaria | «¿Quieres empezar a hacer el plan?»: arranca la ejecución sobre la identidad «Consola» (sin sexta identidad) | Instrucción en el chat de la sesión |
| 21/11/2026 | Claude | **Inicio «puesto de mando» (B4.1) y primera parte de A1.** Inicio pasa a tres zonas: siguiente paso de trabajo, columna de trabajo (prioridades con recuento, oportunidades en riesgo y clientes que se enfrían) y riel de la copia con el índice de preparación nombrado y un botón que hace el siguiente paso (p. ej. abre «Protege tu copia»). Salen de Inicio el parte de la mañana, la semana en una línea, las tres tarjetas de cifras, el sello, la tira de primeros pasos y la tarjeta del Radar (el Radar se sigue leyendo para el aviso del menú). El objetivo del mes y la previsión pasan a Oportunidades › Analítica (`PipelineCard variant="plan"`). CSS muerto podado: 154 selectores, 14,5 KB; colores fijos 124 → 107 (`faro.css`) y 6 → 3 (`operaciones-claras.css`) | Archivos: `src/HomeOverview.tsx`, `src/app-shell/continuity-insights.ts`, `src/app-shell/PipelineCard.tsx`, `src/app-shell/RecordsPage.tsx`, `src/consola.css`, `src/faro.css`, `src/operaciones-claras.css` y las pruebas `continuity-insights`, `record-sheet` (K8: un solo botón relleno) y `color-guard-baseline.json`. Guardias en verde, `tsc` sin errores; medidas en `tests/.tmp/mision/shots/inicio-pm/` |
| 21/11/2026 | Claude | **Continuidad › Estado (B4.2, primera parte).** El índice de preparación lleva los cinco pasos con su acción («Elegir contraseña», «Conectar HubSpot», «Crear copia cifrada», confirmar copia) y el siguiente paso como única acción principal. Sale la lista lateral «Preparación de tu Plan B». «Activar modo contingencia» y «Continuar trabajando» pasan a secundarios (el segundo vuelve a principal si no hay nada pendiente). Parte, informe del mes y marca van en el menú «Informes». El sello y «¿Cuánto costaría parar sin copia?» pasan a «Evidencia e impacto». «Si HubSpot cae ahora» deja de repetir la prueba y la copia externa (`READINESS_OUTAGE_LINES`) | `src/ContinuityHome.tsx`, `src/app-shell/continuity-insights.ts`, `src/consola.css` y CSS podado (19 selectores); `continuity-home-hub`, `independent-copy-inspection-api` (16/16) y guardias en verde; `tsc` sin errores; medidas en `tests/.tmp/mision/shots/continuidad-b42/` |
| 21/11/2026 | Usuaria | «Si ves que se va a acabar el consumo, haz commits para que desde el otro ordenador haga pull y traiga todos los cambios». Autoriza commit y push de todo, incluido el trabajo presentado sin commit de «planb-rendimiento» (en commit aparte) | Instrucción en el chat de la sesión |
| 21/11/2026 | Claude | Piezas que quedan sin montar tras el cambio (para A0-L, no borradas): `MorningBrief.tsx`, `FirstRunStrip` (en `FirstRun.tsx`) y `HomeSeal` (en `ContinuitySeal.tsx`) | `grep` de usos en `src/` |

## Pendiente para el agente del otro ordenador

Al hacer `git pull`, leer `docs/mision/00-LEEME.md` y, en este orden:

1. **Revisar críticamente** los Superplanes A y B y la tabla de evaluación de `05-hoja-de-ruta.md` §1. La misión exige revisión cruzada. Anotar aquí, por propuesta, si se está de acuerdo, qué cambiaría y por qué.
2. **Fase 1:** A0-L (limpieza de código sin montar y `recovery-rehearsal.ts` fuera del instalable) y decidir qué hacer con la huella SHA-256 de `src/task-save-outcomes.css` en `tests/task-focus-outcomes.test.ts`: sustituirla por una aserción de comportamiento.
3. **Antes de tocar** archivos del ámbito de interfaz (`src/consola.css`, `src/faro.css`, `src/ui/**`, `TopBar.tsx`, `Sidebar.tsx`, `navigation.ts`, `HomeOverview.tsx`, `ContinuityHome.tsx`), anotar aquí la tarea para no editar a la vez.

## Revisión cruzada (a rellenar por el otro agente)

| Propuesta | De acuerdo | Cambios propuestos | Motivo |
| --- | --- | --- | --- |
| A1 Índice de preparación | | | |
| A4 Paquete de vuelta | | | |
| A7 Clave sin DPAPI | | | |
| B0 Identidad única | | | |
| B4.1 Inicio «puesto de mando» | | | |
| B4.2 Continuidad Copia · Prueba · Vuelta | | | |
