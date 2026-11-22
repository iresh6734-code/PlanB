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

## Ejecución del relevo · GitHub Copilot

### Reserva B4.4 · antes de editar

21/11/2026, Europe/Madrid. La usuaria confirma en esta sesión: conservar la regla de Hoy (fecha sin hora por día de Madrid; instante con hora cuando pasa) y una cifra global de Agenda solo de tareas, comparable con Hoy. Los cierres siguen en su día del calendario.

Alcance: extraer la regla existente de `shared/response-queue.ts` a `shared/overdue.ts` y reutilizarla en Agenda, revisión semanal y despacho; Inicio ya lee la cola de Hoy. Interfaz: `src/LocalOperations.tsx`, `src/App.tsx`, `src/app-shell/Agenda.tsx`, `src/app-shell/FocusRun.tsx`, `src/app-shell/WeeklyReview.tsx` y sus estilos/modelos; componente compartido de vencimiento si evita duplicar la presentación. Una acción rellena como máximo, estado y fecha juntos, fila de Hoy pulsable sin romper teclado ni retorno de foco, despacho junto al filtro Vencidas, panel de Agenda solo del día seleccionado y ceros semanales atenuados. Se conservan las guardas de contexto y guardado. Medidas estructurales antes/después, pruebas focales, tipos y ambas podas CSS; geometría y aceptación visual pendientes del equipo autorizado.

### Reserva B4.5 · antes de editar

21/11/2026, Europe/Madrid. Alcance de interfaz:

- **`src/app-shell/RecordsPage.tsx`:**
  - Columnas proporcionales por tipo de campo, con un modelo puro nuevo (`src/app-shell/record-columns.ts`): nombre, correo y web 2; teléfono, fecha, importe y el resto 1; números alineados a la derecha.
  - Tabla de 1.040 px como máximo con 4 columnas de datos o menos.
  - Vistas rápidas a 0 atenuadas y al final, en orden estable. La vista activa no se degrada.
  - Barra inferior solo de la lista: «Guardado en este ordenador» y paginación.
  - Salen «Ver cobertura» y «Desconectar/Habilitar servicios», y el estado y la fecha de copia ocultos, que ya da la barra superior. Sale también el recuento de cambios, que ya da la barra superior.
- **`src/App.tsx`:** orden de paleta para desconectar o habilitar servicios, con la misma llamada que antes; la cobertura ya está en la paleta.
- **`src/ContinuityHome.tsx`:** «Ver cobertura» junto a «Pausar/Habilitar servicios», que ya existía.
- **`src/app-shell/TopBar.tsx`** (añadido durante la tarea, antes de editarlo): el «Modo independiente» solo existía como texto en la etiqueta oculta de la barra inferior; la barra superior lo indicaba solo con el color del punto. Pasa a ser el texto de la copia («Modo independiente · hace 2 h») para que el estado no dependa del color.
- **CSS y pruebas:** estilos de lista en `faro.css`/`consola.css`; selectores de las pruebas de navegador adaptados sin ejecutarlas.

Fuera de esta tanda: «Guardar vista» en «Más» y las tarjetas móviles de dos líneas, porque necesitan medir pantallas en un dispositivo. Medida estructural antes/después con el mismo arnés, tipos, pruebas focales y podas CSS; geometría pendiente del equipo autorizado.

### Reserva A0-L · antes de editar

21/11/2026, Europe/Madrid. Inventario de consumidores en `src/`, `server/`, `shared/`, `scripts/` y `design/`, sin contar documentos ni el tablón:

| Pieza | Consumidor real | Decisión |
| --- | --- | --- |
| `MorningBrief.tsx`, `morning-brief.ts`, `morning-brief.css` | Solo la exportación perezosa de `lazy-pages.tsx`, que nadie importa desde B4.1 | Se retira, con su prueba pura y sus exportaciones perezosas |
| `HomeSeal` (`ContinuitySeal.tsx`) | Solo la exportación perezosa de `lazy-pages.tsx`, sin uso | Se retira. `SealBadge`, `SealCard` y `SealLine` se quedan |
| `FirstRunStrip` (`FirstRun.tsx`) | Ninguno; `FirstRun` sigue montado | Se retira con su clave «ocultar» y su CSS |
| `RescueRoom.tsx`, `RescueCapsule.tsx` y servidor de rescate | El ensayo de relevo que monta `server/main.ts` (kit con `demo-rescue-room.ts` y `rehearse-rescue-capsule.ts`), demos de `design/` y pruebas | Se quedan; la interfaz no entra en el paquete de la App |
| `SourceReadingHistory.tsx`, `SourceStatusRow.tsx` | Pruebas propias; huérfanos justificados en `tests/orphan-components.test.ts` (E3) | Se quedan; no entran en el paquete |
| `server/recovery-rehearsal.ts` y su worker | Su CLI y sus pruebas. No los importa `server/main.ts`, pero el kit de relevo copia `server/` entero y lleva tsx | Fuera del kit de relevo y de `source/` de la entrega, con una lista única de archivos solo de desarrollo |

Ampliación anotada antes de editar: `tests/orphan-components.test.ts` falla por `src/SalesWorkspace.tsx`. Su último montaje, Propuestas en Cambios, lo quitó B4.3 (`25ac07c`), así que el huérfano es de esta tanda. Se retiran `SalesWorkspace.tsx`, `WorkQueue.tsx` (solo lo usaba él), `work-queue.css` y `MetricStrip`/`SectionHeader` de `WorkspaceUI.tsx`. Se quedan `shared/work-queue.ts`, que tiene pruebas propias, y las rutas `/v4` del servidor, que usan el espacio de equipo y sus pruebas. Las pruebas de navegador `tests/e2e/today-work-queue.spec.ts` y el bloque «Hoy» de `tests/e2e/independent-workspace-flows.spec.ts` ya buscaban una cola que no se monta desde que Hoy pasó a `LocalOperations`. No se ejecutan aquí; quedan para el equipo autorizado.

Archivos de interfaz: `src/app-shell/lazy-pages.tsx`, `src/app-shell/FirstRun.tsx`, `src/app-shell/ContinuitySeal.tsx`, `src/SalesWorkspace.tsx`, `src/WorkQueue.tsx`, `src/WorkspaceUI.tsx`, el CSS que quede sin uso y `tests/record-sheet.test.ts`. Empaquetado: `scripts/build-relay-kit.mjs`, `scripts/package-demo.ts` y un módulo nuevo con la lista. Medida antes/después compilando sin servidores: paquete de la interfaz, servidor empaquetado y kit en una carpeta temporal.

