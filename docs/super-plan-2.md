# Super plan 2 de Plan B

Preparado el 19/11/2026 sobre la rama `planb-v0.3-local` (commit `5151b8d`), con el primer [super plan](super-plan.md) casi terminado. Se ha hecho leyendo el código, la documentación y el tablero de coordinación, sin servidores, sin navegador y sin datos reales.

Recoge tres cosas:

- lo que falta o se puede mejorar de lo que ya existe;
- funciones nuevas para vender más y trabajar más rápido;
- una apuesta diferencial que ningún CRM tiene: **el modo contingencia**.

## 0. Reglas

Las reglas del §0 de [super-plan.md](super-plan.md) siguen vigentes **íntegras**. Este plan no añade ninguna excepción. Resumen:

- **Prohibido en este ordenador:**
  - DPAPI, `Get-CimInstance` y `server/crypto.ts` fuera del modo de prueba.
  - Playwright, e2e, `tools/preview`, el lanzador de impeccable, servidores y cualquier navegador automatizado. Tampoco las herramientas de navegador del editor, aunque haya páginas compartidas.
  - Pruebas con `.listen(`, `spawn(`, `playwright` o `Get-CimInstance`.
  - Datos reales (`data/`, `planb-local-*`, `.env*`, claves).
  - Enviar nada fuera del ordenador: ni HubSpot, ni Google, ni modelos de IA.
  - Guardar en el navegador contenido de registros; solo identificadores y preferencias.
  - Cambiar el cifrado, la contraseña o el formato de las copias.
- **Permitido:**
  - Leer y editar código.
  - Pruebas unitarias en modo prueba, revisadas una a una antes de ejecutarlas.
  - Pruebas de rutas con `app.inject(...)`.
  - `npm run build`.
  - `git pull`, `commit` y `push`.
- **Revisión visual:** nunca aquí. Cada tarea con interfaz se marca **«Ver en casa»**.

### 0.1 Filtro de admisión

Una idea entra en este plan solo si cumple las cinco condiciones:

1. Funciona **sin conexión**: no consulta HubSpot, Google ni ningún modelo para decidir nada.
2. Su lógica cabe en un **módulo puro** (`src/app-shell/*.ts`, `shared/*.ts`) con prueba, o en una ruta probada con `app.inject`.
3. No cambia el cifrado, el formato de la copia ni la custodia de exportaciones.
4. No guarda contenido de registros en el navegador.
5. Se puede dar por **hecha sin revisión visual**, dejando esa revisión para casa.

Lo que no lo cumple está en el §6 («Lo que no se hace») o en el §7 («Decisiones que te tocan»).

### 0.2 Protocolo por tarea

Es el mismo del primer plan:

1. `git pull`.
2. Buscar en `tests/` los textos, ids y clases que se van a tocar.
3. Escribir el módulo puro y su prueba.
4. Hacer que el componente solo use ese módulo.
5. Ejecutar las pruebas afectadas y `npm run build`, y después `tests/bundle-budget.test.ts`.
6. Marcar la tarea en este archivo, en `plan-mejoras.md` y en `CONTEXTO-PROYECTO.md`.
7. Hacer el commit con el trailer de Copilot y el push. Comprobar que `HEAD = origin` y que el árbol queda limpio.

Leyenda: tamaño **S** / **M** / **L**; alcance **UI**, **SRV** (con `app.inject`) o **DOC**.

## 1. Diagnóstico

### 1.1 Lo que ya es fuerte

- **Cadena de confianza completa:**
  - capturas con libro diario y aviso de encogimiento;
  - comparación entre copias (C3);
  - simulacro guiado que termina en el pasaporte;
  - pasaporte para auditoría con huella SHA-256;
  - informe mensual;
  - calendario de simulacros;
  - devolución por pasos con justificante (C1);
  - lista imprimible de recuperación manual.
- **Trabajo diario:**
  - Hoy, Despachar con seguimiento, revisión semanal y recordatorios dentro de la app;
  - paleta de órdenes, atajos y cambio en bloque con deshacer;
  - actividad rápida en una línea, plantillas de seguimiento;
  - previsión ponderada, reglas por etapa, salud de la cuenta y normalización de datos.
