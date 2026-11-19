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
- **15:40 · aplicado en 4331** por orden expresa (copia `runtime/backup-dist-20261113-154057`). Instancia `ee97dec4…`, CSS servido = compilado. Sobre 4331, solo lectura: accesibilidad 0 en claro, oscuro y móvil; sin superficies claras en oscuro; Continuidad sin desbordes a cuatro medidas.
- **Visto con los datos reales:** una sola captura (27 oct) y 13 días sin captura; es cierto, pero los servicios están en pausa, así que esos huecos no son fallos: no se pidió ninguna captura. Siguiente mejora propuesta: que la cronología lo diga (usar `operations.paused`, `schedule.enabled` y `connected`, que ya llegan en `/v2/continuity`) y muestre la antigüedad de la última captura.

### 13/11/2026 · la cronología distingue «detenidas» de «hueco»
- **Por qué:** en 4331 marcaba 13 huecos en ámbar cuando no se había pedido ninguna captura (sesión de continuidad abierta y servicios en pausa).
- **Qué cambia** (`copy-timeline.ts`, `CopyTimeline.tsx`): `captureAutomation()` reproduce las condiciones de `ContinuityService.tick()` (paquete portátil, plan de recuperación inválido, sesión de continuidad, servicios en pausa, programación desactivada) y da el primer motivo. Con las capturas detenidas, los días posteriores al último intento o a la última captura son «sin intentos» (rayados, neutros) y no cuentan como huecos; el día del último intento sin captura sigue siendo hueco. Nueva cifra «Última captura» (hoy, ayer, hace N días; ámbar a partir de 2 días), línea «Capturas automáticas activas · una por hora» o «detenidas» con «Revisar en Estado» (cambia de pestaña y deja el foco en «Estado»).
- **Comprobado con los datos reales de 4331 (GET de `/v2/continuity`, copia local borrada después):** motivo «Hay una sesión de continuidad abierta», 14 días sin intentos, 0 huecos, última captura hace 17 días.
- **Verificado (ensayo 4421):** `copy-timeline.test.ts` 6/6; unitarias relacionadas 87/87; tipos sin errores; accesibilidad 0 en claro, oscuro y móvil; sin superficies claras en oscuro; sin desbordes en Copias a cuatro medidas; E2E copy-inspection 8/8, continuity-evidence 9/9, continuity-lab 13/13, continuity 6/8 (los dos de entorno).
- **Disco C:** quedó con 222 MB libres. No es la carpeta temporal (32 MB recientes) ni procesos huérfanos: `pagefile.sys` mide 2,75 GB (Windows lo amplía con presión de memoria). No se ha borrado nada.
- **Sin desplegar en 4331** hasta orden expresa.
- **17:08 · aplicado en 4331** por orden expresa (copia `runtime/backup-dist-20261113-170758`). Instancia `ee97dec4…`, paquete servido = compilado. Sobre 4331, solo lectura: accesibilidad 0 en claro, oscuro y móvil; sin superficies claras en oscuro; Continuidad sin desbordes. La cronología muestra «Capturas automáticas detenidas», «Hay una sesión de continuidad abierta…», última captura hace 17 días, 0 huecos y 14 días sin intentos. C: volvió a 2,1 GB libres.

### 13/11/2026 · avisos de la copia en Inicio y en el menú (Faro 2 · fase 3)
- **Qué es** (`src/app-shell/continuity-alerts.ts`): una función pura que, con `/v2/continuity`, dice lo que haría inútil el Plan B el día que haga falta: plan de recuperación inválido, sin copia, copia antigua (aviso desde lo que el servidor marca como antigua; grave desde 7 días), capturas automáticas detenidas (motivo de `captureAutomation()`), prueba fallida (grave), sin probar, caducada o bloqueada, y copia cifrada ausente, desfasada o sin confirmar. Lo grave primero.
- **Dónde se ve:** insignia en «Continuidad» del menú (número de avisos; ámbar `#9a5b00`, roja si alguno es grave; `aria-hidden` con los títulos en `title`, sin cambiar el nombre accesible del botón) y lista dentro de «Tu copia de seguridad» en Inicio (sin repetir lo que ya dice el título de la tarjeta), cada aviso con un botón que lleva a donde se arregla: la pestaña de Continuidad que toca (Estado o Copias) o Exportar, con el foco en esa pestaña o en el contenido.
- **Sin lecturas nuevas:** Inicio y Continuidad entregan a la App el estado que ya leen; la App solo vuelve a pintar si los avisos cambian.
- **Verificado:** `tests/continuity-alerts.test.ts` 6/6 (incluido el caso real de 4331); unitarias relacionadas 97/97; tipos sin errores; en el ensayo: 3 avisos en Inicio + insignia 4, cada botón abre su destino con el foco correcto, ninguna escritura; accesibilidad 0 en claro, oscuro y móvil; sin superficies claras en oscuro; Inicio sin desbordes. Con el estado real de 4331 (GET, copia borrada) saldrían: «La copia tiene 17 días» (grave), capturas detenidas por la sesión abierta, copia sin probar y sin copia cifrada fuera del PC.
- **E2E:** continuity 6/8 (los dos de entorno), copy-inspection 8/8, date-check-app 1/1, operational-rehearsal-today 1/1, change-history 3/3, auth-parent 3/3. work-summary-qa da 8 o 9 de 10 y el test que falla cambia en cada pasada (espera de 5 s a la evidencia de la copia, que sí llega); con la conexión de avisos desactivada da lo mismo (8/10 dos veces), así que no la causa; probablemente lentitud del equipo (memoria). Antes de la cronología daba 10/10; no está demostrado que sea solo el entorno.
- **Sin desplegar en 4331** hasta orden expresa.
- **18:31 · aplicado en 4331** por orden expresa (copia `runtime/backup-dist-20261113-183142`). Instancia `ee97dec4…`, paquete servido = compilado. Sobre 4331, solo lectura: insignia roja «4» en Continuidad (lo grave: copia de 17 días); en Inicio, capturas detenidas por la sesión abierta, copia sin probar y sin copia cifrada fuera del PC; cada botón abre su destino con el foco correcto; ninguna escritura; sin desborde a 390; accesibilidad 0 en claro, oscuro y móvil; sin superficies claras en oscuro.

