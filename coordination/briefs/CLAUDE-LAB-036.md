# Claude · Laboratorio de continuidad (LAB036)

Encargo preparado por Codex para el plan solicitado el 29/10/2026. No acredita envío ni ejecución. Primero termina/presenta las correcciones de UX032 y respeta UX034. No cambies fuentes presentadas sin devolución. Consulta AGENTS.md, COORDINACION.md, CONTEXTO-PROYECTO.md y el tablón.

LAB036 depende de la aceptación de CODEX-LAB-035. No lo reserves hasta que la herramienta lo permita. No edites el motor ni App/TeamApp, paquetes, memoria, panel, backend o archivos reservados. Si necesitas ampliar el contrato, presenta la causa sin modificarlo.

## Objetivo

Crear una demo de laboratorio de caídas, claramente separada de la instalación real. La persona compara caída de CRM y pérdida de equipo, duración, antigüedad de copia y evidencia de ensayo. Ve causas y siguientes pasos, tareas vencidas/durante la caída/sin fecha y límites del cálculo.

## Archivos exactos

- src/ContinuityLab.tsx
- src/continuity-lab.css
- design/continuity-lab/index.html
- design/continuity-lab/main.tsx
- tests/continuity-lab-ui.test.ts
- tests/e2e/continuity-lab.spec.ts
- coordination/reports/CLAUDE-LAB-036.md

Lectura del contrato `shared/continuity-lab.ts` y fixture `scripts/demo-continuity-lab.ts` tras su aceptación. Usa `evaluateContinuityScenario`, sin duplicar cálculos en JSX. Props explícitas de entrada/actualización controlada; no guardar evidencia en localStorage ni importar datos de una instalación. El fixture es enteramente sintético. Banner visible «Simulación · datos ficticios · no ejecuta recuperación». No mostrar preparado global ni recuperación real por el resultado de un fixture.

## Comportamiento y aceptación

1. Conserva identidad española blanca/oscura/azul, jerarquía simple y controles con etiqueta. Diseña para leer causa y actuar; evita porcentajes inventados, importes en riesgo o una estética de alarma permanente.
2. Al cambiar escenario, compara qué evidencia falta. No conviertas null en cero. Mostrar objetivos y mediciones con unidades legibles y explicar antigüedad frente a datos perdidos.
3. Separar disponibilidad declarada, simulacro local y restauración en otro equipo. Cualquier edición de fixture que cambie la captura debe invalidar evidencia anterior; no reetiquetar sus IDs para que parezca válida.
4. Estados vacío/entrada inválida/resultado sin demostrar/bloqueado/fuera de objetivo/preparado según entradas. Errores visibles y accesibles; no suprimir fallos del motor con un resultado exitoso.
5. Demo aislada, sin enlaces al piloto, red externa, cuentas ni acciones de CRM. No modifiques la navegación real.
6. Pruebas causales contra el motor y DOM real: pérdida del equipo sin restauración no está preparada; dato ausente no muestra cero; cambiar duración mueve las tareas en límites correctos; teclado y escritorio/390/320 sin overflow. Ningún botón simula recuperación exitosa.

Usa el procedimiento de build aislado del proyecto en tests/.tmp/claude-lab036; jamás npm run build. Un trabajador/un navegador, coordina ventana de pruebas con otras unidades. Sin dependencias nuevas. Reporta comandos, resultados, capturas, hashes y límites; presenta mediante submit y deja de editar. Codex revisa antes de aceptar. No despliegues ni autoaceptes.
