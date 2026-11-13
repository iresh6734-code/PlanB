# REL033 · Integridad y versión visible de los artefactos locales

29/10/2026, Europe/Madrid. Autor Codex. Unidad paralela a CLAUDE-UX-032, exclusivamente herramientas nuevas y su batería Node. No se editó ningún archivo reservado a Claude ni se ejecutaron Vite, Playwright o npm test durante esta entrega.

## Resultado

`tools/releases/workspace-manifest.mjs` genera manifiestos deterministas SHA-256/bytes/ruta/componente para una carpeta de frontend o runtime. No copia código ni escribe archivos. Selecciona solo índices/activos y nombres de bundles de servidor admitidos; excluye bases, entornos, logs, dependencias y configuración privada. Las fuentes de código son opcionales y deben seleccionarse explícitamente.

La creación coteja metadatos de archivo antes/después de leer, vuelve a calcular hashes al terminar y verifica de nuevo la lista de activos. Si un archivo o el conjunto cambia, no devuelve un manifiesto completo. Las rutas ambiguas de Windows, escapes, codificaciones, enlaces/junctions seleccionados y mezclas de formatos se rechazan. Las junctions no seleccionadas de dependencias se ignoran sin recorrerlas. `complete:true` significa que terminó esa comprobación de la selección, no firma digital ni aprobación.

La verificación distingue archivo coincidente, modificado, ausente y no comprobable. Tolera activos antiguos adicionales en una distribución: conservar un chunk antiguo no debe causar un falso fallo cuando el índice y los activos candidatos sí coinciden. El índice debe tener sus referencias declarativas de script/link incluidas; no es un intérprete de JavaScript ni un analizador completo del grafo de módulos.

Las fuentes opcionales se cotejan con el tablón de coordinación. Una reserva working/review/blocked prevalece sobre un hash done anterior. Se distingue coincidencia con el último registro done de la lista, cambio respecto a él, ausencia de registro y falta de comprobación. El tablón es un protocolo, no autenticación; esta observación no aprueba una entrega. El campo `review` siempre dice `not_approved_by_this_tool`. No se demuestra que un binario se compilara a partir de esas fuentes solo por incluir sus hashes en el mismo manifiesto.

`tools/releases/workspace-preflight.mjs` ofrece CLI de lectura. Sin comando muestra ayuda y no usa red. `create` imprime un manifiesto; `verify` coteja una carpeta y las fuentes seleccionadas si se proporciona su raíz. `http` es explícito y únicamente admite los servicios fijos `crm` y `pilot`:

- CRM: http://127.0.0.1:4331, GET /api/health, / y activos públicos declarados.
- Piloto: http://localhost:4334, GET /api/team/health, /team y activos públicos declarados.

No permite URL arbitraria, cookies, cabeceras de autorización, redirecciones, endpoints de sesión/datos, mutaciones, despliegues o reinicios. Las respuestas se leen con límite incluso si no anuncian Content-Length; fetch y cuerpo están acotados aunque ignoren AbortSignal. La cancelación es best effort y no bloquea la terminación. No se imprimen cuerpos, errores de transporte o URL recibidas que pudieran contener datos. Se verifica el tipo de health sin exponer instanceId y se repite el índice al final para detectar cambios durante la comprobación. Compartir versión0.6.0 no basta para coincidir: se comparan bytes/hashes. `backend: not_verified_by_http` permanece explícito: health no atestigua el código de servidor.

## Límites cuantificados

- Hasta512 registros por lista,16MiB por archivo y64MiB combinados de artefactos/fuentes declarados.
- Metadatos JSON:2MiB; índice:256KiB; health:16KiB.
- HTTP: hasta126 activos más health y relectura final del índice, como máximo128 GET. Hasta3s por lectura y15s globales por defecto; no se amplían por reintentos (no hay reintentos automáticos).
- Lecturas de filesystem y comprobaciones HTTP son observaciones acotadas, no bloqueos atómicos frente a un escritor malicioso del sistema operativo. Ninguna comprobación garantiza que un archivo o servicio no cambie después de terminar. Los temporizadores JavaScript no interrumpen CPU síncrona o un event loop bloqueado.
- Salida0: operación/comparación íntegra;2: diferencias;3: servicio no disponible;1: argumentos, formato o selección no verificables. Un0 no es autorización de publicación. Las fuentes no comprobadas y las revisiones pendientes se muestran aparte.

## Uso reproducible

