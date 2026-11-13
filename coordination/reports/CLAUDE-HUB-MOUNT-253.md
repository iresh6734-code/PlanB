# CLAUDE-HUB-MOUNT-253 · ContinuityHub dentro de Continuidad y vuelta desde Integraciones (informe de entrega)

6/11/2026, Europe/Madrid. Tanda 2 del encargo 240 (Claude B). **El hub 217 R2 está en revisión (no aceptado) y `App.tsx` no se ha editado**: esto es montaje en `ContinuityHome` + parche preciso para el dueño de App, probado sobre una proyección de la App compilada.

## Qué entrega
- `src/ContinuityHome.tsx`: bloque «Evidencia, mapa de impacto y ensayo de relevo» (`<details open>`) con `<ContinuityHub>`. Props nuevas OPCIONALES (`onOpenToday`, `onOpenIntegrations`, `returnedFrom`, `onReturnHandled`): una acción ausente no se pasa y el hub explica «ábrela desde el menú». `open-preparation`/`open-export` reutilizan `prepare`/`exportCopy`. Aviso «Has vuelto de Integraciones» (`role=status`) y foco al encabezado del hub, una vez. Sin `context` ni `installId` (no hay vínculo autorizado). La portada existente no cambia.
- `src/continuity-home-hub.css`, `coordination/plans/MONTAJE-APP-253.md` (parche de App: 3 sustituciones, estado de fuentes en `main`, pendientes), `tests/continuity-home-hub.test.ts`, `tests/e2e/continuity-home-hub.spec.ts`.

## Pruebas
| Garantía | Prueba |
| --- | --- |
| Navegación opcional, sin consentimiento propio ni almacenamiento, sin `context` inventado, portada intacta, textos sin contradicción | Node 5/5 (incluye que cada ancla del parche existe una vez en el `App.tsx` actual) |
| App compilada (`server/main.ts` real, SQLite de archivo, red externa bloqueada, proveedor ficticio): menú → Continuidad → bloque con estado REAL por fuente; abrir y recargar = 0 peticiones al proveedor | DOM 1 |
| «Abrir Integraciones» navega al panel 218 (sin segundo consentimiento); «← Volver a Continuidad» solo si se llegó desde Continuidad; foco y aviso al volver | DOM 1 |
| Guion B3: cancelar consentimiento (0 tráfico) → confirmar (cinco GET exactos) → volver → misma observación (sin pedir nada nuevo) → recargar y **reiniciar main** la conservan | DOM 2 |
| 390/320 px sin desbordamiento, resumen ≥ 44 px, teclado en «Abrir Integraciones» y «Volver» | DOM 3-4 |
DOM **4/4** en Chromium headless-shell 1228 (config aislada, sin Edge). Capturas abiertas e inspeccionadas: `continuidad-1440` y `continuidad-320` (`tests/.tmp/home253-*/`).

## Estado verdadero de las fuentes en `main` hoy (visto en la App compilada)
Lectura de HubSpot: leída. Evidencia de copia y ensayo de relevo: «No se pudo leer» (rutas no registradas en `main`; pendientes `CODEX-CONTINUITY-EVIDENCE-MOUNT-239` y el registro de relevo/ejecutor).

## Límites y hallazgos
- Proyección con parche ≠ App real: el parche lo integra el dueño de `App.tsx`; sin él, «Abrir Integraciones» solo explica.
- **Hallazgo:** con la evidencia sin registrar, el pasaporte propone «Preparar o activar una copia local» aunque haya copia activa (engañoso); ver plan §R3. Hub largo y título duplicado (R3).
- No se probó la caducidad por reloj en la App compilada (cubierta en el arnés de 217), ni el ensayo de relevo en la App (no registrado), ni los bloqueos/segunda pestaña en la App.
- Sin llamadas reales a HubSpot; credenciales ficticias solo en la base de prueba.

## Hashes finales (sha256)
| Ruta | sha256 |
| --- | --- |
| src/ContinuityHome.tsx | e54a48da1fa268c2ce5002f2e51eebc888d0db93ffc7aae4dbc796a8977c9858 |
| src/continuity-home-hub.css | 18ccf4437d2f57ed3de2fdfd36b76ac5c6af806e3f21375e8fffeb72dbb0de6b |
| tests/continuity-home-hub.test.ts | 44a5f37e1802d36479b3c93922e5d6d8fe20c4152ecf21a9afef114ab024219e |
| tests/e2e/continuity-home-hub.spec.ts | 5428eb4d518d36a4efbb3535e59e353c7b0661a50886dbc0515a159967d47b02 |
| coordination/plans/MONTAJE-APP-253.md | 7341a55efbe21a90046770e615c70059564d5b8d94f5eb044ec767dccc7a386b |
| coordination/reports/CLAUDE-HUB-MOUNT-253.md | (este informe) |
Procesos propios: main de prueba y proveedor ficticio cerrados con cada prueba.
