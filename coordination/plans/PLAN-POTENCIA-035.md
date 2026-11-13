# Plan B · Capacidad de recuperación demostrable

29/10/2026, Europe/Madrid. Propuesta de producto y secuencia de ejecución Codex + Claude solicitada por el usuario. Los objetivos siguientes son criterios de aceptación, no resultados ya alcanzados ni fechas prometidas.

## La experiencia que queremos conseguir

«HubSpot cae a las 09:00. Ensaya ocho horas sin él, localiza el trabajo que vence, comprueba la copia que puedes usar y sigue operando. Cuando vuelva, revisa exactamente qué devolver». Potencia basada en hechos comprobables y pasos ejecutables, sin simular integraciones o éxitos.

El producto mantiene el alcance vigente: Windows, un operador/instalación/portal por carpeta, cuatro entidades y hasta 10.000 registros totales. La continuidad local funciona sin IA. No añade campañas, facturación, multiusuario ni escrituras remotas automáticas. Los experimentos usan datos sintéticos nuevos y no operan el equipo corporativo.

## 0 · Saber qué app se está viendo

**Resultado:** una actualización identificable, recuperable y probada. Una persona puede abrir cada apartado original y distinguir el CRM completo del espacio comercial y sus datos separados.

1. Cerrar UX032: corregir la precondición de su regresión; revisión independiente del hash nuevo. Su corrección funcional pasa la reproducción de Codex, pero no se acepta por ello una prueba que nunca abre la lista.
2. Claude mantiene UX034: foco estable, duplicados bloqueados y distinción entre fallo al guardar y fallo al recargar. Sus cinco archivos están registrados; estado ready al preparar este plan, sin ejecución acreditada.
3. Resolver REL033 antes de usar su preflight como puerta de instalación: parser no puede ignorar `src` sin comillas ni confundir `data-src` con `src`.
4. Inventariar la entrega nueva por componentes, revisar las diferencias del backend del piloto y preparar artefacto aislado con hash, respaldo y procedimiento de vuelta. No basta el número v0.6.0 o health.
5. Probar la copia candidata con fixtures: navegación completa, ficha, borrador, roles, cuatro entidades y continuidad; escritorio y 390/320. Evitar pruebas simultáneas de varios agentes contra el mismo servidor.
6. Solo tras revisión, actualizar la instalación independiente autorizada, verificar lo que sirve y recorrer las rutas reales. La unidad de instalación se reserva aparte; este plan no afirma despliegue.

**Aceptación:** cero funciones originales ocultas por accidente; activos servidos cotejados; backend identificado por artefacto; ningún paso que mezcle silenciosamente bases o sesiones. La unión de datos necesita decisión arquitectónica y contrato propios, no enlaces que aparenten sincronización.

## 1 · Laboratorio de caídas

**Pregunta:** «¿Qué pasaría si el CRM cae ocho horas o pierdo este ordenador?»

- Cambiar escenario y duración; comparar antigüedad de captura con el objetivo y tiempo medido de recuperación con el objetivo.
- Separar tareas ya vencidas, las que vencen durante la caída y las que carecen de fecha. Mostrar alcance de la muestra y evitar llamar pérdida comercial al importe de una oportunidad.
- Exigir evidencia ligada a espacio, fuente y generación. Perder el ordenador requiere copia verificada y restauración ensayada en otro equipo; un simulacro local correcto no demuestra eso.
- Mostrar preparado según evidencia, fuera de objetivo, sin demostrar o bloqueado, con cada causa y siguiente paso. Evitar un porcentaje de preparación arbitrario.

**Primera entrega de Codex, LAB035:** motor puro `shared/continuity-lab.ts`, demo sintética ejecutable `scripts/demo-continuity-lab.ts` y 17 pruebas. No obtiene datos reales ni está integrado en la app. Los tiempos de entrada del ensayo deben medir recuperación hasta un flujo utilizable; no adaptar sin más la duración de una suite.

**Siguiente Claude, LAB036:** componente y demo visual aislados sobre el contrato congelado, sin tocar App/TeamApp ni fuentes reservadas. Depende de aceptar LAB035. Brief en `coordination/briefs/CLAUDE-LAB-036.md`.

**Posterior Codex:** adaptador de evidencia persistida con procedencia, validación, permisos y snapshot coherente; conectar la vista solo cuando ese adaptador esté revisado. Si la captura real no tiene la evidencia necesaria, devolver null/sin demostrar. Sin inventar verificaciones ni fechas.

**Aceptación:** escenarios causales pasan; falta de evidencia nunca produce cero ficticio o preparado; estado independiente de red/IA; interfaz indica claramente datos sintéticos o fuente real. No atribuir a la simulación una recuperación ejecutada.

## 2 · Mesa de respuesta durante una caída

**Pregunta:** «¿Qué hago primero y qué puedo completar sin HubSpot?»

- Cola determinista de tareas vencidas y próximas, con cliente y dependencia, usando registros de la captura activa y reglas de negocio explícitas.
- Explicar la prioridad: fecha, estado y bloqueo. Datos incompletos visibles. Ningún ranking opaco que dependa de IA para seguir operando.
- Agrupar una tarea y sus acciones locales; mantener borradores tras errores recuperables y evitar dobles operaciones.
- Comparar antes/después en escenario sintético y conservar evidencia del trabajo local.

