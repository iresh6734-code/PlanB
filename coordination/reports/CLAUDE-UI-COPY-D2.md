# CLAUDE-UI-COPY-D2 · Textos claros en la interfaz

**Autor:** Claude (Opus 5.5) · **Fecha:** 17/11/2026 · **Origen:** mejora D2 del informe, por orden del usuario. Los componentes compartidos se editaron con su autorización.

## Qué cambió

- **Un solo nombre para lo inventado: «datos de prueba».** Antes convivían «ficción», «Ensayo · ficción», «Datos de ensayo», «Local · Ensayo» y, en el menú nuevo, «Datos de prueba». Se cambiaron:
  - 4 textos de «ficción» (Comprobar una fecha, Revisar una decisión, Ensayar mi semana);
  - 3 sellos «Ensayo · ficción»;
  - 10 «Datos de ensayo» o «Local · Ensayo», en la barra superior, Inicio, Continuidad, Preparación, Buscar, Ficha de tarea, Inspección de copia, Evidencia, Radar y la cabecera móvil.
- **«Sin demostrar» pasa a «sin comprobar»** (3 textos: Evidencia y Laboratorio de caídas). Dice lo que falta hacer.
- Los «pin» que salían en la búsqueda eran identificadores internos del código y nunca se mostraban, así que no se tocaron. Tampoco los textos del servidor ni ningún identificador.
- **`docs/voz.md`** (nuevo) es el glosario: qué usar, en lugar de qué y por qué, más tres reglas (errores con qué hacer, nada de identificadores internos, lo inventado siempre con el mismo nombre). Recoge también los términos ya decididos: Propuestas, Laboratorio, Bloquear y el ID solo con homónimos.
- **`tests/ui-copy.test.ts`** (nuevo) recorre los textos visibles de todos los `.tsx` de `src/` y falla si vuelve un término retirado. En su primera ejecución encontró 7 casos que el inventario manual no había visto.

## Archivos

Las huellas de antes de los 16 archivos de interfaz están en el scratchpad (`hashes-before-d2.txt`).

| Archivo | Tipo |
| --- | --- |
| `docs/voz.md` | nuevo · `481815d2…02ba6` |
| `tests/ui-copy.test.ts` | nuevo · `e72b91d8…6cb9` |
| `tests/continuity-lab-ui.test.ts` | «Sin demostrar» → «Sin comprobar» |
| `src/DateCheck.tsx`, `DecisionReview.tsx`, `OperationalRehearsal.tsx`, `RehearsalTodayEntry.tsx`, `ContinuityEvidence.tsx`, `ContinuityLab.tsx`, `ContinuityHome.tsx`, `CopyInspection.tsx`, `LocalTaskFocus.tsx`, `Preparation.tsx`, `WorkspaceSearch.tsx`, `CommitmentRadar.tsx`, `HomeOverview.tsx`, `App.tsx`, `app-shell/TopBar.tsx` | compartidos; solo cambian textos |

## Verificación

- `tests/ui-copy.test.ts` **2/2**: ningún término retirado, y el detector sí ve los textos JSX y literales mientras ignora rutas e identificadores.
- Suites de los componentes tocados: `continuity-lab-ui` 16/16, `ui-journeys` 60/60, `independent-interface-contexts` 47/47, `continuity-hub` 5/5, `workspace-search` 9/9, `local-task-focus` 11/11, `date-check-mount` 8/8, `date-check-review-mount` 4/4, `operational-rehearsal-mount` 9/9, `continuity-evidence` 18/18 y `preparation-review` 12/12. `tsc` 0.

## Pendiente

- Tres E2E esperan los textos antiguos y hay que adaptarlos con el resto: `continuity-evidence`, `continuity-lab` y `operational-rehearsal`.
- Los mensajes del servidor que llegan a la pantalla (por ejemplo, los 409 del Laboratorio) mantienen sus textos. Revisarlos toca las reservas de sus módulos.

## R2 · Revisión 401 de Codex

**Hallazgo (correcto).** El detector de la prueba solo veía dos formas de texto: el que va entre etiquetas JSX y los literales entre comillas simples. Dejaba pasar tres:

- literales entre comillas dobles;
- plantillas;
- nombres accesibles como `aria-label="…"`.

**Corrección** (`tests/ui-copy.test.ts`, solo la prueba). `visibleTexts` mira ahora:

- el texto entre etiquetas;
- los literales entre comillas simples y entre comillas dobles, que incluyen todos los atributos JSX (`aria-label`, `title`, `placeholder`…);
- las partes fijas de las plantillas, partidas por `${…}`.

Siguen sin contar las rutas (lo que empieza por `.` o `/`) ni los identificadores sueltos (nombres de clase, claves e IDs).

**Pruebas** (**3/3**):

- La nueva prueba R2 recoge los seis controles de la revisión. El término actual pasa. Se rechazan el texto directo, las comillas simples, las comillas dobles, la plantilla y el `aria-label`.
- También comprueba que no cuentan una ruta entre comillas dobles, una clase ni una plantilla sin texto.
- Con el detector ampliado, **ningún** `.tsx` de `src/` usa un término retirado: no apareció ningún texto escapado.
- **Mutaciones:** quitar la lectura de comillas dobles o la de plantillas hace fallar la prueba R2.

**Huella R2:** `tests/ui-copy.test.ts` `8fa65525da5f…`. Los componentes no cambian.
