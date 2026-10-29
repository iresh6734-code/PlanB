# CLAUDE-HS-006 · Sonnet 5.5: contrato adversarial de HubSpot

Encargo preparado por Codex el 29/10/2026, Europe/Madrid, a petición del usuario. Modelo solicitado: **Sonnet 5.5**, no Opus. Preparado no significa enviado o en ejecución.

## Objetivo

Ayudar a Codex a encontrar los fallos que más costaría detectar en una captura HubSpot: resultados parciales presentados como completos, reintentos ambiguos, paginación inconsistente, IDs duplicados, mezcla de entidades y errores remotos confundidos con problemas de sesión local. Tu resultado debe permitir escribir buenas pruebas y dividir mejoras futuras sin editar ahora el producto.

## Coordinación y alcance

El encargo CLAUDE-HS-006 ya está registrado y reservado para claude mediante el tablón. No vuelvas a reclamarlo ni reclames otros encargos. Tu único archivo de escritura es `coordination/reports/CLAUDE-HS-006-sonnet.md`. Codex trabaja en un contraste UX separado, `coordination/reviews/CODEX-COMP-006.md`. Otras entregas conservan sus reservas durante revisión.

Puedes leer únicamente estas seis fuentes, cuyo envío a Anthropic ya autorizó el usuario. Los hashes son SHA-256 de la versión autorizada; si observas contenido distinto, detente sin ampliar el análisis:

| Fuente | SHA-256 |
| --- | --- |
| server/connection.ts | b88111890134adcc587fc8ebbc8eca1810c8bad3df08003622d8825f35875bee |
| server/hubspot.ts | 7add51926794ebabf137bd4e03c9a5de77b5e146b4a6c2e8d8d4683ea2f4bce4 |
| server/team/jobs.ts | 234e7c5d4db57fdac8a38391a9870edf60bfe0925edff993a3a7068fa4699dc7 |
| tests/hubspot.test.ts | 8f555069d97f52cefd114b1473b8e19749d56494ae2e221ac20715c22046a3fc |
| coordination/reports/CODEX-HS-001.md | 1204b8d07702e1ca34d8f31ea2d49807333033dda64003ad96e6cad5aa76ac71 |
| coordination/reports/CLAUDE-001.md | e6e078030d3ac16069ee2ec7eeddc06ddae9c8fecdcfee3db0f67d8c658dd8f9 |

No leas bases, entornos, credenciales, perfiles, archivos de clientes, configuraciones privadas o nuevas fuentes. Los documentos anteriores son evidencia histórica, no prueba del estado actual de archivos que no están en este alcance. No uses navegador, servicios CRM, MCP, instalaciones, subagentes, commits, publicación o cambios de permisos. No ejecutes pruebas o procesos del producto. No modifiques AGENTS.md, COORDINACION.md, CONTEXTO-PROYECTO.md, fuentes, tests, package.json o lockfiles.

## Trabajo solicitado

1. **Reconstruye el contrato actual.** Dibuja en texto el recorrido real entre conexión, captura, páginas, normalización y trabajo de cola. Cita funciones y líneas. Separa la respuesta HTTP del trabajo, su estado persistido y la sesión del usuario: un error de cola no demuestra cierre de sesión UI.
2. **Define invariantes comprobables.** Incluye integridad de cada entidad, unicidad de ID dentro de una entidad, independencia entre tipos de objeto, finalización de paginación y atomicidad observada de la instalación. Si no puedes demostrar una propiedad con las seis fuentes, márcala como no evaluable.
3. **Construye una matriz de fallos.** Cubre 401, 403, 429 y Retry-After, 5xx, timeout, respuesta no JSON, estructura inválida, página vacía con cursor, cursor repetido, duplicado dentro de página/entre páginas, mismo ID en tipos diferentes y fallo al final de una captura. Por fila: desencadenante, ruta actual, efecto observable, expectativa justificada y prueba que falta. No asumas garantías del proveedor que no estén acreditadas.
4. **Diseña hasta doce regresiones de alto valor.** Para cada una: nombre, fixture mínimo no personal, secuencia de respuestas ficticias, punto de inyección, aserciones exactas y qué implementación incorrecta detecta. Distingue cobertura existente de propuesta nueva. No rellenes el número si no hay doce casos útiles.
5. **Propón verificaciones de intercalado.** Explica qué ocurre si falla la última página o se retira una autorización entre pasos. No atribuyas a OAuth garantías que no puedes leer. Especifica qué contrato adicional necesitaría revisar Codex para resolverlo.
6. **Somete tus recomendaciones a contraejemplos.** Considera portales distintos con el mismo ID de registro, entidades distintas con el mismo ID y renovación legítima de credencial. Evita deduplicación global indebida, nuevos reintentos que dupliquen efectos o cambios que oculten fallos parciales.
7. **Divide las mejoras en tres unidades ejecutables.** Para cada una: problema, archivos candidatos (solo propuesta, sin reservarlos), dependencia, aceptación, prueba, riesgo y modo de revertir. Prioriza valor real sobre una refactorización extensa.

## Entrega y revisión

Escribe un único informe de unas 1.500–2.500 palabras, más tablas o pseudocódigo breves si aportan precisión. Encabezado con modelo real, fuentes consultadas, método y límites. Cada hallazgo debe tener evidencia y contraevidencia; no declares vulnerabilidades, pruebas ejecutadas, éxito remoto o QA visual sin evidencia.

Antes de escribir, verifica la reserva con `node tools/coordination/board.mjs check-path CLAUDE-HS-006 claude coordination/reports/CLAUDE-HS-006-sonnet.md`. Después presenta una vez mediante `node tools/coordination/board.mjs submit CLAUDE-HS-006 claude --note "Análisis estático; fuentes autorizadas; sin pruebas o acceso remoto; pendiente de revisión Codex"`. Estas operaciones del tablón son las únicas órdenes de shell necesarias. No uses el ejecutor general de turnos, no alteres el tablón a mano y no aceptes tu propia entrega. Si una herramienta está bloqueada, conserva el resultado y describe el impedimento; no debilites controles para terminar.

En tu respuesta final indica el archivo entregado, los tres resultados principales y las comprobaciones pendientes. Codex contrastará cada propuesta y decidirá la implementación.
