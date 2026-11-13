# 297 · Diario local de lecturas de fuentes

8/11/2026, Europe/Madrid. Módulo de persistencia interno, independiente de SourceStatus en corrección. No lee un proveedor, registra autorización, guarda credenciales, crea cuentas, monta API/UI o cambia App/main. Tampoco es el diario de guardados A4 ni habilita cobertura de recuperación.

Una lectura SourceReading aceptada se conserva completa, incluso partial/unavailable, sin cambiar startedAt/completedAt, condición, cuenta o causa. Un recibo indica persistencia local y fecha de guardado: no es acuse del proveedor, autorización humana ni prueba de conexión. El futuro anfitrión debe autorizar la escritura/lectura del diario y comprobar la procedencia; un objeto válido no autentica quién lo produjo.

`readSourceReadingJournal(store)` es solo lectura. Ausencia válida devuelve historial vacío, revisión null y procedencia memory-only/durable. Metadatos corruptos, de otra instalación o ilegibles quedan indisponibles sin reparación, borrado o siembra. `appendSourceReading(store,{expectedRevision,reading},clock)` es la única operación de escritura. Compara la revisión observada bajo BEGIN IMMEDIATE y exige un conflicto explícito ante otro escritor. Repetir una lectura exactamente igual devuelve su recibo original sin escribir ni rejuvenecer fechas, aunque el head haya avanzado. No ofrece pruning automático.

Se conservan hasta32recibos,512KiB por lectura y2MiB de estado en claro. Alcanzar un límite rechaza el alta completa y conserva lo anterior; no convierte un historial recortado en completo. El estado vive en una clave meta fija y usa el cifrado existente de Store de archivo. Store en memoria no está cifrado y se identifica como tal. Las fuentes pueden incluir etiquetas sensibles: este módulo no las publica ni añade una ruta HTTP, y no acepta campos de credencial fuera del esquema.

Al leer una conexión de archivo ya abierta, se rechaza una fila sin prefijo cifrado. La migración general de datos heredados que Store realiza al abrir la base es anterior a este módulo y no cambia aquí; el diario no acredita cómo estaba protegido un archivo antes de esa apertura.

Cada recibo lleva secuencia, hash de la lectura normalizada y enlace al recibo anterior. Se comprueban identidad de instalación, secuencias, fechas y enlaces al leer. SHA detecta incoherencias de contenido, no firma autoría ni hace el archivo inviolable. Una copia antigua válida o la eliminación de un sufijo con estado coherente no son detectables sin un ancla externa; no se promete inmutabilidad ni recuperación íntegra frente a restauración externa. El orden es el de persistencia, no una elección automática de la lectura más reciente del proveedor.

Un error durante la escritura puede dejar acuse incierto: el llamador debe releer/reintentar el mismo contenido para conciliar; no interpretarlo como «no guardado». Nunca se borra la evidencia para resolverlo. No hay esperas de red dentro de la transacción. La función de reloj es local y debe ser pura; se revalida identidad/head antes de escribir.

Próxima unidad, tras revisión: registro de fuentes/consentimiento y API local bajo reservas propias, usando SourceStatus solo cuando esté aceptada. La primera candidata usará proveedores ficticios identificados. Las cuentas reales siguen fuera del alcance de este diario.
