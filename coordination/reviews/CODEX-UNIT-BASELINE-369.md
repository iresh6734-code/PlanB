# La batería valida ficha, captura y cancelación

15/11/2026, Europe/Madrid. npm test en una carpeta nueva con 267 archivos de prueba y 880 archivos con huella. Misma referencia histórica y binario de ensayo que 365. Entorno inicial NODE_ENV=production, red exterior bloqueada y bases ficticias. Se reutilizaron módulos instalados mediante junction.

**Resultado.** 3.043 pruebas, 3.025 correctas, 13 fallos, 1 omitida, 4 TODO y 0 canceladas. Código 1, 13 min 46 s medidos por Node. Los 13 fallos coinciden por archivo y nombre con 365 y con el manifiesto congelado. Pasaron las dos regresiones de la ficha, las dos de persistencia de captura y los cuatro casos de la cola. El aumento de seis pruebas corresponde a captura y cola. Los dos nombres observacionales de 365 ya tienen regresiones nuevas ejecutadas en verde.

**Contexto de la comparación.** Se usó una copia del estado actual, que incorpora también las rutas del iniciador Windows y el aviso móvil que aparecieron en paralelo. npm test carga la selección de archivos TypeScript y no ejecutó el archivo .test.mjs del iniciador ni el aspecto visual de TopBar. La relación completa de cambios respecto de 365 figura en inputs.json.

**Seguimiento de CI.** Hay 11 entradas del manifiesto sin fallo observado. Ocho corresponden a casos ejecutados en verde y tres son nombres históricos sustituidos, el del portátil y dos de la ficha. Los 13 restantes conservan sus reservas y causas. El manifiesto sigue en manos de Opus. El encargo actualizado está en coordination/briefs/CLAUDE-OPUS-R2-CI-CACHE-API-369.md, preparado para el usuario.

Banco tests/.tmp/unit-full369-wqISvG. Incluye clasificación y salida originales. No se verificó el runtime instalado.

## Fallos restantes

- tests/date-check-decision-independent-339.test.ts · 339 · el ID de alternativa debe corresponder a las ofertas exactas de la decisión
- tests/date-check-decision-independent-339.test.ts · 339 · un acta de otra solicitud no sustituye el acta de la instalación revisada
- tests/date-check-decision-independent-339.test.ts · 339 · una terminación observada sin fecha ofrecida no acredita incumplimiento
- tests/date-check-decision-independent-339.test.ts · 339 · una proyección no probada conserva el retraso observado sin dar por acreditada su atribución
- tests/independent-continuity-lab.test.ts · 099 new capture must not collide with an already present foreign evidence generation
- tests/independent-continuity-lab.test.ts · 099 valid opaque IDs with a large numeric suffix must still produce a different capture identity
- tests/independent-interface-contexts.test.ts · G6 AUTH_PARENT072 corregido: el done que App entrega a Protection espera refresh() antes de abrir y devuelve su promesa
- tests/operational-date-check-independent-337.test.ts · 337 · una instalación de 35 minutos no cabe en una ventana de 30 aunque la fecha pedida sea posterior
- tests/operational-date-check-independent-337.test.ts · 337 · la baja de un técnico no puede conservar dos protecciones que exigen 140 minutos con 120 de capacidad
- tests/operational-date-check-independent-337.test.ts · 337 · cancelar después de las alternativas impide certificar la matriz de escenarios
- tests/task-intent-consumer-independent-322.test.ts · 322 · abortar dentro de onDispatch impide el POST, el escritor y el historial
- tests/task-intent-consumer-independent-322.test.ts · 322 · un 401 real tras vencer la consulta anterior no bloquea la sesión nueva
- tests/task-intent-consumer-independent-322.test.ts · 322 · el adaptador no verifica una tarea con el intento válido de otra
