# CLAUDE-QA-013 · Pruebas persistentes del núcleo de estado de la mesa comercial

Sesión: Claude 2 - Accesibilidad UI011. Entregables: `tests/workspace-v2-state.test.mjs` y este informe. Fuentes leídas: `design/claude/workspace-v2/app.js` y mis dos documentos UI011. No he editado `app.js`, HTML, CSS ni archivos del primer agente.

## Estado de ejecución

**Nada se ha ejecutado.** Esta sesión no tiene shell. Codex ejecutará:

```
node --test tests/workspace-v2-state.test.mjs
```

Lo que afirmo es lo que sale de **trazar el código a mano** para cada aserción, no de un resultado. Expectativa:

- Las pruebas normales (por mi recuento, 89) deberían pasar. Si alguna falla, es un error mío de lectura o un defecto real del núcleo: hay que triarlo, no relajar la aserción.
- Las 9 pruebas `CONTRADICCIÓN · …` están marcadas `todo`. Espero que **fallen** hoy (node:test las informa como `# TODO` y no rompe la suite). Si alguna pasa, mi lectura era errónea. Si el brief o el núcleo cambian, se quita `todo`.
- El recuento exacto (89 + 9) hay que confirmarlo con la salida de `node --test`.

## Método

- Solo `node:test`, `node:assert/strict` y `await import("../design/claude/workspace-v2/app.js")`; el núcleo se lee de `globalThis.PBWorkspace`. Sin eval, sin transformar el código, sin DOM simulado, sin dependencias, sin ficheros auxiliares ni modificación de globales.
- Estado inicial nuevo en cada prueba (`core.initialState(new Date(2026, 9, 29, 12))`, es decir `2026-10-29`); la marca `at` de las acciones se inyecta (`2026-10-29T10:00:00.000Z`). Los ids de acciones internas (`i-N`) son deterministas.
- Las aserciones son sobre propiedades de negocio observables (selección, borrador, revisión, listas, avisos) y transiciones. Donde el brief no fija el detalle (p. ej. qué es «Requieren revisión»), uso cotas y relaciones, no igualdad con la regla actual.
- El módulo de datos de muestra es una caché global de proceso; las pruebas solo lo leen. Una prueba comprueba que los datos de muestra no cambian tras una batería de acciones.

## Cobertura por requisito