| Fecha | Tarea | Estado y alcance anotado antes de editar interfaz | Comprobación |
| --- | --- | --- | --- |
| 21/11/2026, Europe/Madrid | Revisión cruzada | Publicada en `b95b5a1`; tabla por propuesta y prioridades contrastadas | `npx.cmd tsc --noEmit -p tsconfig.json` y 9/9 archivos seguros focales de Cambios y guardias. Se usa el lanzador Windows `.cmd`, sin cambiar la política de ejecución de PowerShell |
| 21/11/2026, Europe/Madrid | B4.3 Cambios | Hecho y comprobado sin navegador. Alcance registrado antes de editar: `src/ChangesView.tsx` y pruebas de integridad; se quitó Propuestas, el recuento duplicado de cabecera y el asistente sin pendientes. Vacío de una línea solo con lectura válida; historial, exportaciones con contenido, planes guardados y último justificante manual conservados | Antes/después, mismo arnés y respuesta vacía: asistente 1 → 0, línea de vacío 0 → 1, botones de exportación 2 → 0; historial ya marcado sin plan: asistente 1 → 0. Las tres regresiones fallaron antes y pasan después. Estados review/approved/applying/complete/partial: ≤ 1 botón relleno. `npx.cmd tsc --noEmit -p tsconfig.json`; 9/9 archivos con `node tools/safe-tests.mjs recovery-integrity-ui independent-return-integrity-ui return-steps change-history return-explain-ui css-unused color-guard design-tokens record-sheet`. Poda normal y dedupe: 0 reglas, 0 B; detector mecánico sin hallazgos. Sin medidas geométricas ni aceptación visual |
| 21/11/2026, Europe/Madrid | B3.1 Menú | Hecho. Alcance registrado antes de editar: navegación, Sidebar, PreparationNavigation y App. Propuestas fuera de Hoy; solo se conserva en paleta con datos de prueba. Copia de equipo depende del origen ya leído por App, también en paleta, sin nueva petición ni contacto con el servicio. Configurar Plan B en Continuidad, con sus pasos y ruta anterior intactos. Fuera Abrir aplicación del menú. Adaptados los selectores y fixtures de navegador afectados, sin ejecutarlos | Comparación del modelo en `25ac07c` y el actual, mismo contexto ficticio sin servicio: entradas 19 → 17, Hoy 4 → 3, Propuestas 1 → 0, Copia de equipo sin servicio 1 → 0, grupo de Preparación Ajustes → Continuidad. Dos regresiones fallaron antes y pasan después. Render de Sidebar comprueba ubicación, pasos, pulsación y aparición al configurar servicio; 0 botones rellenos. `npx.cmd tsc --noEmit -p tsconfig.json`; 7/7 archivos con `node tools/safe-tests.mjs navigation-model navigation-group-header url-routes css-unused color-guard design-tokens record-sheet`. Ambas podas CSS: 0 B; detector sin hallazgos. Pruebas de navegador y geometría pendientes del equipo autorizado |
| 21/11/2026, Europe/Madrid | B4.4 Hoy y Agenda | Hecho según la reserva anterior. Regla única en `shared/overdue.ts` (fecha sin hora por día de Madrid; instante con hora cuando pasa; tipo de campo comprobado), usada por la cola de Hoy, Agenda, despacho y revisión semanal. Hoy: un solo botón relleno también en fase importada; Despachar junto al filtro Vencidas; estado y fecha juntos en la celda «Vence» (tono + «· N d»), sin chip; tabla de 3 columnas. La fila ya era pulsable entera con `.lop-open-task::after`, así que no se añadió manejador. Agenda: fuera la lista lateral de vencidas; cifra global solo de tareas que abre Hoy con el filtro Vencidas; cierres pasados quedan en su día como «fecha pasada»; tareas con fecha inválida pasada, «Por revisar en Hoy». Revisión semanal: cifras a 0 atenuadas y «Venció hoy/hace N días» con la misma regla | Mismo arnés y la misma copia ficticia, `LocalOperations` de `HEAD` frente al actual: botones rellenos en fase importada 2 → 1 (Hoy y Agentes), columnas 4 → 3, chips 3 → 0, Despachar en acciones de cola → filtros. Paridad nueva en `tests/agenda.test.ts`: Agenda, Hoy, Despachar y revisión semanal dan la misma cifra para un campo fecha y su clon con hora. `tests/hoy-acciones-ui.test.ts` (nuevo, 4 casos). `npx.cmd tsc --noEmit -p tsconfig.json`; 23/24 archivos con `node tools/safe-tests.mjs hoy-acciones-ui queue-a11y agenda weekly-review focus-run response-queue local-operations independent-interface-contexts independent-return-integrity-ui recovery-integrity-ui navigation-group-header search-context workspace-search-identity task-outcomes-host css-unused color-guard design-tokens record-sheet`. El fallo, `independent-interface-contexts` (1 de 47: `useContinuityState` sin simular en `auth-parent-harness`), ya ocurre igual en `HEAD` limpio y viene de `607a835`; no se toca aquí. Poda CSS: 12 selectores, 1358 B; dedupe 0. Recuento de colores sin cambios; el detector solo repite un hallazgo previo (`weekly-review.css`, `transition: width`). Sin geometría ni aceptación visual |
| 21/11/2026, Europe/Madrid | B4.5 Listas | Hecho según la reserva anterior. Modelo puro `src/app-shell/record-columns.ts`: peso 2 para el campo principal, correo y web, 1 para el resto; importes y números a la derecha con cifras tabulares; columna de abrir de 44 px. Con 4 columnas de datos o menos la tabla se limita a 1.040 px (`data-narrow`); en móvil siguen las tarjetas. Vistas rápidas a 0 al final, atenuadas y en orden estable; la activa no se degrada. Barra inferior: solo «Guardado en este ordenador» y la paginación. «Ver cobertura» pasa a Continuidad (junto a servicios) y sigue en la paleta; desconectar o habilitar servicios pasa a la paleta, con la misma llamada `/disconnect`, y sigue en Continuidad. La barra superior dice «Modo independiente» en texto, no solo con el color del punto; la etiqueta de cambios dice «1 cambio local» en singular. Pruebas de navegador adaptadas (`runCommand`, `copyMode`, recuento desde `.gx-topbar .gx-changes`) sin ejecutarlas | Mismo arnés y la misma copia ficticia, `RecordsPage` de `HEAD` frente al actual: botones de la barra inferior 4 → 2 (fuera Ver cobertura y Desconectar servicios); texto de estado, fecha y «2 cambios locales» en la barra inferior → 0, ya están arriba; negocios: 3 vistas a 0 al final y atenuadas (antes mezcladas). Anchos: contactos 33,3/16,7/33,3/16,7 %, empresas 40/40/20 %, tareas 40/20/20/20 %, las tres estrechas. `tests/listas-ui.test.ts` (nuevo, 4 casos) falla en `HEAD` y pasa ahora. `npx.cmd tsc --noEmit -p tsconfig.json`; 7/7 con `node tools/safe-tests.mjs listas-ui ui-states record-list record-sheet url-routes navigation-group-header continuity-home-hub`; 9/12 con `node tools/safe-tests.mjs css-unused color-guard design-tokens design-k-block auth-parent agenda task-outcomes-host team-audit independent-copy-inspection-api saved-view independent-interface`, tras bajar `tests/color-guard-baseline.json` (faro 105 → 103, refinements 42 → 41). Fallan `auth-parent` e `independent-interface-contexts` por el mismo `useContinuityState` sin simular, igual en `HEAD` limpio (viene de `607a835`); no se tocan. Poda CSS de la barra antigua: faro −1.625 B, refinements −49 B, styles −60 B; consola +499 B por las reglas nuevas; después, 0 muertos y 0 pisadas. Detector sin hallazgos. Pendiente: «Guardar vista» en «Más», tarjetas móviles de dos líneas, geometría y aceptación visual en el equipo autorizado |
| 21/11/2026, Europe/Madrid | A0-L Código sin montar | Hecho según la reserva y su ampliación. Retirados: `MorningBrief.tsx`, `morning-brief.ts`, `morning-brief.css` y su prueba; `HomeSeal` y `SealLine`, cuyo único consumidor era `HomeSeal` (se quedan `SealBadge` y `SealCard`); `FirstRunStrip` con su clave «ocultar»; las exportaciones perezosas sin uso. También `SalesWorkspace.tsx`, `WorkQueue.tsx`, `work-queue.css`, `MetricStrip` y `SectionHeader`, sin montar desde B4.3, y las simulaciones de `SalesWorkspace` que quedaban en dos pruebas de Cambios. Se quedan la sala y la cápsula de rescate, que usa el ensayo de relevo de `server/main.ts`, y los huérfanos E3. Nueva lista única `scripts/dev-only-files.mjs`: `recovery-rehearsal`, su worker, su CLI y sus pruebas. `build-relay-kit.mjs` y `package-demo.ts` la usan como filtro; `tests/dev-only-files.test.ts` comprueba que los archivos existen, que el filtro no atrapa vecinos y que nada distribuible los importa | Compilación sin servidores ni navegador, antes → después: interfaz 83 → 78 archivos, 3.409.813 → 3.372.683 B. Desaparecen los fragmentos `MorningBrief` y `ContinuitySeal` (`SealCard` va ahora con quien lo usa). El servidor compilado no cambia: 831.078 B, ya sin `recovery-rehearsal`. Kit de relevo 184 → 182 archivos de código, sin `server/recovery-rehearsal*.ts`. `npx.cmd tsc --noEmit -p tsconfig.json` correcto. 18/18 con `node tools/safe-tests.mjs orphan-components dev-only-files record-sheet first-run continuity-seal css-unused color-guard design-tokens continuity-home-hub independent-return-integrity-ui recovery-integrity-ui work-queue ui-journeys local-integrations continuity-operations` y 2/2 con `color-guard design-k-block`. `orphan-components` fallaba antes por `SalesWorkspace.tsx` y ahora pasa. Se bajó `tests/color-guard-baseline.json` (design-system 35 → 28, sales 9 → 5). Poda con `css-unused --write`: 17 + 167 selectores, 1.940 + 11.220 B. A mano: `commitment-list` y `commitments-empty`, que la herramienta conserva porque `'commitment-not-linked'` parece un prefijo, y las alternativas muertas de `:is()` en `consola.css`, `planb-ui.css` y `continuity-seal.css`, sin cambiar la especificidad. Después: 0 muertos y 0 pisadas. El detector solo repite dos `border-left-width: 3px` de `planb-ui.css` que ya están en `HEAD`. No se ejecutan aquí, por arrancar procesos o navegador: `tests/relay-rehearsal-mount.test.ts`, que gana una aserción de manifiesto sin `recovery-rehearsal`, y las pruebas de navegador de la antigua cola de Hoy, ya obsoletas |

## Verifica · Fase 0 · GitHub Copilot

### Reserva · antes de editar

22/11/2026, 16:00 Europe/Madrid. La usuaria: «ves a ello, acuérdate de evitar alertas a la empresa, de no hacer nada con riesgo». Manda `docs/plan-b-verifica-plan-de-producto.md`. Las tres decisiones de la fase 0 siguen abiertas: destinos, coordinador y dueños, y carpetas de instalaciones. Por eso esta tanda no aparca nada, no toca el menú y no mueve carpetas.

Alcance:

- **`shared/verifica/` (nuevo):**
  - La empresa con trampas: ficticia, determinista, con una variante limpia y con su resultado esperado.
  - Las seis reglas puras, con reloj inyectado.
  - Un informe seudonimizado con la huella de cada captura.
- **`src/verifica/` y `verifica.html` (nuevos):** una entrada propia que muestra el informe de referencia, más la entrada en `vite.config.ts`. No entra en el menú de la App.
- **Pruebas:** `tests/verifica-*.test.ts`.

Sin servidores, navegador, PowerShell, DPAPI, red ni datos reales. Dueño provisional de `shared/verifica/` y `src/verifica/` mientras dure la tarea: GitHub Copilot.

### Hecho · 22/11/2026 · cómo se comprueba

**Motor (`shared/verifica/`)**, todo puro: sin red, disco ni reloj del sistema.

- `model.ts`: la forma común a la que se traduce cualquier lector (HubSpot, Pipedrive o exportación). Captura con `historyAvailable`, facturas con `dealRef` y declaraciones del vendedor. Cada hallazgo lleva su base: observado, declarado o sin comprobar.
- `rules.ts`: las seis trampas del plan. Los umbrales están en `THRESHOLDS` y se describen abajo.
- `report.ts`: el informe `planb-verifica-report-v1`.
  - Página 1: hallazgos con la huella de las capturas de las que salen.
  - Página 2: lo que no se pudo comprobar.
  - La huella es SHA-256 del JSON con claves ordenadas, y `verifyReport` la recalcula.
  - Las referencias son seudónimos `deal:`, `company:` y `owner:` con una sal de al menos 16 caracteres que no viaja en el informe.
- `empresa-con-trampas.ts`: la empresa ficticia de referencia, determinista (semilla fija), en dos variantes, con trampas y sin trampas. El resultado esperado se apunta al sembrar.

**Las seis reglas y sus umbrales:**

| Regla | Qué mira | Cuándo avisa |
| --- | --- | --- |
| Ventana de venta | Lo creado o subido de importe en las últimas 6 semanas, frente a la media de hasta 7 periodos anteriores | Más de 1,5× con al menos 3 periodos |
| Fechas aplazadas | Oportunidades abiertas aplazadas 3 veces o más | Al menos 3, o al menos el 10 % de la cartera abierta |
| Ganadas sin factura | Factura enlazada por `dealRef` (observado). La misma empresa, con importe ±1 % y fecha entre −30 y +120 días, cuenta como ambigua y sin comprobar. Las ganadas de los últimos 30 días tienen gracia | Si falta alguna factura |
| Concentración | Lo que suman los dos primeros comerciales de la cartera abierta | Más del 50 % con al menos 3 comerciales |
| Borrado masivo | Contactos que desaparecen entre capturas. Reutiliza `assessShrink` de `shared/capture-quarantine.ts` para decir si la captura queda retenida | Al menos 10 contactos y al menos el 5 % |
| Renovación declarada | Clientes sin factura en 12 meses, clientes activos declarados frente al CRM y renovación observada, esta solo si hay facturas de 24 meses | Más del 10 % sin factura, declarados por encima de CRM × 1,05, o una diferencia de más de 5 puntos |

**Página (`src/verifica/` y `verifica.html`)**

- Entrada propia de Vite (`verifica`), fuera del menú de la App.
- Pinta el informe de referencia con el aviso «Empresa ficticia», con un selector entre «Con trampas» y «Sin trampas».
- Un solo botón relleno: «Descargar informe» (JSON).
- Cada cifra sale una vez, en la frase de su hallazgo. Las referencias van plegadas.
- Al pie: fuentes, huella completa y el estado «Coincide con el contenido».
- Hoja propia `verifica.css` con las tintas de la consola copiadas como tokens. Sigue el tema oscuro de la App (`planb:theme`) y al imprimir pone la página 2 en hoja aparte.

**Cifras de la empresa de referencia**, con márgenes holgados frente a los umbrales:

| Regla | Con trampas | Sin trampas |
| --- | --- | --- |
| Ventana | 49 creadas (1.041.800 €) y 6 subidas (150.000 €), 254 % de lo normal | 98 % |
| Aplazadas | 8 aplazadas (96.600 €) | 1 aplazada (la legítima) |
| Facturas | 12 ganadas sin factura (164.300 €), 4 ambiguas y 3 recientes | 0 sin factura |
| Concentración | Los dos primeros suman el 67,5 % | 34,8 % |
| Borrado | 320 → 240 contactos (80 borrados); captura retenida | 3 borrados y 5 nuevos |
| Renovación | 45 de 300 clientes sin factura; 340 activos declarados | 6 sin factura |

**Cómo se comprueba**

- `npx.cmd tsc --noEmit -p tsconfig.json`: correcto.
- `node tools/safe-tests.mjs verifica orphan-components color-guard css-unused design-tokens`: 6/6.
  - `verifica-referencia` tiene 6 casos:
    - La variante con trampas da las 6 alarmas con sus cifras.
    - La variante sin trampas no da ningún aviso.
    - No sale ningún nombre, correo ni identificador del CRM.
    - La huella es estable y se rompe con cualquier retoque; otra sal cambia las referencias pero no las cifras.
    - Sin historial, sin facturas o sin captura anterior, la regla pasa a «sin comprobar» y aparece en la página 2.
    - Con 24 meses de facturas, la renovación pasa a observada.
  - `verifica-pagina` tiene 3 casos con `renderToStaticMarkup`:
    - 6 hallazgos, 6 sellos, la huella y el aviso de empresa ficticia.
    - La variante limpia no lleva sellos.
    - Un solo botón relleno y ningún nombre del CRM en la página.
