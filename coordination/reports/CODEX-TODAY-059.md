# TODAY059 · Hoy sin trabajo oculto tras el vigésimo elemento

30/10/2026, Europe/Madrid. Codex. **64/64 pruebas Node focales y 5/5 recorridos finales de navegador.** Consulta completa dentro de 10.000 registros; simulación acotada y revisable. Fuentes para revisión separada, sin autoaceptación o instalación.

## Problema y resultado

SalesAgents.today recortaba oportunidades y compromisos a veinte antes de devolverlos. La interfaz solo recibía ese subconjunto y podía anunciar «Ver las 20» sin advertir que existían más. El análisis repetido también se quedaba en esas primeras veinte oportunidades: tras preparar sus propuestas, no alcanzaba las siguientes.

La consulta devuelve ahora todas las filas que cumplen los mismos criterios, dentro del límite global de 10.000 registros del espacio. listTotals informa los recuentos completos. No cambia la selección de oportunidades sin tarea próxima, la clasificación de tareas vencidas/para hoy, permisos o modo de ensayo. Las tareas con la misma fecha usan ID como desempate estable.

WorkQueue ofrece cinco filas iniciales y exploración en páginas de veinte, búsqueda local por todos los términos del nombre/ID sin distinguir acentos o mayúsculas, contador y navegación. Conserva el orden de negocio y los homónimos por ID; muestra los IDs para distinguirlos. Las consultas/filtros de la lista no realizan peticiones ni escriben registros. Teclado, foco al limpiar y controles de al menos 44px en el componente. CSS nuevo acotado: no se cambia el diseño global ni el piloto de Claude.

listTotals es opcional para compatibilidad. Si falta o no coincide con las filas recibidas, se advierte que no se puede dar la lista por completa, se indica lo recibido y, si existe, el total declarado. No se inventan páginas que el servidor antiguo no ha devuelto.

**Simulación:** cada análisis prepara como máximo veinte propuestas nuevas, salta las ya preparadas para esa revisión y puede alcanzar las siguientes en otra tanda. Mantiene el máximo total de cien, revisión/aprobación por propuesta, cero ejecuciones automáticas y registros CRM intactos. El modo independiente y datos de producción siguen sin habilitar este motor de ensayo. No se añade IA o proveedor.

## Pruebas Node y sensibilidad

Comando: node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/today-completeness.test.ts tests/work-queue.test.ts tests/agents.test.ts.

**64/64**, sin skips/TODO, 17.1s: once nuevas y las 53 existentes de agentes. Log tests/.tmp/today059-unit.log. Se comprueban 47 oportunidades/63 compromisos, totalidad hasta 10.000 registros, API protegida, ausencia de escrituras, producción/runtime no disponibles, páginas/orden/filtros/límites y homónimos. Tandas 20+20+7+0 sin duplicados, máximo cien propuestas y cero artefactos ejecutados.

Baseline exacto anterior a esta unidad: candidate-c3b1e6d5-9907-4358-8ad9-0b3ef065ee71/source. Dos casos seleccionados contra esa copia fallan por las causas esperadas: recibe veinte en vez de 47; segunda tanda prepara cero en vez de veinte. Resultado **0/2**, sin skipped/TODO; no son fallos de la fuente corregida. Evidencia tests/.tmp/today059-baseline-f1427e1c-a3fd-4ef3-98d1-ad32cece8a14/sensitivity.log. Primer intento propio usó una ruta Windows absoluta como import ESM sin URL y falló antes de ejecutar los casos; corregido solo el arnés a --import tsx. Su log queda separado y no cuenta como sensibilidad de producto.

## Build y recorrido de navegador

Base compilada nueva: tests/.tmp/release-candidates/candidate-2a4cddbe-ae77-4f31-bc89-20f5c88674f2, 277 fuentes/23 artefactos. Typecheck, Vite, seis bundles, diez activos públicos y 162/162 Node previstos correctos. Estado de revisión y releaseEligible:false conservados. No se repite esa batería por una corrección posterior exclusivamente CSS.

La primera corrida de navegador dio 4/5: mi regla nueva de altura empataba en especificidad con la global posterior, que dejaba un botón en 28px. Se corrigió a body .work-queue button, sin tocar CSS de Claude o bajar la aserción. Snapshot final tests/.tmp/today059-final-f5dbe529-95f2-420d-bb0c-86644e6cd7eb: se cotejaron las 277 fuentes, **solo cambia src/work-queue.css**; todos los demás bytes de fuente y los bundles Node son iguales a la base validada. Vite nuevo con entorno permitido del SO y block-external; manifest.json registra delta y hashes de los 23 artefactos. El primer build CSS con entorno ordinario se conserva como preparación anterior, no es el usado en la corrida final.

