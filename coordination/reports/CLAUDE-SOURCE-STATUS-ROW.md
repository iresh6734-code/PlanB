# CLAUDE-SOURCE-STATUS-ROW · Fila de fuente con evidencia y acciones del anfitrión (informe de entrega)

9/11/2026, Europe/Madrid. Claude B. Dependencia aceptada: `CLAUDE-SOURCE-INTEGRATIONS-CONTRACT` (SourceStatus R3), huella **`fddfda1bd5b73d4b5a32e0eca96e6b58a9188d6b7b50be911421c37cf2a08da1`**, que el banco comprueba antes de ejecutar. Traspaso con props, textos, puntos de inserción y dueños: `coordination/plans/SOURCE-STATUS-ROW-HANDOFF.md`.

## R2 · devolución 312 (F1/P2, 10/11/2026)
**Defecto:** `signatureOf` seleccionaba proveedor, cuenta, nivel, evidencia, acción, hora y peticiones, y omitía `authorizedAt` y otros campos semánticos. Renovar la autorización de la misma cuenta conservaba «En curso…», los detalles abiertos y atribuía la terminación anterior a la vista nueva.
**Corrección (solo `src/SourceStatusRow.tsx`):** la identidad del estado es `JSON.stringify` de la vista validada y normalizada completa (esquema estricto); no hay lista de campos que mantener. Detalles y fase de la acción viven en un único estado atado a esa firma y se reinician **durante el render**, antes de pintar (ni un fotograma con el estado anterior); volver a una vista anterior (A→B→A) tampoco recupera la actividad de la primera A. El resultado de una acción solo se escribe si siguen vigentes la generación, el montaje **y** la firma del momento de la llamada. Un objeto nuevo con el mismo contenido NO reinicia nada. Se conserva la guarda de desmontaje y la ausencia total de red (sin `fetch`).
**Alcance del anfitrión:** lo que la vista no lleva (instalación, captura, generación, pin, fuente exacta) lo distingue la `key` React que el anfitrión pasa a la fila; está definida en el traspaso («Identidad del estado y clave de la fila»). Una clave de título o proveedor no basta.
**Nota honesta:** el texto del alcance declarado (`authorization.scope`/`objectTypes`) **no forma parte de la vista**, así que cambiarlo no cambia la fila; mi primera variante de prueba sobre eso era inválida y la retiré.

### Verificación R2 (distingue alcances)
| Capa | Qué | Resultado |
| --- | --- | --- |
| **Sondas del revisor, intactas** (`independent-source-status-row.spec.ts` del banco 312, copiado sin editar a un banco nuevo `tests/.tmp/source-row-r2-*` con el componente corregido) | renovación retira actividad / cierra detalles / terminación anterior no aparece | **3/3** (con el componente anterior, **0/3**: control causal en el mismo banco) |
| **Chromium DOM, mis cinco pruebas previas** | situaciones, acción, detalles, inválida, 1440/390/320 | **5/5**, sin cambios |
| **Chromium DOM, cuatro pruebas R2 nuevas** | (1) autorización renovada: «En curso…», detalles y terminación tardía; (2) variantes que conservan la hora y las peticiones: autorización renovada, cuenta comprobada, otro recuento, «ya no antigua», listado vacío, cobertura parcial; (3) mismo contenido ≠ cambio, A→B→A, respuesta tardía de A; (4) cambio de `key` del anfitrión con vista idéntica | **4/4**; con el componente anterior fallan (1), (2) y (3); la (4) pasa porque documenta el contrato de React, no el de la firma |
| **SSR Node** (`tests/source-status-row.test.ts`; **solo textos, no estado**) | las tres previas, sin cambios | **3/3** |
| **Tipos** | `tsc --noEmit -p .` filtrado a la fila | sin errores |
Banco completo (sondas + 9 pruebas del banco propio): **12/12**. Chromium `chromium_headless_shell-1228`, servidor efímero en loopback, ruta externa abortada en la sonda 1 del revisor; sin proveedores, credenciales ni instalación real. **Discrepancia de huella a declarar:** el manifiesto del revisor lista `independent-source-status-row.spec.ts` como `a47fbf92…`, pero el archivo del banco `s` que copié tiene `8665f435…`; es el que ejecuté, sin tocarlo (no sé si el manifiesto es anterior a una edición del archivo; el criterio de las tres sondas es el mismo que describe la revisión). No se ejecutó un lector de pantalla ni modo oscuro. No se repitieron los 18 mutantes: el control causal R2 es el del componente anterior completo.

