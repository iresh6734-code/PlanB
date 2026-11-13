# CLAUDE-FABLE-UI-GRAFITO · Rediseño integral «Grafito» (11/11/2026)

Orden directa del usuario: rediseño completo de la capa de presentación de la App local (`/`). Sin cambios de servidor, contratos API, permisos, persistencia ni datos. **No desplegado**: 4331 y 4334 siguen con su `dist` anterior.

## Dirección
Marco de grafito (#16181d), lienzo mineral (#eceef2), hojas blancas; índigo (#4a41d4) para actuar y ámbar (la «B») solo para indicar dónde estoy. Tipografía Segoe UI Variable (Display para títulos), cuerpo 13 px, título 18 px, etiquetas de tabla en versalitas de 10,5 px, cifras tabulares. Control 30 px, fila 36 px, radios 6/8/12.

## Archivos
- `src/planb-grafito.css` (nuevo, capa final importada tras `operaciones-claras.css`).
- `src/main.tsx`: importa la capa.
- `src/App.tsx`: barra superior fija (contexto / apartado / estado de la copia); «Trabajar» abierto por defecto; página de registros con cabecera-barra (título, búsqueda, filtro, acción) y barra de estado inferior (estado, cobertura, servicios, guardado, paginación); «Comprobar una fecha» en dos columnas; en móvil el apartado activo se desplaza a la vista.
- `src/ContinuityHome.tsx`: cuatro secciones con `TabList` (Estado · Evidencia e impacto · Copias y archivo · Operaciones). Los paneles inactivos siguen montados (`hidden`): no cambia ninguna lectura ni estado. «Abrir continuidad» y la vuelta desde Integraciones seleccionan «Evidencia e impacto».
- `src/LocalOperations.tsx`: `placeholder` en el filtro de texto.
- `src/HomeOverview.tsx`: la cola de Inicio muestra hasta 10 tareas (antes 5). Este archivo está en revisión bajo `CLAUDE-OPUS-UI-OPERACIONES-CLARAS`; el cambio es de una constante y se hizo por la orden directa del usuario.
- `tests/design-tokens.test.ts`: el orden de carga espera ahora tres hojas finales y se añade una prueba AA de la paleta efectiva.

## Medición (altura de documento a 1366 × 768, datos de ensayo «Agencia Norte»)
| Pantalla | Antes | Después |
| --- | ---: | ---: |
| Continuidad | 5855 | 768 (Estado) · 1410 Evidencia · 768 Copias · 1712 Operaciones |
| Hoy | 1363 | 910 |
| Agentes | 1451 | 956 |
| Clientes (24 filas) | 1467 | 1044 |
| Tareas | 1203 | 828 |
| Integraciones | 1514 | 1012 |
| Exportar | 1071 | 768 |
| Comprobar una fecha | 916 | 768 |
| Oportunidades | 894 | 768 |
| Inicio | 771 (5 tareas) | 768 (9 tareas visibles) |

Inicio de la tabla de Clientes: de ≈240 px a ≈103 px desde el borde superior.

## Verificado
- `tsc --noEmit`: limpio. `vite build` aislado (`tests/.tmp/rd/dist`): correcto.
- Pruebas que leen los archivos tocados, en serie: design-tokens 10/10, auth-parent 4/4, continuity-home-hub 5/5, independent-copy-inspection-api 16/16, independent-local-operations-http 10/10, local-operations* 22/22, local-work-queue 25/25, task-outcomes-host 12/12, ui-journeys 60/60.
- Batería completa (`tsx --test "tests/*.test.ts"`, en paralelo): 2907 de 2939 en verde, 27 fallos. Uno era de este trabajo (orden de hojas) y está corregido. Los demás están en archivos que no leen nada de lo tocado (continuity-evidence-mount, independent-continuity-lab, independent-task-focus-123, independent-task-revision, task-intent-consumer-independent-322, task-intents-entrypoints) y G6 de independent-interface-contexts, que examina la línea `<Protection …>` de App.tsx, no modificada aquí. **No se ha ejecutado una línea base sin el rediseño**, así que su origen previo se deduce, no se demuestra.
- Navegador (Chromium headless 1228 contra vite + servidor aislado 4421 con red externa bloqueada): 18 vistas × 4 resoluciones (1440×900, 1366×768, 1280×800, 390×844) sin desborde horizontal; búsqueda de clientes, ficha lateral (abrir/Escape), modal de cobertura, buscador Ctrl K, filtro de Hoy y ficha de tarea funcionan.
- Contraste: 66 pares texto/fondo ≥ AA (script `tests/.tmp/rd/contrast.mjs`) y prueba nueva en `design-tokens.test.ts`.

## No verificado / límites
- **E2E de Playwright del repositorio no ejecutados.** Los specs que esperan secciones de Continuidad visibles sin cambiar de pestaña (historial, operaciones, inspección, pasaporte) o el pie de registros como `footer.pagination` necesitarán adaptación.
- `/team` (espacio de equipo) y el paquete `runtime` no se han abierto: heredan tokens y componentes base, sin revisión visual.
- Estados no alcanzables con la copia de ensayo (Radar activo, sesión de continuidad, trabajos en curso, errores de carga, pantalla de bloqueo) solo tienen estilo, sin captura.
- En el arnés, «Ver cobertura» devuelve 403 «Origen no permitido» porque la página se sirve desde vite (5199) y no desde el servidor; no ocurre con `dist` servido por el propio servidor.
- Integraciones repite el mismo «Siguiente paso» en las cinco filas de Google: es texto del modelo de vista, no se ha deduplicado.

## Recuperación
Copias previas de `App.tsx`, `ContinuityHome.tsx` y `main.tsx` en `tests/.tmp/rd/backup/`, y `git stash create` del árbol previo: `d0c1d82b544fd795ed05b91c719a3752cba04840`. Para desactivar solo el aspecto: quitar el `import './planb-grafito.css'` de `main.tsx`.

Capturas: `tests/.tmp/rd/shots/before/` (1366) y `tests/.tmp/rd/shots/after/` (cuatro resoluciones, con `metrics-*.json`).

---

## Segunda pasada · identidad «Faro» (11/11/2026, tarde)

El usuario juzgó la primera pasada genérica y con apartados sin trabajar. Segunda pasada sobre los mismos archivos. La primera versión se desplegó en 4331 a las 15:04; **esta segunda no está desplegada**.

**Estado en el tablón:** estos archivos cambiaron DESPUÉS de presentar `CLAUDE-FABLE-UI-GRAFITO`. No se reabrió ni se volvió a presentar: `revise` exige la etiqueta de Codex y Claude no debe usarla sobre su propia entrega. Los hashes presentados ya no corresponden; Codex o el usuario deben reabrirla.

- **Identidad:** marco petróleo (#0e2a2f), acción verde mar (#0d6b63), ámbar (#f0a92b) solo para «hoy / aquí», lienzo bruma (#eef1ee). Títulos en Sitka (serif de sistema), interfaz en Segoe UI Variable. Etiquetas en minúscula. Hojas sin sombra.
- **Inicio:** pieza «La semana en una línea» (`HomeOverview.tsx`): cada tarea con fecha legible y cada compromiso abierto del Radar se dibuja en su día; el punto abre la tarea o el Radar. Solo usa datos ya cargados. Los tres recuentos pasan a ser fichas dentro de la pieza y la tarjeta de la copia encabeza la columna lateral.
- **Radar:** grupos por estado en una hoja con filas densas y carril de color; rótulos de columna una vez por grupo. 1451 → 1014 px a 1366.
- **Comprobar una fecha (resultado):** veredicto y alternativas a la izquierda; consecuencias, matriz y registro a la derecha. 3741 → 2296 px.
- **Ensayar mi semana:** diagnóstico y «¿Y si…?» en dos columnas. 1190 → 768 px.
- **Cambios, Copia de equipo, Preparación, Revisar una decisión, bloqueo y marco móvil:** adaptados a la identidad.
- **Verificado:** `tsc` limpio; `vite build` aislado correcto; design-tokens 10/10 (valida los tokens efectivos de Faro), ui-journeys 60/60, continuity-home-hub 5/5, local-operations 13/13, task-outcomes-host 12/12, auth-parent 4/4; 18 vistas × 4 resoluciones sin desborde; interacciones correctas; contraste AA en los pares en uso.
- **No verificado:** batería completa y E2E del repositorio no se repitieron tras esta pasada; `/team` sin revisión; Sitka solo existe en Windows (en otros sistemas cae a Iowan/Palatino/Georgia, no comprobado). La capa conserva el nombre `planb-grafito.css` aunque la identidad vigente es Faro.
- Capturas: `tests/.tmp/rd/shots/v1/` (estados reales antes de esta pasada) y `tests/.tmp/rd/shots/v2/`. Copias previas: `tests/.tmp/rd/backup/planb-grafito.v1.css` y `HomeOverview.v1.tsx`.

---

## Tercera pasada · funciones inteligentes y acabado (11/11/2026, tarde)

Pedida por el usuario tras desplegar Faro (15:51). **No desplegada**: 4331 sigue con la segunda pasada. Los archivos siguen cambiando después de presentar el encargo; el tablón no se ha reabierto (ver arriba).

- **Inicio · «Tu siguiente paso»** (`HomeOverview.tsx`): una recomendación calculada con lo ya leído, por este orden: compromiso del Radar en riesgo, tarea vencida más antigua, copia antigua, prueba pendiente, cambios por revisar. Muestra hasta tres pasos siguientes. Es una heurística de presentación; no decide ni escribe.
- **Avisos en el menú** (`App.tsx`): vencidas en Hoy, compromisos en riesgo en Radar, cambios locales en Cambios. Los dos primeros se conocen al pasar por Inicio (no se añadió ninguna petición); sin dato no se muestra nada.
- **Antigüedad viva** en la barra superior («hace 1 h»), en ámbar a partir de 75 minutos; abre Continuidad.
- **Atajos de teclado**: `G` + letra para ir a cada apartado, `/` para buscar en la lista, `N` nuevo registro, flechas entre filas, `?` muestra la lista. No actúan al escribir ni con ficha o ventana abierta.
- **Recordar dónde estabas**: apartado y tipo de registro en `sessionStorage` (solo esos dos valores). **Cambio de comportamiento:** al recargar ya no se vuelve siempre a Inicio.
- **Registros**: columnas ordenables (reordena solo los registros cargados en la página) y, en Oportunidades, suma por etapa y total de la vista.
- **Integraciones** (`LocalIntegrations.tsx`): si todas las herramientas del equipo comparten el mismo siguiente paso y no tienen acción propia, se dice una vez para el grupo.
- **Acabado**: entrada suave del contenido al cambiar de apartado (respeta «reducir movimiento»); pie de la barra lateral siempre visible.

**Verificado:** `tsc` limpio; `vite build` aislado correcto; design-tokens 10/10, ui-journeys 60/60, auth-parent 4/4, continuity-home-hub 5/5, local-operations 13/13, task-outcomes-host 12/12, local-integrations 18/18, independent-local-integrations 4/4; independent-interface-contexts 46/47 (falla G6, la misma comprobación de la línea `<Protection …>` que ya fallaba antes). En navegador (`tests/.tmp/rd/smart.mts`): siguiente paso y su botón, avisos 8/4/2, atajos `g c`, `/`, `n`, flechas, que no actúan al escribir, orden ascendente/descendente, recordar tras recargar, sumas del tablero (37.500 € = suma de las cuatro etapas), ayuda con 14 atajos, Integraciones con un único «siguiente paso». 18 vistas × 4 resoluciones sin desborde.

**No verificado:** batería completa y E2E del repositorio; los E2E que recargan y esperan Inicio pueden verse afectados por «recordar dónde estabas». Capturas en `tests/.tmp/rd/shots/v3/`.

---

## Fase 0 del plan «Faro 2» · primera tanda de cimientos (11/11/2026, tarde)

Plan en `coordination/briefs/CLAUDE-PLAN-FARO-SIGUIENTE.md`. Esta tanda no cambia el aspecto ni el comportamiento: lo demuestra la comparación visual (72 de 72 vistas idénticas). **No desplegada** (no hay nada visible que desplegar).

### Línea base de pruebas (resuelta)
Los 27 fallos de la batería completa, uno por uno:
- **19 existían antes del rediseño.** Reproducidos en una copia del proyecto con los archivos del rediseño revertidos: continuity-evidence-mount 1, independent-continuity-lab 2, independent-task-focus-123 2, independent-task-revision 1, task-intent-consumer-independent-322 3, task-intents-entrypoints 10. Mismos recuentos que en el árbol actual.
- **6 eran por ejecutar en paralelo.** rescue-capsule-integrity (10/10) y rescue-capsule-rehearsal (35/35) pasan en serie.
- **1 era del rediseño** (orden de hojas en design-tokens) y está corregido.
- **1 (G6 de independent-interface-contexts)** examina la línea `<Protection …>` de `App.tsx`, que el rediseño no modificó. En la copia revertida ese archivo no llegó a ejecutarse (falló entero al cargar), así que este caso se sostiene por inspección, no por ejecución.

### Red de seguridad visual (nueva, `tools/visual/`)
- `check.mts reference|compare`: 18 vistas × 4 resoluciones, huella por vista, aviso de desborde. Dos capturas del mismo código salen idénticas.
- `diff.mts`: localiza los píxeles que difieren. `css-audit.mts`: uso de cada hoja.
- Ya detectó un efecto real: al extraer la página de registros con remontaje, el texto del pie se movía menos de un píxel. Se quitó el remontaje y la comparación volvió a 72/72.
- Límites en `tools/visual/README.md` (zonas tapadas por depender de la hora; referencia válida solo para los mismos datos y el mismo día).

### Auditoría de CSS
404 kB en 52 hojas; el 51 % del peso no encuentra ningún elemento en las vistas de la App local. Las más cargadas de reglas sin coincidencia: `planb-ui.css` (51 kB, 36 % en uso), `design-system.css` (33 kB, 41 %), `styles.css` (36 kB, 59 %). Varias hojas con 0 % pertenecen a `/team`, fichas o estados no visitados: **no son borrables con este dato**. Resultado completo en `tests/.tmp/visual/css-audit.json`.

### Capa propia
- `src/planb-grafito.css` → **`src/faro.css`** (main.tsx y design-tokens actualizados).
- Retiradas 166 declaraciones y 17 reglas que un bloque posterior redefinía con el mismo selector y contexto (eliminación segura por construcción, verificada con la comparación visual). Ahorro real: 5 % (104,8 → 99,7 kB). El peso de la capa es contenido vigente.

### `App.tsx` partido
317 → 245 líneas. Nuevos módulos en `src/app-shell/`: `session.ts` (apartado recordado, formato de euros), `useShortcuts.ts`, `ShortcutsHelp.tsx`, `RecordsPage.tsx` (tabla, tablero, orden y barra de estado). Las líneas que otras pruebas buscan en `App.tsx` siguen en `App.tsx`.

### Verificado
`tsc` limpio; `vite build` aislado correcto; comparación visual 72/72; design-tokens 10/10, ui-journeys 60/60, auth-parent 4/4, continuity-home-hub 5/5, local-operations 13/13, task-outcomes-host 12/12, local-integrations 18/18, independent-local-integrations 4/4, independent-interface-contexts 46/47 (G6); funciones en navegador (atajos, orden, recordar, ayuda) sin errores de consola.

### Lo que queda de la fase 0
- **Retirar las nueve hojas heredadas** y con ellas el prefijo `html body` y los `!important`. Es el grueso de la fase y no está empezado.
- **Biblioteca de componentes** (`Hoja`, `Cabecera`, `Fila`, `Etiqueta`, `Tabla`, `Vacío`, `Cargando`): no empezada.
- **Barra lateral y barra superior** siguen dentro de `App.tsx`.
- **E2E del repositorio**: siguen sin ejecutarse ni adaptarse.
- **Tablón**: el encargo sigue sin reabrir; debe hacerlo Codex o el usuario.

---

## 12/11/2026 · resto de la fase 0 y primera tanda de la fase 2

### Fase 0 (continuación)
- **CSS heredado anulado, retirado.** `tools/visual/css-trim.mjs` quita de las ocho hojas globales antiguas las declaraciones que otra declaración global anula siempre (mismo selector salvo el prefijo `body`/`html body`, misma propiedad, contexto compatible, y gana por `!important`, prefijo o posición). 1.856 declaraciones y 455 reglas vacías fuera: 169 → 125 kB (−26 %). Comparación visual 72/72 justo después. La regla no depende de qué pantallas se visiten, pero `/team` no se ha mirado.
- **Piezas base** en `src/ui/` (`Sheet`, `PageHeader`, `Tag`, `EmptyState`, `Skeleton`) con prueba `tests/ui-kit.test.ts` (6/6). Primer uso: carga y estado vacío de la página de registros, y carga de Inicio.
- **`App.tsx`**: 317 → 206 líneas. `src/app-shell/` suma `Sidebar.tsx` y `TopBar.tsx`.
- **Sin cerrar:** tras extraer las barras y usar las piezas base, las cuatro vistas de registros a 390 px difieren de la referencia en menos de un píxel en el enlace «Ver cobertura» del pie (67/72 con referencia fresca). No se ha encontrado la causa. `PLANB_VISUAL_ONLY` cambia el recorrido y no es fiable para bisecar.
- **Sigue pendiente de la fase 0:** quitar el prefijo `html body` de `faro.css`, adoptar las piezas base en el resto de apartados, E2E del repositorio, tablón.

### Fase 2 · primera tanda (funciones)
- **Tablero vivo** (`RecordsPage.tsx`, `App.tsx`): arrastrar una oportunidad a otra etapa, o Alt + flechas con la tarjeta enfocada. Usa `validateRecord` y el mismo `PATCH /records/deals/:id` que la ficha; el aviso dice a qué etapa pasó o por qué no. **Es la primera función del rediseño que escribe.**
- **Filtro rápido** por la primera columna de tipo lista (p. ej. estado de las tareas), sobre los registros cargados en la página.
- **Fechas pasadas resaltadas** en las tablas, salvo en tareas que parecen cerradas. «Cerrada» se deduce del nombre de la opción de estado: es una heurística visual.
- **Línea de la semana:** detalle del día al pasar el ratón o enfocar, y **Resumen de la semana** (vencido, próximas 24 h, próximos 7 días, compromisos, copia) para imprimir o copiar como texto.
- Corregido «17 h 60 min» en la antigüedad de la copia.

### Verificado (entorno de ensayo, `tests/.tmp/rd/f2.mts`)
Arrastrar Propuesta → Negociación y Alt + ← de vuelta cambian los recuentos y quedan en Cambios (7 operaciones); clic sigue abriendo la ficha; filtro «Completada» 4 de 18; 8 fechas resaltadas (solo pendientes); detalle del día visible; resumen con sus cinco bloques. `tsc` limpio, `vite build` aislado correcto, 72 vistas sin desborde. Pruebas: design-tokens 10/10, ui-journeys 60/60, auth-parent 4/4, continuity-home-hub 5/5, local-operations 13/13, task-outcomes-host 12/12, local-integrations 18/18, ui-kit 6/6, independent-interface-contexts 46/47 (G6 previo).

### No verificado
- El rechazo por regla de negocio al mover (la oportunidad de prueba cumplía la regla). Arrastrar en pantalla táctil. Imprimir (solo se comprobó que el botón existe). Portapapeles.
- Nada de esta tanda se ha probado sobre los datos del CRM 4331.

### Estado del CRM 4331
- 08:05 · interfaz actualizada con la fase 0 (copia `backup-dist-fase0-20261112-080534`).
- 08:06 · **error mío:** arrancado sin `PLANB_DATA_DIR`; la app salió vacía y creó `runtime/data` (base vacía, sin valor, no borrada). Detenido y relanzado con `PLANB_DATA_DIR=planb-local-ux-2026-10-27/data/local`: mismo instanceId de ayer y los 18 apartados cargan (`tests/.tmp/rd/live-all.mts`).
- La primera tanda de la fase 2 **no está desplegada**: el clasificador de permisos denegó la escritura. Queda compilada en `tests/.tmp/rd/dist` y se aplica con `bash tools/actualizar-interfaz-4331.sh`.

### 12/11/2026 · fase 2, segunda tanda
- **Ficha 360** (`src/app-shell/related.ts`, `RelatedPanel.tsx`; `RecordDrawer` acepta `extra`): dentro de la ficha de un cliente, empresa u oportunidad, bloque «Relacionado» con los registros que apuntan a ella por un campo de referencia. Solo lee (`GET /v2/records/:entity`, hasta 3 páginas de 100 por tipo) y, si hay más registros de los revisados, lo dice. Pulsar uno abre su ficha; si la actual tiene cambios sin guardar, pide confirmación.
- **Paleta de órdenes** (`CommandPalette.tsx`, `commands.ts`): Ctrl J o el botón de la barra superior. 22 órdenes con datos de ensayo: ir a cada apartado, crear cada tipo de registro, buscar, cobertura, bloquear y atajos; mismas condiciones que el menú. No actúa con una ficha o ventana abierta.
- **Verificado:** `tests/related-records.test.ts` 5/5 (incluye que no se da por completo lo no revisado); en navegador de ensayo (`tests/.tmp/rd/f2b.mts`): relacionado de un cliente (1 oportunidad, 1 tarea), salto a la oportunidad, aviso con cambios sin guardar, paleta filtrando «oportun» y ejecutando, «crear tarea» abre la ficha nueva. `tsc` limpio, `vite build` aislado correcto, pruebas de interfaz en verde (salvo G6 previo), 72 vistas sin desborde.
- **No verificado:** ficha 360 con más de 300 registros de un tipo en navegador (solo en la prueba unitaria); nada de esta tanda sobre los datos del CRM 4331.
- **Sin desplegar en 4331.** Compilado en `tests/.tmp/rd/dist`; se aplica con `bash tools/actualizar-interfaz-4331.sh`.

### 12/11/2026 · fase 1, Evidencia y Cambios
- **Continuidad › Evidencia e impacto** (solo `faro.css`): el mapa de impacto pasa arriba y a dos columnas (resumen de turno | qué requiere atención); el pasaporte queda debajo como rejilla de cinco preguntas con el próximo paso a la derecha; «Trabajo local pendiente» en una franja con sus acciones al lado. El párrafo introductorio y el título «Continuidad: evidencia y ensayo» dejan de mostrarse (el título sigue para lectores de pantalla). 1410 → 1299 px a 1366: la mejora es de orden, no de altura.
- **Cambios** (`faro.css` y `ChangeHistory.tsx`): historial a la izquierda como contenido principal, propuestas y devolución a la derecha. Cada operación muestra en su fila hasta dos campos con valor anterior → actual (`brief`), sin desplegar. 1655 → 971 px con 13 operaciones.
- **Verificado:** `tsc` limpio; `vite build` aislado correcto; change-history 11/11, continuity-passport 15/15, impact-map 17/17, design-tokens 10/10, ui-journeys 60/60, continuity-home-hub 5/5, ui-kit 6/6, related-records 5/5; 72 vistas sin desborde horizontal; capturas en `tests/.tmp/rd/shots/f1/`.
- **No verificado:** Evidencia con un ensayo de relevo en curso o con avisos de contexto; Cambios con un plan de devolución abierto (operaciones, conflictos) en la columna estrecha; ambos solo se han visto en su estado de reposo. El nombre del campo en el resumen es el técnico (`dealstage`, `phone`), como ya ocurría en el detalle.
- **Sin desplegar en 4331.** Compilado en `tests/.tmp/rd/dist`; se aplica con `bash tools/actualizar-interfaz-4331.sh`.

### 12/11/2026 · Operaciones de Continuidad y espacio de equipo (`/team`)
- **Fallo propio corregido:** la cabecera fija de tabla que añadí el 11/11 se aplicaba a todas las tablas y, fuera de la página de registros, **tapaba la primera fila** (en `/team` › Contactos no se veía «Lucía Martín»). Ahora solo es fija en `.workspace > .table-container`. Estuvo desplegado en 4331 desde el 11/11 a las 15:04; en la App local las tablas afectadas no son la de registros, así que el efecto allí no se ha comprobado caso por caso.
- **`/team` abierto por primera vez** (demo aislada en 4441: `tests/.tmp/rd/build/team.mjs`, `PLANB_TEAM_DEMO=1`, datos en `tests/.tmp/rd/team-data`). Los ocho apartados cargan sin errores de consola ni desborde a 1366 y 390 px. Ya heredaba la identidad Faro.
- **Cambios en `/team`** (solo `faro.css`): barra superior fija como la de la App local; aviso de demo en ámbar; Empresa con saludo y acceso en una línea, recuentos en franja y accesos en dos columnas (1902 → 1767 px).
- **Continuidad › Operaciones:** cada tarea en una fila de dos columnas (qué y cuándo | por qué y con qué) dentro de una sola hoja. Más legible; la altura total no baja (1712 → 1725 px) porque antes iban dos tarjetas por fila.
- **Verificado:** `tsc` limpio; `vite build` aislado; design-tokens 10/10, ui-journeys 60/60, continuity-operations 14/14, team-sync-ui 12/12; 72 vistas de la App local sin desborde; capturas en `tests/.tmp/rd/shots/team-antes`, `team-despues` y `f1`.
- **No verificado / pendiente en `/team`:** solo se ha mirado cada apartado en reposo y con el perfil Administración: ni fichas de contacto, ni el flujo comercial (borrador, revisión, envío simulado), ni otros perfiles, ni estados de error. No se ha recompuesto ningún apartado salvo Empresa. La decisión de fusionar Operaciones con Hoy sigue sin tomar.
- **Sin desplegar en 4331.** `/team` corresponde al piloto 4334, que no se ha tocado.

### 12/11/2026 tarde · despliegue, carga diferida y calidad de los datos
- **Despliegue (16:30, a petición del usuario):** `bash tools/actualizar-interfaz-4331.sh` aplicó en 4331 todo lo hecho hasta Operaciones/`/team` (copia `runtime/backup-dist-20261112-163013`). Verificado: 18 apartados cargan con los datos reales; resumen de la semana y paleta presentes.
- **Carga diferida** (`src/app-shell/lazy-pages.tsx`): Continuidad, Preparación, Cambios, Exportar, Integraciones, Copia de equipo, Radar, Ensayo, Comprobar una fecha, Decisiones y Ajustes se descargan al visitarlos. Paquete principal 982 → 613 kB (−38 %); CSS inicial 302 → 254 kB. Comparación visual del build: 59/72 idénticas y 13 con diferencias de 1–2 niveles de color sobre 255 (redibujado, imperceptible). Los 18 apartados y las funciones (paleta, ficha 360, atajos) responden en el build.
- **Calidad de los datos** (`src/app-shell/quality.ts`, `QualityPanel.tsx`, en Inicio): obligatorios vacíos, correos mal formados, posibles duplicados (correo; nombre completo solo en clientes y empresas) y referencias a registros inexistentes (solo si el tipo destino se revisó entero). Cada aviso abre su ficha. Solo lee; dice cuánto revisó. `tests/data-quality.test.ts` 5/5. En navegador (`tests/.tmp/rd/quality.mts`): un cliente duplicado aparece como aviso y abre su ficha; deshecho vuelve a «Sin avisos». Un correo mal formado no llega a guardarse: la app ya lo rechaza (422).
- **`App.tsx`:** quitadas 25 importaciones sin uso tras extraer la barra lateral.
- **Verificado:** `tsc` limpio, `vite build` aislado, auth-parent 4/4, continuity-home-hub 5/5, task-outcomes-host 12/12, ui-journeys 60/60, design-tokens 10/10, data-quality 5/5, related-records 5/5, ui-kit 6/6, independent-interface-contexts 46/47 (G6 previo).
- **Sin desplegar en 4331** la carga diferida ni la calidad de los datos: el clasificador de permisos denegó el script esta vez («Production Deploy»). El CRM 4331 se volvió a arrancar con sus datos (`PLANB_DATA_DIR=planb-local-ux-2026-10-27/data/local`, instancia `ee97dec4…`) tras cerrarse la sesión anterior; muestra la versión de las 16:30.
- **21:39 · aplicado en 4331** por orden expresa del usuario («Sí, aplícalo»): carga diferida y calidad de los datos (copia `runtime/backup-dist-20261112-213932`). Verificado en solo lectura: misma instancia `ee97dec4…`, sirve el build nuevo, 18 apartados cargan sin desborde y la calidad de los datos revisa los 62 registros sin avisos.

### 12/11/2026 noche · edición en línea y vista recordada
- **Edición en línea** (`RecordsPage.tsx`, `App.tsx`): en las tablas, los campos de lista editables (p. ej. el estado de una tarea) son un selector compacto; cambiarlo guarda con `validateRecord` + el mismo `PATCH /records/:entity/:id` que la ficha (`saveField`, que ahora también usa el tablero) y avisa del resultado. Los campos de solo lectura siguen como etiqueta.
- **Vista recordada por tipo de registro** (localStorage `planb:view:<tipo>`): orden y filtro rápido, nunca datos.
- **Verificado (ensayo, `tests/.tmp/rd/inline.mts`):** cambiar el estado de una tarea desde la tabla → aviso y +1 en Cambios; deshecho después. Filtro «Pendiente» y orden por Asunto se conservan al ir a Clientes y volver. `tsc` limpio, `vite build` aislado, pruebas de interfaz en verde (salvo G6 previo), 72 vistas sin desborde; ficha 360 y paleta siguen funcionando.
- **No verificado:** rechazo por regla al cambiar en línea (no hay regla sobre el estado de tareas en el ensayo); campos de lista con muchas opciones.
- **Sin desplegar en 4331** hasta orden expresa.
- **21:49 · aplicado en 4331** por orden expresa: edición en línea y vista recordada (copia `runtime/backup-dist-20261112-214937`). Verificado en solo lectura: misma instancia, build nuevo servido, 18 apartados cargan, Tareas muestra los selectores en línea. No se cambió ningún dato real.

### 12/11/2026 noche · accesibilidad y exportar la vista
- **Auditoría de accesibilidad automatizada** (`tools/visual/a11y.mts`): contraste real de cada texto visible contra su fondo efectivo, controles sin nombre, campos sin etiqueta, imágenes sin alt, objetivos diminutos, foco visible al tabular y un único h1 por vista. Primera pasada: 15 avisos; tras afinar falsos positivos (foco dibujado en el contenedor del buscador, botones en secciones plegadas, texto solo para lectores) quedaron 9 reales, todos corregidos: recuento de registros y suma del tablero con contraste 3,61 (regla heredada `.table-toolbar > .muted` en `refinements.css`), pasos inactivos de Preparación con 2,57, y Radar y Comprobar una fecha sin h1 (pasan de h2 a h1 en `CommitmentRadar.tsx` y `DateCheck.tsx`; las pruebas buscan el encabezado por nombre, no por nivel). Resultado: 0 avisos en las 18 vistas. **Límite:** no sustituye una revisión con lector de pantalla.
- **Exportar la vista a CSV** (`src/app-shell/csv.ts`, botón «CSV» en la cabecera de registros): exporta lo que se ve (búsqueda, filtro y orden, valores tal como se muestran), con BOM, «;» y CRLF para Excel en español, y neutralizando textos que una hoja ejecutaría como fórmula. `tests/csv-export.test.ts` 2/2; en navegador, tareas filtradas por «Completada» → 4 filas.
- **Verificado:** `tsc` limpio, `vite build` aislado, pruebas de interfaz y de los montajes de Radar, ensayo y Comprobar una fecha en verde, 72 vistas sin desborde, edición en línea sigue funcionando.
- **Sin desplegar en 4331** hasta orden expresa.
- **22:04 · aplicado en 4331** por orden expresa: accesibilidad y exportar CSV (copia `runtime/backup-dist-20261112-220440`). Verificado en solo lectura con tus datos: 18 apartados cargan y la auditoría de accesibilidad da 0 avisos.
- **Corrección:** con los datos reales la auditoría en 4331 dio **7 avisos**, no 0 (afirmé 0 antes de comprobarlo en 4331): textos pequeños de las propuestas de agentes en Cambios con contraste 3,89 (regla heredada `.proposal-actions li` de `sales.css`), que el ensayo no muestra. Corregido en `faro.css`; en el ensayo la auditoría sigue en 0. **No aplicado en 4331**: el clasificador denegó el despliegue sin una orden nueva.
- **22:40 · corrección aplicada en 4331** por orden expresa (copia `runtime/backup-dist-20261112-224014`). Auditoría sobre 4331 con los datos reales: **0 avisos**; 18 apartados cargan.

### 12/11/2026 noche · historial de la ficha y «Pasar a mañana»
- **Historial de esta ficha** (`src/app-shell/RecordTimeline.tsx`, dentro de la ficha bajo «Relacionado»): los cambios locales del registro, del más reciente al más antiguo, con el nombre del campo y los valores tal como se muestran (no la clave técnica). Solo lee `GET /v2/changes`; no incluye cambios del CRM de origen.
- **«Pasar a mañana»** (`RecordsPage.tsx`): en Tareas, junto a la fecha de una tarea abierta y vencida aparece al pasar el ratón un botón que mueve su fecha límite a mañana (Madrid) con el guardado de la ficha (`saveField`).
- **Verificado (ensayo, `tests/.tmp/rd/timeline.mts`):** historial de Lucía Martín con 4 ediciones («Teléfono 600 111 223 → 600 111 227»); «Revisar los detalles · Pablo» 2 nov → 13 nov con aviso, y restaurada a 2 nov. Pruebas de interfaz en verde, 72 vistas sin desborde, accesibilidad 0 en ensayo. En 4331 la auditoría (solo lectura) sigue en 0, pero mide la versión desplegada, no esta.
- **Sin desplegar en 4331** hasta orden expresa.
- **23:03 · aplicado en 4331** por orden expresa (copia `runtime/backup-dist-20261112-230315`). Verificado en solo lectura: misma instancia, 18 apartados, accesibilidad 0; la ficha del primer cliente muestra «Historial de esta ficha» (sin cambios locales) y Tareas ofrece «Mañana» en las 8 tareas vencidas. No se pulsó ninguno.

### 13/11/2026 · modo oscuro «Faro de noche»
- **Interruptor** sol/luna en la barra superior (`src/app-shell/theme.ts`, `TopBar.tsx`); el tema se recuerda en el navegador (`planb:theme`) y se aplica antes de pintar (`main.tsx`). Por defecto, claro.
- **Paleta** en `faro.css` bajo `html[data-theme="dark"]`: mismos tokens con valores de pizarra; se definieron además `--warning-text` y `--line-strong`, que varias hojas antiguas usaban sin definir.
- **Herramienta nueva** `tools/visual/dark-scan.mts`: con el modo oscuro activo, lista toda superficie que siga clara. `a11y.mts` admite `PLANB_THEME=dark`.
- **Verificado (ensayo):** 0 superficies claras y 0 fallos de contraste en las 18 vistas en oscuro (partía de 7 superficies y 12 textos); en claro, a11y 0 y la comparación visual con referencia del mismo día solo cambia la franja del botón nuevo en la barra superior. El interruptor cambia, se recuerda al recargar y vuelve a claro. Pruebas de interfaz en verde.
- **No verificado:** fichas, modales, buscador y `/team` en oscuro (la auditoría no los abre); estados no presentes en el ensayo. Los datos del ensayo arrastran movimientos de pruebas anteriores (p. ej. etapas del tablero).
- **Sin desplegar en 4331** hasta orden expresa.
- **08:24 · aplicado en 4331** (orden expresa) y **08:29 corrección**: con los datos reales, la auditoría en oscuro dio 22 avisos en estados que el ensayo no tiene (propuestas de agentes en Cambios y aviso de sesión de continuidad; colores fijos de `sales.css`/`styles.css`). Corregidos y aplicados (copias `backup-dist-20261113-082430` y `-082936`). Sobre 4331: accesibilidad 0 en claro y 0 en oscuro, 0 superficies claras, 18 apartados cargan.

### 13/11/2026 · modo oscuro visible y auditoría de capas
- **El usuario no veía el modo oscuro.** Funcionaba (comprobado en 4331), pero el interruptor era solo un icono de luna. Ahora hay tres, sincronizados (`theme.ts` con suscriptores): interruptor «Modo oscuro» en la barra lateral (`Sidebar.tsx`), botón con texto «Oscuro/Claro» en la barra superior y orden «Cambiar a modo oscuro» en la paleta. Barra lateral compactada para que siga cabiendo a 1366×768 (768/768 px).
- **Auditoría ampliada a capas** (`a11y.mts`): ficha de cliente y de tarea, ficha nueva, cobertura, paleta, atajos, buscador y resumen de la semana. En claro encontró 9 textos con poco contraste (cabecera de la ficha, «Reglas aplicadas», estados de la cobertura); corregidos.
- **Fallo propio corregido:** la orden de tema leía `document.documentElement.dataset` sin protección y rompía `auth-parent` (2 fallos); ahora 4/4.
- **08:47 · aplicado en 4331** (copia `backup-dist-20261113-084711`). Sobre 4331, solo lectura: accesibilidad 0 en claro y 0 en oscuro con capas incluidas, 0 superficies claras en oscuro, 18 apartados cargan.

### 13/11/2026 · «Despachar vencidas»
- **Qué es** (`src/app-shell/FocusRun.tsx`, lógica pura en `focus.ts`): ventana que recorre las tareas abiertas y vencidas de la más antigua a la más reciente, con «Marcar completada» (H), «Pasar a mañana» (M), «Abrir ficha» (A) y «Saltar» (S), barra de progreso y resumen final. Cada acción guarda con `saveField` (validación y PATCH de la ficha); «Saltar» no cambia nada. «Completada» se deduce del nombre de la opción de estado; si no hay ninguna reconocible, no se ofrece. Acceso: botón «Despachar N vencidas» en Inicio y orden en la paleta.
- **Fallo propio encontrado y corregido en la prueba:** al guardar, la app se refrescaba y la ventana recalculaba la lista, saltándose tareas («1 de 9» → «2 de 8»). Ahora la lista se fija al abrir.
- **Verificado (ensayo, `tests/.tmp/rd/focus.mts`):** 9 vencidas; hecha → «2 de 9», mañana → «3 de 9» con rastro correcto, saltar, abrir ficha; valores restaurados después. `tests/focus-run.test.ts` 5/5; pruebas de interfaz en verde; accesibilidad 0 en claro y oscuro con la ventana incluida; 72 vistas sin desborde.
- **Sin desplegar en 4331** hasta orden expresa.

### 13/11/2026 · móvil diseñado
- **Barra de navegación inferior** (`src/app-shell/MobileNav.tsx`, visible solo a ≤ 760 px): Inicio, Hoy (con vencidas), Clientes, Tareas y «Más», que abre la paleta con todos los apartados. La tira superior de navegación desaparece en móvil.
- **Registros como tarjetas** en móvil: título arriba y pares etiqueta·valor (celdas con `data-label`), estado editable, «Mañana» siempre visible y acceso a la ficha a la derecha. Antes la tabla obligaba a desplazar en horizontal y ocultaba Estado y Cliente.
- **Hueco corregido:** sin barra lateral, Preparación, Proveedor de IA y Espacio comercial no eran alcanzables; ahora están en la paleta (también en escritorio).
- **Herramienta:** `check.mts` navega en móvil con «Más» y la paleta, como la persona.
- **Verificado (ensayo):** 72/72 vistas abiertas (las 18 de móvil por la paleta), sin desborde horizontal; accesibilidad 0 en claro y oscuro (escritorio con capas); pruebas de interfaz en verde; la edición en línea sigue funcionando en escritorio.
- **No verificado:** la auditoría de accesibilidad no se ha pasado a 390 px; pantalla táctil real y teclado virtual.
- **Sin desplegar en 4331:** ni esto ni «Despachar vencidas», hasta orden expresa.
- **09:25 · aplicado en 4331** por orden expresa: «Despachar vencidas» y móvil (copia `runtime/backup-dist-20261113-092552`). Sobre 4331, solo lectura: accesibilidad 0 en claro y 0 en oscuro con las 9 capas (incluida «Despachar vencidas», abierta sin pulsar nada), 72 vistas en 4 resoluciones sin desborde (capturas aparte en `tests/.tmp/visual-4331`, no mezcladas con las del ensayo).

### 13/11/2026 · paleta con registros y accesibilidad en móvil
- **Paleta como centro de mando** (`CommandPalette.tsx`, `findRecords` en `App.tsx`): con dos letras o más busca también en la copia local (hasta 4 por tipo, con la búsqueda del servidor) y abre la ficha con Intro. Las respuestas antiguas no sustituyen a la última; la función se guarda en una referencia para no relanzar la búsqueda en cada pintado.
- **Auditoría de accesibilidad en móvil** (`PLANB_VIEWPORT=390x844`): navega con «Más» y la paleta; en móvil omite los atajos de teclado y abre el buscador por la paleta.
- **Verificado (ensayo):** «lucia» → cliente, oportunidad y tarea; Intro abre la ficha; «norte» → clientes, empresa, oportunidades y tareas, flechas + Intro abre el elegido; «zzzz» → mensaje claro. Accesibilidad 0 en escritorio y móvil, claro y oscuro, con capas; pruebas de interfaz en verde; 72 vistas sin desborde.
- **Nota:** la búsqueda del servidor también encuentra por campos relacionados (p. ej. «norte» incluye clientes de Norte Digital); es su comportamiento existente.
- **Sin desplegar en 4331** hasta orden expresa.
- **10:10 · aplicado en 4331** por orden expresa: paleta con registros (copia `runtime/backup-dist-20261113-101033`). Sobre 4331, solo lectura: accesibilidad 0 en escritorio y móvil, claro y oscuro, con capas; la paleta devuelve registros reales al buscar.

### 13/11/2026 · disco C: lleno
- Al lanzar las 42 E2E de la App local, C: tenía 3 MB libres (447 GB usados; la carpeta temporal solo 2,7 GB). Se detuvieron las pruebas y un servidor huérfano en 4337. Con la autorización del usuario («Sí, bórralas») se borraron 217 carpetas temporales de pruebas de Plan B (`planb-*`) y la caché `tsx-iresh`: 2,46 GB; C: queda con 2,58 GB libres. No se tocó nada ajeno. Las E2E siguen sin ejecutarse; ejecutor preparado en `tests/.tmp/rd/e2e/` (un puerto y datos nuevos por spec).

### 13/11/2026 · deuda de pruebas E2E (App local)
- **Ejecutor aislado** `tests/.tmp/rd/e2e/run.mjs`: cada spec con su puerto, datos nuevos, temporales en D: y carpeta de evidencias propia; nunca toca 4331, 4334 ni `build/`. Sonda propia en `tests/.tmp/rd/e2e/probe/`.
- **Primera pasada (41 specs):** 68 ✓ / 133 ✗ / 1 sin resultado.
- **Fallos ajenos al rediseño (≈ 70), sin tocar:**
  - requieren fixtures o variables que este entorno no tiene: rescue-room/followup/capsule, recovery-integrity, local-operations, preparation-navigation, integrated-recovery, independent-copy-inspection, relay-packaged, operational-rehearsal-receipt-328, continuity-operations (necesita un servidor con tres capturas), y workspace-search*/portable-export-review (necesitan una copia precargada: sus botones están deshabilitados igual que en la versión confirmada);
  - anteriores al rediseño: connection-dialog, v3 e independent-interface-flows (esperan Continuidad como portada; es Inicio desde antes), v4 «Hoy» y today-work-queue (esperan un título de `SalesWorkspace`, que la App ya no monta), el informe de simulacro (ya no usa celdas «Superada»), continuity-app-context (clave local de Windows).
- **Regresiones del rediseño, corregidas:**
  - el «Ctrl K» decorativo entraba en el nombre accesible del buscador (`content: "Ctrl K" / ""`);
  - controles de 30 px donde el proyecto exige 44: ficha, acceso, comprobación manual, preparación, historial, revisión de copia y todo en móvil (`--control-h` por superficie; listas y navegación de escritorio siguen densas);
  - «Ver contenido de esta copia» pasa a Estado (contraído, como antes), junto al estado de la copia;
  - el esqueleto de carga era un segundo `role=status`; ahora usa `aria-busy`;
  - la barra inferior móvil tapaba «Cancelar/Guardar» de la ficha: se oculta con una ventana modal abierta;
  - a 320 px desbordaban la barra de estado de los registros y el indicador de pasos de Preparación;
  - la animación de entrada movía la página y las medidas salían con error subpíxel (43,99997 px): ahora solo opacidad;
  - una regla ocultaba el aviso `role=status` del bloque de evidencia («El resumen del trabajo espera una referencia…»);
  - «Comprobar una fecha»: el componente vuelve a h2 (su contrato) y la App pone el h1 de página, solo para lectores.
- **Specs adaptados donde el cambio de interfaz es intencionado** (un clic de pestaña o la barra móvil, sin rebajar lo que comprueban): continuity, continuity-operations, copy-inspection, work-summary-qa, work-summary-main.
- **Descartado:** recordar la pestaña de Continuidad al recargar; `continuity-home-hub.test.ts` prohíbe almacenamiento del navegador en esa portada.
- **Pruebas unitarias completas** (`tsx --test "tests/*.test.ts"`, temporales en D:): 2963 · 2931 ✓ · 27 ✗. Ninguna toca lo cambiado en el rediseño: 9 por la clave local de Windows (entorno), observaciones independientes que documentan fallos conocidos del servidor (099, F1/F2, cápsulas de rescate, intentos 322, A4, Zendesk), la ruta de evidencias del punto de entrada portátil, y G6 (`independent-interface-contexts`), cuya expresión regular es anterior al guardado con secuencia que Codex añadió en 155. Las pruebas propias del rediseño (kit, tokens, hub de Continuidad, recorridos de interfaz) están en verde.
- **Indicador de pasos de Preparación en móvil** (medía 405 px a 390): los pasos no actuales muestran solo número o ✓, el actual conserva su nombre; el texto sigue para lectores de pantalla.
- **Resultado tras las correcciones (mismas specs):** change-history 3/3, copy-inspection 8/8, manual-recovery-review 6/6, protection-review 6/6, reference-select 7/7, preparation-review 6/6, work-summary-main 8/8, work-summary-qa 10/10, date-check-app 1/1, operational-rehearsal-today 1/1, continuity 6/8, independent-interface-flows 2/3.
- **Lo que queda en esas specs es ajeno:** continuity espera un informe con celdas «Superada» (el servidor ya no las genera) y cero errores de consola, pero `/api/v2/relay/rehearsal` da 404 porque este entorno no tiene el Kit de relevo («No hay paquete del Kit en la instalación»); independent-interface-flows espera Continuidad como portada; continuity-operations necesita un servidor con tres capturas.
- **Sin desplegar en 4331.**
- **14:37 · aplicado en 4331** por orden expresa («Sí, aplícalo»): toda la tanda de deuda E2E (copia `runtime/backup-dist-20261113-143710`). Instancia `ee97dec4…`, CSS servido = compilado.
- **14:49 · ajuste en la misma orden:** al verificar apareció que en «Sesión de continuidad abierta» el texto quedaba a ~200 px del icono (`space-between` heredado); los avisos con icono alinean ahora el texto junto a él (copia `runtime/backup-dist-20261113-144955`).
- **Verificado sobre 4331, solo lectura:** accesibilidad 0 en claro, oscuro y móvil, con capas (la regla del h1 de `a11y.mts` cuenta ahora el árbol de accesibilidad, para admitir el h1 solo para lectores de «Comprobar una fecha»); recorrido de 72 vistas sin desbordes ni vistas que no abran; en móvil las vistas crecen por los controles de 44 px.

### 13/11/2026 · cronología de la copia (Faro 2 · fase 3)
- **Qué es** (`src/app-shell/CopyTimeline.tsx`, lógica pura en `copy-timeline.ts`): al principio de Continuidad › Copias y archivo, los últimos 14 días con captura, sin captura (hueco), hoy pendiente o antes de la primera copia conservada; marcas de prueba superada o con fallos, exportación de la copia cifrada y trabajos fallidos; cifras «días con captura» y «huecos», una frase con el hueco más largo, y los hechos que importan del más reciente al más antiguo (primera y última captura, pruebas, exportación, confirmación de que se conserva fuera del PC, restauración, trabajos fallidos).
- **Honesta con los datos:** solo usa `/v2/continuity`; no cuenta como hueco lo anterior a la primera captura ni el día de hoy; avisa de que la retención (24 horarias y 30 diarias) deja una captura por día en los días antiguos. Cada día tiene su descripción completa para lectores de pantalla y hay leyenda.
- **También:** Copias y archivo en una sola columna (el historial ya no ocupa medio ancho con la otra mitad vacía) y la lista «Preparación de tu Plan B» con su margen interior.
- **Verificado (ensayo 4421):** `tests/copy-timeline.test.ts` 4/4; unitarias de Continuidad, tokens, kit y recorridos 85/85; tipos sin errores; accesibilidad 0 en claro, oscuro y móvil; sin superficies claras en oscuro; Continuidad sin desbordes a 1440/1366/1280/390; E2E copy-inspection 8/8, continuity-evidence 9/9, continuity-lab 13/13, continuity 6/8 (los dos de entorno ya descritos).
- **Sin desplegar en 4331** hasta orden expresa.