- **Identidad «Cuaderno»** coherente, con tokens y contraste AA comprobados por prueba en claro y oscuro.
- **Negocio:**
  - licencia sin conexión (Ed25519 con WebCrypto) y precios en la landing;
  - primer uso guiado en diez minutos;
  - ficha comercial al día.
- **Red de seguridad:** 329 archivos de prueba y presupuesto de tamaño del JS inicial.

### 1.2 Lo que falla o falta

Cada punto lleva su prueba:

1. **Pantallas construidas que nadie ve.**
   - Ningún archivo importa estos componentes:
     - `ContinuityLab.tsx` (40 KB, laboratorio de caídas);
     - `RescueRoom.tsx` (28 KB, Modo Rescate);
     - `RescueCapsule.tsx` (12 KB, Kit de Relevo);
     - `SourceReadingHistory.tsx` (11 KB);
     - `SourceStatusRow.tsx` (10 KB);
     - `ContinuityEvidence.tsx` (9 KB).
   - Son unos **110 KB de interfaz** con al menos 15 archivos de prueba propios. Las rutas de servidor existen (`rescue-room-api.ts`, `rescue-capsule-api.ts`, `source-reading-history.ts`).
   - La tarea `CLAUDE-LAB-036` («Demo visual aislada del laboratorio de caídas») sigue en `ready` en el tablero.
2. **Deuda de revisión visual.**
   - Unas 30 tareas con interfaz del primer plan están hechas pero **nadie las ha visto**: A1–A4, V1–V7, H2–H6, C1–C5, D1–D3, M1–M5.
   - Cuantas más se acumulen, más caro será corregirlas.
3. **CSS en cinco capas** que se pisan unas a otras:
   - `planb-ui.css` 47 KB → `design-system.css` 26 KB → `styles.css` 23 KB → `faro.css` 236 KB → `cuaderno.css` 54 KB;
   - se usa `html body` solo para ganar especificidad;
   - el CSS inicial mide **380 KB**, por encima de su techo de 340 KB, y por eso la prueba de presupuesto no lo vigila.
4. **Componentes gigantes:**
   - `LocalTaskFocus.tsx` 58 KB;
   - `App.tsx` 43 KB, con 20 estados;
   - `CommitmentRadar.tsx` 42 KB;
   - `ContinuityHome.tsx` 36 KB;
   - `RecordsPage.tsx` 35 KB.
5. **Sin analítica comercial.**
   - No hay tasa de cierre, ciclo de venta ni conversión entre etapas: cero coincidencias en `src/`.
   - Solo existe la previsión.
6. **Sin agenda.** No hay una vista de semana o mes con tareas fechadas y cierres previstos.
7. **La licencia no cambia nada todavía:**
   - `LICENSE_PUBLIC_KEY` está vacía;
   - ninguna función usa `planAllows`.
8. **Pendientes heredados:**
   - V8, fusionar duplicados;
   - C6, comprobar la devolución;
   - P1 y P2, partir componentes;
   - P4, vistas guardadas en la copia;
   - H1, Hecha/Posponer en Hoy;
   - A3, los `confirm()` que quedan.
9. **Tablero de coordinación estancado:** unas 25 tareas de otros agentes siguen en `review`, `ready` o `blocked` desde octubre sin que nadie las cierre.

## 2. La apuesta: el CRM que se usa cuando el otro falla

Plan B no debe competir con HubSpot en número de funciones. Su ventaja es otra: **es el único CRM pensado para el día en que el tuyo no responde**, y lo demuestra.

Hoy esa promesa está repartida entre ensayos, pestañas y laboratorios. La novedad es convertirla en una experiencia completa:

1. **El botón rojo (R1).** «HubSpot no responde» pone la app en **modo contingencia**:
   - banda de lacre con el reloj del incidente;
   - Hoy reducido a lo urgente;
   - una lista de qué hacer en los primeros 15 minutos;
   - todo lo que se haga queda en la bitácora.
