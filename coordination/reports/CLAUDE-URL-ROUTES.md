# CLAUDE-URL-ROUTES · Dirección propia para cada apartado y cada ficha

**Autor:** Claude (Opus 5.5) · **Fecha:** 17/11/2026 · **Origen:** mejora B1 del informe, por orden del usuario. `src/App.tsx` se editó con su autorización («tómalos y avisa»).

## Qué cambia

Cada lugar tiene su dirección, así que se puede enlazar, recargar y recorrer con Atrás y Adelante del navegador:

| Lugar | Dirección |
| --- | --- |
| Inicio | `/inicio` |
| Hoy · Propuestas | `/hoy` · `/hoy/propuestas` |
| Clientes · Empresas · Oportunidades · Tareas | `/clientes` · `/empresas` · `/oportunidades` · `/tareas` |
| Una ficha | `/clientes/<id>` (ID codificado; también vale con `/`, `?`, `#` o espacios) |
| Continuidad · Cambios · Exportar · Copia de equipo | `/continuidad` · `/continuidad/cambios` · `/continuidad/exportar` · `/continuidad/equipo` |
| Integraciones · Preparación | `/ajustes/integraciones` · `/ajustes/preparacion` |
| Laboratorio | `/laboratorio/radar` · `/laboratorio/fecha` |

Comportamiento:
- **La raíz `/`** abre el apartado recordado, como antes, y la dirección pasa a la de ese apartado **sin añadir** una entrada al historial.
- **Navegar** añade una entrada. **Atrás** cierra la ficha abierta y vuelve al apartado anterior.
- **Una ficha pedida por la dirección** (enlace o recarga) se abre en cuanto la copia está lista. Si no existe, avisa: «No se encontró esa ficha en tu copia…».
- Siguen vigentes las reglas de cada lugar: un apartado del Laboratorio con datos reales vuelve a Inicio, y una copia portátil no tiene Hoy.
- `/team` sigue siendo la App de equipo. El servidor ya devuelve `index.html` en cualquier ruta que no sea de la API.

## Archivos

| Archivo | SHA-256 |
| --- | --- |
| `src/app-shell/routes.ts` (nuevo, puro) | `187be976…df67` |
| `tests/url-routes.test.ts` (nuevo) | `8be40d06…b3e` |
| `src/App.tsx` (compartido; estado inicial, tres efectos y un `ref`) | antes `fb948356…b4ae3` · después `3e36bac8…c7ed` |

## Verificación

- `tests/url-routes.test.ts` **4/4**:
  - las 15 direcciones son distintas y vuelven a su lugar;
  - IDs con caracteres especiales en un solo segmento, de ida y vuelta;
  - raíz, `/team`, `/api`, rutas desconocidas, codificación rota o ID de más de 200 caracteres no abren nada;
  - `samePlace`.
- Suites que montan la App: `auth-parent` 4/4, `independent-interface-contexts` 47/47, `continuity-home-hub` 5/5, `task-outcomes-host` 12/12, `ui-journeys` 60/60, `navigation-model` 6/6 y `undo-last` 7/7. `tsc` 0.
- **Navegador** (ensayo aislado, Chromium sin interfaz):

  | Paso | Resultado |
  | --- | --- |
  | Abrir `/` | `/inicio` |
  | Pulsar Clientes | `/clientes` |
  | Abrir Lucía Martín | `/clientes/contact-1`, con la ficha abierta |
  | Atrás | `/clientes`, ficha cerrada |
  | Atrás de nuevo | `/inicio` |
  | Adelante | `/clientes` |
  | Enlace directo `/oportunidades/deal-1` | Abre la ficha «Rediseño web · Estudio Arce» |
  | Recargar | Conserva la dirección y la ficha |
  | `/clientes/no-existe-123` | Avisa y queda en `/clientes` |
  | `/continuidad/cambios` | Abre Cambios |

  Sin errores de página.

## Límites

- Una ficha nueva no tiene dirección propia, porque todavía no existe.
- Los filtros y la búsqueda de la lista no van en la dirección. Las vistas guardadas, de otra unidad, cubren ese caso.
- Los E2E que comprueban la dirección `/` después de navegar tendrán que esperar la nueva. No se han ejecutado.

## R2 · Revisión 411 de Codex

