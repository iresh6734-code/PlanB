# Misión extensa · cerrar el recorrido de trabajo real de Plan B

Continúa con una misión de producto completa y sostenida. El objetivo ya no es presentar un contrato aislado: quiero que una persona pueda trabajar desde Hoy, cerrar la ficha, navegar, volver, resolver lo incierto y revisar un conflicto conservando su intención. El resultado debe ser utilizable dentro de la App.

No midas el avance por número de archivos, pruebas o mensajes. Cierra recorridos de usuario. Organiza las reservas y revisiones sin detener todo el trabajo cuando exista otro bloque independiente, útil y autorizado que puedas implementar.

## 0. Lee el corte actual y respeta los propietarios

Repositorio D:\AI\Plan-B-CRM-v2.1\source. Lee AGENTS.md,CLAUDE.md,COORDINACION.md,CONTEXTO-PROYECTO.md y el tablón. Este encargo197complementa190A;no permite ignorar sus fronteras.

Corte comprobado4/11/2026:
- U1-148R2está done.170se presentó,pero Codex195la devolvió a working por el caso reentrante explicado debajo.171espera170done.
- Clientes166/183yservidor185están aceptados;187verificó generación/activación porHTTP. No los reimplementes.
- Codex196está reconciliando QA130con U1R2;no cambies tests/task-focus-followup.test.ts ni su E2Eo informes196.
- HubSpot173ya está aceptada;otroClaude mantiene sus siguientes fases yQA136rescate. No edites sus archivos.
- Búsqueda189y copia193están aceptadas.193/4596sigue sin montarU1/170/U2o166en el formulario. No reemplaces búsqueda189por un snapshotanterior.
- Store/Recoveryyserver/v2.ts/shared/operations.ts conservan sus reservas Codex055/087. No las amplíes por tu cuenta.

Cada paquete necesita archivos exactos,claim/check-path y dependencias correctas. La reserva permanece durante review. No te autoaceptes ni modifiques archivos presentados sin devolución. No presupongas que una sesión recibe mensajes o trabaja por su estado en el tablón.

## 1. Corrección concreta que desbloquea170

Lee coordination/reviews/CLAUDE-TASK-OUTCOMES-CONTRACT-170-independent.md. Codex repitió83Nodeytiposverdes,pero reprodujo un hueco nuevo con estrategia/suscriptor sintéticos:

dispose asienta una operación ynotifica antes de marcar el gestor cerrado. Durante esa notificación,un suscriptor puede iniciar otra tarea,que llamaonDispatch,pero el resumen devuelve dispatched0. Esto no es una reproducción desdeApp ni una llamadaHTTPreal;es un defecto del contrato de cierre yrecuentos.

Fija el cierre ysu resumen estable antes de ejecutarcallbacks,suscriptores o aborts. Prueba reentrada desde suscriptor yAbortSignal,submit/retryrechazados,resumen coherente ydispose idempotente. Conserva el resultado real de los envíos ya despachados. Añade regresiones propias,ejecuta la sonda delrevisor sin cambiarla ypresenta170R2.

Esta corrección es el primer paso;no constituye toda la misión. Mientras Codex revisa170puedes desarrollar el bloque independiente de decisiones delpunto3,con reserva nueva. No edites171hastaque sus dependencias estén aceptadas.

## 2. Paquete principal: U2completa enlaApp

Cuando170estédone,reclama CLAUDE-TASK-OUTCOMES-U2-171. Sus nueve rutas actuales son App.tsx,LocalOperations.tsx,TaskOutcomesHost.tsx,suCSS,Nodehost,DOMD7real,baselineD7real,informe yhandoff;compruébalas completas enel tablón antes de escribir.

Entrega una experiencia integrada:

**Seguimiento fuera de la ficha.** Un único gestor por propietario de sesión;la ficha yla superficie comparten esa instancia. Cerrar o salir deHoy no lo elimina. La persona ve si el intento está comprobando,enviado,confirmado,rechazado,aceptado por ella oincierto yqué acción real puede tomar.

**Interfaz compacta.** Usa un resumen discreto de resultados con detalle accesible,con tarea/copia yacciones pertinentes. Prioriza pendientes,sin añadir otro menú principal ni un tablero técnico. La superficie debe seguir visible al navegar donde corresponda,pero oculta mientras la sesión está bloqueada. Evita duplicaciones que compitan con la ficha.

**Recarga honesta.** Un solo punto de coordinación de onConfirmed. Estado padre primero;Hoy después cuando esté montada. El consumidor/versionado debe reflejar cambios reales:una función aparentemente estable que esconda otro consumidor en unrefno debe atribuirle el éxito del anterior sin probarlo. Usa las causasstate/listcerradas yconserva el acuse aunque falle una lectura. Reintentar actualización solo hacelecturas.

**Cierre y bloqueo.** dispose antes de retirar al propietario,aislamiento entre sesiones ysin singleton. Envíos que ya salieron no son cancelados. El contador devuelto no conserva seguimiento detallado:si solo hay un recuento,no declaresD7cerrado tras bloqueo. Haz visible esa limitación y acuerda la siguiente garantía sin guardar textos de tareas osecretos en un aviso público.

**Foco y móvil.** Si una tarea se completa ysale de la cola,el foco debe ir a un control útil. Modales,Escape,Tab/ShiftTab,borrador yerrores se mantienen.1440/390/320con capturas finales abiertas;sin recorte horizontal ni controles inaccesibles.

Verifica enlaAppreal:guardado normal,cerrar durantepreflight,cerrar trasdespacho,acuseperdido,navegar durante recarga,fallo padre,fallo Hoy,reintentar sololectura,doble clic,401/404/409/422,cambio de captura,bloquearantes/despuésydesbloquear sin mezclar propietarios. Servidor real yfallos con barreras. Un arnés propio solo acredita lo que contiene;no reemplaza el recorridoApp.