2. **El expediente (R2).** Al cerrar el incidente se genera en local el expediente: cronología, qué se trabajó, qué se devolvió y con qué huella.
   - Es lo que pide quien lleva continuidad de negocio.
   - Se dice «pensado para», nunca «certificado».
3. **La máquina del tiempo (R3).** «¿Cómo estaba este cliente el 3 de octubre?» se responde con las capturas que ya se conservan, en solo lectura.
4. **Pregunta a tu copia (R4).** «oportunidades de Acme que cierran este mes de más de 5000» se convierte en un filtro, sin IA: reglas deterministas en español, igual que la actividad rápida.
5. **El sello (R5).** Un nivel de continuidad **explicable**, con criterios a la vista y huella. Se puede enseñar a un cliente, un auditor o una aseguradora.

Las cinco piezas cumplen el filtro del §0.1. Ninguna necesita red, IA ni datos reales para construirse y probarse.

## Oleada 1 · Sacar a la luz lo que ya está hecho

Es lo más barato y lo que más se nota: el código ya existe y tiene pruebas.

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| E1 | **Laboratorio de caídas visible.**<br>Nueva entrada «¿Y si cae…?» en el grupo Laboratorio, que solo existe con datos de prueba. Monta `ContinuityLab` con su fixture, cargado bajo demanda.<br>Cierra `CLAUDE-LAB-036`. | `ContinuityLab.tsx`, `lazy-pages.tsx`, `navigation.ts`, `routes.ts`, `session.ts` | `continuity-lab-ui`, `navigation-model`, `url-routes` | M, UI, Ver en casa | Hecha (19/11/2026) |
| E2 | **Evidencia: unir o retirar.**<br>Comparar `ContinuityEvidence.tsx` con lo que ya pinta `ContinuityHub` en Evidencia e impacto.<br>Si duplica, borrar el componente y su CSS. Si aporta algo, montarlo. | `ContinuityEvidence.tsx`, `ContinuityHub.tsx` | Pruebas de `continuity-evidence*` | S, UI | Hecha (19/11/2026) |
| E3 | **Estado de las fuentes en Integraciones.**<br>Montar `SourceStatusRow` y `SourceReadingHistory`: última lectura, resultado y antigüedad por fuente.<br>Antes, comprobar con `app.inject` que `registerSourceReadingHistory` está registrada en el arranque. | `LocalIntegrations.tsx`, `server/source-reading-history.ts` | `app.inject` + prueba del componente | M, UI+SRV, Ver en casa | Aplazada (reglas: sin ruta de estado y las lecturas llegan de proveedores externos; en casa) |
| E4 | **Modo Rescate y Kit de Relevo en el Laboratorio**, como ensayo con datos ficticios y tal como están.<br>Es el paso previo de R1. Comprobar con `app.inject` que las rutas de rescate responden en modo prueba. | `RescueRoom.tsx`, `RescueCapsule.tsx`, `lazy-pages.tsx`, `navigation.ts` | `rescue-room-api`, `rescue-room`, `rescue-capsule-*` (revisarlas antes) | M, UI+SRV, Ver en casa | Aplazada (reglas: el Modo Rescate arranca un servidor aparte; en casa) |
| E5 | **Guardia de código huérfano.**<br>Prueba estática que lista los `.tsx` de `src/` sin importador y falla si aparece uno nuevo que no esté en una lista justificada. | `tests/orphan-components.test.ts` nuevo | La propia prueba | S | Hecha (19/11/2026) |
\r

