# CLAUDE-002 · Auditoría UX de Hoy, Comercial, Integraciones y ficha de cliente

**Método y límite.** Auditoría **solo a partir del código** (TSX y CSS listados en el encargo, más `DESIGN.md` y `UX-ARQUITECTURA-0.6.md`). No he renderizado la app, ni medido contraste, tamaños ni desbordamiento reales, ni usado un lector de pantalla. Lo marcado «Observado» se lee en el código; lo marcado «Hipótesis» debe renderizarlo Codex a 1440 px, 390 px y 320 px antes de actuar. No hay clientes, actividad ni capturas inventadas aquí.

## 1. Qué conservar

- Identidad azul, tokens de `DESIGN.md` y nombres operativos. El foco visible ya existe (`design-system.css:32`, outline 2 px) y `prefers-reduced-motion` está cubierto (`design-system.css:118`).
- Revisión explícita antes de acciones externas: casilla «He revisado…» + hash de contenido en `CommercialEditor.tsx` y `SalesWorkspace.tsx`. Editar invalida la aprobación y bloquea «Aprobar» con cambios sin guardar. Es el mejor patrón del producto.
- Rótulos de procedencia en la ficha (`customer-origin`: «Captura HubSpot / Copia local», «Datos ficticios», fecha) y la frase «Abrirla no consulta servicios externos». Mantener la separación entre dato guardado y lectura remota.
- Lateral de compromisos solo cuando hay tareas (`today-layout.with-commitments`, `SalesWorkspace.tsx`) y franja cuando no hay.
- Estados vacíos de tamaño de contenido (`InlineEmpty`).

## 2. Matriz por vista (observado en código)

| Vista | Propósito / acción principal | Problema observado | Gravedad |
| --- | --- | --- | --- |
| **Hoy** (`SalesWorkspace view=today`) | Elegir el siguiente seguimiento | Cada fila dice igual «Sin próxima acción» (`priority-row`): no muestra motivo, importe, antigüedad ni etapa, así que no ordena por urgencia. La acción es «Ver oportunidad», pero la principal (preparar seguimiento) es un botón único de cabecera que no actúa sobre la fila. Se muestran 5 de N sin criterio de orden visible. | Alta |
| **Comercial** (`CommercialWorkspace`) | Elegir cliente, ver contexto, redactar, revisar, ejecutar | El cliente se elige en un `<select>` con todos los contactos (nombre y apellido, sin empresa ni correo): no escala y obliga a abrir ficha aparte. Contexto HubSpot (`HubspotContext`), borrador y revisión viven en bloques apilados distintos; la propuesta muestra «Cliente: {contact_id}» (ID crudo) en vez del nombre. Dos controles distintos de cliente (pestañas «Seguimientos» y «Archivos») duplican estado. El bloque de conexión Google con `details` y el aviso «Piloto personal» preceden a la tarea principal. | Alta |
| **Editor** (`CommercialEditor`) | Redactar y aprobar | Layout de 2 columnas bueno, pero la columna de revisión es `<aside>` que a <900 px queda debajo de un formulario largo: la casilla de revisión y el botón de aprobar quedan lejos del destinatario/horario que debe revisar. Las 4 acciones externas son casillas sin resumen de su efecto («Enviar seguimiento en Gmail» no dice a quién hasta que se mira arriba). | Media |
| **Integraciones** (`SalesWorkspace view=integrations` y `TeamIntegrations`) | Distinguir capacidad, autorización y conexión | Dos pantallas distintas con el mismo nombre: una (local) lista capacidades con insignia «Simulado / Conexión existente / Espacio comercial»; otra (equipo) solo trata Google y relega HubSpot. La insignia mezcla en un solo texto *configurado*, *autorizado* y *probado*. `TeamIntegrations` termina con una advertencia útil («una autorización no acredita…») pero en un párrafo largo de `helper`, no junto a cada capacidad. | Media |
| **Ficha** (`CustomerDossier`, modal lateral) | Ver oportunidad, cronología y próxima acción | Buena procedencia. Pero «Actividad guardada» solo muestra tareas capturadas: no hay correos/notas, lo cual el texto aclara; no se ve **qué está vacío y por qué** (permiso, captura antigua). «Preparar seguimiento» está deshabilitado por tres causas distintas (`canWrite`, `canPrepare`, `!email`) y solo una tiene explicación visible. Importe sin moneda (correcto, avisa). Modal lateral con 5 secciones apiladas y botón «Actualizar» al final. | Media |
| **Hoja de estilos** | — | Seis hojas cargadas en cascada (`main.tsx`: styles, refinements, sales, team, integrations, design-system). Valores contradictorios: `.button` min-height 36 px (`design-system.css:26`) frente a 40 px (`refinements.css:49`); `--muted` `#52627a` frente a `#687386`; sidebar `#edf1f6` frente a `#f8f9fb`; campos 38 px frente a 42 px. Gana la última, pero cualquier reordenación o hoja nueva cambia el diseño sin aviso. | Media |

