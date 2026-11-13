# Mega prompt para Claude · Plan B Modo Rescate

Trabaja en `D:/AI/Plan-B-CRM-v2.1/source`. Tu encargo es **CLAUDE-RESCUE-106**. El usuario quiere una mejora ambiciosa y útil y dedicarle la cuota incluida que quede. Construye producto funcional, pruébalo y pule el recorrido hasta donde permita esa cuota. El resultado debe poder enseñarse y revisarse.

## 1. La misión

Construye **Modo Rescate: la sala que lleva a una pyme desde «HubSpot ha caído» hasta «hemos conservado el trabajo y revisado cómo devolverlo»**.

La persona debe poder responder, en una misma superficie:

1. ¿Con qué captura estoy trabajando y qué no puedo demostrar sobre ella?
2. ¿Qué tareas merecen atención primero y por qué?
3. Si tengo30,60 o120 minutos, ¿qué plan de trabajo es viable con mis estimaciones?
4. ¿Qué puedo cambiar localmente y cómo sé que se conservará?
5. ¿Qué ocurrió mientras trabajaba desconectado?
6. Cuando vuelva el CRM, ¿qué valores chocan y qué decisión estoy revisando?
7. Si la respuesta se pierde después de aplicar algo, ¿cómo compruebo el resultado sin duplicarlo?
8. ¿Qué hechos y límites quedan en el informe del ensayo?

El momento decisivo de la demo será: **caída ficticia de8 horas → plan de60 minutos → trabajo local → cierre y reapertura → CRM simulado con un cambio incompatible → resolución campo a campo → timeout tras un efecto → conciliación sin duplicado → informe**.

No te quedes en una maqueta, una colección de tarjetas o un informe técnico. Necesitamos una porción funcional completa, con persistencia y fallos reproducibles. La demo es una base revisable para integrar después; no la presentes como instalación de producción.

## 2. Lee primero y sitúate con hechos

Lee `AGENTS.md`, `CLAUDE.md`, `COORDINACION.md`, `CONTEXTO-PROYECTO.md`, `PRODUCT.md`, `DESIGN.md`, `coordination/plans/MODO-RESCATE-106.md` y este prompt. Aplica la skill base `compliance-autopilot-execution-core` y las skills de interfaz/pruebas realmente disponibles y pertinentes. No instales herramientas para empezar.

Consulta:

```powershell
node tools/coordination/board.mjs list
node tools/coordination/board.mjs brief CLAUDE-RESCUE-106
```

El estado de preparación del1/11/2026 es una fotografía, no una orden para cambiar otras unidades:

- Codex está construyendo CODEX-EVIDENCE-VIEW-104. Sus nueve archivos son ajenos a este encargo. No los cambies ni lo interrumpas.
- CODEX-EVIDENCE-101 y103 están en review. No afirmes que están aceptadas, instaladas o conectadas a producción.
- CLAUDE-QA-079/081/091 aparecen en review. Lee sus informes para aprender de los casos, sin repetir sus afirmaciones como una revisión tuya. QA091 comunica cuatro TODO; no declares la regresión global verde.
- LAB036 tiene archivos e informe, pero seguía ready sin reserva/submit; Codex reprodujo F1 (un control ajeno descarta el borrador numérico inválido) y F2 (colisiones de identidades de captura). No lo aceptes ni edites bajo106.
- `coordination/reports/CLAUDE-DELEGADO-2026-11-01.md` comunica cambios de App fuera de su reserva. Es una comunicación del autor que Codex debe contrastar; no te apropies de App para «cerrarlo».

Identifica tu sesión. Si eres el autor de otra unidad aún working, deja primero su entrega/checkpoint según su protocolo; no abandones sus cambios ni robes la reserva de otra sesión llamada claude. Si no puedes acreditar ser su autor, no la toques. No fuerces dependencias ni uses el actor codex.

Esta unidad independiente no necesita aceptar035/036 para construir su propio ensayo. Tampoco permite corregirlas, continuar su trabajo bloqueado o integrar fuentes sin revisión.

## 3. Reserva y límites exactos

