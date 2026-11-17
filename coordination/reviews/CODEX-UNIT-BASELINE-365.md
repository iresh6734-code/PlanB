# La batería confirma las correcciones de relevo y evidencia

15/11/2026, Europe/Madrid. npm test en una carpeta nueva con 265 archivos de prueba y 877 archivos con huella. Frente al corte 362 cambiaron exclusivamente las dos suites objetivo dentro del conjunto de fuentes. La copia histórica H9a recibió model.ts y package.json, además de change-history.ts. Se cotejaron los activos históricos del binario con su manifiesto. El proceso empezó con NODE_ENV=production, red exterior bloqueada y datos ficticios.

**Resultado**. 3.037 pruebas, 3.017 correctas, 15 fallos, 1 omitida, 4 TODO y 0 canceladas. Código 1. La ejecución anterior registró 22 fallos. Los 15 restantes coinciden por archivo y nombre exactos con el manifiesto de CI congelado y fallaron también en 362.

Pasaron los cuatro casos de relevo corregidos, el montaje de evidencia del generador y el contrato portátil que sustituyó la expectativa 404. H9a pasó dentro de esta batería con la referencia completa. También pasaron los tres casos de integridad de cápsulas que figuran como inestables en el manifiesto.

**Pendiente en la CI**. Ocho entradas conocidas corresponden a casos observados en verde en esta ejecución, y la novena es el nombre anterior del contrato portátil sustituido. Listado exacto en classified.json. El manifiesto sigue reservado por Claude y debe conciliarse en su próxima presentación. Cada fallo restante conserva su responsable.

Banco tests/.tmp/unit-full365-GbMxYz. npm-test.log contiene la salida original, inputs.json las huellas y completion.json el código terminal. Resultados de la copia de ensayo, sin verificación del piloto o cambios de producto este corte.

## Fallos restantes

- tests/date-check-decision-independent-339.test.ts · 339 · el ID de alternativa debe corresponder a las ofertas exactas de la decisión
- tests/date-check-decision-independent-339.test.ts · 339 · un acta de otra solicitud no sustituye el acta de la instalación revisada
- tests/date-check-decision-independent-339.test.ts · 339 · una terminación observada sin fecha ofrecida no acredita incumplimiento
- tests/date-check-decision-independent-339.test.ts · 339 · una proyección no probada conserva el retraso observado sin dar por acreditada su atribución
- tests/independent-continuity-lab.test.ts · 099 new capture must not collide with an already present foreign evidence generation
- tests/independent-continuity-lab.test.ts · 099 valid opaque IDs with a large numeric suffix must still produce a different capture identity
- tests/independent-interface-contexts.test.ts · G6 AUTH_PARENT072 corregido: el done que App entrega a Protection espera refresh() antes de abrir y devuelve su promesa
- tests/independent-task-focus-123.test.ts · observation F1: after a lost acknowledgement the verification can read a different installation and call its matching value applied
- tests/independent-task-focus-123.test.ts · observation F2: a new capture sharing its old ID but not its date is treated as the same context and can be edited
- tests/operational-date-check-independent-337.test.ts · 337 · una instalación de 35 minutos no cabe en una ventana de 30 aunque la fecha pedida sea posterior
- tests/operational-date-check-independent-337.test.ts · 337 · la baja de un técnico no puede conservar dos protecciones que exigen 140 minutos con 120 de capacidad
- tests/operational-date-check-independent-337.test.ts · 337 · cancelar después de las alternativas impide certificar la matriz de escenarios
- tests/task-intent-consumer-independent-322.test.ts · 322 · abortar dentro de onDispatch impide el POST, el escritor y el historial
- tests/task-intent-consumer-independent-322.test.ts · 322 · un 401 real tras vencer la consulta anterior no bloquea la sesión nueva
- tests/task-intent-consumer-independent-322.test.ts · 322 · el adaptador no verifica una tarea con el intento válido de otra