```powershell
node tools/releases/workspace-preflight.mjs --help
node tools/releases/workspace-preflight.mjs create --artifact-root tests/.tmp/ui031-dist --source-root . --source scripts/start-full-workspace.cjs
node tools/releases/workspace-preflight.mjs verify --manifest tests/.tmp/rel033/crm-manifest.json --artifact-root planb-local-crm-completo-2026-10-29/runtime --source-root .
node tools/releases/workspace-preflight.mjs http --manifest tests/.tmp/rel033/crm-manifest.json --service crm
node tools/releases/workspace-preflight.mjs http --manifest tests/.tmp/rel033/crm-manifest.json --service pilot
```

`create` imprime JSON por stdout; guardar esa salida es una decisión explícita del invocador. El ejemplo `tests/.tmp/rel033/crm-manifest.json` se generó en esta tarea mediante el API y un pequeño conductor que solo escribió metadatos bajo tests/.tmp. No se añade un flag de despliegue ni escritura de instalaciones. Los informes temporales no son artefactos versionados o una aprobación duradera.

## Pruebas propias y evidencia actual

`node --test --test-concurrency=1 tests/workspace-release.test.mjs`: **30/30 correctas**, cero omitidas. Son fixtures y transporte HTTP ficticio; no arrancan servidores. Cubren determinismo, layouts separados, índices viejos con chunks nuevos, corrupción/ausencias, límites/rutas privadas/duplicadas/codificadas, metadatos/board inválidos, crecimiento durante lectura, cambios entre archivos, reservas pendientes sobre hashes antiguos, HTTP solo GET sin credenciales, mismo0.6.0 con bytes distintos, cambio del índice durante el chequeo, backend no descargado, redirección/errores sin filtración, fetch/cuerpo atascados, cancelación que no termina y presupuestos globales/cantidad de peticiones. Pruebas CLI demuestran que por defecto no hay red y que errores/diferencias tienen salidas distintas.

La primera pasada fue23/25: dos preparaciones de fixtures no pudieron crear enlaces en el sandbox. Con permiso de filesystem fueron24/25: Windows permite junctions pero no concede crear symlinks de archivo. Se mantuvo cobertura con junctions reales dentro de tests/.tmp y una prueba de metadatos lstat simulados que demuestra rechazo antes de abrir el archivo; **no se afirma una prueba nativa de symlink de archivo**. No se activó Developer Mode ni se modificó protección. Tras añadir relectura del índice y comprobaciones de límites, la versión final pasó30/30. Cada limpieza verifica que su carpeta temporal resuelta queda dentro de tests/.tmp antes de borrarla.

`node --check` de ambos módulos y `git diff --check` correctos. No se repite typecheck de la aplicación: no hay cambios TypeScript o de UI en esta unidad. Tampoco se repiten las pruebas de Claude o la batería general.

Comprobación funcional de lectura sobre la instalación existente, separada de los tests sintéticos:

- Generado manifiesto del runtime CRM actual: **18 archivos**,13 frontend y5 backend. La verificación local dio `match`.
- Fuente opcional scripts/start-full-workspace.cjs: hash coincide, pero UI031 está reservado en review, por lo que el informe muestra esa revisión pendiente. shared/version.ts coincide pero no tiene registro de aceptación localizado; se marca unrecorded.
- HTTP real exclusivamente público: **CRM y piloto dan match para los13 activos frontend** frente al candidato observado, con health0.6.0. El servidor de cada uno sigue sin verificarse por HTTP. Que ambos frontends coincidan no demuestra que los cambios posteriores del selector de Claude estén desplegados ni que sus backends sean iguales.
- Evidencia bajo tests/.tmp/rel033: crm-manifest.json, crm-local-verification.json, crm-http-verification.json y pilot-http-verification.json. No contienen respuestas CRM, tokens, cookies o valores de entorno.

## Coordinación y límites de entrega

Únicas escrituras de producto: los dos módulos nuevos, tests/workspace-release.test.mjs y este informe. Metadatos de ensayo en tests/.tmp y continuidad bajo reserva separada. No hubo acceso a cuentas, equipo original, ventanas personales, proveedor IA, datos CRM o secretos. Las instalaciones4331/4334 no se modificaron o reiniciaron.

Al último cotejo CLAUDE-UX-032 ya estaba en review. Su nota declara620/620,12 pruebas del componente y32E2E; **no se revisaron o repitieron en REL033 ni se aceptó su entrega**. Se conserva su reserva hasta revisión. REL033 se presenta con hashes y requiere revisión separada antes de aceptación; no se autoacepta ni despliega una entrega para demostrar actividad.


