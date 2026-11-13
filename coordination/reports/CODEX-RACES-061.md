# RACES061 · Respuestas válidas tardías y cancelación ignorada

30/10/2026, Europe/Madrid. Codex. **6/6 E2E nuevos y typecheck correctos sobre el buscador presentado. Cada una de dos mutaciones temporales falla en su caso causal seleccionado.** No cambio de fuentes funcionales, autoaceptación o instalación.

## Por qué se refuerza la evidencia

Un test de respuesta tardía con un cuerpo inválido puede pasar por el rechazo de procedencia/formato, aunque no compruebe la antigüedad. El abort nativo tampoco prueba el descarte de un transporte que ignore la señal. La cobertura previa SEARCH053 se conserva: esta unidad añade casos capaces de detectar la pérdida de esas guardas, sin reescribir la evidencia histórica o anunciar un fallo nuevo del código actual.

El nuevo archivo workspace-search-races.spec.ts prepara datos ficticios por API protegida del **server.mjs compilado**. Un wrapper de fetch ignora AbortSignal solo en la petición concreta retenida; la petición autenticada GET y el cuerpo completo proceden del servidor real del fixture. Se verifica éxito, ID, captureId y hash de revisión. Los cuerpos de consulta antigua y actual pertenecen a la misma captura/revisión; no hay una falsa protección por source:{}.

El wrapper registra cuándo el consumidor realmente lee el JSON; tras liberarlo se espera esa lectura y dos frames de render. La aserción comprueba que el resultado nuevo sigue usable, no solo la ausencia de un texto. En errores de transporte, la petición real primero da cuerpo válido y el wrapper provoca una excepción tardía controlada. No se usa ese error ficticio como hallazgo de servidor.

## Casos actuales

1. Consulta antigua con éxito tardío tras consulta nueva: se conserva el nuevo ID y puede abrirse la ficha correcta.
2. Error tardío de consulta antigua: conserva resultado nuevo, sin alerta obsoleta.
3. Apertura válida atrasada después de cambiar consulta: no abre el ID antiguo ni sustituye el estado nuevo.
4. Error tardío de apertura después de cambiar consulta: no contamina el estado nuevo.
5. Apertura válida atrasada tras cerrar búsqueda: no reabre un drawer; foco restaurado.
6. Apertura válida atrasada tras cambiar tipo de entidad: conserva el filtro y su resultado vacío legítimo.

Los seis cotejan revisión del espacio antes/después, cero escrituras de UI, cero pageerror y cero solicitudes fuera del origen. Fixture y protección nuevas, sin datos/cuentas reales. Resultado: **6/6, 21.3s, sin skipped/flaky**. Typecheck completo del snapshot que incluye el test nuevo: correcto.

## Sensibilidad causal

Fuente original WorkspaceSearch.tsx SHA-256 **9df10b7b32960a3a07c4baebd23a0d9235ee08ffd5cc406a503d5cc94d447c3e**, idéntica a SEARCH053 presentada y al archivo compartido tras las tres ejecuciones.

- **query-mutation:** solo en su copia temporal se retira la guarda `!live || current.current !== key` de la respuesta de consulta. Vite correcto. El caso query-success falla después de consumir/liberar la respuesta vieja: ya no encuentra ID contact-2. El DOM conserva nueva061 en el input pero muestra «Buscando en la copia local…» indefinidamente. Es pérdida del resultado actual por antigüedad, no payload inválido o fallo de preparación. **0/1, fallo esperado**. Hash del módulo mutado b391b965678f99264e6e8b4c88659f1ba790d9d4c12deb448f61467825a52f66.
- **open-mutation:** solo en otra copia se retira la guarda `!alive.current || controller.signal.aborted || current.current !== requestKey`. Vite correcto. El caso open-success tras consulta nueva falla después de liberar el cuerpo: desaparece la búsqueda y el DOM abre el drawer «Antigua061 Evidencia061», pese a haber solicitado Nueva061. **0/1, fallo esperado**. Hash del módulo mutado 71ec46574a7ce75744db3949e7ca68b21089ae462fa4c5c7cdd44d3947b4a6f2.

No se suman estos controles negativos como éxitos de aplicación; los JSON muestran inesperado1 por diseño de cada ejecución negativa. Las aserciones de identidad/procedencia anteriores a liberar el cuerpo sí pasan en ambas, y el fallo ocurre en la comprobación posterior de UI. Ninguna mutación toca las fuentes compartidas o la candidata original.

## Preparación y evidencias

Snapshot tests/.tmp/races061-b9423b00-077d-4660-8261-4410ad7a8851, subcarpetas current/query-mutation/open-mutation. Cada una tiene manifest.json de hashes, test y artefactos; current/typecheck.log, mutaciones/vite.log y browser.log por variante. Test idéntico en las tres. La actual reutiliza bytes exactos de los 23 artefactos del snapshot final CSS de TODAY059; las mutaciones solo recompilan frontend y conservan los mismos bundles backend. No se repite Node162: no cambió backend o fuente funcional actual.

Preparación reproducible conservada en tests/.tmp/prepare-races061.cjs y ejecución node tests/.tmp/races061-browser.cjs current, query-mutation u open-mutation. Expectativas de salida distintas: actual0; cada negativa1 por aserción indicada. Entorno de hijos con lista permitida del SO, block-external, Chromium headless de caché y perfil temporal propio. Un trabajador y ejecuciones seriales, solo 127.0.0.1:4397 y carpetas nuevas; no reutiliza servicios o termina procesos ajenos.

Evidencias: C:/Users/iresh/.codex/visualizations/2026/10/29/01a1896e-06ff-7690-9644-4f6de90c2826/races061/races061-b9423b00-077d-4660-8261-4410ad7a8851/. results.json y trazas por variante; attachments held-valid-metadata con ID/captura/revisión ficticios. Error-context de las mutaciones contrastados: spinner y drawer antiguo respectivamente. No se toman como instrucciones los consejos genéricos incluidos por Playwright en esos archivos.

## Alcance y límites

Dos archivos propios nuevos: el E2E y este informe. Fuentes SEARCH053, sus tests anteriores, App, QA056/QA060 y demás reservas intactas. Esta cobertura acredita la protección ante esos órdenes de respuesta, sin afirmar aislamiento transaccional de todas las ediciones concurrentes o validez indefinida de una ficha después de recibida. No se probó lector de pantalla u otro motor. Datos ficticios y runtime compilado de prueba, ninguna instalación/piloto existente verificada.

QA060 mantiene su revisión independiente; no debe convertir este informe de autor en una aceptación automática. Pendientes de release y de otras unidades conservados. Sin proveedor, datos originales, dependencia nueva, build/dist raíz, publicación, commit/push o autoaceptación.

## Hash del test congelado

tests/e2e/workspace-search-races.spec.ts: 1d1aa416eb706470fa59d32cb5ab9e9520ae82acd6344164f59f76b242a33a2b

El hash del informe lo registra submit.
