# Comprobar una fecha · Revisión de la pantalla 338

13 de noviembre de 2026, Europe/Madrid. Dictamen independiente de FLOW. El componente, el cliente y el montaje de Fastify se ejecutaron con los archivos presentados. El banco usa el CORE histórico de la entrega, mientras la corrección 337 sigue en manos de Opus.

| Caso | Evidencia recibida | Texto de la pantalla |
| --- | --- | --- |
| F1 · Motivo equivocado | Solicitud real de ensayo de 49 horas más 30 min de viaje, sin materiales. El servidor informa que no cabe en el horizonte y ninguna alternativa rompe una protección. | «No se puede prometer esa fecha sin mover una fecha protegida». |
| F2 · Cálculo incompleto | Respuesta controlada válida según el contrato: `misses`, clasificación `incomplete`, fecha sin probar y búsqueda incompleta. | «Ninguna en la semana». Afirma ausencia de una fecha aunque la búsqueda siga sin resolverla. |
| F3 · Protección sin determinar | Respuesta controlada válida: una celda tiene resultado desconocido y protección nula. Una segunda tiene incumplimiento y protección rota. | La primera muestra solo «Sin determinar». Falta indicar que tampoco se pudo comprobar si se conservan las protecciones. La segunda sí muestra «rompe una protección». |

`flow338-original-6U7vXJ` pasó 0/3 en navegador, con los tres fallos previstos. `flow338-causal-11X6gX` pasó 3/3. Ambos bancos pasaron 8/8 pruebas de servidor y TypeScript limpio, con 387 entradas cotejadas. La variante ajusta el texto del resumen al motivo acreditado, diferencia ausencia comprobada de fecha y búsqueda incompleta, e identifica la protección sin determinar. Se restauró y verificó la fuente causal. El primer ensayo tenía un localizador de Material demasiado estricto, corregido antes del pase definitivo.

Chromium ejecutó el componente real en el anfitrión mínimo de FLOW. Playwright interceptó las peticiones del navegador y las pasó al servidor Fastify real mediante `inject`, con SQLite en memoria y datos ficticios. Solo las respuestas de F2/F3 se modificaron en el puente. Cada caso comprobó cero cambios de negocio, cero registros de comprobaciones y un único POST de análisis. Se inspeccionó la captura causal de capacidad. El E2E histórico con proceso HTTP propio se intentó en un banco separado y el navegador recibió `ERR_NETWORK_ACCESS_DENIED` en loopback. Su recorrido de reinicio queda fuera de la evidencia de navegador de este dictamen.

R2 debe tomar el motivo del resultado y tratar el cálculo parcial antes de afirmar un rechazo. Si un plan testigo válido ya existe, debe distinguirse de la prueba de que no hay una fecha anterior. Cuando una celda no se evalúa, separar fecha sin determinar, protección sin determinar y protección efectivamente rota. Conservar el caso base Almacén Sur y repetir 337/338 juntos tras corregir CORE. No se editó la pantalla de Claude ni la instalación.
