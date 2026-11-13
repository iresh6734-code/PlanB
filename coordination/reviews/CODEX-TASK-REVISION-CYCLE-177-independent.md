# Ciclo177 · revisión independiente179

4/11/2026, Europe/Madrid. **Dictamen favorable sobre las dos huellas presentadas de177.** Unidad solo de banco e informe; no añade montaje de cliente en UI ni cambia la preview.

## Qué se contrastó

Leído el test completo: compila main167 y runtime168 reales y usa el cliente166 aceptado mediante HTTP nativo. Cada caso crea carpeta/clave de test/semilla/base/sesión ficticia nuevas y acredita coincidencia de PID/endpoint/health/instancia antes de leer una tarea. Red externa bloqueada en los hijos y no hay lectura de instalaciones anteriores.

Los dos editores parten de la misma vista: changed/conflict y un historial. No-op devuelve unchanged, revisión vieja conflict. El transporte de prueba consume la respuesta del segundo guardado y pierde su acuse: el cliente devuelve uncertain. La lectura posterior observa el valor y comprueba que el número de PATCH no crece; un envío explícito posterior con revisión vieja sigue siendo conflict. Dos cambios antes del controllegacy.

El test separa expresamente el PATCHlegacy de las peticiones del cliente: el primero aún puede escribir sin token y deja el tercer cambio. Todas las peticiones del cliente usan las rutasv7. Esto muestra la limitación de las rutas antiguas y no un fallback oculto. Tras bloquear la sesión real, read termina failed/status401.

## Repetición por este revisor

**2/2 casos del autor repetidos** en una pasada, sin skips/TODO. `tests/.tmp/review179-node.log`. Typecheck focal de `tests/task-revision-launcher-client.test.ts` junto a la comprobación focal de U1R2:0errores.

Evidencia nueva:

| Lanzador | Raíz propia | PID | Instancia | Puerto |
| --- | --- | --- | --- | --- |
| main | tests/.tmp/cycle177-main-8819c588-5ae2-4713-8d81-00f5efe0ce6f | 30268 | 068a4d36-ef03-4cbd-9b0b-eba68e9e3e67 | 50569 |
| runtime | tests/.tmp/cycle177-runtime-165196f3-d6e0-4a0d-a54c-ae1b923c8969 | 30288 | 957f5881-9fa7-47e2-b512-8361e1c60ddb | 50574 |

Los observed.json registran changed/conflict,10peticiones del cliente,2cambios antes delegacy/3después y401traslock. Se contrastaron con las aserciones, no solo con sus booleanos descriptivos. Ambos closed.json confirman cierre por SIGTERM de los hijos propios. No se cerraron procesos ajenos.

```powershell
$env:NODE_ENV='test'
node --import tsx --test tests/task-revision-launcher-client.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2023 --lib ES2023,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node --jsx react-jsx src/LocalTaskFocus.tsx tests/task-focus-outcomes.test.ts tests/task-revision-launcher-client.test.ts
```

HTTP/procesos con permiso de loopback. Los dos hashes presentados coincidían antes de dictamen: test `0a2480deaeedf2bf12b17cb8a41c0fb9c2718d1293472b4a348f64e51642a1df`; informe `1d78db4e5925784927194d2dcfc31a19beaef3b72f1b6d762cb515f2ffd471f6`.

## Límites

HTML mínimo y cliente desde Node, sin DOM/App. No se monta la estrategia en el gestor136/U1/U2; no prueba persistencia de borradores/operaciones ni autoría al leer el mismo valor. Un escritor cooperativo por carpeta, no CAS global ni idempotencia por intención. No se repitió todo npmtest ni mutantes. Fuentes y entregas Claude intactas; sin proveedores, credenciales reales, instalación, commit o despliegue. Preview161 sigue separada y anterior al montaje de revisiones.