### 13/11/2026 · vistas de las listas (Faro 2 · fase 2)
- **Qué es** (`src/app-shell/saved-views.ts`, fila «Vistas» en `RecordsPage.tsx`):
  - vistas inteligentes según los campos que la especificación tiene de verdad: Tareas «Vencidas», «Para hoy», «Sin fecha» (sin contar las cerradas); Oportunidades «Más de 3.000 €», «Sin importe»; Clientes y Empresas «Sin correo», «Sin teléfono». Cada una con su recuento en la página cargada; si falta el campo, no aparece;
  - vistas guardadas: búsqueda, filtro rápido, orden y vista inteligente con un nombre (máx. 8 por tipo, en este navegador; nunca datos de registros); se aplican con un clic, se marcan cuando lo que ves coincide y se borran con su ×; el formulario resume lo que se guarda;
  - honestidad: si hay más páginas, el recuento dice «N de 50 cargados (164 en total)» y una nota explica que la búsqueda sí llega a todos.
- **Verificado (ensayo 4421):** `tests/saved-views.test.ts` 5/5; unitarias relacionadas 105/105; tipos sin errores; recorrido real: «Vencidas» 9 de 18, guardar «Mis vencidas», recargar, aplicar (vuelven filtro y orden), borrar; ninguna escritura al servidor; accesibilidad 0 en claro, oscuro y móvil; sin superficies claras en oscuro; listas sin desbordes a 1440/1366/1280/390; chips de 44 px en móvil. E2E: continuity 6/8, reference-select 7/7, independent-interface-flows 2/3, task-focus-compact-receipt 1/1, auth-parent 3/3, v4 1/2 (fallos ya clasificados).
- **work-summary-qa** vuelve a 10/10 con el equipo menos cargado y con la cronología y los avisos incluidos: los fallos intermitentes eran lentitud.
- **Sin desplegar en 4331** hasta orden expresa.
- **19:09 · aplicado en 4331** por orden expresa (copia `runtime/backup-dist-20261113-190950`). Instancia `ee97dec4…`, paquete servido = compilado. Sobre 4331, solo lectura (las vistas de la prueba vivieron en un navegador desechable): «Vencidas» 9 de 18, guardar, recargar, aplicar (filtro y orden) y borrar; Oportunidades «Más de 3.000 €» 6; ninguna escritura al servidor; sin desborde a 390 y chips de 44 px; accesibilidad 0 en claro, oscuro y móvil; sin superficies claras en oscuro; listas sin desbordes a cuatro medidas.

### 13/11/2026 · estado de carga común (Faro 2 · fase 1, «estados»)
- **Inventario:** ~50 textos de carga en 26 archivos; muchos los buscan las E2E literalmente, así que no se cambia ni un texto, rol ni elemento.
- **Qué cambia:** clase `ui-loading` (solo CSS, en `faro.css`): indicador que gira delante del texto y tres líneas con la forma del contenido que llega (una en tarjetas laterales, `ui-loading-sm`); tono propio `--ui-skel` en claro y oscuro; sin animación con movimiento reducido. Se pone solo mientras carga (en los párrafos que también muestran un error, la clase depende del estado).
- **Dónde:** Hoy (copia local y cola de trabajo), Integraciones (estado de la instalación y catálogo), Radar (comprobación y lectura), Comprobar una fecha (semana de ensayo), Ensayar mi semana, e Inicio (fechas de la semana, Radar y «Tu siguiente paso»).
- **Verificado (ensayo 4421, respuestas retrasadas 4 s en un navegador de prueba):** los once estados se ven en claro y en oscuro (capturas en `tests/.tmp/rd/loading-*.png`); tipos sin errores; unitarias relacionadas 98/98; accesibilidad 0 en claro, oscuro y móvil; sin superficies claras en oscuro; E2E date-check-app 1/1, operational-rehearsal-today 1/1, operational-rehearsal-app 1/1, commitment-report-responsive 3/3, independent-source-status-row 3/3, task-focus-compact-receipt 1/1, continuity-lab 13/13, work-summary-main 8/8.
- **Pendiente de esta línea:** estados vacíos y de error comunes, y los textos de carga de `/team` y de los diálogos.
- **Sin desplegar en 4331** hasta orden expresa.
- **14/11 10:29 · aplicado en 4331** por orden expresa (copia `runtime/backup-dist-20261114-102957`). El equipo se reinició a las 10:24 y eso cerró 4331 y 4421 (código 4, no un fallo); 4331 se volvió a arrancar como siempre, con su carpeta de datos, y responde con la instancia `ee97dec4…` y el paquete compilado. Sobre 4331, solo lectura: los once estados de carga se ven en claro y oscuro (respuestas retrasadas solo en el navegador de prueba); accesibilidad 0 en claro, oscuro y móvil; sin superficies claras en oscuro. C: vuelve a tener 3 GB libres tras el reinicio.

### 14/11/2026 · parte de continuidad para compartir (Faro 2 · fase 3)
- **Qué es** (`src/app-shell/continuity-report.ts`, botón «Parte para compartir» en la cabecera de Continuidad): una página HTML autónoma (sin scripts ni recursos externos) que dice qué está demostrado y qué no: copia conservada, prueba en entorno aparte, copia cifrada fuera del PC y capturas automáticas, cada una con su veredicto (demostrado, con reservas, pendiente); contenido de la copia en recuentos; últimos 14 días; avisos abiertos; y lo que el parte no acredita. Sin nombres de clientes ni identificadores de captura o cuenta. Se genera en el navegador con el estado ya leído; no envía nada.
- **Verificado (ensayo 4421, que se volvió a arrancar tras el reinicio):** `tests/continuity-report.test.ts` 4/4 (incluye que el HTML no lleve nombres, IDs, scripts ni enlaces y que escape el texto); unitarias relacionadas 97/97; descarga real `plan-b-parte-continuidad-2026-11-14.html`, abierta sin red, sin desborde a 390; ninguna escritura; accesibilidad 0 en claro, oscuro y móvil; Continuidad sin desbordes; E2E continuity 7/8, continuity-lab 13/13, continuity-evidence 9/9, copy-inspection 8/8.
- **Coordinación:** a las 10:47 Codex reservó `CODEX-CAPTURE-AUTOMATION-350` sobre `copy-timeline.ts`, `CopyTimeline.tsx`, `continuity-alerts.ts`, `continuity-report.ts` y `tests/continuity-alerts.test.ts` (conexión ausente no puede contar como activa; un fallo posterior al último éxito debe avisar; no exportar mensajes internos) y los está editando. Claude no vuelve a tocar esos archivos. **No se propone desplegar** hasta que Codex presente y se revise 350, porque una compilación ahora mezclaría su trabajo a medias.

