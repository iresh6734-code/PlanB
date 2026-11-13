# 242 · Vincular la evidencia con la copia abierta

6 de noviembre de 2026, Europe/Madrid. Codex. La API admite el parámetro optativo `workspaceContextRevision`, tomado del `workspaceSearchContext.contextRevision` que devuelve el estado protegido de la App. Antes de calcular compara esa revisión con la que lee en la misma Store. La comprueba otra vez al terminar. La cabecera `X-PlanB-Workspace-Revision` confirma exclusivamente la revisión observada en el servidor. Si no coincide, devuelve 409 sin hechos ni cabecera.

La última lectura de contexto e identidad precede a la revalidación del permiso original de 103 R3. Si vence, se responde 401 sin atestación. El vínculo cubre instalación, captura completa, generación y sesión según el contrato existente de `workspaceSearchIdentity`. La revisión propia de evidencia sigue cubriendo registros locales, archivo y metadatos del cálculo. El cuerpo v1 y las peticiones sin vínculo mantienen su comportamiento.

El cliente admite esa revisión como opción. Cuando está presente la envía y exige la misma cabecera antes de leer el cuerpo. Un servidor antiguo que responde sin confirmación se clasifica como referencia vencida. Se fijan las opciones al iniciar la llamada para que su mutación durante `fetch` no cambie el ámbito solicitado. Un consumidor debe seguir retirando el resultado y descartando respuestas tardías cuando cambie el contexto de la vista.

## Pruebas

En `tests/.tmp/evidence242-rebase-Xr2R7R` se cotejaron los bytes aceptados de 101, 103 y 104. La prueba inicial produjo cuatro fallos sobre el código previo. La propuesta anterior no fijaba las opciones de cliente y una regresión adicional falló al cambiarlas durante la espera. Con el código final pasan 67/67 y tipos focales, sin skips. La prueba cubre dos capturas con igual ID y fecha pero contenido distinto, otra instalación, cambio de sesión durante cálculo, falta de cabecera, cabecera ajena, entrada mal formada y expiración en la última lectura de identidad. Una discrepancia del archivo continúa en `ARCHIVE_MISMATCH` y no queda convertida en resultado válido por recibir la revisión actual.

El test HTTP privado de `tests/.tmp/evidence242-http-RZU5zi` recompila el main aceptado de 239 con la API de esta entrega. El estado protegido aporta la referencia, la consulta vinculada responde 200 con cabecera igual y un pin ajeno responde 409 sin hechos ni confirmación. Se repiten autenticación, revisión propia de evidencia, lectura sin escrituras y ausencia de ruta en runtime. Dos procesos propios cerrados con recibos. El primer intento del arnés omitía el directorio de cliente al copiar la proyección y terminó antes de iniciar procesos. Se corrigió y se repitió en raíz nueva.

La expiración inducida se prueba mediante Fastify y reloj controlado. Los cambios de respuesta y la mutación de opciones usan transporte sintético. El cliente de la interfaz conserva la vista aceptada de 104. La adopción de esta opción dentro del Hub y su navegación corresponde al montaje de 253 y a su integración en App. Las pruebas de esta entrega no acreditan ese recorrido de navegador.

## Huellas

- `server/continuity-evidence-api.ts` · `cda6a0827751cbd34ac45b995edd2d766445d1593c0eef12ba1b7eda6773264f`
- `src/continuity-evidence-client.ts` · `00525cad8df90f7b9c640d2704c85d9a450eb512c1cf8860cf56966a4d5c4aea`
- `tests/continuity-evidence-workspace-context.test.ts` · `692c0ff610b24d39f7cc8c8e5d67762d1d75e8970d0c62bd80002b1253c7dbf1`

La unidad se reclama después de la aceptación de 239. Informe sellado por submit. Pendiente dictamen independiente de 242 antes de su adopción por otros consumidores.
