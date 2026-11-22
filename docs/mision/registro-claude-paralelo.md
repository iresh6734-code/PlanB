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
