# Super prompt · Hoy accionable: de una prioridad a una tarea editada

Trabaja en `D:/AI/Plan-B-CRM-v2.1/source`. Has entregado Integraciones119 y debes dejarla intacta mientras Codex revisa/monta. El siguiente encargo es **CLAUDE-TASK-FOCUS-123**: que una tarea concreta de Hoy pueda abrirse, trabajarse y devolver un resultado local confirmado. Es una mejora de la app principal, no otro producto o laboratorio.

## 1. Sitúate y reserva

Lee AGENTS.md, CLAUDE.md, COORDINACION.md, CONTEXTO-PROYECTO.md, PRODUCT.md, DESIGN.md y `coordination/plans/HOY-ACCIONES-123.md`. Aplica compliance-autopilot-execution-core y las skills pertinentes de React/interfaz/pruebas disponibles, sin instalar otras.

```powershell
node tools/coordination/board.mjs list
node tools/coordination/board.mjs brief CLAUDE-TASK-FOCUS-123
node tools/coordination/board.mjs claim CLAUDE-TASK-FOCUS-123 claude
```

La tarea exige119done. Si no está aceptada, deja de editar119 y espera dictamen: no cambies dependencias, no uses el actorcodex y no tomes otra reserva para saltar la puerta. Una sesión distinta no es autora de tus encargos anteriores por llamarseClaude.

Reparto vigente al preparar este prompt: otroCodex117/120 monta Preparación/Hoy/Agentes/Integraciones enApp y backend; Codex118 ha sido devueltaR2 por un caso de nombre largo y su autora lo corrige;121 verifica el recorrido conjunto. Otra sesiónClaude corrigeRescate106/QA115. No edites esas rutas o fuentes.

Solo puedes escribir los11 archivos exactos de `coordination/tasks/CLAUDE-TASK-FOCUS-123.json`. Antes de cada escritura usa check-path. No App.tsx, LocalOperations.tsx, components.tsx, RecordDrawer, Store, backend, APIs, estilos globales, paquetes, memoria o panel. No modificar119 después de presentar. Si necesitas otra ruta, documenta causa y continúa solo lo independiente.

## 2. Resultado que debe poder usar una persona

Desde la tarea «Llamar a Ana», abrir la ficha de **ese ID**, ver los valores actuales, editar estado/fecha u otros campos permitidos, guardar y volver al trabajo con confirmación. Si la captura no está activada, explicar qué falta y ofrecer continuar preparación; no inventar una tarea editable o activar la copia silenciosamente.

Las tareas del mismo nombre con IDs distintos siguen siendo distintas. Las tareas con el mismo ID en otra captura tampoco se confunden. Una404 no se convierte en alta. El módulo solo trabaja con entidadtasks; no modifica contactos, oportunidades o relaciones por inferencia.

## 3. Contrato para que Codex lo monte

Exporta `LocalTaskFocus({taskId,onClose,onSaved,onPrepare})` de `src/LocalTaskFocus.tsx`:

- taskId:string es el ID local, no el nombre de la tarea.
- onClose:()=>void devuelve el control a la fila de Hoy; no efectúa cambios.
- onSaved:(record:CrmRecord)=>Promise<void> notifica un guardado confirmado para actualizar la cola. Un fallo de esa actualización no convierte en fallido el guardado ya confirmado.
- onPrepare:()=>void abre el flujo existente de preparación cuando falta activación.

Fija los tipos exactos en el handoff. Codex añadirá por separado la acción por fila y el montaje. No cambies el contrato de118 ni importes tu componente enApp tú mismo. El arnés de pruebas es andamiaje de QA, no una nueva demo que sustituya la app.

## 4. Reutiliza el producto existente

Inspecciona primero `src/components.tsx`, especialmente RecordDrawer, su validación y el callback saved; `src/ReferenceSelect.tsx`; los endpoints en server/app.ts y server/v2.ts; Store.saveRecord y las estructuras en shared/model.ts.

Lecturas existentes: `/api/health`, `/api/v2/state`, `/api/v2/records/tasks/:id` y, si resulta útil, `/api/v7/local-operations`. Carga registro/esquema/contexto con cancelación y descarte de respuestas tardías. La proyección de snapshot enstate puede no traer el inventario: no la interpretes como una copia vacía ni descargues10.000 fichas para abrir una.

Reutiliza RecordDrawer si su contrato permite cumplir el flujo. No lo copies ni lo edites. El guardado existente es `PATCH /api/records/tasks/:id` con `{values}`. No inventes `/v2/records` de escritura, endpoints de completar o claves de idempotencia no reconocidas por el servidor. Los campos, reglas, opciones de estado, fechas y relaciones proceden de la especificación actual: no uses un estado literal completed si ese esquema no lo admite.

La API actual no tiene comparación atómica de versión ni idempotencyKey. Una lectura antes dePATCH no elimina la carrera entre ambas. No afirmes que el guardado está aprobado contra una revisión exacta o protegido de dos pestañas si no lo demuestra el backend. Conserva el alcance de edición manual actual; si un requisito necesita esa garantía nueva, entrega contrato y reproducción para una unidad de backend aparte. No la simules con localStorage, un flag o un hash solo en el cliente.