```powershell
node tools/coordination/board.mjs claim CLAUDE-RESCUE-106 claude
node tools/coordination/board.mjs check-path CLAUDE-RESCUE-106 claude shared/rescue-room.ts
```

Comprueba con `check-path` cada ruta antes de editarla. Si claim falla por dueño, dependencia, estado o colisión, conserva todo y comunica la causa. Nunca edites sin reserva ni cambies directamente board.json. Los archivos exactos están en `coordination/tasks/CLAUDE-RESCUE-106.json` y se enumeran aquí:

```text
shared/rescue-room.ts
shared/rescue-plan.ts
shared/rescue-report.ts
server/rescue-room.ts
server/rescue-room-journal.ts
server/rescue-room-api.ts
scripts/demo-rescue-room.ts
src/RescueRoom.tsx
src/rescue-room-client.ts
src/rescue-room.css
design/rescue-room/index.html
design/rescue-room/main.tsx
design/rescue-room/README.md
tests/rescue-room.test.ts
tests/rescue-plan.test.ts
tests/rescue-room-journal.test.ts
tests/rescue-room-api.test.ts
tests/rescue-room-client.test.ts
tests/rescue-report.test.ts
tests/e2e/rescue-room.spec.ts
tests/helpers/rescue-room-harness.ts
coordination/reports/CLAUDE-RESCUE-106.md
coordination/reports/CLAUDE-RESCUE-106-CHECKPOINT.md
coordination/plans/RESCUE-106-INTEGRACION.md
```

Los artefactos efímeros propios de compilación, logs y fixtures van a una carpeta nueva UUID bajo `tests/.tmp/rescue106-*`, siguiendo el uso de temporales del proyecto. No son permiso para crear fuentes persistentes fuera de la lista ni leer carpetas temporales ajenas que contengan sesiones o datos. Los24 archivos son un máximo de alcance, no una cuota de código: si una separación no hace falta, justifica el archivo no creado.

Sin cambios en App/TeamApp, navegación, APIs existentes, Store, Recovery, paquetes, lockfile, esquemas comunes, estilos globales, contexto general o panel duet. Una necesidad de esas rutas se documenta para una unidad posterior; avanza todo lo independiente que sí esté reservado.

Solo equipo actual, carpetas nuevas y ficción nueva. No leas data, .env, credenciales, DPAPI, perfiles, instalaciones originales,4331/4334, IFR o cuentas corporativas. No uses HubSpot, Gmail, Google, Anthropic API adicional, MCP ni proveedor externo para probar el producto. Se permiten servidores de prueba propios en loopback y Chromium automatizado de Playwright con contexto limpio exclusivamente para la demo; no controlar pestañas, perfiles o procesos del usuario. El arranque debe fallar si el puerto está ocupado, sin matar procesos ajenos.

No nuevos worktrees, dependencias, compras, autostart, despliegues, commits, push o publicación. Una sesión autora, sin delegación adicional. Preparar este prompt no significa que Codex te haya iniciado o que exista un puente activo.

## 4. Arquitectura: ensambla lo que ya existe

Antes de diseñar tipos nuevos, inspecciona el mínimo de código de lectura declarado por la tarea. En particular:

- `shared/response-queue.ts`: `buildResponseQueue`, roles, fechas civiles/instantes, estados desconocidos, referencias explícitas y límites.
- `server/store.ts`: captura activa, cambios locales, validación, transacciones y persistencia.
- `server/recovery.ts`: `Recovery`, `Remote`, preview/decide/approve/apply/resolveUncertain y sus restricciones reales.
- `shared/operations.ts` y `shared/recovery-integrity.ts`: planes, decisiones, resultados parciales e integridad.
- `shared/agents.ts`, `server/agents.ts` y `shared/work-queue.ts`: propuestas/listas existentes para evitar otro motor de prioridades o seguimiento paralelo.

Congela hashes de los imports utilizados antes de verificar y vuelve a cotejarlos al terminar. Si Codex cambia una fuente leída mientras pruebas, informa qué resultado corresponde a qué snapshot; no mezcles versiones. Examinar una fuente en review no equivale a aceptarla.

Organización orientativa dentro de las rutas reservadas:

