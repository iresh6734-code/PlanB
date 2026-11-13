# Simulacro técnico · validez del informe (201)

5/11/2026, 16:57:19, Europe/Madrid. Entrega presentada para revisión independiente. El diagnóstico de Continuidad y el HTML descargable validan la estructura del informe y las cinco comprobaciones concretas que produce el proceso técnico.

## Problema y resultado

El diagnóstico anterior aceptaba cinco copias de una comprobación y un informe que terminaba antes de empezar. El HTML también podía mostrar nombre y recuentos de una captura ajena si recibía un resumen incorrecto. Las tres reproducciones fallan con el código anterior por aserción y pasan con la corrección. La tercera acredita el fallo de la función al recibir una captura ajena. La ruta existente normalmente busca la captura por el identificador del informe.

El diagnóstico conserva el informe más reciente de la captura aunque falle y muestra el motivo. La edad conserva el límite de 30 días. Los informes del proceso anterior con sus cinco etiquetas canónicas siguen siendo legibles, independientemente del orden. Un entorno ausente se muestra como «Entorno no indicado». Un informe con captura ausente conserva su resultado histórico y omite los recuentos. Si hay una captura incompatible, el HTML identifica la discrepancia y omite sus datos.

El HTML muestra el motivo antes de la lista de comprobaciones registradas. A 320 px, la primera versión dejaba una tabla de tres columnas fuera del documento, con ancho real de 362 px. Una primera corrección ajustó el ancho a costa de partir palabras. La versión final presenta las comprobaciones como lista y mide 320 px de ancho. Se abrió e inspeccionó la captura final.

## Comprobaciones

- Corte privado `tests/.tmp/d201-6363c085`. **18/18** en una pasada serial, 12 pruebas de esta unidad y 6 preexistentes de readiness. Typecheck focal sin errores. Se ajustaron únicamente las etiquetas del fixture de readiness para usar el contrato real del worker. Sus aserciones se conservaron.
- Las tres contrapruebas del defecto original dieron **0/3** con las fuentes anteriores y **3/3** al restaurar la corrección. Son casos de sensibilidad que se solapan con las regresiones de la suite, por lo que se registran aparte.
- Las rutas reales GET de Fastify, con inyección y Store en memoria, devuelven diagnóstico fallido y HTML con motivo para el informe repetido, HTML histórico correcto para el informe anterior, y conservan el historial y 0 cambios CRM.
- Se compiló el worker real con esbuild en la carpeta aislada. El proceso emitió las cinco etiquetas exactas, la lectura y el HTML aceptaron el informe, la carpeta de ensayo quedó vacía y el PID propio se comprobó ausente. Usó datos ficticios y una clave de prueba creada antes de abrir su Store de disco.
- Chromium propio cargó el HTML estático a 320 px. La causa aparece antes de las comprobaciones registradas. La captura `report-duplicate-320.png` se inspeccionó visualmente. Se registraron cero solicitudes y cero errores o avisos de consola. Contexto y navegador cerrados.

El manifiesto conserva 163 huellas del corte y de las seis fuentes de producto y pruebas reservadas. Los logs `baseline-three-regressions.log`, `corrected-three-regressions.log`, `final18.log` y `typecheck.log`, el resultado del worker y `html-result.json` están en el corte indicado. Las fuentes anteriores del baseline se preservan.

## Alcance

La validación se aplica al diagnóstico y al HTML. La descarga JSON conserva las declaraciones originales del historial. La identificación de una captura sigue ligada al ID y, cuando ambos lo indican, al entorno. Una comprobación técnica de esta clase mide la ejecución de su proceso, sin aportar una medición del tiempo de recuperación de negocio ni autenticación del origen. La copia visible 193 corresponde a una entrega anterior. El montaje de una nueva copia requiere su propia verificación después del dictamen.

Se conservaron las reservas de Store, Recovery, Continuity, el registro central, la App y las dos sesiones de Claude. Pruebas con fuentes locales, fixtures, red externa bloqueada y sin bases existentes.
