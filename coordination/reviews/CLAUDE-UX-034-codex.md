# Dictamen Codex · CLAUDE-UX-034

31/10/2026, 14:34:17, Europe/Madrid. Favorable dentro del alcance de foco/operaciones/errores de ficha. Se acepta esta versión tras cotejar los cinco hashes presentados antes y después de la verificación; no aceptación global del producto o instalación.

## Evidencia propia

Candidata aislada candidate-5e94390e-745e-40e1-ac1f-d412eaf4672f,329fuentes/23artefactos, typecheck/Vite/seisbundles y162Node correctos. Los cuatro archivos fuente/pruebas de UX034 coinciden con la presentación.

- **82/82Node** (22propias de la entrega+60ui-journeys), sinTODO/skip/fail. Arnés de hooks: decisiones y estado, no foco real.
- **13/13 E2E** repetidos por Codex contra team.mjs compilado, demo nueva en4412 y PostgreSQL ficticio nuevo bajoD:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/ux080-3e8b5d31-5478-49ea-b3ee-43f53fe868cd/fresh-fiction-team. Chromiumheadless1228 propio, un trabajador. Foco real, exclusión, acuses/recarga fallida, reintento del mismoID tras respuesta perdida, cierre en vuelo,401y controles de solo lectura.
- **Sensibilidad propia:** dos regresiones de doble activación (Completar y Guardar antes de render) contra HEAD:src/CustomerDossier.tsx. Ambas fallan por2peticionesfrente1; ambas pasan con la fuente presentada. Hash anterior completoeaa66280fd7a0e28cfe2bfcf8e762e96515ef5ee8ace81f4bdbd4cca08222503. No se repiten ni se atribuyen como propias las otras16/22o10/11del autor.
- Capturas nuevas1440/390/320cuando las produce el spec; el spec guarda pendientes/fallos390/320. Inspeccionadas ficha-fallo-320.png y ficha-pendiente-390.png: aviso de fallo visible bajo cabecera, texto ajustado y foco conservado. No captura1440guardada en este recorrido: la geometría desktop se ejercita, sin fingir artefacto.

Logs,node.log/baseline.log/browser.log,JSON y cuatro capturas en **D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/ux080-3e8b5d31-5478-49ea-b3ee-43f53fe868cd/evidence**. Baseline y snapshot conservados; ningún archivo de Claude editado. Browser plugin not available: fallback PlaywrightCLI existente; no navegador/perfil del usuario.

## Revisión y límites

Guarda ref síncrona impide dos mutaciones antes del siguiente render. aria-disabled/readOnly mantiene foco mientras los handlers de Guardar/Completar bloquean operación/permisos; native disabled se conserva por permisos/entrada inválida. El foco se recoloca después de pintar y solo cuando se perdió. Un acuse de acción seguido de recarga fallida queda stale y Actualizar no repite la mutación.401desmonta y la ficha no recupera foco.

No nuevos hallazgos bloqueantes en este alcance. No afirmar que todas las rutas del componente validan permisos en handler: Preparar seguimiento conserva su conducta anterior y backend/permisos no se revisaron aquí como auditoría de seguridad. El informe del autor reconoce ID nuevo si se edita tras fallo ambiguo: deuda anterior, no solucionada por esta entrega. Conserva también límites de estado de éxito fuera del viewport y botón Preparar con disabled nativo.

No lector de pantalla/Edge/rendimiento/instalación4331/4334. No proveedor/cuentas reales, entorno corporativo, dependencia, deploy/commit/push. Las peticiones adversas simuladas siguen atribuidas como tales. AUTH_PARENT072 es un fallo separado y sigue pendiente; este dictamen no lo cierra.

## Hashes aceptados

- src/CustomerDossier.tsx: `224ae6509ba7d0bde634c39e0be03f9e26f2176e1b357eedc2745987c452557a`
- src/customer-dossier.css: `54901a2e3e068e9630d9158009db414a651f9e8d3acc6488ead80c1b82e31113`
- tests/customer-dossier-focus.test.ts: `187df1cc870a4ac3d08d28ee2902cb6b2fc6e77015370f9e7efbd7c76171afa6`
- tests/e2e/customer-dossier-focus.spec.ts: `cbafa5511901ec44196f4e436061a2c8b54e433097c25f5b96ae7464cb949c3d`
- coordination/reports/CLAUDE-UX-034.md: `26edc27bd5fc7b6cc42ba8f965219d6a12f896ab29126058e5d5374150a825fe`