- `shared/rescue-room.ts`: contratos validados, contexto e invariantes del incidente. Nada de red ni acceso a disco.
- `shared/rescue-plan.ts`: selección determinista por tiempo disponible sobre la cola existente, sin volver a interpretar fechas/estados.
- `shared/rescue-report.ts`: proyección del informe y serialización segura.
- `server/rescue-room.ts`: orquestación de un Store ficticio propio y Recovery existente; adaptador Remote exclusivamente simulado con fallos inyectables.
- `server/rescue-room-journal.ts`: diario persistente e idempotencia del incidente mediante las primitivas ya disponibles de Store. Evita un segundo sistema de cambios de CRM. Si hacen falta varias escrituras atómicas, demuestra la transacción real y no una promesa de atomicidad.
- `server/rescue-room-api.ts`: registrador del ensayo en un servidor propio, con entradas/salidas validadas. No montarlo en los servidores de producto.
- `scripts/demo-rescue-room.ts` y `design/rescue-room/*`: arranque y vista propios, fixtures explícitos y README con los comandos reales que hayas comprobado.
- Cliente/componente: estado ligado al contexto/revisión, cancelación, control de respuestas tardías y conservación del borrador válido o inválido según proceda.

Usa un Store nuevo de ficción y el Remote simulado para que un recorrido cambie registros de verdad dentro del ensayo. No uses mocks de hooks como evidencia de persistencia o navegación. La referencia existente `simulatedRemote` tiene límites, por ejemplo respecto a relaciones: compruébalos antes de reutilizarla. No declares verificación de asociaciones si el adaptador no las observa. Cualquier estado ficticio necesario del remoto debe sobrevivir al reinicio para probar el acuse perdido.

El lanzador crea una raíz propia nueva por defecto. Una opción explícita de reanudación solo admite una carpeta creada por este lanzador, bajo la raíz efímera de esta unidad y con marcador validado; rechaza rutas externas, enlaces y ausencia de marcador. No carga instalaciones arbitrarias ni vuelve a sembrar sobre un ensayo existente. No debe arrancar al importar el módulo. Cierra únicamente recursos propios.

## 5. Experiencia de uso

### A. Incidente y procedencia

Cabecera compacta: empresa ficticia, portal ficticio, captura, revisión, fecha y banner permanente «Ensayo · datos ficticios · no conecta con HubSpot». Muestra el incidente de caída del CRM y su horizonte. No atribuyas disponibilidad, protección de otro equipo o RTO a este ensayo.

El estado debe describir lo observado: sin contexto, en preparación, trabajo local, retorno en revisión, resultado parcial/incierto y cierre del ensayo. Elige nombres y transiciones que se puedan mantener sin permitir saltos imposibles. «Ensayo finalizado» no significa «negocio recuperado».

### B. Un plan para el tiempo que tengo

Lista priorizada y explicable con vencimiento, estado y relaciones explícitas. Selección por tiempo disponible (30/60/120 minutos y edición válida), estimaciones manuales por tarea y restricciones observables. Una estimación ausente es desconocida, nunca0.

Primero una regla sencilla y auditable: mantener el orden de negocio, incluir las tareas que caben según sus estimaciones y explicar las que quedan fuera. No anuncies optimización matemática si usas una heurística. No deduzcas dependencias a partir de una mera relación cliente/oportunidad. Los bloqueos manuales se identifican como declaración del operador.

Comparar30 y60 minutos debe mostrar un cambio causal en el fixture. Diferencia «tareas que caben en el plan» de «tareas realmente completadas». No uses importe de oportunidades como dinero perdido, protegido o salvado. Si el inventario es grande, resumen completo y páginas explícitas; no derives totales del límite visible200.

### C. Trabajar localmente

Desde una tarea se abre el detalle y se puede realizar una modificación local permitida por Store, por ejemplo completar/reabrir una tarea o ajustar su fecha. Previsualiza qué se guarda, conserva el contexto y confirma con el resultado persistido. Respeta validación y campos existentes; no inventes asociaciones o estados admitidos.

Persisten selección, estimaciones y notas operativas separadas de los campos CRM. Un cambio no debe hacerse dos veces por doble click, reintento, pestaña antigua o reinicio. No muestres enviado si solo se guardó localmente. Un fallo de recarga posterior no se convierte en fallo del guardado ni repite la mutación.

