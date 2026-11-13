# CLAUDE-UX-038 · Rediseño integral del piloto (informe)

> El encargo se registró como **CLAUDE-UX-038**. El nombre de este informe (`CLAUDE-UX-037.md`) viene del primer intento: `CLAUDE-UX-037` se creó con `src/customer-combobox.css` en su alcance, que sigue reservado por `CLAUDE-UX-032` (revisión R2 de Codex pendiente), y quedó bloqueado sin trabajo realizado. El alcance definitivo de 038 no incluye ese archivo.

Sin commit ni push. Nada se ha desplegado: **los instalaciones reales (4331/4334) siguen con la interfaz anterior**; el rediseño solo existe en el código y en compilaciones aisladas de `tests/.tmp/ux038/`.

## 1. Auditoría priorizada (estado de partida)

Medida sobre el piloto en 1440 × 900 (pestaña Contactos, datos de ensayo) y 390 px:

| # | Problema | Evidencia |
|---|---|---|
| P1 | **Cromo vertical excesivo**: selectores de empresa/perfil con etiqueta encima, aviso, título de 24 px, subtítulo en otra línea, franja de estado, etiqueta del buscador, texto de ayuda. La tabla empieza en y = 415 px (1440) y y = 704 px (390). | Medición, capturas `shots-before/team-records-*` |
| P2 | **Filas de 53 px** (59 px en móvil): solo 8 filas por pantalla en 1440 y **1 fila** en 390. | Medición |
| P3 | **Tres sistemas de estilo apilados**: `styles.css` (Inter, `#202a38`), `refinements.css` (hoja de 2025: 32 px de h1, radios de 9–12 px) y `design-system.css` (0.6). Valores de color y tamaño repetidos en cientos de reglas, sin escala. | `grep` de `var(--*)`: solo 8 tokens de color y ninguno de tipografía/altura |
| P4 | **Barra lateral ancha (220 px) con bloque activo pesado** (fondo azul + barra de 3 px + peso 650), marca de 25 px y navegación móvil en cuadrícula de 3 × 3 (165 px de alto). | Medición |
| P5 | **Títulos «editoriales» de 24–32 px** sobre pantallas de trabajo; subtítulo y contador en líneas distintas. | Capturas |
| P6 | **Alturas de control inconsistentes**: 36, 37, 38, 40, 42 y 44 px según la hoja; selector de clientes de 44 px junto a botones de 36. | CSS |
| P7 | **Texto secundario ilegible o disperso**: grises `#52627a`, `#6c778a`, `#788295`…; 2 elementos con texto < 11 px. | Medición |
| P8 | Sin estados vacíos diseñados en Trabajos; bloques de ayuda como párrafos sueltos. | Capturas |

## 2. Principios visuales (verificables)

1. **Densidad medida**: control 32 px (40 px en táctil ≤ 600 px), fila de tabla 40 px, cabecera de página de una línea, un solo nivel de cromo superior. *Test:* `tests/e2e/ui-redesign.spec.ts` (alturas, cabecera ≤ 40 px, tabla en el primer tercio del viewport).
2. **Jerarquía por peso y color, no por tamaño**: h1 20 px, secciones 14–16 px, cuerpo 13 px, apoyo 12 px, mínimo 11 px. *Test:* h1 ≤ 20 px.
3. **Superficies diferenciadas**: lienzo gris azulado `#f4f5f8`, paneles blancos con borde de 1 px y sombra de 1 px, zonas de apoyo `#eef0f4`, barra lateral `#eceef3`. Tarjeta solo cuando hay agrupación real (tablas, paneles de empresa, ficha).
4. **Un solo azul de acción** (`#2957c4`); el resto del color solo comunica estado (éxito/aviso/error/info). Sin gradientes ni cristal esmerilado. *Test:* `design-tokens.test.ts` prohíbe `gradient(` y `backdrop-filter` distinto de `none`.
5. **Estados idénticos en todos los controles**: hover (fondo `--bg-hover`/borde), foco de 2 px azul, activo, deshabilitado al 50 % con cursor `not-allowed`, error rojo. *Test:* foco ≥ 2 px en búsqueda y navegación; contraste AA de todos los pares de tokens.

