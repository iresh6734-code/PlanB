# CLAUDE-UI-011 · Contrato de accesibilidad e interacciones (revisión estática)

Sesión: Claude 2 - Accesibilidad UI011. Fuentes leídas: `coordination/briefs/CLAUDE-UI-010.md` (cito `brief Lnn`) y `design/claude/workspace-v2/index.html` (cito `html Lnn`). No he leído `styles.css`, `app.js`, la app ni otros documentos, y no he ejecutado nada. **Este documento no afirma conformidad con WCAG ni resultados de uso real**; es un contrato y una lista de riesgos para revisar la implementación final.

Leyenda: **[OBS]** visible en el HTML actual · **[RIESGO]** depende de cómo se escriba JS/CSS · **[PEND]** no verificable hasta tener JS/CSS/render final · **[AMB]** el brief no decide.

El HTML es una entrega parcial: casi todo el contenido lo inyecta JS (`html L14, L17, L19, L25`). Por eso casi todo lo que importa aquí es [RIESGO] o [PEND]; no se atribuye ningún fallo a código que aún no existe.

---

## 1. Lo observable en `index.html`

| Línea | Elemento | Observación | Estado |
|---|---|---|---|
| 2, 5 | `lang="es"`, viewport sin `maximum-scale`/`user-scalable` | Idioma declarado; no se bloquea el zoom. | [OBS] correcto |
| 6 | `<title>` fijo | No cambia con la vista. En una SPA, cambiar de Hoy/Comercial/Integraciones sin actualizar el título deja el mismo nombre en historial y lector. El título nunca debe incluir cliente ni borrador (se vería en historial/marcadores; `brief L28`). | [RIESGO] |
| 11, 25 | `a#pbw-skip[href="#pbw-main"]` → `main#pbw-main[tabindex="-1"]` | Destino coherente y focalizable. Si el JS reemplaza el nodo `main` entero (no solo sus hijos) tras pulsar el enlace, el foco se pierde. Visibilidad al foco depende de CSS. | [OBS] estructura; [PEND] visibilidad |
| 14 | `section#pbw-proto[aria-label="Herramientas del prototipo"]` | Región con nombre, **antes** del `header` (L16) en el DOM. Cada vez que se recorre con Tab desde arriba, los controles de escenario preceden a la navegación. El enlace de salto lo mitiga. Si el CSS lo coloca visualmente abajo o lateral (`order`, grid), el orden de Tab y el visual divergen. | [OBS] posición; [PEND] CSS |
| 16 | `<header role="banner">` | `role` redundante pero inocuo (el `header` ya es banner al no estar dentro de `main`/sección). | [OBS] |
| 17 | `#pbw-header-content` vacío | Nombre de espacio, origen y fecha dependen de JS. No hay `h1` en ningún punto del HTML estático. | [PEND] |
| 18–19 | `nav[aria-label="Vistas principales"] > ul#pbw-nav-list` vacío | Nombre de landmark correcto. Falta decidir enlaces vs botones y `aria-current="page"` (ver A12). | [PEND] |
| 23 | `div#pbw-notices` sin rol, fuera de cualquier landmark | Lo que se inserte ahí (aviso de cambios sin guardar) **no se anuncia** por sí mismo y queda fuera de landmarks. Debe anunciarse por `#pbw-status/#pbw-alert` o llevar su propio rol, y no duplicarse. | [OBS] estructura; [RIESGO] contenido |
| 25–27 | `main` con `<noscript>` dentro | Aviso sin JS correcto. | [OBS] |
| 29–31 | `footer` con "Prototipo de interfaz · sin conexión a servicios" | El brief exige mostrarlo "siempre" (`brief L30`). En una página larga o a 320 px, un pie queda lejos de la vista. Debe repetirse en cabecera o barra de prototipo, no solo en el pie. | [OBS] ubicación; [RIESGO] |
| 34 | `div#pbw-panel-host[hidden]`, **hermano** de `#pbw-shell` (L13) | Buen aislamiento: se puede marcar `#pbw-shell` como `inert` sin afectar al panel. Riesgo clásico: una regla CSS `display:flex/grid` sobre `.pbw-panel-host` anula `[hidden]` y deja el contenedor visible/enfocable cuando no hay panel. | [OBS] estructura; [RIESGO] CSS |
| 36–37 | `#pbw-status` (`role=status`) y `#pbw-alert` (`role=alert`), vacíos, presentes desde la carga | Correcto que existan antes de recibir texto. Están **fuera** de `#pbw-shell` (siguen vivos con el shell `inert`) pero **fuera también del panel modal**: con un diálogo modal, muchos lectores ignoran regiones vivas ajenas al diálogo (ver §5.6). `aria-atomic=true` + texto idéntico consecutivo no se vuelve a anunciar. Clase `.pbw-sr` debe ocultar solo visualmente (no `display:none`/`visibility:hidden`). | [OBS] estructura; [RIESGO] |
| 39 | `<script src="app.js">` al final, sin `defer` | Suficiente. Con `file://` no hay problema de módulos. | [OBS] |

