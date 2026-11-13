# CLAUDE-SOURCE-READING-HISTORY-UI · Consumidor «Historial de lecturas» (informe de entrega · R2)

9/11/2026, Europe/Madrid. Claude B. Dependencias: `CODEX-SOURCE-READING-HISTORY-298` (con el diario 297), aceptadas, y **`CLAUDE-SOURCE-INTEGRATIONS-CONTRACT` (SourceStatus)**, de la que el cliente importa `evidenceOf` y `EvidenceKind`: la huella probada se fija abajo. Traspaso con props, identidad, puntos de inserción y recorrido de QA: `coordination/plans/SOURCE-READING-HISTORY-UI-HANDOFF.md`.

## R2 · qué cambia tras el dictamen 306 (F1)
**Dependencia declarada y fijada.** El informe de R1 no decía qué SourceStatus se había probado. R2 fija la huella exacta de SourceStatus y de **cada archivo del repositorio que entra en el componente empaquetado** (el banco las calcula con el metafile de esbuild, ver tabla). Esta entrega no se acepta sin una versión aceptada de SourceStatus.
**Textos de evidencia frente a SourceStatus R3 (F3 del dictamen 296).** Un plazo o una cancelación con la petición enviada no distinguen si habían llegado las cabeceras. `EVIDENCE_TEXT` es un `Record<EvidenceKind, string>` (un tipo nuevo no compila) y ahora expresa: **no salió ninguna petición** (cero peticiones); **falló la red antes de recibir respuesta** (causa `network`); **se interrumpió (plazo o cancelación) antes de completar una página: no se sabe si la fuente llegó a responder** (`interrupted`); **la fuente respondió con un error**; **llegó una respuesta que no se pudo usar**; **llegaron datos de la fuente de ensayo**. Ningún texto niega una respuesta que pudo llegar ni la afirma. Se conservan «Recuento desconocido (no es cero)» y la causa.
**Identidad inequívoca (aviso de Codex).** Nuevo `historyIdentityKey`: serializa nueve campos (sesión, instancia, pin, captura, proveedor, cuenta, objeto, modo, objetivo) con JSON; con `join('|')` dos contextos distintos podían colisionar. El traspaso detalla qué aporta cada campo (la sesión es un contador del anfitrión; `LocalIntegrations` ya tiene `lockEpoch`).

## Combinación exacta probada (congelada)
- **Node (66/66):** 9 del cliente, 24 de la API 298, 18 del diario 297 y 15 de SourceStatus, sobre los bytes del repositorio de las rutas de la tabla siguiente (server/source-reading-history.ts `4adf09ef…`, server/source-reading-journal.ts `85b9a7d0…`, shared/source-reading-history.ts `8dc9d7e7…`, shared/source-reading.ts `5e487a65…`, **shared/source-status.ts `fddfda1b…` (SourceStatus R3 aceptada)**).
- **Chromium (10/10):** el componente empaquetado con esbuild a partir de los imports de la tabla. El banco **falla** si cualquiera de las tres dependencias aceptadas (SourceStatus, modelo común, contrato 298) cambia de huella, y fija `shared/continuity-passport.ts` en los **bytes aceptados de 214** (huella completa abajo) mediante un plugin de resolución, tomados de la copia privada del revisor 306 verificada contra el tablón (CLAUDE-PASSPORT-214 `submitted`). Evidencia del banco: `passport.usedFrom` y `passport.repoWorkingHash` (`66d645f3…`, la versión que 308 tiene en revisión y que NO se probó). Si 308 queda aceptada, hay que repetir con esa versión y fijar otra combinación.
- No se copió el checkout entero. Las ejecuciones usan los bytes presentes al presentar; las rutas propias no cambiaron entre las pruebas y las huellas de abajo.

