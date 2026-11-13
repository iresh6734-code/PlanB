# CLAUDE-RESCUE-KIT-QA-136 · Checkpoint (no es aceptación)

02/11/2026. Presentada con `submit`; informe en `CLAUDE-RESCUE-KIT-QA-136.md`, traspaso en `coordination/plans/RESCUE-KIT-QA-136-HANDOFF.md`. Autora de 116: QA propia, no revisión independiente.

## Estado
- Hecho: aclaración de evidencia; arnés con raíz propia (25 casos: reclamos, caídas, staging, contenido, captura, aislamiento); dos ejecuciones simultáneas 25/25 + 25/25; reproducción de la interferencia de 116; traspaso.
- Efecto en 116: la QA reprodujo cuatro defectos de la entrega; se corrigieron bajo la reserva de 116 (R2, ya presentada).
- Pendiente (no de esta unidad): revisión de Codex de 116 R2 y de QA-136; hallazgo del PID compartido (regresión «CARRERA» de 116 sensible a la carga: ver informe §6); invertir `tests/independent-rescue-claim.test.ts`; verificación en otro equipo.
- `tests/e2e/rescue-capsule-followup.spec.ts`: reservado y no creado.

## Siguiente acción exacta
Que Codex revise 116 R2; si la devuelve, añadir `owner` al reclamo y rehacer la regresión de la carrera con PIDs distintos, bajo la reserva de 116.

---

## R2 · 4/11/2026 (tras el dictamen 180; no es aceptación)

- Caso 8 sustituido por una **regresión vigente** de 116 R4 (mismo PID, owner distinto, sin `fakePid`): reclamo y staging de la primera sin cambios tras el rechazo `ALREADY_IMPORTED`; al soltar la primera, un único destino y reclamo `imported` concordante; worker liberado en `finally` con esperas acotadas.
- Control causal: pasa sobre R4 y **falla** (AssertionError, la segunda importa) con una copia privada de R4 a la que solo se le quita `info.owner === INSTANCE`; la caracterización histórica hace lo inverso (falla en R4, pasa con el mutante). Procedencia: **mutación de R4, no un baseline R2 completo**.
- 25 casos repetidos sobre R4 (hashes de producto coincidentes con el tablón): **25/25** serie; dos ejecuciones simultáneas 25/25 + 25/25 (10 rondas, solape 88 s, señuelos intactos). La baseline del inicio fue 24/25 con el caso 8 histórico en rojo.
- Informe, traspaso y este checkpoint actualizados al estado vigente; los resultados R2/R3 y la fuente anterior del caso 8 se conservan como historia.
- Sigue sin hacerse: DOM nuevo (no se tocó la interfaz), otro equipo, disco lleno/corte, enlaces simbólicos reales, HubSpot real.

**Siguiente acción exacta:** revisión independiente de QA136 R2 (reserva de las diez rutas intacta; `tests/e2e/rescue-capsule-followup.spec.ts` sigue sin crearse).