Landmarks observables: región (L14), banner (L16), navigation (L18), main (L25), contentinfo (L29). Contenido fuera de landmark: `#pbw-notices` (L23), `#pbw-panel-host` (L34, aceptable si contiene el diálogo con nombre).

---

## 2. Ownership de estado (propuesta)

Todo el estado vive en un único objeto en memoria. La vista es función del estado; los manejadores solo llaman a transiciones.

| Estado | Dueño | Lo lee | Lo limpia |
|---|---|---|---|
| `space` (conjunto de datos: vacío / muestra) | app | cabecera, Hoy, Comercial, Integraciones | nunca se "limpia"; al cambiar, resetea el resto |
| `status` (normal / carga / error / solo lectura / desactualizado) | app (herramienta de prototipo) | todas | no resetea selección ni borrador (ver A1) |
| `view` (hoy / comercial / integraciones) | app + URL (solo este valor) | nav, main | — |
| `commercialTab` (Seguimientos / Archivos) | Comercial | Comercial | cambio de espacio |
| `selectedCustomerId` | **un solo** campo app (`brief L38`) | cola, select compacto, Seguimientos, Archivos, cabecera de mesa | cambio de espacio; desaparición del cliente |
| `draft` {recipient, subject, body, fields de "Ver campos"} + `saved` snapshot | app, **asociado a un `customerId`** | editor, vista previa, revisión | cambio de espacio; política de A3 |
| `review` {checked, completed, forDraftVersion} | app | panel de revisión | **cualquier** cambio de `draft` ≠ `saved`, cambio de espacio |
| `filters` {hoyFilter, hoyQuery, queueQuery} | app (ver A7) | listas | — |
| `panel` {open, subject:{type,id}, triggerKey} | app | host del panel | cambio de espacio, hashchange (ver §5.4) |
| `internalActions` por cliente | app | ficha, Hoy | cambio de espacio |
| `announce` (cola de mensajes) | un único emisor | `#pbw-status`, `#pbw-alert` | — |

Regla: un nodo del DOM nunca es fuente de verdad. Referencias a nodos (disparador, campo activo) se guardan como **clave estable** (`data-pbw-key="task:ID"`, `"customer:ID"`, `"field:subject"`), nunca índice ni nodo, porque los re-renders los sustituyen (`brief L50`).

### Máquina del borrador

`sin borrador` → editar → `editando` (sin guardar) → Guardar → `guardado` → editar → `guardado con pendientes` (revisión invalidada) → Guardar → `guardado` → casilla + "Marcar revisión local" (requiere contenido válido, guardado y sin pendientes) → `revisado` → cualquier edición → `guardado con pendientes`.

Transiciones externas: cambio de espacio → `sin borrador` (+ aviso si había `editando`/`con pendientes`); cambio de cliente → A3; cambio de estado de prototipo (carga/error) → A1.

---

## 3. Flujos y puntos de ruptura

1. **Hoy → fila → ficha o preparación** (`brief L34`). Abrir ficha ≠ seleccionar cliente (A2). "Preparar" sí selecciona y cambia a Comercial; el foco va al encabezado de la vista o al campo Asunto, no al disparador (que está en otra vista).
2. **Comercial → cola/select → mesa**. Un clic o Enter en la cola fija `selectedCustomerId`. En <900 px lo fija un `<select>` (ver §5.5).
3. **Seguimientos ⇄ Archivos**: solo cambia `commercialTab`; la selección y el borrador no se tocan. Volver a Seguimientos muestra el mismo cliente y el mismo borrador.
4. **Editar → guardar → revisar**: ver máquina. Los mensajes "guardado" y "Revisión local completada; no se ha enviado nada" son `status`, una vez.
5. **Cambiar espacio**: limpia selección, borrador, revisión, ficha y acciones; aviso previo/posterior si había cambios sin guardar (A4).
6. **Escenarios** (carga/error/solo lectura/desactualizado): superposiciones sobre el espacio (A1).
7. **Ficha**: apertura desde cliente o tarea; acciones internas (crear/completar) actualizan memoria y listas de fondo; cierre restaura foco (§5.3).
8. **Integraciones**: solo lectura informativa; sin botón que abra un tercero.