## Qué es y qué NO es
**Componente probado, NO montado.** `SourceStatusRow` dibuja una `SourceStatusView` ya derivada con la derivación aceptada de SourceStatus (`sourceStatusView`, `describeSourceHeadline`, `ACTION_LABEL`; **sin copiar `evidenceOf` ni otra tabla de estados**). No hace `fetch`, no conoce el registro de fuentes y no decide qué acciones existen: las acciones son manejadores que aporta el anfitrión. **No** toca `LocalIntegrations`, App, main, SourceStatus, el historial ni `continuity-passport` (308): la hora se formatea dentro del componente. Que exista no conecta ningún proveedor; no existen GET de estado, registro de fuentes ni acción de lectura.

## Qué responde la fila (en este orden)
1. **Qué herramienta es y qué cuenta representa:** `label`, «Ensayo · datos ficticios» si el proveedor es `*-fixture`, y cuenta comprobada / configurada (identidad sin comprobar) / sin cuenta.
2. **Qué se intentó y qué se observó:** el titular de SourceStatus, la hora observada (Madrid), cobertura, recuento (null = «recuento desconocido (no es cero)», nunca 0), causa y «antigua»; en un intento sin datos, «Qué se intentó:» con la frase de evidencia de SourceStatus (la segunda afirmación del intento; una prueba fija ese orden).
3. **Qué acción permite avanzar:** botón solo si el anfitrión aporta el manejador de `view.nextAction`; si no, la condición que falta; `none` nunca es acción.
4. **«Detalles y recibos» cerrado por defecto:** botón con `aria-expanded`; `children` (el historial) **no se monta hasta abrirlo**, así que no consulta nada mientras esté cerrado.

La acción se llama **una sola vez** mientras espera («En curso…», deshabilitada), no inventa éxito al terminar («La acción terminó. Este estado solo cambia cuando se vuelve a consultar»), muestra el fallo (rechazo o excepción síncrona) y permite reintentar; si cambia el estado mientras espera, el resultado anterior **no se aplica** al nuevo y los detalles se cierran. Un estado que no cumple el esquema no se dibuja («no es válido… se desconoce (no es cero)»).

## Qué se comprobó, y con qué
| Capa | Qué | Resultado |
| --- | --- | --- |
| **SSR Node** (`tests/source-status-row.test.ts`; **SSR no es DOM real**: no prueba foco, teclado, estado ni maquetación) | 12 vistas DERIVADAS con `describeSourceStatus` a partir de lecturas reales del adaptador Zendesk con `fetch` sintético (sin cuenta, red ni credencial): sin cuenta, sin autorización, preparada, ensayo, observada, antigua, vacía, parcial, interrumpida, error 403, fallo de red y sin petición. Textos, hora observada conservada, null ≠ 0, evidencia por causa, ni «conectar» ni secretos ni etiquetas; acción por manejador (otras acciones y `none` no se ofrecen); detalles cerrados y vista inválida. El componente REAL se empaqueta con esbuild (CSS ignorado) | **3/3** |
| **Chromium · DOM real** (`tests/e2e/source-status-row.spec.ts`) | Las mismas 12 vistas en una página con servidor local efímero; titulares (10 distintos); acción: un manejador por acción, dos clics = una llamada, «En curso», sin éxito inventado, rechazo y excepción, resultado tardío no aplicado a otro estado, desmontado; detalles: cerrados, Enter y Espacio sin perder el foco, un estado nuevo los cierra, orden de tabulación; estado inválido; 1440/390/320 sin desbordamiento, botones de 44 px en móvil, capturas abiertas; sin peticiones del componente ni errores de consola | **5/5** (tres ejecuciones seguidas) |
| **Control causal** | 18 mutantes del componente: acción sin manejador, `none` como acción, manejador de otra acción, doble llamada, éxito inventado («conectada»), fallo mostrado como terminado, resultado anterior aplicado al estado nuevo, estado nuevo que hereda «en curso», detalles que no se cierran o empiezan abiertos, hijo montado cerrado, fallo como «0 registros», vista inválida dibujada, ensayo llamado observado, sin explicación de lo que falta, botón «Conectar», sin frase de evidencia, hora de ahora | **18/18 detectados** (12 por Node, 6 por Chromium); fuente restaurada por hash |