- Prueba de mutación: si el seudónimo devuelve el identificador real, `verifica-referencia` falla. Se deshizo después.
- Compilación de Vite a una carpeta temporal, antes → después:
  - JS inicial de la App: 761.011 → 761.300 B; 233.575 → 233.753 B comprimido. Presupuesto: 235.520 B.
  - CSS inicial de la App: 356.873 → 356.873 B, sin cambio.
  - La subida es el trozo de React que ahora comparten las dos entradas. Por eso la página no importa `theme.ts` y lee el tema por su cuenta.
  - Verifica carga aparte: 21,3 kB de JS (7,8 kB comprimido) y 6,2 kB de CSS.

**Desviación del plan:** el plan habla de «dos comerciales». Con solo dos, la regla de concentración avisaría siempre (los dos primeros serían el 100 %). La empresa ficticia tiene 6 comerciales, y dos de ellos concentran la cartera en la variante con trampas.

**Huecos del plan que esta tanda no cubre** (solo se pueden cerrar con datos o permisos que aquí no hay):

- No hay lector de Holded ni formato de importación de facturas.
- El historial de propiedades de HubSpot (`propertiesWithHistory`) no se usa en ningún sitio del código y no está validado contra una cuenta de pruebas.
- No hay historial de Pipedrive.
- `shared/billing-check.ts`, que cita el plan, no existe en el repositorio.

**Sigue abierto (decide la usuaria):** destinos de cada parte (motor, congelado, aparcado o fuera), coordinador y dueños de carpetas, y sacar las carpetas de instalaciones del repositorio. Sin eso, la salida de la fase 0 «un solo producto en el menú» no está hecha.

## Verifica · Fase 1 · GitHub Copilot

### Reserva · antes de editar

22/11/2026, 16:40 Europe/Madrid. La usuaria: «ves a ello», sobre los puntos 1 a 3 de la fase 1 que se pueden hacer en el equipo de la empresa.

Antes de reservar se miraron los lectores que ya hay. Ninguno trae lo que piden las reglas:

- `server/hubspot.ts` no pide la fecha de creación, el comercial ni el historial, y no sabe qué etapas son ganada o perdida.
- `server/pipedrive-source.ts` es del Radar: como mucho 500 registros y sin importes.

Por eso hace falta un lector propio de Verifica, que no toca a los existentes.

Alcance:

- **`shared/verifica/hubspot.ts` (nuevo):** traduce las respuestas de HubSpot a la captura de Verifica. Incluye el historial de importe y fecha de cierre (`propertiesWithHistory`) y el estado ganada o perdida que dan las etapas.
- **`server/verifica/hubspot-reader.ts` (nuevo):** recorre HubSpot en solo lectura con un `fetch` inyectado. Solo GET y las búsquedas de recuento.
- **`shared/verifica/invoices.ts` (nuevo):** importa un CSV de facturas emitidas (el libro de Holded guardado como CSV) y lo cruza con las empresas del CRM por NIF o nombre.
- **`shared/verifica/model.ts`:** NIF opcional en la empresa.
- **`scripts/verifica-hubspot.ts` (nuevo):** solo para el ordenador personal y el portal de pruebas. Aquí no se ejecuta.
- **Pruebas:** `tests/verifica-*.test.ts`. La empresa con trampas pasa por un HubSpot simulado en memoria y por un CSV de facturas, y debe seguir dando las seis alarmas y ningún falso aviso.

Sin servidores, navegador, PowerShell, DPAPI, red ni datos reales. El lector no importa `server/store.ts`, porque lleva el cifrado local. Dueño provisional de `shared/verifica/` y `server/verifica/`: GitHub Copilot.

### Hecho · 22/11/2026, 16:50 · cómo se comprueba

Hechos los puntos 1 a 3 de la fase 1, tal como se reservaron. La empresa con trampas ya pasa por los lectores reales, no solo por el fixture: con un HubSpot simulado y un CSV de facturas da las seis alarmas con las cifras de referencia, y la variante sana no da ningún aviso.

| Pieza | Qué hace |
|---|---|
| `shared/verifica/hubspot.ts` | Traduce las respuestas de HubSpot a una captura de Verifica. El historial llega del más reciente al más antiguo y se ordena al revés, con fechas en ISO o en milisegundos. El estado ganada o perdida sale de `metadata.isClosed` y `probability` de cada etapa. Si falta el historial en una sola oportunidad, se quita en todas y la captura queda «sin historial». |
| `server/verifica/hubspot-reader.ts` | Recorre comerciales, etapas, empresas, contactos y oportunidades (páginas de 50 con `propertiesWithHistory=amount,closedate`). Solo GET a `api.hubapi.com`, más un POST de recuento por objeto. La credencial va en la cabecera, sin redirecciones. Antes de leer datos comprueba el portal y el tipo de cuenta (pruebas: `DEVELOPER_TEST` o `SANDBOX`; producción en lectura: `STANDARD`). Para la lectura entera si el recuento no cuadra, si un cursor se repite o si se pasa de páginas o registros. Reintenta dos veces tras 429 o 5xx. |
| `shared/verifica/invoices.ts` | Importa un CSV de facturas emitidas: separador `;`, `,` o tabulador, comillas, BOM, importes y fechas en formato español. Usa la base imponible; si solo hay total, lo usa y avisa. Cruza con las empresas del CRM por NIF y, si no hay, por nombre sin tildes ni forma societaria. Los nombres repetidos no se asignan. Descarta líneas malas y números repetidos, diciendo la línea y el motivo. |
| `scripts/verifica-hubspot.ts` | Lectura completa de un **portal de pruebas**, solo en el ordenador personal. Exige `--authorized-full-read`, toma la credencial por la entrada estándar, nunca sobrescribe y dice si llegó el historial. Con `--previous`, `--invoices` y `--report` escribe además el informe. |
| `shared/verifica/model.ts` | NIF opcional en la empresa, solo para cruzar facturas. |

**Cómo se comprueba aquí (sin red):**

- `npx tsc --noEmit -p tsconfig.json`: limpio.
- `node tools/safe-tests.mjs verifica orphan-components css-unused color-guard design-tokens dev-only-files`: 8 de 8 archivos.
- `tests/verifica-lectores.test.ts`, 9 casos:
  - las dos variantes de la empresa leídas por los lectores reales;
  - solo lectura y credencial fuera de la URL;
  - historial ausente → «sin comprobar»;
  - cuenta equivocada o de producción en modo de pruebas → para sin leer datos;
  - recuento distinto, cursor repetido, 401, 403 y 5xx → ninguna captura;
  - importes y fechas en español;
  - cruce de facturas;
  - el script: sin autorización hace 0 peticiones, y no imprime la credencial.
- Prueba de mutación: sin ordenar el historial, o usando el total en vez de la base, fallan los dos casos de extremo a extremo. Se deshizo después.
- No toca la App: ningún archivo de `src/`, así que el paquete inicial no cambia.

**Falta validar en el ordenador personal, con el portal de pruebas** (supuestos sacados de la documentación pública, nunca vistos en una respuesta real):

1. Que `propertiesWithHistory` llegue junto con `associations=companies` en la misma petición, y en `/crm/v3`.
2. El formato de `timestamp` del historial; se aceptan los dos.
3. Que `metadata.isClosed` y `probability` de las etapas vengan como texto `"true"` y `"1.0"` (o como número).
4. Las cabeceras reales del libro de facturas emitidas de Holded. Se admiten las de `INVOICE_COLUMNS`; si no cuadran, el importador dice qué columna falta.

Pasos: crear en el portal de pruebas unas oportunidades, cambiarles importe y fecha de cierre, y ejecutar:

```
<credencial> | npx tsx scripts/verifica-hubspot.ts --portal <ID> --authorized-full-read --out antes.json
```

Una semana después, o tras borrar contactos:

```
<credencial> | npx tsx scripts/verifica-hubspot.ts --portal <ID> --authorized-full-read --out ahora.json --previous antes.json --report informe.json
```

Si dice «Historial: NO», la regla de aplazamientos no se puede prometer con HubSpot hasta resolverlo.

**Sigue pendiente de la fase 1** (no se puede hacer en este equipo):

- validar lo anterior en el portal de pruebas;
- el historial de Pipedrive;
- subir el prototipo `billing-check`, que sigue sin estar en el repositorio.

La salida de la fase 1 (la empresa con trampas da las seis alarmas por los lectores reales) queda cumplida con lectores simulados. Falta confirmarla con el portal de pruebas.

## Verifica · Fase 2 · Informe y sala limpia · GitHub Copilot

### Reserva · antes de editar

22/11/2026, 17:05 Europe/Madrid. La usuaria: «continúa con la siguiente fase y ve apuntando todo lo que va quedando pendiente». Lo pendiente se lleva en la lista viva de abajo, «Verifica · Pendientes».

Alcance, todo código puro y pruebas sin red:

- **`shared/verifica/clean-room.ts` (nuevo), la sala limpia:**
  - genera el informe con una sal nueva;
  - antes de soltarlo comprueba que no lleva ningún nombre, correo, NIF ni ID del CRM;
  - si lleva alguno, no sale nada.
- **`shared/verifica/custody.ts` (nuevo), la copia custodiada:**
  - cifra con AES-256-GCM (Web Crypto, sin DPAPI) todo lo necesario para rehacer el informe: capturas, facturas, declaraciones y sal;
  - la copia queda atada a la huella del informe;
  - la llave es aleatoria y se entrega aparte;
  - al abrir la copia se rehace el informe y se comprueba que la huella es idéntica.
- **`scripts/verifica-sala-limpia.ts` (nuevo):** trabaja sin conexión, a partir de capturas ya guardadas, y escribe el informe, la copia y la llave en archivos nuevos. `scripts/verifica-hubspot.ts` pasa a soltar el informe por la misma barrera.
- **Interfaz, `src/verifica/` (verificador público):**
  - abrir un informe JSON y comprobar su huella;
  - con la copia y la llave, comprobar que la copia reproduce el informe, todo en el navegador, sin enviar nada;
  - un solo botón relleno por vista.
  - El aviso «Empresa ficticia» solo se muestra en el informe de referencia.
  - Se mide el paquete antes y después.
- **Pruebas:** `tests/verifica-*.test.ts`. La empresa con trampas pasa por la sala limpia y por la copia. Retocar el informe o la copia, o usar otra llave, debe notarse.

Sin servidores, navegador, PowerShell, DPAPI, red ni datos reales. Dueño provisional: GitHub Copilot, de `shared/verifica/`, `server/verifica/`, `src/verifica/` y `scripts/verifica-*`.

### Hecho · 22/11/2026, 17:15 · cómo se comprueba

Hecho todo lo reservado. Salida de la fase 2: la empresa con trampas pasa por la sala limpia, el informe sale con sus seis alarmas sin ningún texto del CRM, y la copia custodiada rehace ese mismo informe, huella por huella.

