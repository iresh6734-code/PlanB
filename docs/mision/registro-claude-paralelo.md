# Misión maestra · Trabajo en paralelo de Claude (ordenador de `D:\AI\Plan-B-CRM-v2.1`)

Archivo propio para no chocar con `registro-colaboracion.md`, que edita el agente del otro ordenador. Cuando convenga, se puede pasar su contenido a ese registro.

**Regla de convivencia.** Mientras el otro agente sigue la lista «Siguiente, en este orden» de `00-LEEME.md`, Claude no toca:

- Cambios (`ChangesView.tsx`);
- el menú (`navigation.ts`, `Sidebar.tsx`);
- Hoy y Agenda;
- las listas (`RecordsPage.tsx`);
- la limpieza A0-L;
- `consola.css` y `faro.css`;
- `00-LEEME.md` y `registro-colaboracion.md`.

## 21/11/2026 · A4 Paquete de vuelta: motor y ruta (sin interfaz)

**Qué resuelve.** En producción Plan B solo lee HubSpot: la devolución automática está bloqueada a propósito (`server/recovery.ts`, `preview` → 403). Tras una caída, el trabajo hecho en la copia tiene que volver al CRM de forma revisable. El paquete convierte los cambios pendientes en CSV con el formato de importación de HubSpot, más un informe de lo que no entra y por qué.

**Qué hay:**

- **`shared/return-package.ts`**, lógica pura:
  - `buildReturnPackage`, `csvCell` y `pendingByRecord`.
  - Un CSV por objeto y tipo: `plan-b-vuelta-<objeto>-actualizar.csv` con `Record ID`, y `…-crear.csv` sin ID.
  - Solo entran los cambios posteriores a la marca de devolución, varias ediciones de un registro en una sola fila.
- **`server/return-package-api.ts`**: `POST /api/v3/return-package`, registrada en `server/v2.ts` (una línea, salvo en el paquete independiente).
  - Con `readHubspot: true` (por defecto) lee HubSpot con la conexión del mismo portal y detecta conflictos.
  - Máximo 500 lecturas por paquete, con lectura en modo solo lectura en producción.
  - Sin conexión responde 422 y no inventa la comprobación.
  - Con `readHubspot: false` genera el paquete y avisa de que no se han comprobado conflictos.

**Garantías** (las pide la revisión cruzada de Copilot):

| Garantía | Cómo |
| --- | --- |
| Identidad congelada | Portal, captura, revisión local y tramo de cambios van en el paquete. La revisión es la misma que exige `/api/v3/manual-recovery/verify` (probado) |
| Nada se da por devuelto | Generar no escribe en HubSpot ni en la copia, ni mueve la marca (probado). El resumen manda a comprobar por relectura |
| Conflictos | Campo cambiado en los dos lados → fuera del CSV y en el informe con base, copia y HubSpot. Lo ya igual no se importa. Lo ausente o archivado no se recrea |
| Vacíos | Vaciar un campo no se puede con una celda vacía (la importación la ignora) → fuera e informado |
| Relaciones y solo lectura | Fuera. Las relaciones se informan para revisarlas a mano |
| IDs | Solo ID numérico canónico (del registro o del mapeo confirmado). Si no, fuera e informado |
| Fórmulas | Celdas que empiezan por `=`, `@`, tabulador o retorno, o por `+`/`-` seguido de algo que no es un número, llevan un apóstrofo delante y se listan. Teléfonos `+34…` e importes negativos intactos |

**Comprobación:**

- `tests/return-package.test.ts` 7/7 y `tests/return-package-api.test.ts` 2/2.
- Tres mutaciones (sin conflictos, sin protección de fórmulas, sin vaciados) hacen fallar una prueba cada una.
- `tsc` sin errores.
- `docs/api.md` regenerado (183 rutas; ya le faltaban 11 de otros cambios) y `api-client-routes` al día.
- Pruebas de devolución y recuperación manual en verde.

**Límites, dicho claro:**

- **No probado contra un HubSpot real.** Falta validar en un portal de prueba o sandbox que la importación mapea las columnas por nombre interno, los formatos de fecha y las casillas múltiples con `;`. Necesita autorización de la usuaria; no se hace en el otro ordenador.
- **Sin interfaz todavía.** El botón «Descargar paquete de vuelta» y la vista del informe van en **Cambios**, que ahora es del otro agente (B4.3). Propuesta: cuando termine B4.3, lo anota en el registro y uno de los dos lo monta. El contrato es la respuesta de la ruta (`files[].csv`, `skipped[]`, `summary[]`, `identity`).
- Después de importar, la vuelta se acredita con la comprobación manual existente. A10-1 (unir el parte de incidente con la vuelta) sigue pendiente.

## 22/11/2026 · Relevo retomado tras el trabajo de Copilot

Traídos con `git pull --ff-only` los commits de Copilot `9e1ad41` (Hoy y Agenda), `a0fedfa` (listas), `7fcb771` (A0-L) y `df0e708` (relevo y análisis de A6/A7). Su lista «Siguiente» quedó terminada; lo pendiente es lo que exige este ordenador (navegador, procesos) o decisiones de la usuaria (A6, A7).

- **A4 · botón en Cambios.** `src/ReturnPackage.tsx` + `src/return-package.css` (hoja propia, carga diferida con Cambios) y una línea en `src/ChangesView.tsx`.
  - Solo en producción: con datos de prueba ya existe la devolución automática («Devolución revisada») y dos caminos para lo mismo serían ruido.
  - Botón secundario «Preparar paquete», más «Sin leer HubSpot».
  - Resumen, una descarga por CSV, lista plegada «Fuera del paquete» con motivo y, en conflictos, los tres valores; identidad del paquete al pie.
  - Probado en el ensayo 4572 antes de limitarlo a producción: la ficha de demostración «contact-1» queda fuera por no tener ID de HubSpot, como debe.