## R2 · Referencias reales del índice y error HTTP único · 31/10/2026, 14:52:56, Europe/Madrid

Resuelto el P2 de coordination/reviews/CODEX-REL-033-independent.md. La extracción ya no usa el primer src/href encontrado por una regex de etiqueta: tokeniza nombres y valores de atributos, admite valores sin comillas y selecciona src de script/href de link. data-src/data-href no sustituyen atributos reales. Consume valores citados completos aunque contengan >, distingue comentarios y texto de script/style/textarea, y mantiene el prefijo dist del runtime.

Es un subconjunto HTML acotado de256KiB, no un parser completo de navegador. Duplicados, citas incompletas, comentarios ambiguos, URLs con entidades/espacios, basehref, contenido extranjero SVG/MathML, template/noscript y construcciones no soportadas se rechazan explícitamente. No pueden producir complete/match por omisión silenciosa. La sintaxis HTML admite valores sin comillas bajo restricciones definidas en [WHATWG](https://html.spec.whatwg.org/dev/syntax.html#attributes-2); la [base URL](https://html.spec.whatwg.org/multipage/semantics.html#the-base-element) cambia resolución y por eso ese contexto no se certifica sin soporte. No se añadió dependencia.

Al probar rechazo HTTP apareció una duplicación de entrada: el índice se añadía como match antes de analizar sus referencias y luego otra vez como unverifiable al fallar. El registro se añade ahora tras analizarlo, con una única entrada si hay error. El estado global ya era different, pero el detalle deja de ser contradictorio.

**Pruebas actuales38/38**, sin skip/TODO/fail:30anteriores+8nuevas. Incluyen ausencia con src sin comillas y control positivo al crear el archivo, data-src señuelo y ausencia fantasma, href/src por etiqueta y orden, comentarios/rawtext, rechazo tipado de sintaxis no admitida y tres casos HTTP con transporte ficticio. En copia anterior fallan **4/4** regresiones del parser; con parser nuevo y agregación HTTP anterior falla **1/1** por dos entradas frente a una. Los cinco casos pasan con código actual; son sensibilidad esperada, no fallos de la suite normal.

Logs current.log/baseline.log/old-http.log y hashes en **D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/rel033-r2-e5262265-c9a1-443f-8402-0b54bc9e97b4/run-ca426b70-9724-459e-9340-0c2e603413e3**. Primero se observaron35/38 desde el contexto restringido: dos fallos de preparación porjunctionEPERM y el fallo de duplicación HTTP real. Salida conservada en la herramienta, sin inventar log persistido completo. Se corrigió agregación, y se ejecutó con permiso de crearjunctions ficticias sin cambiar controles del equipo. No se afirma prueba nativa de symlink de archivo; conserva la prueba lstat simulada.

node--check de ambos módulos y gitdiff--check focal correctos. No cambios TypeScript/UI de la app por R2, por tanto no se repiten compilación/E2E generales. El smoke de PREVIEW083 es una comprobación separada y no prueba el parser.

Comprobación funcional local sobre la carpeta nueva de PREVIEW083: createManifest/verifyManifest da **match para20archivos admitidos por la selección de REL033**, no los23del inventario completo de candidata. La política existente omite dist/agencias.html,dist/agencias.js y scripts/block-external.cjs; PREVIEW083 sí cotejó aparte los23artefactos de origen. No ampliar el significado de match al inventario entero o a un backend servido. Fuentes de herramientas figuran reserved/working al tomar esa evidencia, no aprobadas. No hubo HTTP hacia4331/4334 o otra instalación; HTTP de los tests es transporte ficticio.

### Hashes R2 que sustituyen la presentación anterior

- tools/releases/workspace-manifest.mjs: b79cc11b23c3ca9dcc911d0b24d6c63d8f13fccfa91bda3b195d562472514a0f
- tools/releases/workspace-preflight.mjs: 588b0053bba36e207e2a85e14b46406a66bd72df3ea4c3c32a2ffa9ac4a75a18
- tests/workspace-release.test.mjs: 13082ad6762c7265481b2ca0aac7ad8243a99d9d442a65c3ae916dec6914af1e

El hash del informe lo registra submit. Requiere revisión independiente; no autoaceptación, publicación o cambio de los procesos abiertos.
