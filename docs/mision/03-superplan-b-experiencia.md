# Misión maestra · 3. Superplan B: experiencia, sistema visual y reestructuración

21/11/2026. Parte de la auditoría (`01-auditoria.md`, §3 y §4) y de las capturas en `tests/.tmp/mision/shots/antes/`.

## B0 · Decisión transversal: converger, no rediseñar otra vez

En diez días la App pasó por cinco identidades: Operaciones claras, Grafito, Faro, Cuaderno y Consola. Cada una se añadió como **capa nueva** encima de las anteriores. Por eso las proporciones no cuadran: lo que el usuario ve es la suma de cinco sistemas.

**Decisión propuesta:**

- Se conserva la identidad vigente, **«Consola de operaciones»** (`DESIGN.md`): bastidor grafito, mesa gris lisa, bahías, tiras y cobalto para actuar.
- No se inventa una sexta. El trabajo es **hacerla única**: un solo juego de tokens, una sola biblioteca de piezas y una sola hoja global.
- Las capas anteriores se retiran por pantallas, con medida antes y después.

Así se cumple la regla 13 de la misión: converger hacia una versión definitiva.

## B1 · Reglas de composición verificables

Cada regla tiene su comprobación en el medidor `tests/.tmp/mision/measure.mts`, que se convertirá en herramienta del repositorio en la fase 2.

| # | Regla | Comprobación |
| --- | --- | --- |
| C1 | **El ancho lo decide el contenido.** Formularios ≤ 720 px. Tablas de ≤ 4 columnas con columnas proporcionales y ancho máximo de 1.040 px. Páginas de lectura ≤ 1.280 px | Hueco de la primera vista < 25 % con los datos de muestra, salvo estados vacíos |
| C2 | **Una acción principal por vista.** Las demás, secundarias o en «Más» | `foldPrimary ≤ 1` |
| C3 | **Una cifra grande por pantalla**, la que dice qué urge | Revisión de capturas |
| C4 | **Nada a cero con peso visual.** Vistas, cifras o avisos a 0 se atenúan o desaparecen | Búsqueda de recuentos «0» con estilo normal |
| C5 | **Estado vacío de una línea con su acción.** Nunca un asistente deshabilitado ni paneles vacíos apilados | Revisión de estados vacíos |
| C6 | **Las acciones van junto a lo que tocan.** Globales en Continuidad o en la paleta; de lista en la cabecera de la lista; de registro en la ficha | Inventario de acciones por pantalla |
| C7 | **Una sola vez cada dato.** Si dos bloques dicen lo mismo, sobra uno | Revisión de duplicados (Inicio y Continuidad los tienen hoy) |
| C8 | **Profundidad por niveles.** Primer plano: lo imprescindible. Contexto: cerca de lo que explica. Detalle: plegado, cajón o vista propia | Bloques visibles en la primera pantalla ≤ 6 |
| C9 | **Móvil en ≤ 3 pantallas** en Inicio, Hoy y listas con la copia de muestra | `scrollScreens` a 390 px |
| C10 | **Sin desborde horizontal** a 320, 390, 1366 y 1440 px | `hOverflow = 0` (ya se cumple) |

## B2 · Sistema visual único

### B2.1 Tokens (los que ya define `consola.css`, sin colores nuevos)

| Familia | Valores únicos permitidos | Hoy medido |
| --- | --- | --- |
| Tamaños de letra | 11 · 12 · 13 · 15 · 20 px (24 solo en una cifra destacada) | 19 tamaños |
| Alturas de control | 28 (compacta) · 32 (cómoda) · 44 (táctil ≤ 600 px) | 15 alturas de botón; campos de 40 y 44 en móvil |
| Radios | 2 (filas y chips) · 4 (controles y bahías) · 6 (capas flotantes) · 999 (píldoras) | 9 radios |
| Espaciado | Múltiplos de 4: 4 · 8 · 12 · 16 · 24 · 32 | Sin medir |
| Elevación | 0 (mesa) · 1 (bahía: filete de 1 px) · 2 (capa flotante: sombra) | Sombras en tarjetas de varias capas |
| Color semántico | Cobalto = actuar · Señal = vencido o error · Ámbar = revisar · Verde = hecho · Lápiz = prueba o simulación | El rojo se usa también como botón permanente en la barra |

### B2.2 Piezas compartidas (en `src/ui/`, ya iniciado)

Se completa una biblioteca mínima y **toda pantalla nueva o rehecha solo la usa a ella**:

- `PageHeader` (título, una línea de contexto, una acción principal y «Más»).
- `Bay` (bahía con regla superior), `Strip` (fila o tira), `DataTable` (columnas proporcionales y fila pulsable).
- `StatLine` (cifras en línea; las que valen 0, atenuadas), `EmptyState` (una línea y una acción), `ErrorState`, `Skeleton`.
- `Field` y `FormSection` (ancho máximo de 720 px), `Dialog`, `Drawer`, `Tabs` (solo si cada pestaña es una tarea distinta).
- `StatusChip` (sello de estado) y `Notice` (aviso de bloque, con tono).

### B2.3 Retirada de capas

