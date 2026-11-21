# CLAUDE-TEAM-AUDIT · Accesibilidad y móvil del espacio de equipo (`/team`)

**Autor:** Claude (Opus 5.5), sesión «planb-rendimiento» · **Fecha:** 19/11/2026, Europe/Madrid
**Orden:** del usuario, vía la sesión principal: auditar `/team`, que nunca se había medido.
**Archivos (nuevos):** `tools/team-audit/start.mjs`, `checks.mjs`, `run.mjs`, `README.md`, `tests/team-audit.test.ts` y este informe. **Ningún cambio en `src/`.**

## Resultado

**96 vistas medidas (8 secciones × 4 perfiles × 3 anchuras) y ningún incumplimiento** en lo que se puede medir automáticamente:
- contraste AA;
- nombres accesibles y etiquetas de campos;
- objetivos táctiles: 24 px en escritorio y 44 px en móvil;
- foco visible;
- un `h1` por vista;
- ningún desplazamiento lateral;
- imágenes con `alt`.

Se cumple en los 4 perfiles (Administración, Responsable comercial, Comercial y Solo lectura) y en 1366, 390 y 320 px, también con los paneles plegables desplegados.

No había hallazgos que ordenar por gravedad. Es coherente con el trabajo previo sobre este espacio: D5 (móvil), D7 (objetivos y foco) y D8 (equipo). El valor de esta entrega es **haberlo medido de verdad** y dejar una herramienta que lo vuelva a comprobar.

### Cobertura (lo que respalda el «sin hallazgos»)

| Medida | Total en las 96 vistas |
| --- | --- |
| Textos con contraste calculado | **4.264** (288 sobre el degradado de la barra lateral; **0** sin fondo medible) |
| Controles evaluados (nombre, etiqueta, objetivo) | **2.025** |
| Paneles `<details>` desplegados y medidos | **36**: Integraciones, Agente y Comercial; 1.743 textos y 618 controles más |
| Foco | 6 pulsaciones de Tab por vista: **576** pulsaciones, sin ningún elemento enfocado sin indicador |

Por vista, de 11 textos y 11 controles (Trabajos) a 94 textos y 60 controles (Contactos). Las cifras son estables entre perfiles: las vistas de solo lectura sustituyen los botones por el aviso de permiso de D8.

### Márgenes observados (cumplen, pero cerca del umbral)

| Elemento | Medida | Umbral | Nota |
| --- | --- | --- | --- |
| Controles más pequeños en escritorio (barra lateral y botones de texto) | 25 px de alto | 24 px (AA) | Cumplen por 1 px. Si se reduce el relleno o la tipografía de `.nav-item` o `.text-button`, caerían por debajo |
| Controles en móvil | 44 px (mínimo observado) | 44 px | En el límite exacto, fijado por D7 |
| Barra lateral en escritorio, peor parada del degradado `rgb(14,42,47)` → `rgb(12,37,41)` | «Plan B» 15,1:1; secciones 10,3:1; «ESPACIO COMPARTIDO» 7,2:1 | 4,5:1 | Holgados |
| Casilla de consentimiento del Agente | 15 px | exenta | Está dentro de su etiqueta, que es el objetivo, con el mismo criterio que `tools/visual/a11y.mts` |

## Un falso positivo corregido en la herramienta (no en la App)

El primer recorrido señaló un problema grave: el botón «Habilitar modelo local» del Agente aparecía como «control sin nombre». Al examinarlo:
- el botón tiene texto, pero está dentro del `<details class="local-agent-settings">` **cerrado**;
- Chromium le da caja (30 px de alto) pero no lo pinta ni lo anuncia: `innerText` vacío y Playwright no lo encuentra por rol y nombre.

**No es un problema de la App**, sino de mi medida, que lo contaba como visible. La medida ya excluye lo que está dentro de un `<details>` cerrado (salvo su `summary`) y usa `checkVisibility()`. Para no perder esos controles, cada vista **se mide también con sus paneles desplegados**: el botón se mide así, con su nombre y su tamaño correctos.

## Herramienta

- **Ensayo propio** (`start.mjs`):
  - servidor de equipo en modo demo en 4531, con datos ficticios nuevos en `tests/.tmp/perf-team-*`;
  - red exterior bloqueada con `--require scripts/block-external.cjs`;
  - entorno mínimo: sin `.env.local` ni variables de credenciales;
  - Vite en 5299, que solo proxifica `/api/team`;
  - no usa 4431/5198. Al terminar comprobé que no queda nada escuchando en 4531/5299 ni procesos huérfanos.
