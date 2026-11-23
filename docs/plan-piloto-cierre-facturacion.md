# Plan B · Piloto de cierre de facturación

**Propuesta del 22/11/2026.** Empezar por empresas de mantenimiento de climatización B2B que llevan los partes en una herramienta y facturan en Holded. El comprador es la persona que cierra la facturación. El primer problema son los **trabajos adicionales aprobados fuera de la cuota de mantenimiento** que llegan tarde a facturación o se quedan fuera.

**Resultado que vendemos.** Antes de cerrar, administración sabe qué extras requieren atención, a quién le toca resolverlos y qué evidencia acredita que acabaron en una factura. El servicio usa las herramientas habituales del cliente.

## Cuánto cambia Plan B

| Alcance | Cambio | Qué implica |
| --- | --- | --- |
| Diagnóstico pagado | Ningún cambio de código | Cruzar exportaciones con administración, verificar discrepancias y entregar una lista de acciones. |
| Prototipo local | Cambio acotado | Una pantalla separada en el mismo repositorio, datos ficticios, dos archivos CSV y un motor de conciliación propio. Reutilizar la base visual y lógica genérica. |
| Producto comercial | Cambio importante | Un flujo completo de revisión, evidencia persistente, permisos, custodia de datos, lectura de fuentes y soporte del cierre. Hacerlo el producto principal también cambia la pantalla de inicio, el comprador y la oferta comercial. |

| Pieza actual | Uso en el piloto |
| --- | --- |
| CSV, tablas y fichas | Reutilizar `parseCsv` tras validar su comportamiento y las piezas visuales que admitan el nuevo flujo. Validar de forma explícita cabeceras, filas irregulares, comillas incompletas y tamaños. Convertir un Excel a CSV al preparar el piloto. El importador entero crea registros de CRM y está acoplado a sus entidades y límites. [Lector e importador](../shared/csv-import.ts) · [Pantalla de importación](../src/CsvImport.tsx) |
| Radar de compromisos | Aprovechar el diseño de la bandeja y el patrón de responsables, plazos y evidencias. El contrato y el montaje vigentes están ligados a una demostración ficticia. Los casos de facturación tendrán su propio modelo. [Radar](../src/CommitmentRadar.tsx) · [Modelo](../shared/commitments.ts) · [Montaje](../server/commitment-radar-mount.ts) |
| Relectura de resultados | Reutilizar el patrón de comprobar el destino después de que alguien actúe. La implementación actual verifica cambios de un portal HubSpot. Aquí se verifica la línea de factura mediante una segunda exportación. [Recuperación manual](../server/manual-recovery.ts) |
| Base local y protección | La aplicación actual guarda clientes, empresas, oportunidades y tareas. Los importes, las líneas de factura y sus relaciones necesitan un modelo propio. El experimento usa datos ficticios en una instancia separada. Para guardar datos reales hacen falta custodia y acceso aprobados. [Modelo CRM](../shared/model.ts) · [Protección local](../server/crypto.ts) |

El piloto puede convivir con la aplicación actual. La decisión sobre convertirlo en el producto principal llega con evidencia comercial, antes de plantear una migración.

## Fases y decisiones

| Fase | Entrega | Condición para avanzar |
| --- | --- | --- |
| 1. Revisar el proceso real | Con la empresa, recorrer su último cierre. Pedir una muestra minimizada de partes y líneas de factura, identificar cómo se acredita una aprobación y medir cuánto tarda la revisión habitual. | Hay una referencia común o un mapa que administración puede confirmar de forma repetible. Al menos una empresa acepta un diagnóstico de pago. |
| 2. Vender y ejecutar el diagnóstico | Revisar 60–90 días de extras. Entregar un expediente de discrepancias confirmadas, responsables y siguiente acción. Tras la corrección, pedir una segunda exportación y verificar la emisión. Probar **750 € por diagnóstico**. | Buscar tres diagnósticos pagados, el mismo procedimiento en al menos dos empresas y dos renovaciones a un precio que cubra el servicio. **500 €/mes** es la hipótesis para probar revisión semanal y cierre. |
| 3. Construir el módulo mínimo | Dos CSV, vista previa de cobertura, reglas de cruce, bandeja de casos y comprobación con el siguiente archivo. Probar primero con datos ficticios. Comparar con el cierre manual acordado. | Cero cierres incorrectos en el conjunto de prueba, todas sus discrepancias críticas detectadas y una reducción de tiempo verificable sin aumentar las revisiones manuales por falsos avisos. |
| 4. Automatizar y decidir | Verificar que los campos útiles se pueden leer con el acceso autorizado. Construir primero un conector de lectura para la fuente que más tiempo ahorre. Preparar permisos, almacenamiento y soporte según el uso observado. | La implantación se repite con mapeos sostenibles y la cuota deja margen tras horas de servicio y soporte. Si solo funciona como auditoría puntual, tratarlo como servicio y revisar la inversión en producto. |

