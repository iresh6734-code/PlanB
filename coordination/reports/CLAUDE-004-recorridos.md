# CLAUDE-004 · Recorridos y recuperación de la interfaz

29/10/2026, Europe/Madrid. Autor: Claude (Sonnet 5.5). Estado: entregado para revisión de Codex.

## Alcance, método y límites

Revisión **estática** de los recorridos *preparar → editar → revisar → aprobar → ejecutar* una propuesta, *abrir ficha → documentos*, *revisar un análisis del agente* y *importar Sheets*. Archivos leídos: `src/CommercialWorkspace.tsx`, `CommercialEditor.tsx`, `CustomerDossier.tsx`, `CustomerFiles.tsx`, `TeamAgentWorkspace.tsx`, `TeamContacts.tsx`, `HubspotContext.tsx`, `TeamApp.tsx`, `components.tsx` (Modal), `shared/commercial.ts`, los CSS de esos componentes y, para contrastar dos suposiciones, `server/team/commercial.ts`, `customers.ts` y `jobs.ts`. También `coordination/plans/CLAUDE-COLABORACION.md`.

No he abierto navegador, cuentas, bases, credenciales ni servicios, no he llamado a modelos ni a HubSpot/Google, y no he editado la app. **Nada de lo que sigue es una observación de navegador.** Distingo:

- **Observado en código (O):** se deduce de forma directa de las líneas citadas.
- **Hipótesis (H):** depende de un comportamiento de navegador, datos o entorno que no he comprobado.

Ejecuciones reales de esta sesión (no son pruebas de interfaz): `node --test tests/workspace-v2-state.test.mjs` → 98 pruebas, 89 correctas y 9 `todo` (las contradicciones documentadas en `CLAUDE-QA-013`, que fallan como se esperaba), 0 errores. `npm test` → 491/491 correctas en 88 s. `tsc --noEmit` sin errores. Ninguna de las dos baterías toca estos componentes con ReactDOM; el arnés `tests/hubspot-context-ui.test.ts` cubre solo `HubspotContext`.

## Capacidades ya cubiertas (no tocar)

- Cambio de empresa: `TeamApp.tsx:79-83` pone `key={spaceId}` a Comercial, Agente y Contactos, así que el estado local no cruza empresas. `CustomerFiles` se remonta por `tenant:contact` (`CommercialWorkspace.tsx:51`).
- `HubspotContext.tsx:5-8`: contador de revisión que descarta respuestas atrasadas al cambiar empresa o contacto (UX-003).
- Ficha: `CustomerDossier.tsx:14-19` explica las cuatro causas por las que no se puede preparar, con `aria-describedby`; `:12,:22` usa un identificador de operación estable que se reutiliza en reintentos (server `customers.ts:43` devuelve 409 si el mismo id cambia de contenido).
- Editar el borrador invalida la revisión (`CommercialWorkspace.tsx:30`) y el servidor ata la aprobación a `content_hash` (`:46`).
- Destinatario de piloto bloqueado en cliente (`CommercialEditor.tsx:20`) y enlaces de evidencia restringidos a dominios Google (`CommercialWorkspace.tsx:47`).
- El borrador más reciente va primero: `commercial.ts:25` ordena por `created_at DESC`.

## Resumen priorizado

