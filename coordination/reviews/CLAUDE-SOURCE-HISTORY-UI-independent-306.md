# Historial de lecturas · Revisión independiente306

9 de noviembre de 2026, Europe/Madrid. Dictamen: diagnóstico funcional favorable sobre el corte fijo indicado, pendiente de cerrar dependencia no aceptada. No se acepta ni monta el consumidor.

## Siete fuentes revisadas

- `src/source-reading-history-client.ts`: `94f4d3e422e3d3c01f8e132ef809ee3fd8ca4bac63ca9032c35af8dafbae6d0f`
- `src/SourceReadingHistory.tsx`: `64af2ceb9b977c0917e5f16636d439ce8c8b54af03d356fedd3a02f4df094c34`
- `src/source-reading-history.css`: `7bea54a173186958ec0e8ccde43307ed38600ffdf284b63bc3d36752557b7c5e`
- `tests/source-reading-history-client.test.ts`: `08a12fdb567d41a64c37f03d378ea8ef92bffe31324cbdc5fdff2dda6b384987`
- `tests/e2e/source-reading-history.spec.ts`: `79aa2e280a386d18041b21aa975e0bc062ba610bb48ad3deeaad943098e6e8d0`
- `coordination/plans/SOURCE-READING-HISTORY-UI-HANDOFF.md`: `6d1a6ea8ad8df6c43cfb4153edf41517991b573534a830a4cd9bc36808308e3c`
- `coordination/reports/CLAUDE-SOURCE-READING-HISTORY-UI.md`: `bb86062cdbb0c2f9259c99ef85c04b03096d74a3dc63f3041e9d4c9a6fd75cfd`

Se leyeron cliente, componente, estilos, pruebas y traspaso. El cliente valida query, forma y correspondencia de fuente/pin/tamaño/orden/paginación; acota bytes y verifica cancelación después de esperas. El componente separa primera página y continuación, retira datos ante fallos que invalidan ámbito/copia/cursor, conserva recibos con aviso cuando solo falla continuar y distingue último guardado de observación. El contrato exige que el anfitrión actualice identityKey con sesión/cuenta/captura. La UI no amplía permisos por recibir props.

## F1 · Dependencia de SourceStatus todavía sin aceptar

El cliente importa evidenceOf y EvidenceKind de shared/source-status.ts. Esa ruta no tiene ninguna huella aceptada en el tablón y CLAUDE-SOURCE-INTEGRATIONS-CONTRACT sigue working bajo R3. La tarea solo declara298 como dependencia y el informe no fija qué SourceStatus se probó. No se puede aceptar implícitamente una versión working ni suponer que la futura revisión preserve sus categorías y textos.

La revisión296 ya pidió corregir la afirmación de que no llegó respuesta cuando una lectura abortó después de recibir encabezados. El consumidor tiene su propio EVIDENCE_TEXT y debe comprobar su compatibilidad con esa corrección: cambiar el módulo compartido no demuestra por sí solo que los textos del consumidor queden correctos. No se declara aquí un segundo defecto independiente del transporte.

Se requiere esperar la aceptación de SourceStatus, fijar su huella en la entrega, adaptar las siete rutas propias si procede y repetir tipos,7cliente y9navegador contra esa versión. Una alternativa de desacoplamiento debe ser acordada, con clasificación honesta propia y sin duplicar ni editar módulos ajenos. No se cambia board.json a mano para añadir dependencia. La puerta queda registrada en este dictamen y en R2.

## Banco diagnóstico, expresamente limitado

tests/.tmp/history306-9eLdSR usa fuentes congeladas de298y303 y las siete huellas de autora. SourceStatus procede exclusivamente de la copia histórica R2 del banco296,050b3d55ebe8b7b7e987ef4b5cb8f7c03e25f1d5533de0a116d17599698be2ae. Esta versión NO está aceptada. No se leyó ni copió su edición working para ejecutar el banco. Manifest conserva fuentes y procedencia; se corrigió una etiqueta genérica de procedencia de la base303 para conservar sus dueños exactos, sin cambiar bytes de fuente ni repetir pruebas.

Resultado propio:31/31Node (7cliente presentadas+24API298),9/9Chromium y tipos focales0. Ninguna aserción de autora se cambió. Un trabajador, cero retries/skips/flakies. Banco SQLite de archivo/memoria y GET reales, puerto efímero y ficción. PLANB_KEEP_HISTORY_UI mantiene evidencia sin borrado recursivo. Browser plugin not available; Playwright y Chromium de caché existentes.

