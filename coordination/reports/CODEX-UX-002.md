# CODEX-UX-002 · Etiqueta de cliente conservada en la propuesta

29/10/2026, Europe/Madrid. Codex continúa el hallazgo confirmado de CLAUDE-002/CODEX-COMP-006: mostrar un identificador técnico como cliente. Fuente reservada antes de editar; sin nuevas fuentes o consultas a Claude.

La propuesta muestra el nombre almacenado en su contexto como Cliente al preparar. Cuando ese contexto antiguo no existe o no contiene nombre, muestra Destinatario del borrador y su correo. La etiqueta del fallback distingue el destinatario editable de la identidad histórica. Este matiz fue detectado y corregido durante revisión independiente, antes de presentar.

La cadena comprobada es followupDraft -> draft.context -> team_sales_proposals.context -> overview -> propuesta. No se resuelve contact_id en la lista de contactos actual; cambiar portal o captura no atribuye una propuesta anterior a otra persona con el mismo ID. No se extraen nombres del cuerpo libre ni se inventan datos.

Solo cambia la presentación. Estados, revisión, destinatario, contenido, aprobación, permisos, handlers y contratos permanecen iguales. React imprime texto escapado.

Validación final: tsc --noEmit correcto y Vite build correcto a ux002-build-final de visualizaciones, sin desplegar o copiar al piloto. Advertencias conocidas Rollup/Zod y destino externo no vaciado. Revisión estática comprueba contexto presente, ausente o vacío y destinatario editado. No se añaden tests que copien este fallback simple.

Límites: no QA visual, móvil o lector de pantalla real por navegador local Work deshabilitado. El nombre guardado representa el momento de preparación; no se presenta como una consulta de identidad actual. No se acepta globalmente el informe UX heredado ni se actúa en la sesión Sonnet solicitada en otro encargo.

Hash src/CommercialWorkspace.tsx: 6bc56ae71ab4bbfac4c914acdba6fd37197beadb071ca4279737fb969145fd78
