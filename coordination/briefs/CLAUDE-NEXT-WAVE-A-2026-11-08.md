# Claude A · De las piezas aceptadas al recorrido operativo completo

Encargo sucesor actualizado el 8/11/2026, Europe/Madrid. Sustituye la versión anterior de este mismo prompt. Sesión responsable: Claude A, Hoy y experiencia operativa. Queremos una sesión larga de implementación útil, con varios paquetes revisables y funciones utilizables desde la navegación habitual. La duración o el número de pruebas no sustituyen resultados. Encadena lo que tenga dependencias aceptadas y archivos libres; no te autoaceptes para continuar.

## 1. Lee este corte antes de empezar

- `CLAUDE-HOY-COLA-JORNADA-A3` R2 está en review. Tu presentación declara 22/22 repetidas y barrera de contexto; son resultados tuyos, pendientes de dictamen independiente. El otro Codex, chat «Responder saludo», lleva su revisión 290. No edites sus cuatro rutas durante review.
- `CLAUDE-COMMITMENT-RADAR-UI` R2 está en review. Declara 19/19 repetidas, cuatro regresiones y revocación de mutaciones. El Codex coordinador revisará F1/F2 sobre esos hashes; no está aceptada ni montada.
- CORE, escenario multisistema, simulador e informe están aceptados. También están aceptadas la semilla persistente 289 y la activación explícita 291. Son backend y motores, todavía sin entrada del Radar en la App.
- La demo vigente es 288 en `http://127.0.0.1:4601/`. Tiene ficha condicionada, Por decidir, Continuidad y resumen de trabajo. A4 sigue sin montar: «Sin cobertura» con recuentos nulos es el estado correcto.
- El arnés 293 ya está aceptado: cierre por ChildProcess y recibo original. No suprimas controles de procesos por sospechar reutilización de PID.
- Tu propuesta `CLAUDE-A4-CONTRATO-HTTP-PROPUESTA` está en review; sigue siendo propuesta. El contrato HTTP/escritor central A4 pertenece a este chat Codex y aún no es un acuerdo implementable.

**Aviso posterior del revisor290:** comunica que las 22 pruebas de R2 y cuatro sondas anteriores pasan, pero una quinta falla cuando cambia solo generatedAt y permanecen snapshotId/capturedAt. Tras Hoy actualizado y una cola200 antigua retenida, el plan vuelve utilizable. No ha demostrado un PATCH erróneo. Está preparando dictamen y posible devolución R3; es evidencia comunicada por el otro Codex, no una repetición de esta sesión ni una devolución formal ya realizada. Lee el dictamen final antes de corregir; no edites A3 mientras siga en review. La coincidencia de una identidad parcial no autoriza el plan del contexto completo.

Relee el tablón y los dictámenes: este corte puede haber cambiado. Usa IDs completos; hay números repetidos entre flujos. Lee AGENTS.md, COORDINACION.md y el contexto vigente. Antes de cada paquete registra responsable de sesión, rutas exactas, dependencias y aceptación; ejecuta claim y check-path. Review y blocked conservan reservas.

## 2. Resultado de producto que debes perseguir

Una persona entra en Hoy, reconoce una instalación comprometida con un pedido retenido y un ticket relacionado, entiende las fuentes, compara respuestas, asigna una acción y encuentra la decisión tras reiniciar. Si hay trabajo de una tarea cuyo resultado se desconoce, puede identificarlo y comprobarlo sin reenviarlo. Todo paso tiene entrada visible y un resultado verificable.

Prioridad: cerrar los recorridos ya construidos antes de abrir otra familia de pantallas. Preparación conserva un paso principal y opciones secundarias plegadas. Evita duplicar Hoy, crear otro dashboard o desplegar todos los detalles de golpe.

## 3. Paquete inmediato · Cierra las devoluciones y preserva sus causas

Si 290 o el dictamen del Radar devuelve una unidad, atiéndela bajo su reserva antes de ampliarla. Si está en review, no la edites. Reproduce la sonda del revisor sin cambiar sus aserciones; puedes proponer corregir una sonda si demuestras que su contrato era erróneo.