## Qué es y qué NO es
**Componente probado, NO montado.** `SourceReadingHistory` consulta el GET local 298 y presenta el historial de lecturas de ENSAYO (`*-fixture`, cuentas `fixture-*`): fuente, cuenta y entorno en la primera línea, «último guardado» y «observación más reciente» por separado, recibos con hora observada y hora guardada, causa, intento, páginas, peticiones y omitidos. Un fallo sin datos dice «Recuento desconocido (no es cero)»; cero recibos dice «Sin recibos locales para esta fuente» y nunca «proveedor vacío»; el aviso de ensayo y «No conectado» se ven siempre. **No hay «Conectar» ni «Leer del proveedor»**; «Actualizar» solo consulta lo local. No se muestran etiquetas, asuntos, referencias, valores, cuerpos ni el ID de un registro. **No** edita Integraciones, App, main, el GET 298, el diario 297, SourceStatus ni adaptadores.

## Qué se comprobó, y con qué
| Capa | Qué | Resultado |
| --- | --- | --- |
| Node · cliente (`tests/source-reading-history-client.test.ts`) | Consulta exacta; GET REAL (createBaseApp + diario 297 + ámbito inyectado) a través de un `fetch` sobre `app.inject`; respuestas SINTÉTICAS (rotuladas) que el servidor no puede producir; cancelación; presentación pura; **R2:** texto por cada categoría de evidencia (conjunto cerrado frente a `evidenceKinds` de SourceStatus, interrupción sin negar respuesta, fallo de red, cero peticiones) y clave de identidad inequívoca | **9/9** (junto a las 24 del GET 298: 33/33); `tsc -p .` sin errores |
| Chromium · banco real (`tests/e2e/source-reading-history.spec.ts`) | Componente REAL empaquetado en una página servida por un Fastify real (createBaseApp + SQLite de fichero + diario 297 + `registerSourceReadingHistory`); GET REALES; sin respuestas de éxito inventadas: vacío, recibos, dos páginas con cursor invalidado, bloqueo y sesión nueva, cuenta, captura, respuestas tardías (transporte que ignora la cancelación), diario ilegible con reintento local, teclado y 1440/390/320; **R2:** interrupciones y fallo de red con sus textos; solo GET locales, sin errores de consola, sin escrituras | **10/10** |
| Control causal | Cliente (otra copia/fuente/tamaño/paginación/orden aceptados, 401 sin bloqueo, 403 sin código, cancelación tardía devuelta, cursor no enviado, fallo contado como cero, ámbito inválido enviado; **R2:** la interrupción niega la respuesta, identidad con separador, falta un texto) y componente (12 mutantes de estado y presentación + el combinado de las dos capas de respuesta tardía; **R2:** la interrupción niega la respuesta, en navegador) | **Cliente 14/14 detectados. Componente 12/12 + combinado + 1 de R2 en navegador** |

**Equivalente documentado.** Quitar SOLO la guarda de generación del componente sobrevive: la respuesta tardía ya la descarta el cliente (comprueba la señal tras cada espera aunque el transporte la ignore). El mutante que quita ambas capas SÍ se detecta. La comprobación de «misma instantánea» al continuar no se alcanza con el servidor real (un corte distinto produce 409 por el cursor); queda como defensa sin prueba propia.

## Decisiones de diseño
- El anfitrión fija la fuente y el pin; el componente nunca amplía el ámbito. Una respuesta que no corresponde a lo pedido es «inválida» y no se publica.
- Los recibos van en el orden de inserción del contrato (más antiguo primero); «último guardado» solo se afirma con todo el historial leído.
- Un fallo que invalida lo leído lo descarta TODO, incluida la continuación; un fallo que solo impide seguir conserva lo leído marcándolo como tal. El panel desplegado se conserva al releer, pero solo con la primera página del corte nuevo.

## Límites
No es la App compilada ni está montada: no acredita que Integraciones muestre nada. El banco escribe las lecturas de ensayo en el diario desde el propio proceso de prueba (`appendSourceReading`). Solo Chromium headless-shell 1228 en este equipo; sin modo oscuro ni lector de pantalla; el diagnóstico del revisor sobre una SourceStatus histórica no sustituye esta combinación. Sin llamadas reales, cuenta, credencial ni servicios externos; el banco usa raíz y puerto efímeros en `127.0.0.1` (no 4601, 4331 ni 4334).

