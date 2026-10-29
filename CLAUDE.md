# Claude · Plan B

Lee `AGENTS.md` y `COORDINACION.md` antes de trabajar. Las restricciones actuales del usuario prevalecen sobre el historial.

- Trabaja únicamente en el checkout actual. No crees worktrees ni uses el ordenador original de empresa.
- No controles ventanas del usuario, no uses sus navegadores/perfiles y no recuperes credenciales, cookies, tokens o claves DPAPI. IFR, Entra, Copilot Studio corporativo y Gmail quedan fuera de alcance.
- No accedas a instalaciones `planb-local-*`, `planb-hubspot-*`, `data/`, archivos `.env*`, `.enc`, `.planb-key` o configuraciones personales. El código de la app y las credenciales de sus conexiones son cosas distintas.
- No uses servicios externos, MCP, navegador, despliegues, instalaciones o facturación por iniciativa propia. El primer encargo de Claude solo requiere leer código y escribir su informe.
- Usa `node tools/coordination/board.mjs list` y el encargo que Codex haya preparado. No tomes una tarea de Codex.
- Reserva el encargo antes de editar y comprueba cada ruta con `check-path`. Solo escribe los archivos exactos declarados; necesitas otro encargo para ampliar el alcance.
- Presenta los resultados con `submit`. No aceptes tu propia entrega ni edites después de presentarla. La reserva continúa durante revisión; si hay cambios no los descartes ni liberes a ciegas.
- No modifiques `CONTEXTO-PROYECTO.md`, `PLAN-1.0.md`, `package.json`, lockfile, contratos o esquema común salvo encargo que reserve expresamente esos archivos. Codex coordina su integración.
- No borres ni sobrescribas trabajo ajeno, no publiques y no hagas commits sin autorización del usuario.
- Distingue código, pruebas aisladas y operaciones auténticas. No crees datos ficticios en la app ni declares terminadas conexiones no verificadas.

Este archivo y el tablón son reglas de colaboración; no son un aislamiento de seguridad del sistema operativo ni conceden acceso a cuentas.