**Hallazgo (correcto).** Si la persona abría un enlace a una ficha y, antes de que respondiera su lectura, pulsaba Inicio, la respuesta abría la ficha encima de Inicio. Además, la dirección se quedaba en la del enlace. Con un error ocurría lo mismo: el error de esa lectura abandonada aparecía en Inicio.

**Corrección:**

- **`src/app-shell/routes.ts`.** Nueva función pura `pendingStillWanted(pending, current)`: la ficha pedida solo sigue queriéndose mientras la persona está en la lista de ese tipo de registro.
- **`src/App.tsx`:**
  - un efecto retira la lectura pendiente en cuanto la persona va a otro lugar (otro apartado u otro tipo de registro). La limpieza del efecto de lectura la desactiva, así que ni su resultado ni su error tocan la vista, y la dirección vuelve a seguir al lugar;
  - Atrás y Adelante sustituyen siempre la lectura pendiente por la del nuevo destino, o la dejan sin ninguna si el destino no es una ficha.

**Pruebas** (`tests/url-routes.test.ts`, **6/6**):

- la regla pura en los cuatro casos;
- `App.tsx` retira la lectura al navegar, Atrás/Adelante la sustituye, y el resultado y el error solo actúan si la lectura sigue activa.

**Recorrido real** en Chromium sin interfaz contra el ensayo aislado (API 4421, UI 5199, datos de prueba). Se retiene la respuesta real de `GET /api/v2/records/contacts/contact-1` sin reemplazar `fetch`. El guion está en el scratchpad (`routes-r2.mts`).

| Caso | Versión anterior (commit `a9acb2b`) | Con R2 |
| --- | --- | --- |
| Se queda en el enlace y llega la ficha | `/clientes/contact-1`, ficha abierta | igual: ficha abierta |
| Pulsa Inicio y llega la ficha | **`/clientes/contact-1`, ficha encima de Inicio** | `/inicio`, sin ficha |
| Pulsa Inicio y llega un 404 | `/inicio`, **error visible** | `/inicio`, sin error |

En ningún caso hubo errores de página. `tsc` 0.

**Huellas R2:**

| Archivo | Huella |
| --- | --- |
| `src/App.tsx` | `210b334a273a` |
| `src/app-shell/routes.ts` | `c7cfc74e4f3a` |
| `tests/url-routes.test.ts` | `9c036b8e5817` |

`App.tsx` lleva también los cambios de tipos de UNDO-LAST R3.

## R3 · Revisión 427 de Codex

**Hallazgo (correcto).** La regla de vigencia de R2 solo distinguía apartado y tipo de registro. Si mientras se retenía la lectura de `/clientes/contact-1` la persona abría a Pablo García en la misma lista, el 200 retrasado de Lucía sustituía la ficha que había elegido.

**Corrección.** La lectura se liga a la intención exacta:

- **`pendingStillWanted`** (`src/app-shell/routes.ts`) recibe también la ficha abierta. La lectura sigue vigente solo si no hay ninguna abierta o si la abierta es la pedida. Abrir otra ficha o una nueva la retira.
- **`src/App.tsx`** le pasa `selected` (`'new'`, el ID abierto o null).

Se mantienen las dos reglas de R2: irse a otro lugar la retira, y Atrás/Adelante la sustituye por la del destino.

**Pruebas** (`tests/url-routes.test.ts`, **7/7**). Hay una prueba nueva con los cuatro casos de la ficha abierta: sin ficha sigue, con la propia ficha pedida sigue, con otra ficha se retira y con una nueva se retira. La prueba de lectura de `App.tsx` exige que la regla reciba la ficha abierta.

**Recorrido en Chromium sin interfaz** contra el ensayo aislado, con la respuesta real retenida:

| Caso | R2 (`45c4dab`) | R3 |
| --- | --- | --- |
| Se queda en el enlace | Lucía, `/clientes/contact-1` | igual |
| Pulsa Inicio y llega la ficha | `/inicio`, sin ficha | igual |
| Pulsa Inicio y llega un 404 | `/inicio`, sin error | igual |
| Abre a Pablo en la misma lista y llega Lucía | **Lucía sustituye a Pablo**, `/clientes/contact-1` | Pablo se conserva, `/clientes/contact-2` |

`tsc` 0.

**Huellas R3:** `src/App.tsx` `ce8ea11aecb1…` · `src/app-shell/routes.ts` `d3d1a96da44d…` · `tests/url-routes.test.ts` `040f329de86d…`.