| ID | Tipo | Prioridad | Recorrido | Resumen |
| --- | --- | --- | --- | --- |
| R-01 | O | Alta | Editar | Los cambios sin guardar se pierden sin aviso al cambiar de sección, empresa, bloquear el piloto o caducar la sesión |
| R-02 | O | Alta | Editar | Cualquier acción recarga todo y pisa ediciones de otras propuestas; `dirty` queda desincronizado |
| R-03 | O | Alta | Aprobar → ejecutar | Tras aprobar, la casilla de revisión sigue marcada y el mismo botón pasa a «Ejecutar» ya habilitado |
| R-04 | O | Media | Ejecutar | «Ejecutar» sigue habilitado con Google desconectado |
| R-05 | O | Media | Preparar / analizar | Sin clave de idempotencia: reintentos duplican borradores y análisis (cuota/coste) |
| R-06 | O | Media | Carga inicial | Spinner perpetuo, error sin reintento o error que nunca se limpia |
| R-07 | O | Media | Revisión | Botones primarios deshabilitados sin explicar el motivo |
| R-08 | O | Media | Teclado | El foco se pierde al deshabilitar o desmontar el control pulsado; resultados fuera de vista sin aviso |
| R-09 | O | Media | Agente → Comercial | Se abre la propuesta equivocada (id obsoleto) o ninguna en concreto |
| R-10 | O | Media | Ficha | Escape o clic fuera cierran la ficha con texto sin guardar |
| R-11 | O | Media | Conectar Google | El enlace de autorización queda obsoleto si se cambia la cuenta o el consentimiento |
| R-12 | O/H | Media | Localizar cliente | Sin búsqueda ni paginación en Contactos; selector sin datos para distinguir homónimos |
| R-13 | O | Media | Tras acción | Un fallo de recarga se presenta como fallo de la acción ya realizada |
| R-14 | O | Baja | Lectores | Textos contradictorios o ausentes para «solo lectura» |
| R-15 | O | Baja | Teclado/AT | Patrón ARIA de pestañas incompleto |
| R-16 | H | Baja | Agente | Ejecución larga sin progreso ni cancelación; análisis «En curso» sin refresco |
| R-17 | H | Baja | Móvil | `pre` del contexto documental sin ajuste de línea; objetivos de 42 px |
| R-18 | H | Baja | Ficha | Zona horaria fija en la ficha frente a hora local en formularios |
| R-19 | O/H | Baja | Varios | Menores (ver final) |

Orden sugerido de corrección: R-02 → R-01 → R-03/R-04 → R-05 → R-06 → R-09 → R-13 → resto. R-02 y R-01 comparten causa (estado del borrador en el componente) y conviene resolverlos juntos.

---

## Hallazgos

### R-01 · Ediciones sin guardar desaparecen sin aviso (O, Alta)

**Pasos.** (1) En Comercial, editar el asunto de un borrador sin guardar. (2) Pulsar «Contactos» en la barra lateral y volver. O cambiar «Empresa activa». O pulsar «Bloquear piloto». O dejar caducar la sesión y que cualquier llamada devuelva 401.

**Evidencia.** `dirty` y el contenido editado viven en el estado de `CommercialWorkspace` (`CommercialWorkspace.tsx:22,30`). `TeamApp.tsx:80` solo monta el componente cuando `tab==='commercial'`; al cambiar de sección se desmonta. `:74` (cambio de empresa) cambia `key`. `:68` (`leave`) y `:40` (401 en piloto: `setReady(false)`) desmontan toda la aplicación. No hay `beforeunload` ni confirmación: la búsqueda de `beforeunload`, `window.confirm` y `confirm(` en todo `src/` no devuelve ninguna coincidencia.

**Consecuencia.** Se pierde el trabajo de redacción sin saber que no estaba guardado; el aviso «Guarda los cambios antes de aprobar» (`CommercialEditor.tsx:16`) solo aparece dentro del propio componente. La redacción del seguimiento es el trabajo central del producto.

**Cambio.**
- Elevar `dirty` a `TeamApp` (o a un contexto) y, si no está vacío, pedir confirmación en `setTab`, en el selector «Empresa activa» (`TeamApp.tsx:74`) y en `leave` (`:68`). Texto: «Hay cambios sin guardar en N borradores. Guárdalos o descártalos».
- Añadir un `beforeunload` solo mientras `dirty.length>0`.
- Para el 401 del piloto, conservar los borradores en memoria hasta que se desbloquee, o avisar antes de bloquear. El prototipo `design/claude/workspace-v2` ya modela este caso (`reduce` con aviso de descarte, cubierto por QA-013); portar esa regla.