- **B4.7 · Exportar** (`src/PortableExport.tsx`, `src/portable-export.css`).
  - Una columna de 760 px con tres pasos numerados: revisar, contraseña y descarga, custodia.
  - El motivo del bloqueo va junto al botón («Marca "He revisado…" en el paso 1», «Las dos contraseñas no coinciden»…) y se asocia con `aria-describedby`.
  - Las instrucciones de restauración van plegadas.
  - Sin ganchos nuevos ni cambios de clases o etiquetas: `independent-export-contracts` en verde. La rejilla de dos columnas de `faro.css` se sobrescribe solo en esta página.
- **Subagente en paralelo** (encargo de la usuaria): `tests/relay-rehearsal-mount.test.ts`, arnés de G6 (`auth-parent`, `independent-interface-contexts`) y E2E que buscaban la antigua cola de Hoy. Resultado en la entrada siguiente.
- **Revisión visual del trabajo de Copilot** (no podía hacerla en su ordenador). Medidor `tools/visual/composition.mts` sobre las 19 rutas a 1440, 1366 y 390 px, comparado con las capturas «antes» del 21/11 (`tests/.tmp/mision/shots/despues-22/`).
  - **Sin errores en ninguna ruta.**
  - **Sin desborde horizontal.**
  - **Tamaños de letra en toda la app:** 18 → 16.
  - **Inicio:** 2,14 → 1 pantalla a 1440 y 5,2 → 3,36 en móvil.
  - **Continuidad:** 1,67 → 1,33.
  - **Exportar:** hueco del 46 % → 20 %.
  - **Agenda móvil:** 1,94 → 1,21.
  - **Empresas:** tabla con ancho máximo correcto. El vacío restante se debe a los pocos datos de prueba (8 empresas).
  - **Arreglado:** el panel del día de la Agenda se estiraba a toda la altura aunque el día estuviera vacío; ahora mide lo que contiene (`src/app-shell/agenda.css`).
  - **Pendiente visto:**
    - Clientes y Tareas en móvil siguen en 4,5 y 4,8 pantallas (tarjetas de dos líneas, B4.5).
    - «¿Y si cae…?» ocupa 7,8 pantallas en móvil (Laboratorio, solo demostración).
    - Plan y licencia tiene dos botones rellenos.
- **Plan y licencia:** un solo botón relleno. «Empezar la prueba» es el principal hasta que se escribe una licencia; entonces lo pasa a ser «Activar».
- **Resultado del subagente** (verificado después por Claude: `tsc` sin errores; 15/15 archivos seguros del área, incluidos los dos de G6):
  1. `tests/relay-rehearsal-mount.test.ts`: 9/9 en este ordenador (`NODE_ENV=test`, red bloqueada). La retirada de A0-L no lo rompe.
  2. G6 resuelto en el arnés, no en el producto. `tests/helpers/auth-parent-harness.ts` carga los ganchos reales `useContinuityState`, `useNotices`, `useRecordShortcuts` y `recents` en vez de sustituirlos por un Stub que devolvía null. Las aserciones no cambian: `auth-parent` e `independent-interface-contexts` pasan, 51/51 pruebas.
  3. La antigua cola de Hoy ya no existe. Retirado `tests/e2e/today-work-queue.spec.ts` (sus 4 casos eran de WorkQueue y `/api/v4/today`). En `tests/e2e/independent-workspace-flows.spec.ts`, los 3 casos de la cola se sustituyen por 1 del Hoy actual: 61 vencidas, «Despachar» junto al filtro, un único botón relleno, búsqueda sin otra lectura, sin desborde a 1440, 390 y 320. **Compila, pero no se ha ejecutado en navegador:** este ordenador no tiene la versión de Chromium de Playwright instalada (`chromium_headless_shell-1248`) y no se instala sin permiso.
  - Visto de paso: la búsqueda de Hoy no ignora acentos («nunez» no encuentra «Núñez»). Es un comportamiento del producto, pendiente de decidir.

## 22/11/2026 · B4.5 · Tarjetas de dos líneas en móvil

Solo CSS (`src/consola.css`, bloque móvil de listas; `faro.css` pierde 5 declaraciones que quedaban pisadas). El nombre va arriba y el resto de datos en una línea separados por espacio, sin rótulo encima de cada valor. Correo, teléfono y fecha se reconocen solos, y las cabeceras de la tabla siguen en el código.

| Lista en móvil | 390 px antes → después | 320 px después |
| --- | --- | --- |
| Clientes | 4,51 → 3,36 pantallas | 4,36 |
| Tareas | 4,78 → 3,88 | 4,78 |
| Empresas | 1,84 → 1,32 | 1,8 |

- Sin desborde horizontal.
- Comprobado en el ensayo a 375 px.
- Guardias `css-unused`, `color-guard`, `design-tokens`, `design-k-block`, `record-list`, `listas-ui`, `record-sheet` y `bundle-budget` en verde; `tsc` sin errores.

Límite: en Tareas el desplegable de estado mide 44 px (mínimo táctil) y la tarjeta ocupa tres líneas. Bajar de ahí exigiría quitar la edición en línea en móvil, que no se ha hecho.

## 22/11/2026 · Búsqueda de Hoy sin acentos