---

## 4. Ambigüedades de contrato (con contraejemplo y propuesta)

**A1 · "Espacio" frente a "escenario".** `brief L28` dice que cambiar espacio limpia selección y borrador; `brief L60` ofrece un selector con vacío, carga, error, solo lectura, desactualizado y muestra, y pide que "Error no borra selección válida". Contraejemplo: con un borrador de Contacto 01 en edición, el evaluador pasa de "muestra" a "solo lectura" y de vuelta: ¿se perdió el borrador? Ambas respuestas son defendibles y rompen el test si no se fija.
*Propuesta*: dos ejes. Eje de datos (vacío ⇄ muestra) = cambio de espacio, limpia todo con aviso. Eje de estado (normal/carga/error/solo lectura/desactualizado) = superposición: no limpia selección ni borrador; solo lectura/desactualizado deshabilitan acciones con motivo; carga y error ocultan o bloquean el editor sin descartar el estado.

**A2 · Abrir ficha desde Hoy ¿cambia la selección?** Contraejemplo: borrador sucio para A en Comercial; en Hoy se abre la ficha de B "solo para ver". Si eso selecciona B, el borrador de A se descarta o, peor, se muestra bajo B.
*Propuesta*: abrir ficha no toca `selectedCustomerId`; solo "Preparar seguimiento" lo hace, aplicando A3.

**A3 · Cambio de cliente con borrador sin guardar.** El brief solo define el aviso para cambio de espacio. Opciones: (a) sustituir en silencio → pérdida; (b) mantener el borrador de A visible bajo B → contexto cruzado, **inaceptable**; (c) un borrador por cliente (mapa en memoria) → sin pérdida; (d) bloquear con confirmación.
*Propuesta*: (c); si se prefiere un único borrador, (d) con diálogo propio (no `window.confirm`, que no se puede probar bien) y con regla de que ningún texto de A aparece con el nombre de B ni un frame.

**A4 · Aviso por cambios sin guardar al cambiar espacio.** ¿Previo (confirmación) o posterior (aviso local, `brief L28`)? "Aviso local" sugiere posterior; entonces no hay forma de recuperar. Fijar y decir qué se pierde. Si es previo, el diálogo tiene su propio contrato de foco (§5.2). `#pbw-notices` (html L23) no es región viva.

**A5 · Validez y "guardado".** Sin definir: ¿correo en formato válido? ¿varios destinatarios? ¿asunto/mensaje solo espacios? ¿longitudes? ¿saltos de línea en el asunto? ¿Se puede guardar un borrador no válido? Contraejemplos: asunto `"   "`; destinatario `a@example.invalid, b@example.invalid`; destinatario `a@b` ; asunto con `\n`.
*Propuesta*: guardar siempre permitido; "Marcar revisión local" exige un único correo sintácticamente plausible, asunto y mensaje con texto tras `trim`, asunto sin saltos de línea; el motivo del bloqueo es texto visible junto al botón.

**A6 · Detección de cambio.** ¿Por evento `input` (bandera) o por comparación con el snapshot guardado? Contraejemplo: guardar, teclear `x`, borrar `x`. Por bandera queda "pendiente"; por comparación, limpio, pero la revisión ya invalidada **no** debe reaparecer.
*Propuesta*: pendiente = comparación con snapshot; revisión, una vez invalidada, solo vuelve a estar completa mediante la acción explícita.

**A7 · Búsqueda y filtros: ¿compartidos entre vistas?** Contraejemplo: escribir "ana" en la búsqueda de Hoy, ir a Comercial y encontrar el campo con "ana" aplicado a otra lista, o vacío con una lista filtrada. Y: cliente seleccionado que deja de coincidir con la búsqueda de la cola (mesa muestra B, cola dice "0 resultados"). *Propuesta*: estados separados por lista; la mesa conserva el cliente y la cola indica "Cliente seleccionado fuera de este filtro: [nombre]" con un botón "Quitar filtro".

