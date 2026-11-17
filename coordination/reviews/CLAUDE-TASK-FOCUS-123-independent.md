# Revisión independiente de CLAUDE-TASK-FOCUS-123

2/11/2026, Europe/Madrid. Codex. Dictamen: **devolver para corrección; no montar aún**. Los once hashes presentados coincidían al inicio de la revisión. Las observaciones siguientes no suponen que 123 esté montada en la app principal.

## F1 · Verificar un acuse perdido puede mezclar instalaciones

`verifyAfterUncertain` en `src/local-task-focus-client.ts` consulta únicamente el registro por ID; no recibe ni contrasta el contexto que se abrió. Si entre el envío incierto y la lectura responde otra instalación o captura con la misma ID, puede devolver `read/applied` por una coincidencia de valores ajena. La ficha puede ofrecer «Dar por guardado» y continuar mostrando el contexto anterior.

Reproducción propia `tests/independent-task-focus-123.test.ts`, observación F1: dos `createBaseApp` con SQLite real en memoria y datos ficticios, instancias y capturas diferentes. Se envía a A un PATCH que se aplica y cuyo acuse se pierde; B tiene por separado la misma tarea ID y valor. La verificación dirigida a B devuelve `read/applied`, realizando solo `GET /api/v2/records/tasks/task-2`; ni consulta ni compara la identidad de B. Esto demuestra el contrato del cliente con dos servidores en memoria, no una conmutación real de puerto o navegador.

Corrección esperada: ligar las lecturas de verificación al contexto de la ficha, comprobar contexto antes y después de la lectura y tratar cambios o identidad no verificable como incertidumbre/contexto cambiado, sin confirmar ni habilitar una decisión basada en otro registro. Preservar el borrador y no reenviar el PATCH. Una coincidencia en la misma copia sigue sin demostrar autoría.

## F2 · Dos capturas con la misma ID se tratan como una sola

`contextKey` usa solo `instanceId` y `snapshotId`. El modelo y Store admiten una captura nueva con la misma ID y distinto `capturedAt`; esa sustitución no invalida la ficha. En la prueba propia F2 se abre la tarea de la captura A, se importa y activa la captura B con igual ID, misma instalación y otra fecha, y `saveTask` termina con `saved`: el PATCH cambia efectivamente la tarea de B. La misma limitación afecta a la comprobación antes/después de la lectura.

Corrección esperada: identidad de contexto suficientemente vinculada a la captura y a la sesión de trabajo efectiva; no asumir que el ID por sí solo es una versión. Contrastar con los contratos del servidor y probar sustitución con mismo ID y fecha distinta, instalación distinta y cambios entre lecturas. Si esos datos no bastan para identificar cada sustitución, exponer la limitación o acordar un contrato posterior: no inventar garantías ni modificar Store fuera de su reserva.

## F3 · Una decisión humana se presenta como acuse del servidor

Inspección estática: tras una lectura con valores coincidentes, `LocalTaskFocus.tsx` ofrece «Dar por guardado» y llama al mismo `confirmSaved` que un PATCH confirmado. La vista resultante dice «El servidor confirmó el guardado», aunque la lectura anterior reconocía que no se sabe quién aplicó los valores. Preservar la procedencia del resultado y decir que la persona aceptó el estado leído; no atribuirle un acuse inexistente. La ruta se ha comprobado en código, no se ha reproducido en DOM en esta revisión.

## F4 · El aviso de salida puede afirmar que no se envió nada

Inspección estática: el aviso de descarte siempre dice «Nada se ha enviado», también cuando `dirty` es verdadero por un resultado incierto o cuando un PATCH está en curso. Puede haberse enviado o incluso aplicado. Ajustar el aviso según el estado real; si la operación sigue en vuelo o su resultado es incierto, no afirmar que se descartó del servidor. No se ha reproducido en DOM en esta revisión.

## Evidencia y alcance

`node --import tsx --test tests/independent-task-focus-123.test.ts`: **2/2 pasan**, porque son observaciones diseñadas para confirmar el comportamiento defectuoso actual; **no son regresiones verdes de la corrección**. Tras corregir, deben invertirse o sustituirse por aserciones de seguridad que fallen contra la versión anterior. Se usaron `createBaseApp`, SQLite en memoria y `Fastify.inject`, sin sockets, proveedores ni datos reales. No se repitieron aquí los 19 DOM ni los 26 Node de Claude. No se ha atribuido causa al 401 intermitente que él declaró como hipótesis.

Al corregir, conservar las pruebas existentes y añadir regresiones causales: captura/instancia distinta tras acuse perdido, reemplazo con igual ID, bloqueo y borrador, ausencia de doble PATCH, acuse confirmado frente a decisión humana, y cierre con solicitud en vuelo o incierta. Repetir la suite pertinente y el DOM con datos ficticios. Las garantías de 128 y el montaje en Hoy siguen en encargos separados.

## Actualización 366 · 15/11/2026, Europe/Madrid

Las dos observaciones históricas anteriores se conservan como descripción de la reproducción original. La entrega aceptada de la ficha incorporó las protecciones y el archivo de pruebas todavía exigía el comportamiento anterior. Ahora F1 comprueba que una verificación sin contexto no consulta el registro, que una instancia distinta se rechaza incluso si contiene el valor buscado y que la instancia original sí permite leerlo sin repetir el PATCH. Una coincidencia de valores no atribuye el cambio. F2 comprueba que un editor anterior a una sustitución con igual ID de captura carece de permiso para escribir en esa copia y que el contexto recién leído sí permite un único PATCH.

26/26 en el banco de Fastify y SQLite con datos ficticios, además de tsc --noEmit sin errores. Tres controles causales sobre copias alteradas: permitir lectura sin contexto, eliminar el cotejo antes y después de leer una instancia ajena y reducir la comparación del editor a IDs. Cada uno falla en su aserción prevista. El primer intento ejecutó las pruebas vecinas con sockets sin permiso de loopback (2/2 de la suite propia pasaron). Repetí en el mismo banco con loopback habilitado y la guardia de red exterior, sin tocar las pruebas vecinas. Pruebas de navegador y batería completa fuera de este corte.

Banco tests/.tmp/taskfocus366-W3k6GY. Prueba actual 720ab5e0c292840c5d2747dc206903bcd8529e89c8d7a917316c96debacdc68e. Cliente y contrato compartido conservados por huella. Solo se actualizan estas dos rutas de la unidad 131. Las entradas históricas del manifiesto siguen bajo reserva de CLAUDE-CI-LOCAL.