## Oleada 2 · Lo diferencial

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| R1 | **Modo contingencia («El botón rojo»).**<br>Lo activa la persona («HubSpot no responde») desde la barra superior, la paleta o Continuidad. Nunca se detecta consultando HubSpot desde aquí.<br>Mientras está activo:<br>· banda de lacre con reloj (`hh:mm` desde el inicio);<br>· Hoy filtrado a vencidas y de hoy;<br>· lista «Primeros 15 minutos»: comprobar la antigüedad de la copia, avisar al equipo y abrir la cola;<br>· un aviso fijo en Cambios.<br>En el navegador solo se guardan la hora de inicio y la bandera. | `app-shell/contingency.ts` nuevo, `TopBar.tsx`, `LocalOperations.tsx`, `commands.ts` | `tests/contingency.test.ts` (estado, reloj, filtro, salida) | M–L, UI, Ver en casa | Hecha (19/11/2026) |
| R2 | **Bitácora y expediente del incidente.**<br>Al cerrar el modo contingencia: cronología a partir del diario local (`/v2/changes`) entre inicio y fin, capturas del periodo, estado de la devolución (C1) y huellas.<br>Se descarga en HTML imprimible y JSON con SHA-256 (`shared/sha256.ts`). Solo cifras y nombres de campo, sin valores de registros. | `app-shell/incident-report.ts` nuevo, `ContinuityHome.tsx` | `tests/incident-report.test.ts` | M, UI, Ver en casa | Hecha (19/11/2026) |
| R3 | **Máquina del tiempo.**<br>En la ficha, «Ver cómo estaba» elige una captura conservada y muestra campo a campo antes y ahora.<br>Ruta nueva de **solo lectura** junto a `capture-comparison.ts`. Nunca restaura ni escribe. | `server/capture-comparison.ts` (solo lectura), `RecordTimeline.tsx`, `app-shell/record-history.ts` nuevo | `app.inject` con copias de prueba + prueba pura de la diferencia | L, SRV+UI, Ver en casa | Pendiente |
| R4 | **Pregunta a tu copia.**<br>Analizador en español, sin IA, que pasa frases a `{objeto, filtros, orden}`, por ejemplo «empresas de Madrid sin tareas» o «oportunidades que cierran este mes > 5000 ordenadas por importe».<br>Usa los filtros del servidor de V1. Funciona en la paleta (Ctrl J) y en la búsqueda.<br>Si no entiende una parte, lo dice y no la inventa. | `app-shell/ask.ts` nuevo, `CommandPalette.tsx`, `WorkspaceSearch.tsx` | `tests/ask.test.ts` (≥ 30 frases y las que no entiende) | M, UI | Hecha (19/11/2026) |
| R5 | **Sello de continuidad.**<br>Cuatro niveles: Sin sello, En preparación, Comprobado y Constante (tres meses seguidos comprobados).<br>Se calculan de `continuityReadiness`, `drillCalendar` y el informe mensual, y cada nivel muestra qué criterio cumple y cuál falta.<br>Insignia SVG en tokens dentro del pasaporte, el informe y la ficha de Inicio, con la huella del pasaporte.<br>Texto fijo: «no es una certificación». | `app-shell/continuity-seal.ts` nuevo, `ContinuityPassport.tsx`, `monthly-report.ts` | `tests/continuity-seal.test.ts` | M, UI, Ver en casa | Hecha (19/11/2026) |
| R6 | **Parte de la mañana.**<br>La primera vez que se abre la app en el día, un resumen plegable:<br>· qué venció;<br>· qué cambió desde ayer (diario);<br>· antigüedad de la copia;<br>· tres primeros pasos.<br>Se puede copiar como texto. En el navegador solo se guarda la fecha de la última vez que se vio. | `app-shell/morning-brief.ts` nuevo, `HomeOverview.tsx` | `tests/morning-brief.test.ts` | M, UI, Ver en casa | Hecha (19/11/2026) |