**A8 · Acciones externas "apagadas" y capacidades deshabilitadas.** `brief L42` habla de "cambiar acciones obliga a revisar de nuevo", `brief L44` las deja deshabilitadas. Si ningún interruptor puede cambiar, la invalidación por "acciones" es inalcanzable; si "Ver campos" (reunión/documento) permite editar campos, esos campos sí invalidan. Fijar qué controles son alterables.

**A9 · "Sin correo" frente a destinatario editable.** `brief L40` permite correo editable en el borrador; `brief L52` deshabilita "Preparar seguimiento" por ausencia de correo. Contraejemplo: cliente sin correo → no se puede preparar, pero el editor admitiría escribir uno. Fijar si el correo de CRM ausente bloquea o solo avisa. Además, varias causas pueden coincidir (lectura + sin correo): mostrar **todas** como lista, no solo la primera, para que no parezca que añadir un correo basta.

**A10 · "Origen no activo" frente a "desactualizado" frente a "solo lectura".** Tres términos, un solo escenario de prueba cada uno en `brief L60`. Definir si desactualizado bloquea o avisa y si "no activo" es sinónimo.

**A11 · Criterio de "Requieren revisión" y "Sin próxima acción".** `brief L34` prohíbe inventar urgencia sin datos pero exige el filtro. Hoy lista tareas; "Sin próxima acción" ¿qué fila representa? Sin tabla de pertenencia (caso de muestra → filtro), la comprobación de filtros es subjetiva. Codex debe fijarla (ver tabla pendiente en el plan de pruebas, T18).

**A12 · Semántica de las pestañas y navegación.** "Seguimientos/Archivos" y Hoy/Comercial/Integraciones pueden ser: enlaces con hash (`#comercial`), botones con `aria-current`/`aria-pressed`, o `role=tablist`. Si es `tablist`, exige tabpanel asociado, flechas, Inicio/Fin y tabindex rodante; un `role=tab` a medias es peor que botones simples. *Propuesta*: nav principal = enlaces `<a href="#vista">` con `aria-current="page"`; Seguimientos/Archivos = `tablist` completo **o** dos botones con `aria-pressed` y paneles separados por `hidden` (decidir una). Navegar con Atrás/Adelante: ver §5.4. `aria-pressed` en filas de cliente es incorrecto (no es un conmutador): usar `aria-current="true"` en la fila seleccionada.

**A13 · Dónde está el `h1`.** Propuesta: un `h1` por vista dentro de `main` (nombre de la vista), foco programático (`tabindex=-1`) al cambiar de vista; el nombre del espacio en cabecera, texto no encabezado. Sin esto, el cambio de vista no tiene punto de foco ni anuncio.

---

## 5. Contrato de foco

### 5.1 Apertura de la ficha (modal)
1. Preferir `<dialog>` + `showModal()` (HTML nativo: bloquea el fondo, Escape, contenedor modal). Alternativa admisible: `div role="dialog" aria-modal="true"`, con `inert` en `#pbw-shell` (html L13). ARIA por sí solo no bloquea el fondo ni atrapa el foco.
2. Nombre: `aria-labelledby` apuntando al título de la ficha (nombre del cliente/tarea, no un ID crudo).
3. Foco inicial: el título (`h2` con `tabindex="-1"`). Con `showModal()` el navegador enfoca el primer elemento enfocable; debe sustituirse (`autofocus` sobre el título o `.focus()` explícito) para que el lector lea el título. La siguiente pulsación de Tab llega al botón "Cerrar" (primero en el orden del DOM tras el título; visible y ≥44 px también en 320 px).
4. Guardar la clave del disparador al abrir. Si `open()` se invoca otra vez con el panel abierto (doble clic), **ignorar**: no re-capturar `document.activeElement`, que ya está dentro del panel.

### 5.2 Tab, Shift+Tab, fondo
- Tab desde el último control del panel va al primero (cierre cíclico) o sale al cromo del navegador; **nunca** a un control del `#pbw-shell`. Shift+Tab desde el título enfocado va al último control del panel.
- `#pbw-shell` con `inert` (sin `aria-hidden` redundante) y bloqueo de scroll del documento sin desplazamiento de maquetación; el clic en el velo no activa nada de fondo.
- Si el diálogo contiene un modal secundario (confirmación A4), solo uno abierto a la vez; no apilar.

