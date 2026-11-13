# Revisión162 · montaje opcional160

4/11/2026, Europe/Madrid. **Aceptar160 como montaje opcional de la factoría protegida.** Revisor Codex distinto de la sesión autora. Los cinco hashes presentados se cotejaron antes y después;no se editaron sus archivos.

La opción taskRevisions activa el servicio128 dentro de createBaseApp,después de sus controles de seguridad. Omitirla o pasarfalse conserva la ausencia de estas rutas. El WeakMap distingue instancias deApp y asocia el Store exacto: repetir el registro con los mismos objetos es inocuo;otro Store se rechaza antes de modificar la asociación. Esto no activa main/runtime ni impone físicamente un escritor a cualquier consumidor de createBaseApp.

## Comprobación propia

Snapshot `tests/.tmp/mount162-7f0d8aa0-e913-4848-8f69-3857336066fc`. **7/7 pruebas independientes**, **24/24 del autor repetidas** (8montaje160+16servicio128),typecheck focal limpio.0skip/TODO. No se repitieron10de129 o23delgestor136;los57declarados por160 son de su autor,no se suman como otra ejecución de este chat.

Las siete pruebas propias comprueban:

- Opción omitida,false ytrue,en ambos perfiles:200 solo contrue;ninguna escritura al leer.
- Registro explícito de un consumidor sin opt-in antes de servir y repetición segura después de ready.
- Rechazo de otro Store,sin rebinding:la ruta conserva identidad/revisión y una escritura posterior solo cambia el almacén original.
- Dos Apps con tarea,cuenta y fechas iguales mantienen instancias/revisiones distintas;el token deA no autoriza escribir enB.
- Un no-op sigue bloqueado durante returnBusy con409 distinto del conflicto de revisión;al liberar,changed:false conserva revisión e historial.
- Lecturas bloqueadas401 sin registro expuesto y con no-store/VaryCookie;escrituras con Host/Origin ajenos403,sin cambio.
- HTTP loopback real:24PATCH desde la misma revisión producen1éxito y23conflictos TASK_REVISION_CHANGED,un solo cambio persistido. Repetir el token viejo incluso con el valor ganador vuelve a409 sin otra fila.

Sensibilidad en copias privadas,sin cambiar las aserciones:activar la opción por defecto hace fallar la prueba de omisión;suprimir el rechazo de otro Store hace fallar la prueba de asociación. Cada control da un AssertionError en su caso seleccionado,sin error de imports,compilación o timeout. Se restauraron las fuentes congeladas y se cotejaron de nuevo todos sus hashes. Los mutantes no se aplicaron al checkout.

Fastify/SQLite en memoria reales,puertos efímeros propios cuando hay HTTP,entorno mínimo/NODE_ENVtest y red externa bloqueada. Las Apps se cierran en finally;los procesos de prueba terminan por spawnSync. Sin proveedor,datos reales,cookies o contraseñas de usuario guardadas en informes. No fue necesaria comprobación de navegador porque160 no modifica UI.

## Dictamen y límites

No se halló un defecto que impida aceptar el alcance presentado. Se acepta160 sobre sus cinco hashes actuales.162 conserva sus dos reservas y se presenta para revisión ajena,sin autoaceptarse.

**Main/runtime siguen sin activar taskRevisions.** Sus reservas074/090 deben resolverse por revisión,antes de otra unidad exacta. La garantía continúa limitada a un escritor cooperativo en un proceso;legacy sigue sinCAS y no se añade idempotencia por intención. No se ha probado aquí un binario con la opción activada ni concurrencia entre procesos. El cliente aún debe obtener/conservar la revisión,distinguir changed:false y los diferentes409,conservar borrador y evitar reenvío automático. No se acepta U1/U2,D7,una candidata de distribución o una actualización de preview por este dictamen.
