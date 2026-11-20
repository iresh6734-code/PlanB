# Super plan 3 de Plan B

Preparado el 20/11/2026 sobre la rama `planb-v0.3-local` (commit `bcfd049`), con el [super plan 2](super-plan-2.md) terminado.

Parte de una revisión en vivo, apartado por apartado, de las 19 rutas de la aplicación abierta en la pestaña del usuario, con los datos de prueba de «Agencia Norte». El usuario pidió expresamente esa revisión en el navegador.

Persigue dos cosas:

- **Orden y compactación:** nada que se salga de su caja, nada sobredimensionado, la misma jerarquía en todas las páginas.
- **Más función con lo que ya hay:** atajos que ahorran clics a diario y que se calculan en local.

## 0. Reglas

Siguen vigentes **íntegras** las del §0 de [super-plan.md](super-plan.md) y [super-plan-2.md](super-plan-2.md). Resumen:

- Sin datos reales, sin DPAPI y sin llamadas de red, salvo `git pull` y `git push`.
- Sin baterías de Playwright, sin servidores de demostración nuevos y sin navegadores sin cabeza.
- No se escribe nunca en campos de contraseña o de token, y no se toca el código de acceso ni de bloqueo.
- Pruebas solo con `node tools\safe-tests.mjs` o archivos sueltos con `node --import tsx --test`.
- **Revisión visual:** solo en la pestaña que el usuario ya tiene abierta, sin pulsar botones que cambien datos. Una ronda tras construir, una corrección en bloque y, como mucho, una ronda de confirmación.

### 0.1 Filtro de admisión

El mismo del plan 2: funciona sin conexión, su lógica cabe en un módulo puro con prueba, no cambia el cifrado ni el formato de la copia, no guarda contenido de registros en el navegador.

La quinta condición cambia: la revisión visual ya no se deja para casa, se hace en vivo con la ronda acotada del §0.

## 1. Diagnóstico de la revisión en vivo

| Ruta | Defecto | Causa |
|---|---|---|
| `/continuidad/cambios` | El asistente «Devolución revisada» corta los textos y se sale 18 px de la página | Los cinco pasos están fijos en cinco columnas dentro de una columna estrecha |
| `/hoy/agenda` | En la semana, los avisos invaden el día siguiente, y el panel lateral deja media pantalla vacía | La lista de cada día no limita el ancho de sus filas; el panel no se adapta al ancho |
| `/clientes`, `/oportunidades`, `/tareas` | La cabecera cambia de una página a otra y en Oportunidades los botones caen a una segunda fila | Una regla genérica de `.page-header` anula la rejilla de la cabecera de listas |
| `/inicio` | «Oportunidades abiertas» ocupa media página con tres cajas vacías y la columna izquierda dobla a la derecha | La previsión pinta meses sin nada, y la nota y la meta van en bloques propios |
| `/continuidad` | La cabecera aprieta tres botones y una nota; el aviso de la copia deja un hueco; «Conectar HubSpot» toca el borde | Cabecera en columna y filas de preparación sin margen derecho |
| `/laboratorio/radar` | Los títulos de cada grupo empiezan en una x distinta | La primera columna depende del contenido de cada grupo |
| `/laboratorio/fecha` | La página es más estrecha y está centrada | Un ancho máximo propio distinto del resto |
| `/ajustes/integraciones` | El resumen del espacio local se parte de forma irregular | Rejilla automática sin mínimo de columna |
| `/ajustes/preparacion` | Las reglas repiten su título en la descripción | La descripción se compone con el nombre de la regla delante |

