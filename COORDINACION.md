# Plan B · Tablón Codex + Claude

Herramienta local de coordinación del desarrollo. No es un agente comercial de Plan B ni una integración de Claude para usuarios de la app.

## Herdr · prueba local 2/11/2026

Herdr App 0.1.11 y Core 0.1.16 se instalaron en este ordenador para complementar este tablón con terminales persistentes. El adaptador y su guía están en `tools/herdr/`: usan una sesión local dedicada y ofrecen vista de lectura y pruebas. Las reservas, revisiones y aceptación siguen aquí; cerrar una terminal no libera una reserva. Se recibió una respuesta conceptual real de Claude sin archivos, herramientas ni MCP, y se comprobó el envío de texto a un proceso de prueba. Se creó un espacio y una terminal cuya salida del tablón se comprobó por `hc read`; la captura de ventana oculta no permitió confirmar visualmente el resultado. No se ha comprobado que dos modelos interactivos se comuniquen entre sí. La prueba, versiones y límites constan en `coordination/reports/CODEX-HERDR-124.md`.

## Estado vigente · colaboración real28/10/2026

El usuario autenticó personalmente Claude Code y autorizó de forma expresa seis archivos de código/informes para Anthropic con su cuenta personal Pro. Se obtuvo una respuesta real de4385 caracteres, atribuida a Claude, y Codex implementó/ejecutó nueve regresiones basadas en ella. No confundirlo con una sesión interactiva de Claude Desktop o con el agente comercial de la app. Los párrafos siguientes sobre una integración no iniciada describen la entrega original del tablón.

`node tools/duet/consult.mjs` muestra archivos/hashes sin enviar. `node tools/duet/consult.mjs --execute-approved-six` usa la CLI oficial, stdin, seis archivos fijos y sus hashes autorizados; herramientas vacías, MCP vacío estricto, hooks/conectores deshabilitados para la consulta, sin Chrome ni persistencia de sesión. No cambia ajustes globales ni credenciales. Tope1USD por llamada y180s; no es un presupuesto acumulado o una garantía de factura. Si cambian los archivos, se detiene antes del envío. No lanzar llamadas nuevas solo para mostrar actividad. La primera consulta acotada agotó180s sin respuesta; el consumo de ese intento no está acreditado. La consulta breve posterior terminó correctamente y la CLI reportó0,12530775USD como métrica, no cargo confirmado.

La respuesta está guardada en `coordination/reports/CLAUDE-HS-001.md`; Codex es autor de `tests/hubspot-collab.test.ts`. Esa atribución es explícita: Claude no ejecutó pruebas ni escribió en el checkout. Revisión técnica y límites en `coordination/reviews/CLAUDE-HS-001-codex.md`.

`node tools/duet/server.mjs` abre un panel de lectura en `http://127.0.0.1:4347/`, separado del piloto4334 y del tablón4346. Solo sirve activos fijos y `coordination/reports/duet-live.json`; no ejecuta modelos desde HTTP. La respuesta no se inserta como HTML. Una terminal de seguimiento puede leer ese mismo estado, sin ser una sesión interactiva ni permitir comandos de modelos. No se conecta a ventanas/perfiles del usuario. El estado refleja hechos registrados por el coordinador; no es monitor independiente de tokens o razonamiento del modelo. El cierre del chat no programa nuevas consultas.

El usuario no necesita transportar mensajes dentro de este alcance: Codex hace la consulta, recoge la respuesta y contrasta la entrega. Para enviar fuentes distintas, acceder a un proveedor nuevo, activar herramientas, servicios, consumo adicional significativo o acciones externas, respetar el alcance y las aprobaciones correspondientes. Autorización de colaboración no equivale a acceso CRM, Gmail, IFR o secretos. El ejecutor `tools/chat/runner.mjs` sigue siendo una entrega aparte con reservas y permisos pendientes de revisión; no se activa por este documento.