Orden: `refinements.css` → `operaciones-claras.css` → `design-system.css` → `planb-ui.css` → `faro.css` (por secciones) → `styles.css`.

Por cada pantalla migrada:

1. Captura y medida antes.
2. Migración a piezas y tokens.
3. Borrado de las reglas que ya no aplican (`tools/visual/css-trim.mjs` y `css-unused`).
4. Captura y medida después, con el mismo medidor.

**Meta 1.0:** una hoja global (`consola.css`, renombrada a `ui.css`) más hojas por pantalla que solo usan tokens, y CSS total inicial < 200 KB (hoy ≈ 380 KB de CSS inicial y ≈ 680 KB en total).

### B2.4 Profundidad, sin decorar

- La mesa es lisa. Las bahías se separan por tono (`--bay`) y un filete de 1 px; sin sombra.
- La sombra solo va en lo que flota (menús, paleta, ventanas y cajón).
- Foco visible en cobalto de 2 px con separación, en todo control.
- Microinteracciones de 120-160 ms solo en opacidad y color: abrir un plegable, confirmar un guardado. Movimiento reducido respetado.
- Sin degradados ni transparencias decorativas.

## B3 · Arquitectura de información

### B3.1 Menú (de 5 lugares + Laboratorio a 5 lugares limpios)

| Lugar | Contiene | Cambios |
| --- | --- | --- |
| **Inicio** | Puesto de mando | Rediseño (B4.1) |
| **Hoy** | Tareas de hoy · Agenda · Revisión semanal | Fuera **Propuestas** (duplicaba Hoy) |
| **Clientes** | Clientes · Empresas · Oportunidades · Tareas | Oportunidades recibe la analítica de Inicio |
| **Continuidad** | Estado (Copia · Prueba · Vuelta) · Cambios · Exportar | Recibe **Configurar Plan B** (antes Preparación en Ajustes). **Copia de equipo** solo si hay servicio de equipo |
| **Ajustes** | Integraciones · Plan y licencia · Seguridad | Fuera la subentrada «Abrir aplicación»; Proveedor de IA solo con datos de prueba |
| *(Demostración)* | Radar · Comprobar fecha · ¿Y si cae…? | Solo en el modo demostración con datos de prueba, debajo de un separador. Nunca en una instalación con datos reales (ya es así en el servidor) |

### B3.2 Barra superior

- **Fuera el botón rojo permanente «HubSpot no responde».**
  - Es una orden con aspecto de alarma: con HubSpot funcionando, la App enseña siempre un aviso rojo.
  - Se sustituye por un control neutro con el mismo nombre accesible y el mismo efecto, sin tinta de señal.
  - La señal se reserva para cuando el modo contingencia **está activo**: entonces la banda de contingencia se ve en toda la App.
- Se queda: copia (antigüedad), modo de datos, novedades, tema, órdenes y bloquear.

## B4 · Reestructuración por pantalla

### B4.1 Inicio → «Puesto de mando»

Hoy: 12 bloques, la misma acción tres veces y 2,1 pantallas de scroll (5,2 en móvil).

```
┌ Inicio · sábado 21 de noviembre ─────────────────────────── [Abrir Hoy] ┐
│ ■ 14 tareas vencidas · copia de hace 2 min · Plan B preparado 3 de 5 ›   │  ← una línea de estado
├──────────────────────────────────────────┬───────────────────────────────┤
│ SIGUIENTE PASO (uno solo)                │ TU COPIA (riel)               │
│ Revisa «Revisar los detalles · Pablo»    │ Índice de preparación 3/5     │
│ [Abrir la tarea]                         │ ✓ reciente ✓ íntegra          │
│ PRIORIDADES DE HOY (5 filas)  Ver Hoy →  │ ○ probada ○ fuera del PC ○ …  │
│ OPORTUNIDADES EN RIESGO (≤ 5) Tablero →  │ [Siguiente: probar la copia]  │
│ CLIENTES QUE SE ENFRÍAN (plegado, 1 línea)│ Calidad de datos · sin avisos │
└──────────────────────────────────────────┴───────────────────────────────┘
```

- Fuera de Inicio: objetivo y previsión del mes (a Oportunidades › Analítica), la semana en una línea (a la Agenda), el Radar (al modo demostración) y el parte de la mañana como bloque. Este último se convierte en la **línea de estado**, con el enlace «copiar como texto».
- La banda de onboarding se funde con el riel: el siguiente paso de preparación **es** la acción del riel.
- **Meta:** ≤ 6 bloques, ≤ 1,2 pantallas en escritorio y ≤ 3 en móvil, y cada dato una sola vez.

### B4.2 Continuidad · Estado → Copia · Prueba · Vuelta

Hoy: 11 bloques, preparación dicha cuatro veces y dos acciones principales.

- **Cabecera:** índice de preparación (A1) con el siguiente paso como **única** acción principal. «Activar modo contingencia» pasa a acción secundaria fija a la derecha, con su explicación en el título emergente.
- **Tres bahías en lugar de cuatro pestañas:**
  - **Copia:** antigüedad, registros, cobertura y lo que no se copia (A10-2), cronología plegada y «Capturar ahora».
  - **Prueba:** último simulacro, próximo programado, «Probar mi Plan B» y práctica guiada.
  - **Vuelta:** cambios locales pendientes, último paquete de vuelta y enlace a Cambios.