`shared/text-match.ts`, nuevo y probado en `tests/text-match.test.ts`:

- `foldText` quita tildes y diéresis, convierte la ñ en n, pasa a minúsculas en español y junta los espacios.
- `textMatches` exige todas las palabras, en cualquier orden.

El filtro de Hoy (`src/LocalOperations.tsx`) lo usa: «nunez» encuentra «Núñez» y «ana revisar» encuentra «Revisar los detalles · Ana». En el ensayo, «alvaro» devuelve «Revisar los detalles · Álvaro».

`tsc` sin errores; `text-match`, `local-operations`, `overdue`, `auth-parent`, `independent-interface-contexts` y `bundle-budget` en verde.

El código tiene al menos cinco copias locales de esta normalización: `change-history`, `csv-import`, `overdue`, `team-replica-view` y la búsqueda global. Unificarlas en `text-match` queda como mejora aparte, sin urgencia.

## 22/11/2026 · A10-2 · Cobertura declarada

`src/app-shell/coverage.ts` (`coverageStatement`, `notCopiedLine`), probado en `tests/coverage.test.ts` (3/3). Todo sale de la especificación (`coverage.supported` / `unsupported`, que vienen de la captura) y de los recuentos de la captura, nunca de un texto fijo:

- Los campos «conservados como solo lectura» que anota la captura de HubSpot se agrupan en un recuento.
- Sin recuentos no se inventan cifras.

En Continuidad › Estado:

- **Línea visible:** «No se copia: …», con el aviso de que una copia de estos datos no reproduce todas las funciones del CRM, al pie de «Si HubSpot cae ahora».
- **Lista completa:** dentro de «Ver contenido de esta copia» (el texto se conserva por la E2E `continuity.spec`), con los campos solo de consulta y lo cubierto.

Comprobado en el ensayo con la captura de «Agencia Norte». `tsc` sin errores; `coverage`, `continuity-home-hub`, `css-unused`, `color-guard`, `design-tokens`, `bundle-budget` y `ui-copy` en verde.

## 22/11/2026 · A2 · Cuarentena de capturas que encogen

`addCapture` ya rechazaba capturas incompletas respecto a su manifiesto. Faltaba la captura completa en sí misma que trae muchos menos registros que la anterior (borrado masivo, permisos recortados, integración que vacía datos). Una captura nueva no sustituye sola a la copia activa; el riesgo estaba en abrirla con «Continuar trabajando» en plena caída.

- **Regla** (`shared/capture-quarantine.ts`, 4/4): por objeto, no por total.
  - Retiene si un objeto con 10 o más registros conserva menos del 80 %, o si cualquier objeto llega a 0.
  - La primera captura solo se retiene si viene vacía.
- **Servidor** (`server/capture-quarantine.ts` + `server/continuity.ts`):
  - Al capturar se compara con la captura guardada más reciente. Si encoge, se guarda el motivo junto a la captura, que se conserva.
  - `begin` rechaza abrirla (409, con el motivo «Clientes 24 → 0») salvo `confirmQuarantine` con el ID exacto de esa captura. Al confirmarla, sale de la cuarentena.
  - Si la anterior no se puede leer, no se compara: nunca se pierde una captura por esto.
  - `GET /api/v2/continuity` incluye `quarantine`.
- **Continuidad** (`src/ContinuityHome.tsx`): si la última captura está retenida, aviso con el motivo, «Abrir la captura anterior» y «Sé por qué ha encogido: abrirla igualmente». «Continuar trabajando» queda deshabilitado mientras tanto.
- **Comprobación:**
  - `tests/capture-quarantine-api.test.ts`: rechazo, confirmación ligada al ID, estado y liberación.
  - Una mutación (sin la puerta en `begin`) hace fallar la prueba.
  - `tsc` sin errores; pruebas de Continuidad y de captura en verde; inventario de API al día (183).
  - En el ensayo, el estado trae `quarantine: {}` y no hay aviso. No se ha provocado un encogimiento real en la App en marcha (exigiría una captura de HubSpot).

## 22/11/2026 · A3 · Simulacro programado

**Fallo real encontrado.** `tick()` lanzaba el simulacro mensual mirando solo el último informe. Si el proceso aislado no terminaba (no deja informe), cada minuto se lanzaba otro proceso, sin fin.

**Arreglo:**

- **Regla** en `shared/drill-schedule.ts` (`drillPlan`):
  - Toca un simulacro cada 30 días desde el último informe, y enseguida si no hay ninguno.
  - Un intento sin informe frena 6 horas. Un intento anterior al último informe no cuenta y una fecha ilegible no bloquea.
- **`server/continuity.ts`:**
  - El intento se guarda en la copia (`drillLastAttempt`) antes de lanzar el simulacro: sobrevive a un reinicio y no se duplica.
  - Si no arranca, deja el error en `operationError` con qué hacer.
  - `GET /api/v2/continuity` incluye `drillSchedule` (`enabled`, `lastAttempt`, `nextAt`).
- **Continuidad:** con la programación activada muestra «Próximo simulacro automático: …» y aclara que solo se hace con Plan B abierto y que un intento fallido se reintenta a las 6 horas.

**Comprobación:**

- `tests/drill-schedule.test.ts` 3/3, incluida una prueba de `tick()`: tres vueltas con un simulacro que no arranca lo lanzan una sola vez.
- Una mutación (no leer el intento guardado) la hace fallar.
- `v2` y `capture-quarantine-api` (24 pruebas), `continuity-home-hub`, `capture-schedule` y `capture-state` en verde; `tsc` sin errores.

