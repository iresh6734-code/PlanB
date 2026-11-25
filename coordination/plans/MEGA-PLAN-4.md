# Plan B Verifica · Mega Plan 4

24/11/2026 · Europe/Madrid · Base `733f23e`.

**Objetivo.** Convertir Verifica en una herramienta para llevar un encargo completo. El operador puede saber qué falta, decidir qué hacer con cada hallazgo, retomar una revisión después de recibir información y preparar una entrega explicable al comprador. La lectura, la equivalencia, la salida verificable y el cierre dan soporte a ese recorrido.

La fase B del Mega Plan 3 se acreditó con HubSpot y Holded. Las fases 1 a 3 ya disponen de código y pruebas. En la revisión del corte publicado se encontraron tres carencias del recorrido: captura y estado final se podían guardar por separado, la equivalencia no entraba en el paquete y el acta no incorporaba el eslabón terminal. La fase de los primeros 100 días conserva su condición de primera venta.

| Corte | Trabajo | Prueba de salida |
| --- | --- | --- |
| 1 · Lectura | Registrar el inicio antes de solicitar datos a HubSpot. Guardar el estado final junto a la captura, la rotación, el acta y el expediente. | Un fallo al registrar el inicio produce cero peticiones. Un fallo al guardar el estado final revierte toda la lectura. Tras reabrir SQLite se recupera el estado que corresponde a la captura guardada. |
| 2 · Entrega | Conservar el informe de equivalencia y enlazarlo en el expediente. Incluirlo en el paquete al confirmar su huella y la revisión de lo que se comparte. Comparar el paquete con una huella recibida por separado. | La equivalencia descargada coincide con la generada en migración. Si incluye también la vigilancia, coincide con el parte que cita la equivalencia. Un paquete dañado se puede abrir para diagnosticarlo. Uno rehecho con su propia huella falla frente a la huella entregada. |
| 3 · Cierre | Mostrar el inventario previsto y su huella antes de confirmar. Vincular el eslabón terminal al acta y conservar los recuentos de borrado. | Un cambio de alcance obliga a revisar el inventario de nuevo. Un fallo de escritura revierte el cierre. El acta permite verificar el eslabón terminal y el resultado del borrado. El comprobador conserva la lectura de actas anteriores. |
| 4 · Comprobación integrada | Recorrer un solo encargo desde la lectura autorizada y el parte hasta el paquete y el cierre. Contrastar el resultado con otra operación del mismo almacén. | La prueba verifica las huellas, el contenido excluido, las recuperaciones y que el segundo encargo conserva su estado. Repetir los casos de formato anterior y la batería de Verifica. |
| 5 · Estado del encargo | Mostrar la siguiente acción dentro del expediente: completar fuentes, emitir, actualizar, revisar o preparar la entrega. Recuperar decisiones recientes al volver al trabajo. | Cada cambio en fuentes, informe o revisión cambia el estado correspondiente. Consultar el resumen reutiliza los metadatos guardados. |
| 6 · Revisión de hallazgos | Marcar un hallazgo como revisado, pedir información o registrar que se revisó una declaración del vendedor. Guardar cada decisión con la emisión y las huellas de la evidencia y de la respuesta, cuando corresponda. | Una respuesta modificada o un hallazgo con otra evidencia se reabre. Una reemisión con la misma evidencia conserva la revisión. Dos pantallas abiertas pueden detectar si alguien cambió la decisión. |
| 7 · Entrega revisada | Preparar un paquete con la revisión vigente. Registrar su huella y la del paquete. Mostrar si una entrega anterior quedó desfasada por sus fuentes, la emisión o una decisión de revisión. | Un paquete de revisión se rechaza si quedan hallazgos pendientes, si cambió la evidencia o si el expediente falla su comprobación. Cuando se conserva la emisión anterior, se indican las reglas que cambiaron desde ese envío. |
| 8 · Ensayo operativo | Comprobar en el navegador dos operaciones ficticias: una sale lista y otra espera una explicación o una corrección. Retomar la segunda, volver a emitir y preparar su entrega con la información actual. | El operador identifica el siguiente paso desde el expediente. El comprador verifica el paquete sin conexión y el cierre conserva el justificante. La prueba recorre también reinicio, actualización y devolución de un formulario desfasado. |

## Ejemplo de una operación

Una empresa comparte su cartera y el libro de facturas. El expediente guía al asesor hasta la primera emisión. Aparece un importe ganado sin factura y el asesor marca que necesita información. El vendedor aporta una explicación en Preguntas. El asesor puede confirmarla como declaración o incorporar una factura y volver a emitir con la evidencia actualizada. Si la factura cambia qué operaciones están conciliadas, el encargo vuelve a revisión y conserva las decisiones de los hallazgos con la misma evidencia.

Al preparar el paquete, el asesor comprueba los documentos elegidos y vincula la revisión al paquete mediante su huella. Si la revisión quedó desfasada mientras tenía el formulario abierto, el servidor le pide volver a cargar el expediente. El comprador conserva el paquete y puede contrastarlo con la huella recibida. El asesor puede saber después qué motivó una nueva entrega y conservar el acta al finalizar el encargo.

## Contrato de las pantallas

El expediente publica el último informe de equivalencia compatible con la captura de cierre vigente. Para incluirlo en el paquete, la pantalla envía su huella y la confirmación explícita de la revisión. La lista de corrección, la sal y los archivos originales se utilizan en el trabajo local.

El visor muestra si el paquete es coherente con su propia huella o si coincide además con la referencia recibida. Abre los documentos validados por el comprobador. En el cierre se muestra el número previsto de filas y su reparto antes de pedir el nombre y la huella del alcance. La API conserva la confirmación por nombre para las versiones instaladas de la pantalla.

El resumen y la revisión de decisiones pertenecen al expediente y a Hallazgos. El vendedor responde desde Preguntas. La revisión usa las reglas actuales y distingue una respuesta declarada de la observación del informe. El resumen consulta metadatos, emisiones y decisiones guardadas y devuelve las ocho decisiones más recientes. La API guarda las decisiones como filas privadas en el SQLite existente, cada una con su huella y la de la decisión anterior. El paquete conserva sus formatos anteriores y la ruta admite vincular una revisión cuando la pantalla confirme ese flujo.

Codex implementa y prueba los contratos de datos y servidor. Claude diseña la integración en las pantallas que ya existen. Los cambios de este plan se prueban con una operación ficticia, SQLite nuevo, red externa bloqueada y el inventario del servidor. La validación de la instalación final y el recorrido comercial mantienen sus propias condiciones.

**Estado del 24/11/2026.** Los cortes 1 a 7 cuentan con lógica y pruebas de servidor. El contrato del resumen, las decisiones y la entrega revisada se entregó a Claude por el tablón. El ensayo de la interfaz final corresponde al corte 8. [Primera entrega](../reports/CODEX-VERIFICA-MEGA-PLAN-4.md) · [Ampliación operativa](../reports/CODEX-VERIFICA-MP4-OPERACION.md)