**Prueba de aceptación.** Con un borrador editado y sin guardar: cambiar de sección, empresa y pulsar «Bloquear piloto» muestran la confirmación; «Cancelar» conserva texto, pestaña y empresa; «Descartar» continúa. Sin cambios pendientes no aparece nada. Con 401 simulado la pantalla de desbloqueo no destruye el borrador.
**Codex en navegador:** repetir los cuatro pasos, comprobar el diálogo con teclado y que no se pida confirmación sin cambios.

### R-02 · Cada acción recarga y pisa las ediciones de otras propuestas (O, Alta)

**Pasos.** (1) Abrir dos propuestas. (2) Editar el cuerpo de la B sin guardar. (3) Guardar la A, o pulsar «Preparar seguimiento» para otro cliente.

**Evidencia.** `run` hace `await load()` (`CommercialWorkspace.tsx:27`) y `load` ejecuta `setData(await call(...))` (`:25`), que reemplaza todas las propuestas por la versión del servidor. `dirty` no se toca (`:31` solo quita el id guardado). Resultado: el texto de B vuelve al guardado, pero B sigue marcada como «sucia».

**Consecuencia.** El usuario pierde la edición sin enterarse, o ve «Guarda los cambios antes de aprobar» sobre un texto que no cambió. Con `reviewed` ya marcada para otra propuesta, `setReview('')` en `save` también la limpia sin avisar.

**Cambio.** Mantener las ediciones locales como mapa `{[id]:Partial<CommercialContent>}` separado de los datos del servidor y derivar el contenido mostrado de ambos; `load` solo reemplaza la parte del servidor y descarta las ediciones de una propuesta cuando su `revision`/`content_hash` cambió con aviso. Alternativa mínima: tras `load`, reaplicar las ediciones de los ids en `dirty`.

**Prueba.** Con A y B abiertas, editar B, guardar A: el texto de B persiste y B sigue «sucia». Preparar otro seguimiento tampoco altera B. Si el servidor trae otra revisión de B, se avisa y se ofrece conservar o descartar.
**Codex en navegador:** el mismo recorrido; contar que `dirty` coincide con lo visible.

### R-03 · Tras aprobar, «Ejecutar» queda habilitado con la revisión anterior (O, Alta)

**Pasos.** (1) Marcar «He revisado…». (2) Pulsar «Aprobar seguimiento».

**Evidencia.** `onApprove` no limpia `review` (`CommercialWorkspace.tsx:46`; `review` solo se vacía en `change` y `save`). Al volver `status:'approved'`, `CommercialEditor.tsx:21` muestra en el mismo lugar «Ejecutar acciones aprobadas» con `reviewed=true`, es decir, habilitado sin otra interacción. Ejecutar envía Gmail/Calendar/Docs/Sheets reales.

**Consecuencia.** Un doble clic lento, una pulsación repetida con retardo o una tecla Intro sobre el botón recién cambiado ejecutan la acción externa sin una decisión nueva. Es el mayor riesgo de interacción del producto: aprobar y enviar quedan a un clic del mismo gesto.

**Cambio (refuerza la revisión, no la elimina).** En `onApprove` llamar `setReview('')`; en estado `approved` mostrar una casilla propia («Confirmo que quiero ejecutar estas acciones externas ahora») y un resumen de los efectos activos; mover el foco al encabezado del bloque tras aprobar para que una pulsación repetida no caiga en «Ejecutar». No retirar la aprobación ligada a `content_hash`.

**Prueba.** Aprobar y comprobar que «Ejecutar» está deshabilitado hasta marcar la casilla nueva; pulsar dos veces «Aprobar» nunca dispara una ejecución; con teclado, tras aprobar el foco no está en «Ejecutar».
**Codex en navegador:** interceptar red (sin llamadas reales) y verificar que no hay `POST …/execute` antes de la segunda confirmación.

