# Verifica · Ejecución y contrato del expediente

24/11/2026 · Europe/Madrid. Especificación de trabajo para el [Mega Plan 3 acordado en Claude Docs](https://claude.ai/artifact/JoivHHdAHkwVuWMu9LDAan). La petición de ejecutar el plan completo activa sus trabajos y conserva el orden y las condiciones de paso del documento. El canal compartido conserva la respuesta de Claude `c687a837-0094-40b7-968d-56afd9af5713`. En el repositorio se registran las reservas y sus entregas.

## Orden y criterios de salida

| Entrega | Situación | Qué acredita su cierre |
| --- | --- | --- |
| Corte 0 · Integridad | Implementado en local, presentado a revisión | Escritura fallida con todas las fuentes y actas anteriores intactas, también tras reabrir SQLite. Cambio concurrente de fuente rechazado con `409`, sin alterar la emisión anterior. Paridad de huellas y reproducción. |
| Diagnóstico adelantado de escala | Ejecutado, presentado a revisión | Pyme y caso próximo al límite reabren con la misma huella. Caso por encima rechazado sin guardar datos. Quedan medidos datos, tiempos, memoria y límite efectivo de ambos caminos. |
| Mega Plan 2, D4 · Vigilancia | Montado en el servidor y la pantalla. Recorrido verificado con fuentes ficticias | Seguir un encargo desde la firma con su captura base, ejecutar una captura programada y tratar retención y ausencia. El informe de la misma secuencia da las mismas huellas desde pantalla y script. |
| Mega Plan 2, D5 · Migración | Comparación desde la pantalla. Con vigilancia en el encargo, usa en el servidor su última captura, su parte y su sal; se bloquea si la última está retenida hasta aceptar su huella. Selección manual como alternativa | Desde el encargo y con mapa confirmado, comparar la captura de cierre y el destino. Una entrada incompleta se declara como tal. El informe coincide con el del script. |
| Mega Plan 2, E · Copia de trabajo | Navegación y selector de portada probados en una candidata local | Verifica es la entrada de la instalación completa y el CRM congelado es accesible como Copia de trabajo. En la candidata aislada se comprobó el recorrido en móvil y escritorio. Falta verificar la instalación final y cerrar los demás prerrequisitos antes de declarar la fase 0. |
| Fase B · Fuentes | Pendiente de evidencia externa | Lectura autorizada de una cuenta de pruebas de HubSpot con historial completo, recuentos que cuadran y al menos un cambio conocido de importe y fecha observado. Libro de ventas exportado desde Holded con cabeceras comprobadas, importe de base e IVA distinguidos y línea sin referencia tratada como posible o sin comprobar. Registrar formato, recuentos y huellas. Los archivos reales se conservan en su entorno autorizado. |
| Fase 1 · Expediente | Contrato preparado. Montaje tras Mega Plan 2 y fase B | Línea de tiempo dentro de Operación. Exportación del comprador verificable sin conexión. Detección de una modificación, inserción, eliminación y reordenación. Las vistas existentes se alimentan del mismo expediente. |
| Fase 1 · Cierre y borrado | Contrato preparado. Montaje tras Mega Plan 2 y fase B | Confirmación explícita y registro de alcance. Pruebas de fallo y reintento. Tras el cierre, queda el acta mínima y un recuento verificable de filas eliminadas del almacén controlado. |
| Fase 2 · Robustez | Diagnóstico realizado. Implementación posterior a la puerta | Un límite coherente de captura en ambos caminos, controles por encima de los límites y estado interrumpido después de reiniciar. Medir lista y ficha tras cambiar cómo leen metadatos. |
| Fase 3 · Preguntas y comparación | Pendiente de expediente y versión de las emisiones | Preguntas fijas con referencias seudónimas. La respuesta se registra como declaración y conserva la evidencia observada. Una comparación muestra el cambio, la procedencia y las carencias que siguen abiertas. |
| Fase 4 · Primeros 100 días | Tras la primera venta | Llevar el resultado de migración a la Copia de trabajo. Cada tarea creada enlaza el hallazgo y el eslabón que la justifica, con un recorrido comercial real que acredite su utilidad. |

[Corte 0](../reports/CODEX-VERIFICA-INTEGRIDAD-0.md) · [Reapertura de SQLite](../reports/CODEX-VERIFICA-REAPERTURA-3.md) · [Medición](../reports/CODEX-VERIFICA-ESCALA-3.md) · [Vigilancia](../reports/CODEX-VERIFICA-D4-INTEGRACION.md) · [Migración](../reports/CODEX-VERIFICA-D5-MIGRACION.md) · [Copia de trabajo](../reports/CODEX-VERIFICA-E-PRODUCTO.md)

### Continuación del 24/11/2026

La pantalla de D4 ya fija la captura de firma y su acta del mismo encargo. El registro de Verifica monta un único temporizador y lo detiene antes de cerrar SQLite. En Chrome se comprobaron la semana sin captura, la activación, la retención, la aceptación explícita, la pausa y la apertura del parte. El inventario canónico sigue pendiente de regenerar bajo su reserva. D5 ya enlaza la captura de cierre de la vigilancia. Por decisión de la usuaria (24/11/2026), si la última captura está retenida, la comparación se para con `409` hasta que las partes acepten su huella. No se sustituye por la última aceptada, así que el parte y sus huellas no cambian.

Para la fase B ya está identificado en el contexto el portal personal de pruebas. Falta la credencial de lectura configurada en su entorno local y un CSV anonimizado de Holded que conserve las cabeceras del libro de facturas emitidas. Se registrarán recuentos, correspondencia de columnas y huellas, manteniendo las fuentes en el entorno autorizado. El montaje de las fases 1 a 3 empieza tras cerrar esos prerrequisitos. La fase 4 se contrasta con la primera venta.

## Formato propuesto para implementar

### Cadena privada

- `verifica-expediente-v1`, con identificador opaco de encargo, una secuencia creciente desde 1 y una sola cabeza vigente. Cada entrada contiene versión, secuencia, instante UTC de registro, tipo de evento, huella anterior y referencias tipadas a los documentos. La primera tiene `previous: null`.
- La huella de la entrada se calcula con `fingerprintOf` sobre sus campos canónicos, con el identificador del encargo incluido. Los tipos, campos y normalización se fijan por versión. La hora sirve para mostrar la secuencia al operador. El número de entrada determina el orden, incluso si el reloj retrocede.
- Los eventos disponibles son autorización, lectura con acta y captura, fuente incorporada o retirada, informe con custodia, parte de vigilancia, informe de equivalencia, respuesta declarada y cierre. Cada evento referencia el artefacto exacto o el estado anterior que reemplaza. Los documentos siguen en el almacenamiento de su módulo y conservan su formato. La cadena evita duplicar el contenido.
- La escritura del evento y la de sus documentos se hacen en la misma transacción. La secuencia se asigna en el momento de confirmar, leyendo la cabeza vigente. Si falla, se conservan la cabeza y los documentos anteriores. La comparación entre emisiones necesita retener versiones por huella dentro del encargo, con su política de borrado.

### Huellas de documentos

| Referencia | Método | Qué se comprueba |
| --- | --- | --- |
| PDF de autorización y captura citada por el acta | `sha256-bytes-v1` | El fichero firmado o el texto UTF-8 exacto de la captura coincide con lo registrado. |
| Fuentes vistas por sala limpia, informe, custodia, parte y equivalencia | Huella canónica por tipo y versión | Se usan las funciones vigentes de cada formato. En informes y actas se excluye de su propio cálculo el campo que contiene la huella. |
| Entrada del expediente o paquete | `sha256-canonical-v1` | El manifiesto reconstruye la huella a partir del contenido canónico de la entrada y su anterior. |

La huella de los bytes de la captura en el acta y la huella de la captura normalizada en el informe son referencias distintas. Durante el guardado de una lectura se registran las dos, con sus métodos. La equivalencia ya declara huellas de captura de cierre, mapa y destino. Se enlazan con su método original. Se conservan los verificadores anteriores para documentos ya emitidos.

### Paquete del comprador

- `verifica-paquete-comprador-v1`. Solo contiene informes, partes y equivalencias autorizados para entrega. Se construye por selección explícita y reutiliza las comprobaciones de salida de cada formato. Los nombres libres de operadores y confirmantes se revisan o se excluye ese documento de la entrega. La publicidad de un tipo de documento no convierte en públicos sus valores.
- El manifiesto usa una cadena propia sobre los artefactos que el comprador recibe. Va en el mismo archivo y reutiliza el visor sin conexión. Las huellas privadas que un informe ya cita sirven de referencia. El visor distingue una referencia declarada y un documento cuya huella se ha recalculado con el contenido disponible.
- Una huella final comunicada por el canal acordado permite verificar integridad respecto al paquete entregado. Sin ese valor externo se muestra «coherente internamente». Un paquete rehecho por completo puede ser internamente coherente. En el visor, identificar el primer documento o enlace que falla y distinguir un formato no soportado de un archivo retocado.
- El paquete excluye PDF y JSON de autorización, actas completas, nombres de archivos aportados, fuentes sin tratar, claves y copia custodiada. El acta de borrado se comparte solo si hay una versión aprobada para ese destinatario. Toda exportación aplica la barrera de salida y los controles de esquema. No lleva URLs de descarga, rutas locales ni identificadores del CRM.

## Cierre, retención y robustez

El plazo se configura por encargo a partir del contrato. El sistema pide confirmar el nombre y presenta el alcance antes de ejecutar el borrado. Los trabajos activos se bloquean o se cancelan y se confirma su finalización antes de tocar fuentes. La transacción registra la huella del inventario afectado, elimina las filas del encargo dentro del alcance, comprueba por consultas lo eliminado y registra el acta de resultado en el mismo commit. Una falla revierte el conjunto y permite reintentar. La huella y los recuentos del acta se mantienen con la mínima información para vincularla al expediente. El acta distingue copias externas, excepciones y archivos que ese almacén no controla.

El diagnóstico abre la discusión sobre el máximo común en bytes y la persistencia de huellas y recuentos para la ficha. El lector conserva sus límites de páginas y registros. El almacenamiento aplica además su peso máximo antes de escribir. Una lectura con estado persistido que encuentre a su propietario cerrado pasa a interrumpida y se repite con credencial presente. La detección de una lectura huérfana comprueba la titularidad del proceso antes de reclasificarla. Los reintentos empiezan desde el principio y conservan el último resultado completado.

## Pruebas de aceptación

1. Reproducir el caso sintético desde pantalla y script, enlazar autorización, lectura e informe y abrir el paquete con red bloqueada. Para cada documento se recalcula el método correspondiente.
2. Alterar un byte del archivo del acta, un dato del informe, un enlace, la secuencia y el último elemento del paquete. El visor distingue los cambios internos de la sustitución o truncamiento detectados mediante la huella de referencia externa.
3. Incluir valores ficticios con nombres, correos, NIF y referencias que solo existen en fuentes y actas. Verificar en el archivo generado que esos contenidos quedan fuera y que se bloquea una salida que los incluya.
4. Abrir y cerrar el mismo encargo en paralelo. Un cierre autorizado trabaja sobre un inventario coherente y no deja captura, nuevo informe, huella o acta a medias si falla. El almacén de otro encargo se conserva. Acreditar el resultado también después de reabrir SQLite.
5. Medir un caso pyme, varios cerca de los límites y un exceso por registros, páginas y bytes. Ejercitar las entradas directa y desde archivo, e informar de las capacidades de ambos caminos con sus límites por separado.
6. Responder una pregunta y volver a emitir. Comparar los informes por regla y procedencia. Las observaciones se mantienen con su base y la declaración se vincula a su respuesta. La lista posterior al cierre queda deshabilitada hasta que se cumpla su condición comercial.
