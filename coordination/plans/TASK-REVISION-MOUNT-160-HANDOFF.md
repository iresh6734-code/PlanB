# Activación de revisiones de tareas · traspaso 160

4/11/2026, Europe/Madrid. Implementación presentada para revisión; no se instala en las previews existentes.

`createBaseApp({ ..., taskRevisions: true })` monta las rutas de 128 dentro de los controles existentes de sesión, host y origen. El valor por defecto es falso. No hay nueva variable de entorno ni un cambio implícito de los lanzadores.

## Siguiente unidad de Codex: lanzadores

Tras aceptar 160, reservar las rutas exactas de los lanzadores que se activen. `server/main.ts` y `server/runtime.ts` usan `lockInstance` antes de abrir el Store; conservan reservas históricas que deben resolverse formalmente antes de editarlas. No activar la opción en otros lanzadores que permitan dos escritores cooperativos sobre la misma base. Añadir `taskRevisions: true` a su llamada y probar HTTP real, la segunda instancia rechazada antes de abrir la base y el arranque sobre carpeta ficticia propia.

La prueba independiente 129 de exclusión del principal se repite en esta unidad, pero el principal aún llama sin la opción: eso no demuestra un arranque ya activado. El runtime se ha probado mediante la factoría con la opción, no mediante su binario principal. No actualizar previews por el hecho de aceptar fuentes; preparar una entrega revisable con archivos compilados, hashes e identidad.

## Contrato del cliente posterior

- GET `/api/v7/task-revision/:id`: guardar `revision` junto con el registro que ve la persona.
- PATCH en esa ruta: `{ expectedRevision, values }`, con solo los campos cambiados.
- Respuesta `ok/changed/current`: conservar la nueva revisión. `changed:false` significa que no se añadió un cambio al historial.
- 409 con `details.code === 'TASK_REVISION_CHANGED'`: conservar el borrador y releer/comparar antes de otra decisión. Otros 409 pueden representar devolución en curso; no tratarlos todos como el mismo conflicto.
- Acuse perdido: leer y explicar lo observado. Valores coincidentes no prueban autoría. No reenviar automáticamente con una revisión nueva.

La integración de cliente debe coordinarse con U1/U2 de Claude; 160 no toca la ficha ni el gestor. Las rutas antiguas siguen pudiendo escribir sin comparación de revisión. Un reenvío con revisión vieja se rechaza, pero no existe idempotencia por intención ni comparación atómica entre procesos. La garantía depende de un escritor cooperativo.

`registerTaskRevision(app, store)` sigue disponible: repetir el registro con los mismos objetos es inocuo; usar otro Store sobre la misma App lanza un error de configuración. Los consumidores actuales sin opt-in pueden continuar con su registro explícito.