## 22/11/2026 · A10-1 · Parte de incidente unido a la vuelta

`src/app-shell/incident-report.ts` y `incident-download.ts`. El expediente añade el campo opcional `returnEvidence` (el formato anterior no cambia si no hay datos) y la sección «Vuelta a HubSpot», que separa por certeza:

- **Comprobado por relectura de HubSpot**, con fecha. Solo si la comprobación es posterior al inicio del incidente; una anterior o ilegible no lo acredita.
- **Marcado como devuelto** sin comprobación registrada.
- **Operaciones enviadas sin confirmar:** resultado incierto, que no se repite solo.
- **Operaciones fallidas.**
- **Cambios pendientes.**

Los datos salen de `/v2/changes`: el plan con el estado de cada operación y el informe de la comprobación manual.

`tests/incident-report.test.ts` pasa de 6 a 8 pruebas; `tsc` sin errores. El JSON firmado incluye el campo nuevo y la huella lo cubre.

## 22/11/2026 · B4.8 · Integraciones según capacidades reales

`src/LocalIntegrations.tsx`: sin espacio de equipo configurado, las cinco herramientas de Google van plegadas en «Ver herramientas de Google Workspace», igual que cuando el espacio existe (lo hizo Copilot). La nota común dice qué falta (`PLANB_TEAM_ORIGIN`).

Si la lectura del espacio falla y las filas llevan «Reintentar» o una acción, no se pliegan: un error nunca se esconde.

- La E2E `tests/e2e/local-integrations.spec.ts` despliega las herramientas antes de revisarlas. Compila; no se ha ejecutado en navegador (falta Chromium 1248).
- `local-integrations`, `css-unused`, `ui-copy` y `bundle-budget` en verde; `tsc` sin errores.
- En móvil pasa de 1,84 a 1,75 pantallas; comprobado en la captura de 1440 px.

## 22/11/2026 · B2 · Primera capa retirada: `refinements.css`

**Método.** Referencia visual de las 19 rutas a 1440 y 390 px con `tools/visual/composition.mts`, quitar la capa, volver a capturar y comparar píxel a píxel con `tools/visual/compare-shots.mts`. El comparador es nuevo, sin dependencias, y decodifica en el navegador.

**Lo que se aprendió al quitarla sin más:**

- Las 38 capturas cambiaban: el enlace «Saltar al contenido» quedaba visible arriba.
- La hoja sostenía además piezas que las capturas no recorren: el velo de la ficha (`.drawer-shade` fijo a toda pantalla, que cierra al pulsar fuera) y la altura máxima de las ventanas.
- Trasladar regla a regla a `consola.css` habría cambiado el orden de la cascada.

**Solución exacta.** `refinements.css` se cargaba justo después de `styles.css`, así que su contenido se ha añadido al final de `styles.css` y se ha retirado la importación (`src/main.tsx`), la hoja (`git rm`) y sus importaciones en 15 arneses de prueba y en `tools/team-audit/harness.tsx`. La cascada queda idéntica y hay una capa menos (11 → 10).

**Comprobación:**

- **Capturas:** las 38 son iguales a la referencia. Una diferencia inicial en Inicio móvil resultó ser ruido de la propia referencia, con una tarjeta diferida sin pintar; confirmado repitiendo la captura.
- **En la App:** el velo de la ficha sigue fijo a toda pantalla y el enlace de salto sigue oculto hasta recibir el foco.
- **Pruebas:** `tsc` sin errores; `color-guard`, `css-unused`, `design-tokens`, `design-k-block` y `bundle-budget` en verde.
- **Colores fijos:** la línea base de `styles.css` sube de 59 a 100 porque recibe los 41 de `refinements.css`. El total de la app no cambia.

**Siguiente capa:** `operaciones-claras.css`, con el mismo método. La poda automática no encontró aún reglas muertas: el ahorro real llegará al convertir estas reglas a tokens por pantalla.

## 22/11/2026 · B2 · Segunda capa retirada: `operaciones-claras.css`

Mismo método exacto: su contenido va al final de `planb-ui.css` (la hoja que se cargaba justo antes), dentro del bloque marcado «B2 · OPERACIONES CLARAS». Se retiran la importación de `src/main.tsx`, la del arnés `tools/team-audit/harness.tsx` y la entrada de `tools/visual/css-trim.mjs`. Capas globales: 10 → 9.

- **Capturas:** 19 rutas a 1440 y 390 px, comparadas con una referencia tomada justo antes: las 38 son iguales. Al ocupar la misma posición en la cascada, el modo oscuro tampoco cambia.
- **Prueba de orden de carga** (`tests/design-tokens.test.ts`): ahora exige `planb-ui`, `faro` y `consola` al final, y lee los tokens de Operaciones claras del bloque marcado, con el mismo control de contraste AA.
- **Colores fijos:** la línea base de `planb-ui.css` pasa de 3 a 6 (recibe los 3 de la hoja retirada); el total no cambia.
- **Pruebas:** `tsc` sin errores; `color-guard`, `css-unused`, `design-tokens`, `design-k-block`, `bundle-budget` y `record-sheet` en verde.

## 23/11/2026 · Verifica · Dirección visual «Dictamen» en verifica.html

**Por qué.** La usuaria veía la interfaz igual que antes y no le gustaba el diseño. El plan de producto no pedía rediseño, y el recorrido de pasos del plan («Dirección de la app», punto 4) no estaba hecho. Se prepararon dos direcciones en un lienzo (A «Dictamen», B «Sala de control») y la usuaria eligió A.

