# Radar291 · Activación explícita y dataset por petición

8/11/2026, Europe/Madrid. Contrato de implementación en curso. No modifica main/App/demo4601ni habilita A4.

## Problema

El helper289 conserva la semilla, pero requiere una copia ficticia activa. Registrar el backend con un dataset generado al arrancar no resuelve una instalación vacía ni permite recuperar la semilla después de activar una copia. Las rutas deben poder existir antes de que haya un escenario; **ninguna lectura crea la semilla**.

## CORE compatible

`registerCommitments(app, store, source, clock?)` conserva el modo existente con CommitmentDataset estático, validado al registrar. Añade un proveedor síncrono interno `() => CommitmentDataset | null`. No recibe rutas de disco, cuenta, dataset o generador del navegador.

En cada petición dinámica, tras autenticar y validar el pin de copia, se llama una sola vez al proveedor. Su resultado se valida/copia por el esquema del contrato y se calcula su revisión. Definición, observaciones, clave del diario, revisión esperada y recibo usan ese **mismo corte local** durante la petición. Un proveedor ausente, ilegible o incompatible responde503fijo sin exponer la excepción. No se retorna un dataset vacío para fingir éxito.

El proveedor es una lectura síncrona, no una tarea de red ni un callback que deba escribir. Un cambio futuro del proveedor puede producir otro corte en la siguiente petición, aislado por datasetRevision; no se promete un estado continuamente actualizado después de la última lectura. Pin y autorización se revalidan tras la obtención y al publicar/confirmar. Una petición de decisión con revisión de otro corte no escribe. Los eventos de un corte anterior no se adoptan por coincidencia de IDs.

## Montaje interno explícito

Nuevo `mountCommitmentRadar(app, store, options?)`, llamado únicamente por la futura composición central autorizada. Registra el CORE con un proveedor que lee289y solo devuelve su dataset si está ready. El reloj actual de evaluación permanece separado del seedAt. Registra además:

| Ruta | Entrada | Resultado y efecto |
| --- | --- | --- |
| GET `/api/v7/commitment-radar` | `contextRevision` cuando existe copia activa | Estado local: inactive-copy, not-fiction, not-initialized, available o unavailable; solo available publica seedAt/revisión/procedencia. **No escribe**. |
| POST `/api/v7/commitment-radar/activate` | JSON estricto `{contextRevision}` | Activa el ensayo para la copia ficticia actual mediante289.201si creó,200si ya existía válido. No cambia tareas, historiales o esquemas. |

Todas las rutas exigen autorización local existente, no-store/Pragma/VaryCookie. Sin copia activa, GETsinpinpuede describir inactive-copy; el pin de una copia anterior no se acepta como actual. Con copia activa, pin ausente o distinto da409sin estado de esa copia. Una copia marcada como producción no puede activar ni obtener semilla de ensayo. El estado not-fiction no es una conexión a proveedor.

POSTes una acción humana explícita del futuro anfitrión. No admite una fecha, dataset, cuenta, path, reparación o reset aportados por el cliente. La primera activación guarda el instante del reloj del servidor. Un reintento tras perder respuesta lee la misma semilla; no rejuvenece fechas ni borra decisiones. El callback de reloj no concede autoridad: después de él se comprueban otra vez el permiso original y el pin antes de escribir. Si la sesión se pierde después de un commit confirmado, se conserva la escritura y no se devuelve contenido a la sesión perdida.

Marcador corrupto/de otra instalación/revisión incompatible no se sustituye; POSTresponde503y GETunavailable sin fechas ni dataset inventado. La reparación requiere un encargo separado. GET del CORE antes de activar responde503, nunca inicializa o despacha nada. Un handler de otra instalación no se registra sobre el mismo app/Store implícitamente.

## Códigos y alcance

-401: autorización original ausente o perdida, error fijo sin metadatos de escenario.
-409: pin/copia cambió, no hay copia ficticia activa o se intenta usar un corte anterior de decisiones.
-422: query/cuerpo/identificador incompatibles. Solo se admiten los campos definidos.
-503: origen/semilla/historial no legible o configuración del proveedor incompatible; no se filtra excepción original.

La activación solo persiste un marcador cifrado en archivo. Las decisiones siguen el historial existente de CORE, sus revisiones y clave de operación. No hay lectura de HubSpot/Zendesk/Pipedrive ni escritura externa. `covers:false` de trabajo local no cambia: una semilla no instrumenta guardados ni recupera borradores.

## Puerta de llegada a producto

Esta unidad entrega backend y pruebas; no afirma pantalla montada. El dueño sigue siendo `CODEX-COMMITMENT-RADAR-MOUNT`, con aceptación previa de291,289,UI de Radar y JornadaA3. mainregistra el módulo y el anfitrión consulta estado local; si falta semilla ofrece una acción explícita que llamaactivatey después recarga contexto/lista. No poner una ruta oculta para dar por montado el Radar ni crear la semilla al abrir una pantalla. La semilla se lee al reiniciar; el reloj de evaluación sigue actual.

La prueba de montaje sucesora debe cubrir instalación vacía→importar/activar ficción→habilitar ensayo→detectar→fuente→decidir→reiniciar→historial, con otra copia y otra cuenta como controles. Con proveedores reales siguen pendientes autorización, cuenta y ensayos propios. La demo288yZIP271no se actualizan por esta unidad.
