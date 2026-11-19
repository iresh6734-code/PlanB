# Super plan de Plan B

Preparado el 19/11/2026 sobre la rama `planb-v0.3-local` (commit `460beaa`). Se ha hecho leyendo el código, sin servidores, sin navegador y sin datos reales. Recoge lo pendiente de [plan-mejoras.md](plan-mejoras.md), lo que dejó a medias la auditoría del espacio de equipo ([CLAUDE-TEAM-AUDIT](../coordination/reports/CLAUDE-TEAM-AUDIT.md)) y funciones nuevas pensadas para que Plan B se pueda vender.

## 0. Reglas que gobiernan todo el plan

Ninguna tarea de este plan puede saltarse estas reglas. Si una tarea solo se puede comprobar rompiéndolas, se implementa aquí con pruebas unitarias y la comprobación visual se deja para el ordenador personal (ver 0.3).

### 0.1 Prohibido en este ordenador

- DPAPI o PowerShell `ProtectedData` / `Get-CimInstance`; `server/crypto.ts` fuera del modo de prueba.
- Playwright, la batería e2e, `tools/preview`, el lanzador de impeccable y cualquier navegador automatizado.
- Servidores demo, de desarrollo o de arnés; pruebas que llamen a `.listen(` o `spawn(` (por ejemplo `independent-copy-inspection-api`, `relay-packaged`, `portable-lifecycle`).
- Datos reales: no tocar `data/`, `planb-local-*`, `.env*` ni claves. No enviar nada fuera del ordenador (ni HubSpot, ni Google, ni modelos).
- Guardar en el navegador contenido de registros. Solo identificadores y preferencias.
- Cambiar el cifrado, la contraseña o el formato de las copias. En exportación, inspección y protección solo se toca la presentación.

### 0.2 Permitido

- Leer y editar código (`view`, `grep`, `glob`, ediciones).
- Pruebas unitarias en modo prueba, una a una: `npx.cmd tsx --require ./tests/setup-unit-env.cjs --test tests/X.test.ts`. Antes de ejecutar un archivo, buscar en él `.listen`, `spawn`, `playwright` y `Get-CimInstance`; si aparece, no se ejecuta.
- Pruebas de rutas del servidor con `app.inject(...)`: no abren puerto. Se permiten si el archivo no contiene nada de la lista anterior.
- `npm run build` (redirigido a `tests\.tmp\build.log`).
- `git pull` al empezar; `git commit` y `git push origin planb-v0.3-local` al terminar.

### 0.3 Comprobación visual

Aquí nunca. Cada tarea con interfaz marca **«Ver en casa»**: en el ordenador personal (si no es corporativo) se abre la app con datos de prueba y se revisa claro, oscuro, 1366 px y 390 px. Hasta entonces la tarea queda como «hecha, sin revisión visual».

### 0.4 Protocolo de cada sesión de implementación

1. `git pull` y leer la primera entrada de `CONTEXTO-PROYECTO.md`.
2. Elegir la siguiente tarea de este plan por orden de oleada.
3. Antes de tocar la interfaz, buscar en `tests/` los textos, `data-testid`, ids y clases que se van a cambiar; se conservan o se actualizan las pruebas.
4. Lógica nueva en un módulo puro (`src/app-shell/*.ts` o `shared/*.ts`) con su prueba; el componente solo lo usa.
5. Pruebas afectadas + `npm run build`.
6. Marcar la tarea en este archivo (columna Estado), actualizar `plan-mejoras.md` y `CONTEXTO-PROYECTO.md`.
7. Commit con el trailer de Copilot y push. Comprobar que `HEAD` = `origin/planb-v0.3-local` y que `git status` está limpio.

### 0.5 Leyenda

- Tamaño: **S** (menos de una sesión), **M** (una sesión), **L** (dos o más).
- Alcance: **UI** solo interfaz; **SRV** toca la API (probar con `app.inject`); **DOC** solo documentación.
- Prueba segura: el archivo de prueba nuevo o existente que valida la tarea sin romper las reglas.

## 1. Hacia dónde va

Plan B se vende como **el CRM que no te deja tirado**: trabajas en local con tu copia cifrada, sigues vendiendo si HubSpot cae y lo devuelves todo después con justificante. Tres promesas que el plan refuerza:

1. **Confianza demostrable**: la copia está al día, se ha probado y se puede enseñar a un auditor.
2. **Trabajo diario más rápido que en el CRM original**: Hoy, Despachar, atajos y acciones en bloque.
3. **Cero sorpresas**: nada sale del ordenador sin que el usuario lo vea y lo apruebe.

