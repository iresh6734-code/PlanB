# CODEX-HS-001 · H1 y duplicados de H6

28/10/2026, Europe/Madrid. Entrega local de código para revisión independiente por Claude. Sin despliegue ni reinicio del piloto.

## Revisión del informe inicial

Se ha leído CLAUDE-001 y contrastado con los cuatro archivos de backend, TeamApp y pruebas existentes. Durante esta revisión otro chat Codex aceptó el hash presentado mediante board.mjs y documentó su decisión en coordination/reviews/CLAUDE-001.md. Se conserva esa aceptación como informe estático; no se vuelve a aceptar ni modifica el informe de Claude o la revisión ajena.

H1 confirmado en captura/inspección y el manejo del 401 en TeamApp. Matiz: las capturas en cola pueden registrar el fallo del trabajo sin devolver 401 directamente al navegador; no se afirma que todas las rutas cierren sesión. H2 confirmado: complete() no aplica productionSpace. H3 confirmado: la ruta admite contactos locales o de salesSource y context() no coteja portal de origen. H4 confirmado el presupuesto secuencial que puede agotar ocho detalles antes de emails; la ordenación real de asociaciones no está verificada. H5 confirmado que un error de detalle aborta la ficha. H6 confirmado que listados no rechazaban IDs repetidos por entidad. H7 confirmado refresh bajo transacción, sustitución de scopes y ausencia de estado persistente de reconexión; no se valida comportamiento real del proveedor. H8 conserva propuestas menores sin intervención en esta entrega. No se han verificado documentación remota, scopes o rutas API.

## Cambios acotados

- server/connection.ts: un 401 remoto ahora produce AppError 502; se conserva el mensaje específico. 403 conserva su estado. Los 401 de autenticación local no se han modificado.
- server/hubspot.ts: mismo tratamiento del 401 remoto. Un Set por entidad rechaza IDs repetidos dentro de página o entre páginas antes de acumularlos. Coincidencias de ID entre entidades distintas siguen permitidas. Error 502, sin devolver captura parcial.
- Sin cambios de contratos ni código propio nuevo de error; no se toca package, OAuth, interfaz o archivos reservados por otros encargos.

## Validación ejecutada

`node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot.test.ts tests/hubspot-local-production.test.ts tests/network.test.ts tests/production.test.ts`: 23/23 correctas. Primer intento restringido de tres archivos falló por spawn EPERM antes de ejecutar pruebas; repetición autorizada del conjunto de cuatro archivos correcta, sin cambiar controles Windows. Transportes ficticios/bases de prueba separadas; no bóveda local ni DPAPI.

`node node_modules/typescript/bin/tsc --noEmit`: salida 0.

Comprobación adicional por stdin con node, arnés de bloqueo externo e import tsx: 7/7 verificaciones correctas (401/403 de captura/inspección, duplicados dentro/entre páginas y mismos IDs en entidades diferentes). Primer intento de esa comprobación falló por la codificación de una expresión regular acentuada al pasar texto por PowerShell; se corrigió solo el arnés de stdin y pasó. No son pruebas persistentes: Claude escribirá la regresión completa, incluida la variante en que el recuento coincide pese al duplicado/registro omitido y el 401 en una ruta posterior.

## Hashes de código para revisión

SHA-256 de los archivos completos, no diff contra HEAD (contienen trabajo previo):

- server/connection.ts: b88111890134adcc587fc8ebbc8eca1810c8bad3df08003622d8825f35875bee
- server/hubspot.ts: 7add51926794ebabf137bd4e03c9a5de77b5e146b4a6c2e8d8d4683ea2f4bce4

Baselines reservados en el tablón: connection.ts 3877c12b7e2cfb74a17303a4ddc8744b202a44d95c438b2ec0956aad894e4a1b; hubspot.ts ab24a4b70b572a837162dd7def48a2dbfc908f5153bcb5dddc8ac6f4dda5c511. El cambio funcional de esta entrega es exclusivamente el descrito arriba.

## Revisión y pendientes

CLAUDE-HS-001 permite escribir únicamente tests/hubspot-h1-h6.test.ts y coordination/reports/CLAUDE-HS-001.md. Comparar hashes de esta entrega y tablón antes de empezar. CODEX-HS-001 queda en review con sus reservas; la tarea de Claude depende de CLAUDE-001 y exige explícitamente esta entrega en review/done para evitar un ciclo de dependencias. Claude presenta pruebas y recomendación; Codex revisa y acepta o solicita corrección, sin aceptar hashes antiguos.

H2/H3/H7 siguen pendientes de implementación y de encargo específico coordinado con CODEX-001; no se toman sus archivos OAuth. H4/H5 y el resto de H6/H8 siguen abiertos. Se conservan los errores ante recuentos discordantes y relaciones fuera de captura: no se excluyen registros ni se ocultan inconsistencias. La detección de duplicados no garantiza una instantánea remota consistente. Sin red real, credenciales, cuentas, modelos, navegador, datos CRM nuevos o validación API del portal personal. La cola UX CLAUDE-002 a CLAUDE-005 permanece separada e intacta.
