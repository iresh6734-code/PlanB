# Batería npm test con entorno de producción heredado

14/11/2026, Europe/Madrid. Ejecuté la orden npm test de la entrega 361 sobre 877 archivos congelados, incluidas las 265 suites de primer nivel. Nodo 24.14.0, entorno inicial NODE_ENV=production, datos ficticios nuevos, bloqueo de red exterior y los módulos ya instalados mediante junction. Se copiaron solo los activos necesarios del binario histórico 342 y las fuentes de referencia de QA075. Sin usar el piloto instalado.

## Resultado

**3.037 pruebas, 3.010 correctas, 22 fallos, 1 omitida, 4 TODO y ninguna cancelada.** Código 1, 14 min 34 s según Node. Veintiún fallos coinciden por archivo y nombre con el manifiesto anterior de CI. Los tres recibos de puerto 343, el reinicio binario 342, ambos recorridos A4 y los tres casos de integridad de cápsulas marcados como inestables en el manifiesto sí pasaron en esta ejecución.

El fallo restante es H9a de QA079: al preparar el banco omití model.ts y package.json de la copia histórica. Lo completé y repetí H9a por separado, 1/1, 122 operaciones en la búsqueda antigua frente a 36 en la actual. Se conserva el fallo original en la cifra de la batería.

## Próxima corrección comprobable

Los cuatro fallos de rescue-capsule-rehearsal.test.ts comparan recuentos globales en un directorio compartido por suites. Antes de publicación observaron 8 y 6 destinos ajenos donde esperaban 0. Al publicar observaron 7 donde esperaban 1. La prueba de exclusión vio 41 frente a 36 esperados. Separar por reclamo y destino de la cápsula, y reproducir la interferencia con actividad ficticia ajena. El montaje de evidencia del ejecutable portátil sigue devolviendo 200 en la prueba que espera 404. La prueba de main agotó su espera de arranque.

El banco conserva la salida completa, conteos, resumen de cada fallo y hashes en tests/.tmp/unit-full362-i3MCjW. La invocación de tsx conservó su reporter spec aunque recibió el argumento tap después del patrón. Clasifiqué esa salida, sin modificar las pruebas ni el manifiesto reservado de CI.

## Fallos observados

- tests/continuity-evidence-mount.test.ts · the main entry point registers protected local evidence and rejects an obsolete revision · documentado en CI
- tests/continuity-evidence-mount.test.ts · the portable entry point does not register the main-only evidence route · documentado en CI
- tests/date-check-decision-independent-339.test.ts · 339 · el ID de alternativa debe corresponder a las ofertas exactas de la decisión · documentado en CI
- tests/date-check-decision-independent-339.test.ts · 339 · un acta de otra solicitud no sustituye el acta de la instalación revisada · documentado en CI
- tests/date-check-decision-independent-339.test.ts · 339 · una terminación observada sin fecha ofrecida no acredita incumplimiento · documentado en CI
- tests/date-check-decision-independent-339.test.ts · 339 · una proyección no probada conserva el retraso observado sin dar por acreditada su atribución · documentado en CI
- tests/independent-continuity-lab.test.ts · 099 new capture must not collide with an already present foreign evidence generation · documentado en CI
- tests/independent-continuity-lab.test.ts · 099 valid opaque IDs with a large numeric suffix must still produce a different capture identity · documentado en CI
- tests/independent-history-contracts.test.ts · H9a CARACTERIZACIÓN HISTÓRICA (no es garantía): el corte baseline075 devolvía todo el historial al buscar el año; el corte actual no · dependencia omitida en el banco, repetición focal verde
- tests/independent-interface-contexts.test.ts · G6 AUTH_PARENT072 corregido: el done que App entrega a Protection espera refresh() antes de abrir y devuelve su promesa · documentado en CI
- tests/independent-task-focus-123.test.ts · observation F1: after a lost acknowledgement the verification can read a different installation and call its matching value applied · documentado en CI
- tests/independent-task-focus-123.test.ts · observation F2: a new capture sharing its old ID but not its date is treated as the same context and can be edited · documentado en CI
- tests/operational-date-check-independent-337.test.ts · 337 · una instalación de 35 minutos no cabe en una ventana de 30 aunque la fecha pedida sea posterior · documentado en CI
- tests/operational-date-check-independent-337.test.ts · 337 · la baja de un técnico no puede conservar dos protecciones que exigen 140 minutos con 120 de capacidad · documentado en CI
- tests/operational-date-check-independent-337.test.ts · 337 · cancelar después de las alternativas impide certificar la matriz de escenarios · documentado en CI
- tests/rescue-capsule-rehearsal.test.ts · interrupción · el proceso MUERE en «import:staging-created»: artefactos reales, origen intacto y continuación segura · documentado en CI
- tests/rescue-capsule-rehearsal.test.ts · interrupción · el proceso MUERE en «import:components-written»: artefactos reales, origen intacto y continuación segura · documentado en CI
- tests/rescue-capsule-rehearsal.test.ts · interrupción · el proceso MUERE en «import:published»: artefactos reales, origen intacto y continuación segura · documentado en CI
- tests/rescue-capsule-rehearsal.test.ts · exclusión · dos importaciones concurrentes de la MISMA cápsula: exactamente una crea destino y las demás se rechazan (ALREADY_IMPORTED) · documentado en CI
- tests/task-intent-consumer-independent-322.test.ts · 322 · abortar dentro de onDispatch impide el POST, el escritor y el historial · documentado en CI
- tests/task-intent-consumer-independent-322.test.ts · 322 · un 401 real tras vencer la consulta anterior no bloquea la sesión nueva · documentado en CI
- tests/task-intent-consumer-independent-322.test.ts · 322 · el adaptador no verifica una tarea con el intento válido de otra · documentado en CI

## Huellas cotejadas

- package.json 6349900388d46afa9d9766f1bc6b637e5ea754653f84e122259efbf8a9d628bb
- tests/setup-unit-env.cjs d855d2f6fd1cb6393af276c591c6f3139c2eba057c33f6d3ef0ee757f70f4170
- tests/rescue-capsule-integrity.test.ts bd445dd61cb69a181c491b62755bacee431c0a3c10004b5ab90cd684319a1b4d
- tools/ci/known-failures.json 7f71d3aa0776b316323a13673325e6c57d131ff91c7a9cdabc427b96523cc03b
