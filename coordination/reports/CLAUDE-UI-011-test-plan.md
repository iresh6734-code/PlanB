# CLAUDE-UI-011 · Plan de pruebas manuales (accesibilidad e interacciones)

Complementa `CLAUDE-UI-011-accessibility.md` (en adelante **ACC**; las referencias A1…, R1…, §n son suyas). **Ningún caso ha sido ejecutado**: es un plan para QA sobre el prototipo final. Estado de todos los casos: `Sin ejecutar`.

## Convenciones

- **Prioridad**: P0 = bloquea integración; P1 = corregir antes de integrar salvo decisión; P2 = mejora comprobada.
- Textos entre comillas = literales del brief (`brief L…` en ACC); si el prototipo final usa otros, anotar la diferencia y seguir.
- **Visible** = lo que ve cualquiera. **Accesible** = lo que expone el árbol de accesibilidad / lector de pantalla (Narrador, NVDA o VoiceOver) o, como mínimo, las herramientas de accesibilidad del navegador.
- Los casos dependen de las decisiones A1–A13 de ACC. Mientras Codex no las fije, el resultado esperado indicado es la **propuesta**; si se decide otra cosa, actualizar la aserción, no relajarla.
- Orígenes de datos: solo los de muestra (`Contacto de muestra 01`, `Empresa de muestra`, `*@example.invalid`). No introducir datos reales en ningún campo.
- Abreviaturas: "Panel" = ficha lateral; "Cola" = lista de clientes de Comercial; "Mesa" = zona de editor/vista previa/revisión.
- Equipo mínimo: Chrome o Edge en Windows 11; segundo navegador (Firefox) para T20 y T26; un lector de pantalla para las aserciones accesibles; emulación táctil/móvil o dispositivo para T27.

---

## A. Arranque, estructura y vacío

### T01 · P0 · Vacío inicial honesto, sin datos inventados
- **Precondición**: carga limpia de `index.html`, sin tocar el selector de escenarios.
- **Pasos**: 1) Abrir la página. 2) Recorrer con Tab hasta Hoy, Comercial e Integraciones, visitando cada vista y volviendo a Hoy. 3) Buscar visualmente nombres, importes, fechas de captura, portales o actividades.
- **Visible**: "Prototipo de interfaz · sin conexión a servicios" visible sin desplazarse (no solo en el pie). Cada vista muestra un vacío con explicación y una acción para abrir la mesa de preparación; sin clientes, cifras, actividad ni fechas.
- **Accesible**: cada vista tiene un `h1`; el vacío es texto, no imagen; la acción es un botón/enlace con nombre; la fecha de captura no aparece si no existe (no "—" ambiguo sin texto).
- **Detecta**: datos precargados, métricas inventadas, fecha ficticia, vacío mudo sin acción, texto "sin conexión" solo en el pie.

### T02 · P0 · Salto, landmarks y orden de Tab en el vacío
- **Precondición**: T01, ventana 1440 px.
- **Pasos**: 1) Pulsar Tab una vez desde la barra de direcciones. 2) Pulsar Enter en el enlace. 3) Pulsar Tab. 4) Volver al inicio y recorrer toda la página con Tab anotando el orden. 5) Con la lista de landmarks/encabezados del lector o de las herramientas de accesibilidad, anotarlos.
- **Visible**: el primer Tab muestra "Saltar al contenido" con foco visible; tras Enter el foco visible está en el contenido (sin recuadro desproporcionado sobre todo `main`) y el siguiente Tab cae dentro de la vista, no en la cabecera. El orden visual (izquierda→derecha, arriba→abajo) coincide con el de Tab.
- **Accesible**: landmarks: región "Herramientas del prototipo", banner, navegación "Vistas principales", main, contentinfo; ninguno duplicado sin nombre; `aria-current="page"` en la vista activa; un solo `h1`.
- **Detecta**: enlace de salto sin destino/sin efecto de foco, tab order que difiere del visual (`order`/grid), `h1` ausente o repetido, contenido fuera de landmarks (`#pbw-notices` vacío no cuenta).

### T03 · P1 · "Ver casos de interfaz" y vuelta al vacío
- **Precondición**: vacío inicial.
- **Pasos**: 1) Tab hasta "Ver casos de interfaz"; Enter. 2) Observar foco, mensajes y listas. 3) Tab hasta el control de vuelta al vacío; Enter.
- **Visible**: todos los elementos de muestra se rotulan "Contacto de muestra NN", "Empresa de muestra" y correos `*@example.invalid`; el aviso de prototipo permanece; volver al vacío elimina todo rastro (selección, borrador, filtros).
- **Accesible**: tras activar, un único `status` ("casos de interfaz activados…" o equivalente); el foco no se pierde en `body` (permanece en el control o va a un destino documentado); el control cambia de nombre/estado de forma perceptible (`aria-pressed` o texto distinto).
- **Detecta**: muestras sin rótulo, mezcla de datos de muestra con vacío, foco perdido, mensaje anunciado dos veces, residuos tras volver al vacío.