### 14/11/2026 · estado vacío común (Faro 2 · estados)
- **Qué cambia:** clase `ui-empty` (solo CSS, sin tocar textos, roles ni estructura) con dos tonos: neutro, «no hay datos» (marco discontinuo y círculo vacío), y `ui-empty-ok`, «todo en orden» (fondo de éxito y ✓).
- **Dónde:** Radar sin copia de ensayo (dos sitios), «Nada pide una decisión ahora», historial de capturas vacío, Inicio («No hay tareas vencidas…», «No hay compromisos abiertos») y la cola de Hoy (✓ solo si no hay tareas abiertas; neutro si es una búsqueda sin resultados o si faltan tareas por recibir).
- **Cuidado de honestidad:** el ✓ de «todo en orden» solo aparece si hay copia (Inicio) o copia activa (Hoy); en una instalación sin datos, el mismo texto sale en tono neutro. Se vio en una instalación nueva con la sonda.
- **Las notas cortas dentro de una sección** («Sin cambios de campos.», etc.) no se convierten en recuadros.
- **Verificado:** tipos sin errores; unitarias relacionadas 86/86; accesibilidad 0 en claro, oscuro y móvil; sin superficies claras en oscuro; muestras de los dos tonos en claro y oscuro; E2E continuity 7/8, continuity-lab 13/13, commitment-report-responsive 3/3, operational-rehearsal-today 1/1, date-check-app 1/1, work-summary-main 8/8.
- **Sin tocar los archivos reservados por Codex (350).** **Sin desplegar:** la compilación incluiría el trabajo a medias de Codex en esos archivos; conviene esperar a que presente 350.
- **Codex presentó 350** (en revisión). Los seis archivos en disco coinciden con lo presentado; 23/23 pruebas de cronología, avisos, parte y hub; compilación nueva que los incluye; en el ensayo, avisos e insignia como antes, parte sin scripts ni enlaces y sin desborde, accesibilidad 0. `tsc` señala un error en `tests/capture-retry-continuity-352.test.ts` (prueba nueva de Codex, otra tarea); no afecta a la compilación de la interfaz.
- **14/11 11:07 · aplicado en 4331** por orden expresa: estado vacío común + parte para compartir + la entrega 350 de Codex (en revisión), con autorización expresa del usuario para incluirla (copia `runtime/backup-dist-20261114-110737`). Antes se comprobó que ningún archivo de `src/` o `shared/` era más nuevo que la compilación. Sobre 4331, solo lectura: insignia roja «4» (copia de 18 días), ninguna escritura, sin desborde a 390; parte descargado sin scripts ni enlaces, con los cuatro veredictos esperados (copia con reservas, prueba y copia cifrada pendientes, capturas detenidas por la sesión abierta); accesibilidad 0 en claro y oscuro; Inicio, Continuidad y Hoy sin desbordes. La copia local del parte generado con datos reales se borró tras revisarla.

### 14/11/2026 · primer uso (Faro 2 · fase 4)
- **Antes:** quien abría Plan B sin copia veía «Esto es lo que importa hoy» sobre un tablero vacío (semana con «—», «Qué atender» sin nada y tres tarjetas que repetían «Ir a Continuidad»), y la frase de la semana empezaba por «. Pulsa un punto…».
- **Ahora** (`src/app-shell/FirstRun.tsx`; Inicio sin copia y fuera del paquete restaurado): «Bienvenido a Plan B.» y tres pasos que siguen su propio estado: proteger el acceso (✓ si ya hay contraseña), preparar la primera copia (abre Preparación) y probarla («Disponible cuando haya una copia»); el paso actual con botón principal y enlace a Continuidad. Con copia, Inicio vuelve al tablero de siempre. La frase de la semana ya no deja el «. Pulsa…» suelto.
- **Hallado y corregido al comprobarlo:** el primer paso de Preparación (solo sin copia) tenía 7 textos por debajo de AA (3,25–4,45; colores de la paleta antigua), 3 más en oscuro (2,52) y opciones e iniciales blancas en modo oscuro. Pasan a tokens de Faro.
- **Verificado:** sonda en instalación nueva propia (bienvenida, botones a «Protege tu copia» y a Preparación, vuelta al tablero con copia, sin desborde a 390); instalación nueva temporal en 4440 (borrada al terminar): Inicio y Continuidad 0 en claro y oscuro, Preparación 0 en claro y oscuro tras corregir, sin superficies claras; ensayo con copia 4421: accesibilidad 0 en claro, oscuro y móvil y sin superficies claras; unitarias 81/81; E2E local-task-focus 26/26, preparation-review 6/6, continuity 7/8, operational-rehearsal-today 1/1, auth-parent 3/3 (task-focus-main requiere `PLANB_TASK140_ROOT`, de entorno).
- **Sin desplegar en 4331** hasta orden expresa.
- **14/11 12:11 · aplicado en 4331** por orden expresa (copia `runtime/backup-dist-20261114-121102`). Antes: ningún archivo de `src/`/`shared/` más nuevo que la compilación y Codex sin reservas de interfaz. Sobre 4331 (con copia), solo lectura: Inicio muestra el tablero de siempre, no la bienvenida; frase de la semana correcta; ninguna escritura; accesibilidad 0 en claro y oscuro; sin superficies claras; Inicio y Preparación sin desbordes.