## Bloque A · Orden y compactación

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| A1 | **Asistente de devolución que cabe.**<br>Con menos de 640 px de ancho disponible, los pasos se apilan en filas compactas (marca, título, pista). | `faro.css` | `css-unused`, `design-tokens` | S, UI | Hecha (20/11/2026) |
| A2 | **Agenda sin desbordes.**<br>Filas de día con ancho mínimo cero, días de la semana más bajos y panel lateral en dos columnas cuando hay sitio. | `agenda.css` | `agenda`, `css-unused` | S, UI | Hecha (20/11/2026) |
| A3 | **Una sola cabecera de listas.**<br>Título y acciones en la primera fila, herramientas y totales en la segunda, igual en Clientes, Empresas, Oportunidades y Tareas. | `cuaderno.css` | `record-list`, `css-unused` | S, UI | Hecha (20/11/2026) |
| A4 | **Inicio equilibrado.**<br>Previsión en una línea cuando no hay nada previsto, «Cómo se calcula» plegado, meta en la línea del título y columnas compensadas. | `PipelineCard.tsx`, `HomeOverview.tsx`, `faro.css` | `pipeline-forecast`, `continuity-home-hub`, `ui-copy` | M, UI | Hecha (20/11/2026) |
| A5 | **Cabecera y estado de Continuidad.**<br>Nota bajo los botones a lo ancho, aviso de la copia sin hueco y filas de preparación con aire. | `faro.css`, `continuity-insights.css` | `css-unused` | S, UI | Hecha (20/11/2026) |
| A6 | **Radar alineado.**<br>Primera columna de ancho fijo en todos los grupos. | `faro.css` | `css-unused` | S, UI | Hecha (20/11/2026) |
| A7 | **Comprobar una fecha al ancho común.** | CSS de la página | `css-unused` | S, UI | Hecha (20/11/2026) |
| A8 | **Integraciones ordenadas.**<br>Resumen del espacio local en columnas regulares y filas de Google alineadas. | CSS de Integraciones | `css-unused` | S, UI | Hecha (20/11/2026) |
| A9 | **Preparación sin repeticiones.**<br>Las reglas muestran su descripción sin repetir el título. | Componente de Preparación | Prueba del texto | S, UI | Hecha (20/11/2026) |

## Bloque B · Funciones

| ID | Tarea | Archivos | Prueba segura | Tamaño | Estado |
|---|---|---|---|---|---|
| B1 | **Vistas rápidas nuevas.**<br>Tareas «Esta semana», Clientes «Sin empresa» y Empresas «Sin sitio web», solo si la especificación tiene el campo. «Sin oportunidad abierta» queda fuera: exigiría leer todas las oportunidades. | `saved-views.ts` | `saved-views` | M, UI | Hecha (20/11/2026) |
| B2 | **Agenda «Copiar semana» / «Copiar mes».**<br>Texto plano del periodo visible, agrupado por día y solo con los días que tienen algo, listo para pegar en un correo o en un chat interno. | `agenda-grid.ts` (`agendaText`), `Agenda.tsx`, `agenda.css` | `agenda` | S, UI | Hecha (20/11/2026) |
| B3 | **«Copiar» en las listas.**<br>Sustituye a «+7 días», que ya existía en la Agenda como «A 7 días». Copia lo que se ve (búsqueda, vista y filtro aplicados) como texto, una línea por registro, junto al botón CSV. | `csv.ts` (`toPlainList`), `RecordsPage.tsx` | `csv-export` | S, UI | Hecha (20/11/2026) |

**Revisión visual en vivo (20/11/2026).** Escritorio, móvil a 390 y 335 px y modo oscuro: etiquetas en minúscula inicial (resumen de la mañana, Inicio, Agenda), «Hoy» visible en la Agenda móvil, cabecera de la Agenda en una sola fila, huecos vacíos de Cambios con su marco discontinuo, Inicio móvil apilado, Preparación sin repetir el origen de cada regla y el aviso del Radar legible en oscuro.

## Ronda C (20/11/2026)

| ID | Tarea | Archivos | Prueba segura | Estado |
|---|---|---|---|---|
| C1 | **Orden y compactación.**<br>Selector de marca de Continuidad dentro de la pantalla en móvil; «Comprobar fecha» (antes «Comprobar una fecha») cabe en una línea del menú; acciones de la ficha en una fila («Escribir · Copiar · Llamar · Tarea · Oportunidad», con su nombre completo para lectores de pantalla); campos del cajón alineados arriba; etiquetas en minúscula inicial en Revisión semanal, Plan y Fusionar; Exportar reequilibrado en dos columnas (solo la disposición, sin tocar sus campos). | CSS de cada página, `navigation.ts`, `RecordSummary.tsx` | `css-unused`, `ui-copy`, `record-sheet`, `bundle-budget` | Hecha |
| C2 | **Agenda «Al calendario».**<br>Descarga el periodo visible como archivo .ics (días completos, sin ocupar la jornada) para importarlo en Outlook o Google Calendar. Se genera en el navegador, sin red; el UID sale del registro, así que importar otra vez actualiza en lugar de duplicar. | `agenda-grid.ts` (`agendaIcs`), `csv.ts` (`downloadText`), `Agenda.tsx`, `agenda.css` | `agenda` | Hecha |

## Ronda D (20/11/2026)