Preparación final de navegador: tests/.tmp/today059-55a0efd9-0670-419b-9ede-4e5cfc84ac15, browser.log/manifest.json. Dos main/server.mjs compilados copiados a carpetas nuevas para datos ficticios, en 127.0.0.1:4395/4396; un trabajador, Chromium headless de caché y perfiles temporales propios. No compilación de un backend fixture alternativo, dependencias nuevas o servicios existentes.

**5/5 finales**, 30.0s, sin skipped/flaky:

1. Llegar a la última de 47 prioridades y 63 tareas, paginar, buscar nombre/ID con acentos y volver al inicio; cero lecturas adicionales o escrituras al filtrar.
2. Respuestas de servidor anterior o metadatos inconsistentes: avisos explícitos de veinte recibidas y de veinte sobre 47/63 indicadas. Fixture preparado en cada caso; sin dependencia del orden de pruebas.
3. Tandas por UI de 20, 40 y 47 propuestas en revisión, sin ejecutar, duplicar o modificar registros CRM.
4. Teclado/foco al limpiar, controles 44px y ausencia de overflow a 1440/390/320. Capturas desktop y 320 inspeccionadas.
5. Recorrido anterior v4: Hoy, revisión, ejecución simulada aprobada, persistencia, integraciones, móvil y caducidad tras edición. Fuente y aserciones de ese test intactas en esta unidad.

Evidencias visuales/JSON: C:/Users/iresh/.codex/visualizations/2026/10/29/01a1896e-06ff-7690-9644-4f6de90c2826/today059/today059-55a0efd9-0670-419b-9ede-4e5cfc84ac15/. results.json, today059-1440.png/390/320 y trazas. Primera corrida adversa conservada aparte en today059-3f0fa49d-cea6-4986-9abc-96ba10789b6e, sin sustituir su fallo por el resultado final.

## Límites y coordinación

Solo diez archivos exactos propios; no App/Store/Recovery, fuentes de QA056 o CSS globales. Read lists completas implican más bytes de respuesta local, acotados por los 10.000 registros admitidos; el DOM renderiza como máximo veinte por lista expandida. El botón heredado «Ver oportunidad» conserva su navegación al listado filtrado por etiqueta; la búsqueda global es la que abre una ficha por ID/revisión. No se cambia ese contrato en esta unidad.

Los criterios de Hoy siguen siendo los existentes sobre datos de ensayo, no una garantía de seguimiento remoto. No nuevo contrato de fechas, medición RTO, lector de pantalla real, motor alternativo o instalación acreditada. QA060 tendrá revisión independiente de esta versión, disjunta de QA056. Sin base real, proveedor, equipo original, build/dist raíz, publicación, commit/push o autoaceptación.

## Hashes de fuente cotejados contra el snapshot final

- shared/agents.ts: 076314173adfdd7977c1945b1ea798dc92bff9059c883ffbc0562090fbba2283
- server/agents.ts: df68aaee8ca8410a4511b93df6cf759dc999012978909600fd6b1e31b4c26ae9
- shared/work-queue.ts: 2505897c0ca4ca7dfa18284e72904fdb137c332b6d439a7684e0c1bff4d8bb12
- src/WorkQueue.tsx: fb0bfa05e469ed1748d81d2cbf348ac246d65d3c629a2d96f51f1c815f0b3766
- src/work-queue.css: 3e3bd49415d84e93c535260c72892779b770fb5cd09d94dd7906e0bb2ee2396c
- src/SalesWorkspace.tsx: fcb41009bdb91a4065d6ed0d8b313cdf224dab36f4d69740bce248c522c9ac8e
- tests/today-completeness.test.ts: a0f76ea8a94c5c67e8c73754f1f8ffbd223e52debfebb7d05a28d2812ffd784f
- tests/work-queue.test.ts: 51f5d13240d8f687b32960bb0affec351c7854b91998075e69976fa6f1767123
- tests/e2e/today-work-queue.spec.ts: 1b8f75b5fe2176e1100ccf3c06ec72fa9496d1ad90467e2142db27bf3cf08018

El informe registra su propio hash mediante submit.