**Reparto previsto:** Codex define consulta, contrato e invariantes; Claude compone cola y estados con archivos exactos nuevos; Codex revisa roles, cambios de fuente y operaciones. Abrir encargos después de verificar el código existente para no duplicar Hoy/Comercial.

**Aceptación:** cada elemento justifica su orden; cambios de fuente no mezclan filas; tarea completada no reaparece por un sondeo atrasado; todas las acciones locales mantienen trazabilidad. Medir pasos y tiempo de completar el flujo con el fixture antes/después.

## 3 · Devolución al CRM con explicación de conflictos

**Pregunta:** «¿Qué cambiaría fuera y qué puede salir mal?»

Ampliar la comparación de tres vías ya existente, sin reescribirla: agrupar conflictos por cliente, distinguir valor capturado/local/remoto y mostrar la consecuencia de cada decisión. Preparar una devolución revisable con operaciones e IDs estables. Un resultado incierto no se repite automáticamente.

**Reparto previsto:** Codex contrato/ejecución/idempotencia y regresiones; Claude comparación visual y recuperación de errores. La interfaz no habilita escrituras externas por existir un prototipo. La ejecución real conserva autorización concreta de contenido y alcance.

**Aceptación:** conflicto tras cambio remoto no se pisa; reintento no duplica; resultados parciales/inciertos visibles; propuesta obsoleta invalida la aprobación. Validación inicial con transportes ficticios, no portales reales.

## 4 · Copiloto que prepare planes de trabajo comprobables

**Pregunta:** «Prepárame el seguimiento de estas tareas y explícame por qué».

Usar la superficie de propuestas existente: contexto seleccionado y permitido, contenido con referencias a registros, vista previa de acciones, aprobación ligada a versión y conexión y resumen de resultado. Primero modo propuesta/sombra. La IA puede fallar sin impedir trabajar manualmente; jamás se inventa un correo enviado o un evento creado.

**Reparto previsto:** Codex reglas, evaluación y contratos; Claude flujo de revisión y explicación. No se activa modelo/proveedor ni se amplía envío de código por este plan. Para probar un modelo real se usa la cuenta y el alcance expresamente autorizados para esa unidad.

**Aceptación:** propuestas sin evidencia marcan incertidumbre; entradas obsoletas invalidan revisión; permisos de lector no producen ejecución; ningún envío automático. Medir correcciones necesarias, aceptación de propuestas y ausencia de acciones fuera del alcance en fixtures.

## Orden y puertas entre unidades

| Orden | Unidad | Responsable | Puerta para avanzar |
| --- | --- | --- | --- |
| Ahora | UX032 + UX034 y corrección REL033 | Autores actuales; revisión Codex | Pruebas causales y hashes nuevos; reservas conservadas |
| Ahora | LAB035: motor + plan | Codex | 17 pruebas y typecheck; revisión separada antes de aceptación |
| Después | LAB036: demo y componente | Claude | LAB035 aceptada; contrato sin cambios; QA real con fixtures |
| Después | Evidencia real + integración | Codex | Fuente/coherencia/roles probados; reserva exacta nueva |
| Después | Entrega candidata/instalación | Codex coordina, Claude QA | REL033 resuelto, revisión backend/UI y respaldo |
| Siguiente ola | Mesa de respuesta | Codex + Claude | No duplicar módulos actuales; medir flujo completo |
| Siguiente ola | Conflictos y copiloto | Codex + Claude | Contratos revisados, límites/autoridad y evaluación explícitos |

No hay estimación fiable de calendario sin revisar las siguientes unidades. Cada entrega debe aportar un recorrido utilizable; las siguientes olas no se declaran implementadas.

## Cómo colaborar sin pisarnos

- Tablero como fuente de reservas. Un encargo por lista exacta, sin reutilizar una reserva ajena. Código presentado permanece congelado hasta revisión. Propuesta de ampliación mediante encargo nuevo.
- Claude presenta reproducción, cambios, comandos, resultados y hashes; Codex contrasta precondiciones, casos adversos, atribución y árbol actual. No aceptar pruebas verdes cuyo caso causal no se ejecuta.
- Un solo navegador/E2E a la vez y directorio/puerto ficticios por unidad. Codex puede ejecutar Node en paralelo. Prohibido `npm run build` sobre build/dist del piloto.
- Pruebas automáticas apropiadas, regresiones para fallos reales, sin inflar cifras con casos vacíos o todo. QA móvil/teclado sobre DOM real cuando se afirme foco o geometría.
- El tablero comunica trabajo registrado, no presencia o actividad del modelo. Preparar un brief no equivale a enviarlo. No se usa el ejecutor general ni se amplían las seis fuentes autorizadas de consult.mjs.
- Memoria actualizada al entregar y pendientes explícitos. Ningún commit/push/despliegue implícito, ni uso del ordenador corporativo, correo o proveedores externos.

## Evidencia consultada y límites

Código/tablón locales, informe UX032 y revisión propia; no observación de ventanas Claude. Chat consultado: **Busca un plugin para Claude Code**, ID `01a1868d-19af-7341-9ce3-72d23e3a823c`, dos turnos recientes, salida truncada. Confirma como contexto histórico el prompt de UX034, no una orden nueva para publicar ni una sesión Claude controlable. No había terminal de app adjunta a este chat. No se ha comprobado que la actualización de la app esté en curso o terminada: se exige entrega y evidencia de instalación.
