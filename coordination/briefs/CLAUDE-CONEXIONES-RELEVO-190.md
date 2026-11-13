# Prompt B · Conexiones comprobables y pasaporte de continuidad

Trabaja como responsable de integraciones verificables y continuidad de Plan B. Busco que una pyme pueda saber qué acceso se comprobó realmente, cuándo, sobre qué cuenta y qué parte de su recuperación se ensayó. Construye el recorrido que llevará una comprobación real autorizada hasta Integraciones y una evidencia útil de continuidad. Todo debe conservar su procedencia.

## Arranque, estado y propiedad

Repositorio: D:\AI\Plan-B-CRM-v2.1\source. Lee AGENTS.md, CLAUDE.md, COORDINACION.md, CONTEXTO-PROYECTO.md y el tablón con tools/coordination/board.mjs. Aplica skills e instrucciones vigentes. No presupongas otra sesión conectada o agentes trabajando porque una tarea diga working.

Corte comprobado el4/11/2026:
- CLAUDE-HS-READ-160 está done como módulo aislado; no impone límite propio de bytes. No confundirlo con CODEX-TASK-REVISION-MOUNT-160.
- CLAUDE-HS-READ-CLI-173 está working por F1del dictamen178. Todavía confirma determinadas respuestas truncadas. No está aceptada.
- CLAUDE-RESCUE-KIT-116 R4 está done por175. CLAUDE-RESCUE-KIT-QA-136 está working por180; aceptar el producto no acepta la QA.
- El gestor de tareas CLAUDE-TASK-UNCERTAINTY-136 es otro flujo. El otro Claude lleva170→171 y su evolución de guardado.
- Codex189 tiene reservadas búsqueda y CSS. Preview181/4595 contiene ficción y UI158, sin los montajes nuevos ni conexión real acreditada.

Retoma173yQA136solo si continúas su sesión autora o existe traspaso explícito; no robes reservas de otra sesión. Usa sus rutas exactas actuales. Las fases nuevas necesitan encargos separados, claim y check-path. No inventes IDs ni confundas ready con reservado.

No edites App.tsx, LocalOperations.tsx, LocalTaskFocus, gestor de guardado o WorkspaceSearch. server/v2.ts y shared/operations.ts siguen reservados por CODEX-RECOVERY-INTEGRITY-087; Store/Recovery por CODEX-INTEGRITY-055. El montaje en esos archivos corresponde a Codex tras revisar las dependencias; no se liberan para desbloquearte sin dictamen.

## Fase1 · Corregir173 y dejar lista la ejecución

Lee coordination/reviews/CLAUDE-HUBSPOT-READ-160-173-independent.md. El fallo es concreto: al cortar64KiB puede quedar un objeto JSON completo seguido de espacios; el parser acepta ese prefijo y la CLI devuelve confirmado aunque respuestasTruncadas=1.

Rechaza la representación completa al superar el límite, cancela su lectura y no entregues el prefijo como respuesta válida. Si sucede en identidad, detente antes de los cuatro objetos. En un objeto, nunca lo cuentes como readable. Cambiar solo el titular al final no basta.

Añade regresiones de identidad y objeto con prefijo válido+espacios+sufijo inválido; límite exacto, JSON incompleto y respuestas normales como controles. Ejecuta las pruebas independientes de178sin editarlas. Conserva máximo5GET, cada ruta una vez, dominio/rutas/consulta previstos, sin escrituras, paginación, reintentos o redirecciones; tiempos y memoria acotados y errores sin secretos.

Corrige el runbook: entrada sin eco y por stdin, nunca argumento, chat o fichero; liberar el BSTR en finally, sin prometer borrar toda copia de un string gestionado. Presenta173R2con sus cinco rutas y espera revisión.

**Este prompt NO autoriza llamadas reales a HubSpot.** Faltan ID numérico del portal de ensayo propio y autorización humana expresa para esas cinco lecturas.12345es ficticio. No consultes instalaciones, claves, perfiles o cuentas corporativas para descubrir el portal. Puedes terminar todo el código y las pruebas sintéticas sin esa información. Tras aceptación, presenta la orden concreta revisable y espera esos datos antes de ejecutar.

## Fase2 · Reconciliar QA136 con116R4

Lee coordination/briefs/CLAUDE-RESCUE-QA-136-R2.md y los dictámenes175/180. Mantén la reserva de diez rutas. No cambies116aceptada ni las pruebas de Codex.

La prueba8debe proteger el comportamiento corregido: dos instancias con mismoPID y owner distinto, primera importación retenida, segunda rechazada sin tocar bytes del reclamo ni staging; al liberar la primera, un único destino original y un reclamo final concordante. Worker siempre liberado en finally y esperas acotadas.

Demuestra sensibilidad retirando solo la guarda owner en una copia privada o con un baseline exacto acreditado. Actualiza hashes/atribución y conserva el corte rojo histórico. Repite25casos, aislamiento y paralelismo pertinentes. No conviertas el caso en verde únicamente invirtiendo una expectativa. PresentaQA136R2para revisión independiente.

## Fase3 · HubSpot comprobable desde Integraciones