## Oleada 3 · Vender más

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| F1 | **Analítica del proceso.**<br>Por periodo: tasa de cierre, ciclo medio (alta → ganada), conversión entre etapas, importe medio ganado y oportunidades perdidas por etapa.<br>Las transiciones salen del diario de cambios local. Lo anterior a la copia se marca como «aproximado». | `app-shell/pipeline-stats.ts` nuevo, `PipelineCard.tsx` o página bajo Oportunidades | `tests/pipeline-stats.test.ts` | M, UI, Ver en casa | Hecha (19/11/2026) |
| F2 | **Objetivo del mes.**<br>Una cifra como preferencia del navegador. Barra con lo ganado, lo comprometido y lo probable (de `forecast.ts`) frente al objetivo, y el ritmo necesario por día laborable. | `app-shell/goal.ts` nuevo, `PipelineCard.tsx` | `tests/goal.test.ts` | S, UI | Hecha (19/11/2026) |
| F3 | **Agenda.**<br>Vista de semana y de mes con tareas fechadas y cierres previstos; hoy en lacre y vencidas con sello.<br>Abrir una tarea pasa por el gestor de siempre. Mover un cierre de fecha usa `saveField`.<br>Las tareas **no** se arrastran: guardarlas pasa por `TaskOutcomesHost`. | `app-shell/agenda.ts` nuevo, `Agenda.tsx` nuevo, `routes.ts` (`/hoy/agenda`) | `tests/agenda.test.ts` + `url-routes` | M–L, UI, Ver en casa | Hecha (19/11/2026) |
| F4 | **Secuencias de seguimiento.**<br>Cadencias guardadas, por ejemplo «llamar hoy, correo a 3 días, llamar a 7», que crean de una vez las tareas enlazadas con `linkedPreset`.<br>No se envía nada; los textos salen de las plantillas de H6. | `app-shell/sequences.ts` nuevo, `RecordSummary.tsx` | `tests/sequences.test.ts` (fechas laborables, enlaces) | M, UI, Ver en casa | Hecha (19/11/2026) |
| F5 | **Recientes y anclados.**<br>Los últimos 8 registros abiertos y hasta 12 anclados, en la paleta y en el menú. Solo se guardan los ID; el nombre se lee de la copia al mostrarlo. | `app-shell/recents.ts` nuevo, `CommandPalette.tsx`, `Sidebar.tsx` | `tests/recents.test.ts` | S, UI | Hecha (19/11/2026) |
| F6 | **Clientes que se enfrían.**<br>Lista explicable: sin actividad en N días y con oportunidad abierta, ordenada por importe. Cada fila lleva su motivo. | `account-health.ts`, `HomeOverview.tsx` | `account-health` ampliado | S, UI | Hecha (19/11/2026) |
| F7 | **Oportunidades en riesgo.**<br>Une reglas por etapa (D2), paradas (V5), cierre ya pasado y falta de próximo paso en una sola lista con motivos, sin puntuaciones opacas. Vista guardada «En riesgo». | `app-shell/deal-risk.ts` nuevo, `saved-views.ts` | `tests/deal-risk.test.ts` | S–M, UI | Hecha (19/11/2026) |
| F8 | **Fusionar duplicados** (V8 heredada).<br>Se elige campo a campo qué queda y se archiva el otro con deshacer. Se marca para hacer a mano en HubSpot: nunca se devuelve sola. | `quality.ts`, `QualityPanel.tsx`, servidor de registros | `app.inject` + prueba pura del plan de fusión | L, SRV, Ver en casa | Pendiente |

## Oleada 4 · Cuaderno 2 (diseño)