| Pieza | Qué hace |
|---|---|
| `shared/verifica/clean-room.ts` | **La barrera.** Busca en el informe los nombres de comerciales, empresas, contactos y oportunidades (sin tildes ni mayúsculas), los correos, los NIF y los IDs de registros y facturas. Si encuentra alguno, no sale nada, y el error dice cuántos encontró pero no cuáles. `runCleanRoom` usa una sal nueva cada vez y devuelve el informe, la copia y la llave. |
| `shared/verifica/custody.ts` | **La copia custodiada.** Comprime y cifra con AES-256-GCM (Web Crypto: igual en Node y en el navegador, sin DPAPI) todo lo que hace falta para rehacer el informe, sal incluida. La huella del informe y la fecha de corte van autenticadas: la copia no se puede presentar con otro informe. La llave es aleatoria (`vfk1-` y 43 caracteres). Al abrir la copia se rehace el informe y se compara su huella. Tope de 512 MiB descomprimida. |
| `scripts/verifica-sala-limpia.ts` | **Sin conexión.** Toma dos capturas, las facturas en CSV y las declaraciones en JSON, y escribe tres archivos nuevos: informe, copia y llave. Nunca imprime la llave ni sobrescribe. Si la barrera para el informe, no escribe nada; con `--show-leaks` dice, solo en esa pantalla, qué texto lo ha parado. |
| `scripts/verifica-hubspot.ts` | `--report` pasa ahora por la misma barrera. |
| `scripts/verifica-ejemplo.ts` | Escribe en una carpeta nueva los archivos de la empresa ficticia, para probar el recorrido a mano. |
| `shared/verifica/report.ts` | `parseReport`: comprueba la forma de un informe que llega de fuera antes de pintarlo. Un informe bien formado pero retocado se acepta, y la página dice que no coincide con su huella. |
| `src/verifica/` (`verifica.html`) | **Verificador público.** «Abrir un informe» lee un JSON desde el equipo y comprueba su huella. Con un informe abierto aparece «Comprobar con la copia custodiada»: archivo de la copia y llave, en el navegador y sin enviar nada. La llave se borra del campo tras cada intento. Sin aviso de ficción ni variantes, que solo salen en el ejemplo. Un solo botón relleno por vista: «Descargar informe» en el ejemplo y «Comprobar la copia» en un informe abierto. La huella del informe sale una sola vez. La comprobación no se imprime. |

**Cómo se comprueba aquí (sin red):**

- `npx tsc --noEmit -p tsconfig.json`: limpio.
- `node tools/safe-tests.mjs verifica orphan-components css-unused color-guard design-tokens dev-only-files`: 9 de 9 archivos. `node tools/css-unused.mjs`: 0 muertos.
- `tests/verifica-sala-limpia.test.ts`, 6 casos:
  - de extremo a extremo con las seis alarmas, sin textos del CRM ni la llave en el informe ni en la copia;
  - sal nueva por ejecución (mismas cifras, otros seudónimos);
  - otra llave, un byte cambiado, otra huella u otra fecha en la copia, una llave mal formada o una copia mal formada → no se abre;
  - no se sella una copia con un informe que no sale de ella;
  - la barrera para nombres, correos e IDs sin repetirlos en el mensaje;
  - el script: tres archivos, sin imprimir la llave, sin sobrescribir ni dejar archivos sueltos; entradas malas → código 2; la barrera → nada escrito.
- `tests/verifica-pagina.test.ts`, 3 casos nuevos:
  - un informe abierto, sin ficción y con un solo botón relleno;
  - archivos que no son informes, y un informe retocado señalado;
  - la comprobación de la copia en sus seis desenlaces.
- Prueba de mutación: con la barrera ciega, o sin la huella del informe en el dato autenticado, fallan 3 casos. Se deshizo después.
- Paquete, con `node tools/perf/bundle.mjs`:
  - App inicial sin cambios: 743,5 KB, 228,3 KB comprimido; CSS 348,5 KB.
  - Página Verifica: JS de 21,3 a 30,2 KB (de 7,8 a 10,8 KB comprimido); CSS de 6,2 a 8,8 KB.

**Recorrido a mano en el ordenador personal** (aquí no se abre navegador):

```
npx tsx scripts/verifica-ejemplo.ts ejemplo
npx tsx scripts/verifica-sala-limpia.ts --previous ejemplo/antes.json --latest ejemplo/ahora.json --invoices ejemplo/facturas.csv --declarations ejemplo/declaraciones.json --report informe.json --custody copia.json --key-out llave.txt
```

Abrir `verifica.html`, pulsar «Abrir un informe» → `informe.json`, y comprobar con `copia.json` y el contenido de `llave.txt`. Debe decir «La copia rehace este informe exactamente». Si se cambia una cifra de `informe.json`, debe decir que se ha tocado.

**Límites que hay que saber:**

1. La barrera es una heurística. No comprueba los nombres de una sola palabra («Acme») ni los de menos de 8 caracteres, porque podrían coincidir con el texto fijo del informe y bloquearlo sin motivo. Tampoco reconoce un nombre reescrito (abreviado, con otra forma societaria). Hoy las reglas solo escriben seudónimos y cifras; si una regla futura escribe texto libre, hay que revisarla.
2. La huella prueba que el informe no se ha tocado, pero no quién lo hizo: cualquiera puede fabricar un informe con huella coherente. Lo que lo ata a los datos es la copia custodiada, y lo que lo ata al vendedor es el contrato que cite las dos huellas. Una firma digital es una decisión abierta (ver pendientes).
3. La copia lleva las capturas enteras y la sal: quien tenga la copia y la llave ve todo el CRM. La llave nunca debe viajar con el informe ni con la copia.

## Verifica · Fase 3 · Vigilancia · GitHub Copilot

### Reserva · antes de editar

22/11/2026, 17:30 Europe/Madrid. La usuaria: «ve a ello» (fase 3). Según el plan: «Capturas semanales y aviso si la cartera se vacía o desaparecen contactos en bloque», con la captura retenida y un informe al cierre.

Alcance, todo código puro y pruebas sin red:

- **`shared/verifica/watch.ts` (nuevo), el motor de vigilancia:**
  - parte de la captura de la firma y compara cada captura semanal con la última aceptada;
  - tres avisos: registros borrados en bloque; cartera que se vacía (perdida, borrada o rebajada, nunca lo ganado); semana sin captura;
  - la captura que encoge queda **retenida** (cuarentena A2, `assessShrink`) y no pasa a ser la base de comparación hasta que las partes la acepten;
  - **parte al cierre**: firma frente a última captura, con huella y seudónimos.
- **`shared/verifica/empresa-vigilada.ts` (nuevo):** la empresa con trampas vigilada 5 semanas. Con trampas: contactos borrados, cartera vaciada y una semana sin captura. Sin trampas: actividad normal sin avisos. Lo esperado se anota mientras se siembra.
- **La barrera de la sala limpia** se aplica también al parte de vigilancia.
- **`scripts/verifica-vigilancia.ts` (nuevo):** sin conexión, de capturas guardadas a parte de vigilancia. `scripts/verifica-ejemplo.ts` escribe también las capturas semanales.
- **Interfaz, `src/verifica/`:** `verifica.html` abre también un parte de vigilancia y comprueba su huella. Un solo botón relleno por vista; se mide el paquete.
- **Pruebas:** `tests/verifica-vigilancia.test.ts` y casos en `tests/verifica-pagina.test.ts`.

Sin servidores, navegador, PowerShell, DPAPI, red ni datos reales. Dueño provisional: GitHub Copilot, como en la fase 2.

### Hecho · 22/11/2026 · cómo se comprueba

Hecho todo lo reservado. Salida de la fase 3: la empresa vigilada pasa cinco semanas después de la firma. Cada trampa sale en su semana, la captura que encoge queda retenida, y el parte al cierre suma lo que se perdió. Todo sale con seudónimos y sin ningún texto del CRM. Sin trampas, ni un aviso.

| Pieza | Qué hace |
|---|---|
| `shared/verifica/watch.ts` | **El motor.** Para los avisos, compara cada captura con la anterior. Hay cinco: contactos, empresas u oportunidades borrados en bloque (mismos umbrales que el informe, 10 registros y 5 %); cartera abierta que se vacía; y semana sin captura. La cartera se vacía si al menos 3 oportunidades abiertas y el 10 % del importe pasan a perdidas, se borran o bajan de importe; lo ganado no cuenta. Falta una semana si pasan más de 7 + 3 días entre dos capturas. Para retener, compara con la **última captura aceptada** (`assessShrink`, la cuarentena A2): la captura que encoge no pasa a ser la base hasta que alguien la acepta (`--accept <huella>`). Hay además un aviso de «ahora mismo» si a la fecha del parte ya falta la captura que tocaba. El parte al cierre compara la firma con la última captura. Lleva huella, `parseWatchReport` para leerlo desde fuera y la barrera de la sala limpia (`releaseWatchReport`). |
| `shared/verifica/empresa-vigilada.ts` | **La empresa vigilada:** la empresa con trampas, sana, firmada el 20/11/2026 y seguida 5 semanas. Semana 2: borran 80 contactos. Semana 3: no hay captura. Semana 4: las 18 oportunidades abiertas más grandes pasan a perdidas, se borran 6 y 4 se dejan a cero. Lo esperado se anota trampa por trampa al sembrarlas; no sale de aplicar los umbrales. La actividad normal no toca lo que ya usa una trampa. |
| `shared/verifica/clean-room.ts` | La barrera, generalizada a cualquier lista de capturas (`leaksIn`, `sensitiveTextsOf`), para que sirva también al parte. |
| `scripts/verifica-vigilancia.ts` | **Sin conexión:** de la captura de la firma y las semanales a un parte de vigilancia. La sal va en un archivo que crea la primera vez y reutiliza después, para que los seudónimos sean los mismos semana tras semana. Nunca la imprime. Si la barrera para el parte, no escribe nada (`--show-leaks` dice qué lo ha parado, solo en pantalla). Códigos de salida: 0 bien, 1 parado o error al escribir, 2 mal uso. |
| `scripts/verifica-ejemplo.ts` | Escribe también `firma.json` y `semana-N.json`. Con trampas falta `semana-3.json`. |
| `src/verifica/` (`verifica.html`) | **El parte en la página.** En el ejemplo, «Informe · Vigilancia» junto al nombre del producto, con las variantes con y sin trampas. «Abrir un informe» reconoce también un parte de vigilancia. La vista muestra: «Ahora mismo» (solo si falta una captura), «Semana a semana» (fecha, estado de la captura, avisos con sus referencias), «Al cierre» y la huella. Un solo botón relleno en el ejemplo, «Descargar parte», y ninguno en un parte abierto, porque no hay nada que comprobar con copia. Cabecera, referencias y huella son ahora piezas comunes (`Masthead.tsx`, `documents.ts`). |

**Cómo se comprueba aquí (sin red):**

- `npx tsc --noEmit -p tsconfig.json`: limpio.
- `node tools/safe-tests.mjs verifica orphan-components css-unused color-guard design-tokens dev-only-files`: 10 de 10 archivos. `node tools/css-unused.mjs`: 0 muertos.
- `tests/verifica-vigilancia.test.ts`, 7 casos:
  - cada trampa en su semana con sus cifras: semana 2, 324 → 246 contactos; semana 4, falta la captura de 14 días y la cartera se vacía en 538.800 € de 1.596.200 € (33,8 %);
  - las capturas retenidas, y la base de comparación una vez aceptadas;
  - el cierre: 90 contactos borrados y 36,6 % de la cartera vaciada;
  - sin trampas, ningún aviso;
  - capturas desordenadas o un parte anterior a la última captura → error;
  - la barrera y la huella;
  - el script con dependencias en memoria.
- `tests/verifica-pagina.test.ts`, 4 casos nuevos:
  - el parte de ejemplo con sus avisos y retenidas, sin textos del CRM y un solo botón relleno;
  - sin trampas, ningún sello;
  - un parte abierto, sin botón relleno y señalado si se ha tocado;
  - la captura atrasada arriba, una sola vez.