| ID | Tarea | Archivos | Prueba segura | Estado |
|---|---|---|---|---|
| D1 | **«Comprobar fecha» fiable.**<br>Un trabajo que se pasa de la ventana pedida ya no cuenta como que cabe; las protecciones se juzgan frente a la base sin escenario, así que una ausencia de técnico no las rebaja; una búsqueda de escenarios cancelada o incompleta da resultado «desconocido» en vez de certificar; la decisión y el cierre exigen que coincidan alternativa y solicitud. | `shared/operational-date-check.ts`, `shared/date-check-outcome.ts`, `shared/date-check-api.ts`, `DateCheck.tsx` | `date-check`, `decision-review`, `operational-rehearsal` | Hecha |
| D2 | **Modo oscuro y ventanas.**<br>Fuera los verdes azulados fijos del tablero, cajones y esqueletos (ahora con tokens); títulos de Novedades legibles; «Atajos» sin barra de desplazamiento. | `faro.css`, `whats-new.css` | `color-guard`, `css-unused`, `design-tokens` | Hecha |
| D3 | **Reprogramar cierres pasados.**<br>En Oportunidades › «Cierre pasado», reparte las fechas vencidas en los próximos días laborables (1, 2, 3 o 5 al día; primero las de más importe; sin fines de semana), con vista previa, progreso, «Detener» y deshacer el lote. Todo local y anotado en Cambios. | `reschedule.ts`, `RescheduleBar.tsx`, `RecordsPage.tsx`, `lazy-pages.tsx`, `faro.css`, `whats-new.ts` | `reschedule`, `bulk-edit`, `whats-new` | Hecha |

## Rediseño «Consola de operaciones» (20/11/2026)

El usuario rechazó el aspecto de Agenda y Oportunidades («horroroso»). La identidad «Cuaderno» se sustituye entera por **«Consola de operaciones»**: bastidor grafito para el menú, mesa gris lisa, bahías con su regla superior y tiras claras, cobalto para actuar, señal para vencido y ámbar para revisar. El sistema está descrito en `DESIGN.md` y el contrato de dirección en `.impeccable/surfaces/src-app-shell.md`. No cambia ningún texto, función, prueba de copia ni pantalla de acceso.

| Pieza | Qué cambia | Archivos | Prueba segura |
|---|---|---|---|
| Capa global | `src/consola.css` sustituye a `src/cuaderno.css` (borrado) y se importa la última. `css-unused --dedupe` quitó de `faro.css` 21 declaraciones pisadas. | `consola.css`, `main.tsx`, `faro.css` | `design-tokens`, `color-guard`, `css-unused`, `bundle-budget`, `design-k-block`, `record-sheet` |
| Agenda | A toda altura en escritorio, sin desplazar el documento. La regla de cifras, la de más carga y las acciones van dentro del calendario. La semana son carriles con línea de capacidad y el mes reparte el alto. El panel del día se desplaza por dentro, con el recuento de lo vencido. En móvil, las cifras forman una regla de cuatro columnas. Tipo de elemento con sello, sin franja lateral. | `Agenda.tsx`, `agenda.css` | `agenda` |
| Oportunidades | Cada etapa es una bahía hundida con la regla de su etapa arriba, y las fichas son tiras de tres filas. | `consola.css` | `record-list` |
| Barra superior móvil | La copia se queda en su antigüedad con elipsis (el rótulo completo sigue para lectores de pantalla). La ayuda «?» pasa a la paleta. | `TopBar.tsx`, `consola.css` | `ui-copy` |
| Listas en móvil | Correo y web ocupan la fila entera de la tarjeta. El título de la página no se recorta por las acciones. | `consola.css` | `record-list` |
| Inicio | Mismo hueco entre bloques, rótulos de tarjeta alineados a 16 px y el rombo del Radar también en la leyenda. | `consola.css` | `continuity-home-hub` |

**Comprobado en el navegador** a 1440 y 1366 px en claro y oscuro y a 390 px. Resultado: 51/51 pruebas seguras y CSS inicial dentro del presupuesto. El detector de diseño solo marcó la franja lateral de la Agenda, ya quitada.

## 2. Orden

1. Bloque A completo, una construcción, pruebas de guardia y una ronda visual en escritorio y móvil, más el modo oscuro de Inicio y Continuidad.
2. Commit y push.
3. Bloque B con sus módulos y pruebas, construcción, commit y push.

## 3. Lo que no se toca

- Exportar y Copia de equipo: tienen campos de contraseña y de clave.
- El campo de token de Cambios: solo se cambia su CSS de alrededor.
- El acceso y el bloqueo.
