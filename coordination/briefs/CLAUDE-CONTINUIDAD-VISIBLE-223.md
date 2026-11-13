# Claude · Lleva Continuidad a la App y cierra su recorrido

El objetivo de esta misión es que una persona abra Continuidad en Plan B, entienda qué copia tiene y qué debe atender, acceda a la comprobación de HubSpot y pueda ensayar un relevo ficticio desde esa misma App. Pasaporte, mapa y ensayo deben tener un consumidor normal, una ruta registrada, un resultado persistido y una candidata servida con el código revisado. Prioriza terminar esas integraciones sobre crear nuevas superficies preparatorias.

## Estado vivo y reparto

Repositorio `D:/AI/Plan-B-CRM-v2.1/source`. Lee AGENTS.md, CLAUDE.md, COORDINACION.md, CONTEXTO-PROYECTO.md, tus informes y el tablón. Este encargo223 actualiza el plan MONTAJE-CONTINUIDAD-217 con el corte comprobado del 5/11/2026.

- Pasaporte CLAUDE-PASSPORT-214, mapa CLAUDE-IMPACT-MAP-215, relevo CLAUDE-RELAY-REHEARSAL-216 y hub CLAUDE-HUB-217 están en revisión. Mantienen sus reservas. Esperan revisión de código y contrato antes de su montaje final.
- CODEX-HS-READ-MOUNT-218 y CODEX-INTEGRATIONS-COPY-219 están aceptadas. `main` ya registra la API212 con autorización214. Integraciones ya muestra confirmación por portal, cinco lecturas, resultados por objeto, caducidad y cancelación. La revisión221 repitió26 Node,24DOM y tipos.
- El sello de configuración ya existe en `server/hubspot-read-check-mount.ts`, como SHA-256 del valor cifrado guardado. Volver a guardar la misma credencial invalida la observación anterior. La autorización ya usa `security.captureAuthorization`. Producción permanece deshabilitada. Reutiliza estas decisiones.
- La candidata222 del puerto4597 incorpora171 y218 aceptadas y está presentada para revisión. Pasaporte/mapa/ensayo/hub todavía esperan montaje. La versión servida tiene un manifiesto de fuentes y activos.
- App.tsx, ficha, host y Hoy están bajo CLAUDE-TASK-ATTEMPT-REOPEN-219 de la otra sesión. Store/Recovery y `server/continuity.ts` conservan reservas055/087. La memoria la mantiene CODEX-LAB-035.

Identifica las tareas por su nombre completo, porque varios números coinciden. Registra cada paquete con archivos exactos y un propietario de sesión acordado, seguido de claim y check-path. Una sesión que se llama `claude` en el tablón no adquiere las reservas de la otra. Los cambios presentados se retoman tras devolución o en una unidad nueva cuando sus rutas estén libres. La ampliación de alcance necesita un encargo propio. Coordina los parches centrales con Codex y deja un cambio preciso para el propietario de App. Comprueba estado y hashes antes de escribir archivos existentes.

## 1. Cierra las garantías pendientes antes de conectar botones

Lee las revisiones de214–217 y atiende primero los hallazgos devueltos. Codex ha reproducido una frontera adicional del relevo con `tests/.tmp/mission223-relay-probe.mjs`, conservada en su log. La sonda usa createBaseApp real e inyección HTTP con ejecutores sintéticos, sin procesos del Kit. POST inicia un ejecutor retenido, DELETE marca cancelación y el siguiente POST inicia otro antes de liberar el primero. El resultado observado es `runsBeforeRelease:2`. No acredita dos Kits reales. Sí exige corregir la exclusión de ejecuciones antes del montaje. Codex recibió el aviso para la revisión de216. Espera la devolución correspondiente antes de modificar sus archivos presentados.

La exclusión debe durar hasta que el ejecutor termine realmente o se compruebe la terminación de sus procesos propios. Distingue cancelación solicitada, publicación descartada y ejecución terminada. Si el ejecutor no se puede detener, conserva su ranura mientras drena y muestra ese estado. Un timeout tampoco libera capacidad física mientras el trabajo siga vivo. Prueba POST→DELETE→POST, timeout→POST, revocación→nueva sesión y cierre del servidor, con barreras y recuento de ejecutores vivos. Evita que un resultado antiguo sobrescriba uno posterior y limpia los temporizadores del recorrido. La cancelación devuelve un mensaje que corresponda a la garantía probada.