---

## B. Selección, borrador y revisión

### T04 · P0 · Cambio de cliente manteniendo pestaña (Seguimientos/Archivos)
- **Precondición**: casos activos; Comercial; pestaña Archivos abierta; cliente Contacto de muestra 01 seleccionado.
- **Pasos**: 1) Con teclado, en la Cola, mover hasta Contacto de muestra 02 y pulsar Enter/Espacio (a 1440 px). 2) Cambiar a Seguimientos y volver a Archivos. 3) Repetir a 390 px usando el select compacto, con Flecha abajo y Enter.
- **Visible**: la pestaña activa sigue siendo Archivos tras cambiar de cliente; cabecera de mesa y contenido de Archivos muestran el cliente 02; al volver a Seguimientos muestra 02, no 01; una sola fila/opción marcada como seleccionada.
- **Accesible**: la pestaña activa mantiene su estado (`aria-selected`/`aria-pressed`/`aria-current` según patrón); la fila elegida tiene `aria-current="true"`; no hay dos elementos con estado seleccionado; el foco permanece en la Cola/select (no salta a `body`).
- **Detecta**: dos estados de selección desconectados (Seguimientos vs Archivos), pestaña que se resetea, foco perdido al re-renderizar.

### T05 · P0 · Cambio de cliente con borrador sin guardar (A3)
- **Precondición**: casos activos; Contacto 01 seleccionado; Asunto = `Prueba A`; no guardado.
- **Pasos**: 1) Seleccionar Contacto 02 en la Cola. 2) Observar la Mesa. 3) Volver a Contacto 01.
- **Visible**: en ningún momento el texto `Prueba A` aparece bajo el nombre de 02; si la política es "un borrador por cliente", 01 recupera `Prueba A` con su estado pendiente; si es "bloquear", se muestra un aviso claro con opciones y el cliente no cambia hasta decidir.
- **Accesible**: el aviso (si existe) se anuncia una vez y tiene foco/nombre si es un diálogo; el nombre de cabecera de la Mesa coincide con la selección; ningún `aria-label` conserva el cliente anterior.
- **Detecta**: borrador de A bajo B, pérdida silenciosa, diálogo `window.confirm` imposible de probar, confirmación por cada flecha en select.

### T06 · P0 · Cambio de espacio con cambios sin guardar (A1, A4)
- **Precondición**: casos activos; cliente 01; Asunto/Mensaje editados y sin guardar; ficha cerrada.
- **Pasos**: 1) En el selector de escenarios, volver al vacío (o cambiar el espacio). 2) Observar y volver a activar casos. 3) Repetir con el borrador guardado y con la revisión completada.
- **Visible**: se avisa localmente de que había cambios sin guardar (antes o después, según A4, pero explícito); tras el cambio, sin cliente seleccionado, editor vacío y revisión sin completar; al volver, nada del borrador anterior.
- **Accesible**: aviso anunciado una sola vez (`status` o `alert` según decisión, no ambos); foco en un destino lógico (aviso, `h1`), no `body`; `#pbw-notices` no queda con avisos obsoletos.
- **Detecta**: borrador que sobrevive al cambio, aviso mudo (no anunciado), aviso sin cerrar, revisión "completada" tras volver.

### T07 · P1 · Guardado y cambios pendientes (A6)
- **Precondición**: cliente 01, borrador válido sin guardar.
- **Pasos**: 1) Pulsar "Guardar borrador local". 2) Teclear `x` en Mensaje. 3) Borrarlo. 4) Teclear `x` otra vez y guardar. 5) Pulsar "Guardar borrador local" dos veces seguidas (doble clic).
- **Visible**: tras 1) indicación de guardado en memoria, sin sugerir envío; tras 2) "cambios pendientes"; tras 3) coherente con la política A6 (documentada); tras 5) un único mensaje de guardado y un solo cambio de estado.
- **Accesible**: `status` solo en guardado (no por cada tecla); el indicador "pendiente" es texto, no color; el botón no cambia a `disabled` mientras tiene foco (foco conservado).
- **Detecta**: anuncios por pulsación, pendientes que no desaparecen o aparecen sin cambio, doble anuncio por doble clic, pérdida del foco del botón.

