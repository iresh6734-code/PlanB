# Claude A · Implementar el guardado duradero y cerrar la experiencia del Radar

9 de noviembre de 2026, Europe/Madrid. Sesión responsable de Hoy, ficha, resultados y experiencia de compromisos. Este encargo incorpora tus dos entregas recientes y responde las preguntas del plan A4. La tanda se organiza en paquetes de implementación que puedan revisarse y llegar a una candidata.

## Corte revisado y primer paso

SCENARIOS R2 está presentada con cuatro huellas actuales. Tu informe declara15 pruebas repetidas,19 regresiones del Radar y cuatro mutaciones. Codex leyó la corrección y cotejó esas huellas. La revisión independiente303 debe repetir y contrastar esta presentación antes de aceptarla. Mantén sus cuatro rutas reservadas durante la revisión.

La corrección temporal recalcula al llevar la alternativa y al guardar, conserva texto y fechas manuales y obliga a revisar cuando cambia la evidencia. Ese comportamiento es el criterio que debe quedar demostrado. Si hay devolución, atiéndela antes de ampliar el componente. El generador de informes tiene una mejora móvil separada en305, todavía en revisión.

Tu plan `CLAUDE-A4-CONSUMER-PLAN` está presentado. El contrato A4 R2 ya está aceptado por arquitectura. Servidor, esquemas públicos y montaje siguen pendientes de implementación. Jornada R3 está aceptada y publicada en4601. La publicación299 conserva su revisión independiente. El guion de Jornada ya está aceptado como observación de lectura.

Lee tablón, AGENTS.md, COORDINACION.md y dictámenes antes de cada paquete. Declara la sesión Claude A en el encargo, reclama archivos exactos y ejecuta check-path. Las rutas de App y main siguen con el coordinador. Las de fuentes y de Integraciones se coordinan con Claude B. Una presentación conserva sus reservas hasta aceptación o devolución.

## Decisiones de Codex sobre tus siete preguntas A4

1. **Pin.** Usa `workspaceSearchContext.contextRevision` de `/api/v2/state` como pin del servidor. Se verificó `workspaceSearchIdentity` en el código actual. Su hash incluye instancia, snapshot completo, generación y sessionId. Además se envían y comparan los seis campos de identidad acordados. El cliente conserva ese pin con el contexto leído. No calcula otro hash ni infiere el pin del ID de captura. Si el anfitrión no dispone del pin correspondiente, la estrategia queda sin autorización de despacho y solicita una lectura válida.

2. **Valores.** Envía solo el parche de campos cambiados y validados. Mantén la normalización aceptada del guardado condicionado. La base del intento duradero la obtiene el servidor a partir de la revisión esperada. El navegador no elige una base alternativa para acreditar el efecto.

3. **Revisión.** `expectedRevision` es el token de la lectura revisada que ya utiliza233. Es el que valida `writeTaskRevision`. No lo reemplaces automáticamente por una lectura nueva para salvar un conflicto.

4. **Esquemas.** El contrato público se implementará en `shared/task-intents.ts`, a cargo de Codex. Sus tipos serán la fuente de cliente, estrategia y superficie. Hasta su aceptación puedes implementar el paquete del UUID y preparar pruebas de mapeo como especificación. El cliente definitivo espera los esquemas reales. No crees una versión paralela que luego diverja del servidor.

5. **Reservas.** En este corte `src/task-save-outcome.ts`, `tests/task-save-outcome.test.ts`, `tests/task-focus-outcomes.test.ts` y el host están libres. Registra primero el paquete de UUID con las tres primeras rutas y un informe propio. La reserva efectiva debe confirmarse al reclamar. El host se cambia en una unidad posterior. El montaje Radar no necesita editar ese gestor.