### 14/11/2026 · estado de error común y mensajes sin respuesta (Faro 2 · estados)
- **Inventario:** 49 `error-box` y ~15 variantes propias de pantalla; varias (Radar, Comprobar una fecha, Revisar una decisión) con colores claros fijos que en modo oscuro salían como recuadros blancos; algunos errores (`role="alert"`) se pintaban como texto gris.
- **Qué cambia (`faro.css`, solo CSS):** un estilo de error con acento rojo, «!» y texto legible sobre fondo suave, con los tokens del tema, para `error-box`, `global-error` y las variantes de pantalla; el botón del recuadro sigue a la derecha; los errores en notas grises pasan al tono de error. Los avisos (ámbar) no se tocan. Sin cambios de texto ni de rol en esos elementos.
- **Mensajes:** al provocar errores reales apareció el «Failed to fetch» del navegador en Hoy e Inicio. `src/local-operations-client.ts` y `src/api.ts` (también `download`) dan ahora «No hubo respuesta de tu copia local. Comprueba que Plan B sigue abierto y reintenta.» cuando no hay respuesta, como ya hacían los clientes de Comprobar una fecha, Revisar una decisión y Ensayar mi semana. Una lectura cancelada a propósito sigue saliendo como cancelación.
- **Verificado (ensayo 4421, lecturas cortadas en un navegador de prueba):** errores reales en Hoy, Integraciones, Radar, Inicio y Comprobar una fecha, en claro y oscuro (capturas `tests/.tmp/rd/error-*.png`), todos en español; tipos sin errores; 163/163 unitarias de los archivos que usan `api()` o el cliente de Hoy más tokens, kit y recorridos; accesibilidad 0 en claro, oscuro y móvil; sin superficies claras.
- **Sin desplegar en 4331** hasta orden expresa.
- **E2E:** continuity 7/8 (el de entorno), local-task-focus 26/26, date-check-app 1/1, commitment-report-responsive 3/3, reference-select 7/7, protection-review 6/6. **operational-rehearsal-today 0/1** (antes 1/1): la decisión se queda en «Guardando…» y no llega el aviso de resultado incierto. Experimento: con los dos cambios de mensaje (`api.ts`, `local-operations-client.ts`) deshechos falla igual, así que no los causa (se restauraron). Esta prueba arranca su propio servidor con el código del repositorio y hoy a las 11:44 cambió `server/store.ts` por la tarea `CLAUDE-PERF-STORE-RECORDS` (otra sesión, presentada y en revisión); el resto de E2E usa un servidor compilado anterior. **Para la revisión de `CLAUDE-PERF-STORE-RECORDS`: comprobar `tests/e2e/operational-rehearsal-today.spec.ts`.** No se ha tocado ese archivo. El despliegue de interfaz en 4331 no cambia el servidor.
- **14/11 12:59 · aplicado en 4331** por orden expresa (copia `runtime/backup-dist-20261114-125924`), recompilado tras restaurar los archivos del experimento. Sobre 4331, solo lectura: con las lecturas cortadas solo en el navegador de prueba, Hoy, Integraciones, Radar, Inicio y Comprobar una fecha muestran su error en español con el estilo común; accesibilidad 0 en claro y oscuro; sin superficies claras; 4331 sigue respondiendo después.

### 14/11/2026 · ensayo guiado «Un día sin CRM» (Faro 2 · fase 3)
- **Qué es** (`src/app-shell/guided-drill.ts`, `GuidedDrill.tsx`): un panel que acompaña a la persona y reconoce cinco gestos por lo que ya hace en la App: abrir la lista de clientes, encontrar a uno (buscador de la lista con 2+ letras o «Buscar en toda la copia»), abrir su ficha, mirar Hoy y localizar Exportar. Pasos acumulativos (no cuentan fuera de orden), cada uno con su hora; al final, tiempo total y lo que no demuestra («que la copia funcione lo comprueba "Probar mi Plan B"»). No pide guardar, no escribe y no se recuerda al cerrar la ventana.
- **Entradas:** botón junto a «Probar mi Plan B» en Continuidad › Estado y orden «Ensayo guiado: un día sin CRM» en la paleta; solo con copia activa y fuera del paquete restaurado.
- **Detalles:** panel plegable, anuncia cada paso a lectores de pantalla, botón «Ir» al apartado del paso; con una ficha o ventana abierta pasa abajo a la izquierda (escritorio) o se aparta (móvil) para no tapar «Cancelar/Guardar»; en móvil queda sobre la barra inferior.
- **Verificado (ensayo 4421):** `tests/guided-drill.test.ts` 4/4; unitarias relacionadas 85/85; tipos sin errores; recorrido real completo (0→5 de 5, terminado), ninguna escritura, cierre; a 390 el panel queda sobre la barra y sin desborde; accesibilidad 0 en claro y oscuro; sin superficies claras; E2E continuity 7/8, continuity-lab 13/13, copy-inspection 8/8.
- **Disco C:** 1022 MB libres; se evitan tandas largas de pruebas hasta que haya espacio.
- **Sin desplegar en 4331** hasta orden expresa.
- **14/11 13:19 · aplicado en 4331** por orden expresa (copia `runtime/backup-dist-20261114-131901`). Sobre 4331, solo lectura: recorrido real del ensayo guiado de 0 a 5 de 5 con tus datos (lista de clientes, buscar «lu», abrir ficha, Hoy, Exportar), ninguna escritura, cierre correcto; a 390 el panel queda sobre la barra y sin desborde; accesibilidad 0 en claro y oscuro; 4331 sigue respondiendo. Las capturas de pantalla hechas con datos reales se borraron.

### 14/11/2026 · repaso de textos (Faro 2 · fase 4)
- **Método:** recorrido de las 19 vistas del ensayo recogiendo ~3.000 textos visibles (incluidos `placeholder`, `aria-label` y `title`) con `tests/.tmp/rd/copy-crawl.mts`, y comprobación automática con `copy-lint.mjs`: inglés o restos técnicos, datos internos visibles, «...», espacios dobles o antes de puntuación, tildes, mayúsculas a la inglesa en botones y variantes de una misma acción; además, búsqueda en el código de diálogos y mensajes condicionales. Antes de cambiar un texto se comprueba que ninguna prueba lo busque literalmente.
- **Resultado:** la interfaz está limpia en lo formal (sin «...», dobles espacios, faltas de tilde ni inglés; las «mayúsculas» detectadas son nombres propios).
- **Corregido:** el resumen de cada operación en Cambios (línea añadida en el rediseño) mostraba la clave y el valor internos («status: pending → completed», «2026-11-14»); ahora usa el nombre del campo, la etiqueta de la opción y fechas legibles («Estado: Pendiente → Completada», «Fecha límite: 14 nov 2026 → 3 nov 2026»). El detalle de debajo sigue siendo la auditoría exacta (clave, tipo y valor), a propósito. `ChangesView` recibe la especificación desde la App (opcional).
- **Terminología:** «ensayo» ya significa datos de prueba o ficción (35 usos: «Datos de ensayo», «Escenario de ensayo»…); para no darle un tercer sentido, el ensayo guiado pasa a llamarse **«Práctica guiada: un día sin CRM»** (botón, paleta y panel).
- **Se dejan a propósito:** el identificador corto de la evidencia («capture:…») en el pasaporte y la captura y revisión en monoespaciado en Exportar, que sirven para verificar; las variantes de «Actualizar…» son contextuales.
- **Verificado (ensayo 4421):** tipos sin errores; unitarias relacionadas 91/91; recorrido de la práctica guiada completo con el nombre nuevo, sin escrituras; accesibilidad 0 en claro y oscuro; E2E change-history 3/3, manual-recovery-review 6/6, continuity 7/8.
- **Reinicio:** el equipo se reinició a las 15:24 y cerró 4331 y 4421; 4331 se volvió a arrancar como siempre (instancia `ee97dec4…`) y sigue con la interfaz de las 13:19. C: tiene 858 MB libres incluso tras el reinicio.
- **Sin desplegar en 4331** hasta orden expresa.
- **14/11 15:32 · aplicado en 4331** por orden expresa (copia `runtime/backup-dist-20261114-153214`). Sobre 4331, solo lectura: los 3 resúmenes de Cambios usan nombres de campo y fechas legibles (0 claves internas, 0 fechas ISO); la «Práctica guiada» se abre con su nombre nuevo y llega a 5 de 5 sin escrituras; accesibilidad 0 en claro y oscuro. C: volvió a 3,3 GB libres.