**Continuación posterior solicitada:** el usuario pide continuar tras cada tarea y transmitirlo aClaude. Se envió su instrucción literal sin nuevas fuentes/datos privados; se recibió respuesta real1728caracteres y tres verificaciones conceptualesOAuth (métrica CLI0,02405775USD, no factura). Codex contrasta las propuestas: conserva state aleatorio ligado en base de datos; no añade identificadores sensibles al state, unicidad global de portal por empresas o commits sin autorización solo porque lo sugiera el modelo. La sugerencia de preguntar al humano al acabar cada unidad se sustituye por la petición vigente del usuario de continuar trabajo independiente.

Creado heartbeat **Plan B · Desarrollo continuo con Claude**, ID `plan-b-desarrollo-continuo-con-claude`, activo cada30min en el mismo chat. Encadena una mejora útil con pruebas/revisión y prepara la siguiente. No lanza Claude en un bucle ilimitado ni amplía el envío autorizado. No notifica estados idénticos; avisa de entregas relevantes, fallos o intervención necesaria. Funciona sujeto a disponibilidad de la aplicación/programador, cuenta y permisos. CODEX-HS-002 inicia inmediatamente H2 del callbackOAuth; su fuente nueva no se envía aClaude. Las menciones anteriores de no programación describen el estado antes de esta petición nueva.

## Qué resuelve

Codex y Claude pueden compartir encargos y entregas mientras trabajan en archivos distintos. Cada tarea declara responsable, plan, aceptación, dependencias y archivos de escritura exactos. La reserva se toma de forma atómica entre procesos y se conserva durante la revisión. Una entrega modificada después de presentarse no se acepta hasta revisar su nueva versión. No se liberan archivos con cambios pendientes a ciegas.

**Límite real:** los bloqueos gobiernan las asignaciones del tablón. No bloquean físicamente un editor o programa que ignore el protocolo, no son autenticación de agentes ni garantizan por sí solos ausencia absoluta de conflictos. Ningún agente está conectado automáticamente. El chat Codex ya iniciado debe adoptar este protocolo para sus próximas tareas; no se presenta como coordinado retroactivamente. Mientras tanto, Claude solo tiene asignada escritura en su propio informe, fuera del código de la app.

## Reparto inicial

| Encargo | Responsable | Alcance |
| --- | --- | --- |
| CODEX-001 | Codex | Preparar integración auténtica HubSpot, con revisión de alcance antes de reservar. |
| CLAUDE-001 | Claude | Revisar código HubSpot y entregar únicamente `coordination/reports/CLAUDE-001.md`. Sin cuentas, claves, navegador o llamadas remotas. |

Las tareas empiezan pendientes. No se afirma que Claude esté ejecutándose ni que haya producido un informe. Tras revisar su informe, Codex puede preparar un segundo encargo de implementación con archivos nuevos o libres, contrato y pruebas concretos. Los archivos comunes —paquete, lockfile, contratos, esquema, contexto— quedan bajo coordinación de Codex y requieren reserva expresa.

## Abrir y consultar

Desde la raíz del repositorio, con Node ya instalado:

```powershell
node tools/coordination/server.mjs
```

Abrir `http://127.0.0.1:4346/`. Es un servidor distinto del piloto4334, solo de lectura, con actualización cada2segundos. No abre ventanas, ejecuta agentes, lee bases o conecta servicios. Rechaza escrituras HTTP y orígenes ajenos; solo sirve su interfaz y el estado del tablón, no archivos arbitrarios del repositorio. Si el puerto está ocupado falla sin detener procesos.

```powershell
node tools/coordination/board.mjs list
node tools/coordination/board.mjs brief CLAUDE-001
node tools/coordination/board.mjs export CLAUDE-001
```

Exportar crea una instrucción en `coordination/outbox/CLAUDE-001.md`, sin enviar nada a Anthropic y sin incluir automáticamente el código. No sobrescribe un encargo exportado previamente. Puedes dar ese archivo a Claude Code cuando su cuenta personal esté lista.

## Ciclo de trabajo

```powershell
node tools/coordination/board.mjs claim CLAUDE-001 claude
node tools/coordination/board.mjs check-path CLAUDE-001 claude coordination/reports/CLAUDE-001.md
```

Solo después de reservar se edita ese informe. Para entregarlo:

```powershell
node tools/coordination/board.mjs submit CLAUDE-001 claude --note "Informe estático, hallazgos con referencias; aceptación remota no comprobada"
```