- **Informes:** un único menú «Informes ▾» con el parte, el informe del mes, la marca y el diagnóstico.
- «¿Cuánto costaría parar?» sale de la pantalla operativa.
- **Meta:** ≤ 6 bloques, ≤ 1,3 pantallas y un solo modelo de preparación.

### B4.3 Continuidad · Cambios

- **Sin cambios:** `EmptyState` de una línea («Lo que edites en la copia aparecerá aquí para devolverlo a HubSpot») y nada más.
- **Con cambios:** lista agrupada por registro con «campo: antes → después» (ya existe). Encima, el asistente de vuelta (A4) con sus cinco pasos **solo cuando hay algo que devolver**.
- Fuera «Propuestas de agentes».

### B4.4 Hoy, Agenda y Revisión semanal

- **Hoy:** una acción principal («Organizar mi jornada»). «Despachar N vencidas» aparece solo si N > 0, junto a la pestaña Vencidas. Estado y fecha en una columna. Fila entera pulsable. El aviso del Laboratorio, solo en el modo demostración.
- **Agenda:** una sola cifra de vencidas (A8). El panel lateral muestra el **día seleccionado**; las vencidas son un enlace a Hoy › Vencidas.
- **Revisión semanal:** cifras a 0 atenuadas (C4) y la lista de vencidas con el mismo componente que Hoy.

### B4.5 Listas (Clientes, Empresas, Oportunidades, Tareas)

- Columnas proporcionales por tipo de campo: nombre 2 fr, correo y web 2 fr, teléfono 1 fr, fecha 1 fr e importe 1 fr, alineado a la derecha. Ancho máximo de tabla de 1.040 px con ≤ 4 columnas.
- Vistas rápidas: las que están a 0 se atenúan y van al final; «Guardar vista» en «Más».
- Barra inferior **solo de la lista** (recuento, «guardado en este ordenador» y paginación). «Ver cobertura» y «Desconectar servicios» pasan a Continuidad › Copia y a la paleta.
- Móvil: tarjetas de dos líneas (nombre y dato clave; segunda línea con empresa o fecha) para bajar Clientes de 4,6 a ≤ 3 pantallas.

### B4.6 Ficha

Resumen y acciones en la cabecera fija; relacionados a continuación; actividad, secuencias e historial **plegados** con su recuento. Se revisa con una copia de 1.000+ registros antes de cerrarla.

### B4.7 Exportar

Una columna de 720 px con tres pasos numerados: 1) revisa el contenido, 2) contraseña de recuperación, 3) descarga. El botón deshabilitado dice al lado qué falta. Las advertencias se resumen en una línea con «Más detalles».

### B4.8 Ajustes

- **Integraciones:** filas de conexión (logotipo, estado, última lectura y acción). Google solo con servicio de equipo.
- **Configurar Plan B** (antes Preparación): se lanza desde Continuidad y desde el primer uso. Botones a 28 px como el resto.
- **Plan y licencia:** estado de licencia del servidor (A6).

## B5 · Estados transversales

- **Carga:** `Skeleton` con la forma de la pantalla. Existe `ui-loading` y se unifica.
- **Vacío:** `EmptyState` (C5).
- **Error:** `ErrorState` con qué pasó, qué se conserva y «Reintentar». Existe y se extiende a todas las páginas diferidas.
- **Prueba o simulación:** recuadro de trazo discontinuo (lápiz) en todo lo que no es real.
- **Contingencia activa:** banda de señal en toda la App, con duración y «Terminar».

## B6 · Accesibilidad

- Contraste AA en claro y oscuro: ya lo prueba `design-tokens.test.ts` sobre los tokens. Falta un caso concreto: el apartado activo del menú móvil está a 2,78:1 (`faro.css:508-509`) y hay que corregirlo.
- Objetivos táctiles de 44 px en móvil (`consola.css:53` deja 40 px).
- Un `h1` por vista. En «Comprobar fecha» el `h1` es `sr-only` y la medición no lo ve; se mantiene así.
- Las comprobaciones `tools/visual/a11y.mts` y `tools/team-audit` se pasan antes de cerrar cada fase.

## B7 · Criterios de salida del Superplan B

1. Las 19 rutas medidas antes y después con el mismo medidor y las mismas datos de muestra, y las capturas comparadas.
2. Tamaños de letra ≤ 6, alturas de control ≤ 3 por modo y radios ≤ 4 en el agregado de la App.
3. Ninguna pantalla con datos con un hueco > 25 % en la primera vista; los estados vacíos, centrados y compactos.
4. Inicio y Continuidad con ≤ 6 bloques, cada dato una sola vez y una acción principal.
5. Móvil ≤ 3 pantallas en Inicio, Hoy y listas.
6. a11y sin avisos en claro, oscuro y móvil.
7. Una sola hoja global y CSS inicial < 200 KB.
