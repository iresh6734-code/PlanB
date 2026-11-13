# CODEX-TASK-CAS-128 · Revisión de tareas antes de guardar

Fecha: 2 de noviembre de 2026 (Europe/Madrid). Responsable: Codex. Entrega para revisión independiente.

## Resultado

Servicio de lectura y escritura condicional de tareas locales, separado y aún sin montar en la aplicación. Una versión refleja la instancia, la sesión, toda la captura, la especificación activa, el registro y su última entrada de cambios. Si otra edición cambia la tarea —incluso si después la devuelve al valor anterior—, la versión antigua provoca un 409 antes de guardar. La escritura usa `Store.saveRecord` y conserva sus comprobaciones. Una petición que no altera campos responde con `changed: false` y no agrega una entrada al historial. No se modifica el endpoint anterior.

`registerTaskRevision` declara GET y PATCH en `/api/v7/task-revision/:id`; requiere montarse en la aplicación base protegida, no en un Fastify desnudo. Valida el contrato, limita el ID a 500 caracteres, rechaza campos fuera de la especificación y responde sin caché. El traspaso de integración y sus restricciones está en `coordination/briefs/TASK-REVISION-128-HANDOFF.md`.

## Evidencia

- `node --import tsx --test tests/task-revision.test.ts tests/task-revision-api.test.ts`: 16/16. SQLite en memoria y `inject` de Fastify con datos ficticios: dos editores y dos PATCH del mismo proceso, cambio y regreso, cambios de captura/instancia/especificación, registro ausente, bloqueo de recuperación, campos inválidos, respuesta perdida simulada después de guardar, reintento obsoleto y ausencia de historial duplicado. Se comprobaron autenticación/sesión, host y origen sobre `createBaseApp` con las rutas registradas en el arnés.
- `npx tsc -p tests/.tmp/task128-d8f0f794-51ea-4afb-9879-806e5cd8f34c/tsconfig.json`: 0 errores, limitado a los cuatro archivos nuevos y sus dependencias importadas; no es un chequeo general del repositorio.
- `npx esbuild server/task-revision.ts --bundle --platform=node --format=esm --packages=external --outfile=tests/.tmp/task128-d8f0f794-51ea-4afb-9879-806e5cd8f34c/task-revision.mjs`: compiló el módulo aislado; no equivale a compilar ni probar la app distribuida.
- `server/store.ts`, `server/app.ts`, `shared/model.ts` y `shared/fixtures.ts` conservaban el mismo SHA-256 en la comparación anterior/posterior a las pruebas finales. La entrega concreta se identifica por los hashes del submit del tablón.

## Límites y revisión necesaria

La comparación y el guardado son síncronos, sin `await`, para un único proceso/escritor que sea dueño del `Store`. La comparación no comparte la transacción SQLite interna de `saveRecord`: **no proporciona exclusión frente a otro proceso**, ni debe presentarse como compare-and-swap multiproceso. Los endpoints antiguos siguen permitiendo escrituras sin revisión. No se asegura idempotencia por intención: un PATCH repetido después de un cambio exitoso devuelve 409. Una lectura que coincida con lo enviado no demuestra por sí sola quién causó el valor. El no-op evita una fila adicional, no prueba una operación previamente perdida.

No se ha integrado ni probado en la interfaz real, en navegador, en el empaquetado distribuido ni con varios procesos. No se ha ejecutado `npm test` completo ni medido el coste de serializar capturas grandes. No se ha accedido a proveedores ni datos de clientes. La ficha de Claude 123 mantiene su contrato propio mientras dure su reserva. Una siguiente unidad debe revisar este servicio y sus supuestos de escritor, reservar los archivos necesarios y ensayar la integración real; no modificar 123 durante su trabajo o revisión.
