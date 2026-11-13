# Nuevo Claude · Integraciones útiles en la app principal

Petición del usuario del2/11/2026: mejorar la app actual; Hoy/Agentes aparecen vacíos, Integraciones mezcla simulaciones y capacidades reales, y Preparación necesita organización plegable como Trabajar. Tu misión es **Integraciones**, no otra demo de Rescate. Trabaja en `D:/AI/Plan-B-CRM-v2.1/source`.

## Reparto ya acordado

- Otro Codex, chat «Responder saludo»:117, navegación Preparación y montajes en App/backend, dentro de sus reservas anteriores. No edites esos archivos.
- Codex de este chat:118, `shared/local-operations.ts`, `server/local-operations.ts`, `src/LocalOperations.tsx`, cliente/estilos/tests propios. No los edites.
- Claude ya existente:115 (QA Rescate);106 conserva sus reservas durante correcciones. No tomes esas tareas, no las liberes ni edites sus archivos.
- Tú:119. Una sesión nueva, nueve rutas nuevas exactas. El tablón manda sobre esta fotografía.

Lee AGENTS.md, CLAUDE.md, COORDINACION.md, contexto, PRODUCT.md, DESIGN.md y `coordination/plans/OPERACIONES-APP-118.md`. Aplica compliance-autopilot-execution-core y las skills pertinentes de UI/React/pruebas. Consulta el tablón, reserva119 y comprueba cada ruta antes de escribir:

```powershell
node tools/coordination/board.mjs brief CLAUDE-INTEGRATIONS-119
node tools/coordination/board.mjs claim CLAUDE-INTEGRATIONS-119 claude
node tools/coordination/board.mjs check-path CLAUDE-INTEGRATIONS-119 claude src/LocalIntegrations.tsx
```

Escritura exclusivamente en las nueve rutas de `coordination/tasks/CLAUDE-INTEGRATIONS-119.json`. No App, TeamApp, TeamIntegrations, IntegrationEvidence, SalesWorkspace, backend, crypto, contratos existentes, global CSS, paquetes, contexto o panel. No herramientas deClaude adicionales, subagentes, MCP, proveedores o cuentas. No usar el actorcodex. Un rechazo de claim no permite editar por fuera.

## Resultado y contrato de montaje

Exporta `LocalIntegrations({onConnectHubspot}:{onConnectHubspot:()=>void})` de `src/LocalIntegrations.tsx`. Importa sus estilos propios con clases acotadas. Codex117 lo montará para `page==='integrations'`; el callback abre el flujo HubSpot que ya existe en Continuidad. No implementes un formulario nuevo de claves ni enlaces ficticios.

Diagnóstico observado en4451: instancia89627687-9016-47e1-9d7d-220f128f7b46, sinprotecciónconfigurada, capturaAgenciaNorteimportada/noactivada, `/v6/workspace` devuelveorigin:null. Hoy yAgentesavailable:false. La vistaactual rotula HubSpot/Gmail/Calendar como simulados y Drive/Docs/Sheets pendientes. Es una foto; no atribuyas disponibilidad actual sin comprobarla ni alteres esa instancia como fixture.

## Fuentes y verdad de producto

Usa las APIs locales existentes, cada una con carga/error parcial independiente:

- GET `/api/v2/continuity`: estado actual de conexión local, captura, modo y errores. Revisa su contrato real antes de proyectar.
- GET `/api/v4/integrations`: capacidades de ensayo/lectura. Es un catálogo, no una prueba de conexión o éxito remoto.
- GET `/api/v6/workspace`: dirección del espacio de equipo. Que exista unorigin no acredita cuenta Google conectada, identidad ni tenant del usuario.

No inventes integración: distingue «sin conectar», «requiere reconectar» si hay evidencia, «lectura configurada/estado declarado» y «sin comprobar aquí». Captura histórica no significa conexión disponible ahora. Una acción aprobada, aceptada o simulada no acredita envío real. No mostrar «tus herramientas conectadas» si no se ha verificado ese estado.

No llames al origen de equipo desde el cliente para eludir CORS o averiguar su sesión. Ofrece un enlace claro al flujo real del espacio separado. Valida URL: solo http/https permitidos, sincredenciales, protocolorelativo, javascript/data ohostarbitrario; no construyas HTML. Explica separación de datos y autorizaciones en lenguaje sencillo.

HubSpot: botón «Conectar HubSpot»/«Revisar conexión» llama alcallback existente. Gmail/Calendar/Drive/Docs/Sheets: si hay destino válido, enlace al apartado correcto del espacio comercial, sin prometer conexión oaccióncomprobada. Si falta, muestra qué debe configurarse y no dibujes botones que no hacen nada.

## Organización y UX

La vista empieza por «Conexiones» y el estado del espacio local. Un siguiente paso concreto por fila/herramienta; evita seis tarjetas de marketing con estados ambiguos. Las capacidades de simulación quedan dentro de un detalle plegado «Ver capacidades de ensayo», oculto por defecto y accesible. No elimines funciones: ubícalas según su propósito.

Respeta el lenguaje visual existente: español, azul, superficies claras, jerarquía compacta. No rediseñes DESIGN.md. Estados carga/vacío/error sin spinner infinito; reintento local; respuestas antiguas ignoradas al desmontar/cambiar contexto. Una consulta fallida no borra los datos válidos de otra.

Preparar esta UI no autoriza conectar cuentas o usar credenciales. No HubSpot/Google reales, DPAPI, .env, instalaciones originales, perfiles, servicios externos, nuevas dependencias, compras, commits/push o despliegue. Las pruebas usan fixtures propios, loopback y Chromium limpio dePlaywright; no4451/4511/4515 ni puertos deotrosagentes.

## Verificación y entrega

Prueba contrato/proyección con combinaciones reales: sin cuenta, solo catálogo, conexiónlocaldeclarada, origenválido/desconocido/malicioso, unendpointfallido yotrosválidos, respuesta tardía y desmontaje. DOM:callbackHubSpot efectuado, enlacesdestinocorrecto,detalleplegadoinicialmente/teclado,reintentos,1440/390/320sin overflow. Una prueba dehooks no se llama DOMreal. No afirmar pruebas conproveedores por usarfixturessintéticas.

Compila yprueba enuna raízpropia `tests/.tmp/integrations119-<UUID>`, sin npm run build/dist/buildraíz. Procesospropios solo; si elpuerto está ocupado falla,sinmatarlo. No limpies temporalesajenos.

Informe concomandos,resultados,hashes,capturasinspeccionadas,recursospropios ylímites. Enelhandoff, indica montajeesperado,contratos yquérequiere consentimientorealposterior. Checkpointantesdeagotarcuota; no repetición inútil o compra decréditos. No iniciar otra tarea mientras esta tenga cambios pendientes.

```powershell
node tools/coordination/board.mjs submit CLAUDE-INTEGRATIONS-119 claude --note "Integraciones de app principal: estados verificables, conexión guiada, simulaciones plegadas; pruebas, hashes y límites en informe"
```

Presenta ydeja de editar. Codex revisará antesdeaceptar. No declares montada/actualizada laapp hastaque elresponsable117aporte evidencia.