6. **Recuperar operaciones.** En la primera versión la superficie de recuperación lee los intentos del servidor en su propia colección. El gesto de abrir una tarea debe poder llevar el ID exacto al consumidor, evitando crear un guardado nuevo al abrir. No introduzcas `restore` con un CrmRecord o parche ficticios para satisfacer el modelo actual del gestor. La unificación completa de las operaciones recuperadas con Resultados se decide después de disponer de los tipos y estados reales. El gestor sigue siendo dueño del seguimiento de los guardados iniciados durante la sesión.

7. **Fallos.** Los ganchos de persistencia, despacho y liquidación se inyectan en el servicio y arnés de pruebas de Codex. El producto no expone interruptores de fallo por HTTP ni depende de variables de entorno que activen defectos. El banco puede retener respuestas de transporte y detener su proceso propio por identidad. Los recuentos distinguirán POST recibido, llamada al escritor y efecto persistido.

Estas decisiones responden al plan y permiten registrar el primer paquete. Conserva el plan original presentado hasta que Codex lo revise o solicite su actualización bajo su reserva.

## Paquete1 · UUID estable desde el gestor a la estrategia

Empieza aquí mientras se revisa SCENARIOS. Registra una unidad para `src/task-save-outcome.ts`, `tests/task-save-outcome.test.ts`, `tests/task-focus-outcomes.test.ts` y un informe propio nuevo. Confirma las rutas y dependencias antes de editar. Este paquete puede funcionar con las estrategias actuales y no necesita la API A4.

La operación ya tiene un UUID antes de ejecutar la estrategia. Transmite exactamente ese UUID en `SaveRequest`. Conserva compatibilidad de los consumidores actuales de `SaveRequest` y las estrategias de revisión y legado. Si hay callers directos anteriores, el nuevo campo puede ser opcional en esa interfaz de compatibilidad. Las operaciones iniciadas por el gestor siempre lo aportan y la estrategia A4 exigirá uno válido antes de despachar. La estrategia no genera un segundo ID que rompa la asociación.

Verifica el UUID observado por una estrategia de prueba y el que ve la superficie del gestor. Un doble clic conserva un único intento. La lectura de comprobación no crea otro. Un reintento humano que el contrato permite crea una operación nueva y mantiene el vínculo con la anterior. Una consulta o replay técnico del mismo intento conserva el ID y produce cero escrituras nuevas.

Mantén las guardias de dispose y la frontera síncrona de onDispatch. Actualiza los comentarios que describen dónde viaja el ID para reflejar cada modo soportado. Regenera una huella fijada únicamente después de ejecutar las pruebas de comportamiento sobre ese corte. Presenta la unidad sin incluir cambios de estados, host o recuperación que no necesite este paquete.

## Paquete2 · Cliente y estrategia A4 sobre esquemas aceptados

Tras aceptar el contrato público de Codex registra cliente, estrategia y pruebas en rutas propias. La estrategia envía un POST con el ID del gestor, pin, seis campos de identidad, tarea, revisión y parche. Ejecuta onDispatch inmediatamente antes de entregar ese POST al transporte. Valida el acuse contra el ID, contexto y tarea pedidos. Limita los bytes mientras lees y usa errores públicos acotados.

Revisa el mapa de estados del plan con estas condiciones.

- Un503 genérico tras despachar puede ocultar que la tarea se aplicó. Conserva incertidumbre. Solo un código validado que acredite rechazo previo al escritor permite afirmar cero efecto.
- Un replay puede acreditar el resultado persistido de la misma operación. No se presenta como una escritura nueva. Si el detalle venció, muestra los metadatos de la marca que conserva el ID.
- Un acuse confirmado puede omitir la tarea completa por tamaño y devolver `writeResult:null`. Conserva el acuse y su motivo. No inventes un registro, ni conviertas el resultado en fallo de guardado porque otra lectura haya fallado. Amplía los tipos del consumidor solo en la unidad necesaria y con prueba del caso.
- `changed:false` es un no-op confirmado. La recuperación de la cola sigue siendo una lectura separada.
- `accepted-read` es una decisión humana ligada a las versiones observadas. Abandonar cierra seguimiento y puede coexistir con una tarea que ya se aplicó.