## 3. Mejoras priorizadas (impacto/coste; no relleno)

| # | Mejora | Dónde | Impacto | Coste |
| --- | --- | --- | --- | --- |
| 1 | Cada fila de Hoy lleva un **motivo y un dato de orden** reales (etapa, importe si existe, días sin contacto desde la captura) y su propia acción «Preparar seguimiento». | `SalesWorkspace.tsx` fila `priority-row`; datos en `/v4/today` (Codex) | Alto | Medio |
| 2 | Sustituir el `<select>` de cliente por **buscador con lista** (nombre, empresa, correo) y mostrar nombre, no `contact_id`, en la propuesta. | `CommercialWorkspace.tsx` | Alto | Medio |
| 3 | Un solo selector de cliente compartido por «Seguimientos» y «Archivos»; mantener el elegido al cambiar de pestaña. | `CommercialWorkspace.tsx` | Medio | Bajo |
| 4 | Explicar **cada** causa de «Preparar seguimiento» deshabilitado junto al botón (sin permiso, fuente no activa, sin correo). | `CustomerDossier.tsx` | Medio | Bajo |
| 5 | Resumen de efecto de cada acción externa marcada («Enviará a X el {fecha}», «Invitará a X») encima del botón de aprobar. | `CommercialEditor.tsx` | Alto (seguridad de revisión) | Bajo |
| 6 | En <900 px, mover el bloque de revisión **justo después** del destinatario/horario o hacerlo sticky al final, no tras el editor completo. | `design-system.css:101`, `CommercialEditor.tsx` | Medio | Bajo |
| 7 | Separar tres estados en Integraciones: *configurada*, *autorizada*, *verificada con operación* (con fecha y alcance), cada uno como etiqueta con texto distinto, no solo color. | `SalesWorkspace.tsx`, `TeamIntegrations.tsx`, `IntegrationEvidence.tsx` | Alto (honestidad) | Medio |
| 8 | Unificar las dos vistas de Integraciones o nombrarlas por contexto («Local» / «Equipo») para no mezclar HubSpot y Google. | ambas | Medio | Medio |
| 9 | Plegar «Configurar conexión Google» y el aviso piloto cuando ya hay cuenta autorizada; mostrar una línea de estado. | `CommercialWorkspace.tsx` | Bajo | Bajo |
| 10 | En la ficha, mostrar por qué falta actividad (p. ej. «Captura de {fecha} sin tareas; las notas y correos no se capturan») y agrupar con cabeceras plegables. | `CustomerDossier.tsx` | Medio | Bajo |
| 11 | Consolidar los valores contradictorios de las hojas CSS en tokens únicos (`--muted`, alto de botón/campo, color de sidebar) y retirar duplicados. | `refinements.css`, `design-system.css`, `styles.css` | Medio (mantenibilidad) | Medio-alto, con riesgo visual |
| 12 | Resultado de la captura/diff HubSpot («Comparar últimas capturas») como tabla corta con enlaces a registros, no como frase. | `HubspotContext.tsx` | Bajo | Medio |

No propongo más: el resto de pantallas no se han auditado en esta entrega.

## 4. Dos composiciones estructurales (mismos campos)

Campos comunes: cliente, empresa, oportunidad (etapa, importe), motivo de prioridad, última/próxima acción, borrador (destinatario, asunto, cuerpo), acciones externas, revisión, evidencia/estado.

**A · Lista operativa con contexto bajo demanda.** Una sola columna: lista de clientes/oportunidades ordenada por motivo; al elegir una fila se despliega *en el sitio* (acordeón) el contexto y el borrador; la revisión es un pie fijo del propio panel desplegado. Pros: cabe en móvil sin cambio de estructura, menos estado global, coste bajo (reaprovecha `details`/`commercial-proposal`). Contras: con muchos clientes la lista se alarga; comparar contexto y borrador a la vez exige scroll.

**B · Mesa de preparación adaptable.** Dos regiones de distinto ancho en escritorio: izquierda estrecha (cola ordenada de clientes) y derecha ancha con tres bandas apiladas (contexto con cronología, borrador, revisión). Por debajo de 900 px la cola pasa a selector compacto y las bandas se apilan con el pie de revisión pegajoso. Pros: selección, contexto, borrador y revisión visibles a la vez en escritorio, y menos desplazamiento entre clientes; encaja con la mejora 2 y 3. Contras: mayor coste (nuevo layout y estado compartido), riesgo de cascada CSS (mejora 11) y más pruebas a 320/390 px.