Las oleadas van de lo que mejora la confianza y el día a día a lo que abre la puerta a cobrar.

## Oleada 1 · Cerrar lo que está a medias

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| A1 | **Auditoría estática del modo oscuro en el espacio de equipo.** Buscar colores escritos a mano (`#`, `rgb(`, `white`, `black`) en `TeamApp.tsx`, `Team*.tsx` y sus CSS, y cambiarlos por tokens. Una prueba lista los colores literales permitidos y falla si aparecen nuevos. | `src/Team*.tsx`, CSS del equipo, `tests/design-tokens.test.ts` | `design-tokens.test.ts` ampliado | M, UI, Ver en casa | Hecha (sin revisión visual): tokens en `team-company`, `team-agent`, `customer-files`, `customer-dossier` y `customer-combobox`; guardia `tests/team-dark-mode.test.ts` |
| A2 | **Ventanas del espacio de equipo** (teléfono del contacto, propuestas comerciales, vincular dispositivo, invitación): todas con `role="dialog"`, `aria-modal`, título enlazado, foco al abrir y al cerrar, y Escape. Pasarlas al `Modal` de `ui/index.tsx` donde no lo usen. | `TeamApp.tsx`, `TeamContacts.tsx`, `CommercialWorkspace.tsx`, `ui/index.tsx` | Prueba estática nueva `tests/team-dialogs.test.ts` que lea los `.tsx` y compruebe los atributos | M, UI, Ver en casa | Hecha (sin revisión visual): todas usaban ya `Modal`; Escape cierra solo la ventana de arriba (`isTopDialog`) y el foco entra en el campo. Prueba en `ui-journeys.test.ts` |
| A3 | **Los `confirm()` que quedan** en `CustomerDossier` (2), `CommercialWorkspace`, `TeamApp`, `DateCheck` y `OperationalRehearsal`. Cambiarlos por `InlineConfirm` **actualizando a la vez** las pruebas que esperan el diálogo nativo (las e2e se actualizan en el texto y se ejecutan en casa). | esos `.tsx`, sus pruebas | Pruebas unitarias de cada componente; e2e en casa | M, UI | Aplazada: `DateCheck` y `OperationalRehearsal` no usan `confirm()`. Los tres reales dependen de e2e con diálogo nativo (`v6.spec.ts`) y `Modal.confirmClose` es síncrono: se cambian en una sesión con e2e en casa |
| A4 | **Ficha «¿Puedo fiarme de mi copia?» fuera de Continuidad**: la franja de preparación ya existe (`continuityReadiness`). Mostrar su veredicto como una línea en Inicio y como punto de color en el menú lateral junto a «Continuidad». | `HomeOverview.tsx`, `Sidebar.tsx`, `continuity-insights.ts` | `continuity-insights.test.ts` + prueba de `navigation` | S, UI | Hecha (sin revisión visual): `readinessFor`/`readinessSignal`, línea con cinco marcas en la ficha de la copia de Inicio y punto junto a «Continuidad» |

