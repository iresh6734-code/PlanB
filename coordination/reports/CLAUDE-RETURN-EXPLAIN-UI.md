# CLAUDE-RETURN-EXPLAIN-UI · La devolución explicada en la pantalla de Cambios

**Autor:** Claude (Opus 5.5) · **Fecha:** 18/11/2026 · **Origen:** mejora C4 del informe (segunda parte), por orden del usuario. Usa `shared/return-explain.ts` (CLAUDE-RETURN-EXPLAIN, en revisión). `src/ChangesView.tsx` es de la reserva CODEX-HISTORY-064 y `src/faro.css` es compartido; los dos se editaron con autorización del usuario y quedan sus huellas.

## Qué ve la persona

En «Devolución revisada», tras «Preparar revisión»:

- **Un resumen** de una línea, por ejemplo: «1 conflicto por decidir · 1 campo se enviará · 2 registros nuevos · 1 cambio se queda solo en tu copia».
- **Una tarjeta por cliente** (empresa, o persona si no tiene empresa), con los conflictos primero y una etiqueta «N conflictos por decidir».
- **Una frase por campo**, con los valores como en la App, por ejemplo: «Conflicto: al capturar era «600 000 002»; tú lo cambiaste a «600 222 333» y en el CRM de prueba alguien lo cambió a «699 999 999». Elige cuál se queda.» Los conflictos se marcan como aviso y lo que sustituye un valor del CRM, en rojo suave.
- **Decisiones con palabras**: «Quedarme con lo mío» o «Quedarme con lo de HubSpot» («… del CRM de prueba» en el destino simulado). Sustituyen a «Usar local» y «Conservar remoto». Siguen yendo a la misma ruta `/v2/return/decisions`.
- **Las relaciones que se crearán**, en una frase («Se enlazará con Estudio Arce (empresa).»).
- El estado, los errores y el formulario de «Resultado incierto» de cada operación siguen igual.

Mientras se prepara la explicación, o si falla, se muestra la vista anterior tal cual. No hay rutas nuevas ni cambios en el servidor.

## Cómo

**`src/app-shell/useReturnExplanation.ts`** (nuevo):

- `collectRecords(plan, spec, fetchRecord)` pide por la ruta existente `GET /api/v2/records/:entity/:id` solo los registros que el plan necesita:
  - los de cada operación y los destinos de sus relaciones;
  - en hasta tres rondas, lo que esos enlazan: su empresa, su persona y la empresa de esa persona.

  Cada registro se pide una sola vez, con un tope de 400. Los que no existen o fallan se omiten.
- `useReturnExplanation` vuelve a explicar cuando cambia el plan, su estado o cualquier decisión (`planKey`).

**`src/ChangesView.tsx`:**

- la decisión y el final de cada operación pasan a ser piezas compartidas (`decide`, `tail`) entre la vista explicada y la anterior, sin duplicar lógica;
- en las altas se ocultan los campos vacíos.

**`src/faro.css`:** bloque «C4 · Devolución explicada», con los tokens de Faro.

## Verificación

**Pruebas** (`tests/return-explain-ui.test.ts`, **4/4**):

- pide los registros del plan y los enlazados, sin repetir, incluida la empresa de la persona en la tercera ronda;
- omite los que fallan o no existen;
- la clave cambia con cada decisión;
- `ChangesView` usa la explicación, las decisiones con palabras, la vista anterior como respaldo y la misma ruta de decisión.

**Otras suites:** `return-explain` 4/4, `api-client-routes` 4/4 (no hay llamadas nuevas sin documentar), `ui-copy` 3/3 y `ui-journeys` 60/60. `tsc` 0.

**Recorrido en el ensayo aislado** (API 4421, UI 5199, datos de prueba y destino simulado). En el CRM simulado, «alguien» cambia el teléfono de Pablo García con un guion sobre el almacén del ensayo. En la App se guarda otro teléfono y se prepara la revisión: 4 operaciones y 1 conflicto.

- Aparecen el resumen, la tarjeta «Norte Digital» con «1 conflicto por decidir» y la frase del conflicto con los tres valores.
- Al elegir «Quedarme con lo del CRM de prueba», la frase pasa a «Se queda … Tu cambio a «600 222 333» solo seguirá en tu copia local». El conflicto sale del resumen y la tarjeta deja de estar primera.
- Dos ajustes salieron del propio recorrido y quedaron corregidos:
  - cada fila se salía de su tarjeta en la vista estrecha (rejilla con `minmax(0, 1fr)`);
  - el resumen contaba campos de alta en lugar de registros nuevos.

## Pendiente

- **Para CLAUDE-RETURN-EXPLAIN** (en revisión, no se puede tocar ahora):
  - con el destino simulado dice «lo de el CRM de prueba»; debe ser «lo del»;
  - las altas generan frases para campos vacíos. Esta pantalla ya las oculta, pero conviene no generarlas.
- **Commit:** `src/faro.css` lleva, además de este bloque, trabajo en curso de la sesión Faro (resúmenes de fichas, 18/11). Por eso no se ha incluido en el commit de este encargo; entrará con el de Faro. Sin esos estilos la pantalla funciona, solo que sin el formato de tarjetas.
- Falta probar en un HubSpot de prueba real, que necesita autorización del usuario. Aquí se usó el destino simulado.

## Huellas

| Archivo | Antes | Después |
| --- | --- | --- |
| `src/ChangesView.tsx` | `1cbc19b72685` | `fca4fc708094` |
| `src/faro.css` | `8a590f91a5d4` | `ea1e31b8845d` (incluye trabajo ajeno posterior) |
| `src/app-shell/useReturnExplanation.ts` | — | `2b73d6911218` (nuevo) |
| `tests/return-explain-ui.test.ts` | — | `5d49105f6473` (nuevo) |

## R2 · Revisión 430 F2 de Codex

**Hallazgo (correcto).** Con la explicación del plan A ya mostrada, llegaba un plan B con otras operaciones y su lectura pendiente. En ese pintado, el hook aún devolvía los grupos de A, y `ChangesView` buscaba la operación de A en B y fallaba con `TypeError` al leer `label`.

**Corrección:**

- **`useReturnExplanation`** guarda la explicación junto con la clave del plan y la especificación para los que se calculó. `explanationFor` solo la devuelve si coinciden con lo que se pinta. Con un plan nuevo, una decisión nueva o otra especificación, la pantalla usa el respaldo desde el primer pintado, sin esperar a ningún efecto. Una entrega tardía y fuera de orden tampoco se muestra, porque su clave ya no es la vigente.
- **`ChangesView`:**
  - guarda ante una operación ausente (`if(!op)return null`);
  - el resumen cuenta también lo verificado y lo incierto, y los registros nuevos por crear según el modelo (F1).

**Pruebas** (`tests/return-explain-ui.test.ts`, **6/6**):

- reemplazo A → B con lectura pendiente;
- otra especificación;
- decisión dentro de la misma operación;
- sin plan;
- la guarda en la vista;
- el hook devuelve solo la explicación vigente.

`tsc` 0.

**Huellas R2:**

| Archivo | Huella |
| --- | --- |
| `src/app-shell/useReturnExplanation.ts` | `eee5bb985a7c…` |
| `src/ChangesView.tsx` | `052a4284f807…` |
| `tests/return-explain-ui.test.ts` | `13820aa54800…` |