### R-04 · «Ejecutar» sigue habilitado con Google desconectado (O, Media)

**Pasos.** Aprobar una propuesta, pulsar «Desconectar Google» (`CommercialWorkspace.tsx:36`), volver a la propuesta.

**Evidencia.** El botón se deshabilita solo por `disabled||dirty||!reviewed||blockedRecipient` (`CommercialEditor.tsx:21`); no mira `data.connection`. El resto de la pantalla muestra «Conecta una cuenta…» (`CommercialWorkspace.tsx:35`).

**Consecuencia.** El usuario pulsa, espera y recibe un error del servidor; sin pistas de que debe reconectar.

**Cambio.** Pasar `connected={!!data.connection||data.demo}` al editor, deshabilitar «Ejecutar» y mostrar «Google no está conectado. Reconecta la cuenta para ejecutar» con enlace a «Configurar conexión» (abre el `<details>` de `:36`).

**Prueba.** Con `connection:null` y `demo:false`: «Ejecutar» deshabilitado con motivo accesible; con conexión, habilitado.

### R-05 · Sin clave de idempotencia en preparar y analizar (O, Media)

**Evidencia.** «Preparar seguimiento» llama a `POST …/proposals` solo con `{contactId}` (`CommercialWorkspace.tsx:42`); el servidor usa un `randomUUID()` nuevo salvo cuando el borrador viene del agente (`commercial.ts:49`, `id=agent?.id??randomUUID()`, con `ON CONFLICT DO NOTHING`): la ruta idempotente existe en el servidor, pero este formulario no envía id. Los análisis generan `crypto.randomUUID()` en cada clic (`TeamAgentWorkspace.tsx:20,21`). Los trabajos usan `dedupeKey` nuevo por clic (`TeamApp.tsx:84,88`). `busy` evita la doble pulsación inmediata, pero no un reintento tras una respuesta perdida.

**Consecuencia.** Dos borradores idénticos para el mismo cliente, o un análisis duplicado que consume el límite mensual de Copilot/Ollama. A diferencia de la ficha (`CustomerDossier.tsx:12,22`), no se reutiliza id en el reintento.

**Cambio.** Generar el id al abrir la preparación/revisión (como `operation` en la ficha) y reutilizarlo hasta el éxito; el servidor debe tratar el mismo id como idempotente. Avisar si ya existe un borrador abierto para ese cliente («Ya tienes un seguimiento por revisar para X. Abrirlo / Preparar otro»).

**Prueba.** Simular fallo de red tras el POST y reintentar: una sola propuesta/análisis. Preparar dos veces para el mismo cliente muestra el aviso.

### R-06 · Carga inicial: spinner perpetuo, sin reintento, error que no se limpia (O, Media)

**Evidencia.**
- `CommercialWorkspace.tsx:33`: si falla la primera carga se muestra `Spinner` y el error a la vez; nada permite reintentar.
- `CustomerDossier.tsx:26-27`: igual (error + «Leyendo los datos guardados…»), y el botón «Actualizar» solo existe con datos (`:46`).
- `CustomerFiles.tsx:13,23-24`: tras el error no hay datos y tampoco botón.
- `TeamContacts.tsx:12-13`: `setError` nunca vuelve a `''`; tras un fallo transitorio la tabla desaparece aunque la siguiente carga (`records` cambia) tenga éxito, y el único mensaje es un `alert`.
- `TeamAgentWorkspace.tsx:13`: error sin reintento.

**Consecuencia.** Callejón sin salida; hay que recargar la página (y perder borradores, R-01).

**Cambio.** Componente común `LoadError({message,onRetry})` con botón «Reintentar», sin spinner cuando hay error; en `TeamContacts` limpiar `error` al iniciar cada carga. Usar `role="alert"` una vez, no repetido.

