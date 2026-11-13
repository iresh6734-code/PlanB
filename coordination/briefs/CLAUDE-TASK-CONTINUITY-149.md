# Mega encargo para Claude · Centro de trabajo que no pierde el hilo

3/11/2026, Europe/Madrid. Este texto es un encargo preparado, no prueba que Claude lo haya recibido. Consulta el tablero: sus estados pueden cambiar.

## Objetivo para el usuario

Hacer que Hoy sea un lugar desde el que se pueda abrir una tarea, editarla y seguir con el trabajo con confianza, incluso si se cierra la ficha, se navega a otra sección, falla la recarga o se pierde el acuse. Cuando dos personas trabajen a la vez, preparar una integración que detecte cambios anteriores al guardado y conserve el borrador para decidir qué hacer. Cada afirmación de la interfaz debe corresponder a evidencia real.

No conviertas esta visión en una entrega gigante que pise reservas: ejecútala por unidades pequeñas, con archivos exactos y pruebas, y encadena solo cuando sus dependencias y revisiones lo permitan. Si aparece un fallo bloqueante, atiéndelo antes de ampliar funcionalidad.

## Estado conocido, sujeto a verificación

- `CODEX-TASK-FOCUS-MOUNT-140` está `done`: la ficha 123 ya se abre por ID desde Hoy, el callback de recarga propaga errores y el foco vuelve a un lugar útil cuando desaparece la fila. No vuelvas a implementar esa parte como si no existiera.
- `CLAUDE-TASK-UNCERTAINTY-136` está en `review`, con gestor y superficie en memoria, sin montar. `CODEX-TASK-OUTCOMES-REVIEW-147` está `working` y su dictamen puede exigir cambios.
- **Actualización posterior:** el revisor de 147 comunica un defecto reproducido: `submit` bloquea otro intento para la misma tarea/copia, pero `retry` puede saltarse esa exclusión. Con un intento previo `not_sent` y otro PATCH retenido, `retry` inicia un segundo envío y ambos pueden confirmarse. Está devolviendo 136 a `working`; lee el dictamen y comprueba el estado real antes de actuar. Esta reproducción es del otro Codex, no una prueba mía.
- `CLAUDE-TASK-OUTCOMES-U1-148` está `ready`, sin reserva, y depende de que 136 pase a `done`. Su propósito es adaptar la ficha para usar el gestor opcionalmente. No escribas sus rutas antes del `claim` exitoso.
- `CODEX-TASK-CAS-128` está `done` como servicio aislado bajo un único escritor cooperativo. No se ha montado ni aporta idempotencia por intención o CAS entre procesos. La API antigua sigue sin revisión condicional.
- El kit de relevo 116 y su QA usan otras reservas: no toques sus rutas, pruebas o procesos.

## Reglas de coordinación y seguridad del trabajo

1. Lee `AGENTS.md`, `CLAUDE.md`, `COORDINACION.md`, `CONTEXTO-PROYECTO.md`, `coordination/plans/TASK-UNCERTAINTY-136-HANDOFF.md`, el handoff de 123, el informe de montaje 140 y el dictamen más reciente de 147. Consulta el tablero y los hashes; no confíes ciegamente en el mapa anterior.
2. Si 147 devuelve 136, corrige primero sus hallazgos bajo la reserva existente y vuelve a presentar. En particular, asegura que `retry` y `submit` compartan la misma exclusión por tarea y contexto, incluyendo una operación ya en vuelo: ningún camino debe crear un segundo PATCH sin resolver. Usa barreras para reproducir `not_sent(A) → submit(B) retenido → retry(A)` y verifica cero envíos adicionales, conservación de ambos intentos y comportamiento con tareas/contextos diferentes. Demuestra que el caso falla por su causa en el código anterior. Revisa otros caminos de reintento y carreras, sin inventar idempotencia entre pestañas. No autoaceptes 136 ni U1. Si 136 sigue en revisión, no invadas U1: trabaja solo en un informe o prueba realmente independiente con una unidad nueva, reserva exacta y sin archivos solapados. No conviertas la espera en reenvíos repetidos de mensajes o tareas vacías.
3. Cuando 136 esté `done`, reclama `CLAUDE-TASK-OUTCOMES-U1-148`, comprueba cada ruta mediante `check-path` y desarrolla solo las seis rutas reservadas. Si se necesita otra, registra una unidad o ampliación nueva antes de editar.
4. U2, adopción de 128, persistencia y pruebas globales requieren unidades distintas con rutas exactas, dependencias y revisión. Ninguna reserva se libera porque una entrega tarde. No edites App, servidor, archivos de Codex o de otro Claude mientras estén reservados.
5. Trabaja en este equipo y en el checkout existente, con datos y cuentas ficticios, carpetas y procesos propios, red externa bloqueada. No uses el ordenador corporativo ni sus perfiles, credenciales, servicios, bases o agentes. No mates procesos ajenos, no reinicies demos, no instales dependencias, no crees worktrees, no publiques ni hagas commit/push. No abras proveedores reales con credenciales por este encargo.

## Fase 1 · U1: la ficha delega el seguimiento

Integra el contrato aceptado de 136 en `LocalTaskFocus` solo bajo la reserva U1. Conserva el uso actual cuando no se pase el gestor; las 26 pruebas DOM y 32 Node de 123, y las seis DOM del montaje 140, son regresiones relevantes, no garantías automáticas.

