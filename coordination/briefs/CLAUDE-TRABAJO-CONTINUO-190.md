# Prompt A · Trabajo continuo, decisiones de guardado y recuperación

Trabaja como responsable de la experiencia operativa de Plan B. El resultado que busco es que una persona pueda abrir una tarea desde Hoy, editar, cerrar la ficha, navegar, volver y entender con precisión qué se guardó y qué falta resolver. Después incorpora revisión condicional y recuperación de intentos. Entrega producto utilizable dentro de la App; conserva un único recorrido de guardado.

## Arranque y reparto

Repositorio: D:\AI\Plan-B-CRM-v2.1\source. Lee AGENTS.md, CLAUDE.md, COORDINACION.md, CONTEXTO-PROYECTO.md y el tablón mediante tools/coordination/board.mjs. Aplica las instrucciones y skills vigentes. Este encargo no inicia una sesión ni acredita actividad permanente.

Corte comprobado el4/11/2026:
- CLAUDE-TASK-OUTCOMES-U1-148 R2 está done: Codex174 repitió39Node,27DOM y un caso independiente. No sigas esperando su aceptación.
- CLAUDE-TASK-OUTCOMES-CONTRACT-170 está ready y puede reclamarse; U2-171 espera170done.
- Clientes166/183, servidor185 y recorridoHTTP187 están done. Lee sus handoffs y dictámenes184/186/188; no reinventes esos módulos.
- Preview181 aceptada en4595 conserva UI158legacy y backend anterior185. Las fuentes aceptadas no están instaladas automáticamente allí.
- Codex189 trabaja exclusivamente en WorkspaceSearch, su CSS y pruebas propias. El otro Claude trabaja HubSpot173 y QA136rescate. No edites sus rutas.

Los IDs136 y160 pertenecen a varios flujos distintos: usa siempre el identificador completo. La reserva sobrevive a review y no caduca por lentitud. Retoma solo las reservas de tu propia entrega/sesión; una sesión distinta requiere traspaso explícito. Cada nueva fase necesita una unidad con archivos exactos, claim y check-path antes de escribir. No amplíes una unidad en marcha.

## Fase1 · Terminar170

Reclama la unidad existente y limita cambios a sus cinco rutas: shared/task-save-outcome.ts, src/task-save-outcome.ts, tests/task-save-outcome.test.ts, tests/task-focus-outcomes.test.ts y su informe.

Implementa:
1. dispose idempotente: rechaza nuevas operaciones y evita que una comprobación pendiente termine despachando un PATCH tras retirar al propietario. Comprueba también la frontera inmediata anterior al despacho.
2. Un envío que ya salió sigue siendo enviado o incierto; abortar no se presenta como deshacer.
3. Sustitución de setOnConfirmed con versiones de consumidor: un éxito o rechazo tardío del callback anterior no acredita que la vista nueva esté actualizada. Repetir lecturas no repite el guardado; registrar dos veces no duplica recargas ni genera bucles.
4. OutcomeRefreshError tipado, mensajes controlados distintos para estado de App y lista de Hoy, y texto genérico para errores desconocidos.

Usa barreras deterministas antes/durante/después del despacho. Presenta170 para revisión; conserva los hashes durante review. Mientras esperas puedes estudiar la fase siguiente, sin editar sus archivos.

## Fase2 · U2 en la App real

Tras170done, reclama U2-171 y respeta sus nueve rutas del tablón. App.tsx y LocalOperations.tsx son de este frente, no del otro Claude.

Monta una instancia del gestor por propietario de sesión. La ficha y la superficie de resultados comparten exactamente esa instancia; la superficie sobrevive al cierre de la ficha y a salir de Hoy. Sin singleton global.

El acuse y las lecturas posteriores son hechos separados. Actualiza primero el estado padre y después Hoy cuando corresponda. Propaga el error real; conserva el acuse y reintenta solo lecturas. Si desaparece la fila, el foco vuelve a un destino útil. Mantén los estados 401/404/409/422, borradores y atribución servidor/persona de U1R2.