## 3. Dirección visual

B2B sobrio en la línea de Linear / Attio / HubSpot (principios, no copia): navegación lateral estrecha y neutra, estado activo discreto (fondo tenue + icono azul, sin barra), cabecera de una sola línea con subtítulo y contador agrupados, tablas densas con cabecera gris, jerarquía de texto en la misma fila, hover de fila muy suave, paneles con borde fino y radios de 6–8 px. Tipografía: pila `Inter → Segoe UI Variable → Segoe UI → system-ui` (no se añade ninguna fuente ni dependencia; en Windows se renderiza Segoe UI Variable).

## 4. Sistema de diseño (`src/planb-ui.css`)

Capa final importada la última desde `src/main.tsx`. Define los tokens en `:root`, mantiene **alias** de los nombres antiguos (`--canvas`, `--surface`, `--ink`, `--muted`, `--line`, `--blue`…) apuntando a los nuevos —de modo que las hojas heredadas cambian de aspecto sin tocarlas— y reescribe los componentes compartidos. Las hojas cargadas bajo demanda (`team-company.css`, `team-agent.css`, `customer-*.css`) se superan con el prefijo `body` (mayor especificidad) en lugar de editarlas.

| Familia | Tokens |
|---|---|
| Tipografía | `--font-sans`; `--fs-xs 11 · sm 12 · md 13 · lg 14 · h2 16 · h1 20`; `--fw-regular/medium/semibold/bold`; `--lh-tight/body/loose` |
| Superficies | `--bg-canvas #f4f5f8 · surface #fff · subtle #eef0f4 · sidebar #eceef3 · hover #e6e9f0 · active #dfe6f5 · row-hover · overlay` |
| Texto | `--text-1 #1a2332 · text-2 #3f4a5a · text-3 #5b6677 · text-inverse` |
| Bordes | `--border #dfe3ea · border-strong #c3cad6 · border-control #818c9f` |
| Acción / estado | `--primary #2957c4` (+hover/active/subtle/text) · `--success/warning/danger/info` con `-bg` y `-border` |
| Espaciado | `--sp-1…8` (4, 8, 12, 16, 20, 24, 32) |
| Forma | `--r-sm 4 · md 6 · lg 8 · xl 12`; `--shadow-1`, `--shadow-pop` |
| Controles | `--control-h 32 (40 móvil) · control-h-sm 28 (36 móvil) · row-h 40 (44 móvil) · focus-ring` |
| Layout | `--sidebar-width 204 (188 ≤ 1150) · page-gutter 24/20/14 · content-max 1320` |

Componentes reescritos: botones (primario, secundario, texto, icono, peligro), campos (input/select/textarea/checkbox, estados hover/foco/deshabilitado/error), insignias y etiquetas de estado, avisos (info/error/éxito), barra lateral y marca, barra superior, cabecera de página, pestañas, barra de herramientas de listas, tablas, paneles, vista Empresa, modal y ficha lateral, selector de clientes, pantalla de desbloqueo.

## 5. Pantallas rediseñadas

Todas las del piloto (Empresa, Contactos, Trabajos, Dispositivos/Equipo, Integraciones, Agente, Comercial, ficha de cliente, selector de clientes) y, por herencia de tokens y componentes, el **CRM completo** (`App.tsx`, comprobado en captura: Continuidad/Preparación).

Cambio de marcado (único, en un archivo libre): `src/TeamContacts.tsx` agrupa búsqueda, recuento y «Actualizar» en una barra de herramientas (`list-toolbar`); la etiqueta del buscador pasa a `sr-only` + `placeholder` con el **mismo texto** (el nombre accesible no cambia) y los textos de estado y ayuda se conservan.

## 6. Revisión de compactidad (medida, 1440 × 900 y 390 × 844)