### T08 · P0 · Invalidación de revisión por cada campo
- **Precondición**: cliente 01; borrador válido guardado; casilla "He revisado…" marcada y "Marcar revisión local" completada ("Revisión local completada; no se ha enviado nada").
- **Pasos** (repetir desde la precondición para cada uno; reiniciar entre medias): (a) cambiar un carácter del destinatario; (b) del asunto; (c) del mensaje; (d) si existe y es editable, un campo de "Ver campos" de Reunión o Documento; (e) si existe un interruptor de acción externa editable, alternarlo; (f) pulsar "Guardar borrador local" sin cambiar nada (control negativo).
- **Visible**: en (a)-(e): el resultado de revisión desaparece o se marca caducado con texto ("La revisión ya no es válida…"), la casilla queda desmarcada, "Marcar revisión local" deshabilitado/inoperante hasta guardar y volver a marcar. En (f): la revisión permanece válida.
- **Accesible**: invalidación anunciada **una vez** por episodio, no por tecla; el motivo de bloqueo está en texto adyacente enlazado por `aria-describedby`; `checked=false` en la casilla.
- **Detecta**: revisión que sobrevive a una edición en algún campo (R11), casilla marcada con botón activo, anuncio repetido, falso positivo en (f).

### T09 · P1 · Validez del contenido para revisar (A5)
- **Precondición**: cliente 01.
- **Pasos**: 1) Dejar Asunto vacío, guardar; intentar revisar. 2) Asunto `   ` (solo espacios). 3) Destinatario `a@b`. 4) Destinatario `a@example.invalid, b@example.invalid`. 5) Asunto con un salto de línea pegado. 6) Mensaje vacío. 7) Contenido válido.
- **Visible**: 1–6 no permiten completar la revisión y explican el motivo cerca del control y/o del campo; 7 sí; Guardar siempre permitido (o la excepción documentada).
- **Accesible**: `aria-invalid` y descripción en el campo culpable tras el intento, no mientras se teclea; mensaje de error por `alert` una vez; el foco va al primer campo inválido al intentar revisar.
- **Detecta**: revisión sobre contenido vacío, validación solo por color, error que roba foco al teclear, validación del navegador que impide mensajes propios.

### T28 · P2 · Enter en campos de una línea
- **Precondición**: cliente 01, borrador válido sin guardar, casilla marcada o no.
- **Pasos**: 1) Foco en Destinatario; pulsar Enter. 2) Foco en Asunto; Enter. 3) Foco en Mensaje; Enter.
- **Visible**: 1 y 2 no completan la revisión ni activan acciones externas; 3 inserta salto de línea. Cualquier efecto de 1/2 es solo guardar (documentado) y nunca recarga ni limpia.
- **Accesible**: el foco permanece en el campo; no hay mensaje de revisión.
- **Detecta**: envío implícito del formulario hacia el botón equivocado, recarga de página, pérdida del texto.

---

## C. Carga y error sin cruce de contexto

### T10 · P0 · Carga: texto, `aria-busy`, estado conservado
- **Precondición**: casos activos; cliente 01; borrador guardado; revisión completada.
- **Pasos**: 1) Activar escenario "Carga" en el selector de escenarios. 2) Intentar teclear en el editor, guardar y cambiar de cliente durante la carga. 3) Salir de "Carga" a normal.
- **Visible**: texto visible "Cargando…" (no solo animación); el editor indica que está bloqueado o se oculta; ningún dato de otro espacio aparece; al terminar, el cliente y el borrador siguen como estaban según A1.
- **Accesible**: `aria-busy="true"` en la región afectada (no en `body`); un único anuncio de progreso y uno de fin; el foco no queda en un elemento desmontado.
- **Detecta**: spinner mudo, `aria-busy` global, borrado de selección válida, anuncios repetidos, posibilidad de editar sobre contenido a medias.

### T11 · P0 · Error y respuesta tardía (R2)
- **Precondición**: casos activos; cliente 01 seleccionado; borrador pendiente.
- **Pasos**: 1) Activar "Error". 2) Observar. 3) Volver a normal. 4) Con "Carga" iniciada, cambiar rápidamente (≤300 ms) a "muestra", luego a vacío; esperar 5 s. 5) Repetir 4) alternando Carga→Error→muestra.
- **Visible**: "Error" no borra la selección válida ni muestra un borrador de otro contexto; el mensaje de error indica causa y acción de recuperación; tras 4) y 5) el estado final corresponde al último escenario elegido y no cambia por sí solo pasados 5 s.
- **Accesible**: el error usa `role="alert"` una sola vez; reintentar/volver no deja `aria-busy` colgado; ninguna región conserva el contenido del escenario previo.
- **Detecta**: temporizadores obsoletos que sobrescriben el estado, error mudo, `aria-busy` eterno, borrador cruzado.

