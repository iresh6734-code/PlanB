# CLAUDE-TASK-CONFLICT-REVIEW-199 · Comparador de decisiones de conflicto (preparación)

4/11/2026, Europe/Madrid. Bloque independiente de la misión 197 (apartado 3). Sin navegador del usuario, MCP, proveedores, credenciales ni red externa; datos ficticios de `makeFixture`. Sin commits ni despliegues. **No toca** ninguna ruta de 170/171, de la ficha (`LocalTaskFocus.tsx`), del gestor ni de App.

## Qué es y qué NO es

Es un **modelo puro** y un **componente** que, dados lo que la persona vio, su borrador y la versión actual (con sus identidades), muestran por campo «Lo que viste / Tu propuesta / Lo que hay ahora» y devuelven una **propuesta** tras decisiones explícitas. **No está montado en la ficha ni en Hoy**: el arnés prueba el componente, no que el conflicto se resuelva desde Hoy. No guarda, no usa red y no crea otro gestor.

## Modelo (`shared/task-conflict-review.ts`)

- `buildConflictReview(input)`: estados por campo `untouched | theirs-only | mine-only | converged | conflict | incompatible`.
  - `conflict` (los dos cambiaron a valores distintos): **sin valor preseleccionado**; hay que elegir `mine` o `current`.
  - `mine-only`: viene marcado «mío» (decisión visible, se puede descartar). `theirs-only` y `converged`: sin decisión; el cambio ajeno nunca se sobrescribe (elegir «mío» sobre un campo sin decisión se ignora).
  - `incompatible` (solo se ofrece `current`): fecha civil inválida, opción de enumerado inexistente, texto de más de 10 000 caracteres, campo de solo lectura, campo que ya no existe, copia sin esquema activado. El valor escrito sigue a la vista.
- **Identidad**: `compareIdentity` exige misma tarea (ID y entidad) y misma copia (instalación, captura, fecha de captura, inicio de captura, cuenta, generación; reutiliza `contextKey`). Si falla, `rows = []`: **no hay mezcla**, solo `preserved` (lo escrito, formateado) y `resolve` → `identity-mismatch`. El título nunca decide (homónimas).
- `resolveConflictReview(review, choices)` → `identity-mismatch | undecided | invalid | noop | ready`. La propuesta usa la **versión actual como base**, solo lleva lo que la persona decidió mantener (`buildPatch`), valida con `validateDraft` y solo cuenta incidencias **nuevas** (también las de reglas cruzadas; las que ya tenía la versión actual no son culpa de la decisión). `provenance: 'person-decision'`: una elección no prueba la autoría de un envío anterior. Un no-op devuelve `noop` y **no** una propuesta enviable.
- No muta la entrada (clona al construir; probado con objetos congelados).

## Componente (`src/TaskConflictReview.tsx` + CSS)

Props: `input`, `onPropose(proposal)`, `onKeepEditing()`, `describeValue?` (p. ej. nombre de una referencia; por defecto el formato «entidad · id» de la ficha). Tres valores por campo (apilados a ≤640 px, con etiqueta y estado en texto además de color), `radiogroup` nativo por campo, texto React (nada de `innerHTML`), valores largos (>160) en `<details>`, «vacío» para lectores, resumen `role=status` («N campos por decidir»), botón «Preparar el nuevo guardado» con `aria-disabled` (no se entrega propuesta hasta que esté todo decidido y sea válida; al intentarlo, aviso `role=alert` y foco al primer campo pendiente). Con identidades distintas: aviso, lo escrito visible, solo «Volver al formulario». La revisión depende del **contenido** de `input` (JSON), no de la identidad del objeto: un padre que lo reconstruye en cada render no borra las elecciones; una lectura nueva sí las reinicia.

## Pruebas (sobre el corte final)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `tsx --test tests/task-conflict-review.test.ts` | **16/16** |
| Playwright `tests/e2e/task-conflict-review.spec.ts` (Chromium 1228 headless, servidor HTTP propio efímero en 127.0.0.1, externo bloqueado) | **10/10** |

Cubren: clasificación por campo; sin preselección en conflicto; propuesta con base actual y patch mínimo; entrada inmutable; identidad (captura distinta con mismo ID, otra captura, instalación, cuenta, generación) sin mezcla y borrador conservado; homónimas; vacío/null; referencias; fechas; enumerados, solo lectura y campo huérfano; texto largo y marcado hostil (nada se ejecuta, `window.__xss` indefinido); regla entre campos; sin esquema; borrador parcial; teclado (Enter en el botón sin decidir → foco en el primer radio; Espacio y flechas eligen; confirmar entrega **una** propuesta; **0** peticiones de red); layout a 1440/390/320 (sin desbordamiento, objetivos ≥44 px en móvil, 3 columnas en escritorio y 1 en estrecho); nueva lectura que reinicia elecciones.

**Contrapruebas del modelo (6 mutaciones, todas detectadas):** ignorar la identidad, preseleccionar el conflicto, calcular el patch contra la base vieja, omitir la validación cruzada, pisar el cambio ajeno y dejar que el ID no decida la identidad. **Límite:** no se mutó el componente; la verificación DOM se apoya en las aserciones «0 propuestas sin decidir / 1 al confirmar».