La identidad está decidida (ver [DESIGN.md](../DESIGN.md)). Esta oleada **la completa**, no la sustituye.

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| K1 | **Una sola hoja de estilos real.**<br>Una prueba estática cruza las clases del CSS con las de `src/`; las clases dinámicas (`is-*`, `return-tone-*`, `oc-*`…) van en lista blanca.<br>Se podan los selectores sin uso, capa por capa: primero `styles.css`, `design-system.css` y `planb-ui.css`, después `faro.css`.<br>Meta: CSS inicial por debajo de 340 KB y activar su techo en `bundle-budget.test.ts`.<br>Solo se borra lo que tiene cero referencias. | CSS de `src/`, `tests/css-unused.test.ts` nuevo | La propia prueba + `design-tokens` + `bundle-budget` | L, UI, Ver en casa | Hecha (19/11/2026) |
| K2 | **Gestos de cuaderno.**<br>Al completar, el tachado se dibuja en 180 ms. Al aprobar una devolución o subir de sello, el sello se «estampa» (escala 1,08 → 1 y opacidad).<br>Sin movimiento con `prefers-reduced-motion`. Solo `transform` y `opacity`. | `cuaderno.css`, `LocalOperations.tsx`, `FocusRun.tsx` | Prueba estática de `prefers-reduced-motion` | S–M, UI, Ver en casa | Hecha (19/11/2026) |
| K3 | **Estados vacíos dibujados.**<br>Componente `EmptyArt` con SVG de trazo en tokens: cuaderno abierto, sello, grapa y lápiz, uno por contexto (sin tareas, sin copias, sin cambios, sin resultados).<br>Los textos de `ui-empty` no cambian, porque las pruebas los buscan. | `ui/index.tsx`, `cuaderno.css` | `ui-states` + `design-tokens` | S–M, UI, Ver en casa | Hecha (19/11/2026) |
| K4 | **Densidad Compacta o Cómoda.**<br>Preferencia en Ajustes que cambia `--row-h`, los controles y el espaciado mediante tokens (filas de 32 → 40 px). En móvil se mantienen los 44 px. | `app-shell/theme.ts`, `cuaderno.css`, `Settings.tsx` | `tests/density.test.ts` (tokens y preferencia) | S, UI, Ver en casa | Hecha (19/11/2026) |
| K5 | **Impresión común.**<br>Un solo `print.css` para listas, ficha, Hoy, pasaporte, informe y expediente: cabecera con fecha, nombre de la copia y página, sin menú ni barra.<br>Lo que ya imprime (C2, M2, M3) pasa a usarlo. | `print.css` nuevo, `main.tsx` | Prueba estática de `@media print` | M, UI, Ver en casa | Hecha (19/11/2026) |
| K6 | **Guardia de color en toda la app.**<br>Ampliar la guardia de A1 (`team-dark-mode`) a todos los `.tsx` y `.css`. Los literales de hoy entran en una lista que solo puede encoger. | `tests/team-dark-mode.test.ts` o una nueva | La propia prueba | S | Hecha (19/11/2026) |
| K7 | **La ficha como hoja.**<br>Cabecera con el estado como sello, pares etiqueta · valor en dos columnas, la salud (V6) y el riesgo (F7) en una línea, y la cronología a la derecha en escritorio y debajo en móvil. | `components.tsx` (`RecordDrawer`), `RecordSummary.tsx` | Pruebas de la ficha + `ui-copy` | M, UI, Ver en casa | Hecha (19/11/2026) |
| K8 | **Inicio con una sola voz.**<br>Ordenar, después de M4, la tarjeta de primeros pasos, la franja, la semana en una línea, el siguiente paso y R6, para que solo haya **un** botón lleno por pantalla.<br>Revisión estática de jerarquía. | `HomeOverview.tsx` | `continuity-home-hub`, `ui-copy` | S–M, UI, Ver en casa | Hecha (19/11/2026) |
| K9 | **Landing 2.**<br>· «Así es un apagón con Plan B» en tres viñetas que se animan con CSS;<br>· calculadora del coste de una caída (N3);<br>· preguntas frecuentes;<br>· «Privacidad: qué nunca sale de tu ordenador».<br>Sin tablas, que la e2e de la landing lo exige. | `src/landing/main.tsx`, `story.css`, `plan-b.html` | `license.test.ts` / prueba estática de la landing | M, UI, Ver en casa | Pendiente |
| K10 | **Móvil de verdad.**<br>La ficha como hoja inferior, recuentos en la barra inferior y objetivos de 44 px.<br>Prueba estática de las medidas en `@media (max-width: 600px)`. | `MobileNav.tsx`, `cuaderno.css` | Prueba estática de medidas | M, UI, Ver en casa | Hecha (19/11/2026) |