| Métrica | Antes | Después |
|---|---|---|
| Ancho de barra lateral (1440) | 220 | **204** |
| Alto del bloque activo (1440 / 390) | 37 / 48 | **30** / 44 |
| Tamaño del h1 | 24 (23 móvil) | **20** |
| Alto de la cabecera de página (1440) | 56 | **26** (una línea) |
| Inicio de la tabla, y (1440) | 415 | **229** |
| Inicio de la tabla, y (390) | 704 | **487** |
| Alto de fila (1440 / 390) | 53 / 59 | **40** / 44 |
| Filas visibles sin desplazarse (1440 / 390) | 8 / 1 | **15 / 7** |
| Alto de la barra de navegación móvil | 165 | **103** |
| Alto del buscador (1440 / 390) | 38 / 42 | **32** / 40 |
| Elementos con texto < 11 px | 2 | **0** (1440) |

## 7. Validación visual

Compilaciones aisladas `tests/.tmp/ux038/{before,after}` con datos de ensayo, puertos **4357/4361** (los 4337/4341 estaban ocupados por un servidor de prueba ajeno, que no toqué; nunca 4331/4334) y navegación externa bloqueada. Capturas completas en `tests/.tmp/ux038/shots-before/` y `shots-after/` (carpeta ignorada por git): Empresa, Contactos, Trabajos, Integraciones, Agente, Comercial, ficha, selector abierto y CRM completo, a **1440, 1024, 390 y 320 px** (10 escenas × 4 tamaños = 40 capturas por estado). Consola sin errores ni avisos en todos los recorridos; ningún desbordamiento horizontal de página.

## 8. Comprobaciones técnicas

- `npx tsc --noEmit`: sin errores.
- `npm test`: **665/665** (incluye `tests/design-tokens.test.ts`: 7 pruebas de contraste AA de los pares de tokens, borde de control ≥ 3:1, alturas, ausencia de gradientes/cristal y orden de carga).
- E2E (copias en `tests/.tmp/ux038/e2e-copy` con puertos aislados): **34 correctas / 7 fallan**, y esas **7 fallan igual con la compilación anterior**: parten de `page.goto('/team')` esperando Contactos, pero la pestaña inicial es ahora «Empresa» (cambio de Codex; ya anotado en mi informe de UX-032). Cambiando solo la URL de entrada a `?view=records`, las 4 especificaciones afectadas (`customers`, `files`, `session-lock`, `v5`: ficha, Picker, documentos, bloqueo de sesión, permisos y conflictos) pasan **12/12** con la interfaz nueva.
- Nuevas: `tests/e2e/ui-redesign.spec.ts` (8 pruebas: sin desbordamiento en 6 vistas × 4 anchos, densidad, alturas de control, foco, lista del selector a 320 px) — todas correctas.
- No se ha cambiado ningún rol, `aria-*` ni texto usado por pruebas existentes.

## 9. Evaluación crítica frente al encargo

- **¿Más compacto?** Sí, de forma medible (15 filas frente a 8; tabla 186 px más arriba) sin bajar de 12 px en texto de apoyo ni de 32/40 px en controles.
- **¿Tipografía superior?** Escala clara de 6 pasos y jerarquía por peso; los títulos dejan de competir con los datos. Límite: no se carga una fuente propia; el resultado depende de Segoe UI Variable/Inter si está instalada.
- **¿Coherente?** Un solo conjunto de tokens, alturas y estados; el CRM completo y el piloto comparten componentes. Límite: la capa nueva **se superpone** a tres hojas antiguas en lugar de sustituirlas; funciona y está probada, pero deja reglas muertas (deuda técnica para una limpieza posterior).
- **¿Funcionalidad intacta?** Sí según las pruebas citadas; sin cambios de lógica.

## 10. Límites y propuestas pendientes (no hechas)

