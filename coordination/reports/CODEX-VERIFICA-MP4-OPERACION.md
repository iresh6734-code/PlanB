# Mega Plan 4 · Operación de un encargo

24/11/2026 · Europe/Madrid · Trabajo iniciado sobre `733f23e`. Durante la ampliación Claude publicó `0c0fe93` con sus cambios de diseño. La lógica de MP4 se conserva en el checkout local.

El expediente indica el siguiente paso y recupera las decisiones recientes. Hallazgos puede presentar las alarmas y las limitaciones de cobertura con su evidencia, marcar una revisión, solicitar información o dejar constancia de que se leyó una declaración. Cada decisión ocupa una fila independiente y el índice se actualiza en la misma transacción. La decisión conserva las huellas de su informe, su evidencia y, cuando aplica, la declaración revisada.

Una reemisión con los mismos hechos y fuentes conserva las revisiones de la evidencia. Una modificación relevante abre el hallazgo para su revisión. Una declaración modificada exige otra confirmación. La revisión y los informes observados siguen usando sus formatos respectivos.

La entrega revisada compara la huella que vio el operador con la huella vigente, comprueba el expediente y registra ambas huellas, revisión y paquete, en su cadena privada. La vista indica cuándo corresponde al estado actual y qué cambió desde la entrega anterior. Reutiliza el comparador de informes cuando ambas emisiones están disponibles.

## Contrato

| Entrada | Cambio |
| --- | --- |
| `GET /api/verifica/engagements/:id/expediente` | Campo `workflow` con siguiente paso, revisión, historial reciente y estado de la última entrega revisada. |
| `PUT /api/verifica/engagements/:id/review/:rule` | Registra `reviewed`, `request-information` o `reviewed-declaration` con `report`, `evidence`, `previousDecision` y `statement` tal como los vio el operador. Devuelve la revisión actualizada. |
| `POST /api/verifica/engagements/:id/package` | `reviewFingerprint` opcional para solicitar entrega revisada. Los llamadores anteriores conservan su contrato. |

Se rechazan con `409` las acciones sobre un informe, una declaración o una decisión que cambió. Reenviar la misma decisión recupera la revisión vigente. El paquete público conserva el mismo formato y solo incluye los documentos solicitados.

## Comprobaciones

Las pruebas de servidor cubren un recorrido de preparación a entrega, una actualización de factura que abre solo la revisión correspondiente, un cambio de declaración, la caída de una transacción, la reapertura de SQLite y el borrado bajo el alcance del encargo. Un segundo encargo permanece independiente. Se comprueba la clasificación de una limitación aunque no active una alarma.

Pasaron 137 pruebas de Verifica y de las rutas del cliente, incluidas las 10 de revisión y expediente comprobadas también por separado. Pasó `tsc --noEmit`. El inventario generado en un archivo temporal recogió 120 rutas, incluida la nueva ruta de revisión. El documento canónico está bajo la reserva de Claude. Se le comunicaron los contratos para integrar Hallazgos y Expediente y completar el recorrido en navegador.

El servidor de la app local sirve `verifica.html` para abrir o recargar directamente `/verifica` y sus rutas internas cuando está disponible la entrada. El servidor portátil conserva su entrada. Pasaron otras seis pruebas de entrada y estado, incluidas rutas con consulta, una ruta equivalente del CRM y el `404` de una API desconocida.

## Ensayo de dos encargos · 24/11/2026

Compilación Vite en una carpeta temporal. Chromium cargó los archivos compilados y las respuestas de Fastify mediante `app.inject`, porque el entorno bloqueó la conexión directa del navegador a loopback. Los dos encargos se crearon desde la pantalla en un SQLite nuevo. Se usaron datos ficticios y se bloqueó la red externa.

| Tramo | Resultado |
| --- | --- |
| Pantalla de Fuentes | Creación y emisión en ambos encargos. Abrió la dirección directa, recargó y volvió con Atrás al encargo correcto. El informe emitido se abrió con «Ver el informe». |
| Encargo A | La API guardó la revisión completa y generó su paquete. La verificación aceptó la huella externa correcta y rechazó una referencia distinta. |
| Encargo B | «Pedir información» bloqueó la entrega y sobrevivió al reinicio. El cambio de facturas obligó a reemitir desde la pantalla, rechazó el formulario antiguo y reabrió el hallazgo afectado. La respuesta del vendedor se guardó en Preguntas y su revisión se vinculó al nuevo paquete por API. |
| Comprador y cierre | El visor abrió el archivo con Chromium desconectado. Mostró «El paquete está íntegro», sin desborde a 390 px. El cierre por API dejó un acta con eslabón terminal verificable. El encargo A conservó su entrega vigente. |

La navegación a `/verifica/encargos/:id/informe` aún mostró el informe de ejemplo en el ensayo, incluso con una emisión disponible. El informe de ese encargo sí abrió desde Fuentes. Se avisó a Claude con los pasos para reproducirlo. El corte 8 sigue abierto hasta cargar el informe correcto, operar la revisión y la entrega desde las pantallas e incorporar la ruta de revisión al inventario canónico.

## Revisión de integración · 25/11/2026

Claude comunica que está incorporando `0b5e3f0` al trabajo local de MP4 sobre la base `67feb4f`. En el estado revisado pasaron 22 pruebas de expediente, vigilancia, paquetes, revisión y navegación, además de TypeScript. Una comprobación adicional con SQLite ficticio sustituyó el informe publicado por la fila que guardaba `0b5e3f0`, con sus campos `report` y `json`. Expediente mostró la huella y un paquete nuevo seleccionó ese mismo documento y coincidió con la referencia externa.

La prueba reprodujo `422` con `equivalence:false` y `equivalence:true`, que enviaba la pantalla de `0b5e3f0`. Tras la entrega de Claude se corrigieron ambas solicitudes. `false` devuelve el paquete sin ese documento. `true` devuelve `409` con la indicación de volver a abrir el expediente y confirmar la huella. La prueba con la fila anterior confirmó `200` y `409` respectivamente y que el objeto con la huella vigente sigue recuperando el informe exacto. Se pidió a Claude que la selección del formulario recuerde la huella confirmada durante un refresco.

La batería de la integración antes de esta corrección pasó 158 de 158. En una simulación de un paquete antiguo que incluía un parte regenerado en otra fecha, el verificador aceptó la huella externa y detectó que el parte incluido era distinto del citado en la equivalencia. Se trasladó a Claude para que el visor distinga ambas comprobaciones.
