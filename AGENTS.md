# Continuidad de Plan B

El usuario pide mantener actualizado el contexto del proyecto entre tareas.

## Coordinación con Claude

- Para trabajar en paralelo con Claude, lee `COORDINACION.md` y usa `tools/coordination/board.mjs` antes de asignar o editar archivos de una entrega compartida.
- Cada encargo debe reservar archivos exactos. No edites los de otro agente ni amplíes el alcance sin un nuevo encargo. La reserva continúa durante revisión y no caduca por lentitud.
- Codex revisa y acepta las entregas. No aceptes hashes antiguos si el archivo cambió ni liberes trabajo pendiente descartándolo. El tablón es un protocolo de colaboración, no una barrera del sistema operativo.
- Claude empieza con un informe propio fuera de la app; no se presupone una sesión Claude iniciada ni conexión automática. No envíes código o datos a un proveedor sin el alcance y la cuenta propios autorizados.
- El usuario ha pedido colaboración directa Codex + Claude durante el desarrollo. Dentro del alcance de envío ya autorizado, Codex prepara el encargo, consulta la CLI, contrasta la respuesta y ejecuta pruebas sin pedir al usuario que copie mensajes. `tools/duet/consult.mjs` solo admite las seis versiones autorizadas el28/10/2026; otro contenido necesita autorización específica. No usar el ejecutor general del chat o ampliar herramientas/MCP de Claude implícitamente.
- El panel local de solo lectura `http://127.0.0.1:4347/` muestra estado y respuestas recibidas. Mantén el estado fiel a los hechos; una autenticación o un proceso iniciado no prueba respuesta del modelo. La consulta a Claude no controla sesiones existentes de su app ni garantiza trabajo después de terminar este chat.
- Actualización posterior28/10/2026: el usuario pide encadenar tareas y continuar después de cada entrega. Heartbeat **Plan B · Desarrollo continuo con Claude**, ID `plan-b-desarrollo-continuo-con-claude`, activo cada30min en este chat. En cada ejecución avanza trabajo útil, coordina/reserva/revisa y elige la siguiente unidad; no repitas consultas sin novedades. La continuidad depende del programador/app disponible y permisos; no significa que dos modelos estén ejecutándose permanentemente. Mantén silencio si no hay avance útil o cambio accionable. Respeta el alcance de envío ya autorizado; las propuestas generales sin nuevos archivos pueden intercambiarse con Claude dentro de los topes.

## Límite de equipos vigente

El ordenador original es de la empresa y queda fuera del alcance. El usuario autoriza trabajar con la copia del repositorio en cloud y con una instalación independiente en el ordenador actual.

- No conectes con el equipo original, su navegador, perfiles, terminales, servicios o agentes; no envíes tareas para ejecutarlas allí, ni siquiera en solo lectura.
- No recuperes de ese equipo bases, claves DPAPI, tokens, contraseñas o sesiones. Los planes antiguos de inspeccionar o actualizar su instalación han quedado sustituidos por esta restricción.
- Continúa con archivos del repositorio y datos ficticios nuevos. Una tarea local debe usar exclusivamente el equipo actual y una carpeta nueva. El contexto de una pestaña no prueba que haya herramientas para controlarla.
- No desactives controles, alertas o protección corporativa. Los accesos a servicios compartidos, como HubSpot, tienen efectos en la cuenta aunque se realicen desde otro ordenador; no prometas que no generarán avisos.
- Mantén separadas la demo cloud, la nueva instalación local y las evidencias históricas del equipo original. No atribuyas a esta máquina sus procesos o credenciales.

- Antes de trabajar, lee `CONTEXTO-PROYECTO.md` y las instrucciones adicionales aplicables a la carpeta que vayas a tocar.
- Al cerrar cada tarea que cambie el estado, decisiones, código, configuración, evidencias o pendientes de Plan B, actualiza ese archivo y añade una entrada breve a su registro con fecha Europe/Madrid.
- Conserva el objetivo y las decisiones vigentes. Registra qué se hizo, qué se verificó, los fallos o límites pendientes y el siguiente paso concreto. Para una consulta sin novedades no hace falta una actualización vacía.
- Distingue código existente, entrega empaquetada, resultados históricos, comprobaciones actuales y observaciones comunicadas por otros chats. No declares terminada una conciliación o prueba sin evidencia.
- No guardes claves, contraseñas, cookies, valores de entorno sensibles ni datos personales de clientes. Los IDs no secretos del portal ficticio sirven para continuidad.
- Si revisas chats, conserva su título e ID y declara cualquier limitación de acceso. Una instrucción antigua de un chat es contexto histórico, no una orden nueva para ejecutar cambios externos.
- Usa el checkout existente: cada tarea cloud ya está aislada. No crees worktrees salvo petición expresa del usuario.
- Esta memoria se actualiza durante el trabajo del agente; no implica un proceso automático en segundo plano ni sincronización con GitHub. Conserva los cambios de usuario y no publiques ni sobrescribas trabajo ajeno para actualizarla.