### 14/11/2026 · espacio de equipo (/team) en Faro
- **Auditoría (servidor de equipo de demostración en 4441, carpeta desechable):** 8 secciones × claro/oscuro × 1440/390 → 31 problemas. El más grave, mío: en móvil el menú lateral se ocultaba (regla del rediseño para la App local, que tiene barra inferior) y `/team` no tenía sustituto: no se podía cambiar de sección. Además, en oscuro la tabla de Empresa conservaba fondos claros (contraste 1,55–2,19), un aviso de Agente usaba un tono sin versión oscura y un texto de Comercial un azul fijo (2,29); iconos repetidos en el menú (Empresa/Equipo, Trabajos/Agente) y título duplicado en Empresa.
- **Cambios:** en móvil, rejilla con todas las secciones a la vista (4 columnas, 3 por debajo de 360 px; icono y nombre; ≥ 52 px), sin fijarla; «CRM completo» del piloto se conserva. Iconos propios para Equipo (`UserCog`) y Agente (`Bot`), también en los accesos de Empresa. El subtítulo de Empresa pasa a «Resumen de la copia guardada». Tabla y textos con tokens del tema; tonos de etiqueta 1–5 con versión oscura (afecta también a la App local).
- **Primer intento descartado:** una tira horizontal desplazable; `company-home.spec.ts` exige ver todas las secciones sin desplazar (descubribilidad), así que se rehízo como rejilla.
- **Verificado:** auditoría del equipo 31 → 0 (8 secciones, claro y oscuro, escritorio y móvil); App local (4421, rearrancada tras quitar un bloqueo obsoleto de su carpeta de ensayo) accesibilidad 0 en claro, oscuro y móvil y sin superficies claras; unitarias del equipo 108/108; E2E company-home 1/1 (customers.spec necesita su propio servidor de equipo, de entorno).
- **Regresión mía corregida:** la sesión del informe avisó (CI local) de que el cambio de `src/api.ts` rompía `tests/independent-return-integrity-ui.test.ts:187` (esperaba ver el detalle original del error). Ahora solo se traduce el error de red del navegador (`TypeError`); cualquier otro conserva su texto. Igual en `local-operations-client.ts`. 113/113; Hoy e Inicio siguen en español con un corte real. Respondido en el chat de coordinación. **4331 tiene todavía la versión anterior de `api.ts` (desplegada a las 12:59).**
- **Coordinación:** `src/ChangeHistory.tsx` lo mejoró otra sesión a las 15:57 (`displayDateOnly`) sobre el resumen del repaso de textos; es compatible y no se toca. `TeamSync.tsx` y `team-sync.css` (reservados por Codex 069) no se han tocado.
- **Sin desplegar en 4331** hasta orden expresa.
- **14/11 16:10 · aplicado en 4331** por orden expresa (copia `runtime/backup-dist-20261114-161033`): espacio de equipo en Faro + corrección de `api.ts`/`local-operations-client.ts` + la mejora de fechas de `ChangeHistory.tsx` de Codex (064, en revisión), incluida con autorización expresa del usuario. Sobre 4331, solo lectura: con lecturas cortadas en el navegador de prueba, Hoy e Inicio muestran «No hubo respuesta de tu copia local…»; accesibilidad 0 en claro y oscuro; sin superficies claras. **4331 no sirve el espacio de equipo** (`/api/team` → 404): `/team` corre en un servidor de equipo propio, que no estaba en marcha (ni 4334 ni 4341) y que el script de 4331 no actualiza; el rediseño de `/team` quedará visible cuando ese servidor sirva una compilación nueva.
- **17/11:** el equipo se reinició a las 08:41; 4331 se volvió a arrancar como siempre (instancia `ee97dec4…`) y sigue con la interfaz del 14/11 16:10. Desde entonces Codex presentó seis tareas de interfaz (367, 370, 371, 372, 375, 378; en revisión) sobre `TopBar.tsx`, `api.ts`, Integraciones y `workspace-copy.ts`: no se tocan ni se despliegan sin revisión y sin orden. C: tiene 769 MB libres.

### 17/11/2026 · espacio de equipo: tablas como tarjetas en móvil
- **Antes:** en móvil, Contactos y «Registros guardados» (Empresa) eran tablas que se desplazaban en horizontal dentro de su caja; columnas como Teléfono quedaban fuera de la vista.
- **Ahora** (`TeamContacts.tsx`, `TeamCompanyHome.tsx`: cada celda lleva su `data-label`; estilo en `faro.css`): a ≤ 600 px cada fila es una tarjeta con el nombre arriba, pares etiqueta · valor (Correo, Teléfono, Revisión o el dato de cada tipo de registro) y el botón de editar a la derecha (44 px), como las listas de la App local. Escritorio sin cambios.
- **Ajuste:** la rejilla de secciones del equipo en móvil se quedaba fija al desplazarse (otra regla la hacía `sticky`) y ocupaba ~125 px todo el tiempo; ahora se desplaza con la página, como estaba previsto.
- **Verificado (servidor de equipo de demostración 4441, carpeta desechable borrada al terminar):** 24 tarjetas en cada lista, dentro de la pantalla y sin desborde; auditoría del equipo 0 (8 secciones, claro y oscuro, escritorio y móvil); tipos sin errores; unitarias 42/42; E2E company-home 1/1.
- **Sin desplegar:** una compilación nueva incluye también las seis tareas de interfaz de Codex en revisión (367, 370, 371, 372, 375, 378); hay que decidir antes de desplegar. C: 717 MB libres.
- **17/11 09:02 · aplicado en 4331** por orden expresa del usuario, que autorizó incluir las seis tareas de Codex en revisión (367, 370, 371, 372, 375, 378; los archivos en disco coinciden con lo presentado) y, preguntado aparte, también cambios **sin registrar en el tablón** (no coinciden con ninguna entrega) en `App.tsx`, `ContinuityHome.tsx`, `HomeOverview.tsx` (15–16/11) y `LocalOperations.tsx`, `operaciones-claras.css` (15/11). Copia `runtime/backup-dist-20261117-090157`. Antes: tipos sin errores y 124/124 unitarias de interfaz.
- **Comprobado sobre 4331, solo lectura:** insignia 4 (copia de 20 días), avisos con destino y foco correctos, ninguna escritura; errores en español con lecturas cortadas; accesibilidad 0 en claro, oscuro y móvil; sin superficies claras; Inicio, Continuidad, Integraciones y Hoy sin desbordes. Los cambios sin registrar **reorganizan Inicio** (siguiente paso, «Prioridades de hoy», tarjeta «Copia activa» y la semana dentro de «Planificación semanal», plegable); `tools/visual/a11y.mts` despliega ahora esa sección antes de abrir «Resumen de la semana». **Quien hizo esos cambios debería registrarlos en el tablón para su revisión.**
- C: tiene ahora 82 GB libres.