## Oleada 2 · Vender más rápido (listas, tablero, fichas)

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| V1 | **Orden y filtro en el servidor.** `GET /api/v2/records/:entity` acepta `sort=campo:asc|desc` y `f.campo=valor` (lista blanca de campos por entidad). Los recuentos y el orden cubren toda la copia, no la página cargada. | `server/v2.ts`, `useRecordList.ts`, `RecordsPage.tsx` | Prueba con `app.inject` de orden, filtro y campo no permitido (422, como el resto de errores de validación) | M, SRV | Hecha (sin revisión visual) · `shared/record-order.ts`, recuentos por opción con `facet=` |
| V2 | **Tablero con todo el proceso.** Lee por páginas hasta el límite (reutilizar el bucle de `focus.ts`), con totales reales por etapa e indicador «cargando 120 de 340». | `PipelineCard.tsx`, `focus.ts`, `RecordsPage.tsx` | Prueba del paginador puro | M, UI | Hecha (sin revisión visual) · `src/app-shell/pager.ts` (tope 1000), 40 tarjetas por columna con «Ver N más» |
| V3 | **Selección múltiple y cambio en bloque** (etapa, responsable, estado, fecha) con barra flotante, un guardado por registro, progreso y un único «Deshacer» que revierte el lote. | módulo nuevo `app-shell/bulk-edit.ts`, `RecordsPage.tsx` | `tests/bulk-edit.test.ts` (plan del lote, fallos parciales, deshacer) | M, UI, Ver en casa | Hecha (sin revisión visual) · Clientes, Empresas y Tareas: casillas (Mayús + clic marca un tramo), barra «N marcados · Cambiar [campo] a [valor]» para listas y fechas editables, progreso con «Detener», un solo refresco al final y «Deshacer el lote» que respeta lo cambiado después. En el tablero no (las tarjetas son botones) |
| V4 | **Previsión ponderada.** Suma de importes por etapa × probabilidad de la etapa, por mes de cierre, con «comprometido / probable / optimista». Encima del tablero. | `app-shell/forecast.ts` nuevo, `PipelineCard.tsx` | `tests/forecast.test.ts` | M, UI | Pendiente |
| V5 | **Oportunidades paradas.** Vista inteligente «Sin próximo paso» y «Sin cambios en 14 días» desde `deal-insights.ts`, con motivo visible en cada fila. | `deal-insights.ts`, `saved-views.ts` | `saved-views` y `deal-insights` ampliados | S, UI | Hecha (sin revisión visual) · según las tareas enlazadas (`planb_deal_id`): «Sin próximo paso» y «Paradas 14 días»; motivo en cada tarjeta. Los cambios de etapa no cuentan (el registro no guarda fecha) |
| V6 | **Salud de la cuenta** en la ficha de empresa: actividad reciente, oportunidades abiertas, tareas vencidas y datos que faltan, resumidos en una frase y un trazo de tres niveles. Sin puntuaciones opacas: cada motivo se ve. | `app-shell/account-health.ts` nuevo, `RecordSummary.tsx` | `tests/account-health.test.ts` | M, UI | Pendiente |
| V7 | **Registrar actividad rápida** (llamada, nota, siguiente tarea) desde la ficha y desde la tarjeta del tablero, en una línea con Intro. Reutiliza la creación de tareas internas existente. | `RecordTimeline.tsx`, `PipelineCard.tsx`, `task-preset.ts` | Prueba del analizador de la línea («llamar mañana 10:00») | M, UI | Pendiente |
| V8 | **Fusionar duplicados.** Desde el aviso del CSV y del panel de calidad: elegir el registro que queda, campo a campo, y archivar el otro con deshacer. Antes, revisar cómo afecta a la devolución a HubSpot (no se devuelve una fusión automáticamente: se marca para hacerla a mano). | `quality.ts`, `QualityPanel.tsx`, servidor de registros | `app.inject` + prueba pura del plan de fusión | L, SRV | Pendiente |

## Oleada 3 · El día (Hoy, Inicio, tareas)

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| H1 | **Hecha / Posponer ▾ en cada fila de Hoy**, sin abrir la tarea, con deshacer. Teclas `H` y `P` sobre la fila enfocada. | `LocalOperations.tsx`, `useShortcuts.ts` | Prueba de atajos + `task-display` | M, UI, Ver en casa | Aplazada: el guardado de Hoy pasa por las barreras de identidad y el gestor `TaskOutcomesHost`; hacerlo en línea exige reutilizar `submitManaged` y validarlo con e2e en casa. Mientras tanto, «Despachar» (G D) ya marca hechas y pospone con teclas. |
| H2 | **Seguimiento al completar**: al marcar una tarea como hecha, propone «¿Siguiente paso?» con fechas rápidas (mañana, lunes, en una semana). | `task-preset.ts`, `FocusRun.tsx`, `LocalOperations.tsx` | `tests/task-preset.test.ts` | M, UI | Hecha en Despachar: tras «Hecha» propone asunto y fecha (M, L, U; N para saltar) y crea la tarea con los mismos enlaces (`followUpTask`). En Hoy queda con H1. Ver en casa. |
| H3 | **Revisión semanal** (viernes o lunes): hechas, pospuestas más de dos veces, vencidas y oportunidades sin próximo paso, con acciones en la misma pantalla. | `app-shell/weekly-review.ts` nuevo, ruta `/hoy/semana` en `routes.ts` | `tests/weekly-review.test.ts` | M–L, UI | Pendiente |
| H4 | **Recordatorio dentro de la app** cuando una tarea vence durante la sesión: aviso discreto en la barra superior, sin notificaciones del sistema. Se pausa con la pestaña oculta (`poll.ts`). | `TopBar.tsx`, `app-shell/poll.ts` | Prueba pura del cálculo «vence en los próximos 15 min» | S–M, UI | Hecha: `due-reminder.ts` (puro) + `DueReminder.tsx` (reloj propio, se pausa con la pestaña oculta). Solo tareas con hora; descartar dura la sesión. Ver en casa. |
| H5 | **Accesibilidad de la cola**: semántica de tabla real en Hoy y progreso anunciado (`aria-live`) en Despachar. | `LocalOperations.tsx`, `FocusRun.tsx` | Prueba estática de atributos | S, UI | Pendiente |
| H6 | **Plantillas de seguimiento**: textos de llamada y correo guardados por el usuario, con huecos (`{empresa}`, `{etapa}`), que se copian al portapapeles. No se envía nada. | `app-shell/templates.ts` nuevo, `RecordSummary.tsx` | `tests/templates.test.ts` (sustitución, huecos sin valor) | M, UI | Pendiente |