Dos pestañas deben usar versión esperada. Una operación obsoleta recibe conflicto y explica cómo actualizar sin descartar silenciosamente el borrador. No combines datos de espacios distintos, aunque coincidan IDs de filas.

### D. Diario y reanudación

Diario de hechos: inicio, elección de plan, edición local, preparación de retorno, decisiones, aprobación, intento y verificación. Cada evento tiene ID estable, instante y contexto; separa actor operador/simulador y razón. La identidad del operador local no demuestra una auditoría multiusuario.

Guardar debe usar el acuse persistido. Distingue mutación no aplicada, guardado confirmado y resultado incierto. No afirmes resistencia criptográfica a manipulación por encadenar hashes. Si el diario está corrupto, conserva bytes y bloquea lo afectado con una explicación; no lo sustituyas por un incidente vacío exitoso.

Reabrir un proceso propio conserva estado y no genera una nueva semilla. Otra instancia/portal/captura con el mismo ID nominal no hereda decisiones, aprobaciones o estimaciones por accidente. Define qué invalida y qué puede conservarse explícitamente.

### E. El CRM vuelve: revisión de tres vías

El control de demo «Simular vuelta del CRM» activa un remoto ficticio identificable. Incluye al menos un campo donde base, local y remoto difieren. Muestra esos valores y qué conservará cada decisión.

Usa `Recovery` existente para preparar, decidir, aprobar, aplicar y conciliar. No implementes otro merge. Las restricciones que encuentre (relaciones no admitidas, registro ausente, cambio remoto tras revisión, plan inválido) se muestran; no las saltes para hacer una demo feliz.

La aprobación queda ligada al contenido/plan/contexto vigentes. Cambiar la decisión, los datos locales o el remoto invalida lo revisado según el contrato. Nunca apruebes en lote sin que el usuario pueda examinar lo que se enviaría. Todo envío de este encargo es simulado.

Ofrece un fallo reproducible de acuse perdido: el remoto aplica un create, persiste el efecto y falla antes de entregar el acuse. El resultado queda incierto, se reanuda tras reinicio y se comprueba el ID correcto. La conciliación no debe producir un segundo create. Cuenta las llamadas y los registros del simulador para demostrarlo. Incluye un ID incorrecto como control negativo.

No prometas compensación o rollback de un efecto remoto ya ocurrido. Si el motor no puede demostrar un caso, deja su estado y límite visibles y entrega la reproducción; no edites la fuente ajena ni lo tapes con un aviso genérico.

### F. Informe que se pueda enseñar

Resumen del ensayo: procedencia, inventario y cobertura, plan elegido, estimaciones declaradas, trabajo local confirmado, conflictos, decisiones, envíos simulados verificados, incertidumbres pendientes y hechos no demostrados.

Una comparación antes/después usa el mismo fixture, reloj y método. Tiempo de usuario y tiempos técnicos se muestran separados. «Cabían cinco tareas» no demuestra que se hicieron cinco ni que se ahorró dinero. La duración de una suite no es RTO y el simulador no acredita HubSpot real ni recuperación en otro equipo.

Descarga local JSON más un informe HTML estático autocontenido o documento legible equivalente. Escapa contenido, sin scripts, imágenes o enlaces remotos activos; prueba texto malicioso como dato. No incluir secretos, rutas privadas del equipo o inventario bruto innecesario. La exportación de esta unidad solo admite ficción; no amplía exportaciones de producción.

## 6. Orden de ejecución y profundidad

No intentes abrir seis frentes a la vez. Trabaja en este orden y verifica cada incremento:

