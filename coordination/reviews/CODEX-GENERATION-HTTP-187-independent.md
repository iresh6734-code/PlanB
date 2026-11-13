# HTTP187 · revisión independiente188

4/11/2026, Europe/Madrid. **Dictamen favorable sobre los dos hashes presentados.** Unidad de prueba e informe, sin cambios de producto o preview.

Se leyó el caso y se repitió **1/1**, sin skips/TODO/cancelaciones, sobre main compilado y HTTP nativo. Typecheck focal:0errores. Logs `tests/.tmp/review188-node.log`; evidencia nueva `tests/.tmp/http187-774d7d22/observed.json`, resumida por este revisor en `tests/.tmp/review188-observed.json`.

Carpeta/base/semilla/clave de test y sesión ficticia nuevas; entorno del hijo por lista permitida y red externa bloqueada. Endpoint/health acreditan PID27328, puerto52665 e instancia `8febdc0e-d794-4adc-bdf7-c08984ff71d2` antes del flujo. Estado inicial:0cambios,aiConfiguredfalse,disconnectedtrue y datosficticios.

`POST /api/generate` con mode demo produce una candidata con specidéntica y fecha nueva, sin IA. Mientras no se activa, la revisión sigue siendo la anterior. `POST /api/activate` revisado activa la generación y cambia la revisión. Dos intentos166con tokenviejo (escritura/no-op) devuelven409;183con contextoantiguo se detiene sinPATCH. Una intención fresh confirma un cambio; el siguiente no-op mantiene revisión e historial1.

Setup de contraseña ficticia200, lectura sinCookie rechazada, lectura autenticada conserva1cambio, bloqueo real200 y lectura posterior401. No se almacenan cookies/contraseña en la evidencia de peticiones. Los32requests del transporte contienen cuatroPATCHv7con estados409,409,200,200. No representan toda la actividadHTTP:probes iniciales,GETautenticado y bloqueo se comprueban aparte. Se contrastaron las aserciones, no solo los booleanos descriptivos de observed.json.

El registro closed.json acredita SIGTERM y se comprobó que el PID propio está ausente. No se operó181/4595,161/4594 ni otro proceso ajeno.

```powershell
$env:NODE_ENV='test'
node --import tsx --test tests/task-revision-generation-launcher.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2023 --lib ES2023,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node tests/task-revision-generation-launcher.test.ts
```

HTTP/proceso con permiso de loopback. Dos hashes cotejados antes del dictamen: test `2bd8f617058c591e346279366251cc3f1344038ed6f021be134fd3ebe36dcabb`; informe `317dd82a746de95ca62bb433ce39876be21f7a07de4a33c42fbdfbc00d6cc24a`. No se modificaron esas rutas.

No se repitió aquí la contrapruebaHTTP inversa del autor, su primer corte ni los58casos de185ya repetidos por186. No se suman esas cifras como pruebas nuevas. HTML mínimo y clientesNode, sin DOM/App; sin proveedor o credenciales reales. La garantía sigue limitada al fingerprint y un escritor cooperativo, sin idempotencia por intención ni identidadmonotónica. La interfaz158de181conserva guardadolegacy y backendanterior185; aceptar esta prueba no la actualiza. El próximo trabajo debe concretar un hueco funcional o montaje coordinado, manteniendo170/U2/173yQA136bajo sus reservas.