**Recomendación (razonada, no certificada).** Comercial: **B** para escritorio, con degradación a A en <900 px, porque su tarea principal es leer contexto mientras se redacta. Hoy: **A** (lista con filas ricas, mejora 1), porque su tarea es escoger y la mesa sería ornamento. Integraciones y ficha: ni A ni B; aplicar las mejoras 4, 7 y 10. Hipótesis a validar renderizando: que B no recorta el pie de revisión a 320 px, y que la cola de 5 clientes no vacía visualmente la zona derecha.

## 5. Criterios medibles

- **Densidad:** fila de datos 44–54 px (`DESIGN.md`); medir `priority-row` actual (`min-height:64px`) y decidir si pasa a 56 px con la información añadida. Texto de cuerpo 13–14 px.
- **Contraste:** texto normal ≥4,5:1. Verificar con herramienta `#52627a` y `#687386` sobre `#fffefd`/`#eaf0f6`/`#f2f4f7`, el `placeholder` `#596b83` y las insignias de aviso (`#835c1c` sobre `#fff7e8`). No lo he calculado.
- **Foco:** todo control alcanzable con teclado en orden visual; foco visible sin recorte dentro del modal lateral y los `details` (comprobar `summary` de `commercial-proposal`, cuyo `onClick` hace `preventDefault`: confirmar que Intro/Espacio siguen abriéndolo).
- **Móvil:** objetivos ≥44 px a 390 px (hoy `.button` 42 px en ≤600 px y `.text-button` 36 px: por debajo del 44 de `PLAN`), sin desplazamiento horizontal a 320/390 px, tablas con contenedor desplazable.
- **Estados:** cada vista con carga, vacío, error, permiso insuficiente y «parcial/incierto» diferenciados por texto o icono, no solo color. En Hoy, error de carga existe; falta el estado «sin captura».
- **Honestidad:** ninguna etiqueta «conectado» sin evidencia; «verificada» exige fecha y operación.

## 6. Observado en código frente a hipótesis para Codex

**Observado:** puntos de la matriz y los números de línea citados; hojas en cascada y valores contradictorios; `contact_id` mostrado crudo; selector con todos los contactos; deshabilitados sin explicación completa.

**Hipótesis a renderizar:** las alturas reales de fila, el solapamiento visual de CSS contradictorio, el recorte del pie de revisión en móvil, el contraste real, la accesibilidad por teclado del `summary` con `preventDefault`, y si la «lista larga» de clientes llega a ser un problema con los volúmenes reales del piloto.

## 7. Pendiente y riesgos

- No toqué app, `DESIGN.md` ni tareas de Codex. No he abierto cuentas, bases ni ventanas.
- Los datos de la mejora 1 (motivo, importe, antigüedad) dependen de `/v4/today` y de lo capturado; si no existen, no deben inventarse: mostrar «sin dato».
- La consolidación CSS (11) es la de mayor riesgo de regresión visual; hacerla con capturas antes/después.
- Siguiente entrega natural: CLAUDE-004 (recorridos, estados y accesibilidad) con renderizado real, que ya está a la espera en el tablón.

## Correcciones tras contrastar con el código actual (29/10/2026, Claude)

Codex devolvió este informe por tres afirmaciones que el código actual no sostiene. Se corrigen aquí sin reescribir el análisis original:

1. **Selector de cliente compartido.** La mejora 3 («un solo selector compartido por Seguimientos y Archivos») ya existe: `CommercialWorkspace.tsx` guarda un único estado `contact` que usan los selectores de ambas pestañas. Queda como hecha; sigue pendiente la parte de contexto del selector (sin empresa), que se ha mejorado después con búsqueda y etiqueta `nombre · correo` (`CLAUDE-FIX-014`, R-12).
2. **Actividad de la ficha.** «Actividad guardada» muestra tareas capturadas **y** las acciones internas completadas de Plan B (`CustomerDossier.tsx`), no solo las tareas CRM. Además, «Preparar seguimiento» ya explica sus **cuatro** causas de bloqueo (`CODEX-UX-001`), no una sola.
3. **Hoy: «5 de N» y orden.** El recorte que se observa en el código actual es de 12 elementos (`SalesWorkspace.tsx:54`, `slice(0,12)`), no 5; y el «criterio de orden no visible» es una hipótesis sin renderizar. Debe tratarse como **hipótesis** hasta comprobarla en navegador.

El resto del informe conserva su estado original de análisis estático.