Revisa también los mensajes del hub tras pérdida de respuesta o bloqueo. `runRead` y `runRelay` contienen textos como «No se leyó nada», «No se ensayó nada» o «No se cambió nada». Si el fallo sucede después de iniciar una operación, esos textos necesitan evidencia. Usa hechos observables, por ejemplo que se perdió el resultado, que la publicación se descartó o que debe consultarse el estado. Prueba respuesta perdida después de un efecto y bloqueo a mitad. Conserva la distinción entre una lectura de proveedor, una observación guardada y un ensayo que pudo crear archivos.

## 2. Un único recorrido coherente para HubSpot

Actualiza el handoff217 cuando tengas su devolución o una reserva documental válida. En `main` ya existe `mountHubspotReadCheck`. El montaje del hub debe consumir esa API existente. Registrar otra vez las rutas, crear otra Continuity o crear otro almacén de conexión produciría conflictos y efectos ajenos. El constructor de Continuity crea Jobs, así que usa el lector aceptado218.

Decisión de producto para este montaje: «Abrir Integraciones» navega a Integraciones y a su panel de comprobación existente. El hub puede mostrar el resumen fechado y el estado por objeto, pero esa acción debe corresponder a su etiqueta. Retira o adapta la interceptación inline que hoy convierte `open-integrations` en confirmación de lectura. Reutiliza las acciones y el estado aceptados de218. Si prefieres una acción inline adicional, debe tener nombre y contrato propios, reutilizar la misma API y pasar por revisión. Evita dos implementaciones divergentes de consentimiento, caducidad y cancelación.

Comprobar realmente HubSpot sigue pendiente del portal numérico de ensayo propio y de la autorización humana de cinco GET. La credencial la introduce la persona en su terminal. Completa ahora la integración y las pruebas con proveedor ficticio. Esas pruebas deben bloquear cualquier salida externa.

## 3. Ejecuta el Kit desde una raíz de la instalación

Acuerda con Codex la raíz de ensayo y su ciclo de vida. Debe pertenecer a la instalación actual y estar separada de la base activa, exportaciones y copias del usuario. Usa una carpeta nueva por ejecución, identificada y con recursos acotados. El navegador nunca elige una ruta de disco. La contraseña ficticia se genera en el servidor y queda fuera de argumentos, logs y estados públicos.

El ejecutor actual de216 llama a `rehearse()` de116, que usa `tests/.tmp` del cwd. Inyecta una raíz por contrato o ejecuta un proceso propio con cwd aislado y recursos explícitos. Evita cambiar globalmente el cwd del servidor. Si el ajuste requiere tocar recursos o scripts de116, registra otra unidad con esas rutas y conserva sus garantías de publicación y reclamos. Reutiliza cifrado, inspección, aprobación por contenido y apertura en otro proceso.

Comprueba la ejecución desde una carpeta arrancable que carezca del árbol de pruebas del repositorio. Incluye los recursos y ejecutables que necesite el Kit en la candidata. Declara dependencias de ejecución existentes y prueba que pueden resolverse desde ese paquete. Identifica cada proceso hijo y verifica su cierre al terminar o cancelar según el contrato. Limita espacio y retención con una política explícita. Solo se pueden limpiar las carpetas propias marcadas de forma verificable. Los resultados parciales o inciertos se preservan según las garantías del Kit.

Pide a Codex una unidad exacta para registrar relevo y evidencia de copia en el arranque principal protegido. Verifica primero qué rutas existen. Monta cada registrador una vez y conserva la captura de autorización original. Comprueba sesión, Host, Origin, evidencia ilegible, persistencia, revocación y cierre desde el punto de entrada principal. El runtime independiente y el servidor de equipo mantienen su alcance propio.

## 4. Monta el hub en Continuidad y reduce la carga visual

Cuando214–217 estén aceptadas, reserva el montaje de `ContinuityHome.tsx` y los adaptadores, tests y CSS necesarios. Para App.tsx entrega el parche preciso a su propietario o espera la aceptación de219 y reclama una unidad sucesora. Una navegación ausente no se reemplaza por un botón sin efecto.

Coloca el bloque dentro de Continuidad. Muestra primero el siguiente paso accionable, la copia identificada y las decisiones pendientes que se puedan acreditar. El detalle del pasaporte y del mapa puede ir plegado. Mantén accesibles las fechas, procedencia, límites y descarga. Evita repetir en la misma vista dos paneles completos de conexión o un nuevo menú principal. Cada acción lleva a la superficie anunciada y permite volver conservando foco y contexto.

Carga cada fuente con su estado de lectura, error y reintento. Una petición retenida no debe impedir que aparezcan las fuentes que ya respondieron. Distingue carga de ausencia, indisponibilidad y cuarentena. Descarta respuestas de otra sesión, instalación o captura, incluso cuando el transporte ignore AbortSignal. El bloqueo real oculta y retira datos sensibles de la superficie.