En Jornada: una cola vieja, pendiente o fallida no puede autorizar el plan de otra copia. Retira selecciones y acciones al perder el ámbito; conserva estimaciones solo cuando corresponda al mismo contexto. «Sin confirmar» no debe parecer una planificación vigente. Si la identidad disponible en la API es parcial, decláralo y pide al dueño la ampliación; no la presentes como identidad completa.

En Radar: una respuesta de A mientras se edita B no borra ni acredita B. Tras bloqueo, desmontaje o cambio de copia, una mutación tardía no inicia nuevas lecturas ni repinta datos. Revisa éxito, rechazo, error y finally: limpiar un indicador global también puede afectar a otra operación. La prueba de un evento lock con cookie válida no demuestra un bypass de autenticación real; conserva esa distinción.

Presenta con huellas finales, control causal y límites. No conviertas un resultado anterior a la corrección en resultado del corte final.

## 4. Paquete grande · Simulador y película utilizables en la ficha

Después de UI done, reclama la unidad existente `CLAUDE-COMMITMENT-RADAR-SCENARIOS`; no registres un duplicado con otro nombre. Reutiliza `shared/commitment-simulation.ts` y `shared/commitment-report.ts`, sin reimplementar sus reglas.

Si esperas revisión y quieres adelantar trabajo, acuerda primero una unidad independiente para el panel puro del simulador, con componente, CSS y pruebas propios. Puede consumir los motores aceptados sin editar CommitmentRadar. Sus nombres de archivo son una propuesta hasta registro y claim. Después su montaje pertenece a SCENARIOS; no mantengas dos simuladores.

Construye un recorrido claro:

1. Abrir un compromiso y ver fecha prometida, causa principal, responsable y evidencia de venta/entrega/soporte.
2. Comparar «retrasar dos días desde la fecha comprometida» y «buscar stock alternativo». Explicar qué cambia, los supuestos y lo que falta conocer. No inventar costes, probabilidades, disponibilidad o ahorro.
3. Preparar una acción local desde una alternativa. Mostrar responsable, fecha y texto exacto antes de confirmarla. El motor no autoriza por sí solo la acción.
4. Confirmar contra la revisión abierta y con clave de operación. Un conflicto conserva el borrador y exige revisar; no renueva el token para reenviar en silencio.
5. Consultar la cronología y descargar HTML/JSON coherentes con ese compromiso y esa revisión.

Simular, cambiar alternativas, leer y exportar producen cero escrituras. Confirmar una acción produce un evento; repetir la misma operación no lo duplica. Un cierre manual no es cumplimiento observado. El texto de una persona no es una identidad autenticada. La cronología conserva evidencia anterior aunque después se actualice la fuente.

El relevo operativo humano es diferente del ensayo técnico del Kit. Puedes preparar un resumen de compromisos, decisiones y pendientes; no añadir «Aceptado por otro usuario» sin identidad y contrato que lo acrediten. Si hace falta nuevo tipo de decisión o de evento, envía el cambio mínimo al dueño del contrato antes de implementarlo.

## 5. Paquete de montaje · Demostrar la llegada real a Hoy

`CODEX-COMMITMENT-RADAR-MOUNT` es del coordinador. No tomes App.tsx ni server/main.ts, ni añadas un montaje alternativo en LocalOperations para esquivar esa reserva. Su puerta de Fase 0 sigue incluyendo A4 y candidata portátil; 291 aceptada no elimina esa puerta.

Entrega al coordinador props y punto de inserción exactos, acción de habilitación explícita y estados sin copia/sin activar/error. La semilla 289 mantiene el mismo instante entre reinicios; el reloj de evaluación avanza sin recrear datos ni esconder decisiones. Abrir Hoy o listar compromisos no puede crear una semilla con un GET.

Después del montaje aceptado, verifica desde la App compilada: instalación bloqueada, caso sano con evidencia, fuente no disponible, lectura parcial, homónimas y mismo ID en cuentas distintas. Usa el escenario multisistema aceptado y su oráculo. Comprueba dos pestañas con revisión antigua, conservación de decisión e historial tras reinicio y cero tráfico externo. La demo debe decir que son datos ficticios.

Mientras ese montaje espere la puerta, el panel probado en arnés se entrega como componente preparado, nunca como función disponible en 4601. Toda deuda tiene un encargo y dueño visibles; no basta «Codex lo montará» sin tarea.

## 6. Paquete A4 · Trabajo recuperable después de cerrar o reiniciar