## Oleada 5 · Base técnica

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| T1 | **Índice de pruebas seguras.**<br>`tools/safe-tests.mjs` solo lee archivos: lista las `tests/*.test.ts` sin `.listen(`, `spawn(`, `child_process`, `playwright` ni `Get-CimInstance`, y las ejecuta en modo prueba de una en una.<br>Hace que respetar las reglas sea automático. | `tools/safe-tests.mjs` nuevo, `package.json` (`test:safe`) | Ejecución en seco del propio script | S | Hecha (19/11/2026) |
| T2 | **`App.tsx` por porciones** (sustituye a P1).<br>Un gancho por commit: `useContinuityState`, `useNotices`, `useUndoStack` y `useNavigationState`. Cada paso compila y pasa las pruebas antes del siguiente. | `App.tsx`, `app-shell/use*.ts` | Pruebas de `app-shell` + build | 4 × S | Pendiente |
| T3 | **`LocalTaskFocus.tsx` por porciones** (sustituye a P2).<br>Sacar a módulos puros la lógica de orden, agrupación y textos; el componente solo pinta. | `LocalTaskFocus.tsx`, módulos nuevos | Pruebas existentes + nuevas | M–L | Pendiente |
| T4 | **`CommitmentRadar.tsx` y `ContinuityHome.tsx`**: lo mismo que T3. | esos archivos | Pruebas existentes | M cada uno | Pendiente |
| T5 | **Vistas guardadas en la copia** (P4 heredada): solo nombres y filtros. | `saved-views.ts`, servidor | `app.inject` | S–M, SRV | Pendiente |
| T6 | **Comprobar la devolución** (C6 heredada), solo con el proveedor falso. | `server/hubspot-read-check*.ts`, `ChangesView.tsx` | `app.inject` con proveedor falso | M, SRV | Pendiente |

## Oleada 6 · Negocio

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| N1 | **Puertas Pro suaves.**<br>`planAllows` entra en la interfaz: R2, R5, F1, F4 y las capturas programadas muestran una insignia «Pro» con lo que incluye.<br>Hay 14 días de prueba local. **Nunca** se bloquean los datos, la exportación ni la recuperación. | `shared/plans.ts`, `LicensePanel.tsx`, componentes afectados | `license.test.ts` ampliado | M, UI, Ver en casa | Hecha (19/11/2026) |
| N2 | **Marca de la agencia** (plan Equipo).<br>Nombre y logotipo, en un archivo local elegido por la persona, en el pasaporte, el informe mensual y el expediente. Solo es una preferencia. | `app-shell/branding.ts` nuevo, generadores HTML | `tests/branding.test.ts` (escapado, tamaño máximo) | S–M, UI | Pendiente |
| N3 | **Coste de una caída.**<br>Cálculo puro: comerciales × horas sin CRM × valor medio por hora, más oportunidades que vencen en esas horas (de la copia).<br>Aparece en la landing, con cifras que escribe el visitante, y en Continuidad («este mes la copia cubrió N horas»). | `shared/downtime-cost.ts` nuevo | `tests/downtime-cost.test.ts` | S, UI | Pendiente |
| N4 | **Kit de venta.**<br>Hoja de una página imprimible a partir de `FICHA-COMERCIAL.md` y guion de demo de 10 minutos con datos de prueba (M4 → R1 → R2 → R5). | `docs/kit-venta.md`, `docs/guion-demo.md` | — | S, DOC | Pendiente |
| N5 | **Novedades dentro de la app.**<br>«Qué hay nuevo» al cambiar de versión, desde un JSON estático, con un enlace a cada función. | `shared/whats-new.ts` nuevo, `TopBar.tsx` | `tests/whats-new.test.ts` | S, UI | Pendiente |

## 3. Orden recomendado

Una sesión por bloque. Después de cada bloque: commit, push y fila marcada.

1. **T1 + E5 + E6**: seguridad y orden primero; no cambian nada visible.
2. **E1 → E2 → E3 → E4**: sacar a la luz lo hecho.
3. **R4 + F5**: la paleta pasa a ser el centro de la app.
4. **R1 + R2**: el modo contingencia, el titular de venta.
5. **F7 + F6 + F1 + F2**: vender más con lo que ya hay en la copia.
6. **R5 + R6 + N1**: el sello, el parte y las puertas Pro.
7. **K6 → K1** (por capas) → **K2, K3, K4, K5**: diseño, con la guardia antes de podar.
8. **K7, K8, K10, K9, F3, F4, R3, N2–N5, T2–T6, F8**: según lo que pida el uso.

