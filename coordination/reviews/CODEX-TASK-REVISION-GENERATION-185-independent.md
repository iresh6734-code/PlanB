# Generación185 · revisión independiente186

4/11/2026, Europe/Madrid. **Dictamen favorable sobre los seis hashes presentados.** Cambio de producto acotado a incluir la fecha de generación activa en la huella de revisión del servidor; no cambia el formato público ni monta nada en la interfaz.

## Cambio y controles revisados

`server/task-revision.ts:18` añade `generatedAt: store.generation?.generatedAt ?? null` al fingerprint que ya comprende instalación,snapshot,spec,sesión,registro e historial. Se conserva la comparación síncrona anterior a escritura y no-op. El comentario describe la nueva dependencia. Las cuatro rutas del puente183 de producto/documentación aceptadas siguen intactas salvo su test de límite, reservado expresamente bajo185; el handoff183 mantiene su hash.

Las cinco pruebas nuevas usan **saveGeneration y activate reales**, no Store.set para inventar la activación:

- Spec y captura idénticas, fecha nueva activada:revisión distinta sin cambios de registros/historial.
- Token anterior:409/TASK_REVISION_CHANGED tanto para guardar como para no-op; token nuevo admite no-op sin historial y cambio explícito con una fila.
- Candidata no activada:no invalida la versión activa. Activarla sí cambia la revisión.
- Activar spec y fecha idénticas:no inventa otra identidad de contexto.
- Activación entre comprobación previa de183 y PATCH:conflict, cero cambios y un solo intento, sin renovar el token. verify solo lee y observa context-changed.

El caso14 de183ahora exige conflicto tanto al cambiar generación como al cambiar cuenta; no se relaja el control de cuenta para acomodar el cambio. Las pruebas y documentación históricas de183describen su corte anterior y no se reescriben como si ya tuvieran185.

## Verificación independiente ejecutada

- **58/58 Node en una pasada serial**, nueve suites:5nuevas+14contexto183+11cliente166+16core/API128+8montaje160+2main/runtime+2ciclo177. `tests/.tmp/review186-node.log`. Sin skips/TODO/cancelaciones.
- **Tipos focales:0errores**, módulo y esas nueve suites con ES2023/DOM/Bundler/strict.
- **Sensibilidad propia:** esbuild genera un bundle temporal del test185sustituyendo en memoria únicamente el campo generatedAt por la huella anterior; no cambia el checkout. Los mismos cinco casos dan **1pasa/4fallan porAssertionError**, incluido el control positivo de fecha idéntica que sigue pasando. `tests/.tmp/review186-sensitivity.mjs`, bundle `review186-old-fingerprint.mjs` y log `review186-sensitivity.log`. Es una mutación inversa propia con cuatro fallos causales, no cuatro mutantes ni una nueva ejecución del baseline histórico del autor.
- Seis hashes actuales coinciden antes del dictamen; listado íntegro `tests/.tmp/review186-submitted.json`. Handoff183 `a495ff29d838bb352aa3cb5df9bf67a25a2edc316de70b7e0ba36ead2b4ae84e` intacto.
- Lanzadores y ciclo177 usan carpetas/bases/semillas/claves de test nuevas, compilan el servidor actual y cierran sus hijos propios. Registros de cierre y sondeo de ausencia preservados en `tests/.tmp/review186-processes.json`. No se operó181o161.

```powershell
$env:NODE_ENV='test'
node --import tsx --test --test-concurrency=1 tests/task-revision-generation.test.ts tests/task-revision-context-client.test.ts tests/task-revision-client.test.ts tests/task-revision.test.ts tests/task-revision-api.test.ts tests/task-revision-mount.test.ts tests/task-revision-main.test.ts tests/task-revision-runtime.test.ts tests/task-revision-launcher-client.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2023 --lib ES2023,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node server/task-revision.ts tests/task-revision-generation.test.ts tests/task-revision-context-client.test.ts tests/task-revision-client.test.ts tests/task-revision.test.ts tests/task-revision-api.test.ts tests/task-revision-mount.test.ts tests/task-revision-main.test.ts tests/task-revision-runtime.test.ts tests/task-revision-launcher-client.test.ts
node tests/.tmp/review186-sensitivity.mjs
node --test tests/.tmp/review186-old-fingerprint.mjs
```

El último comando debe fallar por la mutación privada; el primero es la pasada verde. Las pruebas HTTP/lanzadores se ejecutaron con permiso de loopback, sin proveedores ni credenciales reales. No se repitió la sonda y baseline históricos del autor, npmtest ni DOM.

## Huellas principales

Servidor `0887c8098299cb793a71f5df77f9fd1d79a7857e47bbb10c57c4b0e06dda4235`; test185 `dc623db0fdead8e10323c3b096f1fb61a28773cdc8f492b176a0ff44d43ead4f`; test183actualizado `56508a023e705c5c8488775e1bf6ee8058e5b520b4cb2d591c83aaf5016d6f08`. Los otros tres hashes documentales se conservan en el listado íntegro.

## Límites y siguiente paso

La garantía cubre los datos concretos de la huella bajo un escritor cooperativo. Repetir exactamente fecha y estado de todos esos datos sin avanzar historial puede devolver la misma huella; no es un contador monotónico ni cubre cualquier A→B→A de metadatos, rutaslegacy o escritores externos. Los tokens siguen opacos y un consumidor no debe renovarlos y reenviar sin revisión humana.

El handoff185aclara correctamente el efecto heredado401→planb:locked de readContext123 en navegador;166 no añade ese evento. Un adaptador posterior debe preservar sesión/lifecycle, procedencia humana y changed/unchanged/current. Esta unidad no edita136,170,U2oApp.

La preview181sigue con el backend anterior185y UI158legacy; aceptar185no la actualiza. La siguiente unidad187puede probar el flujo de generación/activación por HTTP real sobre un main nuevo, sin tocar esa copia o reservasClaude. Cualquier montaje visible conserva sus propias dependencias y revisión.