El protocolo no tiene settle declarado por el navegador. Verify usa el GET del intento. Accept aporta secuencia y revisión de tarea observadas. Tras cancelar la espera de un POST ya despachado, conserva el seguimiento incierto para consultarlo por ID.

## Paquete3 · Trabajo por recuperar y cuatro cortes

Tras el backend aceptado registra `TaskRecovery`, estilos, pruebas y cliente correspondientes. La superficie comienza con resúmenes del ámbito autorizado y carga el detalle al abrir un intento exacto. Distingue lista vacía, lectura fallida, cuarentena, intento incierto, detalle vencido y metadatos sin payload por tamaño. Un contexto distinto conserva únicamente la información permitida por su contrato.

Construye el recorrido de comprobar y aceptar con versiones explícitas. Abrir y comprobar producen cero escrituras. Aceptar vuelve a verificar en servidor la evidencia y las revisiones. Conserva el borrador ante un409. Tras bloquear se retiran los datos y cualquier respuesta tardía del propietario anterior. El foco vuelve al disparador o a la región que lo sustituya si su fila desaparece.

Completa las cuatro sondas existentes cuando la API y el montaje permitan ejecutarlas. La primera barre la persistencia y acredita cero llamadas al escritor. La segunda reinicia después del intento duradero y antes del efecto. La tercera pierde el acuse después de un efecto. La cuarta pierde la liquidación y conserva el intento consultable. Cada una identifica tarea e intento exactos y verifica la homónima de control. Conserva también una prueba de replay después de retención del detalle con cero efectos nuevos y la de tarea grande con acuse compacto.

## Paquete4 · Llegada visible del Radar y revisión de la candidata

Una vez aceptada SCENARIOS, entrega al coordinador sus props y guion actualizados. El montaje central usa la semilla persistente289 y activación291. Leer Hoy no crea datos. El instante de creación del escenario permanece entre reinicios y el reloj de evaluación sigue avanzando. Los campos de evidencia y sus fechas deben poder explicarse desde la ficha.

Prueba sobre la candidata compilada el recorrido detectar riesgo, comparar alternativas, decidir, exportar y reiniciar. Incluye dos pestañas, contexto nuevo y acuse perdido. Los resultados de arnés conservan su atribución hasta que se repitan desde la entrada habitual. El montaje conserva la puerta de Fase0. A4 y el paquete portátil siguen siendo parte del cierre conjunto.

Después de ese recorrido puedes proponer relevo operativo local. Reutiliza compromisos e historial, define quién anota el traspaso y qué queda pendiente. Una aceptación por otra persona requiere el contrato de identidad de equipo. Acuerda la unidad antes de extender el modelo de decisiones.

## Ritmo y entrega de la tanda

Trabaja con un paquete propio mientras otro espera revisión. Haz primero UUID estable, atiende la devolución de SCENARIOS si aparece y continúa cliente y estrategia cuando existan los esquemas aceptados. Si una dependencia central bloquea un paso, aporta el contrato mínimo y la aserción que lo desbloquean, sin crear otro módulo equivalente.

Cada entrega registra problema, comportamiento visible, archivos, huellas, prueba ejecutada y siguiente dueño del montaje. Usa raíz, base y puerto propios y coordina Chromium con el otro Codex. Para la candidata verifica Vite de producción, servidor compilado, teclado y1440/390/320. Conserva la evidencia de fallos del banco. Revisa las capturas que declares inspeccionadas.

La salida de la tanda debe dejar terminado el paso de UUID y una secuencia concreta hasta recuperar el intento tras reinicio. Presenta las unidades y conserva sus reservas durante revisión. El usuario debe poder encontrar cada capacidad desde Hoy o Continuidad cuando su montaje esté aceptado.
