# HOY-FICHA-CONDICIONADA-A2 · Traspaso

Este traspaso no autoriza editar `TaskSaveOutcomes.tsx`, `App.tsx`, el servidor ni Store.

## Qué quedó montado

- **Host** (`TaskOutcomesHost`): prop `saveMode` (`'revised'` por defecto, `'legacy'` explícito). Cada propietario (montaje y `resume()`) se crea con `revisionStrategy()` en modo condicionado y sin estrategia (la anterior) en modo `legacy`. El contexto expone `revised`. `seal()`, `resume()`, `dispose()` y los dos puntos de creación no cambian.
- **Hoy** (`LocalOperations`): una sola línea, la ficha recibe `revised={outcomes?.revised}`. **A3 puede editar este archivo a partir de ahora**: esta unidad no vuelve a tocarlo.
- **Ficha** (`LocalTaskFocus`, prop `revised`): con gestor y `revised`, abre con `loadRevisedTask` (registro, esquema, contexto y token de UNA lectura validada) y entrega `revision` a `submit`. Tras confirmar adopta el token que devuelve el servidor (`op.revised.token`). Un no-op (`detail.kind === 'unchanged'`) se presenta como «Sin cambios… no se añadió historial». Un 409 `TASK_REVISION_CHANGED` (`detail.revisionConflict`) lee la versión actual y abre `TaskConflictReview` dentro de la ficha; elegir y volver no envían nada; la propuesta vuelve al formulario (base y token de la lectura mostrada) y un segundo «Guardar cambios» la confirma. Un rechazo por revisión reabierto desde «Resultados» (intento exacto) también abre el comparador. «Volver al formulario» conserva el borrador y ofrece «Comparar con la versión actual».
- **Nunca hay fallback**: un fallo de la lectura (401/404/5xx/cambio de contexto) muestra el aviso y conserva el borrador; un error del endpoint condicionado no produce ningún PATCH legado (comprobado en el servidor: 0 PATCH legados en todos los recorridos).

## Contrato para el resto

- `classifyUnapplied` tiene un caso nuevo `revision-conflict` (solo con `detail.revisionConflict`); el resto de casos no cambia.
- **«Por decidir»** (A2, fase siguiente) debe vivir en `TaskSaveOutcomes.tsx` (no en la ficha). La ficha ya sabe abrir un intento rechazado por revisión (adopción `restore-draft`).
- **Huella**: `LocalTaskFocus.tsx` cambió; la huella de `tests/task-focus-followup.test.ts` se renovó DESPUÉS de repetir sus pruebas de comportamiento (ver informe).
- **Anfitriones sin el contrato** deben pasar `saveMode="legacy"`: el cliente no puede descubrir por sí solo si el servidor habilita `taskRevisions` (no hay indicador en `/api/health`). `main` lo habilita siempre.
- Los servidores de prueba de especificaciones antiguas (`createBaseApp` sin `taskRevisions`) que monten la App real con el host por defecto necesitan `taskRevisions: true`; ver el informe.

## Límites

La comprobación del servidor protege frente a un único escritor cooperante (185): no a otros procesos ni a rutas anteriores. La ficha no persiste nada tras recargar (A4). El comparador no comprueba quién escribió cada valor.
