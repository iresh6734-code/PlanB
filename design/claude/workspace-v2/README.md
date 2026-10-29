# Mesa de trabajo comercial · prototipo de interfaz (CLAUDE-UI-010)

Prototipo funcional en HTML, CSS y JavaScript sin dependencias para escoger el trabajo del día, consultar el contexto guardado de un cliente, preparar un seguimiento y revisar sus efectos. **No está conectado a ningún servicio**, no usa red, almacenamiento del navegador ni cookies, y no toca la app de Plan B. Es un diseño para que Codex decida qué se integra.

## Abrirlo

1. Abre `design/claude/workspace-v2/index.html` en un navegador (doble clic o «Abrir con»). No necesita servidor ni instalación.
2. La URL solo guarda la vista (`#hoy`, `#comercial`, `#integraciones`). Nunca guarda clientes ni texto del borrador.
3. Al recargar, todo vuelve al estado vacío: nada se persiste.

Archivos: `index.html` (estructura y landmarks), `styles.css` (tokens y estilos con prefijo `pbw-`), `app.js` (núcleo puro + interfaz), `components.md` (contratos para portarlo a React y plan de integración).

## Modelo de escenarios

El selector **«Escenario de revisión (herramienta del prototipo)»** de la franja superior no es un ajuste de una app conectada. Controla qué estado se enseña:

| Escenario | Qué muestra | Qué se conserva |
|---|---|---|
| Vacío (inicial, el único real) | Explicación honesta y acción «Abrir mesa de preparación» | — |
| Carga | Texto + `aria-busy`, sin depender de un spinner | Selección y borradores en memoria |
| Error | Mensaje, «Reintentar» y aviso `role=alert` único | Selección válida; el borrador no se muestra mientras no haya datos |
| Solo lectura | Casos de muestra con origen de solo lectura | Todo |
| Origen desactualizado | Casos de muestra con captura de hace 45 días y aviso | Todo |
| Datos de muestra | Casos de interfaz (ver abajo) | Todo |

«Ver casos de interfaz» equivale a *Datos de muestra*; «Volver al vacío» regresa al estado inicial. Si hay borradores con cambios sin guardar, la vuelta al vacío y el cambio de espacio piden confirmación local (franja de aviso, no `window.confirm`).

Los datos de muestra se generan en memoria y están rotulados: «Contacto de muestra NN», «Empresa de muestra NN», correos `@example.invalid`. El espacio A tiene 240 clientes (densidad) y el B tiene 5. Los casos de borde están al principio: 01 completo con tarea vencida, 02 sin correo, 03 sin oportunidad, 04 de solo lectura, 05 sin nombre registrado, 06 con origen no activo. Ninguno existe fuera de este prototipo ni debe insertarse en Plan B. Las fechas se calculan respecto al día actual del navegador.

## Flujos implementados

- **Hoy**: lista de trabajos con motivo, origen, fecha de vencimiento solo si existe y acción concreta. Filtro Todas / Requieren revisión / Sin próxima acción, y búsqueda local por cliente, empresa, correo o tarea. Filtrar sin resultados dice que hay datos pero no coinciden y ofrece quitar el filtro. El orden es por fecha de vencimiento (no es una clasificación de urgencia). Cada fila abre la ficha; «Preparar seguimiento» deshabilitado explica su causa justo debajo.
- **Comercial**: cola de clientes (búsqueda por nombre, empresa o correo, paginada de 60 en 60) y mesa de trabajo. Un único `selectedId` se comparte entre Seguimiento y Archivos y entre vistas. Por debajo de 900 px la cola se colapsa en un botón que muestra el cliente elegido.
- **Seguimiento**: contexto de captura (procedencia y fecha siempre visibles y marcadas como «no es una consulta actual»), oportunidades, próxima acción, editor (correo, asunto, mensaje, acción interna opcional), vista previa y panel de revisión junto al editor.
  - Borrador local en memoria. «Guardar borrador local» valida (correo, asunto, mensaje). Editar después de guardar marca «Cambios pendientes» e invalida la revisión.
  - La casilla «He revisado…» y «Marcar revisión local» solo se habilitan con contenido válido y guardado. Cambiar destinatario, texto o la acción interna obliga a revisar de nuevo (se avisa de la invalidación).
  - El resultado es «Revisión local completada; no se ha enviado nada».
  - Correo, Reunión, Documento e Informe son interruptores deshabilitados con el motivo asociado por `aria-describedby`. «Ver campos» (reunión y documento) abre campos de ejemplo no editables y sin efecto. No hay botón «Enviar».
  - «Borrador sin cliente» permite redactar con un destinatario editable y sin afirmar identidad CRM. Un cliente sin nombre se muestra como «Sin nombre registrado»; nunca se muestra un ID.