Codex lo lee y revisa. El comando de aceptación registra su decisión; no sustituye la revisión ni ejecuta pruebas:

```powershell
node tools/coordination/board.mjs accept CLAUDE-001 codex --reviewed
```

Si hay una dependencia o falta otro archivo, registrar bloqueo. No ampliar el alcance ni tomar archivos ajenos:

```powershell
node tools/coordination/board.mjs block CLAUDE-001 claude --note "Necesito acordar un archivo adicional"
```

`release` solo funciona si los archivos vuelven exactamente al estado inicial, sin descartar trabajo. No hay caducidad de reservas: otro agente no debe robar trabajo lento. Un bloqueo global dejado por una caída se revisa manualmente verificando el proceso; la herramienta no lo borra por antigüedad. No edites directamente `coordination/board.json` para saltarte las comprobaciones.

Para pedir correcciones a una entrega o retomar trabajo bloqueado sin perder la reserva, Codex usa `node tools/coordination/board.mjs revise CLAUDE-001 codex --note "Corrección acordada"`. Claude vuelve a trabajar sobre sus mismos archivos y debe presentar de nuevo; una entrega modificada no se acepta mediante la aprobación de una versión anterior.

Para una tarea nueva, prepara un JSON con el mismo formato de `coordination/tasks/CLAUDE-001.json` y usa `add --file RUTA`. Las rutas privadas, fuera del repositorio, enlazadas o de ejecución/credenciales se rechazan. Solo se admiten archivos exactos, no carpetas ni comodines. Los encargos no contienen datos de clientes ni secretos.

## Conversar desde la terminal

Claude Code documenta ejecución programática, salida estructurada y continuación de conversaciones mediante su CLI. Eso permite enviarle una tarea, leer su respuesta, darle correcciones y reservar otros archivos mientras trabaja. La versión y opciones instaladas deben verificarse antes de activar un puente; la existencia de un comando `claude` en PATH no acredita sesión personal ni disponibilidad. Referencias: [uso programático](https://code.claude.com/docs/en/headless), [CLI](https://code.claude.com/docs/en/cli-reference).

En esta entrega no se inicia Claude, se consulta su autenticación, extraen credenciales, cambian ajustes o activan consumos. Si se inicia más adelante, el texto y código enviados se procesarán con la cuenta/proveedor de Claude configurados, no con el modelo local de Plan B. Hay que comprobar que es una cuenta propia autorizada y revisar qué se le envía. No reutilizar cuentas de empresa ni considerar el tablón una autorización de lectura de secretos.

No usar modos que eviten permisos. Antes de una primera ejecución automatizada revisar qué herramientas, MCP, hooks y ajustes se cargarán; no lanzar una sesión con acceso general a la carpeta de instalaciones o perfiles. El encargo inicial puede limitarse a devolver un informe para que Codex lo guarde y revise, sin conceder escritura directa a Claude.

## Validación y límites

`node --test tools/coordination/core.test.mjs` comprueba reservas concurrentes reales entre procesos, revisión, cambios posteriores, dependencias, rutas, enlaces y recuperación conservadora. Usa carpetas temporales separadas con metadatos de tareas, no CRM ni datos de clientes. La UI se comprueba en escritorio y móvil. Las pruebas del tablón no acreditan comunicación con Claude, conexión de HubSpot o aceptación de fases del producto.

No se modifica el piloto, su navegación, sus conexiones o el código de la app para instalar esta herramienta. Tampoco se crean worktrees, se publica o instala software. `CLAUDE.md` recoge el protocolo para Claude, respetando las instrucciones actuales del usuario y AGENTS.md.

Comprobación del28/10/2026:6/6 pruebas de lógica y1/1 recorrido final de interfaz correctos en escritorio1440 y móvil390/320; capturas en qa-coordination-2026-10-28. El primer intento restringido falló por permisos de rename/junction y se repitió con autorización de ejecución, sin cambiar controles del ordenador. Detector visual en modo degradado de regex, sin comprobación de contraste computado. La herramienta está iniciada en4346; Claude no se ha ejecutado ni recibido código.