| Requisito del encargo | Pruebas (resumen) |
|---|---|
| Carga sin `document` solo núcleo | Sin `document`/`window`; el único global añadido es `PBWorkspace`; el núcleo no exporta `render`/`dispatch`/`init`. |
| Vacío honesto | Estado inicial sin selección, trabajos, cola, acciones, fecha de captura, borradores ni correos de muestra en el estado serializado; buscar/filtrar en vacío no hace aparecer datos; entrada por «borrador sin cliente» sin inventar nombre, procedencia, oportunidades ni destinatario. |
| Muestra `example.invalid` | Espacios A y B: nombres «Contacto de muestra NN» o `null`, empresas «Empresa de muestra…», todo correo del dataset termina en `@example.invalid`, ids únicos entre clientes/tareas/oportunidades/actividad, el id crudo nunca es el nombre, existe un cliente sin nombre con etiqueta de respaldo. |
| Selección compartida entre vistas/pestañas | Un `selectedId` sobrevive a Hoy → Integraciones → Comercial y a Seguimiento ⇄ Archivos; cambiar de cliente no cambia pestaña; vistas, pestañas y filtros inválidos son inertes; filtrar la cola no deselecciona. |
| Borradores separados por cliente/espacio | Dos clientes con borradores distintos; editar sin borrador no escribe en otro cliente; preparar de nuevo no pisa el borrador; el borrador de A no reaparece en B ni al volver; ids de otro espacio son desconocidos. |
| Guardar → revisar → editar invalida (destinatario, asunto, cuerpo, acción interna, fecha) | Una prueba por campo (5): revisión, confirmación e `invalidated` tras editar; revisar/confirmar sin guardar son inertes; guardar no devuelve la revisión; hace falta confirmar de nuevo. Además: editar y volver al texto guardado, edición idéntica, guardado sin cambios y doble clic en revisar no invalidan ni duplican; 7 contenidos inválidos nunca quedan revisados; texto hostil (HTML/`javascript:`/5000 caracteres) se conserva literal y los avisos no lo repiten. |
| Cancelación de descarte conserva estado | Cancelar tras cambio de espacio y tras «volver al vacío» conserva espacio, selección y borrador; cancelar/confirmar sin petición es inerte. |
| Confirmar cambio de espacio limpia contexto | Selección, borrador, `prepared`, ficha y contador de cambios sin guardar; solo se pide confirmación con borradores sucios (el contador cuenta solo los sucios). |
| Carga/error no cruza borrador | `loading` y `error`: sin descarte, selección y borrador intactos, sin datos ni cola, sin preparar ni abrir ficha, vuelta a datos con el borrador intacto; reintento vuelve al último escenario de datos; en error cambiar de espacio sigue pidiendo confirmación; error = alerta, carga = estado y única que cuenta como «ocupado». |
| Doble envío interno no duplica | Crear dos veces (también con espacios), repetir `op/done`, crear una igual ya existente; distintas acciones no se bloquean; completar con doble clic y repetición; ids únicos incluso mezclando creación directa y revisión con acción interna; la revisión repetida no duplica; la acción sale de Hoy al completarse. |
| Solo lectura / sin correo / origen inactivo / operación en curso no permiten preparar | Por cliente (a-04, a-02, a-06) y por escenario; alerta, sin borrador ni cambio de vista ni selección; varias causas se listan todas en `prepareBlockers`; una operación pendiente bloquea hasta terminar; «desactualizado» **no** bloquea (no figura entre las causas del brief); las acciones internas sí se pueden crear en solo lectura. |
| Id desconocido no crea identidad falsa | Nueve ids (`''`, `null`, `undefined`, formato distinto, fuera de rango, de otro espacio…) × `select`/`prepare`/`panel/open`/`internal/create` devuelven el mismo estado; `MANUAL_ID` rechazado en preparar, ficha y acciones; acciones desconocidas inertes. |
| Inmutabilidad y determinismo | Batería de ~40 acciones sobre estado y acciones congelados en profundidad: `reduce` no muta (el modo estricto lanza si lo hiciera) y los datos de muestra no cambian; misma secuencia → mismo resultado; estados iniciales independientes. |
| Hoy / filtros / búsqueda | Casos del brief (vencida, sin correo, solo lectura, sin oportunidad; «vencida» solo antes de hoy; un trabajo vence hoy); sin campos de urgencia; orden fecha → sin fecha → sin próxima acción; claves únicas y ningún cliente desaparece; filtros, búsqueda sin acentos, combinación, «sin coincidencias» distinguible de «sin datos». |
| Ficha (estado) | Solo con datos y cliente real; guarda el disparador; abrir ficha no toca selección ni borrador; se cierra al pasar a carga/error/vacío/otro espacio/preparar; cerrar limpia el error del formulario. |
| Avisos | Éxito = `status`, fallo = `alert`; ningún aviso afirma envío real; `noticeSeq` solo crece cuando hay aviso nuevo. |
| Capacidades | Cuatro, con motivo y efecto; ninguna llamada «Enviar»; campos solo en Reunión y Documento. |

## Contradicciones brief ↔ núcleo (pruebas `todo`)