1. **Archivos reservados por Codex (no editados)**: `src/TeamApp.tsx`, `src/TeamCompanyHome.tsx`, `src/team-company.css`, `src/App.tsx`. Su aspecto se rediseñó por especificidad. Cambios de marcado deseables, para un encargo aparte: (a) estado vacío diseñado en «Trabajos» (hoy solo una frase y un botón sobre un lienzo vacío); (b) desplazar a la pestaña activa la navegación móvil si se pasa a una sola fila; (c) en «Empresa», el buscador con etiqueta visible y la tarjeta que envuelve la tabla podrían simplificarse;
2. **`src/customer-combobox.css` / `CommercialWorkspace.tsx`** siguen reservados por UX-032. Pendiente allí (de Codex, R2): la prueba nº 13 debe abrir la lista antes de deshabilitar. No lo toqué.
3. **Pruebas E2E antiguas** con `goto('/team')` deben apuntar a `?view=records` (7 fallos previos al rediseño); no pertenecen a mis archivos.
4. **No desplegado**: para ver el rediseño en 4331/4334 hay que compilar y sustituir `runtime/` (autorización y copia de seguridad aparte).
5. No se han probado lector de pantalla real, otros navegadores ni modo de alto contraste de Windows; el modo oscuro no existe y no se ha añadido.
6. `CustomerDossier.tsx` y `customer-dossier.css` (UX-034, foco y bloqueo de la ficha) no se editaron; el CSS de la ficha se rediseñó desde la capa nueva. `customer-dossier.css` quedó reservado por 038 pero sin cambios.

## Iteración 2 (a petición del usuario: «más riqueza, jerarquía, tipografía y color»)

El usuario vio la primera versión «igual» y pidió subir de nivel. La reapertura de la tarea (`revise`) la registró Claude por petición expresa del usuario, **no Codex**; consta así en el tablón. Cambios sobre la iteración 1:

- **Marco oscuro, trabajo claro**: barra lateral azul noche (`--bg-sidebar #0d1a2f`) con texto, icono activo y estados propios (`--sb-*`), marca con cuadrado azul, barra superior blanca fija con selector de empresa en versalitas.
- **Tipografía en tres voces**: títulos en *Segoe UI Variable Display* (22/17 px, peso 700/600, tracking −0,02 em), cuerpo en *Segoe UI Variable Text* 13 px con cifras tabulares, etiquetas en versalitas de 11 px (cabeceras de tabla, métricas, datos de la ficha, selectores de la barra superior). Sin fuentes nuevas ni dependencias.
- **Color con función**: azul de acción `#2c58dc`; seis tonos de identificación (avatares y métricas) con pares texto/fondo AA; avisos con filete lateral de 3 px; insignias en píldora.
- **Tarjeta de datos** en Contactos (`src/TeamContacts.tsx`): barra de herramientas dentro de la tarjeta (buscador con icono, recuento, «Actualizar»), cabecera de tabla en versalitas, **avatar con iniciales** por contacto, chevron que se intensifica al pasar el ratón. Se mantiene el botón del nombre como único control (mismo nombre accesible); el avatar es `aria-hidden`. Se usa una función auxiliar, no un subcomponente, porque el arnés de hooks de `tests/ui-journeys.test.ts` no expande componentes hijos.
- **Pestañas como control segmentado**, selects con chevron propio, campos de búsqueda rellenos, vista Empresa con métricas en tarjetas con marca de color y accesos con icono en cápsula.
- Móvil: la barra lateral pasa a franja oscura de 4 columnas; el selector de clientes recupera objetivos de 44 px (lo exige `customer-combobox.spec.ts`); corregido un desborde de 2 px en el CRM a 320 px.

Medidas finales (1440 × 900 / 390 × 844): barra lateral 216 px; h1 22 px; cabecera 28 px; tabla desde y = 233 / 480; fila 44 / 52 px; **14 / 6 filas visibles** (antes de todo el rediseño 8 / 1); buscador 32 / 40 px; elemento activo de la barra 32 px.

Pruebas de la iteración 2 (sobre la compilación `tests/.tmp/ux038/v2`): `tsc` sin errores; `npm test` **708/708** (nuevas: contraste de la barra oscura y de los seis tonos); E2E aislados 34 correctas + 7 previas por la pestaña inicial «Empresa» (idénticas al estado anterior al rediseño; con `?view=records` pasan 12/12); sin errores de consola; sin desbordes de página a 1440/1024/390/320 px.

**Despliegue**: la iteración 1 se desplegó (solo `dist`, con copia de seguridad) tras la autorización del usuario. La iteración 2 **no está desplegada**: el intento fue bloqueado y queda pendiente de una autorización expresa.

## Hashes SHA-256 (estado entregado)