Dos mutantes sobrevivieron al principio por **redundancia del propio código** y se eliminaron en vez de aceptarlos: la guarda de «none» estaba duplicada en el render y en el manejador, y un `useRef` de «ocupado» duplicaba al estado `running` (el botón deshabilitado ya impide la segunda llamada). `tsc -p .` sin errores de esta unidad (el global puede mostrar errores de otra unidad).

## Decisiones y límites
- El GET futuro devuelve la `SourceStatusView` derivada en el servidor (decisión de Codex): el componente nunca recibe la `SourceReading` completa ni texto de registros.
- La frase de evidencia del intento se toma de `view.statements[1]`: acoplamiento posicional con la derivación aceptada, cubierto por una prueba que avisa si el orden cambia.
- No probado: lector de pantalla, modo oscuro, otros navegadores, el montaje en `LocalIntegrations` con sus estados existentes, ni la combinación con el historial real (aquí `children` es una sonda de banco). Capturas abiertas: 320 px y 390 px (versión previa al ajuste final de maquetación, y la final a 320 px) y 1440 px (versión previa); las finales de 390 y 1440 están en la carpeta de evidencia del banco.
- Sin llamadas reales, cuenta, credencial ni servicios externos; el banco usa un servidor local efímero en `127.0.0.1`, no 4601, 4331 ni 4334.

## Estado de llegada
| Qué | Estado | Tarea / dueño |
| --- | --- | --- |
| Componente, estilos, pruebas y traspaso | Implementado y verificado en DOM real; **no montado** | Esta unidad · Claude B (pendiente de revisión) |
| Registro de fuentes, GET de estado derivado, acción de lectura de ensayo, montaje en `LocalIntegrations` | **No existe** | Codex coordinador (pasos 1–4 del traspaso) |
| QA del producto montado | Unidad registrada, sin reclamar | `CLAUDE-SOURCE-HISTORY-MOUNT-QA` · Claude B |
| Lectura real con cuenta propia | **No hecho** | La persona, con autorización expresa |

## Hashes finales (sha256) · R2
| Ruta | sha256 |
| --- | --- |
| src/SourceStatusRow.tsx | b6125d57cc58d6ba39317a6d5b0d5d9ba084f9a87459808d7f057fbc0888231b |
| src/source-status-row.css | e60b5d308a32db4ee23f52133723841a6f14efcc34be5d6a9c76b630b324c5d9 |
| tests/source-status-row.test.ts | d8aac52299d1de0d9b95ff545b26551962290be58942cf55d1212c6e46e9c78b |
| tests/e2e/source-status-row.spec.ts | c8afaff258181e4653598dcd14ab05e0df684ec2b69abdcd12246e166d659fcd |
| coordination/plans/SOURCE-STATUS-ROW-HANDOFF.md | 5594e1cb7af4c07a52096bfc9982578309545193037dfc5c143ee982f06cf662 |
| coordination/reports/CLAUDE-SOURCE-STATUS-ROW.md | (este informe) |
Imports probados: shared/source-status.ts `fddfda1b…` (aceptada), shared/source-reading.ts `5e487a65…` (aceptada, solo en pruebas), hojas globales del banco (styles, design-system, planb-ui).
