# Red de seguridad visual

Tres utilidades para cambiar la interfaz sin romperla. Solo navegan y leen la app; no guardan nada en ella.

| Orden | Qué hace |
| --- | --- |
| `npx tsx tools/visual/check.mts reference` | Captura las 18 vistas de la App local a 1440, 1366, 1280 y 390 px y guarda sus huellas como referencia. |
| `npx tsx tools/visual/check.mts compare` | Vuelve a capturar y lista las vistas que ya no coinciden byte a byte con la referencia, y cualquier desborde horizontal. Sale con código 1 si hay diferencias. |
| `npx tsx tools/visual/diff.mts 1366-hoy` | Dice cuántos píxeles difieren en esa vista y en qué zona. |
| `npx tsx tools/visual/css-audit.mts` | Por cada hoja de `src/`, cuántas reglas encuentran algún elemento en las vistas. |

## Qué necesita

La app servida con una copia de ensayo ya activada, en `PLANB_VISUAL_URL` (por defecto `http://127.0.0.1:5199/`), y un Chromium de Playwright (`PLANB_PLAYWRIGHT_EXECUTABLE`). Las capturas van a `tests/.tmp/visual/` (`PLANB_VISUAL_DIR`). Nunca apuntar a una instalación con datos reales.

## Límites

- La referencia vale para **los mismos datos y el mismo día**: las tareas se clasifican por fecha. Tómala justo antes de un cambio que no deba alterar el aspecto, y compara justo después.
- Las zonas que dependen de la hora (antigüedad de la copia, saludo, procedencias, pasaporte, mapa de impacto, operaciones) se tapan en gris. **Un cambio dentro de una zona tapada no se detecta.**
- Volver a montar un componente puede mover el texto menos de un píxel y hacer saltar la comparación; `diff.mts` distingue ese ruido (pocos píxeles, diferencia máxima baja) de un cambio real.
- `css-audit` no visita `/team`, la copia restaurada, el bloqueo ni los estados de error o de carga: «sin coincidencia» no significa «regla muerta».
- No cubre fichas, modales ni el buscador.