### 5.3 Escape, cierre y restauración
- Escape cierra, salvo: (a) lista de `<select>` desplegada → cierra solo la lista; el `keydown` no debe cerrar también el panel; (b) composición IME (`event.isComposing`).
- Todas las vías de cierre (botón, Escape/`cancel` nativo, clic en velo) pasan por **una sola** función `closePanel()`. Clic en velo: cerrar solo si `pointerdown` y `click` empezaron en el velo (evita cerrar al arrastrar una selección de texto).
- Restauración: (1) buscar por clave estable `data-pbw-key` el disparador original; si existe, `.focus()`. (2) Si desapareció (la fila ya no cumple el filtro, la tarea se completó en la ficha, re-render que sustituyó el nodo), enfocar el **encabezado de la lista** con `tabindex=-1` ("N resultados") y anunciar por `status` que la fila ya no está en el filtro. (3) Último recurso: el `h1` de la vista. Prohibido: foco por índice, `.focus()` sobre un nodo desconectado (falla en silencio y el foco queda en `body`), o dejar el foco en el nodo del panel ya oculto.
- Excepción: si el cierre ocurre por una acción que navega (Preparar seguimiento → Comercial), el foco va al `h1` de destino o al campo Asunto, no al disparador.
- Si el panel se cierra porque cambia el espacio (A1) o por `hashchange`, el foco va al `h1` de la vista vigente.
- No esperar `transitionend`/`animationend` para ocultar o restaurar: con `prefers-reduced-motion` el evento no llega y el panel queda abierto/foco perdido.

### 5.4 Vistas y historial
- Al cambiar de vista: actualizar `document.title` (solo nombre de vista y de producto), mover foco al `h1` de la vista (`tabindex=-1`), sin anuncio extra si el `h1` ya se lee.
- `hashchange`/Atrás con el panel abierto: cerrar el panel (restauración 5.3 punto "hashchange") o ignorarlo y restaurar el hash; no cambiar la vista tras un fondo `inert`.
- Hash admitido: solo la vista. Ni cliente, ni correo, ni texto.

### 5.5 Selects y selección compacta (<900 px)
- `change` en un `<select>` cerrado se dispara con cada flecha en algunos navegadores. Cambiar `selectedCustomerId` en cada flecha, con un borrador sucio, abriría una confirmación por flecha o descartaría borradores. Contrato: el cambio de cliente por `select` aplica A3 sin diálogos bloqueantes; si requiere confirmar, el `select` vuelve a su valor previo y conserva el foco.
- **Ninguna** acción sobre `select` puede: re-renderizar (sustituir) el propio `select`, llamar a `blur()`, mover el foco, ni hacer `preventDefault` sobre Tab/Escape/Enter/flechas. Es la causa típica de "trampa en select" (el foco vuelve a `body` tras cada flecha).
- Si una búsqueda filtra las opciones y elimina la seleccionada, el navegador muestra otra opción: la UI mostraría el cliente X y el estado diría Y. Mantener la opción seleccionada presente, o mostrar un `option` deshabilitado con el nombre actual.
- Cruzar 900 px al girar/redimensionar (cola ⇄ select) no pierde selección, borrador, valor de campos ni el foco (mismo campo por clave estable, mismo cursor si el nodo se conserva).
- Opciones del `select` con nombre + empresa (+ correo si hay homónimos); sin ID crudo.

### 5.6 Mensajes vivos
- Un emisor y un canal por mensaje: `#pbw-status` para éxito/progreso, `#pbw-alert` solo fallos. No duplicar con una región `role=status` local para el mismo mensaje.
- Mientras el panel modal esté abierto, `#pbw-status` queda fuera del diálogo: usar una región `role=status` **dentro** del panel para sus mensajes (acción creada/completada) y devolver los demás al emisor global al cerrar.
- Mensajes idénticos consecutivos: vaciar la región y escribir en el siguiente ciclo, o variar el texto, para que se anuncien de nuevo cuando proceda; **no** anunciar por pulsación de tecla (invalidación de revisión: una vez por transición `revisado → pendiente`; recuento de resultados de búsqueda con retardo).
- `aria-busy="true"` en la región que se carga (no en `main` completo ni en `body`); texto "Cargando…" visible; al terminar, `aria-busy` se retira y se anuncia el resultado una sola vez.
- No poner `aria-live` en contenedores grandes que se re-renderizan (relee todo).

---

## 6. Nombres, etiquetas, estructura

