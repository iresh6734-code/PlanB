# Radar de compromisos · contrato de la primera demo

El servidor se registra mediante `registerCommitments(app, store, dataset, clock?)` después de crear `createBaseApp`. La candidata lo habilitará de forma explícita en su instalación de ensayo. El módulo no contiene credenciales ni accede a proveedores. El puerto normal no registra estas rutas hasta el montaje central. Las solicitudes requieren la autorización local existente y la revisión de `workspaceSearchContext` de `/api/v2/state`. La copia tiene que estar activa y clasificada como ficticia.

## Para el cliente de Hoy

| Acción | Entrada | Salida validable en `shared/commitments.ts` |
| --- | --- | --- |
| Listar | `GET /api/v7/commitments?contextRevision=<pin>` | `commitmentListResponse` |
| Abrir | `GET /api/v7/commitments/:id?contextRevision=<pin>` | `commitmentDetailResponse` |
| Confirmar | `POST /api/v7/commitments/:id/decisions` con `commitmentDecisionRequest` | `commitmentDecisionResponse` |

- La ficha muestra estado, causa y acción. La evidencia separa venta, entrega y soporte, y muestra `linked`, `observation` y `candidates` por separado. `linked.basis` indica si hubo referencia explícita o confirmación. Un candidato no aporta observación.
- Para asignar, enviar `decision: { type: 'assign', owner, nextStep, dueAt }`. Para cerrar, `decision: { type: 'close', basis: 'observed' | 'manual', note }`. Las fechas son UTC ISO. `canCloseObserved` informa si el cierre con evidencia está disponible en la lectura. El servidor vuelve a comprobarla al confirmar.
- Cada confirmación lleva el pin de copia, `expectedRevision` leído en el detalle y un `operationId` UUID. Ante pérdida de respuesta, conservar el mismo cuerpo y la misma clave para un reintento explícito. El recibo de un reintento exacto es el original. Abrir con GET recupera la vista actual. El recibo puede corresponder a una revisión anterior si otra persona decidió después.
- `409` incluye `details.code`. `COMMITMENT_REVISION_CHANGED` requiere recargar el detalle y conservar el borrador para revisión. `COMMITMENT_CONTEXT_CHANGED` requiere actualizar el contexto y retirar la vista anterior. `COMMITMENT_OPERATION_REUSED` indica otra decisión con la misma clave. También se distinguen cierre previo, evidencia insuficiente y límite del historial. `401` retira la vista, `404` indica ID ausente o capacidad sin montar y `503` indica historial local ilegible. Mostrar textos propios y descartar respuestas tardías cuyo pin ya no sea el vigente.
- La lista incluye los cuatro estados, de modo que el consumidor puede presentar riesgos primero y mantener accesibles los casos sanos, sin confirmar y cerrados. El retorno de foco usa el ID del compromiso.

## Para el adaptador ficticio

- Exportar una fábrica `createCommitmentDemoDataset(now: number): CommitmentDataset` a partir de `commitmentDemoDataset` con instalación bloqueada, entrega sana, una fuente indisponible y dos registros parecidos en cuentas distintas. El identificador de evidencia es la tupla exacta `[provider, accountId, kind, remoteId]`. Mantener las observaciones coherentes con la fecha fija de la candidata.
- `coverage` admite `complete`, `partial` o `unavailable`. `condition` vale `clear`, `blocked` o `completed` si se conoce, y `null` cuando la fuente es indisponible. Una fecha futura o de más de 24 horas queda como `stale`. Una observación parcial es insuficiente para afirmar el estado de la fuente. Un bloqueo reciente y completo acredita riesgo incluso si falta otra fuente. Si no hay un bloqueo observado y la cobertura es incompleta, el estado global es `unconfirmed`.
- Los cierres observados requieren las tres fuentes recientes y completas, la entrega completada y ninguna fuente bloqueada. El evento conserva las observaciones empleadas. Un cierre manual conserva la nota y se identifica como decisión humana. La identidad registrada es `local-operator`, compatible con el alcance unipersonal de la demo.
- El registro local es un historial acotado a 100 operaciones por compromiso, cifrado con Store en base de archivo y separado por copia y huella del dataset. Las lecturas no inicializan filas. Una actualización del dataset constituye otro ámbito de la demo. La candidata debe mantener las fechas y bytes del dataset estables durante el reinicio.

El simulador, el relevo operativo y los informes de incidentes son unidades sucesoras. El fixture de pruebas de la API es un control privado independiente de la futura fixture de la candidata.