**Capturas abiertas e inspeccionadas:** `conflict-1440.png` y `conflict-320.png` (las de 390 y las de texto largo a 1440/390/320 se generan también en `tests/.tmp/c170/r199/`, no abiertas una a una). Se vio una columna legible a 320 px, etiquetas encima de cada valor, radios con objetivo ≥44 px, borde ámbar y etiqueta «Conflicto: decide». Sin recorte horizontal. Las capturas se tomaron con el conflicto ya decidido; el estado sin decidir se acredita por DOM, no por imagen.

## Hashes (SHA-256)

| Archivo | SHA-256 |
|---|---|
| `shared/task-conflict-review.ts` | `82966dc64f9fcccdcd8ff356e8ffe60b05d3984d21e7c461d9d8237dee30d894` |
| `src/TaskConflictReview.tsx` | `7d3fa3084bed44fd7f95f63ad60d87901fd98c8da8f0c4538f90c1a46dcaea43` |
| `src/task-conflict-review.css` | `be27e0dd0ebf5c77df5b1582c11f9db1e5c7cb98a44122161af656e76bddb1fc` |
| `tests/task-conflict-review.test.ts` | `db59a6b7dc34538a96140ea3c4eac075750b3a88efd1f0f23ac069cd1cea971c` |
| `tests/e2e/task-conflict-review.spec.ts` | `f28dacc8cfdc4aa0f657e7891a67fa40523e79a30a3459fd7bc78d2fd6b5729b` |

## Límites

- No se ha montado en `LocalTaskFocus`; la integración (paquete 5) requiere reservar ese archivo y su CSS.
- Sin CAS ni idempotencia: la propuesta usa «la versión leída ahora»; si otra edición llega después, el servidor (con 128/166) decidirá. El token de revisión **debe ser el de esa misma lectura**; este módulo no lo toca.
- `describeValue` es opcional: sin él las referencias se muestran como «contacts · contact-9», no con el nombre.
- El texto largo se pliega por longitud, no por líneas. No se probaron lectores de pantalla reales; solo roles y etiquetas por DOM.
- Los campos `datetime` se muestran con `formatInstant` (hora de Madrid) igual que la ficha; no hay editor en el comparador.

---

# R2 · respuesta al dictamen 204 (F1–F4)

Las cuatro sondas del revisor (`tests/.tmp/q204-3679338b/s/tests/independent-task-conflict-199.test.ts`) se ejecutaron **sin modificarlas** sobre una copia: **4/4 verdes** tras la corrección (fallaban con la entrega anterior según su dictamen).

- **F1 · propiedades heredadas.** Toda lectura por clave de campo pasa a **propiedad propia** (`has`/`ownValue`/`issueOf`/`choiceOf`): una clave como `constructor`, `toString`, `hasOwnProperty` o `valueOf` ya no se confunde con una incidencia ni con una elección. Una elección solo cuenta si es propiedad propia con valor `mine`/`current` (probadas `banana`, `MINE`, vacío, `null`, número, objeto, array y valores heredados). Los registros se completan con todas las claves del esquema como propiedades propias antes de llamar a `buildPatch`/`validateDraft`, así que tampoco se lee el prototipo ahí. El componente usa la misma `choiceOf`.
- **F2 · reglas entre campos.** La compatibilidad de un campo se comprueba **sin las reglas** (`rules: []`: tipo, opciones, fecha, longitud, obligatorio propio); las reglas entre campos se evalúan sobre la **combinación elegida** al resolver. Pasar a pendiente y vaciar las notas ya da `ready` con `{status:'pending', notes:null}`; conservar «completada» y vaciar las notas da `invalid` con la explicación de la regla. Siguen siendo incompatibles los problemas propios del valor.
- **F3 · entidad.** Se exige `tasks` en ambas lecturas y en el esquema recibido (`entity.id`).
- **F4 · identidad mínima.** Deben **constar** instalación, ID de captura y fecha de captura en las dos lecturas; dos ausencias iguales no acreditan nada. Cuenta, inicio de captura y generación siguen pudiendo faltar (la ficción sin cuenta sigue siendo válida). El borrador se conserva y se muestra.
- **Lectura nueva antes de proponer.** Las elecciones ahora están ligadas al contenido de `input` (`stored.key === contentKey`): con otra lectura, las anteriores no cuentan ni en el render previo al efecto. DOM: tras «Nueva lectura», confirmar con lo decidido antes da «Falta decidir» y 0 propuestas.

**Pruebas sobre el corte R2:** `tsc --noEmit` limpio; Node **22/22** (16 anteriores + 6 regresiones propias de R2, sin tocar las pruebas del revisor); DOM **10/10** (la de «nueva lectura» ampliada). **6 mutaciones nuevas de R2, todas detectadas:** elección heredada, incidencias heredadas, reglas por campo, entidad no exigida, instalación nula válida y esquema que no es de tareas. La verificación DOM de F1–F4 se limita a lo que ejerce el arnés (no se monta una clave `constructor` en el navegador); los cuatro defectos se acreditan en Node y por las sondas del revisor.

**Sigue siendo preparación**: no está montado en la ficha. El futuro montaje debe conservar el token de la lectura sobre la que se decidió, el borrador y un guardado nuevo explícito.