## Estado de llegada
| Qué | Estado | Tarea / dueño |
| --- | --- | --- |
| Componente, cliente, estilos y pruebas | Implementado y verificado con GET real; **no montado** | Esta unidad · Claude B (pendiente de revisión) |
| Registro del GET 298 en `main` con ámbito real, registro de fuentes, paso del pin a Integraciones y montaje | **No existe** | Codex coordinador (pasos 1–4 del traspaso) |
| Acción explícita de lectura | **No existe** | Codex coordinador |
| QA del producto montado | Unidad registrada, **sin reclamar** | `CLAUDE-SOURCE-HISTORY-MOUNT-QA` · Claude B, tras aceptación y montaje |
| Ensayo con cuenta real | **No hecho** | La persona, con autorización expresa |

## Hashes finales (sha256)
Entregables:
| Ruta | sha256 |
| --- | --- |
| src/source-reading-history-client.ts | 372b00b41f542850661a8dec376ae89c3e0d9cec75b04899d5b2da7a491f17aa |
| src/SourceReadingHistory.tsx | 64af2ceb9b977c0917e5f16636d439ce8c8b54af03d356fedd3a02f4df094c34 |
| src/source-reading-history.css | 7bea54a173186958ec0e8ccde43307ed38600ffdf284b63bc3d36752557b7c5e |
| tests/source-reading-history-client.test.ts | a0fe034473c2aeec932c6cf8d0f7234d32756300b51f77d37c9296412ae9d265 |
| tests/e2e/source-reading-history.spec.ts | 200c92700b530a3402a509be122ae17aabd2ebde33e18d4fd7d73386793c424b |
| coordination/plans/SOURCE-READING-HISTORY-UI-HANDOFF.md | 5cc7e282be0a97c05dda733a9c9d1193d72ea8e3a884644deb0fb745c858a76b |
| coordination/reports/CLAUDE-SOURCE-READING-HISTORY-UI.md | (este informe) |
Imports de producto probados (todos los archivos del repositorio que entran en el componente empaquetado; SourceStatus es la **versión probada**):
| Ruta | sha256 |
| --- | --- |
| shared/source-status.ts | fddfda1bd5b73d4b5a32e0eca96e6b58a9188d6b7b50be911421c37cf2a08da1 |
| shared/source-reading.ts | 5e487a65916d2f3e7af5afb328235960acb4d51ab58da01f19ce8b241f34192a |
| shared/source-reading-history.ts | 8dc9d7e744f8bb4afa7f4b126975edd1d954a953a72ef0b1ee32d0345ecf645f |
| shared/commitments.ts | 126d44e05372c0ece060c6ef6b547ba6226543641d2e63b2222537a577901328 |
| shared/continuity-passport.ts (solo `when`; bytes ACEPTADOS de 214, congelados: el archivo del repositorio lo edita 308, en revisión, y NO se usa) | 9b22877f0c1589ebfc071f35dd0c3e8963e1d44848575e5dbc9caf8898c50870 |
| shared/model.ts | 1276b6ac00900460abddafc054799afdebcfdfab7e1b90fa97c4e5f75563faae |
| src/styles.css · design-system.css · planb-ui.css (hojas globales del banco) | d0a460959be2b5d18694f6c33e5b49a454981b7172ab6e42a51f765ce59f442c · b2bf8d021490f816be8777c86c70090b27b91602da5c8f7997b6984884978c3e · 0e7563e4115db7135b2b7c6aa5c81126a5eccf31180d9dd3cce19d000780a943 |
Puerta: **SourceStatus R3 está **aceptada** (done, huella `fddfda1b…` coincide con la probada) y las dependencias 298/297 y Zendesk/source-reading también; `continuity-passport` queda fijado en los bytes aceptados de 214. La aceptación de este consumidor queda con el revisor 306; esta entrega no monta nada.**
