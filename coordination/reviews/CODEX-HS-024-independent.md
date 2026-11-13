# Revisión independiente CODEX-HS-024

29/10/2026, Europe/Madrid. Revisor Codex review_h2, distinto del autor. **Aceptar** normalización y orden temporal de la muestra tras revisión, comprobaciones independientes y cotejo de hashes. Solo se escribe este informe; sin código/pruebas del autor editados, proveedores/autenticación, datos reales, secretos o nuevas fuentes aClaude. El coordinador mantiene contexto/panel en su reserva vigente.

## Alcance y parser

Los enteros Unix se interpretan exclusivamente como milisegundos, sin adivinar segundos. Número y texto decimal deben ser enteros seguros y pasar el rango de Date. ISO admite año4dígitos, segundos, hasta3fracciones y zona explícitaZ/offset; comprueba mes/día/bisiesto/hora/minuto/segundo y componentes de offset antes de Date.parse. Rechaza horas locales y fechas que Date.parse podría desplazar silenciosamente. No pretende cubrir todas las variantesISO8601 ni imponer antigüedad/futuro comercial.

Tras normalizar, el comparador usa el instante, coloca null al final y devuelve0 en empate o dos desconocidos, conservando el orden de selección con sortestable. Date.parse de valores canónicos soporta también los años extendidos producidos por Unix extremos. El comparador es interno y presupone salida ya normalizada. No hay otra política de selección o datoscapturados.

Se reconstruyó el baselineOAuth solo en memoria retirando el import del helper, normalización de at y comparador; SHA25628d6d166e85e78850cc7bde3a22b3c20a0e891c4e4ff60f7655eefea06337c20 coincide exactamente con el baseline deltablón. No se alteró el archivo para compararlo. Esto confirma que cuotas,GET,deadline,retry429,identidad yresto del flujo permanecen intactos.

## Evidencia independiente

Ejecutado por este revisor:

    node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-context-dates.test.ts

**6/6 correctas** con PGlite separado y transporte sintético/redbloqueada: offsetscronológicamenteinvertidos, ISO/Unixequivalentes, valoresinválidos, empate/desconocidos, fracción/bisiesto/epochnegativo yvencimientofuturo/cupoconservado.

Arnésporstdin adicional sobre helperreal: doce inválidos rechazados (bisiestos1900/2100,mes/día0,abril31,minuto/segundo60,offset24h/60min,NaN/Infinity/rangonegativo), cinco válidos (bisiesto2000,años0000/0099,ambosextremosDate) yordenextremos condesconocidosestables correctos. El arnés no añadió archivos ni red. No se hicieron mutaciones adicionales: reconstrucciónbaseline ycasosadversariales ya acotan el riesgo del cambio.

Las75/75afectadas ytypecheck correctos, así como5fallos/1control contra el baseline, son evidencia del autor y no se presentan como repetidos por este revisor. El informe conserva esa atribución.

## Límites y decisión

La representación at:string|null se conserva, pero ahora los instantes válidos son canónicosUTC. Kindtasks ysu fecha de vencimiento no se convierten en prueba de interacciónocurrida; etiquetaUI/zona se trata enotraunidad. Recencia global, paginación yactividadesfuera deIDsseleccionados siguen sin resolver. No hay APIreal, UI/QAvisual, despliegue oampliación descopes/allowlist. Los tests no sustituyen contratos remotos. Sin problemasmateriales restantes dentro del alcance.

## Versiones aceptadas

- server/team/oauth.ts: f7d3131c1c3c51a07978eaccfc05417e7a2679cce3f3bb8a07465e1ebc15be24
- server/team/hubspot-activity-time.ts: 934d6beba50142112ee1b184cc460cf4957eadeba87b7135078214ab7370e4fe
- tests/hubspot-context-dates.test.ts: 8bde8c025dd002d2a162d82a805b9ead806ef798654397690d5058e3aa27a433
- coordination/reports/CODEX-HS-024.md: 2c53207f42b4c1a4504fa292fe730577c62c9ff16feb91720d0be0fbf4c1cc9e

Los cuatro hashes coinciden con la presentación vigente. CODEX-HS-024 aceptada por revisor distinto del autor. Este propio informe se presenta para revisión del coordinador sin autoaceptarlo.