```
9c2f33c05a18a78ffef9b10881793595b64b1e57877d61c83905b9ea823c92ea  src/planb-ui.css
27004bfa22a4019cc942f8da7c1fe94db53fd23fd9d36821e4eb937e33a980c8  src/main.tsx
d84f3c4c8de57513c766d52c9b25e3b592df8eff64a2ded50ae3495e397658dd  src/TeamContacts.tsx
daf09e972e4310754e289ba515ea82d9db15d47ac96c8a5f19fe6bb4f81a1596  tests/design-tokens.test.ts
c68044bb005438bb84802b3af44d431d94c6eb1d62e50c706d5f926a5c9fea07  tests/e2e/ui-redesign.spec.ts
```

(El informe no se incluye en su propia lista; `board.mjs submit` fija los hashes definitivos.)

Archivos modificados/creados: `src/planb-ui.css` (nuevo), `src/main.tsx` (una línea de importación), `src/TeamContacts.tsx` (barra de herramientas), `tests/design-tokens.test.ts` (nuevo), `tests/e2e/ui-redesign.spec.ts` (nuevo), este informe y `coordination/tasks/CLAUDE-UX-038.json`.

## Iteración 3 (30/10/2026, a petición del usuario: «todo calidad visual, todo ordenado»)

Reapertura (`revise`) registrada por Claude con la etiqueta `codex` por petición expresa del usuario en el chat, **no por Codex**. Solo cambia `src/planb-ui.css` (bloque «Orden (iteración 3)») y se añade una prueba a `tests/e2e/ui-redesign.spec.ts`. Sin cambios de marcado, textos, roles ni `aria`.

Auditoría de partida (compilación aislada `tests/.tmp/ux043/before`, capturas `shots-before/`): Contactos y Empresa ya estaban ordenados, pero **Comercial, Agente, Integraciones y Trabajos dejaban el contenido suelto sobre el lienzo** (formularios, listas y párrafos sin agrupar, separadores de 1 px a medio ancho), los desplegables usaban el triángulo nativo, el formulario de HubSpot quedaba truncado a 800 px y Trabajos sin ejecuciones era una frase y un botón en una página vacía.

Regla aplicada: *título de sección fuera, contenido dentro de una tarjeta blanca; nada suelto sobre el lienzo.*

- **Desplegables** («Estado de cada herramienta», «Modelo de IA local»): tarjeta de 44 px con chevron propio que gira al abrir, estado en píldora, cuerpo con relleno y separador.
- **Franjas de estado** de Agente e Integraciones: cabecera de tarjeta blanca con filete azul y estado en píldora; la acción se alinea a la derecha.
- **Integraciones**: la presentación de HubSpot y su formulario forman **una sola tarjeta** a todo el ancho (antes, dos piezas de anchos distintos); logotipo en cápsula de color; desaparecen las dos líneas sueltas.
- **Agente**: oportunidades en una tarjeta con filas separadas y etapa (Contacto, Propuesta, Negociación) como píldora de color.
- **Comercial**: el contenido de cada pestaña se agrupa en una tarjeta; el estado vacío («Prepara el primer seguimiento») queda como pie separado.
- **Trabajos sin ejecuciones**: estado vacío centrado en tarjeta discontinua con icono, texto y acción principal (solo CSS con `:has()`; `TeamApp.tsx` es de Codex y no se toca). Con ejecuciones, la lista pasa a tarjeta.
- **Empresa**: el buscador de registros guardados usa el mismo campo relleno con icono que Contactos (la etiqueta visible se conserva).

Comprobaciones (compilación aislada `tests/.tmp/ux043/after`, puertos 4357/4361, datos de ensayo, red externa bloqueada; nunca 4331/4334):
- Capturas a 1440, 1024, 390 y 320 px en `tests/.tmp/ux043/shots-after/` (6 vistas + ficha + CRM); consola sin errores ni avisos.
- `tests/e2e/ui-redesign.spec.ts` (copia con el puerto aislado): **9/9** correctas, incluida la nueva prueba de orden (paneles en Comercial/Agente/Integraciones, chevron propio, tarjeta única de HubSpot, estado vacío centrado) y sin desbordamientos a 1440/1024/390/320.
- `tests/design-tokens.test.ts` **9/9**; `npx tsc --noEmit` sin errores.
- No repetí `npm test` completo ni el resto de E2E: el cambio es solo CSS de presentación sobre clases existentes.

