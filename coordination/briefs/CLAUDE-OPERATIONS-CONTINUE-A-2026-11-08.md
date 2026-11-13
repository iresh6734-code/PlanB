# Claude A · De Hoy a un centro operativo visible

Encargo de continuidad preparado el 8/11/2026, Europe/Madrid. Eres la sesión Claude responsable de Hoy, ficha, jornada y experiencia del Radar. Trabaja con autonomía durante una sesión extensa y encadena entregables útiles. El objetivo es completar recorridos de producto, no consumir presupuesto por consumirlo ni acumular informes.

## Resultado de negocio

Una persona entra en Hoy, entiende qué atender, organiza el tiempo disponible, abre la tarea exacta y guarda sin pisar otra edición. Después detecta una instalación comprometida, entiende sus fuentes, compara respuestas y deja una acción trazable. Si un guardado queda incierto, encuentra su intento y lo comprueba sin reenviarlo. Cada recorrido debe tener una entrada habitual de navegación y evidencia de su llegada a la App.

## Punto de partida que debes comprobar

- A2, Por decidir y reapertura 219 están aceptados. Las dos suites históricas D7/reapertura migradas al guardado condicionado pasaron 35/35 y fueron aceptadas tras revisión independiente 282. No rehagas ese trabajo.
- El adaptador A3, Jornada 205 y la corrección 275 de estimaciones están aceptados. `CLAUDE-HOY-COLA-JORNADA-A3` sigue ready en el corte revisado.
- Diario 208 R5 aceptado. Tener el modelo no significa que A4 esté montada.
- CORE del Radar, sus fuentes ficticias y los motores de simulación/informe están aceptados. `CLAUDE-COMMITMENT-RADAR-UI` y `CLAUDE-COMMITMENT-RADAR-SCENARIOS` siguen pendientes.
- 283 quedó aceptada como lector del resumen, con banco conjunto 23/23. El otro Codex prepara el montaje de ese resumen. No confundas un lector aceptado con recuperación duradera ya operativa.
- El último corte de demo verificado es 4601, con ficha condicionada, Por decidir y Relevo. Esto no acredita Jornada, Radar ni A4 en esa demo. Comprueba el estado actual antes de atribuirle funciones.

Lee AGENTS.md, COORDINACION.md, CONTEXTO-PROYECTO.md, tablón, matriz de montaje y dictámenes vigentes. Una entrada histórica del contexto no sustituye el estado actual del tablón.

## Reglas de colaboración

Identifícate como Claude A por sesión. Registra cada unidad con rutas exactas, dependencias y criterio observable; ejecuta claim y check-path antes de editar. Detente ante un rechazo de reserva y toma otra unidad sin solape. Las reservas sobreviven a submit y review. No te autoaceptes ni modifiques una entrega presentada sin que se devuelva por el protocolo.

App.tsx, main, contratos centrales y persistencia son de Codex en las unidades que se registren. No toques ContinuityHome, ContinuityHub ni los archivos del montaje de resumen anunciado por el otro Codex. Claude B tiene fuentes, conectores y QA de Continuidad. No tomes sus rutas. No cambies archivos de pruebas ajenos para ocultar fallos o renovar hashes sin encargo.

## Paquete 1 · Monta Jornada en Hoy

Empieza por reclamar la unidad existente `CLAUDE-HOY-COLA-JORNADA-A3`. Sus cuatro rutas son:

- src/LocalOperations.tsx
- src/local-operations.css
- tests/e2e/hoy-cola-jornada.spec.ts
- coordination/reports/CLAUDE-HOY-COLA-JORNADA-A3.md

Consume la cola estructurada real y el adaptador aceptado. Conserva apertura por ID, comparador, guardado condicionado, resultados, Agentes, foco y navegación. Añade «Organizar mi jornada» desde Hoy, con selección comprensible, estimaciones explícitas y explicación de las exclusiones.

Comprueba 30 y 60 minutos, una duración desconocida y una selección que no cabe. Lo desconocido no cuenta como cero y cualquier horario dependiente debe quedar provisional. No heredes el número de tareas del ejemplo antiguo: calcúlalo con las estimaciones de la fixture actual. Distingue copia vacía, importada sin activar, activa, cobertura parcial y error. Las relaciones no disponibles se explican. Ata la jornada al contexto completo y retírala al cambiar de copia. Prueba IDs __proto__, constructor y toString sin perder selección o estimaciones.

Entrega una prueba en la App compilada con API real, teclado, foco y 1440/390/320 px. Inspecciona las capturas relevantes. Presenta A3 y pasa a un paquete independiente mientras se revisa.

## Paquete 2 · Construye la ficha del Radar