---

## D. Ficha lateral (modal)

### T12 · P0 · Apertura, foco inicial, Tab y Shift+Tab
- **Precondición**: casos activos; Hoy; 1440 px.
- **Pasos**: 1) Tab hasta el control de la fila "Contacto de muestra 01" que abre contexto; Enter. 2) Sin tocar nada, pulsar Tab repetidamente hasta completar 2 vueltas. 3) Pulsar Shift+Tab desde el estado inicial del panel y repetir 2 vueltas hacia atrás. 4) Repetir a 390 px.
- **Visible**: el panel aparece con título (nombre, no ID), procedencia, campos, oportunidades, actividad y acciones; el foco visible está en el título; el siguiente Tab llega al botón de cerrar; el foco nunca aparece en cabecera/nav/Cola.
- **Accesible**: el lector anuncia el diálogo y su nombre al abrir (`role=dialog`/`<dialog>`, `aria-labelledby`); Tab cicla dentro del panel o sale al navegador pero jamás al fondo; Shift+Tab desde el título va al último control del panel.
- **Detecta**: foco que se queda en el disparador, fuga a fondo, `aria-modal` sin `inert`, título sin nombre, foco inicial en el último control.

### T13 · P0 · Cerrar: Escape, botón, velo, select abierto (cancelación)
- **Precondición**: panel abierto desde una fila; si hay `select` dentro del panel, usarlo.
- **Pasos**: 1) Pulsar Escape. 2) Reabrir; pulsar el botón "Cerrar". 3) Reabrir; pulsar sobre el velo (fuera del panel). 4) Reabrir; pulsar `mousedown` dentro de un texto del panel, arrastrar hasta el velo y soltar. 5) Si hay `<select>`: abrir su lista con Alt+Flecha abajo y pulsar Escape una vez; después Escape de nuevo. 6) Escribir texto en un campo del panel (p. ej. nueva acción interna) y pulsar Escape.
- **Visible**: 1–3 cierran y devuelven el foco al disparador (visible); 4 no cierra; 5) el primer Escape cierra solo la lista, el segundo cierra el panel; 6) comportamiento acorde a la decisión documentada (descarta o conserva), sin quedar a medias.
- **Accesible**: tras cerrar, el árbol de accesibilidad ya no contiene el diálogo; el foco se anuncia en el disparador; ningún `aria-hidden` o `inert` residual en el fondo.
- **Detecta**: Escape que cierra el panel con la lista abierta, cierre al arrastrar texto, panel oculto pero focalizable, fondo aún `inert` tras cerrar, múltiples rutas de cierre con comportamiento distinto.

### T14 · P0 · Foco si el disparador desaparece por filtro (R4)
- **Precondición**: casos activos; Hoy; filtro "Requieren revisión" activo; la tarea elegida es una cuyo estado la saca del filtro al completar su acción interna.
- **Pasos**: 1) Abrir la ficha de esa tarea con Enter. 2) Crear o completar la acción interna que cambia su pertenencia. 3) Cerrar con Escape. 4) Repetir cambiando el filtro desde otra vía permitida antes de cerrar (si es posible solo mediante navegación del navegador, indicarlo en el resultado).
- **Visible**: el foco visible cae en un destino documentado (encabezado/recuento de la lista) y no en `body`; un mensaje explica que la fila ya no está en el filtro; no hay salto de scroll al principio.
- **Accesible**: el destino se anuncia con contexto ("N resultados"/nombre de lista); `status` informa del motivo una vez; `document.activeElement` no es `body`.
- **Detecta**: `.focus()` sobre nodo desconectado, restauración por índice (foco en otra fila), foco perdido, doble apertura que recoge el nodo equivocado (R3).

### T15 · P1 · Fondo inerte, scroll y botón Atrás
- **Precondición**: ficha abierta en Comercial, página con scroll.
- **Pasos**: 1) Intentar con puntero hacer clic en la cola, la navegación, el selector de escenarios y el enlace de salto por detrás. 2) Intentar con teclado Tab y Shift+Tab y Enter. 3) Rueda del ratón / gesto táctil sobre el velo. 4) Pulsar Atrás del navegador (y Adelante). 5) Redimensionar de 1440 a 390 con el panel abierto.
- **Visible**: ningún control del fondo reacciona; el documento no se desplaza detrás; con Atrás el panel se cierra o ignora y la vista no cambia por detrás en un estado incoherente; tras redimensionar el panel sigue usable.
- **Accesible**: lector en modo exploración no llega al contenido del fondo (inert); el hash no incluye ids ni nombres; `document.title` no incluye el cliente.
- **Detecta**: `aria-hidden` sin `inert` (fondo tabulable), scroll del fondo, cambio de vista oculto tras Atrás, datos personales en URL/título.