- Campos del editor (destinatario, asunto, mensaje) y búsquedas: `<label for>` visible; nunca solo `placeholder` ni `aria-label` sin texto visible. `type="email"` para destinatario solo si la validación del navegador no sustituye a la propia (usar `novalidate` y mensajes propios con `aria-describedby`/`aria-invalid` tras intentar revisar, no al teclear).
- Casilla "He revisado…": `<input type="checkbox">` con `<label>` completo (la elipsis del brief no puede quedar literal). Debe quedar desmarcada y deshabilitada/inoperante cuando la revisión se invalida, y el cambio anunciado una vez.
- Botones de icono: nombre accesible textual (`aria-label` con la acción y el objeto), objetivo ≥44 px. `title` no sustituye a texto visible (no accesible por teclado/tacto).
- Controles deshabilitados por falta de conexión (Correo, Reunión, Documento, Informe) y "Preparar seguimiento": el motivo debe ser **texto visible adyacente** enlazado con `aria-describedby`. Un botón `disabled` no recibe foco: el usuario de teclado no llega a él y solo ve el motivo si el texto está en el flujo de lectura. Preferir `aria-disabled="true"` (enfocable, el manejador ignora la acción) para los que hay que descubrir; el contraste del texto del motivo es normal, no atenuado.
- Estado de integración (Sin configurar / Configurada / Autorizada / Operación verificada): texto, no color; en filas de ejemplo el nombre accesible empieza por "Ejemplo:" (`brief L56`). Fechas con `<time datetime>` y solo con evidencia.
- Listas: filas de cliente/tarea como lista (`ul`/`li`) con un único control principal por fila (botón con nombre + empresa); acciones secundarias dentro de la fila como botones con nombre que incluya el cliente ("Abrir ficha de Contacto de muestra 01"), no "Abrir" repetido 200 veces.
- Cola con cientos de filas: Tab recorre cada una. Añadir enlace "Saltar al editor" / "Saltar a la mesa" antes de la cola, y recuento y límite de resultados (o paginación). Sin eso, llegar al editor desde la cola cuesta O(n) pulsaciones.
- Tablas (Archivos/Integraciones): contenedor desplazable con `role="region"`, `aria-label` y `tabindex="0"` (para que el teclado pueda desplazar); cabeceras `th scope`.
- Email, asunto y mensaje del usuario: solo `textContent`; sin `mailto:` generado (es una acción externa clicable, `brief L66`); nada de plantillas con `title="${valor}"`/`aria-label` construidas por cadena. Mostrar el texto con `white-space: pre-wrap` y `overflow-wrap: anywhere`. Considerar `<bdi>`/`dir="auto"` para correos con caracteres bidireccionales.
- Formulario del editor: Enter en asunto/destinatario no debe disparar "Marcar revisión local" ni ningún efecto distinto de guardar; si hay `<form>`, el botón por defecto debe ser "Guardar borrador local" o bien se impide el envío implícito.
- Estados esenciales no solo por color: "pendiente de guardar", "revisión caducada", "solo lectura", "desactualizado", "error" con texto.

---

## 7. Adaptación y 320 px (riesgos para revisar con el CSS final)

- Contenido esencial a 320 px: nombre de espacio, etiqueta de origen, fecha, "Prototipo de interfaz · sin conexión a servicios", navegación de 3 vistas, cliente elegido, editor, motivo de bloqueos y revisión. No debe depender de hover ni del pie.
- Cadenas sin espacios (correo largo, asunto pegado) desbordan: `overflow-wrap:anywhere` en filas, chips, vista previa y cabecera.
- Sin scroll horizontal del documento; el único permitido está en tablas con nombre (§6).
- Entradas de texto con cuerpo de 14–15 px (`brief L24`) en iOS Safari provocan zoom automático al enfocar; los campos deben usar ≥16 px o el zoom desplaza la maquetación. [PEND]
- Barras fijas/adhesivas (guardar/revisar, cierre del panel) pueden quedar tapadas por el teclado virtual o tapar el campo enfocado. Preferir posición en flujo; si hay barra adhesiva, `scroll-padding`/`scroll-margin` suficientes para que el campo enfocado y su mensaje de error queden visibles. Altura del panel con `dvh`, no solo `vh`. [PEND]
- Cualquier `order`, `grid-area` o `flex-direction: *-reverse` que cambie el orden visual respecto al DOM debe verificarse con Tab. [PEND]
- Anillo de foco visible con el token de foco, nunca `outline:none` sin sustituto; que sobreviva en `forced-colors`. [PEND]
- `prefers-reduced-motion`: sin transición de panel, sin `scroll-behavior:smooth`, sin spinner animado; los `scrollIntoView({behavior:'smooth'})` en JS no respetan la media query de CSS salvo que se compruebe con `matchMedia`. [RIESGO]
- Zoom del 200 % y 400 % del texto en 1280 px equivale a 640 y 320 px CSS: se debe reproducir sin pérdida de contenido ni funcionalidad.

