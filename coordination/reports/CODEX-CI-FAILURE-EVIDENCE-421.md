# 421 · Evidencia completa de los eventos fallidos de la CI

El informe humano de node:test puede omitir padres de su sección final y enumerar hijos cancelados junto a fallos. Esto produjo 19 filas frente a 17 fallos y 3 cancelaciones en 414. La CI ya tenía un reportero estructurado; ahora conserva su evidencia de fallos en report.json, además de las pasadas usadas para comparar conocidos.

## Cambio

resultsReporter registra failureType de cada evento, sin copiar mensajes, pila u otros datos del error. parseResults mantiene su conjunto passed y añade failedEvents: archivo normalizado, nombre, profundidad y motivo (o null cuando no consta). Los eventos omitidos o pendientes no entran en estas listas de resultados ejecutados. No se hereda el archivo de un evento anterior ni se confunden nombres iguales de archivos distintos.

run.mjs incorpora failedEvents en steps.unit y muestra cancelled en su línea de resumen. Los eventos son evidencia de diagnóstico: no sustituyen los contadores nativos ni el comparador de conocidos. Se mantienen unitOutputBroken, compareFailures y los criterios de salida. Una cancelación sigue haciendo fallar la CI.

## Verificación

- Recorrido real de la CLI con seis nodos: una pasada, dos fallos, una cancelación, una omitida y una pendiente. El informe conserva los tres eventos fallidos: aserción, hija con cancelledByParent y padre con testCodeFailure. La salida y report.json coinciden en una cancelación; código 1, esperado por el fixture.
- Lectura de formatos anteriores sin failureType, homónimos en archivos distintos, archivo ausente, omisiones/pendientes y línea JSON incompleta. Las pasadas conservan su contrato.
- Reportero con error canario: conserva el motivo y no copia mensaje o pila.
- Las tres regresiones pasan con la mejora y fallan las tres en una copia con ambos módulos anteriores. baseline2.log es el control causal válido. El primer control de copia no tenía el enlace a dependencias y no se usa como evidencia; se creó el enlace a las dependencias existentes, sin instalar paquetes, antes del control final.
- Suites relacionadas completas: 23/23, código 0. Incluyen cierre de procesos nietos en Windows, variables permitidas, argumentos, conocidos resueltos y omisiones con nombres iguales. Los chequeos de sintaxis de ambos módulos pasan.

## Límites e intentos de preparación

El primer fixture dejó una promesa pendiente que el cargador mantenía viva y agotó el límite del ensayo. Otro intento con AbortSignal ya cancelada se contó como fallo, no como cancelación nativa. La versión final hace fallar explícitamente al padre con una hija pendiente: produce cancelledByParent de forma determinista, sin cambiar los tiempos de las aserciones. Los registros de esos intentos se conservan y no se atribuyen a defectos del producto.

Los eventos con motivo desconocido se conservan con null; no se inventa una categoría. El diagnóstico añadido no cambia los criterios de aceptación ni reconstruye los eventos ausentes de ejecuciones históricas. No se repite la batería global 414, no se despliega la app y no se editan fuentes reservadas a Claude.

Banco: D:\AI\Plan-B-CRM-v2.1\source\tests\.tmp\ci421-0919a435d4cf494faa38866c75529d81. after2.log registra 3/3; related.log 23/23; baseline2.log 0/3; tested-pins.json fija los tres archivos. Chequeo completo tsc --noEmit -p tsconfig.json terminado con código 0 (types.exit y types.log). Las tres huellas siguen coincidiendo al cerrar.