- **Archivos**: lista de muestra, vacía, búsqueda sin coincidencias, sin autorización, cargando y error. Añadir y abrir documentos remotos están deshabilitados con motivo.
- **Ficha lateral** (`role=dialog`, `aria-modal`): campos disponibles, oportunidades, actividad conservada (tareas CRM de muestra, acciones internas y notas, cada una con su origen y fecha de vencimiento), acciones internas y «Preparar seguimiento». Escape cierra, Tab queda atrapado, el fondo es `inert` y el foco vuelve al disparador mediante una clave estable (`data-pbw-key`), no por índice. Crear o completar una acción interna pasa por una operación simulada de 350 ms: mientras dura, el botón se deshabilita, la segunda pulsación se ignora y «Preparar seguimiento» muestra «operación en curso».
- **Integraciones**: lista por capacidad (no hay mosaico de logos) con el estado real «Sin configurar» y sin evidencia; leyenda de los cuatro estados; explicación de reconexión y de lectura frente a edición; en modo muestra, tabla de ejemplos rotulados con «fecha de muestra». No hay botón de autorización.
- **Anuncios**: un `role=status` para éxitos y un `role=alert` para fallos, alimentados solo por eventos discretos (guardar, revisar, cambiar escenario…), nunca por pulsación de tecla. Un mismo mensaje no se repite en 3 s.

## Límites

- Todo es memoria de la pestaña. No hay persistencia, red, cuentas ni integración alguna.
- Los datos y fechas de muestra son ilustrativos; «Requieren revisión» solo agrupa los avisos que el prototipo calcula (vencida, sin correo, solo lectura, sin oportunidad, origen no activo).
- No se implementa modo oscuro ni impresión. El idioma es solo español.
- La cola pagina por «Mostrar más» en vez de virtualizar; con miles de elementos habría que virtualizar.
- Las tareas CRM de muestra no se pueden completar (el CRM es de solo lectura aquí); solo se completan acciones internas.
- Las acciones internas de un borrador sin cliente no existen (no tendrían a qué cliente asociarse), por eso esa opción no se ofrece.

## Comprobaciones realizadas

Realizadas en Node, sin instalar nada ni abrir procesos persistentes:

- `node --check design/claude/workspace-v2/app.js` → sintaxis correcta.
- 17 grupos de pruebas de las transiciones puras (`reduce` y selectores): vacío inicial, casos de muestra, causas de «Preparar seguimiento», ciclo guardar → revisar → editar invalida, correo inválido, selección compartida, cambio de espacio y vuelta al vacío con confirmación, error/carga conservan selección, doble clic sin duplicados, panel, etiquetas sin ID y datos solo `example.invalid`. Todas superadas.
- Prueba de humo con un **DOM simulado mínimo** (no es un navegador): recorre vacío → muestra, búsqueda y filtros, ficha (foco, `inert`, Escape, devolución de foco, doble envío), preparar, guardar, revisar, invalidar, Archivos, cola, los 6 escenarios en las 3 vistas y el aviso de cambio de espacio. Sin errores de ejecución.
- Búsqueda estática: ni `innerHTML`/`outerHTML`/`insertAdjacentHTML`, ni `eval`/`new Function`, ni `fetch`/`XMLHttpRequest`, ni `localStorage`/`sessionStorage`/`indexedDB`/cookies, ni URLs externas (solo el espacio de nombres SVG como constante), ni TODO ni texto de relleno. El CSS no tiene selectores sin prefijo `pbw-` fuera de `.pbw-root`.

- **Cascada de botones** (tras la revisión real de Codex): los resets viven en `:where(.pbw-root …)` (especificidad 0) para que ninguna variante `pbw-btn--*`, `pbw-tab`, etc. pierda su color, tipografía o espacio. Un resolvedor mínimo de cascada sobre `styles.css` (no es un navegador) da principal `#ffffff` sobre `#1f4e8c` (8,31:1 calculado a partir de los tokens) y conserva los estados deshabilitados. Detalle en `coordination/reports/CLAUDE-UI-010.md`.
- Favicon SVG en `data:` dentro de `index.html`, sin archivo ni red.

## Lo que NO se ha comprobado (para Codex)

No había navegador disponible ni estaba permitido usarlo, así que **no se afirma** QA visual, contraste medido, teclado real ni lector de pantalla. Lista para revisar:

1. **Anchos** 1440, 1024, 768, 390 y 320 px: sin scroll horizontal global, sin texto esencial recortado, editor y contexto apilados bajo 900 px, panel de revisión pegado al editor, cola colapsable usable.
2. **Contraste** de texto, estados deshabilitados, avisos y foco (tokens en `.pbw-root`; no medidos).
3. **Teclado**: orden de Tab (saltar → franja del prototipo → espacio → navegación → contenido), flechas/Inicio/Fin en las pestañas, Escape y trampa de foco en la ficha, devolución de foco tras cerrar y tras filtrar, ausencia de atajos de letra.
4. **Lector de pantalla**: que `role=status` y `role=alert` anuncien una sola vez, que los motivos deshabilitados se lean (`aria-describedby`), que `aria-busy` y los encabezados sean coherentes.
5. **Reemplazo de DOM**: la interfaz reconstruye regiones en cada acción y restaura el foco por clave; comprobar en navegador real que no se pierde el foco ni la posición de selección al escribir (los campos de texto no se reconstruyen al teclear).
6. `inert` y `prefers-reduced-motion` en los navegadores objetivo.