---

## 8. Riesgos de implementación con contraejemplo

| # | Riesgo | Contraejemplo concreto |
|---|---|---|
| R1 | **Re-render completo** al cambiar estado | Teclear en Asunto; un cambio de estado reconstruye `main`; el foco vuelve a `body`, se pierde el cursor y una composición IME en curso. |
| R2 | Respuesta tardía de carga/error (temporizadores) | Elegir "Carga" (resuelve en 1,5 s), pasar a "muestra" a 0,5 s; a 1,5 s aparece "Error" o la lista del escenario anterior. Necesita token/época de solicitud descartando resultados obsoletos. |
| R3 | `activeElement` capturado dos veces | Doble clic en una fila: la segunda captura el elemento ya dentro del panel; al cerrar, el "disparador" es un nodo desmontado. |
| R4 | Disparador desaparece por filtro | Filtro "Requieren revisión"; abrir ficha de la tarea 3; completar su acción interna; la fila deja de coincidir; al cerrar no existe a quién devolver el foco. |
| R5 | `disabled` en el botón pulsado | "Crear acción interna" se deshabilita durante la operación: el foco se pierde en lectores y teclado. Usar guardas de estado (idempotencia) y `aria-disabled`. |
| R6 | Tecla Enter mantenida | Enter repetido sobre "Completar" genera clics repetidos aunque el foco no se mueva; un temporizador antirrebote no evita duplicados de forma fiable. |
| R7 | Tabs ARIA incompletos | `role=tab` sin flechas/Inicio/Fin ni `tabpanel`; el lector promete un patrón que no existe. |
| R8 | Mensajes duplicados | Un `role=status` local en el editor y el global anuncian ambos "Borrador guardado". |
| R9 | `status` global dentro de modal | Se crea una acción en la ficha; el texto va a `#pbw-status` (fuera del diálogo) y algunos lectores no lo leen. |
| R10 | `display` sobre `[hidden]` | `.pbw-panel-host{display:grid}` deja el host visible/enfocable en carga. |
| R11 | Casilla marcada tras invalidar | Revisión caducada pero la casilla sigue marcada y "Marcar revisión local" activo. |
| R12 | Filtro y selección | El cliente seleccionado desaparece de la cola filtrada; la mesa sigue mostrándolo sin explicación, o el `select` salta a otra opción. |
| R13 | Título/URL con datos personales | `document.title = nombre de cliente` o `#cliente=abc`. |

---

## 9. Pendiente contra el JS/CSS final (para QA de Codex)

1. Presencia de un `h1` por vista y orden de encabezados; ubicación del control de escenarios y su orden de Tab vs. orden visual (html L14).
2. Que el panel use `<dialog>`+`showModal()` o `role=dialog aria-modal` + `inert` en `#pbw-shell`; foco inicial; Tab/Shift+Tab cíclico; Escape; clave estable de restauración (§5).
3. Que el CSS no anule `[hidden]` en `#pbw-panel-host` (html L34) ni oculte `.pbw-sr` con `display:none`.
4. Cómo resuelve A1, A3, A5, A7 y A9; tabla de pertenencia de A11.
5. Si `select` compacto conserva su nodo y su foco al cambiar (§5.5).
6. Mecanismo de anuncios (§5.6): canales, duplicados, región dentro del modal, aria-busy.
7. Mapa de contraste, tamaños de objetivo (≥44 px), foco visible y `forced-colors` **medidos** sobre el render final (no inferibles del código).
8. Comportamiento a 1440/1024/768/390/320 con el teclado virtual y orientación (`test-plan` §Matriz).
9. Ausencia de peticiones de red, `mailto:`, descargas y almacenamiento (`brief L66`), comprobada con herramientas del navegador.
10. Textos finales de botones y estados: los casos de prueba usan los literales del brief; ajustar donde difieran.

Estado de este documento: contrato y análisis estático. Sin ejecución. Sin afirmación de cumplimiento.