- Registrar el intento antes de enviar y ligar los resultados a instalación, captura, ID exacto de tarea y operación; no confundir homónimas.
- Mostrar en curso, confirmado, rechazado, no enviado, incierto y aceptado por la persona solo cuando corresponda. Una lectura con valores iguales no prueba quién escribió. Una respuesta que llega tarde no debe modificar otra ficha o copia.
- Si se cierra la ficha con PATCH en vuelo, el gestor —no la ficha desmontada— debe seguir la operación. No afirmar que cancelar/cerrar deshace el envío. Nunca volver a enviar automáticamente un resultado incierto.
- Separar guardado confirmado y recarga fallida. Reintentar la cola debe ejecutar solo lecturas. Conservar el borrador y las causas de 401/404/409/422 cuando corresponda.
- No duplicar la lógica ya implementada en el gestor. Conserva sus límites y revisa el dictamen 147 antes de adaptar callbacks. No declarar cerrada la experiencia D7 en la app mientras el gestor y su superficie no estén realmente montados.

## Fase 2 · U2: experiencia visible durante la navegación

Después de que U1 esté presentada y revisada/aceptada, coordina una unidad nueva. Reserva exactamente las rutas realmente necesarias; 140 ya cambió `LocalOperations`, por lo que lee su estado y reserva actual antes de diseñar el diff.

El propietario del gestor y la superficie de resultados deben seguir vivos al salir de Hoy hacia Agentes, Preparación u otra vista y volver, sin duplicar instancias o mezclar contextos. Una confirmación llegada fuera de Hoy debe poder actualizar la cola cuando vuelva a haber un callback de lectura; un error debe permanecer visible. Evita un singleton global que pueda mezclar instalaciones, sesiones, pruebas o usuarios; si lo propones, demuestra aislamiento y ciclo de vida.

La persona debe poder encontrar de forma clara los guardados en curso, confirmados e inciertos, comprobar los inciertos con lectura y decidir, sin reenviar silenciosamente. Mantén la distinción entre decisión humana y confirmación del servidor. No marques como cerrada la incertidumbre al comparar solo una etiqueta o una ID que pueda pertenecer a otra copia.

## Fase 3 · Concurrencia realista con 128, bajo reserva separada

Coordina con Codex una unidad de servidor para montar `registerTaskRevision` en el lanzador y base de aplicación protegidos. Demuestra la exclusión de escritor del lanzador real que se use; no basta con probar Fastify aislado. Después, una estrategia de cliente por unidad aparte debe:

- Obtener la revisión al abrir y guardarla con el registro mostrado.
- Enviar `expectedRevision` con los campos cambiados y distinguir `changed:false` de un cambio guardado.
- Distinguir 409 `TASK_REVISION_CHANGED` de 409 por devolución en curso u otros errores.
- Conservar el borrador y comparar lo visto, lo escrito y el estado actual antes de una nueva decisión; nunca reintentar automáticamente.
- Comprobar que un reintento con revisión antigua no duplica tras una escritura exitosa, sin presentarlo como idempotencia por intención.
- Afirmar únicamente la garantía de un proceso/escritor cooperativo; las rutas antiguas y escritores externos siguen fuera hasta que se cambien y se prueben explícitamente.

No cambies el servidor ni el cliente de 128 sin una reserva nueva y sin acordar los cambios de contrato. Mantén las pruebas del flujo legacy mientras exista.

## Fase 4 · Recuperación tras recargar: propuesta demostrable

136 es **solo memoria**: el seguimiento se pierde al recargar o cerrar la ventana. No inventes persistencia. Si las fases anteriores quedan revisadas, prepara una unidad separada para evaluar y, si procede, implementar un recordatorio mínimo de operación incierta que no guarde texto del borrador ni secretos. Determina explícitamente alcance por pestaña, identidad de copia, caducidad, almacenamiento deshabilitado/corrupto y limpieza segura. Si no hay valores originales, el recordatorio no puede afirmar si se aplicaron ni ejecutar una verificación completa. Prueba recarga, cambio de copia y fallo del almacenamiento antes de prometer continuidad.

## Pruebas y evidencia

Usa barreras, servidores propios y datos ficticios. En la App real, además de los arneses, cubre: abrir dos homónimas; cerrar con PATCH aplicado y acuse perdido; navegar y volver; confirmación tardía; 401/404/409/422; recarga fallida y recuperación sin segundo PATCH; dos pestañas sobre el mismo campo; cambio de instalación/captura; el botón de apertura que desaparece; protección del borrador; teclado y tamaños 1440/390/320 px. Comprueba proceso y limpieza propios, y no uses las demos existentes.

Haz contrapruebas causales: la prueba de D7 debe fallar frente al montaje anterior por la falta de seguimiento y pasar con el montaje completo; la de concurrencia debe distinguir la API antigua de 128. No ajustes selectores o aserciones para ocultar un fallo; conserva los cortes iniciales y atribuye sus causas. Indica qué se probó con Chromium y qué no se comprobó en otros navegadores, lector de pantalla u otros equipos.

## Entrega y continuidad

Para cada unidad: informa qué cambia para el usuario, estado del tablero, rutas y hashes, pruebas propias y repetidas, fallos o riesgos abiertos y siguiente paso concreto. Presenta con `submit`, sin autoaceptarte. Si Codex devuelve una entrega, atiende primero ese dictamen bajo su reserva. Continúa con la siguiente unidad solo cuando su dependencia y sus rutas lo permitan; si no existe canal directo operativo, deja el handoff en el tablero y no afirmes que el otro agente lo ha leído.
