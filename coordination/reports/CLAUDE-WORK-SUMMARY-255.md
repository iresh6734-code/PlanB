# CLAUDE-WORK-SUMMARY-255 · Consumidor del resumen público del trabajo local (informe de entrega)

6/11/2026, Europe/Madrid. Tanda 4 del encargo 240 (Claude B), **parte posible hoy**: el diario 208 (Claude A) sigue en revisión y no publica su resumen, el hub 217 y `ContinuityHome` 253 están presentados, y no hay candidata conjunta aceptable. Se entrega el lado consumidor sobre un contrato PROPUESTO que Claude A aceptó con tres matices (ver plan). **No hay endpoint real, ni montaje, ni candidata conjunta probada.**

## R2 (6/11/2026) · respuesta al dictamen independiente (cancelación en el cliente)
Reproducido antes de corregir: con el cliente anterior fallaban las regresiones «cancelado antes» (se llamaba al transporte), «cancelado mientras espera» (devolvía `read`, `locked`, `not-registered` o `failed` tras cancelar con un transporte que ignora la señal) y «cancelado justo al terminar»; pasaban «cuerpo a medias» y el control con señal vigente. Corrección en `src/work-summary-client.ts`: la señal se comprueba antes de enviar, tras recibir la respuesta, tras cada fragmento del cuerpo y antes de devolver cualquier resultado; una operación cancelada nunca devuelve datos ni una categoría del transporte: lanza `AbortError`, cancela el flujo y libera el lector, y el cuerpo ya recibido se DESCARTA (criterio único). Sin reintentos y con el tope de 64 KiB; 401, 404 y 5xx siguen siendo categorías mientras la operación esté vigente.
**Resultados R2:** `tests/work-summary.test.ts` 11/11 (cinco regresiones nuevas), las 3 sondas de Codex (`work255-cancellation.test.ts`) pasan con el cliente nuevo, DOM 7/7, `tsc` sin errores en los archivos de la unidad. El endpoint real, el vínculo autorizado de ámbito y el montaje siguen siendo del traspaso (sin cambios).

## Qué entrega
`shared/work-summary.ts` (contrato estricto + coherencia semántica + situaciones + adaptador `toWorkSource` + exportación), `src/work-summary-client.ts`, `src/WorkSummary.tsx`, `src/work-summary.css`, y `coordination/plans/MONTAJE-RESUMEN-255.md` (contrato, montaje preciso y pendientes por dueño).

## Pruebas
| Garantía | Prueba |
| --- | --- |
| Cinco situaciones distintas por contrato; «sin cobertura» y «no disponible» jamás son cero; lo resuelto y lo de otra copia no son trabajo pendiente | Node |
| Parser estricto: campos de más (ids de tarea), formatos, fechas, negativos/decimales, instalación en vez de captura, y 9 incoherencias (no disponible con recuentos, sin cobertura con recuentos, completa con cuarentena, parcial sin cuarentena…) | Node |
| Adaptador: contexto del ÁMBITO (no el esperado), cuarentena como `unreadable`, desconocido = `null`; alimenta pasaporte y mapa; otra captura se declara aparte (`other-context:work`) | Node |
| Exportación: lista blanca exacta, JSON ≤ 8 KiB y determinista, HTML autocontenido y escapado con CSP, etiqueta corta de captura (no la clave), nombre y aviso que no se confunden con una cápsula restaurable | Node + descarga real |
| Cliente: un GET, 401/404/500/formato/enorme/red/cancelación distinguidos, sin reintento | Node |
| Las **ocho** situaciones (vacía, con trabajo, ilegible, sin cobertura, no disponible, bloqueada, no registrada, inválida) con titular propio; enlaces a Hoy y a Trabajo por recuperar con y sin anfitrión; otra copia no se acredita; descargas reales y HTML abierto SIN red; identidad + respuesta tardía con transporte que ignora `AbortSignal`; 390/320 ≥ 44 px y teclado | DOM Chromium |
Resultados: Node **6/6**, DOM **7/7** (headless-shell 1228, doble del endpoint declarado como doble). Capturas abiertas: `wks-pending` (1440) y `wks-320`. `tsc --noEmit` sin errores en los archivos de la unidad (ajenos: `tests/task-intent-journal.test.ts`, 208).

## Coordinación
Propuesta enviada a Claude A (sesión «Hoy: recuperación tras reinicio»); aceptó ruta, solo lectura, campos exactos y reglas, con tres matices ya codificados: `scope.context` solo `captureId`, `partial` ⇔ hay cuarentena (recuentos como cota inferior) y `durable` solo con base de archivo. Su endpoint será una unidad sucesora suya tras aceptar 208 y acordar con Codex el propietario de `main`/Store.

## Límites
- Doble del endpoint (el real no existe); contrato propuesto, no cerrado con Codex.
- Sin montaje en `ContinuityHome` (253 en revisión) ni enlace real a «Trabajo por recuperar» (depende del A4 de Claude A).
- **Candidata conjunta Hoy → reinicio → Trabajo por recuperar → Continuidad: no probada.** Depende de 208/230/233 de Claude A, del registro de evidencia (239) y del parche de `main`/`App.tsx` (Codex).

## Hashes finales R2 (sha256)
| Ruta | sha256 |
| --- | --- |
| shared/work-summary.ts | 75bcfdef4adc378247068180f0d5fa28807eb2601cea4000b4c819f86b3d0197 |
| src/work-summary-client.ts | e3d61023826f98ada6979f3b6255c24268e970aebddbed43938694b7b2b3281b |
| src/WorkSummary.tsx | d288662339dfc93a45798d6fb21bf6e22bdf03eeb90b969f585a6a17d0ebc84f |
| src/work-summary.css | aa15f61273a56c5328949fe4cfcd6052aed0e9838bfd1b8f9bdf4b2d1858d48f |
| tests/work-summary.test.ts | 1455c78544e8be1ae7247e5d41214705a434b6e00dbc24813586eafe982c1c53 |
| tests/e2e/work-summary.spec.ts | 4941e3b39c07f6ae9d9d50e316298fb50a8b9b175e8d1070d5debc87a42fd125 |
| coordination/plans/MONTAJE-RESUMEN-255.md | 23d3d72313ce5f4e37464818a44b4d446653f68cabce61006707088073e5d4c4 |
| coordination/reports/CLAUDE-WORK-SUMMARY-255.md | (este informe) |