- Prueba de mutación: con la retención ciega, o contando lo ganado como cartera vaciada, fallan los casos de trampas y de empresa limpia. Se deshizo después.
- Paquete (`vite build` a una carpeta temporal): la página Verifica pasa de 30,2 a 44,6 KB de JS (de 10,8 a 15,0 KB comprimido) por el motor y la empresa de ejemplo, y de 8,8 a 10,0 KB de CSS. La App no importa nada de `src/verifica/`.

**Recorrido a mano en el ordenador personal** (aquí no se abre navegador):

```
npx tsx scripts/verifica-ejemplo.ts ejemplo
npx tsx scripts/verifica-vigilancia.ts --signing ejemplo/firma.json --capture ejemplo/semana-1.json --capture ejemplo/semana-2.json --capture ejemplo/semana-4.json --capture ejemplo/semana-5.json --salt sal.txt --report parte.json --as-of 2026-12-26
```

Abrir `verifica.html`, pulsar «Abrir un informe» → `parte.json`. Debe mostrar las mismas semanas y avisos que «Vigilancia · Con trampas» del ejemplo; los seudónimos cambian porque la sal es otra. Para aceptar una retenida, se vuelve a ejecutar con `--accept <huella completa de esa captura>`.

**Con un CRM real** (solo en el ordenador personal, con el portal de pruebas): una captura por semana con `scripts/verifica-hubspot.ts` (pasos en «Verifica · Fase 1»), guardando siempre la misma `sal.txt`, y el parte con `scripts/verifica-vigilancia.ts`.

**Límites que hay que saber:**

1. Los avisos son heurísticas con umbrales fijos: 10 registros y 5 % para los borrados, 3 oportunidades y 10 % para la cartera, 7 + 3 días para la cadencia. Pueden pasar por alto un goteo lento por debajo de los umbrales. El parte al cierre lo recoge en total, pero no dice en qué semana pasó.
2. No hay canal de aviso: el parte se genera cuando alguien ejecuta el script. Ni las capturas ni los avisos salen solos.
3. Aceptar una retenida es a mano y por huella. La herramienta no decide si un borrado era legítimo.
4. La sal la guarda quien genera el parte. Si se pierde, los seudónimos de las semanas siguientes no casan con los anteriores, aunque las cifras siguen valiendo.
5. «Cartera abierta» son las oportunidades con estado `open` en la captura, que el lector saca de las etapas. Si el vendedor cambia las etapas del pipeline entre semanas, el aviso puede dispararse o callarse sin motivo.

## Verifica · Fase 4 · Después del cierre · GitHub Copilot

### Reserva · antes de editar

22/11/2026, 18:00 Europe/Madrid. La usuaria: «continúa a por la fase 4». Según el plan: «Copia custodiada desde el primer día y migración verificada al CRM del comprador», con un «informe de equivalencia».

Se reaprovecha el verificador de migraciones que ya existe (`shared/migration-verifier.ts`, `compareMigration`): empareja solo por las claves de un mapa que confirma una persona, no resuelve lo ambiguo y nunca dice «migración íntegra». No se cambia su comportamiento.

Alcance, todo código puro y pruebas sin red:

- **`shared/verifica/equivalence.ts` (nuevo):** el informe de equivalencia. Parte de la captura del cierre (la última de la vigilancia, misma huella) y de la exportación del CRM del comprador. Dice, por objeto, qué llegó igual, qué falta, qué llegó distinto, qué sobra, qué es ambiguo y qué relaciones se rompieron. Lleva seudónimos con la misma sal, huella, lectura desde fuera y la barrera de la sala limpia.
- **`shared/verifica/empresa-migrada.ts` (nuevo):** la empresa vigilada, ya cerrada, migrada a un CRM ficticio de otro proveedor. Con trampas: contactos que no llegan, importes mal convertidos, fechas en un formato que no se entiende, oportunidades colgadas de otra empresa, contactos duplicados y empresas borradas que reviven. Sin trampas: equivalente. Lo esperado se anota al sembrar.
- **`scripts/verifica-migracion.ts` (nuevo):** sin conexión, de la captura del cierre, la exportación del destino y el mapa al informe de equivalencia. Opcional: comprobar que la captura del cierre es la del parte de vigilancia y escribir una lista de trabajo con los IDs reales para quien corrige la migración (no sale en el informe). `scripts/verifica-ejemplo.ts` escribe también el destino y el mapa.
- **Interfaz, `src/verifica/`:** pestaña «Migración» en `verifica.html` y apertura de un informe de equivalencia. El ejemplo se carga aparte, solo al pulsar la pestaña, para que el verificador no cargue `zod`. Un solo botón relleno por vista; se mide el paquete.
- **Pruebas:** `tests/verifica-migracion.test.ts` y casos en `tests/verifica-pagina.test.ts`.

Sin servidores, navegador, PowerShell, DPAPI, red ni datos reales. Dueño provisional: GitHub Copilot, como en las fases 2 y 3.

### Hecho · 22/11/2026 · cómo se comprueba

Hecho todo lo reservado (commits `92bfba4` motor y `dbc1bd2` interfaz). Salida de la fase 4: la empresa vigilada, ya cerrada, se migra a un Pipedrive ficticio del comprador. Con trampas, el informe de equivalencia encuentra exactamente lo sembrado, con seudónimos y sin ningún texto del CRM. Sin trampas dice «Sin diferencias en lo que compara el mapa», nunca «migración íntegra».

| Pieza | Qué hace |
|---|---|
| `shared/verifica/equivalence.ts` | **El formato del informe de equivalencia**, sin `zod`: veredicto, tabla por objeto (al cierre, en el destino, llegaron igual), hallazgos y huella. «Llegaron igual» descuenta también los que llegaron con una relación rota, que el verificador de migraciones da por idénticos. Lleva `parseEquivalenceReport` y `verifyEquivalenceReport` para leerlo y comprobarlo desde fuera. Siete clases de hallazgo: no llegaron, llegaron con otro valor y relaciones rotas (diferencias confirmadas); sobran en el destino (confirmada); valores que no se entienden, ambiguos y sin concluir (no se concluye). |
| `shared/verifica/migration.ts` | **El motor**, sobre `compareMigration` de `shared/migration-verifier.ts`, sin cambiarlo. Convierte la captura del cierre en exportación de origen, compara con el destino según el mapa y saca el informe sin valores: dice qué campo cambió («amount → value»), no de qué a qué. Con el parte de vigilancia comprueba que la captura del cierre es su última captura (si no, `WATCH_MISMATCH`; si el parte se ha tocado, `WATCH_TAMPERED`). Pasa por la barrera de la sala limpia (`releaseEquivalence`). La lista de trabajo (`equivalenceWorkList`) es un CSV aparte con los IDs reales, con las celdas que una hoja de cálculo ejecutaría escapadas. Con el destino exportado a medias, lo que no se encuentra sale como «sin concluir», no como perdido. |
| `shared/verifica/empresa-migrada.ts` | **La empresa migrada:** la vigilada con trampas, cerrada en su última captura (25/12/2026) y migrada el 15/01/2027. Trampas: 12 contactos que no llegan, 2 contactos duplicados en el destino (ambiguos), 5 importes mal convertidos, 3 fechas en un formato que no se entiende, 4 oportunidades colgadas de otra empresa o sin enlace y 3 empresas que sobran. Lo esperado se anota al sembrar. Sin trampas, migración idéntica. |
| `scripts/verifica-migracion.ts` | **Sin conexión:** de cierre, destino y mapa al informe. `--target` acepta una exportación de migración o una captura de Verifica. Con `--watch` exige la sal que ya existe, para que los seudónimos casen con el parte. `--work-list` escribe la lista con IDs reales, que no se imprime. Nunca sobrescribe. Códigos de salida: 0 bien, 1 parado o error al escribir, 2 mal uso. |
| `scripts/verifica-ejemplo.ts` | Escribe también `cierre.json` (igual que la última semana), `destino.json` y `mapa.json`. |
| `src/verifica/` (`verifica.html`) | **Pestaña «Migración»** junto a «Informe · Vigilancia». La entradilla da las fechas y el veredicto («Hay diferencias en 4 puntos; 2 más no se pueden concluir»). Después: «Objeto a objeto» (la tabla, con «Llegaron igual» en rojo si no llegaron todos), «Diferencias confirmadas», «Lo que no se pudo concluir ni comparar» (en la segunda página al imprimir), «Lo que este informe no dice» y la huella. Los recuentos solo salen en la tabla. El ejemplo se carga aparte al pulsar la pestaña («Preparando el ejemplo…»), porque arrastra `zod`. «Abrir un informe» reconoce también un informe de equivalencia. Un solo botón relleno en el ejemplo, «Descargar informe de equivalencia», y ninguno en uno abierto. |

**Cómo se comprueba aquí (sin red):**

- `npx tsc --noEmit -p tsconfig.json`: limpio.
- `node tools/safe-tests.mjs verifica orphan-components css-unused color-guard design-tokens dev-only-files`: 11 de 11 archivos. `node tools/css-unused.mjs`: 0 muertos.
- `tests/verifica-migracion.test.ts`, 7 casos:
  - con trampas, exactamente lo sembrado, y los contadores del verificador cuadran;
  - sin trampas, ninguna diferencia;
  - el enlace con el parte de vigilancia, y el parte tocado o de otra captura;
  - la huella, la barrera y la lectura desde fuera;
  - el destino a medias («sin concluir», no perdido) y un mapa sin contactos, que lo dice;
  - la lista de trabajo con IDs reales y celdas escapadas;
  - el script con dependencias en memoria.
- `tests/verifica-pagina.test.ts`, 4 casos nuevos:
  - el ejemplo con trampas: tabla, cuatro diferencias arriba y dos abiertas en la segunda página, un solo botón relleno, la huella una vez y sin textos del CRM;
  - sin trampas, sin sellos y sin decir «íntegra»;
  - un informe abierto, sin botón relleno y señalado si se ha tocado; y la espera del ejemplo, sin botón;
  - el destino a medias: la entradilla dice por qué no se puede concluir.
- Prueba de mutación del motor: dejando ciegos los que no llegan y las relaciones rotas, fallan dos casos con tres problemas concretos. Se deshizo después.
- Paquete (`vite build` a una carpeta temporal): la página Verifica pasa de 44,6 a 52,5 KB de JS (de 15,0 a 17,0 KB comprimido) y de 10,0 a 10,9 KB de CSS. El ejemplo de migración va aparte (27,8 KB, se carga al pulsar la pestaña); `zod` no está en el paquete principal.

**Recorrido a mano en el ordenador personal** (aquí no se abre navegador):

```
npx tsx scripts/verifica-ejemplo.ts ejemplo
npx tsx scripts/verifica-vigilancia.ts --signing ejemplo/firma.json --capture ejemplo/semana-1.json --capture ejemplo/semana-2.json --capture ejemplo/semana-4.json --capture ejemplo/semana-5.json --salt sal.txt --report parte.json --as-of 2026-12-26
npx tsx scripts/verifica-migracion.ts --closing ejemplo/cierre.json --target ejemplo/destino.json --map ejemplo/mapa.json --salt sal.txt --watch parte.json --report equivalencia.json --work-list lista.csv --as-of 2027-01-16
```

El último debe decir «Hay diferencias» y salir con 0. Abrir `verifica.html`, pulsar «Abrir un informe» → `equivalencia.json`. Debe mostrar la misma tabla y los mismos hallazgos que «Migración · Con trampas»; los seudónimos cambian porque la sal es otra. `lista.csv` lleva los IDs reales: se borra al terminar.

**Límites que hay que saber:**