### T16 · P0 · Doble clic y repetición de teclas en acciones internas (R5, R6)
- **Precondición**: ficha abierta con la actividad visible; contar acciones y fechas iniciales.
- **Pasos**: 1) En "crear acción interna" rellenar los datos mínimos y hacer doble clic rápido en el botón. 2) Repetir con Enter mantenido 1 s. 3) Tabular a "Completar" de una acción y hacer doble clic. 4) Enter mantenido en "Completar". 5) Cerrar y reabrir la ficha.
- **Visible**: exactamente una acción nueva y una completada; sin duplicados en ficha, Hoy ni Comercial; el texto "solo en memoria de este prototipo" visible, sin sugerir escritura en HubSpot; vencimiento y origen (tarea CRM / acción interna) distinguibles.
- **Accesible**: un `status` por acción real (dentro del panel, ver ACC §5.6); el foco tras crear/completar va a un destino estable (nueva fila o encabezado de la lista), no a `body`; el botón pulsado conserva el foco si sigue existiendo.
- **Detecta**: duplicados por doble clic o Enter repetido, botón `disabled` que roba el foco, mensaje fuera del modal sin leer, texto que sugiere persistencia externa.

### T17 · P1 · Causas de "Preparar seguimiento" deshabilitado (A9, A10)
- **Precondición**: casos activos con al menos: tarea de solo lectura, sin correo, origen desactualizado, y (si el prototipo la permite) operación en curso.
- **Pasos**: 1) Abrir la ficha de cada caso. 2) Tab hasta "Preparar seguimiento" en cada una. 3) Intentar activarlo con Enter y Espacio y con clic.
- **Visible**: texto visible junto al botón con la causa (todas si hay varias, A9), no solo `title`; el botón se ve como no disponible con contraste del texto normal; ninguna activación hace nada ni cambia de vista.
- **Accesible**: el botón es alcanzable con Tab (`aria-disabled`) o su motivo está en el flujo de lectura; `aria-describedby` apunta al motivo; el lector anuncia "no disponible" y la causa; si es `disabled` nativo, el motivo debe ser texto en la ficha.
- **Detecta**: causa solo en `title`, botón inalcanzable con motivo escondido, activación con efecto, causas solapadas que muestran solo la primera.

---

## E. Búsqueda, filtros y selección compacta

### T18 · P0 · Filtros y búsqueda en Hoy sin coincidencias (A7, A11)
- **Precondición**: casos activos; Hoy con la lista completa. Anotar antes, en una tabla rellenada por Codex, a qué filtro pertenece cada tarea de muestra (vencida, sin correo, solo lectura, sin oportunidad).
- **Pasos**: 1) Elegir cada filtro ("Todas", "Requieren revisión", "Sin próxima acción") con teclado y contar filas. 2) Escribir `zzzz` en la búsqueda. 3) Borrar con el control "Limpiar búsqueda". 4) Escribir `garcia`/`García`/`GARCIA` si hay nombres con tilde. 5) Cambiar a Comercial y volver.
- **Visible**: cada filtro muestra lo que dice la tabla; sin coincidencias: mensaje "Sin resultados para…" con el filtro y término actuales y acción de limpiar, distinto del vacío sin datos (T01); el recuento coincide con las filas; la búsqueda ignora mayúsculas y tildes (o lo documentado); el estado entre vistas se comporta como decida A7.
- **Accesible**: control de filtros en `fieldset/legend`, `radiogroup` o botones con `aria-pressed`, con nombre; el recuento/mensaje se anuncia **una vez** con retardo (no por tecla); el foco permanece en la búsqueda al teclear.
- **Detecta**: "sin resultados" idéntico a "sin datos", filtro con `role=tab` incompleto, recuento anunciado por cada letra, estado de filtro que contamina Comercial.