Presenta171cuandoel paquete completo esté verificado;no trascrear únicamente elhost oelCSS. Si encuentras un defecto fueradelas nueve rutas,registra reproducción yotra unidad antes deeditar,no expandas silenciosamente171.

## 3. Trabajo independiente durante las revisiones: decidir un conflicto

Este bloque puede implementarse mientras170o171están enreview,porque no necesita modificarlas. Registra una unidad propia yrecomprueba estas rutas nuevas propuestas,que estaban libres alpreparar197:
- shared/task-conflict-review.ts
- src/TaskConflictReview.tsx
- src/task-conflict-review.css
- tests/task-conflict-review.test.ts
- tests/e2e/task-conflict-review.spec.ts
- un informe yun handoff propios con elIDque asigne eltablón.

Implementa el modelo yel componente de decisión que después se montará en la ficha existente. Recibe esquema,base revisada,borrador,versión actual eidentidades. Por campo distingue cambio propio,ajeno e incompatible;presenta «lo que viste»,«tu propuesta» y«lo que hay ahora». La persona elige explícitamente qué conservar;su borrador sobrevive.

El componente produce una propuesta validable,nunca guarda por sucuenta ni crea otrogestor. Si las identidades no coinciden,no ofrezcas una mezcla como si fueran el mismo registro. Usa textoReactseguro,formatosexistentes yvalidacionesreutilizadas. Prueba homónimos,vacío/null,referencias,fechas,textolargo,campossololectura,teclado y320px. No presupongas que una selección humana prueba autoría de un envío anterior.

Entrega este bloque como preparación explícita,con su futura llamada e integración documentadas. La misión completa exige montarlo después;no anuncies que elconflicto ya se resuelve desdeHoyporpasar suarnés.

## 4. Reabrir y continuar un intento exacto

Tras171aceptada,registra un paquete de integración de reapertura. Incluirá las rutas necesarias de ficha/host/panel/App/LocalOperations ypruebas,solo si están libres yreservadas expresamente.

Desde un resultado pendiente,la persona debe volver a la tarea yseguir el intento correcto. Usa instalación,captura,contexto,taskId yattemptId;no solo título oID. Una operación incierta se vuelve a mostrarcomo incierta,no como otro formulario listo para guardar. Reabrir no hacePATCH. Si no puede adoptarse con seguridad,explica el motivo yconserva la intenciónsin iniciarotraoperación.

Comprueba dos tareas homónimas,mismaIDenotra captura,resultado tardío,cierre/reapertura,búsqueda/filtrado yfilaque desaparece alcompletarse. Integra las acciones en el recorrido existente yrecupera foco correctamente.

## 5. Guardado contra la versión realmente revisada

Conlos paquetesprevios aceptados,registra la adopción delcliente166/puente183/servidor185enelcontrato delgestor y laficha. El diseño debe preservar changed,unchanged,current,token yfronteraonDispatch;elcontrato actual no permite tirarlos oconvertirunchangedensavedlegacysinmás.

No renueves una revisiónvieja para reenviar la misma intención. Si el servidor respondeconflict,carga laversiónactual de forma explícita,conserva elborrador yusa el componente depunto3. Solo una decisión nueva puede producir otrointento con labase/revisión que la persona acaba de examinar.

No-op:no añadehistorial,contadorni falsa nuevaescritura. Acuse perdido:incierto→comprobaciónGET;valoresigualesno prueban autoría. Aceptar una lectura conserva procedencia humana. Manténelcierre de170yefectos heredados401de123junto alorden deautenticación158.

PruebasApp:dos editores desde la misma revisión,conflicto visible yborrador intacto,decisión por campo,nuevointento explícito,un único cambio ganador,no-op,cambio degeneración yverificaciónsinreenvío. No atribuyasCASalformulario antes de montarlo realmente.

## 6. Entrega vertical y continuación

Guion final desde una ficción nueva:
abrirHoy→editar→cerrarficha→navegar→verseguimiento→volver→acuseperdido→comprobar sin escribir→aceptar estado leído→conflicto de otroeditor→elegir valores→nuevo intento explícito→confirmarhistorial ycola→revisar móvil.

Alcancevisible,fuentesaceptadas,buildinstalado yprocesovivo son hechos diferentes. Codex preparará una copia visible nueva cuando correspondan sus reservas;no reinicies4596niotrasdemos. No mezclesfuentes no identificadas delaboratorio ocontratos aún enreviewpara conseguir unbuildmásnuevo.

Entrega cada paquete conhashes,comandos,estado real,pruebasfinales,capturas inspeccionadas ylímites. Informa brevemente de hitos reales,sinconvertircada edición enunaentrega. Si una dependenciaestá enreview,continúa un bloque independiente reclamable de esta misión. Si no existe,documenta elbloqueoexacto;no fabriquesactividad,repeticionesoaprobaciones.

La misión no está completada por resolverF1oañadir elcomparador:queda completada cuando el recorrido operativo de estas fases esté integrado yverificado bajo sus revisiones. La persistencia trasreiniciar podrá venir enotro encargo cuando se liberen las dependencias de almacenamiento;no la prometas conun gestor enmemoria.

No tocar196,HubSpot/QArescate,búsqueda189,reservas055/087,cuentas/credencialesreales,equipo corporativo,dependencias nuevas,worktrees,commitsopublicaciones. Tienes autorización para desarrollar estos paquetesconreservasexactasypruebasficticias,no para saltarte susdependencias oactivarproveedores.