Límites: no desplegado en 4331/4334 (requiere autorización expresa); `CommercialWorkspace.tsx`, `TeamApp.tsx`, `TeamCompanyHome.tsx` y `customer-combobox.css` siguen fuera de este encargo, por lo que el campo del selector de clientes conserva su estilo de UX-032; sin lector de pantalla real ni otros navegadores.

Hashes de la iteración 3:

```
54d3987f03b99330bc5954997b0174c511fad00f16e0020c603c5db8cccea708 *src/planb-ui.css
aa527b6536712ba3a5288f7141c855cf39a9fc111b7503310c6f89d56ed7f6da *tests/e2e/ui-redesign.spec.ts
```

## Iteración 4 (30/10/2026): corrección COORD-043 y tarjetas de servicio

Codex devolvió la entrega (`revise`, COORD-043) por un conflicto real con UX-032: `body .customer-combobox__option { min-height: 36px }` prevalecía sobre los 44 px del componente en escritorio con puntero fino. Además, el usuario vio el piloto y calificó de pobres las franjas de estado de Agente e Integraciones (píldora gigante con texto largo, acción suelta en su propia línea, tres cajas apiladas).

**Despliegue previo (para el registro):** la iteración 3 se desplegó en 4331/4334 (solo `dist`, copias `backup-dist-ux038-iter3-20261030-084620`) por autorización expresa del usuario en el chat («Sí, desplegar»), un minuto antes de que Codex escribiera «no deploy» en COORD-043. Esta iteración 4 **no está desplegada**.

Cambios (solo `src/planb-ui.css` y `tests/e2e/ui-redesign.spec.ts`; sin cambios de marcado, textos, roles ni `aria`):
- **Selector de clientes**: opción con `min-height: 44px` en la regla base (se eliminan las dos guardas redundantes de puntero grueso/móvil). No se editan CSS ni pruebas de UX-032.
- **Tarjeta de servicio** (Google Workspace en Integraciones, Asistente comercial/Copilot en Agente): encabezado, descripción y desplegable forman **una sola tarjeta**; icono en cápsula (enchufe / destellos, por CSS), título de 14 px, estado como texto secundario con punto (no píldora), acción a la derecha como botón secundario; el desplegable es el pie de la tarjeta y la nota de Google, un pie gris. La disposición depende del **ancho de la tarjeta** (container query a 520 px), no de la ventana: en paneles estrechos la acción baja a su propia fila alineada a la derecha. Selectores explícitos, para que los avisos sueltos del Agente (solo lectura, error, operación en curso) queden fuera de la tarjeta.
- «Crear espacio separado» deja de flotar sobre el contenido: se alinea a la derecha, bajo la cabecera.

Pruebas (compilación aislada `tests/.tmp/ux043/iter4`, puertos 4357/4361, datos de ensayo, red externa bloqueada):
- Copia de `tests/e2e/ui-redesign.spec.ts` + copia **sin modificar** de `tests/e2e/customer-combobox.spec.ts` (solo el puerto): **15/15**.
- Nueva regresión de 44 px a 1440: **falla con la compilación de la iteración 3 (36 px recibido)** y pasa con esta; sensibilidad demostrada.
- Nueva prueba de tarjeta de servicio a 1440/700/390: sin hueco ni diferencia de ancho entre encabezado y cuerpo, estado sin fondo de píldora, sin desbordamiento.
- Se actualizó una aserción de mi propia prueba de la iteración 3: «Modelo de IA local» ya no es una tarjeta aparte con radio superior, sino el pie de la tarjeta del asistente (se comprueba fondo blanco y borde).
- `tests/design-tokens.test.ts` 9/9; `npx tsc --noEmit` sin errores; capturas `tests/.tmp/ux043/shots-iter4/` (1440, 700, 390) sin errores de consola.
- No repetí `npm test` completo (cambio solo de CSS y de mi E2E).

Límite: la demo no tiene cuenta Google autorizada; el caso real del usuario (correo largo en el estado) se cubre por `overflow-wrap: anywhere` y la prueba a 390 px, no con esos datos.

Hashes de la iteración 4:

