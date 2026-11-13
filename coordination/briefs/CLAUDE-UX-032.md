# Prompt para Claude · CLAUDE-UX-032

Trabaja en `D:/AI/Plan-B-CRM-v2.1/source`. El usuario ha pedido colaboración paralela contigo y Codex. Tu encargo es **CLAUDE-UX-032: completar R12, selector accesible de clientes**. Codex tiene **CODEX-REL-033**, herramientas de integridad y versiones en `tools/releases/`; no edites sus archivos. Este prompt está preparado para que el usuario te lo entregue: su existencia no acredita que ya lo hayas recibido.

Lee AGENTS.md, CONTEXTO-PROYECTO.md y COORDINACION.md. Consulta el encargo con `node tools/coordination/board.mjs brief CLAUDE-UX-032`. Si está ready, resérvalo con `node tools/coordination/board.mjs claim CLAUDE-UX-032 claude`. Si ya está working en otra sesión, no lo dupliques. Una sola sesión Claude, sin subagentes. Antes de cada edición usa check-path. No edites el JSON del tablón.

## Resultado

Sustituye el ContactSelect interno de CommercialWorkspace por un combobox reutilizable para «Cliente del seguimiento» y «Cliente para los documentos». Conserva el estado de cliente compartido, selección por ID, roles, revisión/aprobación y borradores. Reutiliza contactLabel/filterContacts sin modificar esos helpers.

1. Búsqueda por nombre/correo/teléfono, sin distinguir acentos, y etiqueta que diferencie homónimos. Limita opciones renderizadas y comunica el total; no pintar miles de nodos.
2. Teclado completo: flechas, Enter, Escape y Tab. Ratón y retorno de foco previsibles. Etiqueta accesible y atributos combobox/listbox/option, expanded/controls/activedescendant/selected coherentes con los nodos existentes.
3. Escribir una búsqueda no selecciona un cliente ni permite preparar un seguimiento. La selección solo cambia por confirmación explícita. Enter con la lista abierta no ejecuta ni envía una propuesta.
4. Vacío, sin coincidencias, selección borrada, cliente que desaparece y cambio de espacio. Nunca elegir otro cliente automáticamente ni conservar una selección de otra empresa. Cambiar entre Seguimientos/Archivos mantiene el cliente compartido.
5. No nuevas peticiones, almacenamiento, dependencias o cambios de servidor. Mantén fuera de alcance R08 y cualquier rediseño general.

## Únicos archivos de escritura

- src/CustomerCombobox.tsx
- src/customer-combobox.css
- src/CommercialWorkspace.tsx
- tests/customer-combobox.test.ts
- tests/ui-journeys.test.ts
- tests/e2e/customer-combobox.spec.ts
- tests/e2e/v6.spec.ts
- tests/e2e/customers.spec.ts
- tests/e2e/ux.spec.ts
- tests/e2e/session-lock.spec.ts
- coordination/reports/CLAUDE-UX-032.md

No tocar App.tsx, TeamApp.tsx, TeamCompanyHome.tsx, helpers compartidos, otros tests, servidor, package/lockfile, memoria, panel, build/dist o tools/releases. Si necesitas otro archivo, registra block y explica la necesidad; no amplíes alcance ni liberes cambios descartándolos.

## Validación y carga de trabajo

Primero prueba el componente con datos sintéticos: homónimos, acentos, lista grande, búsqueda que no cambia ID, teclado/cancelación/limpieza y selección que desaparece. Usa React DOM en el E2E; distingue esas pruebas de un arnés de hooks. Después integra y actualiza únicamente los pasos afectados por dejar de usar selectOption en los E2E reservados. Conserva todas las aserciones de revisión, ejecución, borradores y caducidad de sesión: no las elimines para hacer pasar las pruebas.

Pruebas focales en serie, un navegador y un trabajador E2E. Typecheck al final; build de Vite solo en tests/.tmp/claude-ux032. Usa configuración temporal y datos/puertos aislados; no alcanzar las instalaciones4331/4334. Nunca npm run build, baterías completas repetidas, instalación de dependencias o nuevos subagentes. Codex hará sus pruebas Node aparte y no lanzará Vite/E2E mientras validas esta entrega.

Comprueba1440/390/320px, consola y red externa bloqueada. Si un caso falla, identifica primero si es producto o arnés. Registra resultados reales y límites, sin afirmar API remota o lector de pantalla probado sin evidencia.

## Entrega

Informe con cambios, comandos, resultados, límites y hashes en coordination/reports/CLAUDE-UX-032.md. Presenta con `node tools/coordination/board.mjs submit CLAUDE-UX-032 claude --note "Cambios, comprobaciones y límites"`. Deja de editar después de submit hasta que Codex revise o devuelva la entrega. No aceptes tareas, hagas commit/push, despliegues, reinicies servicios o encadenes otra unidad por tu cuenta. No acceder a proveedores, cuentas, claves, sesiones, perfiles personales, Gmail/IFR/recursos corporativos o equipo original.