**Qué cambia (solo `src/verifica/` y sus pruebas):**

- Marco común (`Masthead.tsx` → `Frame`): barra con producto, origen, abrir y descargar; a la izquierda, los pasos del encargo. Los pasos 1 a 3 (Operación, Fuentes, Capturas) solo se nombran, porque se hacen con el lector. Hallazgos e informe, Vigilancia y Después del cierre navegan con `aria-current="page"`. En un archivo abierto no navegan.
- Informe: el `h1` es la conclusión, con hasta tres cifras clave encima de los hallazgos. Cada hallazgo lleva número, cifra clave a la derecha y de qué fuente sale, con fechas en vez de huellas. Debajo, en dos tarjetas, lo que no se pudo comprobar y el sello con la huella y las fuentes.
- `summary.ts` (nuevo, puro): conclusión, cifra clave, cifras del resumen y procedencia, todo sacado de `figures`. La conclusión no habla de «% de la cartera abierta», porque la regla de la ventana suma también oportunidades ya ganadas o perdidas.
- Vigilancia: el `h1` nombra los avisos. Equivalencia: el `h1` es el veredicto.
- `verifica.css` reescrita: serifa del sistema para titulares y cifras, rojo solo para lo que se sale de lo normal; claro y oscuro. No se descargan fuentes (decisión 17/11): la página sigue funcionando sin conexión.

**Comprobación.** `verifica-pagina` adaptada en tres puntos (navegación con `aria-current`, veredicto en el `h1`, motivo de la exportación parcial en la frase de resumen) y `verifica-resumen` nueva: 83/83 junto con `color-guard`, `css-unused`, `design-tokens`, `ui-copy` y `bundle-budget`. `tsc` sin errores. `scripts/verifica-pruebas.ts`: fases 1 a 4 pasan; la 0 sigue pendiente de declarar. Capturas con Chromium sin interfaz a 1440 y 390 px y en oscuro, sin errores en consola ni desbordes, con `tests/.tmp/verifica-vista/shots.mts`. Vista previa sin recorrer las instalaciones: configuración `verifica` de `.claude/launch.json` (`tests/.tmp/verifica-vista/vite.config.ts`). Sin commit.

## 23/11/2026 · Verifica · Lo pendiente que se podía cerrar en este ordenador

Aquí sí se pueden abrir procesos y un navegador sin interfaz. Para la lista viva de `registro-colaboracion.md` (la coordina Copilot), se pueden tachar:

- **Subir `shared/billing-check.ts`:** hecho en `65a8e97`.
- **Recorridos a mano de las fases 2, 3 y 4:** hechos con `scripts/verifica-ejemplo.ts`, `verifica-sala-limpia.ts`, `verifica-vigilancia.ts` y `verifica-migracion.ts` en `tests/.tmp/verifica-recorrido`. Los tres terminan con salida 0.
- **Revisión visual de `verifica.html` con documentos abiertos (fases 2, 3 y 4):** `tests/.tmp/verifica-vista/recorrido.mts` da 40 de 40, en escritorio, móvil y oscuro:
  - el informe, el parte y la equivalencia abiertos desde archivo, con sus huellas;
  - la copia custodiada, que se acepta con su llave y se rechaza con otra, y la llave se borra del campo;
  - el teclado, con el orden de foco y el foco visible, también en «Abrir un informe»;
  - la impresión, sin botones, pasos ni conmutador.
  
  En móvil, la tabla de la equivalencia desbordaba la página. Arreglado en `verifica.css` con `grid-template-columns: minmax(0, 1fr)` en `.vf-page`.
- **Pruebas que abren procesos:** ejecutadas con `NODE_ENV=test`, ninguna lanza PowerShell.
  - `api-inventory`, `independent-return-barriers` y `task-revision-*`: 188 pruebas. Una fallaba porque `task-revision-generation-launcher` aún mandaba `prompt` a `/api/generate`, que desde la tanda 3 es estricto. Corregida la prueba.
  - `docs/api.md` regenerado: 96 rutas, sin las del Laboratorio. `--check` al día.
  - `release-candidate-adversarial`, `release-candidate-completeness` y `candidate-integrity`: 46 de 47. Cuatro las rompió la tanda 2: los recuentos 17/14 y «seis procesos esbuild» con `team.mjs`. Ahora usan `runtime.mjs`, los recuentos 14/11 y `BUNDLES.length`. La que queda («0 · la herramienta probada es exactamente la presentada», huella de REL046) ya fallaba antes del aparcado: comprobado ejecutando las mismas pruebas sobre `archivo/aparcado-2026-11-22`.

**Sigue abierto:** las pruebas de navegador que mezclan la app de equipos, las dependencias de la app de equipos, las herramientas que nombran 4334, `ABRIR PLAN B.cmd`, la tabla `usage`, la declaración de la fase 0 y todo lo que necesita cuentas reales o abogados. Todo eso está ordenado en el mega plan 2 (Claude Docs, «Plan B · Mega plan 2», 23/11/2026), fases A a F.

## 23/11/2026 · Mega plan 2 · Fases A y C

Plan en Claude Docs, «Plan B · Mega plan 2». La usuaria pidió seguirlo «usando lo que mejor encaje»: se toman como decididas sus recomendaciones. El CRM congelado será la «Copia de trabajo» de Verifica, la fase 0 se declara al terminar la E y se quitan las dependencias de lo aparcado.

**Fase A · Cerrar el aparcado**