Bloquear requiere especial cuidado: retirar el propietario impide envíos aún no despachados, pero no borra un envío ya intentado. Oculta detalles al bloquear, evita contaminación entre sesiones y conserva la información mínima que permita explicar qué quedó pendiente. Diseña esa transición con Codex. Si únicamente queda un contador, no declares resuelto el seguimiento de operaciones tras el bloqueo. La persistencia tras reiniciar sigue siendo otra garantía.

Criterio imprescindible: prueba D7 en la App real, cerrar y navegar durante un guardado, perder el acuse, confirmar después, fallar cada recarga, bloquear antes/después del despacho y desbloquear sin mezclar propietarios. Comprueba teclado y1440/390/320 e inspecciona capturas finales. Un arnés no sustituye esta evidencia.

## Fase3 · Guardar contra la versión revisada

TrasU2aceptada, registra la integración del contrato del gestor y su estrategia con166/183/185. Reserva las rutas exactas necesarias; no construyas otro gestor.

Conserva contexto completo, token original, changed/unchanged/current y procedencia. No renueves el token ni reenvíes silenciosamente tras conflicto. Un no-op no incrementa cambios ni se anuncia como otra escritura.

La persona debe poder comparar base revisada, borrador y versión actual; conservar lo escrito y elegir expresamente qué mantener antes de un nuevo intento. Reutiliza comparación/rebase existentes. Si cambia instalación/cuenta/captura, explica la incompatibilidad y conserva el borrador; no presentes dos copias como una sola tarea por compartir ID.

Tras acuse perdido, comprobar solo haceGET. Coincidencia de valores no demuestra autoría. Aceptar esa lectura es una decisión humana y continúa rotulada como tal. readContext123 puede emitir planb:locked ante401 en navegador: contempla ese efecto heredado en el propietario y el orden de acceso.

## Fase4 · Reabrir y continuar

Nueva unidad: al reabrir una tarea, adopta su intento pendiente exacto por instalación/captura/contexto/taskId/attemptId. Muestra el mismo estado; evita otra solicitud de guardado. Comprueba homónimas, cambios de contexto, respuestas tardías y ausencia de intentos compatibles. No fuerces una adopción ambigua.

## Fase5 · Cuaderno reiniciable

Después del flujo anterior aceptado, acuerda con Codex una unidad de persistencia local de intenciones/resultados. Persistir antes de intentar enviar; tras reinicio, lo que carece de acuse sigue incierto. Nunca ejecutar automáticamente una cola al arrancar. Probar cierre abrupto, corrupción, escritura incompleta, contexto incompatible y lectura posterior sin reenvío. Reutiliza almacenamiento/cifrado existentes cuando el contrato lo permita. Store y Recovery siguen reservados por Codex: no los edites. Si la fase requiere montaje central, entrega el módulo y traspaso concretos para Codex.

## Forma de trabajar y entregar

Antes de añadir superficies, audita el recorrido actual y coloca cada acción donde la persona ya trabaja. Evita multiplicar menús o un panel por subsistema. Estados vacíos útiles, errores recuperables y un siguiente paso claro.

Entrega por unidades completas: problema, cambio, hashes, comandos, pruebas sobre el corte final, baseline causal cuando aporte valor, capturas realmente abiertas, procesos propios cerrados y límites. Actualiza la huella130 solo en unidad propia después de repetir su QA, no para silenciar una discrepancia. No autoaceptes ni declares integrado lo probado solo en un arnés. Tras un dictamen, corrige bajo tu reserva o encadena la siguiente fase autorizada; no repitas suites idénticas sin un motivo nuevo.

No proveedores, credenciales reales, equipo corporativo, nuevas dependencias, worktrees, commits, despliegues o reinicios de demos ajenas. El éxito final es un recorrido de trabajo y recuperación demostrable en la App, no el número de pruebas o documentos producidos.