1. Solo se compara lo que dice el mapa, y el mapa lo escribe y confirma una persona. Un mapa equivocado da un informe equivocado dentro de su alcance. Lo que el mapa no cubre sale en «Lo que no se pudo concluir ni comparar», empezando por los comerciales, que no se comparan.
2. No hay lector del CRM del comprador: el destino tiene que llegar ya como exportación de migración o como captura de Verifica. Hoy solo existe el lector de HubSpot.
3. El informe no lleva valores: dice qué campo llegó distinto, no de qué a qué. Para corregir hace falta la lista de trabajo, que lleva IDs reales y no pasa por la barrera.
4. La captura del cierre no se sella en una copia custodiada; su respaldo es la huella y el enlace con el parte de vigilancia.
5. Lo ambiguo no se resuelve: un contacto con dos candidatos en el destino queda abierto hasta que alguien elija.

## Verifica · Fase 5 · Salir a vender · GitHub Copilot

### Reserva · antes de editar

22/11/2026, 22:05 Europe/Madrid. La usuaria: «sigue con la fase 5». Según el plan: «Abogados para el anexo, precios y primeros informes; Salesforce solo con demanda pagada». La fase termina la primera vez que se habla con alguien de fuera, y nadie de fuera ve el producto hasta que pase sus cinco pruebas.

Aquí no se habla con nadie ni se vende nada: se prepara lo que hace falta para hacerlo. Código puro, pruebas sin red y un documento:

- **`shared/verifica/readiness.ts` (nuevo):** las cinco pruebas del plan, una por fase, sobre la empresa ficticia, cada una con su criterio literal. La fase 0 queda pendiente mientras no haya un solo producto en el menú, porque eso lo decide la usuaria.
- **`scripts/verifica-pruebas.ts` (nuevo):** un solo comando que las pasa todas y dice si el producto se puede enseñar fuera. Sin red y sin escribir nada.
- **`docs/verifica-salir-a-vender.md` (nuevo):** borrador del anexo de alcance para los abogados, precios de lanzamiento, el primer encargo paso a paso (72 horas hábiles), canal de venta y lo que no se dice nunca. Va por debajo del plan de producto, que sigue mandando.
- **Pruebas:** `tests/verifica-pruebas.test.ts`.

Sin interfaz. El único servidor es el de Vite de `verifica.html` en `127.0.0.1`, solo para verla, con permiso de la usuaria; sin servidor de la app, DPAPI, carpetas de datos, red ni datos reales.

### Hecho · 22/11/2026

| Commit | Qué |
| --- | --- |
| `2a16087` | Las cinco pruebas en un solo comando: `shared/verifica/readiness.ts`, `scripts/verifica-pruebas.ts` y `tests/verifica-pruebas.test.ts` (3 casos) |
| `fd33dd1` | `docs/verifica-salir-a-vender.md` |

**Resultado hoy:** las fases 1 a 4 pasan con la empresa ficticia. La 0 queda **pendiente** porque la referencia está escrita pero el menú todavía no tiene un solo producto. Por eso el comando sale con 1 y dice «No se enseña fuera todavía». Con `--single-product` (solo quien lo haya decidido) sale con 0. Siempre añade que todo está probado con empresas ficticias y que los textos legales son de los abogados.

**Qué mide cada prueba:**

- **Fase 1:** salen las seis alarmas con sus cifras y ningún falso aviso sin trampas.
- **Fase 2:** un tercero, con solo el JSON publicado, valida la huella y rechaza una cifra retocada. Ni el informe ni la copia llevan textos del CRM ni la llave, y la copia rehace la misma huella.
- **Fase 3:** borrar contactos da aviso y retiene la captura; sin borrados no sale ningún aviso.
- **Fase 4:** la migración limpia sale «sin diferencias en lo que compara el mapa» y la de fallos sembrados los enseña todos.

**El documento:** lista previa a la primera conversación de fuera, borrador del anexo de alcance (reglas y umbrales, huella, sala limpia, copia, vigilancia y equivalencia, cada uno contrastado con el código), primer encargo en 72 horas hábiles, canal (agencias de HubSpot y abogados; Salesforce solo con demanda pagada) y lo que no se dice nunca. Los precios no se copian: siguen en el plan.

**Cómo se comprueba:**

- `npx tsc --noEmit -p tsconfig.json` sin errores.
- `node tools/safe-tests.mjs verifica orphan-components css-unused color-guard design-tokens dev-only-files`: 12 de 12.
- `node tools/css-unused.mjs`: 0 muertos.
- Cada prueba deja de pasar si se rompe lo que mide, y falla por la razón correcta, no por una excepción. Lo comprueba el segundo caso del test:
  - referencia sin alarmas;
  - datos sin trampas;
  - informe que no cuadra;
  - vigilancia sin borrados;
  - destino de la migración con fallos.
- A mano: `npx tsx scripts/verifica-pruebas.ts` (sale con 1 y la fase 0 pendiente) y `npx tsx scripts/verifica-pruebas.ts --single-product --json` (sale con 0).

**Límites:**

1. Pasar las cinco pruebas no es la salida de la fase 5: esa es la primera conversación con alguien de fuera, que depende de la usuaria y de la lista de la sección 1 del documento.
2. `--single-product` lo declara una persona: el programa no mira el menú.
3. El anexo es un borrador técnico, no un texto legal.
4. Hoy no hay cómo leer el portal de un cliente: `scripts/verifica-hubspot.ts` solo lee portales de pruebas (`mode: 'test'`).

## Verifica · Pendientes (lista viva)

Se actualiza al terminar cada tarea. Lo que se cierra se tacha con la fecha.

**Decide la usuaria**

- [ ] Destinos de cada parte: motor, congelado, aparcado o fuera. Es la salida de la fase 0.
- [ ] Qué agente coordina y quién es dueño de cada carpeta.
- [ ] Mover las 11 carpetas `planb-local-*` y `planb-hubspot-*` fuera del repositorio.
- [ ] A6 y A7 del relevo anterior. Con Verifica, A6 pierde sentido y A7 gana importancia.
- [ ] *(nuevo, fase 2)* ¿Firma digital del informe? Hoy la huella prueba que no se ha tocado, pero no quién lo emitió. Opciones: firma de Plan B Verifica como tercero, firma del vendedor, o solo el contrato citando las huellas.
- [ ] *(nuevo, fase 2)* Quién genera la copia y la llave y cómo se entregan: en mano, por un canal distinto del informe, o depositadas ante notario.
- [ ] *(nuevo, fase 3)* Quién hace la captura semanal entre la firma y el cierre: el vendedor con nuestra herramienta, nosotros con un acceso de solo lectura, o un tercero. Y qué pasa si una semana no la hace.
- [ ] *(nuevo, fase 3)* Cómo llega un aviso al comprador: correo, llamada o solo el parte cuando se pide. Hoy no hay canal: el parte sale cuando alguien ejecuta el script.
- [ ] *(nuevo, fase 3)* Quién acepta una captura retenida (comprador, vendedor o los dos) y cómo queda constancia.
- [ ] *(nuevo, fase 3)* Precio y forma de la vigilancia: la estrategia habla de 1.000–2.000 €/mes. ¿Va por meses, por operación o incluida en el informe?
- [ ] *(nuevo, fase 4)* Quién escribe y confirma el mapa de campos: nosotros, el integrador que hace la migración o el comprador. El informe solo es tan bueno como el mapa (límite 1 de «Verifica · Fase 4»).
- [ ] *(nuevo, fase 4)* Quién recibe la lista de trabajo con los IDs reales, por qué canal y cuándo se borra.
- [ ] *(nuevo, fase 4)* Precio del informe de equivalencia: ¿aparte, dentro de la vigilancia o como cierre del encargo? Y si se repite tras cada corrección de la migración.
- [ ] *(nuevo, fase 5)* Cuándo y con quién es la primera conversación de fuera: ¿una agencia de HubSpot, un abogado de compraventas o un search fund? Es la salida de la fase 5.
- [ ] *(nuevo, fase 5)* Quién guarda la copia custodiada y la llave en el primer encargo, y quién firma el encargo por parte de Plan B.

**Abogados y seguro (antes de la fase 5, la venta; no bloquean construir)**

- [ ] Texto del alcance: solo se afirma lo observado, nunca «cartera íntegra». Hoy el informe no lleva ningún texto legal.
- [ ] Acuerdo de tratamiento de datos con el vendedor y borrado al terminar.
- [ ] Seguro de responsabilidad profesional antes del primer cobro.
- [ ] Si la huella del informe y de la copia custodiada valen como anexo de las garantías del contrato, y quién guarda la copia y la llave (abogado o notario).
- [ ] *(nuevo, fase 2)* Que la sala limpia sea una heurística (límite 1 de «Verifica · Fase 2») es aceptable si el contrato lo dice; si no, hay que revisar a mano cada informe antes de soltarlo.
- [ ] *(nuevo, fase 2)* Cuánto tiempo se guarda la copia custodiada y cómo se destruye, porque lleva el CRM entero del vendedor.
- [ ] *(nuevo, fase 3)* Cómo entra la vigilancia en el contrato de compraventa: obligación del vendedor de no tocar la cartera entre firma y cierre, y qué consecuencia tiene un aviso (ajuste de precio, garantía, derecho a no cerrar). Los umbrales de los avisos (límite 1 de «Verifica · Fase 3») tendrían que salir del contrato o citarse en él.
- [ ] *(nuevo, fase 3)* Si mirar el CRM del vendedor cada semana necesita un permiso aparte en el acuerdo de tratamiento de datos.
- [ ] *(nuevo, fase 4)* Texto del informe de equivalencia: «sin diferencias en lo que compara el mapa», nunca «migración íntegra». Y si puede servir para liberar un pago aplazado o una retención del precio.
- [ ] *(nuevo, fase 4)* La exportación del CRM del comprador y la lista de trabajo llevan datos de las dos partes: quién es responsable del tratamiento en esa fase.
- [ ] *(nuevo, fase 5)* Revisar el borrador del anexo de alcance (`docs/verifica-salir-a-vender.md`, sección 2) y convertirlo en texto contractual. Es la base del texto del alcance de arriba.

**En el ordenador personal (aquí no se puede)**

- [ ] Validar el lector de HubSpot en el portal de pruebas: historial junto con la empresa asociada, formato de las fechas del historial, metadatos de las etapas. Pasos en «Verifica · Fase 1».
- [ ] Cabeceras reales del libro de facturas emitidas de Holded.
- [ ] Historial de Pipedrive.
- [ ] Subir el prototipo `shared/billing-check.ts`, que sigue sin estar en el repositorio.
- [ ] *(nuevo, fase 2)* Recorrido a mano de la sala limpia y el verificador con `scripts/verifica-ejemplo.ts`. Pasos en «Verifica · Fase 2».
- [ ] *(nuevo, fase 2)* Revisión visual de `verifica.html` con un informe abierto y la comprobación de la copia: escritorio y móvil, tema claro y oscuro, foco con teclado en «Abrir un informe» y «Elegir archivo». Aquí no se ha visto pintado; solo está probado el HTML.
- [ ] *(nuevo, fase 2)* Tamaño real de la copia con el portal de pruebas. El verificador acepta copias de hasta 64 MB; hay que ver cuánto ocupa un CRM con historial.
- [ ] *(nuevo, fase 3)* Recorrido a mano de la vigilancia con `scripts/verifica-ejemplo.ts` y `scripts/verifica-vigilancia.ts`, y abrir `parte.json` en `verifica.html`. Pasos en «Verifica · Fase 3».
- [ ] *(nuevo, fase 3)* Revisión visual de «Vigilancia» en `verifica.html`: escritorio y móvil, tema claro y oscuro, las pestañas «Informe · Vigilancia» con teclado, y la impresión del parte. Aquí solo está probado el HTML.
- [ ] *(nuevo, fase 3)* Dos o tres capturas semanales reales del portal de pruebas, haciendo a propósito un borrado en bloque y una oportunidad perdida, para ver que el aviso salta con datos de HubSpot y no solo con la empresa ficticia.
- [ ] *(nuevo, fase 4)* Recorrido a mano de la migración con `scripts/verifica-ejemplo.ts`, `scripts/verifica-vigilancia.ts` y `scripts/verifica-migracion.ts`, y abrir `equivalencia.json` en `verifica.html`. Pasos en «Verifica · Fase 4».
- [ ] *(nuevo, fase 4)* Revisión visual de «Migración» en `verifica.html`: escritorio y móvil (la tabla), tema claro y oscuro, la espera mientras carga el ejemplo, las tres pestañas con teclado y la impresión. Aquí solo está probado el HTML.
- [ ] *(nuevo, fase 4)* Una migración real de prueba: del portal de pruebas de HubSpot a una cuenta de prueba de otro CRM, con un mapa escrito a mano, para ver el informe con datos que no son de la empresa ficticia.
- [ ] *(nuevo, fase 5)* Un lector para el portal del cliente (hoy `verifica-hubspot.ts` solo admite portales de pruebas), con el mismo «solo lectura» y la autorización explícita. Va después de validar el lector en el portal de pruebas.