- Raíz con 6 documentos: `README`, `AGENTS`, `CLAUDE`, `COORDINACION`, `CONTEXTO-PROYECTO` y `PRODUCT`. Los otros 22 pasan a `docs/historial/` con `git mv`, con su propio `README`. `scripts/package-demo.ts` lee de allí la guía del kit (`LEEME-v0.6.0.md`) y los documentos que empaqueta. Se actualizan el enlace del archivo en `CONTEXTO-PROYECTO.md` y los comentarios que citaban `DESIGN.md`.
- `README.md` y `PRODUCT.md` reescritos para Verifica, con el esquema de `PRODUCT` intacto.
- `ABRIR PLAN B.cmd` llamaba a `start-google-pilot.cjs`, que ya no existe, y abría `4334/team`. Ahora arranca el CRM con `scripts/start-full-workspace.cjs` y abre `127.0.0.1:4331`. El lanzador ya no pasa `PLANB_TEAM_ORIGIN`, que el servidor no lee desde la tanda 2. `full-workspace-launcher` da 7/7.
- Fuera: `Dockerfile.team`, `.dockerignore`, `infrastructure/gcp` y `scripts/audit-ui.mjs`, todos de la app de equipos y presentes en `archivo/aparcado-2026-11-22`. `workspace-preflight` conserva el servicio `pilot`, que solo se usa si se elige.
- Pruebas de navegador:
  - Retiradas porque solo prueban la app de equipos: `ui-redesign`, `full-workspace` y los casos 2 y 3 de `v6`.
  - `continuity-home-hub` se queda (se retiró por error y se restauró: `tests/continuity-home-hub.test.ts` la lee). Su recorrido en navegador falla desde el 13/11, porque el rediseño Faro quitó de `App.tsx` el ancla del parche. No tiene que ver con el aparcado.
  - Ajustadas `local-integrations` (sin Google ni espacio de equipo), `v6` caso 1 (el logo de HubSpot) y `preparation-navigation:180`.
  - Con `node tools/e2e/isolated.mjs`: `local-integrations` y `v6` dan 14/14. Las 9 de `preparation-navigation` exigen la configuración privada `private117` y no corren aquí.
- Arreglo real que encontró la prueba de diseño: el botón «Actualizar resultado» de la comprobación de lectura medía menos de 32 px de alto en escritorio (`hubspot-read-check.css`).
- **Pendiente, lo tiene la usuaria:** el sistema de permisos no deja ejecutar `npm uninstall`. Comando: `npm uninstall @azure/msal-node @firebase/app @firebase/auth @google-cloud/tasks @microsoft/agents-copilotstudio-client firebase-admin google-auth-library pg @electric-sql/pglite @types/pg`. `git grep` confirma que nada vivo los importa.

**Fase C · Una pieza para cada cosa**

- **Build roto en GitHub desde `65a8e97`:** `src/billing/BillingCheck.tsx` importaba `billing-check.css`, que nunca existió. El prototipo de facturación (producto para climatización) se aparca: `src/billing`, `shared/billing-check.ts`, su prueba y `scripts/build-billing-check.mjs` salen, el plan del piloto pasa a `docs/historial/` y `vite.config.ts` deja de compilarlo. `vite build` vuelve a funcionar (comprobado en `tests/.tmp/vite-check`). Todo sigue recuperable en `65a8e97`.
- **Retirados:**
  - el motor de capturas genérico (`crm-capture-contract` y `crm-capture-runner`), que solo usaban sus pruebas;
  - Zendesk y las dos pantallas que no estaban conectadas, `SourceReadingHistory` y `SourceStatusRow`, junto con su diario, su estado y sus pruebas.
- **Se queda el lector de Pipedrive** (`pipedrive-source`, `source-reading`, `source-read-transport`), candidato a lector del CRM del comprador en la fase D.
- **La «captura retenida» no estaba duplicada:** `shared/verifica/rules.ts` y `watch.ts` ya usan `assessShrink` de `capture-quarantine`. Corregido en el plan.
- **Comprobación:** `tsc` limpio; guardas, Pipedrive, Verifica y `api-client-routes` dan 109/109; `docs/api.md` al día, con 96 rutas.

**Siguiente:** fase D, ya diseñada en el plan, por cortes. El primero es el encargo y las fuentes desde archivos, con las mismas huellas que los scripts.

## 24/11/2026 · Mega plan 2 · Fase D, corte 1: encargo y fuentes desde la pantalla

**Qué se puede hacer ahora.** Con `verifica.html` servida por el servidor local aparecen los pasos 1 (Operación) y 2 (Fuentes), y la página abre en el 1. Se crea un encargo y se le suben las dos capturas, el libro de facturas y las cifras declaradas, cada una con su estado (Falta, Sirve, En espera, No sirve), su resumen y su huella. Una fuente que no sirve no se guarda, y su fila explica por qué. Abierta suelta, como la recibe el comprador, la página sigue siendo el visor sin conexión, con los pasos 1 y 2 solo nombrados.

**Piezas:**

