# Reparto paralelo UX032 / REL033

29/10/2026, Europe/Madrid. Petición del usuario: un prompt para que Claude ejecute un plan mientras Codex lleva otro, sin solaparse o saturar el equipo. Aplicada la skill base compliance-autopilot-execution-core.

| Responsable | Unidad | Escritura | Pruebas |
| --- | --- | --- | --- |
| Claude, una sesión | CLAUDE-UX-032, R12 combobox de clientes | Componente nuevo, CSS, CommercialWorkspace y pruebas UI/E2E exactas de su encargo | Focales seriales, un navegador/un trabajador y build temporal al final |
| Codex | CODEX-REL-033, integridad/versiones de artefactos locales | tools/releases/workspace-manifest.mjs, tools/releases/workspace-preflight.mjs, tests/workspace-release.test.mjs y su informe | Node con fixtures/HTTP ficticio; sin Vite/E2E o batería global simultáneos |

El encargo Claude se registró **ready**; no se envió automáticamente ni se afirmó que esté trabajando. El usuario pidió el prompt para copiarlo. Codex reservó REL033: reserva y plan, no implementación terminada. Las dos listas de escritura no comparten ninguna ruta y no chocan con las reservas vigentes de entregas en revisión.

Codex prepara un manifiesto determinista SHA256/bytes, validación de rutas/archivos y comparación explícita de versión candidata frente a activos servidos. CLI por defecto sin red; lectura HTTP expresa solo a salud/índice/activos públicos de orígenes locales fijos, sin redirects, cookies, DB o configuración privada. Fuentes working/review se informan como no aceptadas; un hash no convierte una entrega en aprobada. La herramienta no despliega ni reinicia. Es el complemento operativo al cambio visible que implementa Claude y atiende la confusión previa entre código y app actualizada.

Cada agente toma su reserva antes de editar, conserva cambios durante revisión y usa block ante una ruta adicional. No se comparte App/TeamApp, memoria/panel, servidor o package/lockfile. El usuario no necesita resolver conflictos Git para esta asignación. Las reservas son un protocolo, no bloqueos del editor o garantías frente a agentes que lo ignoren.

Codex revisa la entrega de Claude con hashes vigentes y pruebas focales cuando sea presentada. La revisión de la propia entrega Codex debe quedar separada de su autor. Nada se despliega automáticamente: las instalaciones4331/4334 y sus bases/sesiones se conservan. No hay promesa de actividad permanente al cerrar el chat o de dos modelos ya ejecutándose por registrar tareas.

Prompt completo: coordination/briefs/CLAUDE-UX-032.md. Si cualquier reserva cambia antes de que Claude empiece, consultar de nuevo el tablón en lugar de ejecutar este plan a ciegas.
