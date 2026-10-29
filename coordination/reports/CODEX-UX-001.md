# CODEX-UX-001 · Motivos de seguimiento deshabilitado

29/10/2026, Europe/Madrid. Mejora acotada de Codex, basada en el hallazgo 4 del informe heredado CLAUDE-002 y contrastada con el componente actual. No se vuelve a consultar a Claude para una modificación sencilla ni se envía fuente nueva.

La ficha explica junto al botón todas las causas aplicables: operación en curso, acceso de lectura, fuente comercial no activa y falta de correo en los datos guardados. La explicación se vincula al botón con aria-describedby y un useId estable. Se deriva durante render; no se añade estado o efecto para sincronizar motivos.

Con datos cargados, prepareReasons.length>0 conserva exactamente busy || !canWrite || !data.source.canPrepare || !data.contact.email. No cambian handlers, destino o payload de preparación; continúan internalOnly y sourceKey. No se autoriza ninguna acción antes prohibida, ni se modifican datos de clientes, contratos o CSS.

Validación: node node_modules/typescript/bin/tsc --noEmit correcto; Vite build correcto a ux001-build en la carpeta de visualizaciones del chat, sin vaciar otro directorio ni copiar al piloto. Advertencias conocidas Rollup/Zod y destino externo no vaciado; sin errores. No se escriben tests que dupliquen expresiones simples de render. La revisión independiente verifica equivalencia de habilitación y uso de claves por el consumidor.

El único consumidor encontrado, TeamContacts, remonta la ficha con key tenant:selected:showCrm; cambiar empresa, contacto u origen reinicia datos y motivos. El componente aislado mantiene la limitación previa de no limpiar data ante path/query nuevos sin remount; no se presenta como un componente genérico robusto para otro consumidor.

Límites: sin QA visual, lector de pantalla real o interacción de navegador, porque Work tiene navegador local deshabilitado. No se elude esa configuración. Build separado y fuente revisable; no desplegado o reiniciado. La aceptación de esta mejora no acepta globalmente el informe UX antiguo: CODEX-COMP-006 documenta otras dos afirmaciones inexactas que siguen pendientes de corrección.

Hash src/CustomerDossier.tsx: f1f9b265affecd51b26a37ffaad3c5f891a452c43a854a74c140a5df1640c1b8