- `shared/verifica/inputs.ts` (nuevo): la validación de capturas y declaraciones, compartida con los scripts. `scripts/verifica-sala-limpia.ts` la usa con los mismos mensajes; `loadCapture` y `loadDeclarations` siguen exportados para vigilancia y migración.
- `shared/verifica/engagement.ts` (nuevo, puro): describe cada fuente guardada. Su huella se calcula igual que en el informe (`fingerprintOf` del objeto que entra en la sala limpia). Las facturas esperan a la captura más reciente porque se asignan a sus empresas; la anterior tiene que ser anterior a la reciente.
- `server/verifica/engagements.ts` (nuevo), montado solo en `server/main.ts` (el portátil no lleva conectores). Las rutas son `/api/verifica/health`, `engagements` (GET y POST), `engagements/:id` y `engagements/:id/sources/:role` (PUT y DELETE). Guarda cifrado en la tabla `meta` del almacén (`verifica:engagements`, `verifica:source:<id>:<rol>`), sin tocar el esquema. Las respuestas nunca devuelven el texto guardado. Hereda las guardas del servidor: la de origen rechaza una página servida desde otro puerto.
- `src/verifica/engagement-client.ts` y `src/verifica/Engagements.tsx` (nuevos). `Masthead.tsx` tiene un origen `local` y los pasos 1 y 2 navegables. `VerificaReport.tsx` detecta el servidor con `/api/verifica/health`.
- `docs/api.md`: 102 rutas.

**Comprobación:**

- `verifica-encargos` (4/4): las huellas que enseña la pantalla son las mismas que firma el informe de `verifica-sala-limpia.ts` con los mismos archivos.
- `verifica-pasos` (3/3) y el resto de pruebas de Verifica: 68.
- `api-client-routes`, guardas y huérfanos en verde; `tsc` limpio.
- En navegador, con `tests/.tmp/verifica-vista/encargo.mts` contra un servidor aislado (`start-api.mjs`, 4581, `NODE_ENV=test`, datos nuevos, página compilada en su `dist`): 40/40 en escritorio, móvil y oscuro. Incluye el archivo equivocado rechazado, las cuatro fuentes válidas, las huellas iguales a las del informe del script, la vuelta al paso 1 con el encargo listo, sin servidor el visor de siempre y ningún desborde.

**Siguiente:** corte 2, la sala limpia con un botón (`engagementInputs` ya devuelve lo que entra en ella), con el informe igual byte a byte que el del script.

## 24/11/2026 · Mega plan 2 · Fase D, corte 2: la sala limpia con un botón

**Qué se puede hacer ahora.** En el paso 2, cuando las fuentes están listas, el botón «Emitir el informe» pasa la sala limpia y saca tres cosas por separado: el informe para el comprador, la copia custodiada para quien la guarda y la llave de esa copia. La llave solo se ofrece justo después de emitir («Guarda ahora la llave…») y no se pinta en la pantalla. Después se pueden descargar el informe y la copia cuantas veces haga falta, y «Ver el informe» lo abre en el visor, donde se comprueba la copia con su llave («Volver a las fuentes» regresa). Si cambia alguna fuente, la emisión queda desfasada y aparece «Volver a emitir». Si la barrera encuentra un texto del CRM, no sale nada (422), sin decir qué texto es.

**Piezas:**

- `shared/verifica/inputs.ts`: `cleanRoomInput`, la entrada de la sala limpia, la misma para el script y el servidor (el corte es la fecha de la captura más reciente).
- `scripts/verifica-sala-limpia.ts`: la usa y acepta `deps.cleanRoom` con sal y llave fijas, solo para pruebas.
- `server/verifica/engagements.ts`:
  - `POST .../clean-room` llama a `runCleanRoom`. Guarda en `verifica:issue:<id>` el informe, la copia, sus huellas y las huellas de las fuentes de las que salió. La llave solo va en la respuesta; no se guarda en ningún sitio.
  - `GET .../issue/report` y `.../issue/custody` devuelven lo emitido, con `no-store`.
  - La vista de cada encargo lleva `issue`, y su resumen, `issued`.
- `shared/verifica/engagement.ts`: tipos `IssueSummary` e `IssueResult`.
- `src/verifica`: panel de emisión en `Engagements.tsx`, `issueCleanRoom` e `issueFile` en el cliente, `downloadText` en `documents.ts` y `backLabel` en el origen `opened`. `docs/api.md`: 104 rutas.

**Comprobación:**

- `verifica-encargos` 7/7: con la misma sal y llave, el informe del servidor es idéntico byte a byte al del script; la copia se abre con su llave y rehace el mismo informe; la llave no aparece en ninguna otra respuesta ni en el almacén; cambiar una fuente deja la emisión desfasada.
- `verifica-pasos` 4/4, Verifica completa, rutas documentadas y guardas en verde; `tsc` limpio.
- En navegador, con `tests/.tmp/verifica-vista/emitir.mts` contra el servidor aislado: 36/36 en escritorio, móvil y oscuro. Incluye emitir, descargar los tres archivos por separado, la huella del informe descargado igual a la de la pantalla, la llave ausente del informe y de la copia, ver el informe, comprobar la copia con su llave en el visor y la emisión desfasada al cambiar una fuente.

**Siguiente:** corte 3, leer HubSpot desde la pantalla con la autorización vigente. Con el HubSpot simulado tiene que dar lo mismo que el script; con uno real, en la fase B.

## 24/11/2026 · Mega plan 2 · Fase D, corte 3: leer HubSpot desde la pantalla

**Qué se puede hacer ahora.** El paso 3, «Capturas», ya navega. Se elige qué cuenta se lee: la de la empresa que se vende, con su `autorizacion.json` y el documento firmado, o un portal de pruebas, con la casilla «Autorizo leer el portal de pruebas entero». Después se escriben el número de portal y la credencial, y se elige dónde entra la captura: como anterior, como más reciente, o como más reciente pasando la actual a anterior. La pantalla propone el sitio según lo que ya hay. «Leer HubSpot» arranca la lectura en segundo plano y se ve lo leído (comerciales, empresas, contactos, oportunidades). Al terminar, la captura queda guardada como fuente del encargo. En la cuenta de la empresa queda además un acta, descargable y listada en «Actas de lectura». Si la autorización no sirve (otro portal, caducada, alcance corto o un documento que no es el firmado), se para antes de la primera petición y lo dice.