**Fases siguientes**

- [x] ~~Fase 2 · Informe y sala limpia~~: hecha el 22/11/2026 con la empresa con trampas. Falta lo marcado «fase 2» en las listas de arriba.
- [x] ~~Fase 3 · Vigilancia~~: hecha el 22/11/2026 con la empresa vigilada. Falta lo marcado «fase 3» en las listas de arriba.
- [ ] *(nuevo, fase 3)* La vigilancia sin intervención: un recordatorio cuando toca la captura y el parte generado solo. Necesita un servidor o una tarea programada, así que se hace en el ordenador personal o en la fase 5.
- [x] ~~Fase 4 · Después del cierre~~: hecha el 22/11/2026 con la empresa migrada. Falta lo marcado «fase 4» en las listas de arriba.
- [ ] *(nuevo, fase 4)* Lector del CRM del comprador: hoy el destino tiene que llegar ya como exportación de migración o como captura de Verifica. El primero, probablemente Pipedrive, junto con su historial (ya pendiente arriba).
- [ ] *(nuevo, fase 4)* Sellar la captura del cierre en una copia custodiada, como el informe de la fase 2, para que el informe de equivalencia se pueda rehacer meses después.
- [ ] Fase 5 · Salir a vender. **Preparada el 22/11/2026:** las cinco pruebas en `scripts/verifica-pruebas.ts` (pasan las fases 1 a 4; la 0 está pendiente) y `docs/verifica-salir-a-vender.md`. Queda abierta hasta la primera conversación con alguien de fuera, que no se tiene antes de cerrar la lista de la sección 1 de ese documento.

## Pendiente para el agente del otro ordenador

### Relevo de GitHub Copilot · 21/11/2026, 18:35 Europe/Madrid · leer primero

**Dónde me quedé:** la rama `planb-v0.3-local` está limpia y sincronizada en `7fcb771`. Está hecho y subido todo lo de «Siguiente, en este orden» que no dependía de la usuaria.

| Commit | Tema |
| --- | --- |
| `b95b5a1` | Revisión cruzada |
| `25ac07c` | B4.3 Cambios |
| `c14f115` | B3.1 Menú |
| `9e1ad41` | B4.4 Hoy y Agenda |
| `a0fedfa` | B4.5 Listas |
| `7fcb771` | A0-L Código sin montar |

El detalle y las medidas de cada tema están en la tabla «Ejecución del relevo» de este archivo.

**Siguiente: A6 y A7, que esperan la decisión de la usuaria.** Le presenté estas opciones y canceló el formulario, así que no hay nada decidido ni implementado. Pregúntale antes de tocar código.

**A7 · Clave local sin PowerShell ni DPAPI.**

Estado actual del código:

- `server/crypto.ts` (`localKey`) guarda `.planb-key` envuelta con DPAPI, que llama a `powershell.exe`.
- `Store` la abre en el constructor (`server/store.ts:36`), es decir, al arrancar y antes de cualquier inicio de sesión.
- La contraseña local es opcional: `server/security.ts`, `credential()`.
- Las capturas programadas corren solas: `continuity.tick()` cada 60 s en `server/v2.ts:192`.
- Otros consumidores de `localKey`: `provider.ts`, `continuity.ts`, `hubspot-read-check-mount.ts`, `team/local-config.ts`, `team/main.ts` (piloto) y varios `scripts/*`.

Consecuencias de cada opción:

- **(b) Clave derivada de la contraseña con scrypt:**
  - La contraseña pasa a ser obligatoria y la copia arranca bloqueada. Nada se descifra hasta el desbloqueo, así que hay que retrasar la creación del `Store` o su clave hasta el inicio de sesión.
  - Las capturas programadas esperan al desbloqueo después de cada reinicio.
  - Si se olvida la contraseña, solo se recupera con un paquete exportado. Ya existe `encodePortable` con scrypt.
  - La envoltura nueva debe llevar parámetros y versión de scrypt, como `server/password-hash.ts`.
  - El cambio debe ser atómico, con vuelta atrás.
- **Híbrido:** (b) por defecto y DPAPI opcional en equipos personales.
- **(c) Ejecutable propio firmado:** requiere un certificado de firma de código.
- **Migrar una copia que ya usa DPAPI** exige abrir DPAPI una última vez, y eso puede disparar la alerta una vez. La otra vía es exportar con contraseña e importar en una carpeta nueva.
- No prometer cero alertas.

**A6 · Licencias.**

Estado actual del código:

- `shared/license.ts` verifica Ed25519, pero `LICENSE_PUBLIC_KEY` está vacía.
- Las puertas de `shared/plans.ts` (`featureAccess`) son suaves: solo muestran una insignia.
- La prueba de 14 días vive en el navegador.

Decisiones pendientes:

- **Custodia de la clave privada.** La genera la usuaria en un equipo personal con `scripts/license-tool.ts keygen` y el agente solo recibe la pública. La otra opción es posponerla e implementar el servidor con claves de prueba.
- **Puertas suaves, o 402 en el servidor solo para funciones nuevas de pago.** Nunca para leer, exportar, recuperar ni salir de una contingencia.
- **Si la prueba de 14 días pasa al servidor.**

**Otros pendientes** que sí puede hacer un agente sin decisiones:

1. Sustituir la huella SHA-256 de `src/task-save-outcomes.css` en `tests/task-focus-outcomes.test.ts`, línea 21, por una aserción de comportamiento. Sigue pendiente.
2. Arreglar el arnés `auth-parent-harness` para que simule `useContinuityState`. Por esa carencia fallan `auth-parent` e `independent-interface-contexts`, igual en `HEAD` limpio, desde `607a835`.
3. Ejecutar `tests/relay-rehearsal-mount.test.ts`. Lleva una aserción nueva de manifiesto sin `recovery-rehearsal`, y `tools/safe-tests.mjs` lo omite porque arranca procesos.
4. Retirar o adaptar las pruebas de navegador de la antigua cola de Hoy: `tests/e2e/today-work-queue.spec.ts` y el bloque «Hoy» de `tests/e2e/independent-workspace-flows.spec.ts`. Buscan `.work-queue-count`, que ya no se monta.
5. Revisión visual y geometría de B4.3 a B4.5, que no se hizo aquí. También quedan de B4.5 «Guardar vista» dentro de «Más» y las tarjetas móviles de dos líneas.

**Cómo comprobar:**

- Tipos: `npx tsc --noEmit -p tsconfig.json`.
- Pruebas focales: `node tools/safe-tests.mjs <selectores>`. Los selectores de cada tema están en su fila de la tabla.
- Poda de CSS: `node tools/css-unused.mjs --write` y después `--dedupe`. La herramienta no quita alternativas muertas dentro de `:is()`, así que eso hay que hacerlo a mano.

Nota de convivencia (21/11/2026): B4.3 ya está cerrado, así que `ChangesView.tsx` queda libre para montar la interfaz del paquete de vuelta A4 descrito en `registro-claude-paralelo.md`. GitHub Copilot no lo monta en esta tanda porque no está en «Siguiente, en este orden».

Al hacer `git pull`, leer `docs/mision/00-LEEME.md` y, en este orden:

1. **Revisión cruzada hecha por Copilot el 21/11:** tabla por propuesta más abajo. Seguir el orden vigente de `00-LEEME.md`, no el reparto histórico de este apartado.
2. **Fase 1:** A0-L hecho en `7fcb771`. Sigue pendiente sustituir la huella SHA-256 de `src/task-save-outcomes.css` en `tests/task-focus-outcomes.test.ts` por una aserción de comportamiento.
3. **Antes de tocar** archivos del ámbito de interfaz (`src/consola.css`, `src/faro.css`, `src/ui/**`, `TopBar.tsx`, `Sidebar.tsx`, `navigation.ts`, `HomeOverview.tsx`, `ContinuityHome.tsx`), anotar aquí la tarea para no editar a la vez.

## Revisión cruzada · GitHub Copilot · 21/11/2026 (Europe/Madrid)

Leídos íntegros `00`, `02`, `03`, `04` y `05`, y la auditoría `01`. Contraste documental con el código de Cambios y los contratos de integridad; no es una nueva auditoría de todas las funciones ni una aceptación visual. La orden actual de la usuaria sustituye el reparto anterior: Copilot sigue el relevo, registra cada tarea de interfaz antes de editar y publica por tema. Sin Codex ni tablón.