### 17/11/2026 · espacio de equipo: Dispositivos y Equipo en paneles; conflictos legibles
- **Dispositivos:** dos paneles, «Vincular una copia local» (etiqueta visible «Nombre del dispositivo», campo de 320 px en lugar de ocupar todo el ancho, botón al lado) y «Copias vinculadas · N» (estado vacío «Todavía no hay copias vinculadas a esta empresa.»). La clave de un solo uso aparece dentro del primer panel.
- **Equipo:** «Invitar a una persona» y «Personas con acceso · N»; se quita el permiso repetido junto al correo (ya lo dice el selector).
- **Conflictos:** en lugar de «Cambio local: {"phone":…}», una tabla Campo · Cambio local · Versión remota N con nombres de campo, «vacío»/«—» para valores sin dato y las filas distintas marcadas (también para lectores de pantalla). Módulo propio `src/app-shell/team-conflict.tsx` y prueba `tests/team-conflict.test.ts` (2/2). Se conservan el título «Conflictos por revisar» y los botones que usa `v5.spec`.
- **Sin cambio de textos de botones ni de nombres de campos** usados por pruebas; el nombre accesible del campo del dispositivo sigue siendo «Nombre del dispositivo» (ahora por su etiqueta).
- **Verificado (servidor de equipo de demostración, carpeta desechable):** tipos sin errores; auditoría del equipo 0 (8 secciones, claro y oscuro, escritorio y móvil); vincular una copia de ensayo la muestra en «Copias vinculadas · 1» con «Revocar». Los conflictos solo se han comprobado con la prueba unitaria (`v5.spec` necesita su propio servidor de equipo y no forma parte de la batería local).

### 17/11/2026 · batería E2E completa de la App local (estado tras el fin de semana)
- **Cómo:** 46 specs con `tests/.tmp/rd/e2e/run.mjs` contra una **copia aislada** de la compilación (`tests/.tmp/rd-e2e`, variable `E2E_RUN`), para poder seguir compilando sin estropear la batería. Resultado en `tests/.tmp/rd/e2e/full-17-11.txt`.
- **Resultado:** 141 ✓ / 98 ✗ (13/11: 68 ✓ / 133 ✗ en 41 specs). Mejoras: continuity 8/8, workspace-search-races 6/6, independent-workspace-flows 4/5 (pruebas nuevas). Siguen fallando por fixtures, variables o servidores propios los ya clasificados (rescue-*, recovery-integrity, local-operations, preparation-navigation, independent-copy-inspection, integrated-recovery, workspace-search/identity, portable-export-review, customers, relay-packaged, continuity-operations, continuity-app-context) y por cambios anteriores al rediseño (connection-dialog, v3, v4, today-work-queue, independent-interface-flows y el nuevo de independent-workspace-flows: esperan la portada antigua o el título de `SalesWorkspace`).
- **Nuevo:** `operational-rehearsal-app` (antes 1/1) falla sin llegar a pintar el menú; con `operational-rehearsal-today` son las dos únicas specs que arrancan su servidor desde el código del repositorio. La misma interfaz funciona en 4331 y en el resto de specs; sospecha: `server/store.ts` de `CLAUDE-PERF-STORE-RECORDS` (ya en `f009092`). Avisado en el chat; no se toca.
- **17/11 ~10:40 · despliegue de los paneles del equipo SIN HACER (pausa por límite de uso).** Con autorización del usuario se compiló todo el árbol actual (paneles del equipo + `CLAUDE-UI-NAV-LAB`, menú de cinco lugares y Laboratorio, en revisión; tipos sin errores, 94/94 unitarias; compilación de 10:19:27 en `tests/.tmp/rd/dist`). Falta comprobarla antes de desplegar: el puerto 4421 lo ocupa ahora el ensayo de otra sesión (`tests/.tmp/ensayo-1711`), así que mi ensayo corre en **4422**; las herramientas visuales no encontraban los apartados plegados del menú nuevo y se creó `tools/visual/nav.mts` (navegación por la paleta) aún **sin integrar** en `a11y.mts`, `check.mts` y `dark-scan.mts` ni probada. 4331 sigue con la interfaz de las 09:01.
- **17/11 ~14:30 · despliegue en espera por decisión del usuario.** Tras el reinicio de las 13:34 se volvió a arrancar 4331 (sigue con la interfaz de las 09:01). Compilación nueva con todo el árbol (paneles del equipo, menú de cinco lugares y Laboratorio, Deshacer, correcciones D4 de la otra sesión): tipos sin errores; las 15 vistas se alcanzan con la navegación nueva de las herramientas (`tools/visual/nav.mts`, paleta, con equivalencias Agentes→Propuestas y Radar→Radar de compromisos, ya integrada en `a11y.mts`, `check.mts` y `dark-scan.mts`); accesibilidad 0 en claro y oscuro; fila bajo el ratón con el color del tema (quedaba `#f8faff` de `refinements.css` en oscuro); Inicio, Clientes y Continuidad sin desbordes. **Bloqueo:** «Deshacer» (CLAUDE-UNDO-LAST) llama a `/v2/changes/undo-last`, que no existe en el servidor de 4331; el usuario decide esperar a que haya servidor con la ruta (o a que la interfaz la oculte si falta). Avisado en el chat. No se llamó a la ruta en 4331 (podría deshacer un cambio real).
- **Pregunta abierta:** en el navegador de pruebas, navegar seguido por varias secciones a 390 px tumba la pestaña («Target crashed») con 11 MB de memoria JS; ocurre igual con la versión de las 09:01 (4331) y no en escritorio, y abrir cada sección por separado funciona. Parece propio del navegador de pruebas en móvil; sin confirmar en un dispositivo real.

