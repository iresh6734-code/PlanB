# Traspaso · edición de tareas con revisión 128

Este archivo es un traspaso local, no confirma que Claude lo haya recibido. `CODEX-TASK-CAS-128` está para revisión; no integrar hasta revisar sus hashes y verificar que existe un solo proceso escritor. Respetar las reservas de `CLAUDE-TASK-FOCUS-123`, `CODEX-SEARCH-053` y cualquier encargo posterior. El montaje necesita otra unidad con archivos exactos reservados; ninguna reserva se libera por estar en revisión.

## Contrato propuesto

Registrar `registerTaskRevision(app, store)` únicamente en `createBaseApp`, después de verificar los hooks de autenticación y protección de host y origen. El arnés demuestra esos controles; no indica que la app en ejecución monte la ruta.

1. `GET /api/v7/task-revision/:id` devuelve `{ format: 'planb-task-revision-v1', revision, instanceId, captureId, capturedAt, record }`. Guardar la revisión junto con los datos que el usuario vio; el ID tiene un máximo de 500 caracteres.
2. `PATCH` a la misma ruta con `{ expectedRevision, values: { subject: '...' } }`. Los valores son primitivos, los campos deben pertenecer a la especificación y las demás validaciones las aplica el almacén. Respuesta: `{ ok: true, changed, current }`; `current` es el estado persistido con su nueva revisión.
3. Ante 409, conservar el borrador; leer otra vez y permitir comparar los valores que se mostraron, lo que el usuario escribió y el estado actual antes de volver a confirmar. Distinguir el conflicto de revisión de otros 409, como devolución en curso. No hacer reintento automático. 422 indica validación; 404 indica tarea ausente.
4. Separar el resultado confirmado de la escritura de los fallos de actualización posteriores: un fallo al refrescar la lista no debe afirmar que no se guardó. Si se pierde el acuse, informar del resultado incierto; una lectura posterior informa del estado actual, pero no demuestra la autoría de un cambio coincidente. No volver a aplicar ciegamente.

## Qué falta para ofrecerlo al usuario

- Revisión independiente de implementación y amenazas de carrera; demostrar o establecer el supuesto de escritor único de la instalación. No venderlo como CAS multiproceso ni protección para las rutas antiguas.
- Acordar y reservar el montaje de servidor y la adopción de interfaz cuando 123 y las reservas relacionadas lo permitan. No modificar la ficha de otro agente mientras esté trabajando o en revisión.
- Prueba en la app real con dos pestañas, conflicto y borrador preservado; guardado confirmado seguido de recarga fallida; respuesta perdida; desmontaje; fallos de red y navegación por teclado. Probar también el empaquetado final y la ausencia de efectos en rutas anteriores.
- Evaluar coste con capturas grandes y límites de IDs anteriores a los cambios de producto. El hash identifica una revisión; no es firma ni prueba de autenticidad. No se ha demostrado sincronización con HubSpot ni con otros equipos.