Los9E2E cubren vacío local, recibos/causas/recuento desconocido, paginación y cambio de head,401/sesión nueva, cuenta distinta, captura distinta, respuesta tardía con transporte que ignora cancelación, corrupción y reintento, teclado1440/390/320. Se abrió history-320.png: identidad visible, aviso de ensayo, recibos legibles y actualización con foco. El banco compara tablas y verifica solo GET al historial y ausencia de red externa/errores relevantes. El propio arnés excluye del recuento de consola el mensaje genérico Failed to load resource; no se afirma consola absolutamente vacía en errores HTTP esperados.

Las7fuentes se cotejaron antes/después. Las mutaciones del informe de autora no se repitieron; sus cifras se atribuyen a ella. Este diagnóstico no acredita la combinación futura con SourceStatus R3 ni App/Integraciones/main. No se probaron lector de pantalla, modo oscuro, otros navegadores o cuenta real.

## Entrega y siguiente paso

Se devuelve a Claude B solo por F1 y la prueba del corte aceptado. Mantiene las siete reservas. Puede esperar a SourceStatus sin tocar sus rutas ajenas; cuando haya una versión aceptada se presenta nuevo informe y huellas, conservando pruebas previas. El coordinador conserva registro del GET y montaje central.

## R2 · Favorable sobre combinación aceptada

9 de noviembre de 2026, Europe/Madrid. Siete huellas cotejadas:

- `src/source-reading-history-client.ts`: `372b00b41f542850661a8dec376ae89c3e0d9cec75b04899d5b2da7a491f17aa`
- `src/SourceReadingHistory.tsx`: `64af2ceb9b977c0917e5f16636d439ce8c8b54af03d356fedd3a02f4df094c34`
- `src/source-reading-history.css`: `7bea54a173186958ec0e8ccde43307ed38600ffdf284b63bc3d36752557b7c5e`
- `tests/source-reading-history-client.test.ts`: `a0fe034473c2aeec932c6cf8d0f7234d32756300b51f77d37c9296412ae9d265`
- `tests/e2e/source-reading-history.spec.ts`: `200c92700b530a3402a509be122ae17aabd2ebde33e18d4fd7d73386793c424b`
- `coordination/plans/SOURCE-READING-HISTORY-UI-HANDOFF.md`: `5cc7e282be0a97c05dda733a9c9d1193d72ea8e3a884644deb0fb745c858a76b`
- `coordination/reports/CLAUDE-SOURCE-READING-HISTORY-UI.md`: `769fed5c623dbb79111f3735f3cc11b072aa5418c920eedfca42d8afaf88552d`

Banco history306-r2-EpaeyV:66/66Node (9cliente+24API298+18diario297+15SourceStatus),10/10Chromium en30,18s y tipos focales0. Asserts de autora sin cambios; un trabajador, cero retries/skips/flakies. El módulo SourceStatusR3 fddfda1b… y sus dependencias coinciden con versiones aceptadas. Passport2149b22877f… se toma del corte fijo, sin308enreview. En este banco su usedFrom es el repositorio privado, que contiene los bytes214; no se atribuye a este pase el uso del plugin sobre el checkout working de autora.

F1queda atendida: informe y banco identifican todos los imports del bundle y sus hashes; categorías cerradas incluyen interrupted con incertidumbre de cabeceras y causa/recuento conservados. Clave de identidad nueva serializa nueve campos mediante JSON; no usa separador ambiguo ni infiere autorización a partir de la clave. El host sigue obligado a actualizar sesión/contexto/ámbito y aportar el pin correcto.

Los10E2Eejercen servidorFastify/SQLitedearchivo reales con datos ficticios y ámbito inyectado; reiteran límites, cancelación, cursor/head, sesión, cuenta, copia, corrupción, teclado y1440/390/320 e incluyen interrupciones/error de red. Se abrió history-320.png: textos, identidad, fechas y recibos legibles. La hora observada y guardada siguen separadas. El banco conserva evidencia, compara tablas y exige solo GET de consulta y cero solicitudes externas; sus mensajes genéricos de consola por HTTP fallido están filtrados según el arnés, por lo que no se afirma consola absolutamente vacía.

La guarda del banco verificó en ejecución que todos los borrados recursivos quedaran bajo su raíz propia; sus destinos están en recursive-targets.log. Siete fuentes estables por hash antes/después. Mutaciones declaradas por autora no se repitieron en esta revisión; no se suman a los66+10propios.

Se acepta consumidor, cliente, estilos, pruebas y traspaso sobre esta combinación. No se monta en Integraciones ni registra GET enmain. Cuando308sea aceptada habrá que probar la nueva combinación. La QA de montaje tiene tarea propia y depende del montaje central real, no solo de esta aceptación. Sin proveedor, credencial, lector de pantalla ni otros navegadores.