### 17/11/2026 · caída de pestaña en móvil (investigación cerrada)
- **Qué se vio:** en el navegador de pruebas, a 390 px, la secuencia Hoy → Clientes → Tareas → Cambios (navegando con «Más» y la paleta) tumba la pestaña («Target crashed») al pulsar una tecla. Ocurre con la versión de las 09:01 de 4331 y con la compilación nueva, en el «headless shell» y en el Chromium completo de Playwright; nunca en escritorio (3 vueltas de 6 secciones); ninguna secuencia de 1, 2 o 3 pasos la provoca; abrir cada sección por separado funciona.
- **Descartado:** fuga de memoria de la App (memoria JS 6–11 MB; elementos, oyentes y objetos de diseño suben y bajan con cada pantalla sin acumularse), falta de memoria del equipo (12 GB libres de 32) y Ctrl J (la herramienta ya no lo pulsa en móvil y la caída sigue). Con los contadores del navegador conectados no se reprodujo.
- **Conclusión provisional:** inestabilidad del navegador automatizado en Windows con emulación estrecha, no de la App; sin confirmar en un teléfono real. `tools/visual/nav.mts` ya no pulsa Ctrl J en pantallas estrechas (en un navegador real abre «Descargas»): cierra lo abierto con Escape y usa «Más».
- **Revisión visual de Integraciones, Agente y Comercial del equipo:** ya están en Faro (tarjetas, estados y botones coherentes); no se tocan.

### 17/11/2026 · tipografía propia empaquetada (Faro 2 · fase 4)
- **Autorización:** el 17/11 el usuario había decidido «sin dependencias nuevas ni tipografía descargada» (sesión del informe); preguntado de nuevo, autorizó expresamente esta descarga como excepción.
- **Qué:** Inter (texto) y Source Serif 4 (títulos), variables 400–700, subconjunto latino, licencia SIL OFL; un WOFF2 por familia (48 KB + 51 KB) descargados de Google Fonts (fonts.gstatic.com) con sus licencias desde el repositorio google/fonts. Comprobados (cabecera `wOF2`). En `src/assets/fonts/` con `LEEME.txt`; la compilación los empaqueta con nombre versionado. Sin npm ni `package.json`.
- **Cómo:** `@font-face` «Faro Sans» y «Faro Serif» (nombres propios para no mezclarse con copias instaladas), `font-display: swap` y las fuentes del sistema como respaldo; `--font-sans` y `--font-display` apuntan a ellas.
- **Verificado (ensayo 4422):** cargan las dos y se aplican (cuerpo «Faro Sans», h1 «Faro Serif») en claro y oscuro, sin ninguna petición externa; pruebas de tokens y kit 16/16; accesibilidad 0 en claro y oscuro. El recorrido de desbordes a cuatro medidas se repite aparte. «Buscar en toda l…» ya salía cortado antes del cambio.
- **Sin desplegar:** irá con la compilación en espera por «Deshacer» (ruta de servidor ausente en 4331).

### 17/11/2026 · inventario de archivos de la sesión Faro (para cuando el usuario autorice guardar en git)
- **Creados por esta sesión (sin registrar en git):** `src/app-shell/FirstRun.tsx`, `GuidedDrill.tsx`, `guided-drill.ts`, `continuity-alerts.ts`, `continuity-report.ts` (con cambios de Codex 350), `saved-views.ts`, `team-conflict.tsx`, `src/assets/fonts/` (Inter y Source Serif 4, OFL), `tools/visual/nav.mts`; pruebas `tests/continuity-alerts.test.ts` (con cambios de Codex 350), `continuity-report.test.ts`, `guided-drill.test.ts`, `saved-views.test.ts`, `team-conflict.test.ts` (y `copy-timeline.test.ts`, ya registrado antes).
- **Modificados por esta sesión entre otros:** `src/faro.css` (también tocado por CLAUDE-UI-NAV-LAB y Deshacer), `src/app-shell/CopyTimeline.tsx` y `copy-timeline.ts` (también Codex 350), `RecordsPage.tsx` (vistas; después la otra sesión), `CommandPalette.tsx`, `src/ui/index.tsx`, `src/App.tsx`, `HomeOverview.tsx`, `ContinuityHome.tsx`, `ChangesView.tsx`, `ChangeHistory.tsx` (también Codex 064), `TeamApp.tsx`, `TeamContacts.tsx`, `TeamCompanyHome.tsx`, `ManualRecovery`-no, `api.ts` y `local-operations-client.ts` (mensaje sin respuesta; luego Codex 375), `CommitmentRadar.tsx`, `CommitmentRadarEntry.tsx`, `DateCheck.tsx`, `LocalOperations.tsx`, `LocalIntegrations.tsx`, `ContinuityDay.tsx`, `Preparation.tsx`-no (solo CSS), `tools/visual/a11y.mts`, `check.mts`, `dark-scan.mts`.
- **No son de esta sesión** aunque estén sin guardar: `navigation.ts`, `routes.ts`, `useRecordList.ts`, `workspace-copy.ts`, `mobile-copy-alert.css` y las pruebas `api-error-contract-375`, `capture-*`, `csv-import*`, `navigation-model`, `password-hash-v2`, `record-list`, `server-modules`, `ui-copy`, `ui-states`, `undo-last`, `url-routes`, `workspace-copy`, `job-cancellation-368`, `restore-transaction-388`, `portable-launcher-asset-384`, `operational-services-independent-379`.
- **Análisis de `faro.css`:** 1.825 líneas, 183 KB, 4.794 declaraciones; solo 35 (0,7 %) quedan anuladas por una regla posterior del mismo selector, casi todas ajustes deliberados. No se consolida: ganancia mínima y riesgo de romper.
- **`DESIGN.md` actualizado** (seguía describiendo la identidad azul del 28/10): colores con sus valores reales en claro y oscuro, tipografía empaquetada, densidad y 44 px, estados comunes (carga, vacío, error), composición (menú de cinco lugares, paleta, listas, Continuidad, avisos, equipo) y herramientas de comprobación. Las secciones «Contextos y verdad de producto» y «Correo comercial» se conservan idénticas al original (comprobado contra git).

