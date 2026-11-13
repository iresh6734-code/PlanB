# Montaje opcional de revisiones de tareas · 160

4/11/2026, Europe/Madrid. Codex. Entrega para revisión independiente, sin autoaceptación.

## Cambio

La factoría protegida `createBaseApp` acepta `taskRevisions: true` para montar las rutas ya aceptadas de 128. El valor por defecto es falso, preservando los lanzadores y consumidores actuales hasta su activación explícita. Esto prepara el servidor para rechazar una escritura basada en un estado antiguo, en lugar de depender de que cada consumidor registre las rutas por su cuenta. La secuencia de comparación y guardado sigue siendo síncrona y limitada a un escritor cooperativo.

`registerTaskRevision` conserva una asociación débil por instancia de App: registrar otra vez el mismo Store es inocuo; registrar otro Store en esa App se rechaza. Evita duplicar rutas o asociar silenciosamente datos de otro almacén. No altera cómo se calcula o compara la revisión.

Se coordinaron las rutas con el otro Codex antes de editar. La unidad reserva dos fuentes, una prueba nueva y dos documentos. App React, LocalOperations y las rutas de Claude permanecen fuera de esta unidad. El otro Codex ha indicado que coordinará el montaje de los lanzadores después de la revisión.

## Validación

Las ocho pruebas nuevas ejercitan el montaje sin registro manual, opt-out, controles de sesión/host/origen, dos escrituras desde la misma revisión, reenvío obsoleto, no-op sin historial, escritura legacy que invalida una revisión, registro repetido y otro Store, factoría runtime y contrato por HTTP loopback real. Las escrituras concurrentes montadas dan un 200 y un 409, con una sola fila de cambio. El HTTP real comprueba rechazo sin sesión, guardado autorizado y reenvío 409 sin duplicación.

El typecheck focal de las dos fuentes y la nueva prueba pasó. La pasada completa final dio **57/57**, sin omitidas ni TODO: 8 nuevas, 16 originales de revisiones 128, 10 independientes de 129 y 23 del gestor de resultados de Claude. Incluye el arranque ficticio del principal y rechazo del segundo dueño de su carpeta. Log: `tests/.tmp/task160-final57.log`. No se ejecutó `npm test` completo ni navegador, ya que no se modifica la interfaz.

Incidencias previas: una primera ejecución restringida de 56 casos dio 31 favorables y 25 fallos: los casos con HTTP no alcanzaban loopback; un caso de disco necesitaba `NODE_ENV=test` para su clave ficticia; el arranque del principal no acreditó el endpoint en ese entorno. Un caso nuevo mío esperaba `disconnected:true` después de activar la fixture, que modifica ese valor: lo corregí para comprobar que el runtime rechaza habilitar servicios externos y que no tiene IA habilitada. No se cambió el producto para acomodar el test. Tras corregir el arnés y repetir con entorno de ensayo y acceso loopback, una pasada de 56 pasó; después se añadió la prueba HTTP y pasó la nueva batería 8/8. No se suman estas ejecuciones como casos distintos.

## Límites y siguiente paso

Los lanzadores main/runtime todavía no activan la opción; ninguna preview ha sido actualizada. Antes de ofrecer la función en la App faltan aceptación ajena, activación del lanzador con exclusión de escritor comprobada y adopción por el cliente. Las rutas legacy no obtienen CAS, no existe idempotencia por intención ni garantía multiproceso. El traspaso está en `coordination/plans/TASK-REVISION-MOUNT-160-HANDOFF.md`. Se usaron datos y claves ficticios nuevos, sin proveedor externo ni acceso a otro equipo.