## 4. Jornada en casa

Antes de que la deuda de revisión visual crezca más, una tarde en el ordenador personal, con datos de prueba:

- **Revisar las ~30 tareas «Ver en casa»** del primer plan y de este. Para cada una: claro y oscuro, a 1366 y 390 px.
- **Ejecutar allí lo que aquí está prohibido:**
  - la e2e completa;
  - `tools/visual/` (`a11y`, `dark-scan`, `check`);
  - las pruebas con servidor (`recovery-bootstrap`, `api-inventory`, `relay-rehearsal`, `perf-budgets`).
- **Generar la clave de venta:** `scripts/license-tool.ts keygen`, y pegar la pública en `LICENSE_PUBLIC_KEY`.
- **Anotar los defectos** en una sola lista y corregirlos aquí en un único lote.

## 5. Riesgos y cómo se evitan

- **Montar pantallas escondidas puede despertar rutas de servidor dormidas** (E3, E4). Primero `app.inject` en modo prueba; si una ruta no está registrada, se monta solo la parte que no la necesita.
- **Podar CSS sin verlo** (K1). Solo se borra lo que tiene cero referencias. La guardia de color (K6) va antes, cada capa en su propio commit, y se revisa en la jornada en casa.
- **El modo contingencia no debe dar sensación de falsa seguridad** (R1, R2, R5). Todo texto distingue observado, declarado y sin comprobar, igual que el pasaporte. «No es una certificación» y «no acredita RTO» se dicen siempre.
- **Pruebas e2e que no se ejecutan aquí.** Antes de cambiar un texto, id o clase, buscarlo en `tests/e2e/` y actualizar la especificación en el mismo commit, anotada como «e2e por ejecutar en casa».
- **El presupuesto de JS inicial va justo:** 236 KB comprimidos con un techo de 235,5 KB antes de diferir CSV y Despachar. Todo componente nuevo se carga bajo demanda desde `lazy-pages.tsx` salvo que se vea al abrir la app.

## 6. Lo que no se hace, y por qué

| Idea | Por qué no |
|---|---|
| IA en la nube para resumir o redactar | Rompe «nada sale del ordenador». R4 lo resuelve con reglas. |
| Detectar solo la caída de HubSpot | Exige llamar a HubSpot desde aquí. R1 lo activa la persona. |
| Enviar correos o notificaciones del sistema | Nada se envía. Las plantillas y secuencias solo copian y crean tareas. |
| Sincronizar las dos instalaciones por la nube | Cambia la custodia de la copia. La copia de equipo existente sigue siendo la vía. |
| Firmar el sello o el expediente con claves nuevas | Cambia la criptografía. Basta la huella SHA-256 ya existente. |
| Guardar en el navegador nombres o importes de registros | Prohibido. Recientes y anclados guardan solo el ID. |
| Multiusuario en la app local | Fuera del producto (`PRODUCT.md`): un operador por carpeta. |

## 7. Decisiones que te tocan

1. **Precios y qué entra en Pro.** Hoy está «Precio a decidir»; N1 propone R2, R5, F1, F4 y las capturas programadas.
2. **Nombre y niveles del sello** (R5): la propuesta es Sin sello, En preparación, Comprobado y Constante.
3. **Hoja del día impresa con datos reales.** `PRODUCT.md` dice que los datos reales solo salen cifrados. Imprimir la lista de llamadas en papel, el plan B más literal, choca con esa frase. Hasta que lo decidas, solo con datos de prueba.
4. **ISO 22301 y NIS2.** Se pueden nombrar en la landing y en el expediente solo como «pensado para ayudar a», nunca como cumplimiento, y mejor con una revisión legal antes.
5. **Tablero de coordinación.** Después del parte (E6), decide si se cierran las tareas antiguas de los agentes o se relanzan.
