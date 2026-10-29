# Plan B · Asistente con modelo local

**Actualización posterior, 28/10/2026 · arranque solicitado:** el piloto estaba detenido y se inició mediante su lanzador normal, tras explicar el uso de protección Windows de esta instalación. PID1480, localhost4334, salud/protección correctas y hashes backend/frontend coincidentes con la compilación actual. La nueva entrega ahora está desplegada; el modelo local sigue apagado, sin generación real acreditada. No se crean datos ficticios ni se ejecutan simulaciones o acciones externas. Pendientes desbloqueo humano y fuente propia con clientes reales; portal149623339 es de ensayo. Esta actualización sustituye las menciones anteriores a entrega sin desplegar, conservadas como historial.

## Alcance de esta entrega · 28/10/2026

Continuación de 0.6, sin cerrar 0.5/0.6 ni activar la autonomía de 0.7. Se añade al espacio Agente un adaptador de generación local con Ollama. Trabaja con el contexto de una oportunidad y su borrador, ya visibles para revisión. La detección de prioridades sigue siendo determinista. No se presenta como integrado o probado un modelo que no se haya ejecutado realmente.

Microsoft está bloqueado en el piloto local incluso si se le proporciona una configuración antigua: el arranque no lee `copilot-client.json` y el registro de rutas fuerza configuración Microsoft nula. No modifica ni elimina recursos remotos ni credenciales históricas. IFR, Entra, el equipo corporativo y la lectura de Gmail permanecen fuera del alcance.

La captura de alerta aportada por el usuario muestra «Suspicious DPAPI Activity». No se acredita su causa a partir de esa imagen. El cifrado previo del piloto usa Windows DPAPI; este trabajo no lo retira, debilita ni intenta ocultarlo. No se reinicia el piloto ni se llama a `localKey`, PowerShell ProtectedData o almacenes de credenciales para validar este agente. El modelo local no requiere claves ni autenticación corporativa.

## Flujo y configuración

1. En una instalación propia autorizada, administración abre Agente → Modelo de IA local.
2. Indica el nombre exacto de un modelo ya instalado y confirma que el servicio es propio y tiene las funciones cloud desactivadas. Habilitar solo guarda preferencias por empresa; no sondea servicios, enumera modelos ni descarga nada.
3. El usuario revisa una oportunidad, el contexto y el borrador, y autoriza expresamente su procesamiento con el modelo indicado.
4. Plan B hace una única llamada a `http://127.0.0.1:11434/api/chat`. No acepta URLs arbitrarias ni redirecciones. No hay claves, herramientas, navegación web, acceso a archivos, CRM, Gmail o calendarios desde el modelo.
5. El resultado se conserva para revisión. Guardarlo como propuesta exige que sigan vigentes el contexto, la fuente y la configuración del modelo. La propuesta tiene Gmail, Calendar, Docs y Sheets apagados; no se crean tareas ni acciones externas al generar o guardar el texto.

La administración puede desactivarlo sin contactar con el servicio. Las reglas y los borradores sin IA siguen disponibles. En un servicio gestionado, la opción local no está disponible. La demo permite probar configuración y revisión con datos ficticios, sin atribuirle una generación auténtica.

## Contratos y límites

- Configuración por empresa con RLS, modelo, estado habilitado y revisión aleatoria. Solo administración puede cambiarla. Sin secretos.
- `/v6/copilot/local-settings`: habilitar requiere `reviewed:true`, modelo válido y `localOnlyConfirmed:true`; deshabilitar requiere revisión explícita.
- `/v6/copilot/runs`: reutiliza el historial persistente. `provider:'ollama'`, UUID deduplicable, revisión del contexto y `engineRevision` vigente. El legado de Microsoft conserva su etiqueta de origen; no se presenta como ejecución local.
- Una ejecución simultánea por empresa, compartida con trabajos y acciones comerciales. Tope local de 100 intentos/mes por empresa, sin ampliar los límites de proveedor o el presupuesto histórico de IA. No se contrata ningún consumo.
- Una llamada, 90 segundos incluyendo lectura de respuesta, máximo 24.000 caracteres de entrada y 96.000 bytes de respuesta. Salida estricta: asunto hasta 180 caracteres y cuerpo hasta 12.000; sin campos adicionales ni llamadas a herramientas.
- El contexto es datos no confiables en un mensaje separado. Las instrucciones del modelo no determinan permisos ni acciones. La validación estructural no demuestra que todo su texto sea correcto: la revisión humana sigue siendo obligatoria.
- Errores, interrupciones, cambio de datos o desactivación conservan un intento incierto, sin reintentos automáticos ni propuesta creada. Los resultados desactualizados no se aplican.
- La ruta de red fija limita la llamada de Plan B. No prueba cómo está configurado un servicio local ni impide que un modelo o proxy bajo otra administración reenvíe información. No se promete ausencia de alertas en equipos supervisados.

## Activación real pendiente

No se ha instalado, iniciado, consultado ni usado un Ollama real en esta entrega; no se ha leído la configuración del ordenador para averiguarlo. El adaptador queda desactivado. La aceptación requiere servicio/modelo propios, modo sin nube y una generación con contexto ficticio revisado. No trasladar esta activación al equipo de empresa ni reutilizar sesiones o credenciales corporativas.

Ollama documenta el contrato [`/api/chat`](https://docs.ollama.com/api/chat) y el [modo sin funciones cloud](https://docs.ollama.com/faq). Estos requisitos se aplican al servicio propio antes de activarlo; Plan B no cambia automáticamente sus ajustes.

## Validación

Pruebas de contrato con transporte ficticio, base PGlite separada y red externa bloqueada. Incluyen 50 salidas adversas o incompletas rechazadas; no son una evaluación de calidad de un modelo real. Comprobaciones de autorización, aislamiento, exclusión, presupuesto de intentos, caducidad de contexto, cambios de configuración, salida, deduplicación y guardado interno.

La configuración `playwright.local-agent.config.ts` arranca únicamente un servidor de equipo de ensayo nuevo; evita el servidor histórico que abre la bóveda local. No utiliza perfiles o contraseñas de usuario. La captura/recorridos de interfaz no acreditan conexión con un modelo real. Los resultados finales se registran en `CONTEXTO-PROYECTO.md`.

Resultado final: build correcto,49/49 pruebas afectadas y8/8 recorridos de navegador finales correctos, después del ajuste de composición. Chrome con perfil nuevo, servidor demo aislado, escritorio1440 y móvil390/320. Identidad/contenido de página, interacción, errores, ausencia de desbordamiento y capturas comprobados; detector visual sin hallazgos. El fallo502 del modelo es provocado en la interfaz con transporte ficticio y se muestra sin repetición. JSON completo y capturas en qa-local-agent-2026-10-28. El primer intento sin permiso de sockets se detuvo; la repetición autorizada no altera controles Windows. El backend del piloto existente no se desplegó ni reinició y el modelo real sigue sin activar.