Reclama `CLAUDE-COMMITMENT-RADAR-UI` con sus cinco rutas existentes. Respeta el contrato aceptado de shared/commitments.ts y su cliente. Usa las fuentes de shared/commitment-demo.ts, sin crear otro modelo paralelo ni tocar su generador.

La lista debe explicar responsable, fecha comprometida, causa principal y siguiente acción. El detalle separa venta, entrega y soporte, con procedencia, cuenta, observación y cobertura por fuente. Implementa los cuatro estados del contrato: riesgo, sin riesgo detectado con la información disponible, sin confirmar y resuelto. Una fuente caída no equivale a entrega sana. Dos IDs iguales en cuentas diferentes o dos nombres parecidos no crean un vínculo automáticamente.

Asignar responsable, fijar siguiente paso y cerrar deben usar revisión esperada y clave de operación según el contrato. Conserva el borrador ante 409. Bloqueo, cambio de captura y respuestas tardías no pueden mostrar evidencia de otra copia. Diferencia resolución observada y cierre manual.

Esta unidad permite pruebas de componente, pero su estado final debe decir si ya pasó por la App. Coordina el montaje con `CODEX-COMMITMENT-RADAR-MOUNT`; la puerta de Fase 0 sigue vigente. El coordinador debe conservar el instante de creación del dataset entre reinicios. No instales un montaje paralelo en LocalOperations para eludir esa unidad central.

## Paquete 3 · Simulador y película del incidente

Después de aceptar la UI, reclama `CLAUDE-COMMITMENT-RADAR-SCENARIOS`. Reutiliza shared/commitment-simulation.ts y shared/commitment-report.ts. Ambos ya recibieron aportación real de Claude CLI y revisión; no vuelvas a implementarlos.

Muestra las dos alternativas del piloto con sus supuestos, evidencia y datos pendientes. Retrasar dos días se calcula desde el compromiso original. Buscar stock alternativo no promete una fecha si falta evidencia. Simular y exportar producen cero escrituras. Convertir una opción en acción exige revisión vigente, propietario y fecha explícitos. Un doble clic o repetición de operación no añade dos decisiones.

Haz visible la cronología desde la ficha y permite HTML/JSON coherentes con lo mostrado. Conserva incertidumbre, procedencia y hechos históricos; no inventes autoría ni aceptación de otra persona. Inspecciona el HTML exportado y comprueba escape de contenido. El relevo operativo entre personas requiere su contrato propio; el Kit técnico no acredita ese acuse humano.

## Paquete 4 · Recuperación A4 cuando exista el contrato aceptado

Acuerda con Codex el protocolo HTTP y sus rutas antes de modificar gestor o ficha. Codex mantiene las rutas y la persistencia central; tú consumes ese contrato desde los archivos expresamente asignados. No envuelvas el guardado con una API inventada ni declares cobertura verdadera para quitar un aviso.

El intento debe ser duradero antes de despachar. Tras recargar o reiniciar, mostrar «Trabajo por recuperar» por instalación, captura, generación, tarea e intento. Abrirlo no reenvía ni transforma un incierto en un formulario de nuevo envío. Comprobar solo lee. La coincidencia de valores no acredita autoría y aceptar una lectura sigue siendo una decisión humana.

Con Codex, prueba cuatro cortes reales: fallo al persistir, reinicio después de persistir y antes de enviar, pérdida del acuse después de aplicar y fallo al liquidar. Cuenta aplicaciones e historial del ID exacto y conserva una homónima como control. Después de reiniciar, abrir y comprobar añaden cero PATCH. La cobertura del resumen debe conservar significado al desmontar Hoy o reiniciar; no depende de un componente vivo. No guardes borradores de clientes en localStorage.

## Cómo continuar sin parar después del primer submit

Mientras A3 está en review puedes avanzar Radar UI, pues tiene archivos distintos. Mientras esa UI se revisa puedes trabajar en A4 si su contrato y reserva ya están aceptados, o en pruebas de aceptación con archivos propios. Si una dependencia no está aceptada, no la eludas: toma una unidad independiente de esta misión. No generes trabajo ficticio si todas las siguientes dependen de una decisión externa.

Cada entrega incluye fuentes, prueba funcional, huellas, fallos conservados, límite y traspaso. Actualiza una tabla capacidad → entrada visible → API → efecto → evidencia → dueño del montaje. Una fila de producto no se cierra como lista si solo existe en arnés. Envía las novedades al dueño de CONTEXTO-PROYECTO.md si su reserva sigue activa.

Al terminar, explica qué puede hacer hoy una persona en la App, qué ya está aceptado pero aún no llega a ella y qué tarea exacta resuelve cada hueco. No prometas ejecución permanente después de cerrar tu sesión. Usa exclusivamente este equipo y ficción nueva; no proveedores reales, credenciales, instalaciones ajenas, commits o despliegues dentro de este encargo.