- **Recorrido** (`run.mjs`):
  - Chromium sin interfaz; entra en el modo demo (que puede entrar solo; el botón «Entrar en ensayo local» asoma un instante);
  - cambia el perfil con «Perfil de ensayo» y cada sección con la navegación «Secciones del equipo»;
  - descarta cualquier diálogo de confirmación, así que nunca acepta descartar nada.
- **Medida** (`checks.mjs`): copiada y ampliada de `tools/visual/a11y.mts` y `mobile-scan.mts`, que no se editan. Novedades:
  - contraste sobre degradados, tomando la peor parada;
  - visibilidad real (`<details>` cerrados);
  - la **regla CSS probable** de cada hallazgo, con archivo de Vite, selector y valor;
  - cobertura por vista;
  - gravedad y agrupación del mismo problema entre vistas.

## Verificación

- `tests/team-audit.test.ts` → **7/7**: gravedad, agrupación entre vistas, orden por gravedad y vistas, gravedad máxima del grupo, clave por elemento y regla, contraste con valores de referencia WCAG (21:1 y #767676 = 4,54:1) y la cobertura pedida (8 secciones × 3 anchuras).
- `node tools/team-audit/run.mjs --self-test` → correcto, con páginas sintéticas:
  - detecta los 7 tipos plantados, el contraste insuficiente sobre un degradado, el foco invisible y la regla de origen (`.pale`);
  - la página limpia no da ningún hallazgo, incluido un control sin nombre dentro de un `<details>` cerrado y texto claro sobre degradado oscuro.
- `tsc`: sin errores en estos archivos. Los únicos errores actuales están en `tests/return-explain.test.ts`, trabajo en curso de la sesión principal.
- Resultados crudos: `tests/.tmp/perf-team-audit/result.json` y `summary.json`, del recorrido contra el ensayo en marcha.
- **La orden de un paso funciona de principio a fin:** `node tools/team-audit/start.mjs --audit` monta un ensayo nuevo, recorre las 96 vistas sin hallazgos, termina con código 0 en unos 3 minutos y para el servidor y Vite. Después no queda nada escuchando en 4531/5299 ni ningún proceso de `team-audit`. Resultados en `tests/.tmp/perf-team-2026-11-19T08-02-15-664Z/audit/`.
- El primer intento de esa orden falló porque esperaba el botón «Entrar en ensayo local», que en modo demo solo asoma un instante antes de entrar sola. Está corregido: primero se espera la navegación y solo se pulsa el botón si no se entra.

## Límites y siguientes pasos propuestos

- **No sustituye** una revisión con lector de pantalla ni juzga si los textos se entienden.
- **Sin medir:**
  - el **modo oscuro**;
  - las ventanas que se abren al actuar: editor de teléfono del contacto, edición de propuestas comerciales, vinculación de dispositivo con su clave e invitación;
  - los **estados de error** y los formularios rellenados;
  - el foco más allá del sexto elemento.

  Son la siguiente medida útil. Para el modo oscuro bastaría con añadir el tema al recorrido; las ventanas necesitan pasos de interacción por sección.
- Solo modo demo: el piloto autenticado oculta Equipo y Dispositivos y no se ha medido.
- La regla CSS es aproximada: no se calcula la especificidad. Hoy no afecta porque no hay hallazgos.

## Huellas (SHA-256)

| Archivo | Huella |
| --- | --- |
| `tools/team-audit/checks.mjs` | `00b47a847efb518e9a082336a6a15291966a15ae5bdadf03b565aad740fdade0` |
| `tools/team-audit/run.mjs` | `d4b5db9151e6f605636b14e90608617dcc92d9277b6523f97f01728e5168ea5a` |
| `tools/team-audit/start.mjs` | `df4b2282cb73ac3a390c7c17f6b06c8efb0a77927ca74722fda998c0154e5692` |
| `tests/team-audit.test.ts` | `1635ac94d8107cdf075aeaa9de45d619ab9cf0416bb769f72eab266bc0d72846` |

## R2 · Correcciones pedidas en CODEX-TEAM-AUDIT-REVIEW-467 (21/11/2026)

Codex reprodujo cuatro casos que la medida dejaba pasar. Eran fallos de detección de la herramienta, no de la interfaz. Corregidos en `checks.mjs`:

| Caso de Codex | Antes | Ahora |
| --- | --- | --- |
| `aria-labelledby` con referencias inexistentes | La presencia del atributo bastaba | Se calcula el nombre expuesto: las referencias deben existir y tener texto; si no, «campo sin etiqueta (aria-labelledby apunta a …)». Además, el texto de una etiqueta envolvente se toma sin el propio campo, así que las opciones de un `<select>` ya no pasan por etiqueta |
| Sombra decorativa fija y `outline: none` | La sombra contaba como foco visible | `focusState` compara el estado enfocado con el normal (contorno, sombra, borde, fondo, color, subrayado, padre y `::after`): si nada cambia, no hay indicador. El recorrido desactiva transiciones al medir |
| `textarea` de 22 × 22 px | Contaba como control, pero quedaba fuera de los objetivos sin avisar | Entra en la política de objetivos (24/44 px) |
| Botón que termina en x = −20 sin carril | No se detectaba (el documento no se desplazaba) | Nuevo tipo `offscreen` (grave) contra las dos orillas, salvo que un carril con `overflow-x: auto/scroll` permita llegar |

**Las pruebas nuevas fallan con la versión presentada.** La autoprueba de R2, ejecutada contra el `checks.mjs` de `HEAD` (`00b47a84…`), da exactamente estos cuatro fallos: «no detecta el aria-labelledby que apunta a algo inexistente», «no incluye el textarea de 22×22 px», «no detecta el control fuera de la pantalla por la izquierda» y «toma la sombra fija como indicador de foco». Con la versión nueva pasa entera. Los controles positivos tampoco se marcan: un campo bien etiquetado, un select dentro de su etiqueta, un carril desplazable y un anillo de `:focus-visible`.

### Recorrido repetido sobre el código actual (59e7a47, rediseño «Consola de operaciones»)

96 vistas: 4.264 textos, 2.025 controles y 36 paneles desplegados; ya no hay textos sobre degradado, porque el diseño nuevo lo quitó de la barra lateral. **54 problemas únicos: 8 graves, 0 medios y 46 leves**, todos a 390 y 320 px. Son defectos reales de la interfaz nueva; en el recorrido del 19/11, con el diseño anterior, no aparecían.

| Gravedad | Problema | Dónde | Causa probable | Arreglo propuesto (no aplicado) |
| --- | --- | --- | --- | --- |
| **Grave** | La sección activa de la navegación tiene contraste **2,78:1** (texto `#1b1608` sobre píldora `#2853d0`). Se ve en la captura a 390 px | Las 8 secciones, 4 perfiles, 390 y 320 px | `src/faro.css:508-509` (`@media (max-width: 760px)`) fija `background: var(--signal) !important; color: #1b1608 !important`. Ese texto oscuro se eligió para el ámbar de Faro, y `src/consola.css:43` ha cambiado `--signal` a `#2853d0` (azul) | En `faro.css:508-509`, `color: #fff` (texto e icono): **6,48:1**. Mejor aún, un token `--signal-ink` (`#1b1608` en Faro, `#fff` en Consola), para que el texto siga al fondo si `--signal` vuelve a cambiar. La regla afecta a toda barra lateral móvil, también fuera de `/team` |
| Leve (46) | Botones, campos y desplegables de **40 px** de alto en móvil (< 44 px recomendados; ≥ 24 px AA) | Barra superior (empresa y perfil), botones de acción, campos y permisos de miembros, a 390 y 320 px | `src/consola.css:53` pone `--control-h: 40px` en `@media (max-width: 600px)`. La pasada D7 lo había dejado en 44 px | `--control-h: 44px` en esa misma regla de `consola.css:53` |

Ningún hallazgo de nombre, etiqueta, foco, `h1`, desplazamiento lateral ni control fuera de la pantalla en las vistas reales.

**Verificación R2:**
- `tests/team-audit.test.ts` → 7/7, con el nuevo tipo grave `offscreen`.
- `node tools/team-audit/run.mjs --self-test` → correcto.
- `tsc` → 0.
- Resultados: `tests/.tmp/perf-team-audit/result.json` y `summary.json`. El ensayo (4531/5299) está parado y no quedan procesos.

| Archivo (R2) | SHA-256 |
| --- | --- |
| `tools/team-audit/checks.mjs` | `9d4fc6353fc23521f4f092d7b7c28ec58f8dd972655217bcd8b7a211f572c785` |
| `tools/team-audit/run.mjs` | `cf8ae24c8969976e3ad028320822e30b62289a8ebeb6b3a9b0dcfcf5c899882b` |
| `tools/team-audit/README.md` | `7ff32ac733ef2e8929a8639662fc44380c19ff104e29b239fe52677ab5635ff3` |
| `tests/team-audit.test.ts` | `ed05d369092e2a880da0ca358c2bc9ba5c1ef342e6c2872dc8b14f3492dd1d12` |

Sin cambios: `tools/team-audit/start.mjs`.