## Oleada 4 · Continuidad que se puede enseñar

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| C1 | **Asistente de devolución por pasos**: revisar → conflictos → diferencia final → enviar o hacerlo a mano → justificante. Sustituye al `<details>` plegado de Cambios. | `ChangesView.tsx`, módulo nuevo `app-shell/return-steps.ts` | `tests/return-steps.test.ts` + `return-explain-ui` | M, UI, Ver en casa | Pendiente |
| C2 | **Lista imprimible de la recuperación manual**, con casillas por cambio y estilos `@media print`. | `ManualRecovery.tsx`, CSS | Prueba estática del orden y del recuento | S, UI | Pendiente |
| C3 | **Línea de tiempo de diferencias entre copias** (altas, cambios, bajas por objeto). Se enlaza desde el aviso «encoge más del 15 %» del libro de capturas. Usa la comparación existente. | `server/capture-comparison.ts` (solo lectura), `CopyTimeline.tsx`, `continuity-insights.ts` | Prueba pura del resumen de diferencias | M, UI | Pendiente |
| C4 | **Simulacro de 5 minutos que termina en el pasaporte**: al acabar el simulacro guiado, se genera directamente el pasaporte de continuidad. | `GuidedDrill.tsx`, `ContinuityPassport.tsx` | `guided-drill` ampliado | M, UI | Pendiente |
| C5 | **Calendario de simulacros**: la franja de preparación propone el próximo simulacro (cada 30 días o tras un cambio grande de la copia) y avisa si se pasa. | `continuity-insights.ts` | `continuity-insights.test.ts` | S, UI | Hecha: `drillCalendar` (puro) + bloque en «Comprueba tu Plan B» con regla de 30 días. «Cambio grande» = la última captura difiere más de un 15 % de la probada. Ver en casa. |
| C6 | **Comprobar la devolución** (releer HubSpot y casar cada cambio). Aquí solo se implementa con el proveedor falso de las pruebas; la lectura real se valida en casa. | `server/hubspot-read-check*.ts`, `ChangesView.tsx` | `app.inject` con proveedor falso | M, SRV | Pendiente |

## Oleada 5 · Calidad de datos

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| D1 | **Normalizar al importar y al editar**: teléfonos con prefijo, correos en minúscula, sitios web sin `http`, espacios dobles. Se muestra la propuesta antes de aplicarla. | `shared/normalize.ts` nuevo, `shared/csv-import.ts` | `tests/normalize.test.ts` | M, UI+SRV | Pendiente |
| D2 | **Reglas por etapa**: qué campos hacen falta para pasar de etapa (importe en «Propuesta», fecha de cierre en «Negociación»). Aviso, no bloqueo. | `quality.ts`, `PipelineCard.tsx` | `quality` ampliado | M, UI | Pendiente |
| D3 | **Panel de calidad con tendencia**: porcentaje de registros completos por objeto y su evolución entre capturas. | `QualityPanel.tsx`, `quality.ts` | Prueba pura de la tendencia | S–M, UI | Pendiente |

## Oleada 6 · Base técnica (sin cambiar lo que se ve)

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| P1 | **Dividir `App.tsx`** (≈38 KB, 20 `useState`, 15 `useEffect`) en contextos: sesión, continuidad, avisos y deshacer. Cargar más tarde `Protection`, `CsvImport` y `HomeOverview`. | `App.tsx`, `app-shell/lazy-pages.tsx` | Todas las pruebas de `app-shell` + build | L, UI | Pendiente |
| P2 | **Partir los tres componentes más grandes**: `LocalTaskFocus.tsx` (58 KB), `CommitmentRadar.tsx` (42 KB) y `ContinuityLab.tsx` (40 KB), sacando la lógica a módulos puros con pruebas. | esos archivos | Pruebas existentes + nuevas de los módulos | L, UI | Pendiente |
| P3 | **Presupuesto de tamaño**: una prueba lee el informe de `npm run build` y falla si el JS inicial supera el límite acordado. | `tests/bundle-budget.test.ts` | La propia prueba (lee archivos de `dist`) | S | Pendiente |
| P4 | **Vistas guardadas en la copia local** en lugar del navegador, para tener las mismas en los dos ordenadores. Solo nombres y filtros, sin datos de registros. | `saved-views.ts`, servidor | `app.inject` | S–M, SRV | Pendiente |