| Propuesta | De acuerdo | Cambios propuestos | Motivo |
| --- | --- | --- | --- |
| A0 Tres preguntas | Sí | Mantener Copia, Prueba y Vuelta como modelo mental; no obligar a que todo sean pestañas | Ordena la promesa sin añadir navegación artificial |
| A0-L Código sin montar | Sí, con inventario | Retirar solo piezas sin consumidores; excluir el ensayo sintético del paquete, no borrar pruebas útiles | «Sin montar» no equivale a «sin uso»; un módulo de servidor puede tener consumidores indirectos |
| A1 Índice de preparación | Sí, con cambios | Unificar primero las fuentes; distinguir desconocido, caducado y fallido. Un simulacro debe probar la copia activa o una antecesora compatible, no cualquier copia posterior. Conservar evidencia de la exportación como declaración, no como ubicación comprobada | Evita dar preparación por una prueba ajena o por una afirmación no verificable. La conciliación puede requerir cambios de servidor: complejidad media, no baja |
| A1 Sello mensual | Parcial | No afirmar «todos los días 5/5» sin instantáneas diarias persistidas; mostrar cobertura del periodo y días sin evidencia | El estado actual no demuestra cómo estuvo el mes entero |
| A2 Cuarentena | Sí | No activar automáticamente si falta la conciliación; umbral por objeto y tratamiento explícito de primera captura, cero registros y pérdidas legítimas. Confirmación ligada a la candidata exacta | Un total agregado puede ocultar la desaparición de un objeto; confirmar una candidata no debe aprobar otra |
| A3 Simulacro programado | Sí | Aclarar «con la aplicación abierta», no solo PC encendido; persistir intento y resultado, evitar solapes y decidir recuperación tras interrupción. Escenario de PC perdido solo con paquete y contraseña disponibles | El temporizador del proceso no es un servicio de Windows; la idempotencia debe sobrevivir al reinicio |
| A4 Paquete de vuelta | Sí, con cambios | Elevarlo a P1 comercial antes de prometer la vuelta. Congelar revisión, portal, IDs y decisiones; proteger CSV frente a fórmulas y probar valores vacíos, propiedades de solo lectura y relaciones. No marcar devuelto hasta releer y comprobar | Exportar no equivale a importar; una importación manual conserva riesgos de destino, automatizaciones y mapeo. Complejidad y riesgo al menos medios |
| A5 Trabajo sobre la copia | Sí | Compartir la regla de vencido, pero conservar etiquetas de ámbito («en este periodo» frente a total). El filtro urgente en contingencia debe poder quitarse | Una misma definición no obliga a cifras iguales sobre subconjuntos distintos ni debe ocultar trabajo necesario |
| A6 Licencias | Sí, con límites | Elevar riesgo a 2; decidir puertas y periodo de gracia antes de aplicarlas. Nunca bloquear lectura, exportación, acceso a datos ya creados ni la salida de una contingencia. No generar claves hasta decidir custodia | Cobrar no puede inutilizar el plan de continuidad. La hora local y la migración de licencias también requieren pruebas |
| A7 Clave sin DPAPI | Favorable a estudiar (b), no aprobado | Decisión de la usuaria antes de implementar. Diseñar envoltura cifrada de la clave, parámetros/versionado de scrypt, migración atómica con vuelta atrás y recuperación por exportación. No prometer cero alertas | Cambia apertura, recuperación y custodia; quitar PowerShell elimina un disparador conocido, no garantiza la reacción de todo EDR |
| A8 Prueba de sesión | Sí, ya resuelta | Mantener la regresión causal; no reabrir el 401/200 como fallo vigente | El relevo distingue correctamente un anclaje obsoleto de una regresión |
| A8 Vencidos | Sí | Día civil de Europe/Madrid para fechas sin hora; tarea no completada y oportunidad abierta, con pruebas de medianoche y cambio de hora | Evita diferencias entre reloj UTC, navegador y vistas |
| A8 Preparación compartida | Sí | Un contrato puro con reloj inyectado; no introducir otro modelo paralelo mientras se migra | Reducir discrepancias importa más que mover un archivo |
| A8 Componentes de 25 KB | Parcial | Tratar 25 KB como señal, no criterio de aceptación; extraer por responsabilidad con cobertura previa | Dividir por tamaño puede multiplicar indirecciones sin reducir riesgo |
| A8 Huellas de interfaz | Sí | Sustituir solo las huellas del área tocada por comportamiento, antes de cambiarla; conservar las que verifican artefactos inmutables | No todas las huellas son deuda y actualizar el hash a ciegas no prueba nada |
| A8 Rendimiento | Sí | Presupuesto con datos, hardware y métricas repetibles; ejecutar el banco pesado en CI/equipo autorizado, no aquí | 10.000 registros sin escenario ni presupuesto no es un criterio verificable |
| A8 Copia antes de migrar | Sí | Probar restauración y disco lleno, fijar retención y no duplicar datos fuera del cifrado | Crear un archivo no acredita una copia recuperable |
| A9 Exclusiones 1.0 | Sí | Propuestas, IA, conectores nuevos y nube fuera del flujo comercial. El Laboratorio se conserva solo con datos de prueba y rotulado; no moverlo a Hoy | Evita prometer funciones simuladas y dispersar el foco |
| A9 Coste de caída | Sí, con matiz | No ampliar su presencia operativa. La sección plegada actual es un avance, no el traslado final a venta | El objetivo es retirar ruido, no añadir otra cifra al trabajo diario |
| A10-1 Parte de incidente | Sí | Unirlo con la vuelta, separando enviado, importado, comprobado, incierto y pendiente | Un informe no debe convertir aceptación de una acción en resultado verificado |
| A10-2 Cobertura explícita | Sí | Subir a P1 y derivar incluidos/excluidos de la especificación y captura, no de texto fijo | Es necesaria para interpretar la integridad y vender sin falsa cobertura |
| A10-3 Modo agencia | Sí, después | No crear nuevas carpetas ni selector hasta definir aislamiento, claves y permisos | Un selector local no sustituye un modelo multiempresa seguro |
| B0 Identidad única | Sí | Conservar Consola y retirar capas gradualmente; no introducir otra identidad ni cambiar el orden de carga sin prueba | La cascada acumulada es la deuda, no una falta de estética nueva |
| B1 C1 Anchura y hueco | Sí, con matiz | Anchura máxima por contenido; usar hueco como indicador, no obligación de rellenar el lienzo | Una pantalla vacía de trabajo no mejora por estirar o añadir bloques |
| B1 C2 Acción principal | Sí | Como máximo un botón relleno por vista, también si está deshabilitado. Cero es válido en consulta o vacío; diálogos se comprueban aparte | Una acción innecesaria no se añade para llegar a uno |
| B1 C3 Cifra grande | Sí | Una cifra dominante como máximo; no agrandar un cero ni una métrica sin acción | La jerarquía debe responder a lo urgente, no a decoración |
| B1 C4 Ceros | Sí, con excepción | Atenuar, no esconder el cero que confirma «sin pendientes» o completa un total necesario | Quitar ceros indiscriminadamente puede ocultar un estado tranquilizador o romper la comparación |
| B1 C5 Vacíos | Sí | Una línea sin asistente inútil; carga, error y plan inválido nunca se presentan como «sin cambios». Mantener accesible un plan en curso o justificante existente | La reducción visual no puede esconder un fallo ni evidencia |
| B1 C6 Acciones próximas | Sí | Mantener accesibles las globales en Continuidad/paleta antes de quitarlas de la lista | Reubicar no debe eliminar una capacidad |
| B1 C7 Dato único | Sí | Mostrar cada dato una vez por vista; un resumen enlazado desde otra ruta no es duplicación prohibida | Evita repetir paneles sin impedir orientación entre pantallas |
| B1 C8 Profundidad | Sí | Contar bloques funcionales visibles y preservar alertas críticas aunque superen seis | Un límite geométrico no debe ocultar riesgos |
| B1 C9 Móvil | Sí | Misma copia, alto, filtros y paginación; registrar ambos estados y no reducir legibilidad o controles para llegar a tres pantallas | Medir scroll sin condiciones comparables permite falsos avances |
| B1 C10 Desborde | Sí | Añadir foco/teclado y zoom; tablas anchas con desplazamiento local identificado, no desborde del documento | Cero desborde no basta si el contenido queda cortado |
| B2.1 Tokens | Sí, con matiz | Escala única; documentar excepciones semánticas y tamaño mínimo legible. 44 px táctiles aunque el control visual sea compacto | La coherencia no justifica texto ilegible ni objetivos pequeños |
| B2.2 Biblioteca | Parcial | Reutilizar piezas existentes; extraer Bay, Strip o DataTable solo cuando eliminen duplicación real | Crear toda una biblioteca antes de simplificar pantallas retrasa valor y añade API innecesaria |
| B2.3 Retirada de capas | Sí | Por pantalla, preservando cascada y estados; medir CSS inicial como bytes generados, no solo fuentes. Renombrar al final si aporta claridad | El orden de hojas afecta toda la app; el objetivo de 200 KB necesita evidencia de build |
| B2.4 Profundidad y movimiento | Sí | Mantener foco y contraste; nada de movimiento nuevo para estas tareas | Las transiciones no arreglan composición ni deben dificultar el uso bajo presión |
| B3.1 Menú | Sí | Propuestas fuera; servicio de equipo según configuración efectiva, no solo tipo de copia; ruta antigua de Preparación compatible | Una entrada oculta no debe romper enlaces guardados ni inventar disponibilidad |
| B3.2 Barra | Sí, hecho | Mantener nombre accesible y efecto; señal solo con contingencia activa o error real | Una orden neutra no debe parecer una alarma permanente |
| B4.1 Inicio «puesto de mando» | Sí, avance válido | No repetir vencidos/preparación en línea, bloque y riel. Mantener el avance como parcial: 1366 y móvil aún superan metas | Las medidas del relevo no permiten declarar cerrado B7 |
| B4.2 Continuidad Copia · Prueba · Vuelta | Sí, parcial | Mantener un índice y una acción; decidir bahías o pestañas por tarea sin mezclar ambos. Separar evidencia de simulación y cobertura no copiada | Los informes agrupados son avance; siguen pendientes las tres áreas y la fuente única de A1 |
| B4.3 Cambios | Sí, con salvaguarda | Vacío compacto solo tras lectura válida; quitar Propuestas. Asistente con cambios pendientes o plan guardado que necesite seguimiento; conservar historial y justificantes aunque no haya nada nuevo | Evita asistentes deshabilitados sin ocultar planes parciales, inválidos o ya enviados |
| B4.4 Hoy y Agenda | Sí | Una acción principal en Hoy; «Despachar» secundario junto a Vencidas. Panel del día seleccionado y un enlace al total vencido, con ámbito explícito | Corrige la contradicción sin mezclar carga del periodo con trabajo pendiente global |
| B4.5 Listas | Sí | Proporciones según columnas realmente visibles; vistas vacías atenuadas conservando orden estable entre renders; mantener datos esenciales accesibles en móvil | Un máximo rígido no sirve para muchas columnas ni debe ocultar correo/fecha necesarios |
| B4.6 Ficha | Sí, condicionado | No cerrarla sin ensayo denso en el otro equipo; no cambiar el guardado ni la recuperación de foco al plegar | No hay evidencia actual con 1.000+ registros |
| B4.7 Exportar | Sí | Motivo de bloqueo visible y asociado al botón; no debilitar contraseña, confirmaciones ni avisos sobre datos | Una columna simplifica sin modificar las garantías de exportación |
| B4.8 Ajustes | Sí | Integraciones según capacidades reales; Configurar Plan B conserva enlaces anteriores y la licencia espera A6 | Cambiar navegación no convierte en real un servicio o licencia |
| B5 Estados | Sí | Reutilizar carga/error existentes y distinguir «no leído» de vacío; simulación rotulada también en resultados y exportaciones | Evita éxito aparente y conclusiones falsas |
| B6 Accesibilidad | Sí | P0 ya hecho no se vuelve a contar. Añadir comprobación de foco, teclado y zoom; auditoría visual solo en el equipo autorizado | Tokens AA y controles de 44 px no prueban por sí solos accesibilidad completa |
| B7 Cierre | Sí, con condiciones | Medir mismos datos, rutas, tamaños y temas; distinguir métricas estructurales de geometría real. No aprobar B7 aquí sin capturas. No ejecutar auditorías de navegador en este ordenador | Las restricciones actuales impiden esa validación; una prueba estática no la sustituye |

### Contraste de prioridades de `05` §1

- Se mantiene el orden de ejecución que acaba de fijar la usuaria en el relevo, empezando por B4.3.
- A1: esfuerzo 2 y riesgo 2 por caducidades, conciliación y migración de consumidores; no es solo una fórmula.
- A4: prioridad comercial P1, riesgo 2 como mínimo; la prueba en sandbox requiere autorización específica y no se ejecuta en este equipo.
- A6: riesgo 2 por puertas, caducidad y acceso durante contingencia; la custodia sigue pendiente de la usuaria.
- A7: esfuerzo/riesgo al menos 2; no se implementa ni se generan/migran claves sin decisión.
- A10-2: P1 por honestidad de cobertura, antes de cualquier promesa de preparación completa.
- B2 se hace incremental, no como prerrequisito de toda B4.3-B4.8. A0-L no se da por esfuerzo 1 hasta inventariar dependencias.
- Esta revisión no ejecuta las tareas propuestas ni certifica una nueva preparación comercial.
