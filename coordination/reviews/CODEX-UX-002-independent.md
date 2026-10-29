# Revisión independiente CODEX-UX-002

29/10/2026, Europe/Madrid. Revisor Codex review_h2, distinto del autor. Dictamen final: aceptar tras corregir la precisión de texto señalada y cotejar la presentación vigente, como revisor distinto del autor. Solo este informe, sin fuentes o contratos modificados, llamadas a cuentas o envío de fuentes a Claude.

## Trazabilidad y comportamiento

followupDraft construye context con label Cliente y nombre/apellidos del contacto. CommercialService.prepare conserva draft.context en team_sales_proposals.context; overview selecciona ese contexto junto a la propuesta. CommercialProposal declara context opcional con pares string. No se busca contact_id contra contactos de una captura nueva, evitando reetiquetar propuestas históricas si un ID coincide en otro portal.

El render toma la etiqueta Cliente, recorta espacios y recurre a content.recipient si no existe o queda vacía. No analiza cuerpo/asunto, inventa un nombre o exige nuevas lecturas. El valor se representa como texto JSX escapado. Referencia de revisión, contenido, controles, permisos y handlers permanecen iguales. El nombre es contexto guardado, no identidad humana verificada.

## Precisión de producto comunicada

La primera versión decía Cliente al preparar incluso cuando mostraba content.recipient como fallback. Para propuestas antiguas sin contexto, recipient puede cambiar desde CommercialEditor y CommercialService.edit; no es necesariamente el correo original al preparar. Se comunicó al autor para usar etiqueta neutral o distinguir Destinatario del borrador en ese caso. El nombre del contexto sí es histórico. No exige cambiar contratos o guardar otro campo. El helper puro final proposalContactLabel corrige ese matiz: devuelve Cliente al preparar solo con nombre de contexto; en ausencia o nombre vacío devuelve Destinatario del borrador junto al correo editable. Se cotejó la versión final sin cambios de handlers o contratos.

## Límites

Sin QA visual, interacción, móvil o lector de pantalla real: navegador Work deshabilitado. No se añaden tests espejo para una expresión de render sencilla. El autor acredita typecheck y buildVite finales correctos a ux002-build-final. No se repitieron esos comandos por este revisor. El informe y los hashes actuales coinciden con la presentación. La memoria reservada corresponde al coordinador.


## Versiones y aceptación

- src/CommercialWorkspace.tsx: 6bc56ae71ab4bbfac4c914acdba6fd37197beadb071ca4279737fb969145fd78
- coordination/reports/CODEX-UX-002.md: c60a5aadda9fe7d67c545a407a5ed33c42970f3949e54a7cef830d2b68850bc8

Los casos presentes, ausentes, nombre vacío y destinatario editado quedan cubiertos por inspección estática, sin inventar QA de navegador. No se acepta globalmente el informe UX heredado. CODEX-UX-002 aceptada por el revisor distinto del autor; este propio informe se presenta sin autoaceptarlo. Coordinador mantiene actualización de memoria/panel reservados.