Con173aceptada, registra unidades nuevas para servicio/API, contrato y pantalla. Tu zona es el módulo específico y LocalIntegrations/shared-local-integrations, comprobando reservas otra vez. Codex monta el registro central bajo su propia unidad; no uses otro Store ni dupliques Continuity/sus trabajos.

Objetivo de interfaz: una acción explícita «Comprobar lectura» sobre el portal de ensayo configurado. Antes de llamar debe quedar claro portal, cincoGET y que no escribe. Abrir o recargar la pantalla no consulta al proveedor. Un GET de estado devuelve solo evidencia ya guardada; la comprobación es otra acción explícita autenticada y protegida con los controles existentes de origen/sesión.

Contrato necesario:
- Una comprobación en curso por configuración; una segunda solicitud no duplica las cinco lecturas.
- Resultado ligado a la versión de configuración/portal. Cambiar credencial o portal invalida la evidencia; una respuesta antigua no confirma la nueva configuración.
- Tiempos y límite de bytes probados, cancelación y clasificación honesta por objeto.
- Campos públicos sin token/cuerpos/cabeceras: identidad coincidente, entorno, estados, instantes y límites. Sin acceso a secretos desde el navegador.
- Una desconexión, un401de sesión y un401del proveedor conservan significados diferentes. Reintentar sigue siendo decisión explícita, no un bucle.

Muestra contactos/clientes, empresas, oportunidades y tareas por separado. Una lectura parcial no es conexión completa; un403no acredita una credencial revocada y una configuración guardada no acredita acceso. Presenta el plazo15min como política de actualidad de la evidencia, no garantía futura del proveedor. Al caducar conserva la última observación fechada y vuelve a acceso sin comprobar.

Google seguirá explicando su estado real disponible. No uses un enlace al espacio de equipo como prueba de OAuth, ni instales cinco conectores nominales sin recorrido funcional. Un futuro proveedor nuevo requiere su cuenta/scopes/consentimiento y encargo propios.

Prueba el recorrido con servidor real de la App y proveedor simulado local: doble clic, respuesta tardía tras cambiar configuración, bloqueo, timeout, permisos parciales, caducidad, endpoint caído y recuperación. Luego una única comprobación real podrá acreditar HubSpot, cuando el usuario haya autorizado cuenta y acción. Pruebas simuladas no acreditan esa conexión.

## Fase4 · Pasaporte de continuidad

Nueva unidad después del contrato anterior aceptado: una vista compacta de evidencia, dentro del recorrido existente, sin otro menú principal. Debe responder:

«¿De qué copia dispongo? ¿Qué lectura del CRM se comprobó y cuándo? ¿Qué trabajo local queda pendiente? ¿Qué se ensayó al exportar y recuperar? ¿Qué no se ha demostrado?»

Usa datos de contratos reales, identifica origen/captura/instante y degrada ante falta de evidencia. Para resultados de guardado espera el contrato del otro Claude aceptado; consume un resumen acordado, no su gestor privado. No adivines estados ni recuentos.

Exporta un resumen HTML/JSON sin credenciales ni fichas completas, separando observado, declarado y pendiente. Comprobación de lectura no significa copia actualizada; cifrado no demuestra autoría; recuperación en otro proceso del mismo equipo no demuestra otro ordenador. El usuario debe entender estas diferencias sin leer informes técnicos.

## Fase5 · Relevo accesible

TrasQA136R2aceptada, prepara la integración del Kit116en ese recorrido reutilizando componentes/servicios existentes, con reservas nuevas. Codex hará los cambios centrales si siguen reservados al otro frente. Mantén visible que el ensayo actual usa ficción.

Cápsula cifrada→inspección sin escritura→aprobación vinculada al contenido inspeccionado→destino nuevo→reapertura→conciliación de la operación incierta sin duplicar. Conserva incertidumbres y retira aprobaciones ejecutables heredadas. Mensajes concretos para contraseña/formato/contexto/importación en curso/destino ya publicado; nada de éxito falso tras un fallo posterior a publicación.

Mantén origen y destinos ajenos intactos. Prueba conflictos, reinicio, segundo propietario y rutas/tamaños; no afirmar otroequipo,HubSpotreal,RTO/RPOoautoría sin evidencia nueva. El alcance real de la cápsula debe coincidir con lo ensayado, no con el nombre comercial.

## Entrega y continuidad

Unidades completas y revisables por Codex: hashes finales, comandos, resultados exactos, pruebas causales útiles, capturas realmente inspeccionadas y procesos propios cerrados. Presenta sin autoaceptarte; conserva las reservas durante review. Sigue con otra fase independiente autorizada mientras esperas, sin escribir rutas dependientes aún no reservadas ni repetir pruebas solo para consumir.

La meta es una integración y un relevo que la persona pueda usar y comprobar en la App. Las llamadas externas y los datos reales se ejecutan únicamente con su autorización concreta; el desarrollo y el montaje sintético pueden avanzar entretanto. Sin equipo corporativo, dependencias nuevas, worktrees, commits, despliegues o reinicio de demos ajenas.