### 17/11/2026 · comprobación tras la tipografía y rediseño de Oportunidades
- **Tras la tipografía (ensayo 4422):** listas de clientes, empresas, oportunidades y tareas sin desbordes a 1280/1440/390; el buscador lateral ya no se corta; la barra de estado a 1280 envuelve en lugar de empujar la paginación. Accesibilidad en claro y oscuro: único aviso, el selector de estado de las tareas (116×22, anterior a esta tanda); superficies claras en oscuro: 0.
- **Pedido del usuario:** «rediseñar el apartado de oportunidades, cómo se presentan y el desplegable que muestra cada una».
- **Tablero:** columnas ligeras con el color de su etapa arriba; recuento y suma con separador de miles («9.900 €») y una barra con la parte de cada etapa en el total abierto; «Ganada» con acento verde y «Perdida» atenuada; etapas vacías estrechas en escritorio y de una línea en móvil. Tarjetas: nombre (2 líneas como mucho), empresa · cliente, importe y estado del cierre («Venció hace N días · fecha» en rojo, «Cierra en N días» en ámbar, «Cierra el …»); en ganadas y perdidas no se marca vencimiento. En móvil, etapas apiladas en vertical en lugar del tablero que solo enseñaba la primera columna.
- **Ficha:** panel de 520 px con un resumen arriba: importe grande, estado del cierre, empresa y cliente, y el avance por el proceso como pasos (hechos ✓, actual, siguientes; ganada/perdida al final). Pulsar un paso cambia la etapa del formulario, igual que el desplegable, y solo se guarda con «Guardar cambios».
- **Lógica:** `src/app-shell/deal-insights.ts` (tipo de etapa por nombre o identificador, también `closedwon`/`closedlost`; estado del cierre; importes) con `tests/deal-insights.test.ts` 4/4. El resumen está en `src/app-shell/DealSummary.tsx`; la fecha de cierre solo se usa si el modelo tiene un campo de fecha de «cierre/close» (no se inventa).
- **`src/components.tsx`** (reservado por CODEX-RELATION-LABEL-063, tomado con aviso en el chat según la decisión del usuario del 17/11): solo la prop opcional `summary` de `RecordDrawer` y `data-entity` en el panel. Sin cambios en etiquetas, ids, clases `.kanban-column`/`.deal-card` ni en «Etapa» (el resumen evita esa palabra en sus nombres accesibles para no duplicar la etiqueta que usan las pruebas).
- **Sin desplegar:** va con la compilación en espera por «Deshacer».

### 18/11/2026 · tipografías guardadas en git
- Por orden del usuario («Sí, guárdalas»), commit 19fed29 solo con `src/assets/fonts/` (dos WOFF2, licencias OFL y LEEME). `tests/candidate-font-assets.test.mjs` no es de esta sesión y queda fuera. Sin push ni despliegue.

### 18/11/2026 · fichas con resumen, Oportunidades en Inicio y vencimientos en palabras
- **Fichas de cliente y empresa** (`src/app-shell/RecordSummary.tsx`): avatar con iniciales, correo, teléfono y web, y acciones «Escribir» (mailto:), «Copiar dirección», «Llamar» (tel:) y «Abrir web». No repite el nombre ni usa las etiquetas de los campos en nombres accesibles (las pruebas buscan «Correo», «Empresa»… con `getByLabel`).
- **Ficha de tarea:** estado de la fecha límite («Venció hace 3 días · 15 nov», «Vence hoy», «Vence mañana», «Hecha») y botón «Marcar como hecha» / «Volver a abrir», que cambia el estado del formulario y se guarda con «Guardar cambios»; cliente y oportunidad en una línea.
- **Inicio · «Oportunidades abiertas»** (`src/app-shell/PipelineCard.tsx`, montada en `HomeOverview.tsx`; `App.tsx` pasa `onOpenDeals`): importe en juego, cuántas tienen el cierre vencido, barra y leyenda por etapa, y las tres que antes piden atención con «Abrir». Lee como mucho 100 (límite de la ruta) y lo dice si hay más.
- **Tareas:** junto a la fecha límite, cuándo vence en palabras («hace 3 días», «hoy», «mañana», «en 5 días») si la tarea sigue abierta.
- **Importes en toda la app con separador de miles** (`displayValue` en `components.tsx`: `useGrouping: 'always'`), p. ej. «1.200 €» en Relacionado y en la tabla. Ninguna prueba esperaba el formato anterior.
- Lógica nueva en `deal-insights.ts` (`dueStatus`, `initials`) con pruebas (6/6).
- **Además (18/11, misma tanda):** «Nueva tarea» en la ficha de un cliente o una oportunidad y «Nueva oportunidad» en la de un cliente o una empresa: abren la ficha nueva ya enlazada (`src/app-shell/task-preset.ts`, `linkedPreset`, con pruebas 4/4; de una oportunidad se copia también su cliente, de un cliente su empresa). Deshabilitado y explicado si la ficha tiene cambios sin guardar. «+» en la cabecera de cada etapa abierta del tablero para crear una oportunidad ya en esa etapa. Para ello `RecordDrawer` acepta `preset` (valores iniciales de una ficha nueva) y `RecordsPage` la prop `newWith`. Las fichas nuevas no muestran resumen (salvo Oportunidades, por los pasos de etapa).
- **Verificado (ensayo 4422):** unitarias 22/22 (insights, enlaces, tokens, conflictos); accesibilidad 0 en claro, oscuro y móvil y 0 superficies claras en oscuro (antes de la tarjeta de Inicio y los botones nuevos; repetición en curso); recorrido real sin errores de página a 1440 y 390: tarea nueva desde Lucía Martín llega con el cliente puesto, «+» de Negociación abre la oportunidad en Negociación, todo cancelado sin guardar. E2E: continuity 3/5 y reference-select 7/7, igual que antes (los fallos de continuity son del menú antiguo y del entorno).
- **Revisión final (18/11, versión con tarjeta de Inicio y botones nuevos):** accesibilidad 0 en claro, oscuro y móvil; local-task-focus 26/26; continuity-home-hub 0/1 por un ancla de parche del propio spec que ya no existe en App.tsx (`const [page, setPage] = useState<...>`, cambió con el menú de cinco lugares y las rutas), no por estos cambios.