Solo empieza el consumidor cuando Codex haya acordado y presentado el contrato necesario. Puedes seguir afinando la propuesta en su reserva únicamente si se devuelve; no inventes endpoints para empezar antes. Los siguientes requisitos son criterios de diseño, no una autorización para cambiar el servidor:

- Persistir el intento antes de despachar. Si falla persistir, no sale la escritura.
- Un alta de intención cuyo 201 se pierde puede haber quedado guardada. No mostrar «no enviado» como certeza sobre todo el recorrido sin comprobar qué ocurrió.
- El navegador no fabrica un acuse de servidor enviando httpStatus, revisionAfter o un ID a settle. El servidor necesita una atribución verificable.
- El reinicio clasifica y permite leer; nunca reenvía automáticamente. Que la tarea tenga valores iguales no demuestra que fueran de ese intento.
- Aceptar el estado leído es una decisión humana sobre evidencia válida y la misma versión del intento. Conservar la distinción de autoría.
- Abrir el intento exacto usa la identidad completa acordada y su ID, sin usar título ni adoptar el de otra captura.

Tras ese acuerdo registra cliente y superficie de recuperación con rutas propias; el dueño central monta servidor y los cambios de host en el orden acordado. Evita dos gestores o dos superficies para un mismo intento. Después, la integración de ficha/host se hace en una unidad aparte con reserva de esos archivos.

Prueba los cuatro cortes: persistencia rechazada; reinicio antes de envío; escritura aplicada con acuse perdido; acuse recibido con liquidación fallida. Cuenta efectos e historial persistidos. Abrir y comprobar tras reiniciar añade cero PATCH. Borrador, incierto, rechazado y confirmado no son estados intercambiables.

No pongas covers=true porque exista el componente, la ruta o una lista vacía. La cobertura debe describir productores instrumentados y periodo real; no debe incluir borradores o caminos antiguos que no se registran. Hasta entonces el resumen conserva recuentos desconocidos.

## 7. Mejoras operativas después de los montajes

Con A3 aceptada, registra el sucesor que haga coherentes Jornada, ficha y cola: una tarea completada o incierta no sigue pareciendo pendiente normal; los cambios del mismo contexto conservan solo selecciones válidas y explican exclusiones. Si se decide persistir el plan, exige revisión y contexto completo antes de elegir almacenamiento; no uses IDs sueltas en localStorage.

Verifica las entradas de Hoy, Agentes y Preparación. Una actividad no acreditada no se dibuja como agente ejecutándose. Un botón sin efecto se retira o explica su condición. Coordina cualquier cambio de Integraciones o Continuidad con Claude B: esas superficies no pertenecen a esta sesión.

## 8. Verificación y ritmo de entrega

Trabaja por paquetes coherentes durante una sesión extensa. Tras presentar uno, toma otro independiente con archivos libres y dependencias done. Si todos dependen de revisión, comunica el bloqueo preciso y deja preparadas las decisiones; no multipliques documentos o pruebas repetidas para aparentar avance.

Usa una proyección congelada, raíz temporal nueva y procesos propios. Compila la interfaz con React de producción: NODE_ENV=test de una fixture no debe contaminar Vite. Conserva los fallos del banco y su causa. No cambies huellas ajenas ni suavices pruebas de producto para aceptar un cambio.

Coordina Chromium antes de ejecutarlo: el otro Codex lleva A3 R2 y este chat coordina Radar R2. Haz pruebas de contrato/Node mientras su banco esté ocupado. Verifica teclado, foco, estados de error y 1440/390/320; inspecciona las capturas que declares revisadas. No cierres procesos por patrón ni limpies carpetas ajenas.

En cada entrega adjunta: problema resuelto; recorrido visible; fuentes/binario/activos del corte; pruebas realmente ejecutadas; límites; fila capacidad → entrada → API → efecto → evidencia → siguiente dueño. Código de arnés y CLI se inventaría como herramienta interna. No hay llamadas a proveedores ni nuevas cuentas autorizadas por este prompt.

Entrega final de la tanda: un guion desde Hoy de detectar → comparar → decidir → recuperar → comprobar, marcando los pasos que aún estén bloqueados y su tarea exacta. No declares ese guion demostrado si solo se ejecutó en un arnés.