Store valida activación, reglas, relaciones, devolución en curso e integridad. No eludas sus409/422 con una escritura directa aSQLite, otraAPI o modificación de la captura. No reescribas sus transacciones: saveRecord ya abre una y no admite anidarla por conveniencia.

## 5. Guardado y fallos: la parte importante

Mantén dos hechos distintos: «elPATCH confirmó el registro guardado» y «la cola pudo recargarse». Si el primero termina correctamente y falla onSaved/GET, conserva el acuse y ofrece reintentar solo la lectura. No propagues ese fallo al callback de forma que RecordDrawer diga que no guardó y permita reenviar el mismo cambio inadvertidamente.

Evita doble envío en la UI con exclusión de la interacción. Eso no es idempotencia del servidor: si se pierde el acuse de una mutación, muestra incertidumbre y comprueba el registro/estado mediante lectura antes de sugerir una nueva escritura. No atribuyas a tu solicitud el efecto de otra edición idéntica. Si no puedes confirmar qué pasó con el contrato existente, deja el límite visible.

422 mantiene lo escrito y muestra los campos afectados.401 respeta el bloqueo de la app sin borrar borradores por una recarga automática.404 conserva el contexto y explica que la tarea ya no existe en esta copia.409 no sobreescribe: actualizar no debe descartar silenciosamente lo escrito. Un error técnico no se presenta como una tarea vacía nueva.

Al cambiar taskId, captura o instalación, las respuestas anteriores no cambian la ficha actual. Antes de descartar un editor con cambios, conserva el flujo de cierre explícito; no reutilices el estado interno de un registro para otro. No saltes el foco a la página de fondo durante una petición pendiente.

## 6. Diseño y accesibilidad

Mantén la ficha lateral del producto, español, jerarquía compacta y acciones con nombre claro. Muestra qué copia/tarea se está editando sin inventar datos. No otra barra de navegación o colección de tarjetas. Configuración y detalles secundarios plegados.

Teclado completo: abrir porID, foco al panel, recorrer campos, validar fecha, guardar, cerrar y recuperar foco en el disparador. No dos trampas de foco anidadas si reutilizas el drawer. En móvil no tapes botones o errores; prueba1440/390/320 con nombres y errores largos. Respeta reduced-motion y el lenguaje visual existente; no cambies DESIGN.md.

## 7. Pruebas exigidas

Primero un recorrido vertical contra Store/servidor reales en una carpeta o memoria propias: copia activada ficticia → tarea concreta → editar valor permitido → PATCH confirmado → nueva lectura conserva valor → exactamente un cambio esperado en el historial. No mocks de hooks como evidencia de persistencia.

Después cubre: copia importada sinactivar, vacía y activa; dos tareas homónimas; IDs/capturas distintos; respuesta antigua que llega después y transporte que ignoraAbortSignal;404/401/409/422/500; dobleclick; error de recarga después deéxito; cambio de selección con borrador; valor deenum no admitido; fecha civil frente ainstante; cierre y foco de retorno.

El caso «guardado correcto y GETfallido» debe contarPATCH y cambios enStore: reintentar lectura no produce un segundoPATCH. Un error desconocido tras escribir nunca se declara fallo seguro sin evidencia. Explica la limitación deconcurrencia de laAPIactual, sin tests que solo buscan strings o imitaciones delalgoritmo.

Datos ficticios nuevos; red externa bloqueada; Chromium limpio y loopback propios. No4451,4511,4515,4581–4584 o puertos de otros agentes comofixtures. Si el puerto está ocupado, falla sinmatarlo. No importesbases,DPAPI,perfiles,.env ocredenciales existentes. Sinproveedores,nuevasdependencias,worktrees,commits,push odespliegue.

Compila yprueba en `tests/.tmp/taskfocus123-<UUID>`, no npm run build/dist/buildraíz. Conserva resultados con fallos y explica las correcciones; noTODO/skip para presentarverde. Typecheckfocal no es regresiónglobal. Capturas que afirmes inspeccionadas debesverlas.

## 8. Orden y entrega

1. Mapa corto de contratos y límites reales; documentar si RecordDrawer permite separar guardado de recarga.
2. Abrir registro porID y leerlo en contexto, con estados explícitos.
3. Edición manual y confirmación persistida usando el producto existente.
4. Errores, carreras, borradores, foco y móvil.
5. Informe y handoff para el montaje deCodex. No montar por tu cuenta.

En el informe: qué funciona, comandos/resultados, hashes finales, snapshots/imports, fallos, capturas, procesos propios cerrados y garantías no demostradas. Enelhandoff: punto de integración exacto de la fila deHoy, firmas, recarga y restricciones. Actualiza checkpoint al terminar cada fase y antes de agotarcuota; no guardes secretos o borradores reales declientes.

Usa la cuota incluida para implementación y contraste útiles. No comprés créditos, cambies cuentas, lances llamadas redundantes o prometas trabajo permanente. Presenta cuando la versión sea revisable y deja de editar:

```powershell
node tools/coordination/board.mjs submit CLAUDE-TASK-FOCUS-123 claude --note "Ficha por tarea local: lectura porID, edición y acuse separado de recarga; pruebas, hashes y límites en informe"
```

No aceptes tu propia entrega. La respuesta final explica qué puede hacer ya el módulo y qué montaje sigue pendiente, sin declarar la app actualizada por tener un arnés que pasa.