**La credencial:**

- Va en un campo de contraseña no controlado: React copiaría el valor de un campo controlado al atributo del HTML.
- Viaja solo en la petición que arranca la lectura y sale del campo en cuanto el servidor la acepta. Si la lectura se rechaza, se queda en el campo para reintentar.
- En el servidor solo vive en memoria mientras dura la lectura. No se guarda ni vuelve en ninguna respuesta, ni siquiera en un error.

**Piezas:**

- `server/verifica/hubspot-read.ts` (nuevo): `readWithRecord`, la lectura y su acta. El acta cuenta lo que pasó por el transporte. La comparten el script y el servidor. También están aquí `recordToText` y `credentialProblem`.
- `scripts/verifica-hubspot.ts`: usa esa pieza. Su salida no cambia.
- `server/verifica/engagements.ts`:
  - `POST .../read` responde 202. Da 409 si ya hay una lectura en marcha y 422 si algo no sirve, sin hacer ninguna petición.
  - `GET .../read` devuelve el estado.
  - `GET .../records` devuelve las actas y `GET .../records/:captureId` el texto de una, con `no-store`.
  - Las opciones `hubspotFetch` y `hubspotNow` existen para las pruebas.
  - Las actas se guardan en `verifica:records:<id>` y `verifica:record:<id>:<captura>`, sin tocar el esquema.
- `shared/verifica/engagement.ts`: tipos `ReadRequest`, `ReadTarget`, `ReadJob` y `RecordSummary`, y límites `READ_LIMITS` (documento firmado hasta 10 MB).
- `src/verifica/Captures.tsx` (nuevo), `startRead`, `readStatus`, `listRecords` y `recordFile` en el cliente, y el paso 03 navegable en `Masthead.tsx`. `docs/api.md`: 108 rutas.
- `tests/helpers/fake-hubspot.ts` (nuevo): el HubSpot simulado, sacado de `verifica-lectores` para compartirlo.
- `docs/verifica-salir-a-vender.md`: la lectura de la hora 0 y la de la hora 24 también se pueden hacer desde la pantalla.

**Comprobación:**

- `verifica-lectura` 3/3:
  - en modo cliente, la captura guardada y el acta son idénticas byte a byte a las del script, con las mismas peticiones;
  - siete entradas que no sirven se paran sin ninguna petición a HubSpot;
  - una lectura a la vez y la rotación funcionan;
  - una cuenta real en modo pruebas se para sin guardar nada;
  - la credencial no está en el almacén ni en las respuestas.
- `verifica-pasos` 6/6 y `verifica-lectores` 13/13. Rutas documentadas, guardas y `tsc` en verde.
- En navegador, `tests/.tmp/verifica-vista/capturas.mts` contra `start-api-fake.mjs`, un servidor aislado en el 4582 con el HubSpot simulado y ninguna cuenta real: 72/72 en escritorio, móvil y oscuro. El recorrido:
  - lee el portal de pruebas como anterior;
  - rechaza un documento equivocado sin leer;
  - lee la cuenta de cliente como reciente;
  - comprueba que el acta descargada tiene la huella de la pantalla y que solo contiene lecturas y búsquedas;
  - comprueba que las dos capturas aparecen en las fuentes;
  - comprueba que la credencial no aparece en la página ni en ninguna respuesta.
- Los recorridos de los cortes 1 y 2 siguen en 40/40 y 36/36.

**Sin probar:** una cuenta real de HubSpot. Eso es la fase B, con la cuenta de pruebas del usuario.

**Dependencias de lo aparcado.** El 24/11 el usuario ejecutó el `npm uninstall` de las diez (`@azure/msal-node`, `@firebase/app`, `@firebase/auth`, `@google-cloud/tasks`, `@microsoft/agents-copilotstudio-client`, `firebase-admin`, `google-auth-library`, `pg`, `@electric-sql/pglite`, `@types/pg`). Ya no están en `package.json` ni en `node_modules`. Ningún archivo de código las importa; solo las nombran los paquetes viejos de `build/`, que no están en git y que el arranque no usa (`start-full-workspace.cjs` tira de su propia instalación). `tsc` y `vite build` pasan sin ellas.

**Siguiente:** corte 4, la vigilancia automática con el temporizador.

## 24/11/2026 · Mega plan 2 · D5: migración con la captura de cierre de la vigilancia

**Qué hay.** Si el encargo tiene vigilancia, «Después del cierre» propone su última captura, con fecha y huella, y conserva la carga manual. El navegador envía solo destino, mapa y fecha. `POST /api/verifica/engagements/:id/watch/migration` toma en el servidor la captura, el parte de esa fecha y la sal del encargo. Responde con el informe y la lista privada, con `no-store`.

**Regla elegida por la usuaria:** si la última captura está retenida, `409` hasta aceptar su huella. No se cambia por la última aceptada.

**Comprobado:**

- `verifica-watch-api` cubre `409`, `404` y `422`.
- Tras aceptar la huella, el resultado es idéntico byte a byte a la carga manual. El mutante sin la regla falla.
- Pruebas focales, `tsc` y batería segura en verde.
- Sin navegador, servidor, PowerShell ni DPAPI.

**Pendiente:** regenerar `docs/api.md` con las cuatro rutas, bajo la reserva `CLAUDE-API-INVENTORY`. La fase B necesita la cuenta de pruebas de HubSpot y un CSV anonimizado de Holded.