**Prueba.** Forzar un 500 en la primera carga de cada vista: aparece el mensaje y «Reintentar»; tras un reintento correcto desaparece el error y se ve el contenido.

### R-07 · Controles primarios deshabilitados sin motivo (O, Media)

**Evidencia.** La ficha ya lo resuelve (`CustomerDossier.tsx:14-19,32`); es el único uso de `aria-describedby` en todo `src/` (búsqueda hecha). No así: «Aprobar/Ejecutar» (`CommercialEditor.tsx:21`; tres causas: `dirty`, `!reviewed`, `blockedRecipient`; solo `dirty` tiene texto y está en otra columna), «Preparar seguimiento» (`CommercialWorkspace.tsx:42`: `busy`, `!canWrite`, `!contact`), «Preparar autorización Google» (`:36`: cuatro condiciones), «Analizar y mejorar borrador» (`TeamAgentWorkspace.tsx:20`: `!reviewed`, `!connected`, `!canWrite`), «Revisar importación» (`:52`).

**Consecuencia.** Un lector de pantalla y un usuario de teclado no saben qué falta; un lector (rol «Solo lectura») no sabe que no puede.

**Cambio.** Reutilizar el patrón de la ficha: lista de motivos con `aria-describedby` junto al botón; un motivo por cada condición, incluido «Tu acceso es de solo lectura». No cambiar las condiciones.

**Prueba.** Para cada botón, con cada condición falsa por separado, el motivo correcto está asociado al botón (`aria-describedby` presente y texto exacto) y desaparece al cumplirse.

### R-08 · Foco perdido y resultados que aparecen sin aviso (O, Media)

**Evidencia.**
- `disabled={busy}` en los controles pulsados (`CommercialEditor.tsx:16`, `CommercialWorkspace.tsx:27` + inputs `disabled`) hace que el elemento enfocado pierda el foco durante la operación; al terminar, el foco queda en `body`.
- Un elemento se desmonta al completarse: «Completar» una acción (`CustomerDossier.tsx:37`, la fila sale de la lista abierta), «Confirmar retirada» (`CustomerFiles.tsx:26`), «Cerrar selección» (`:28`).
- Resultados al final del bloque sin foco ni anuncio: contexto propuesto tras «Revisar contexto» (`TeamAgentWorkspace.tsx:19-20`, tras toda la lista) y «Leer contexto del documento» (`CustomerFiles.tsx:26,37`, tras «Actualizar vínculos» en un panel lateral largo). Solo algunos avisos son `role="status"`.

**Consecuencia.** Quien usa teclado vuelve al principio de la página tras cada acción; quien usa lector no oye que ocurrió algo; el resultado queda fuera de la vista.

**Cambio.** Usar `aria-disabled` + bloqueo del clic mientras `busy` en lugar de `disabled` en el botón pulsado; tras la operación devolver el foco a un destino estable (botón siguiente, fila siguiente o el encabezado del resultado con `tabIndex={-1}`); `scrollIntoView({block:'nearest'})` para resultados; un `role="status"` único por vista para avisos.

**Prueba.** Con teclado: «Completar» deja el foco en la acción siguiente o en el título de la sección; «Revisar contexto» mueve el foco a «Datos que recibirá…»; «Guardar borrador» conserva el foco en el botón o lo mueve al aviso. Con lector, el aviso se anuncia una vez.
**Codex en navegador:** recorrer con Tab y registrar `document.activeElement` tras cada acción.

### R-09 · Se abre la propuesta equivocada tras Agente o Ficha (O, Media)

**Evidencia.** `TeamApp.tsx:79` pasa `onProposal={()=>setTab('commercial')}` sin id. «Preparar borrador con las reglas de Plan B» descarta la respuesta (`TeamAgentWorkspace.tsx:20`, `onProposal()` sin argumento) y «Abrir borrador guardado» (`:22`) tampoco informa de qué propuesta es. Mientras, `TeamApp.tsx:80` pasa `initialProposalId={preparedProposal}`, que solo se establece desde la ficha (`:83`) y **nunca se limpia**. En `CommercialWorkspace.tsx:28-29` el id inicial gana sobre «la más reciente».