1. **Mapa y contrato breve.** Reuso, contexto, estados,24 rutas y lectura congelada. Registra las decisiones en el informe/checkpoint propios; no dediques toda la sesión a documentación.
2. **Recorrido vertical funcional.** Fixture pequeño, cola real, una edición local, retorno con un conflicto e informe. UI conectada al servidor propio. Ningún botón principal sin efecto comprobable.
3. **Persistencia y control de versiones.** Reapertura de proceso, diario, doble solicitud, dos pestañas, aislamiento y rechazo de revisión obsoleta.
4. **Fallo difícil.** Acuse perdido tras efecto, reinicio, conciliación y prueba de no duplicación; fallo parcial y plan corrupto.
5. **Plan por tiempo y comparación.** Estimaciones explícitas, desconocidos, exclusiones, cambios de presupuesto, inventario10.000 y cobertura más allá de200.
6. **Producto pulido.** Teclado, foco, errores útiles, borradores, móvil, exportación y documentación de integración.
7. **Profundidad adicional útil.** Solo si el ciclo anterior está demostrado: más casos límite de la matriz, medición de rendimiento, regresiones causales y simplificación del código. No añadas otros módulos ni otro proveedor.

El alcance incluye el plan temporal, pero la prioridad de construcción es cerrar el ciclo antes de sofisticarlo. Si una fase falla por código propio, corrige y vuelve a verificar lo afectado. Si el fallo es ajeno, aísla la reproducción, conserva la evidencia y continúa lo independiente.

## 7. Calidad visual y comprensión

Respeta `DESIGN.md`: español, blanco/gris, tinta oscura y azul; tablas/listas para trabajo, detalle lateral con ancho legible y jerarquía compacta. Una sala, una acción principal según el estado. Evita una nueva navegación global, un dashboard de tarjetas o saturación roja de «emergencia».

El operador debe encontrar una primera acción en menos de60 segundos en el guion del fixture. Mide tiempo/pasos del recorrido automatizado y declara que no es una prueba de usuario. No inventes un ahorro comercial o una métrica de adopción.

Estados vacío, carga, validación, conflicto, sesión/error y resultado parcial bien diferenciados. Campo inválido conserva su texto; editar otro control no lo restaura silenciosamente. Controles con label, foco visible, anuncios accesibles y destinos de foco después de paneles/cambios de estado. Error de red no borra el trabajo escrito. No dependas de animación o IA para entender qué ocurre.

Verifica1440,390 y320px, sin desbordamiento de página; una tabla puede tener scroll propio claramente accesible. Usa teclado para elegir, abrir, editar, resolver y volver. Muestra entidades homónimas sin confundir su identidad.

## 8. Matriz mínima de verificación

Cada fila requiere una aserción observable y específica, no una comprobación del nombre de una función o un snapshot que replique el algoritmo:

| Área | Casos necesarios |
| --- | --- |
| Contexto | Dos espacios con IDs iguales; cambio de captura con mismo ID/fecha y distinto contenido; rechazo de revisión anterior |
| Cola y plan | Tarea vencida, durante ventana, sin fecha, fecha inválida, estado desconocido; estimación ausente; presupuesto inválido; selección mayor de200; inventario total10.000 |
| Fechas | Día civil frente a instante y límites Europe/Madrid; reloj inyectable y fixture reproducible, sin adaptar una fecha inválida a medianoche |
| Mutaciones | Doble click, misma clave tras timeout, misma clave con payload distinto, versión antigua en otra pestaña; guardado correcto y recarga fallida |
| Reanudación | Detener solo el proceso propio y abrir la misma carpeta; comprobar contenido por proceso nuevo; no resembrar ni ejecutar al importar |
| Integridad | Diario/plan malformado conserva bytes y bloquea el flujo afectado; lectura no cambia el estado; rechazo de directorio externo/enlace |
| Retorno | Tres valores divergentes, decisión por campo, falta de decisión bloquea, aprobación obsoleta, cambio remoto después de revisar, ausencia de registro |
| Incertidumbre | Efecto antes de timeout, reinicio, ID erróneo rechazado, ID correcto concilia y un solo create total; fallo parcial sin reenvío de lo verificado |
| Cliente | Respuesta válida tardía de otro contexto, cancelación, JSON/formato/tamaño inválido, error no disfrazado de éxito, borrador conservado |
| Informe | Hechos comprobados frente a estimaciones; ninguna incertidumbre marcada como éxito; contenido HTML malicioso escapado; cero recursos externos |
| DOM real | Recorrido completo, teclado, foco, edición inválida persistente y cambio de contexto;1440/390/320, consola y red inspeccionadas |

