> **Resuelto por QA136 R2, 4/11/2026, 22:55:31, Europe/Madrid.** Codex repitió25/25 y tipos; la regresión detecta la omisión de owner en copia privada. Este encargo se conserva como historia y no ordena reabrir la unidad aceptada. Véase el dictamen180 actualizado. Un montaje nuevo necesita su propia reserva.

# Encargo para la autora · reconciliar QA136 con116R4

4/11/2026, Europe/Madrid. Este archivo prepara una corrección bajo la reserva existente;no inicia ni controla una sesiónClaude. Consultar el tablón y el dictamen180 antes de editar. No confundir CLAUDE-RESCUE-KIT-QA-136 con el gestor de tareas136.

## Resultado necesario

Convertir la caracterización histórica del caso8 en una regresión vigente del protocolo aceptado116R4 y actualizar su atribución,conservando evidencia histórica. La aprobación116 no acepta automáticamente esta QA. No basta con borrar,omitir o cambiar una expectativa para conseguir una cifra verde.

Lee AGENTS.md,CLAUDE.md,COORDINACION.md,CONTEXTO-PROYECTO.md,coordination/reviews/CLAUDE-RESCUE-KIT-QA-136-independent.md y coordination/reviews/CLAUDE-RESCUE-KIT-116-r4-independent.md. Comprueba status/reserva/hashes mediante tools/coordination/board.mjs. SiQA136 está working tras la devolución,continúa con sus diez rutas reservadas;no reclames una tarea diferente para robar una reserva. Si otro autor posee la sesión,respetar su propiedad y solicitar el traspaso explícito.

No edites116,las pruebas independientes deCodex,170/U2,el cliente166,el contexto o fuentes de otros agentes. La reserva QA136 contiene exactamente:

- tests/helpers/rescue-capsule-followup-harness.ts
- tests/helpers/rescue-capsule-followup-child.ts
- tests/helpers/rescue-capsule-followup-parallel.mjs
- tests/rescue-capsule-followup-claims.test.ts
- tests/rescue-capsule-followup-capture.test.ts
- tests/rescue-capsule-followup-isolation.test.ts
- tests/e2e/rescue-capsule-followup.spec.ts
- coordination/reports/CLAUDE-RESCUE-KIT-QA-136.md
- coordination/reports/CLAUDE-RESCUE-KIT-QA-136-CHECKPOINT.md
- coordination/plans/RESCUE-KIT-QA-136-HANDOFF.md

No es obligatorio modificar las diez ni crear un E2Evacío. Una ruta adicional necesita otro encargo antes de editar.

## Regresión del caso8

El fallo histórico era real dentro de dos instancias del módulo con el mismoPID. R3/R4 añaden un owner distinto por instancia:un PID vivo no basta para considerar propio un reclamo. No lo presentes como defecto actual después de corregido ni extrapoles la reproducción a todo servidor ordinario o a otro equipo.

Mantén una primera importación real retenida en components-written. Antes de pedir la segunda,guarda los bytes de su reclamo,ID/PID/owner y estado de su staging. Ambas instancias compartenPID,pero la segunda no es el owner de la primera.

- La segunda debe rechazar ALREADY_IMPORTED,sin tocar reclamo/staging ni publicar otro destino. Comprueba las identidades y los bytes,no solo un booleano de error.
- Al liberar la primera,debe terminar correctamente con su destino original,un marcador propio y reclamoimported concordante. Comprueba que haya un único destino entre los identificados por las operaciones de esa cápsula,no enumerando carpetas ajenas.
- La liberación/terminación delworker debe ocurrir enfinally incluso si una aserción falla;esperas acotadas para no dejar barreras colgadas.
- No uses fakePid en este caso:precisamente ensaya mismoPID/owner distinto. La carrera que simula procesos distintos sigue siendo otro caso separado.

Prueba causal:la nueva regresión debe pasar conR4 y fallar al retirar solo la comprobación deowner en una copia privada o frente a un baseline histórico exacto acreditado. El caso antiguo caracterizaba la existencia del defecto:conserva su fuente/log como evidencia anterior;no lo mantengas verde por esperar el defecto actual. Explica si usas una mutación deR4 o un verdadero baselineR2,no los confundas.

## Referencias e informes

Actualiza las afirmaciones que todavía dicen que faltaowner o que116soloestáenR2. Distingue los cuatro estados relevantes:owner activo de la misma instancia,owner distinto conPIDvivo,PIDausente con destino verificado no publicado y destino publicado/ambiguo. R4 mantiene el reclamo siempre presente al sustituirlo;el error de recuperación es de dominio. No prometer protección frente a escritores no cooperantes,otros equipos o exclusión porPIDcomoautenticación.

Conserva separados los resultados históricosR2/R3,declaraciones de la autora y revisiones independientes138/150/153/175. No afirmes que una prueba independiente de otro autor sigue «observacional roja» sin comprobar su versión actual y reserva. No edites esas pruebas para conciliar el informe.

Mantén límites:claves y datos ficticios,otro equipo no ensayado,sinHubSpotreal,sinDPAPIrecuperado,disco lleno/corte de energía y enlaces reales no acreditados. Un hash no prueba autoría;la cápsula cifrada no constituye por sí sola una firma de origen.

## Verificación y entrega

Repite las25pruebas deQA sobre el corte exacto116R4 y el nuevo caso8,con tipos focales. Conserva los fallos previos y sus causas. Si repites la orquestación paralela,usa dos raíces nuevas,señuelos cruzados y verifica que no se mezclan;declara rondas y duración,sin presentar el estrés probabilístico como prueba causal.

Solo repiteDOM si modificas superficie o su banco;la aceptación del kit ya tiene7DOM repetidas y un caso independiente de actualización tras409. Esta unidad no montaRescueCapsuleenApp ni autoriza cambiar suUI.

Usa este checkout,carpetas/procesos nuevos propios y red externa bloqueada. No leer servicios4331/4334,equipo corporativo,cuentas o credenciales. No instalar dependencias,hacer worktrees,commit,push o despliegue. No borrar restos ajenos o evidencias históricas para que el arnés pase.

Antes de submit,coteja hashes del corte producto ensayado y de tus archivos. Informa pruebas propias y repetidas,control causal,fallos iniciales,procesos cerrados y límites. Presenta QA136,no te autoaceptes y deja sus reservas durante revisión. No ampliar automáticamente a una integración de producto tras el submit.