**Consecuencia.** Si el usuario preparó antes una propuesta desde la ficha, cualquier salto posterior desde el Agente abre esa propuesta antigua en lugar de la nueva; en otros casos abre la primera de la lista sin confirmarlo.

**Cambio.** Cambiar la firma a `onProposal(id?:string)`, pasar el id creado/aplicado (`created.id`, `item.proposal_id`) y guardarlo en `preparedProposal`; limpiarlo al desmontar Comercial o al consumirlo. Mantener `aria-live` con «Borrador X abierto».

**Prueba.** Preparar desde la ficha, volver, preparar otra desde el Agente: Comercial muestra expandida la segunda. «Abrir borrador guardado» abre exactamente ese borrador.

### R-10 · Escape o clic en el fondo cierran la ficha con texto sin guardar (O, Media)

**Evidencia.** `components.tsx:17` cierra con Escape sin condición y `:23` con `mousedown` en el fondo. La ficha contiene el formulario de próxima acción (`CustomerDossier.tsx:38`) y la selección de archivos (`CustomerFiles.tsx:28-32`); el estado es local.

**Consecuencia.** Pulsar Escape (por ejemplo, para cerrar el selector de fecha) pierde «Qué hay que hacer» y la fecha. El Picker de Google además abandona la página (`CustomerFiles.tsx:18`, `location.assign`).

**Cambio.** `Modal` acepta `confirmClose?:()=>boolean`; la ficha lo activa si `title` o `due` no están vacíos o hay archivos seleccionados («Descartar la acción sin guardar»). Antes de `location.assign` avisar si hay texto pendiente.

**Prueba.** Con texto en el formulario, Escape/clic fuera piden confirmación; vacío, cierran sin preguntar. Comprobar que Escape dentro de un `<select>` abierto no cierra la ficha (H, navegador).

### R-11 · Enlace de autorización Google obsoleto (O, Media)

**Evidencia.** `authorization` se guarda al preparar y no se limpia al cambiar `account` o `consent` (`CommercialWorkspace.tsx:36`; `setAccount`/`setConsent` solo cambian su valor). El enlace «Continuar en Google» sigue apuntando a la cuenta anterior.

**Consecuencia.** El usuario escribe otra cuenta, ve el campo actualizado y pulsa «Continuar» que autoriza la anterior; la comprobación de cuenta propia mitiga el daño, pero el flujo queda incoherente.

**Cambio.** `setAuthorization('')` en `onChange` de cuenta y consentimiento y retirar el estado `planb-google-oauth` obsoleto de `sessionStorage`.

**Prueba.** Preparar con A, cambiar a B: el enlace desaparece y exige preparar de nuevo.

### R-12 · Localizar al cliente: sin búsqueda, sin paginación, homónimos indistinguibles (O/H, Media)

**Evidencia.** Contactos renderiza todas las filas (`TeamContacts.tsx:20`) sin búsqueda ni filtro. Los selectores de Comercial muestran `firstname lastname` o el id (`CommercialWorkspace.tsx:42,51`) sin correo ni empresa. `PLAN-1.0.md` admite hasta 10.000 registros por empresa.

**Consecuencia (O).** Con una captura real es inviable encontrar un contacto o distinguir dos «Ana García»; el borrador puede prepararse para el contacto equivocado (se vería el destinatario, pero solo después). **(H)** con miles de filas, renderizar la tabla completa y un `<select>` con todos los contactos degrada el rendimiento; no lo he medido.

**Cambio.** Campo de búsqueda por nombre/correo/empresa y paginación en `TeamContacts`; en Comercial sustituir el `<select>` por un buscador con resultados `nombre · correo · empresa` (patrón combobox con `aria-activedescendant`). La eligibilidad de «Preparar» no cambia.