### T19 · P1 · Cola con búsqueda y cliente seleccionado oculto (R12)
- **Precondición**: casos activos; Comercial; cliente 03 seleccionado; 1440 px.
- **Pasos**: 1) Escribir en la búsqueda de la Cola un término que excluya al cliente 03 (p. ej. nombre de 01). 2) Observar Cola y Mesa. 3) Pulsar el control de quitar filtro. 4) Escribir un término por correo (`example.invalid`) y otro por empresa. 5) Tabular desde la búsqueda hasta el editor y contar pulsaciones con 100+ filas (si el prototipo lo permite) o anotar si existe enlace de salto.
- **Visible**: la Mesa mantiene a 03 y la Cola aclara "cliente seleccionado fuera del filtro"; no se selecciona otro cliente por accidente; búsqueda por nombre, empresa y correo funciona; existe acceso rápido (enlace/botón) a la Mesa sin atravesar toda la Cola.
- **Accesible**: la fila seleccionada oculta no deja un `aria-current` huérfano; el aviso es texto asociado a la lista; el enlace de salto tiene nombre claro.
- **Detecta**: selección silenciosamente descartada, Mesa con cliente sin explicación, búsqueda que solo cubre nombre, coste de Tab O(n).

### T20 · P0 · Select compacto sin trampa y cruce de 900 px (§5.5)
- **Precondición**: casos activos; ancho 768 px; cliente 01; borrador pendiente en Asunto.
- **Pasos**: 1) Tab hasta el select de clientes. 2) Con la lista cerrada, Flecha abajo 3 veces. 3) Abrir con Alt+Flecha abajo, elegir con Flecha y Enter; repetir y salir con Escape. 4) Tab y Shift+Tab fuera del select. 5) Con la búsqueda activa, filtrar hasta excluir al cliente elegido. 6) Con el foco en Asunto y texto parcial, redimensionar a 1024 y volver a 768 (y girar en un dispositivo, si procede).
- **Visible**: el foco visible permanece en el select tras cada flecha; no aparecen diálogos por cada flecha (A3); la selección y el borrador siguen la política; tras 5) el select no muestra otra persona sin que el estado lo haya cambiado; tras 6) se conservan campo, texto y selección.
- **Accesible**: el select tiene `label`; opciones con nombre y empresa distinguibles; el lector anuncia el valor actual tras cada cambio sin perder el foco; Tab/Shift+Tab salen sin quedar atrapados.
- **Detecta**: foco a `body` tras cada flecha (nodo re-renderizado), `preventDefault` en teclas del select, opción seleccionada que "salta", pérdida de foco/valores al cruzar 900 px.

---

## F. Seguridad de contenido, Archivos, Integraciones y efectos

### T21 · P0 · XSS y entradas hostiles en destinatario, asunto y mensaje
- **Precondición**: cliente 01, borrador vacío. Solo texto de prueba inofensivo.
- **Pasos**: pegar en Asunto: `<img src=x onerror=alert(1)>`; en Mensaje: `<script>alert(1)</script>`, `"><b>negrita</b>`, `javascript:alert(1)`, una línea de 5000 caracteres sin espacios y `‮` (marca bidireccional) seguido de texto; en Destinatario: `a@example.invalid?cc=x@example.invalid`. Guardar, revisar, ver vista previa, abrir la ficha, activar y desactivar escenarios y recorrer Hoy.
- **Visible**: el contenido aparece **como texto literal** en el editor, vista previa y resumen de revisión; sin ventanas, sin formato interpretado, sin enlaces clicables ni `mailto:`; la línea larga no genera scroll horizontal global y se rompe o se desplaza en su contenedor.
- **Accesible**: en el árbol de accesibilidad el texto aparece como texto (no como `img`/`strong`); `aria-label`/`title` no contienen etiquetas interpretadas; el destinatario con `?cc=` se rechaza o se muestra tal cual como no válido.
- **Detecta**: inyección HTML por `innerHTML` o plantillas con atributos, `mailto:` autogenerado, desbordamiento, suplantación visual por bidi.

### T22 · P1 · Archivos: vacío, sin coincidencias, sin autorización, cargando, error
- **Precondición**: casos activos; pestaña Archivos; cliente 01.
- **Pasos**: 1) Ver el estado por defecto (lista vacía). 2) Buscar un término sin resultados. 3) Activar sucesivamente "sin autorización", "cargando" y "error" (por escenario o control del prototipo). 4) Tabular por todos los controles de añadir/abrir documentos. 5) Volver a Seguimientos.
- **Visible**: cada estado tiene mensaje propio y distinto (vacío ≠ sin coincidencias ≠ sin autorización ≠ cargando ≠ error); añadir/abrir documentos remotos permanecen deshabilitados con motivo visible; el cliente seguido es el mismo al volver.
- **Accesible**: cargando con `aria-busy` y texto; error con `alert` una vez; los controles deshabilitados tienen motivo asociado; los estados no dependen de color/icono.
- **Detecta**: estados confundibles, botón remoto operativo, acciones sin motivo, selección distinta tras volver.

