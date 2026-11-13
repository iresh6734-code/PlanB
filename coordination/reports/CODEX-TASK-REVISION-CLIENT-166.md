# Cliente de tareas con revisión · 166

4/11/2026, Europe/Madrid. Codex. Entrega para revisión ajena, sin autoaceptación.

Se implementa un cliente independiente para el endpoint de revisiones160. Conserva la vista revisada como base del guardado y distingue cambio confirmado, no-op, conflicto de revisión, otro rechazoHTTP, validación previa y resultado incierto. El resultado incluye la nueva revisión. No monta la función en la ficha ni modifica el gestor136, App o fuentes de Claude. Se coordinó el alcance con el otro Codex antes de reservar.

Valida contratos e identidad de los acuses y los campos escritos; un200 que apunte a otra tarea/copia o valores no confirma. La lectura admite una identidad esperada de instalación/captura/fecha y comprueba la ID solicitada. Límite predeterminado de2MiB mientras se consume el stream y20s por petición, incluso si un transporte ignora cancelación. Redirecciones rechazadas; sin persistencia, reintentos automáticos o fallback a escrituraslegacy.

## Pruebas

Once casos nuevos: Fastify/createBaseApp/Store reales en memoria con transporte inject convertido en Response, más un caso de fetch nativo sobre HTTP loopback. Casos: cambio/no-op/conflicto, dos editores con un solo cambio, pérdida de acuse y lectura sin reenvío, devolución en curso distinta de conflicto de revisión, mismaID/otra instalación, validación y cancelación previa sin petición,401, cinco variantes de acuse incoherente, stream excesivo cancelado, timeout con transporte que ignora señal y lectura incompleta/otraID/404. Las simulaciones de acuse envuelven respuestas producidas por el servidor real; las de tamaño/timeout son transportes sintéticos declarados.

Pasada focal final **25/25**, sin omitidas niTODO (11cliente+8montaje160+6API128), con Node/red externa bloqueada, en `tests/.tmp/revision166-final.log`. Incluye Content-Type estricto y rechazo de redirecciones en el código final. Typecheck focal final del cliente y su prueba correcto. La primera pasada restringida, antes de añadir dos casos, dio22/23 por EACCES a loopback en un caso de montaje existente; no fue fallo del cliente nuevo. Se repitió con acceso local autorizado; no se suman reejecuciones como casos nuevos.

## Límites

No hay UI nueva ni conexión al SaveStrategy136: hace falta preservar changed:false/nueva revisión en un contrato de consumidor explícito, según el traspaso. No se actualizó4594. La identidad opcional de lectura no sustituye TaskContext123 completo; el token de escritura sí lo comprueba el servidor según128, bajo su garantía de un escritor. No se prueba multiproceso, HubSpot, datos reales o lectores de pantalla. No se ejecutó npmtest global.

Traspaso: `coordination/plans/TASK-REVISION-CLIENT-166-HANDOFF.md`. Después de aceptación, integrar por unidades reservadas tras U1; el otro Codex activa los lanzadores por unidades propias y no se presenta esta fuente como instalada.