**Prueba.** Con 5.000 contactos de prueba sintéticos: buscar por correo devuelve resultados en menos de 200 ms; dos homónimos se distinguen por el correo en la opción.

### R-13 · Fallo de recarga tras una acción correcta se anuncia como fallo de la acción (O, Media)

**Evidencia.** `run` agrupa acción y recarga en un `try` (`CommercialWorkspace.tsx:27`; igual en `CustomerDossier.tsx:21`, `CustomerFiles.tsx:15`): si `POST …/approve` o `…/execute` tiene éxito y `load()` falla, se muestra `error` y no `notice`.

**Consecuencia.** El usuario cree que no se aprobó/ejecutó y repite. Para ejecutar, el servidor lo bloquea por `content_hash`, pero el usuario pierde la certeza de que ocurrió una acción externa.

**Cambio.** Separar: tras el éxito mostrar el aviso de éxito y, si la recarga falla, «La acción se realizó, pero no se pudo actualizar la lista. Reintentar» con botón. Registrar el mismo patrón en `TeamApp.tsx:44`.

**Prueba.** POST correcto + recarga con 500: aviso de éxito y de recarga, no de fallo; «Reintentar» recarga.

### R-14 · Solo lectura: textos contradictorios o ausentes (O, Baja)

**Evidencia.** `CustomerDossier.tsx:37` dice «Puedes guardar una aquí» aunque `canWrite` es falso (el formulario no se pinta, `:38`). Comercial no explica por qué todo está deshabilitado (`CommercialWorkspace.tsx:42`, `CommercialEditor.tsx:16`). `CommercialEditor.tsx:20` habla de «guardar» pero el bloqueo recae en «Aprobar» (guardar no está deshabilitado).

**Cambio.** Una nota por vista con `canWrite=false`: «Tu acceso es de solo lectura…»; condicionar el texto de `:37` y ajustar `:20` («para aprobar»). **Prueba.** Con rol lector, cada vista muestra la nota y ningún texto invita a una acción no disponible.

### R-15 · Pestañas con ARIA incompleto (O, Baja)

**Evidencia.** `CommercialWorkspace.tsx:40` y `TeamContacts.tsx:17`: `role="tab"` sin `role="tabpanel"`, `aria-controls`, `tabIndex` móvil ni flechas. `TeamApp.tsx:73` usa `nav` con `aria-current`, que sí es coherente.

**Cambio.** O implementar el patrón completo (flechas, `tabIndex`, panel enlazado) o usar botones con `aria-pressed`/`aria-current`. Es la opción más barata y evita prometer un patrón de teclado que no existe (QA-013 y UI010 ya tomaron esa decisión).

**Prueba.** Flechas izquierda/derecha cambian de pestaña o los controles se anuncian como botones.

### R-16 · Ejecuciones largas del agente sin progreso ni cancelación (H, Baja)

**Evidencia.** Un `await call(...runs)` mantiene `busy` hasta que responda (`TeamAgentWorkspace.tsx:12,21`). No hay sondeo ni botón para actualizar análisis «En curso» (`:22`); la etiqueta existe pero nadie la refresca. **(H)** un modelo local lento puede dejar la pantalla bloqueada minutos; no lo he probado.

**Cambio.** Mostrar tiempo transcurrido, permitir salir sin cancelar el trabajo y sondear `base` mientras exista un `running`. **Prueba.** Un `running` pasa a `succeeded` sin recargar; durante la espera se puede navegar.

### R-17 · Móvil: contexto documental y objetivos táctiles (H, Baja)

**Evidencia.** `.commercial-document-context pre` (`design-system.css:100`) fija fuente y altura de línea, pero no `white-space:pre-wrap`/`overflow-wrap`; sí lo tiene `.team-agent-workspace pre` (`team-agent.css:16`). El contexto puede tener 20.000 caracteres (`CustomerFiles.tsx:37`). `.icon-button` mide 42 px en la ficha ≤600 px (`customer-dossier.css:18`), por debajo del criterio de 44 px de `CLAUDE-COLABORACION.md`.