### T23 · P0 · Integraciones sin conexión real
- **Precondición**: vacío inicial y luego casos activos.
- **Pasos**: 1) Abrir Integraciones en vacío. 2) Activar casos y volver a Integraciones. 3) Recorrer con Tab cada fila, botón y enlace. 4) Activar cada control interactivo.
- **Visible**: cada proveedor/capacidad como fila (no mosaico de logos) con uno de Sin configurar / Configurada / Autorizada / Operación verificada, explicación y fecha **solo** si hay evidencia; en el prototipo el estado real es sin conexión; las tarjetas de ejemplo dicen "Ejemplo"; no hay botón de autorización ni enlace que abra terceros; hay texto sobre reconexión y lectura frente a edición.
- **Accesible**: el estado es texto; las filas de ejemplo tienen nombre accesible que incluye "Ejemplo"; fechas en `<time>`; ningún control navega fuera ni abre ventanas.
- **Detecta**: estado "Autorizada/Verificada" sin evidencia o sin marca de ejemplo, fechas inventadas, botones decorativos mudos, enlaces externos.

### T24 · P0 · Botones sin efectos externos y capacidades deshabilitadas
- **Precondición**: casos activos; cliente 01; borrador válido; abrir pestaña Red/Application del navegador y limpiar.
- **Pasos**: 1) Activar con teclado y puntero todo botón de Comercial y de la ficha: Correo, Reunión, Documento, Informe, "Ver campos", "Guardar borrador local", "Marcar revisión local", acciones internas. 2) Buscar botones llamados "Enviar" u otros que parezcan enviar.
- **Visible**: ninguno abre ventana, navega fuera, descarga o simula éxito de Gmail/creación de archivos; los deshabilitados explican el motivo; "Ver campos" muestra campos sin efecto externo; todo botón visible responde algo o está deshabilitado con razón; la revisión dice "no se ha enviado nada".
- **Accesible**: ningún botón activo se llama "Enviar" si no puede enviar; los deshabilitados informan de su estado y motivo; ningún `href` externo.
- **Detecta**: peticiones de red, almacenamiento, descargas, `mailto:`, éxito simulado, botones mudos, nombres engañosos.

---

## G. Anuncios, movimiento y móvil

### T25 · P1 · Mensajes `status`/`alert` sin repeticiones
- **Precondición**: casos activos; lector de pantalla activo; registro de anuncios anotado.
- **Pasos**: 1) Guardar, revisar, editar (invalida), guardar y revisar de nuevo (el mismo texto "Revisión local completada…" dos veces). 2) Pulsar Guardar 3 veces sin cambios. 3) Escribir 10 caracteres en la búsqueda de Hoy. 4) Cambiar escenario a Error y salir y volver a entrar. 5) Crear una acción en la ficha.
- **Visible**: mensajes visibles coherentes con lo anunciado, sin duplicado visible.
- **Accesible**: 1) el segundo "Revisión local completada…" **sí** se anuncia (nueva transición), 2) Guardar sin cambios no anuncia o anuncia "sin cambios" una vez, 3) un único recuento al terminar de escribir, 4) un `alert` por entrada a Error, 5) el mensaje se anuncia con la ficha abierta (región dentro del panel); ningún mensaje se lee dos veces por usar dos canales.
- **Detecta**: duplicados (R8), mensajes engullidos por texto idéntico, anuncios por tecla, mensajes fuera del modal inaudibles (R9).

### T26 · P1 · Reducción de movimiento
- **Precondición**: activar "reducir movimiento" del sistema (Windows: Efectos de animación desactivados) o emularlo en las herramientas del navegador; recargar.
- **Pasos**: 1) Abrir y cerrar la ficha varias veces. 2) Activar Carga. 3) Pulsar enlace de salto y cambiar de vista. 4) Seleccionar un cliente desplazado fuera de pantalla y observar el desplazamiento. 5) Repetir sin la preferencia como control.
- **Visible**: con la preferencia: sin deslizamientos/rebotes, sin spinner animado ni scroll suave; la ficha aparece y desaparece al instante; la carga se comunica con texto. Sin la preferencia: el movimiento es breve y opcional.
- **Accesible**: la ficha se cierra y el foco se restaura aunque no exista `transitionend`; el estado cargando sigue expuesto por texto/`aria-busy`.
- **Detecta**: panel que depende de `transitionend` y queda a medias, `scrollIntoView({behavior:'smooth'})` desde JS, animaciones infinitas.