## Oleada 7 · Lo que permite cobrar

Ninguna de estas tareas conecta con servicios de pago ni envía datos. Todo funciona sin conexión.

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| M1 | **Planes y licencia sin conexión.** Planes Personal (gratis, un usuario, copias manuales), Pro (capturas programadas, pasaporte, previsión, cambio en bloque) y Equipo (espacio de equipo). La licencia es un archivo firmado con Ed25519 que se verifica en local con `node:crypto` (sin DPAPI y sin red). Sin licencia, todo sigue funcionando en Personal; nunca se bloquean los datos del usuario. | `shared/license.ts` nuevo, `LicensePanel.tsx` | `tests/license.test.ts` con claves de prueba generadas en la propia prueba | M, SRV+UI | Hecha (sin servidor): verificación Ed25519 con WebCrypto, gracia de 14 días, apartado «Ajustes › Plan y licencia» (`/ajustes/plan`) y `scripts/license-tool.ts` (keygen/issue). La licencia se guarda en el navegador. Aún no bloquea ninguna función; falta generar la clave de venta y pegar la pública en `LICENSE_PUBLIC_KEY`. Ver en casa. |
| M2 | **Pasaporte de continuidad como entregable**: HTML imprimible con antigüedad, recuentos, simulacros, devoluciones y huellas, pensado para enseñar a un auditor (continuidad de negocio). Sin datos de clientes, solo cifras. | `ContinuityPassport.tsx`, `continuity-report.ts` | `continuity-report` ampliado | M, UI | Pendiente |
| M3 | **Informe mensual de continuidad**: resumen del mes (capturas, fallos, simulacros, tiempo máximo sin copia) generado en local. | `app-shell/monthly-report.ts` nuevo | `tests/monthly-report.test.ts` | M, UI | Hecha: botón «Informe del mes» en la cabecera de Continuidad; página HTML autónoma con el mes en curso frente al anterior (días con copia, capturas, fallos, simulacros, mayor hueco), cortado en hora de Madrid. Ver en casa. |
| M4 | **Primer uso en 10 minutos**: `FirstRun.tsx` guía conectar → primera captura → primer simulacro → pasaporte, con progreso y la franja de preparación como hilo conductor. | `FirstRun.tsx`, `continuity-insights.ts` | Prueba pura de los pasos | M, UI, Ver en casa | Pendiente |
| M5 | **Página de precios en la landing** (`src/landing`): tres planes, qué incluye cada uno y la promesa de «tus datos nunca salen de tu ordenador». Precios a decidir por el usuario. | `src/landing/main.tsx` | `ui-copy.test.ts` | S–M, UI, Ver en casa | Pendiente |
| M6 | **Ficha comercial al día**: actualizar `FICHA-COMERCIAL.md` con lo construido desde octubre y separar lo comprobado de lo pendiente. | `FICHA-COMERCIAL.md` | — | S, DOC | Pendiente |

## Orden recomendado

1. **Oleada 1** completa: cierra lo pendiente y no deja deuda.
2. **V1 → V2 → V5 → V3**: datos correctos antes de acciones en bloque.
3. **H1, H2, H4**: lo que más se nota cada día.
4. **C1, C5, C3**: confianza visible.
5. **M1 + M2 + M4**: lo mínimo para poder vender una versión Pro.
6. El resto según lo que pida el uso real.

## Riesgos y cómo se evitan

- **Romper pruebas e2e que no se pueden ejecutar aquí.** Antes de cambiar un texto o un id, buscarlo en `tests/` (las e2e están en `tests/e2e/`). Si cambia, actualizar la especificación en el mismo commit y anotarlo como «e2e por ejecutar en casa».
- **Crecer sin control.** Lógica nueva en módulos puros pequeños. Componentes de más de 30 KB no crecen: primero se parten (P2).
- **Prometer de más al vender.** La ficha comercial y la landing solo afirman lo que tiene prueba; lo demás se presenta como «en preparación».
- **Licencia que bloquee al usuario.** M1 degrada a Personal, nunca impide abrir, exportar ni recuperar los datos.
