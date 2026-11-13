# Revisión147 · CLAUDE-TASK-UNCERTAINTY-136

## Dictamen vigente R2 · 3/11/2026, Europe/Madrid

**Aceptar la entrega R2 de 136 como módulo y superficie aislados.** Codex es revisor distinto de Claude. Los nueve hashes presentados coinciden antes y después de esta comprobación. La guarda de exclusión está ahora en `start`, compartida por `submit` y `retry`, antes de registrar el intento o modificar `supersededBy`. La superficie comunica el resultado `busy` sin afirmar que se envió otra escritura.

Se invirtió la observación propia bajo la reserva147: un intento anterior no enviado no puede reintentarse mientras otro de la misma tarea y contexto tiene un PATCH pendiente. Se conserva íntegra la lista, el intento anterior sigue sin sustituto, hay una operación sin resolver y un solo PATCH. Al liberar la barrera, SQLite registra un cambio con el valor reciente. Un reintento explícito posterior puede empezar, pero el preflight real detecta su baseline desfasado: no se envía otro PATCH ni se sobrescribe el valor reciente.

Evidencia propia congelada: `tests/.tmp/outcomes147-r2-2d9224d4-9052-4f32-a217-ddfdd25a0684`. **1/1 regresión independiente, 23/23 Node del autor y 13/13 navegador repetidas**, sin fallos, skips o flaky; typecheck focal limpio. La prueba independiente usa Fastify inject y SQLite en memoria. Los recorridos DOM montan el banco aislado del autor, no App principal ni el montaje final U1. Se inspeccionó la captura de 320 px: los avisos y acciones permanecen legibles, incluido un nombre largo. No es auditoría con lector de pantalla. Browser plugin not available; se usó Playwright CLI y Chromium de caché propios, sin perfil del usuario, con datos ficticios y red externa bloqueada.

Control causal: sustituyendo únicamente el controlador de la copia por R1, la misma regresión falla por `started !== busy` (AssertionError), sin error de infraestructura. Se restauró la copia al hash R2 y se cotejaron de nuevo las fuentes congeladas y los nueve archivos presentados. Este control no llega a las aserciones posteriores al rechazo; la reproducción histórica R1 de dos escrituras queda conservada en el apartado siguiente y en su snapshot original.

La aceptación cierra F1 para el gestor dentro de una ventana. **No cierra D7 en App**, ni acepta U1-148, persistencia tras recarga, exclusión multipestaña/proceso, idempotencia o CAS integrado. No se modificaron archivos de Claude ni sus reservas durante la revisión; las dos rutas propias147 se presentan nuevamente para revisión ajena. Los resultados históricos siguientes documentan el dictamen R1 sustituido, no un defecto actual declarado.

## Historial R1 · dictamen sustituido

3/11/2026,Europe/Madrid. Codex,revisor distinto deClaude. **Devolver a corrección;no integrar ni aceptar136.** La reserva de sus nueve archivos se mantiene. U1-148 depende de136 y no debe adelantarse a su aceptación corregida.

## F1 · retry omite la exclusión de operaciones para una misma tarea y copia

`submit` busca otra operación sinresolver con la misma clave(contextKey+taskId). `retry` comprueba únicamente que el intento anterior se pueda reintentar y llama directamente a `start`;no consulta si existe otra operación más reciente pendiente. `start` tampoco aplica esa guarda.

Se reproduce con el gestor y su legacyStrategy reales,el cliente123 real,Fastify mediante inject y SQLite en memoria. No se sustituye el gestor ni se inventa un éxito del backend. La primera comprobación recibe un503ficticio;las siguientes lecturas llegan al servidor real. Una barrera retiene escrituras antes del backend para ordenar la carrera:

1.Un intentoA termina not_sent;0PATCH y0cambios.
2.Se hace un submit nuevo B para la misma task-2 y el mismo contexto;alcanza el transportePATCH y queda retenido.
3.Control positivo:otro submit C devuelve busy,sin enviar.
4.Se pide explícitamente retry(A). Devuelve started y registra otro in_flight de la misma clave mientrasB sigue pendiente. La barrera recibe dosPATCH;el backend todavía conserva0cambios.
5.Se libera la barrera:ambos intentos confirman y SQLite contiene dos cambios,con notes fresh147 yretry-old147. No se afirma un orden final universal;se comprueba que ambas escrituras ocurrieron.

Es una infracción de la exclusión **dentro del mismo gestor y ventana**,no la limitación multipestaña ya declarada. No es un reenvío automático:la prueba solicita el reintento explícitamente,pero debería bloquearse mientras exista la operaciónB. Tampoco prueba una explotación remota,datos reales,una pantalla deApp montada o una carrera de disco.

## Evidencia y control causal

Snapshot `tests/.tmp/outcomes147-c0cd9301-b356-4265-9363-aa7a71c2206f`,manifest.json conserva fuentes y los nueve hashes presentados136,iguales antes/después. `tests/independent-task-outcomes.test.ts`:**1/1 observación del defecto**,no una regresión verde. observation1.log registra el resultado. En author18.log las**18/18 pruebas del autor pasan** y typecheckfocal está limpio:esas pruebas no cubren la combinaciónA no_enviado+B pendiente+retryA.

Control privado:solo en la copia congelada se añadió a retry una búsqueda de otra operación sinresolver con la misma clave. La misma observación pasó a fallar conAssertionError porque recibió busy en vez de started. private-guard-control.log/json conservan el contraste;no hubo error de importación/compilación/timeout. Se restauró la copia al hash original. Esto aísla la causa;**no entrega una corrección completa ni edita los archivosClaude**.

El caso propio usa Fastifyinject,no escuchaTCP. Las18autoras se repitieron con sus servidoresloopback propios y SQLite en memoria. Entorno mínimo/redexternabloqueada;sin proveedores,cuentas,credenciales,datos/clientes,basesanteriores oDPAPI recuperado. No se repitieron los12DOM declarados por el autor;no se acepta la superficie ni se certifica su accesibilidad en esta revisión.

## R2 requerida

Aplicar la exclusión a **todas las vías que inician operaciones**,incluido retry. Si hay otra operación sinresolver de la misma tarea/copia,devolver busy/refused sin registrar un nuevo intento,emitirPATCH,alterar el intento reciente o marcar el anterior como sustituido. Mantener un resultado comprensible en la superficie;no solucionar el caso bloqueando todas las tareas o todas las copias.

Añadir regresiones causales para un intento anteriornot_sent y uno nuevo en comprobación/enviado,así como uno nuevo incierto;dos clics de reintento;ID/contexto distintos que sí pueden avanzar;estado previo y supersededBy conservados tras el rechazo. Las pruebas deben fallar por la causa con esta versión y pasar conR2. Repetir las18Node y losDOM afectados,con hashes finales. No cambiar123/128/140/App o integrarU1 para sortear el defecto.

Esta observación está escrita para pasar cuando existe F1. Tras corregir,debe invertirse o sustituirse bajo la reserva147;no se presentará su rojo esperado como fallo del producto ni su verde actual como aceptación. El resto de la entrega136 mantiene los límites conocidos:solo memoria,no persistencia tras recarga,CAS/idempotencia no integrados,yD7 todavía abierto enApp hasta una unidad de montaje revisada. No se afirma revisión exhaustiva de todas sus carreras/estados.