### T27 · P1 · Teclado virtual y reflow a 320 px
- **Precondición**: casos activos; 390 y 320 px en dispositivo/emulación táctil; zoom del navegador a 100 %, luego texto a 200 %.
- **Pasos**: 1) Enfocar Asunto, luego Mensaje; teclear hasta que el teclado cubra la mitad inferior. 2) Pulsar Tab hasta "Guardar borrador local" y "Marcar revisión local". 3) Provocar un error de validación (T09) y comprobar que se ve. 4) Abrir la ficha; enfocar su campo; alcanzar "Cerrar". 5) Cambiar orientación. 6) Recorrer todo sin desplazamiento horizontal.
- **Visible**: el campo enfocado y su mensaje permanecen visibles; las barras fijas no tapan campo, botones ni mensaje; el panel de revisión sigue junto al contenido; sin desplazamiento horizontal global ni texto esencial recortado; objetivos ≥44 px.
- **Accesible**: el orden de Tab sigue el visual en una columna; el foco no se oculta bajo cabeceras/barras adhesivas; el zoom/reflow no pierde funciones; sin zoom automático en iOS al enfocar campos (tamaño ≥16 px).
- **Detecta**: botones inaccesibles bajo el teclado, foco oculto, zoom involuntario, desbordes, objetivos pequeños.

---

## Matriz de adaptación (ejecutar tras T01–T28)

Para cada ancho, comprobar la lista común y la fila específica. Anotar en cada celda: OK / fallo / no aplica + observación.

| Ancho | Layout esperado | Comprobaciones específicas |
|---|---|---|
| 1440 | Cola izquierda + Mesa ancha; ficha lateral | T02, T04, T12–T15, T19; longitud de línea del editor razonable; cola con scroll propio |
| 1024 | Dos columnas (sigue ≥900) | Cola no aplasta la Mesa; vista previa y revisión junto al editor; ficha no cubre más de lo necesario |
| 768 | Cola → selección compacta (<900); editor y contexto apilados | T20; paso 1024→768 conserva selección y borrador; revisión debajo del editor, no oculta |
| 390 | Una columna; ficha a ancho completo | T12, T27; cerrar visible; objetivos 44 px; tablas en contenedor propio con nombre |
| 320 | Una columna; texto esencial completo | T27; correos y asuntos largos; nav de 3 vistas accesible; "Prototipo… sin conexión" visible; zoom de texto 200 % |

Lista común por ancho: sin scroll horizontal global; orden de Tab = orden visual; foco visible en todo control; ningún texto esencial recortado; filas operativas 44–52 px; contenido útil sin hover; el aviso de prototipo visible en cabecera; el panel de revisión visible junto al editor sin tapar el teclado.

## Navegación con teclado (lista de verificación)

| Tecla | Contexto | Esperado |
|---|---|---|
| Tab / Shift+Tab | Página | Orden visual; salta ocultos; sin trampas; salto al contenido primero |
| Enter / Espacio | Botones y filas | Activa una sola vez; Espacio no desplaza la página sobre botones |
| Flechas | Select cerrado | Cambian valor sin perder foco ni abrir diálogos |
| Flechas, Inicio, Fin | `tablist` (si existe) | Mueven pestaña; Tab entra al panel de pestañas |
| Escape | Panel | Cierra (salvo lista de select abierta); devuelve foco |
| Escape | Búsqueda (fuera de modal) | Si limpia, lo documenta; no cierra paneles ni cambia vista |
| Enter | Campos de una línea | No completa revisión (T28) |
| Atrás/Adelante | Navegador | Solo cambia vista; con panel abierto lo cierra o ignora |
| Cualquier letra | Fuera de campos | Sin atajos de letra única (`brief L62`) |

## Pendientes concretos para Codex (QA sobre el prototipo final)

1. Fijar A1 (espacio vs escenario), A3 (cliente cambiado con borrador), A4, A5, A6, A7, A9–A13 de ACC y actualizar aserciones de T05–T11, T17–T20.
2. Entregar la tabla de pertenencia tarea de muestra → filtro (T18) y el literal final de cada botón.
3. Ejecutar T01–T28 y la matriz con lector de pantalla real, teclado físico y herramientas de accesibilidad del navegador; registrar resultados (no se ha ejecutado nada aquí).
4. Medir contraste, tamaños de objetivo, foco visible y modo de contraste forzado sobre el render real; este plan no los afirma.
5. Verificar en la pestaña de red/almacenamiento del navegador la ausencia de peticiones, cookies, `localStorage` y `mailto:` (T24).
6. Comprobar en un segundo navegador y en un dispositivo táctil real (T20, T26, T27).
7. Revisar que `index.html` final conserve `lang`, viewport y live regions precargadas; que `#pbw-panel-host` siga fuera de `#pbw-shell`; que no haya `h1` duplicado.

Resultado de este plan: ninguno. Estado: `Sin ejecutar`.
