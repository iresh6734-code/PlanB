# Plan B · Arranque y misiones del 5 de noviembre

El 5/11/2026 a las 16:54 Europe/Madrid quedó lista la app de ensayo en [127.0.0.1:4596](http://127.0.0.1:4596/). La consulta inicial con permiso de loopback dio `ECONNREFUSED`. La instancia nueva usa la raíz `tests/.tmp/preview202-3aceES/runtime`, PID `13160`, identidad `fe8a0bf4-87f0-4471-96e6-83939174fdca` y handle `51056`. El lanzamiento generó una base y una clave de tipo `test` nuevas. Reutilizó la semilla ficticia de 193 con 62 registros y cero cambios, el backend compilado aceptado y los 15 activos de ese corte. Conserva la fecha original de la captura ficticia y usa una identidad de instalación nueva.

El backend tiene SHA-256 `44b36ec8301e0f001b519e78e135a5ec7be076e0bdd1fba3fc2228c93132c1a8`. El arranque cotejó el binario, los activos y el bloqueo de tráfico externo. Después se cotejaron 48 entradas de compilación y 15 activos entre disco y HTTP. `/api/health`, `/api/v2/state` y la lectura de revisión de tarea respondieron con 200 y la identidad esperada. El binario se reutilizó, por lo que el arranque acredita el corte 193 y no el checkout en edición.

Chromium aislado abrió la ficha de `contact-14` con Ctrl+K, flechas y Enter mediante el ID y la revisión seleccionados. Se comprobaron 1440, 390 y 320 px. Se abrió la captura de 320 px, con foco visible y filas legibles. Un segundo recorrido verificó 14 filas en Hoy, botón habilitado de revisión local en Agentes y apertura con teclado del detalle de ensayo de Integraciones. Los dos recorridos observaron cero escrituras, peticiones externas y errores de página. La revisión de Agentes se comprobó como acción disponible. La herramienta que muestra la app en el panel devolvió `queued`.

Evidencias en `tests/.tmp/preview202-3aceES`: `ready.json`, `served-audit.json`, `smoke-result.json`, `surfaces.json` y capturas. Se usaron scripts temporales `preview202-prepare.cjs`, `preview202-run.cjs`, `preview202-smoke.cjs`, `preview202-audit.cjs` y `preview202-surfaces.cjs`.

## Estado que guía los encargos

- 170 R2 está aceptada. 171 está en desarrollo y reserva App y Hoy. 199 está en revisión como componente sin montar. Se coordinó que el otro Codex pueda revisar 199. 196 y 201 permanecen en revisión. El corte de reservas mostró cero rutas compartidas.
- 166, 183, 185 y 187 sustentan el próximo guardado condicionado. La vista relanzada conserva el formulario anterior. Reapertura por intento, persistencia de intención y jornada se proponen como paquetes separados.
- HubSpot 160 y 173 R2 están aceptadas para su alcance comprobado. El montaje protegido y la experiencia por objeto siguen pendientes. Se necesita un portal de ensayo y autorización expresa para ejecutar la comprobación real.
- 116 R4 y QA136 R2 están aceptadas. La misión de continuidad puede abrir una reserva nueva para llevar el ensayo de relevo al recorrido de la app. 201 mantiene las rutas de evidencia de simulacro y coordina su contrato con el pasaporte.

## Encargos preparados

- `coordination/briefs/CLAUDE-MISION-TRABAJO-SEGURO-202.md` cubre cierre de 171 y prueba en StrictMode, reapertura del intento exacto, decisiones, revisión condicionada y comparación, borradores recuperables y jornada priorizada. Los cambios de App se secuencian en el tablón.
- `coordination/briefs/CLAUDE-MISION-CONTINUIDAD-202.md` cubre API de lectura, capacidades verificables por objeto, pasaporte, Kit de Relevo y mapa de impacto con resumen de turno. Los montajes centrales se acuerdan con Codex y la evidencia del otro frente llega mediante un resumen explícito por contexto.

Los briefs son entregables locales para las dos sesiones Claude. Se comunicó el arranque y el reparto al chat Codex autorizado. El propietario de `CONTEXTO-PROYECTO.md` es CODEX-LAB-035 y recibe el traspaso para registrar el corte bajo su reserva. La entrega 202 se presenta para revisión independiente.
