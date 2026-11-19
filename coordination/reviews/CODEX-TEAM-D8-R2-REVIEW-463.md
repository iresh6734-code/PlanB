# Equipo D8 R2 y nombres de la demo

Revisión del 19/11/2026, Europe/Madrid, sobre un banco congelado. Coincidieron todas las huellas del tablón y las referencias a TeamApp, CommercialWorkspace y team.css. El build Vite, el servidor de equipo, TypeScript y las 51 pruebas focales terminaron correctamente.

## CLAUDE-TEAM-D8 · Aceptar R2

Se recorrieron ocho secciones con cuatro perfiles en Chromium y tres secciones de Solo lectura a 390 px. La captura en lectura permanece deshabilitada con «Necesita reconectar» y solo el motivo de renovar la autorización. El caso de portal ausente conserva el mensaje «Conecta primero». Los perfiles sin permiso conservan el motivo de permisos. No hubo solicitudes externas, errores de página ni respuestas HTTP de error.

## CLAUDE-TEAM-DEMO-NAMES · Solicitar R2 para el recorrido E2E

Se verificó «Empresa de prueba Arce» en la tabla de Arce y en la ficha de Lucía, y «Empresa de prueba Faro» al escoger el otro espacio desde «Empresa activa». La tabla de ambos espacios deja de mostrar la denominación antigua.

El spec presentado sigue abriendo la antigua portada del equipo. Con solo adaptar el origen al puerto efímero, pasa 1/2: falla cuando busca el botón de Lucía antes de llegar al cambio. Una copia con el cambio adicional de la primera ruta a «/team?view=records» pasa 2/2. La corrección conserva las aserciones de nombre, persistencia, foco, tamaños móviles, borrador y aprobación bloqueada. Aplicar la navegación corregida en el spec reservado y volver a presentar.

Evidencia temporal en «tests/.tmp/team463-qVJc5l». El recibo de los perfiles, recarga y nombres está en «browser-9ziJmJ/results.json». El contraste del spec se encuentra en «browser-U8CzqQ/current.log» y «browser-U8CzqQ/adjusted.log». Solo se guardaron acciones en la base ficticia del banco; el piloto instalado queda fuera de la revisión.