Revalida caducidad con un temporizador local o una comprobación al recuperar visibilidad. Reutiliza la política aceptada de218. Una observación no puede conservar el distintivo de actualidad solo porque la persona dejó la pestaña abierta. Probar caducidad no requiere realizar nuevas peticiones al proveedor.

El ensayo con ficción conserva su identidad y alcance propios. El pasaporte distingue ese ensayo del estado recuperable de la copia activa. Un ensayo completado con otra semilla nunca acredita una recuperación de la copia del usuario. Los resultados presentados por el servidor se etiquetan como observados en su escenario real. Exportaciones declaradas y tiempos medidos mantienen su origen y límites.

## 5. Conecta datos reales del producto y el resumen de trabajo

Consume inventario, cola y comparación únicamente cuando sus contratos estén disponibles y su contexto corresponda al esperado. Si no existe una fuente, muestra el motivo y conserva lo conocido de las demás. No infieras borrados remotos a partir de referencias fuera de la captura. El usuario debe poder abrir desde el mapa el área afectada y volver a Continuidad.

El diario208 pertenece al otro frente. Adapta su resumen solo después de aceptar su contrato y montar su lectura protegida. Acuerda con la autora `status`, contexto, instante, origen, procedencia y recuentos o null, con cuarentena separada. Evita importar el estado privado del gestor o reconstruir el diario en el cliente. Si esa dependencia aún falta, el primer montaje puede mostrar trabajo local sin comprobar y registrar su continuación exacta. Esa falta no detiene el pasaporte, el mapa y el ensayo que ya tengan sus fuentes aceptadas.

Comprueba HTML y JSON descargados desde la App. Solo incluyen la lista pública de campos, con contexto y fecha coherentes. HTML es autocontenido, escapa texto y conserva límites y datos desconocidos. Una descarga no se interpreta como copia restaurable. El resumen de turno prioriza las decisiones que una persona puede atender y ofrece un siguiente paso real.

## 6. Prueba la App y publica una candidata verificable

Guion obligatorio desde navegación normal: abrir Continuidad, ver las fuentes independientes, abrir Integraciones, cancelar el consentimiento sin tráfico, confirmar cinco lecturas con proveedor ficticio, volver y ver la misma observación, dejarla caducar localmente y comprobar el cambio visual. Después inicia el ensayo ficticio, cancela o rechaza el primer consentimiento y verifica que no empieza. Confirma el segundo, espera el cierre real, revisa el resultado y descarga el pasaporte. Recarga y reinicia el servidor para comprobar la observación persistida y los límites del seguimiento.

Añade revocación durante identidad y durante relevo, pérdida de respuesta, timeout y cancelación con ejecutor retenido, segunda pestaña, cambio de conexión con el mismo portal, cambio de captura, una fuente fallida y otra sin responder. Cuenta peticiones de proveedor, ejecutores vivos, archivos y cambios CRM. Prueba foco, teclado y capturas finales abiertas a1440/390/320 con la barra lateral de la App.

El arnés217 sigue como prueba del componente. La aceptación del montaje exige `main` compilado, SQLite de archivo, autorización real local y el Kit real en el paquete arrancable. Las intercepciones para errores se identifican por separado. Evita reemplazar el resultado del Kit con una fixture en la prueba que acredita el ciclo completo.

Tras aceptar las unidades, acuerda con Codex una candidata servida con el nuevo montaje y sin fuentes ajenas todavía en edición. Registra hashes de fuente y activos, identidad de instancia, URL, procesos propios y el corte anterior que se conserva. Comprueba que el navegador recibe esos activos y que los botones del guion funcionan allí. El servidor4597 actual no incorpora217 por el hecho de que el archivo exista en el checkout.

## Orden de trabajo y entrega final

Atiende correcciones216/217 y prepara la raíz ejecutable mientras se revisan los modelos. Después cierra el registro de servidor y el montaje de Continuidad con propietarios claros. Añade las fuentes estructuradas disponibles y el resumen del diario cuando su contrato esté aceptado. Termina con la candidata visible. Durante esperas adelanta pruebas de montaje y recursos del ejecutor en rutas nuevas reservadas. Evita generar otro hub o un nuevo componente preparatorio para sustituir los consumidores ya construidos.

Presenta cada paquete con rutas, hashes, comandos, evidencia y siguiente unidad. Codex revisa y acepta. La entrega final enumera puntos de entrada visibles, URL comprobada, resultados que la persona puede obtener y límites que aún dependen de otro montaje. La misión queda cerrada cuando pasaporte, mapa y relevo son accesibles y verificables en esa App servida.