**Cambio.** Añadir `white-space:pre-wrap;overflow-wrap:anywhere` a esa regla; subir `.icon-button` a 44 px en táctil.
**Codex en navegador (320/390 px):** una línea larga sin espacios no desborda; sin scroll horizontal en ficha, editor, tabla de importación y vista previa del correo; área de «Completar» ≥ 44 px.

### R-18 · Zona horaria de la ficha frente a los formularios (H, Baja)

**Evidencia.** `CustomerDossier.tsx:9` formatea siempre en `Europe/Madrid`; el formulario usa `datetime-local` del navegador (`:22`, `new Date(due).toISOString()`) y Comercial usa `toLocaleString('es-ES')` local (`CommercialWorkspace.tsx:47,49`; `CommercialEditor.tsx:24`).

**Consecuencia (solo si el equipo no está en hora de Madrid).** La hora introducida y la mostrada difieren. **Cambio:** formatear todo con la misma zona o indicarla junto al campo. **Prueba:** con zona horaria de Londres, la hora introducida es la mostrada.

### R-19 · Menores (O salvo indicación)

- `TeamContacts.tsx:20`: `aria-label={'Editar teléfono de '+firstname}` produce «undefined» si falta el nombre.
- `CommercialWorkspace.tsx:41` comparte `error`/`notice` entre pestañas: un aviso de «Seguimiento preparado» sigue visible en «Importar Sheets».
- `:29`: al contraer todas las propuestas, la siguiente recarga reabre la primera.
- `components.tsx:16-22` (H): el efecto depende de `close`, que `TeamContacts.tsx:21` pasa como función inline; cada re-render del padre ejecutaría la limpieza (devolver el foco a la página) y luego forzaría el foco en «Cerrar». Solo ocurre si el padre se re-renderiza con la ficha abierta.
- `CommercialEditor.tsx:24` (H): `toLocal` lanzaría `RangeError` si `start`/`end` fueran inválidos; el esquema de `shared/commercial.ts` exige datetime, por lo que es poco probable.
- Tabla de importación (`CommercialWorkspace.tsx:53`) no muestra apellidos ni teléfono aunque se mapeen.

---

## Qué debe comprobar Codex en navegador

Con perfil de pruebas nuevo, datos sintéticos y red externa bloqueada:

1. R-01/R-02: borrador editado → cambiar de sección/empresa/bloquear; guardar A con B editada.
2. R-03/R-04: aprobar con teclado, comprobar que no hay `POST …/execute` sin segunda confirmación; desconectar Google y revisar «Ejecutar».
3. R-06: forzar 500 inicial en Comercial, ficha, archivos, contactos y agente.
4. R-08/R-10: recorrer con Tab y Escape; registrar `document.activeElement` tras cada acción y con texto sin guardar.
5. R-09: ficha → Comercial → Agente → Comercial.
6. R-11, R-14, R-15 con rol lector y con lector de pantalla si es posible.
7. R-17 a 320 y 390 px: desbordes y objetivos de toque.
8. R-12 con volumen alto (miles de filas) solo si existen datos sintéticos.

## Qué no he verificado

Renderizado real, comportamiento de `datetime-local`, `details` y `inert`, lector de pantalla, rendimiento, orden de eventos con latencia real, y cómo responde el servidor a un `POST` repetido en cada ruta (solo he comprobado `proposals`, `customers` y `jobs`). No he revisado `IntegrationEvidence`, `TeamIntegrations`, `HubspotPrivateConnect` ni `TeamSpaceCreate`. No he ejecutado acciones reales ni llamadas a modelos. Las pruebas propuestas no existen aún; ninguna se ha escrito ni ejecutado.