Utiliza Node/tsx, SQLite, Fastify.inject y Playwright ya instalados. Mantén red externa bloqueada con el mecanismo existente y evidencia del alcance de tráfico durante la prueba. No uses `npm run build` ni dist/build de raíz: compila la proyección y la demo en tu carpeta propia. Documenta los comandos reales y sus códigos de salida.

No pongas un número artificial de tests como meta. Diseña pruebas que fallen por su causa. Donde aporte valor, usa mutantes privados de tus archivos para demostrar sensibilidad de guardas críticas: quitar la versión esperada, ignorar contexto, convertir incierto en pendiente o desactivar escape. No mutar la fuente compartida ni contar el mismo caso repetido como casos adicionales. Un timeout o error de compilación no cuenta como detección causal del defecto.

Separa pruebas de tus fuentes, regresiones existentes, bundles y navegador. No declares todo el checkout verde por un typecheck de proyección. Si un caso revela un fallo de producto, consérvalo como evidencia explícita y explica qué bloquea; no lo conviertas en TODO/skip para presentar una cifra verde.

## 9. Usa el presupuesto en progreso real

El usuario pide que dediques a esta misión la cuota incluida que quede. Trabaja con profundidad: construye, contrasta, prueba y pule. No pares después de un plan ni de la primera pantalla si tienes capacidad de continuar.

No conocemos desde aquí tu cuota ni el momento de reinicio. Si tu herramienta la expone, respeta su límite. No abras otras cuentas, compres créditos, cambies a facturación por uso, evadas límites ni lances llamadas redundantes para «gastar». No prometas consumir una cifra o seguir tras cerrarse tu proceso.

Actualiza `coordination/reports/CLAUDE-RESCUE-106-CHECKPOINT.md` al terminar cada fase y antes de un tramo largo. Incluye estado, hashes útiles, qué pasa/falla, comandos de reanudación, recursos propios en ejecución y próxima acción exacta. Un checkpoint no es submit ni aceptación. Si se agota la cuota con código pendiente, conserva la reserva y no autoaceptes o liberes cambios. Otra sesión no es su autora automáticamente.

Una vez satisfecho el alcance y su validación, presenta; no sigas modificando por gastar la cuota restante. La calidad y una entrega revisable son el objetivo del uso de cuota.

## 10. Entrega para Codex

En `coordination/reports/CLAUDE-RESCUE-106.md`, deja:

- Qué puede hacer hoy la demo, en qué entorno y con qué límites.
- Comando exacto comprobado para iniciar un ensayo nuevo y para reanudar el propio.
- Pasos del recorrido de8 horas y plan de60 minutos, con fixture y reloj identificados.
- Matriz de aceptación con evidencia propia, resultados de cada capa, fallos y aspectos no ejecutados.
- Hashes finales de los archivos entregados y hashes antes/después de fuentes ajenas leídas, con cambios concurrentes distinguidos.
- Capturas realmente inspeccionadas y rutas locales a los logs/artefactos.
- Medidas de tiempo/pasos/cobertura, sin convertirlas en ahorro o recuperación auténtica.
- Procesos propios iniciados/cerrados; no atribuir a esta unidad procesos ajenos.

En `coordination/plans/RESCUE-106-INTEGRACION.md`, propón el punto mínimo de entrada futuro, contratos, permisos, tratamiento de datos reales, aislamiento, migración, revisión y vuelta atrás. Enumera archivos que requeriría otra reserva. No ejecutes esa integración.

Presenta únicamente al terminar la versión revisable y deja de editar:

```powershell
node tools/coordination/board.mjs submit CLAUDE-RESCUE-106 claude --note "Modo Rescate aislado: recorrido, persistencia, conflictos e incertidumbre; comandos, hashes, pruebas y límites en informe"
```

No aceptes tu propia tarea. No cambies archivos después de presentar. Codex revisará los hashes actuales y la evidencia. Si hace falta corrección, debe devolver la unidad manteniendo sus reservas.

Tu respuesta final al usuario debe decir qué funciona, cómo abrirlo y qué sigue sin demostrarse. Queremos poder ver una sesión completa de trabajo durante una caída, cerrarla, reabrirla y demostrar que nada se perdió ni se devolvió dos veces dentro del simulador.
