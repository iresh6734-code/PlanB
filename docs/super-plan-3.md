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

## 2. Orden

1. Bloque A completo, una construcción, pruebas de guardia y una ronda visual en escritorio y móvil, más el modo oscuro de Inicio y Continuidad.
2. Commit y push.
3. Bloque B con sus módulos y pruebas, construcción, commit y push.

## 3. Lo que no se toca

- Exportar y Copia de equipo: tienen campos de contraseña y de clave.
- El campo de token de Cambios: solo se cambia su CSS de alrededor.
- El acceso y el bloqueo.
