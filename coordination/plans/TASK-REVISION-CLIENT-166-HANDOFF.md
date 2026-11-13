# Cliente con revisión · traspaso 166

4/11/2026, Europe/Madrid. Pendiente de revisión de Codex. No montado en la ficha ni en el gestor de Claude.

`createTaskRevisionClient({ base?, fetch?, timeoutMs?, maxResponseBytes? })` devuelve:

- `read(taskId, expectedIdentity?, signal?)`: `read/current`, `context-changed` o `failed/status/message`. La identidad opcional compara instalación, ID y fecha de captura. Es un contrato más pequeño que TaskContext123: no comprueba por separado cuenta/generación. Un consumidor que necesite ese contexto completo debe conservar las comprobaciones de123 antes y después de leer. Una lectura por sí sola no demuestra autoría.
- `save(reviewedView, values, signal?)`: `changed/current`, `unchanged/current`, `conflict` únicamente para409/TASK_REVISION_CHANGED, `rejected/status/details`, `not-sent` antes de despachar por validación/cancelación previa, o `uncertain` si no hay acuse válido tras intentar enviar. No se reintenta automáticamente ni se recurre a la ruta antigua.

Al abrir, conservar juntos registro y revisión leídos. Para guardar, pasar esa vista y solo los campos cambiados. Tras `changed` o `unchanged`, conservar la revisión devuelta para un intento explícito posterior. `unchanged` significa que no se añadió una operación de historial; necesita un texto distinto de «se ha guardado un cambio».

Tras conflicto conservar el borrador y comparar antes de decidir. Tras incertidumbre, leer con la identidad esperada; observar valores coincidentes no prueba quién escribió. No renovar silenciosamente el token y reenviar.

Este módulo no implementa directamente SaveStrategy136: su resultado distingue el no-op y devuelve la nueva revisión, datos que el SaveOutcome actual no conserva de esa forma. La adaptación futura requiere una unidad acordada con Claude, con rutas exactas y pruebas; no modificar U1-148 durante su trabajo. El guardado es una llamada propia al endpoint; no hay verificación previa que sustituya la comparación de revisión del servidor.

Predeterminados:20s por petición y2MiB leídos. También limita transportes que ignoren AbortSignal; cancela el lector al superar tamaño/plazo. Las respuestas necesitan JSON UTF-8 válido y contrato completo; el acuse debe corresponder a la tarea, instalación, captura, valores enviados y transición de revisión. Rechaza redirecciones, no persiste datos y usa credenciales same-origin. Las pruebas permiten inyectar un transporte y límites distintos.

Necesita160 activada en el lanzador; si la ruta falta, informa del error y no usa legacy. Las garantías del servidor siguen limitadas a un escritor cooperativo; las rutas antiguas no están protegidas por comparación de revisión. Los clientes actuales continúan con su implementación anterior hasta su integración y prueba en App.
