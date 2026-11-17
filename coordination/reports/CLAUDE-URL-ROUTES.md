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