Las fases 1 y 2 dependen de la disponibilidad de empresas y de sus cierres. Los precios y umbrales son objetivos de validación. Holded documenta la exportación de ventas por líneas y su API. La muestra debe confirmar qué columnas, referencias y estados están disponibles para ese cliente. [Exportación de facturas](https://help.holded.com/es/articles/6877413-gestionar-tus-facturas-de-venta) · [API de Holded](https://www.holded.com/es/desarrolladores/api-erp)

## Contrato de datos del primer prototipo

| Entrada | Mínimo necesario |
| --- | --- |
| Partes y aprobación | Empresa de trabajo, ID de parte e ID de extra cuando hay varios conceptos, fecha, referencia de cliente seudonimizada, importe neto, evidencia de aprobación y condición que lo hace facturable. La aprobación puede venir como columna o como referencia revisada por administración. |
| Líneas de factura | Empresa, ID de factura y de línea o referencia inequívoca, fecha, número, estado verificable, importe neto y referencia del parte o del extra. Para rectificativas, vínculo comprobable con el documento original cuando proceda. |
| Metadatos del lote | Fuente, periodo, fecha de exportación, filtros, filas recibidas y huella del archivo. Al verificar un caso se incluyen las facturas posteriores al cierre anterior y los periodos pertinentes. Una cobertura insuficiente se muestra como pendiente de comprobación. |

El primer alcance usa una empresa por ejecución y EUR. El motor compara importes netos en céntimos. Una coincidencia requiere una referencia validada dentro de la empresa. Si existe una asignación manual, se guarda quién la confirmó y con qué evidencia. Una factura puede agrupar extras si cada línea se puede atribuir. Las líneas ambiguas, duplicadas y rectificativas sin vínculo verificable pasan a revisión. Los borradores y las facturas anuladas quedan fuera del importe facturado. Si una factura parcial cubre 600 € de un extra de 1.240 €, quedan 640 € pendientes. La segunda exportación confirma número, estado, línea e importe aplicado. Si una rectificativa válida reduce el importe cubierto, se reabre el saldo con su historial. La reimportación del mismo archivo conserva el resultado y las decisiones existentes.

La pantalla muestra el periodo y la cobertura. La bandeja separa los extras listos sin factura, los bloqueados por falta de evidencia, los ambiguos y los ya verificados. La persona responsable emite o corrige en su herramienta de facturación. En desarrollo se trabajan exclusivamente datos ficticios. El diagnóstico comercial se realiza en el entorno que autorice el cliente, con datos mínimos y custodia acordada.

## Qué medir y cómo probarlo

- **Valor para el cliente.** Contar casos que administración confirma como omisiones, euros de esos casos que acaban efectivamente facturados y tiempo activo de revisión y corrección. El importe facturado y el cobrado se registran por separado cuando hay evidencia para ambos. Comparar el tiempo de Plan B con el procedimiento habitual para el mismo alcance.
- **Economía del servicio.** Registrar el tiempo de preparar archivos, corregir cruces, revisar casos y atender al cliente. Un diagnóstico puntual puede ser rentable por sí mismo. La suscripción requiere recurrencia y un coste de servicio que permita margen.
- **Prueba de extremo a extremo.** Usar dos lotes ficticios con un extra omitido, un trabajo incluido en la cuota, una factura mensual que no cubre el extra, una factura agrupada, una parcial, un borrador, una anulación o rectificativa, una referencia ausente y un duplicado. Reimportar el primer lote para probar que las decisiones persisten. Cargar el segundo y verificar que solo se cierra el extra realmente facturado. Una exportación parcial nunca puede dar por revisado todo el periodo.

## Primer paso

Preparar un CSV ficticio de partes y dos versiones del CSV de facturas, antes y después de resolver los casos. Acompañarlos con el resultado esperado para explicar el servicio en diez minutos. Usar la demostración para pedir una muestra de cierre y vender el primer diagnóstico. El primer componente que merecería implementación es el cruce de líneas con evidencia, una vez confirmadas las columnas y reglas que realmente usa administración.