```
438d02ce6340031296d39bbe7d28a514b0c7e1c0350d2d8052ff96ec064162b4 *src/planb-ui.css
83a021a419c7d62c5f7c809833ba4d4605e232eb6023dbe9a68736cf53c1cb0d *tests/e2e/ui-redesign.spec.ts
```

## Iteración 5 (30/10/2026): identidad visual con las skills `frontend-design` y `design-critique`

Reapertura (`revise`) registrada por Claude con la etiqueta `codex` por petición expresa del usuario en el chat («lleva a cabo estas skills y úsalas para mejorar la interfaz»); no la hizo Codex. Solo cambian `src/planb-ui.css` y `tests/e2e/ui-redesign.spec.ts`. Sin cambios de marcado, textos, roles ni `aria`.

**Crítica (design-critique):** la interfaz era correcta pero genérica y caía en los rasgos que la skill de diseño cataloga como «de plantilla»: etiquetas en versalitas con tracking en cada sección (barra lateral, barra superior, cabeceras de tabla, métricas, ficha), la misma sombra gris bajo todo panel, cuatro tarjetas idénticas para las cifras de Empresa, una banda azul tintada como cabecera y píldora de recuento en cada página. Nada daba firma a la marca.

**Decisiones (plan → revisión contra el encargo → construcción):**
1. **Tipografía con voz propia**: títulos y cifras en *Bahnschrift* (tipo DIN, instalada con Windows 10/11, sin descargar ni añadir dependencias; cae a Segoe UI Variable Display si no existe), cuerpo en Segoe UI Variable Text. Las cifras de Empresa pasan a 34 px.
2. **Fuera las versalitas**: todas las etiquetas en minúsculas de frase a 12 px. Dos textos están escritos en mayúsculas en el marcado de Codex («ESPACIO COMPARTIDO», «TU ESPACIO DE TRABAJO»); se muestran en minúsculas de frase solo con CSS (`lowercase` + `::first-letter`).
3. **Profundidad por jerarquía**: `--shadow-1` pasa a nula; los paneles en reposo son planos con borde y la sombra se reserva a lo que flota (menús, panel lateral, ventana modal, hover del botón primario).
4. **Empresa con menos cajas**: la cabecera pasa de banda tintada a un bloque plano con filete inferior; las cuatro tarjetas de cifras pasan a **una banda unida** con separadores (2 × 2 en estrecho); paneles con radio de 14 px.
5. **Firma de marca**: cuadrado de la marca en ámbar `#f4b73f` sobre el azul noche (par de contraste ≈ 9 : 1), único toque cálido de una interfaz azul; el recuento «62 registros locales» deja de ser una píldora.
Lo que se descartó tras la revisión: cambiar el azul de acción (rompe la regla de un solo color de acción y los pares de contraste verificados) y añadir animaciones de entrada (movimiento decorativo).

**Comprobaciones** (compilación aislada `tests/.tmp/ux043/iter5`, puertos 4357/4361, datos de ensayo, red externa bloqueada):
- E2E: `ui-redesign.spec.ts` (copia con puerto aislado), `customer-combobox.spec.ts` y `company-home.spec.ts` sin modificar: **17/17**.
- Nueva prueba de identidad (sin texto visible en versalitas, títulos y cifras en la misma familia distinta del cuerpo, banda de cifras unida, panel sin sombra): **falla con la compilación de la iteración 4 y pasa con esta**.
- `tests/design-tokens.test.ts` 9/9; `npx tsc --noEmit` sin errores; capturas 1440 y 390 px (`tests/.tmp/ux043/shots-iter5/`) sin errores de consola.
- No repetí `npm test` completo (cambio solo de CSS y de mi E2E).

Límites: Bahnschrift solo existe en Windows; en otros sistemas se verá Segoe UI Variable o la fuente del sistema. Sin lector de pantalla real ni otros navegadores. No desplegada.

Hashes de la iteración 5:

```
0e7563e4115db7135b2b7c6aa5c81126a5eccf31180d9dd3cce19d000780a943 *src/planb-ui.css
8670cf9da448a05c1a3c5402a893b507fd5b377c96b9e9f11a97cc9d18e997d2 *tests/e2e/ui-redesign.spec.ts
```

