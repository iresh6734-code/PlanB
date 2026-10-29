# CODEX-HS-005 · Reconexión necesaria visible en Integraciones

29/10/2026, Europe/Madrid. Ajuste de Codex después de H7, reservado antes de editar. Sin nuevas fuentes enviadas a Claude.

La cabecera distingue conexión de lectura, autorización que necesita reconectarse y estado no disponible. El aviso accesible explica el siguiente paso según conexión privada, OAuth o rol sin permiso, y aclara que se conservan las capturas. Capturar exige estado readonly, además de las condiciones anteriores de permiso y operación en curso. No inicia autorización, no borra datos ni cambia contratos.

Los estados se derivan al renderizar de overview; no se añaden efectos, estado duplicado, dependencias o CSS. Se aplica react-best-practices, regla rerender-derived-state-no-effect. El aviso usa warning-text, clase existente.

Validación final: tsc --noEmit correcto; Vite build correcto a carpeta separada hubspot-reconnect-build-final dentro de las visualizaciones de este chat. No se copia al runtime o dist del piloto. Advertencias conocidas de anotaciones Rollup/Zod y destino externo no vaciado, sin error. Primer build correcto repetido tras sustituir la clase no definida warning-box por warning-text.

No se añaden pruebas que reproduzcan estas expresiones de render. La revisión estática comprueba estados readonly/needs_reconnect/ausencia, permisos y busy. No hay QA visual o interacción real: navegador local de Work deshabilitado, sin intentar otra vía. overview refleja la última lectura, no hay detección instantánea ni nuevo sondeo en Integraciones. La protección efectiva sigue en el backend H7, incluso si la interfaz está desactualizada.

Siguiente unidad: revisión del informe UX de Claude y elección de una mejora verificable sin depender del navegador bloqueado. No afirmar validación móvil o despliegue de esta UI.

Hash src/TeamApp.tsx: 16e985bb993a69fe62d965e1a2f4ec1a41e8556bde1e3099b6cba4447978b17b