| # | Qué reproduce | Por qué importa | Alcance real |
|---|---|---|---|
| 1 | `select` de un cliente de muestra en vacío fija `selectedId` y `selectedClient` devuelve datos (no comprueba `dataAvailable`, a diferencia de `prepare` y `panel/open`). | Brief: «No inventes clientes» en el vacío. | Inalcanzable desde la UI actual (en vacío no hay filas); es una brecha de invariantes. Lo mismo ocurre en carga/error, no cubierto porque el brief exige allí conservar, no prohibir. |
| 2 | `select` con `MANUAL_ID` deja un cliente seleccionado sin borrador. | Selección sin borrador ni procedencia. | Solo programático. |
| 3 | Una acción interna pedida en el espacio A que termina (`op/done`, 350 ms en la UI) después de cambiar a B se escribe en B y desaparece de A. `pending` no se limpia al cambiar de espacio ni guarda su espacio. | Contexto cruzado y pérdida de datos: carga sin cruce. | **Alcanzable**: crear una acción en la ficha y cambiar de espacio antes de 350 ms. |
| 4 | Igual con «Completar»: se informa «completada» pero la acción de A sigue pendiente. | Idem. | **Alcanzable**, mismo caso. |
| 5 | `panel/open` con la ficha abierta reemplaza `openerKey`. | Restauración de foco hacia un nodo interno del panel (R3 de UI011). | La UI actual lo evita con `inert`; no hay guarda en el reductor. |
| 6 | El reductor acepta `internal: true` en el borrador sin cliente; al revisar crea una acción con `clientId: null` que ningún selector muestra. | Efecto declarado en el panel («se creará una acción») que nunca se ve. | La UI oculta la casilla en ese borrador; el reductor no lo impide. |
| 7 | `draft/save` rechaza contenido incompleto. El brief pide validez solo a la casilla y a «Marcar revisión local». | Un borrador a medias nunca queda guardado y siempre aparece como «cambios sin guardar», con lo que el aviso de descarte no se puede resolver sin completarlo. | Depende de la decisión A5 de UI011; es la más discutible. |
| 8 | El aviso de `prepare` bloqueado cita solo la primera causa (`blockers[0]`). | Brief: «Explica las causas». | La UI deshabilita el botón y lista todas; el aviso del reductor es de respaldo. |
| 9 | Valores no textuales en `draft/edit` (`null`) hacen que `validateContent` lance `TypeError`. | Robustez del reductor ante entradas mal formadas. | Baja: la UI siempre envía cadenas. |

Prioridad de corrección sugerida: 3 y 4 (reales), luego 7 (decisión de contrato), después 6, 1, 5, 2, 8, 9.

## Observaciones no convertidas en prueba

- `queueClients` sin búsqueda devuelve el array interno cacheado del dataset: un consumidor que lo ordene o modifique en sitio alteraría los datos de todos los estados.
- «Volver al vacío» y el cambio de escenario no limpian `internal` (las acciones internas de un espacio reaparecen al volver a muestra) ni los filtros/búsquedas de Hoy al cambiar de espacio. El brief solo exige limpiar selección, borrador y revisión; decisión de Codex.
- Tras revisar con acción interna, un cambio de asunto y nueva revisión no actualiza el título de la acción ya creada, aunque el panel de revisión muestra el asunto nuevo como efecto. Posible incoherencia texto/efecto; el brief no lo define.
- `validateContent` acepta saltos de línea en el asunto si llegan por el reductor (la UI usa un `input` de una línea).
- `files/mode` y `fields/toggle` no validan su valor.
- `Reintentar` desde un error inicial (sin datos previos) lleva a `sample`, es decir, aparecen datos de muestra sin que el usuario los haya activado.

## Huecos que requieren navegador (no cubiertos por estas pruebas)

- Foco: apertura de la ficha, foco inicial, Tab/Shift+Tab cíclico, Escape (también con `select` abierto), restauración al disparador, disparador desaparecido por filtro, `inert` + `aria-hidden` del fondo, bloqueo de scroll, botón Atrás con la ficha abierta.
- Región viva: anuncios `status`/`alert` y su deduplicación de 3 s, mensajes de la ficha fuera del `status` global mientras el panel es modal, `aria-busy`.
- Temporización real de `op/done` (350 ms) y la condición de carrera de los casos 3 y 4 en navegador.
- Re-render: conservación de foco, cursor e IME al teclear; `select` compacto sin trampa; cruce de 900 px.
- Maquetación y CSS: 1440/1024/768/390/320, desbordes, objetivos de 44 px, contraste, foco visible, `prefers-reduced-motion`, teclado virtual.
- Seguridad de render: que el contenido hostil acabe como texto (las pruebas solo garantizan que el núcleo lo conserva literal).
- Red/almacenamiento/`mailto:`: ausencia comprobada en herramientas del navegador.
- Textos exactos de la interfaz y semántica ARIA (tablist, radiogroup, diálogo).

## Estado

Ambos archivos quedan sin `submit` ni autoaceptación. Codex ejecutará `node --test tests/workspace-v2-state.test.mjs` y contrastará resultados.
