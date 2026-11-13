# Kit de Relevo · demo aislada (CLAUDE-RESCUE-KIT-116)

Ensayo con **datos ficticios**: traslada la Sala de rescate (106) a **una carpeta nueva y un proceso nuevo de ESTE equipo** mediante una cápsula cifrada. Banner fijo: «Ensayo · datos ficticios · mismo equipo, carpeta nueva». **No acredita otro ordenador**, no conecta con HubSpot y no forma parte de la navegación de la app.

## Qué hay detrás (no es una maqueta)

- **Cifrado y formato:** `encodePortable`/`decodePortable` (scrypt + AES-GCM, `planb-encrypted-v2`), sin cifrado propio. La cápsula es `planb-rescue-capsule-v1`.
- **Contenido (coherente, capturado bajo exclusión del escritor del origen):** bundle del `Store`; estado, diario e idempotencia de Rescate por **lista permitida** (no se enumera `meta`); estado del CRM simulado; y el plan/mapa/marca de retorno **de simulación**, que el bundle del Store no incluye y se llevan por claves explícitas.
- **Integridad:** huella por componente y huella del conjunto (revisión). Se comprueban la coherencia cruzada, el formato y los límites antes de aceptar nada.
- **Inspección sin escritura:** abre la cápsula en un `Store` en memoria; muestra procedencia, recuentos, operaciones inciertas, advertencias y la política que se aplicará.
- **Importación:** exige que la aprobación esté ligada al SHA-256 y a la revisión **exactos** inspeccionados; una sola vez por cápsula (reclamo `.import-claim`); staging `rescue116-staging-*` → validación → publicación como `rescue106-<id>` nueva. Si falla, no queda destino publicado (carpeta `rescue116-failed-*`, nunca se borra el origen).
- **Nuevo contexto:** el destino recibe un `workspaceId` nuevo, la cadena `lineage.origins` y un hecho `capsule-imported`. Las claves de idempotencia del origen se conservan solo como historia.
- **Política por estado:** una aprobación de plan se retira (vuelve a revisión); lo **incierto se conserva como incierto**; un fallo armado («perder el acuse») se desarma; un cierre se importa como consulta. Nada se reenvía solo.
- **Conciliación:** en el destino, un ID erróneo se rechaza y el correcto concilia el `create` perdido sin duplicarlo (un solo create en el simulador).
- Conserva las guardas de 106 R2: contexto antes de replay, atribución conservadora de efectos, límite de diario, validación estricta del cliente y bloqueo antes de abrir.

## Cómo abrirlo (comandos comprobados en este equipo)

1. Compilar las dos interfaces en carpetas propias (sin tocar `dist/` ni `build/` de la raíz):

```bash
npx vite build design/rescue-capsule --outDir "$PWD/tests/.tmp/rescue116-dist-kit" --emptyOutDir --base ./
```

```bash
npx vite build design/rescue-room --outDir "$PWD/tests/.tmp/rescue106-dist" --emptyOutDir --base ./
```

2. Arrancar el kit (crea un origen `tests/.tmp/rescue106-<id>` y una carpeta de kit `tests/.tmp/rescue116-<id>`; falla si el puerto está ocupado):

```bash
npx tsx scripts/demo-rescue-capsule.ts --port 4531 --dist tests/.tmp/rescue116-dist-kit --dest-dist tests/.tmp/rescue106-dist
```

Abrir `http://127.0.0.1:4531/`. Para reanudar el origen propio: añadir `--resume tests/.tmp/rescue106-<id>`. `--now <ISO>` fija el reloj. **La contraseña no se pasa por argumentos**: se escribe en la interfaz.

## Guion (≈ 3 minutos)

1. **Preparar:** «Sembrar origen del ensayo» (trabajo local + `create` con acuse perdido ⇒ operación incierta) y «Exportar cápsula» con una contraseña de ensayo.
2. **Inspeccionar:** elegir la cápsula y escribir la contraseña. Se muestra el contenido **sin escribir nada**. Una contraseña errónea da un error claro y deja la cápsula disponible.
3. **Aprobar:** marcar «He revisado este contenido (SHA-256 …)» y volver a escribir la contraseña. La aprobación queda ligada a ese contenido exacto.
4. **Abrir el destino:** se crea una carpeta nueva y se abre en **otro proceso**. Allí: probar un ID erróneo (rechazado) y conciliar con el correcto: **un solo create**.
5. **Informe comparativo:** descargar HTML/JSON (sin contraseña ni rutas privadas) con origen/destino y lo que no se demuestra.

## Ensayo por línea de comandos (mismo contrato que la interfaz)

```bash
echo "una-contraseña-de-ensayo" | npx tsx scripts/rehearse-rescue-capsule.ts
```

`--crash <paso>` termina el proceso con código 86 en ese paso (`export:captured`, `export:encrypted`, `export:before-publish`, `export:published`, `import:staging-created`, `import:bundle-restored`, `import:components-written`, `import:before-publish`, `import:published`, `import:first-start-ok`). Imprime `KIT`, `ORIGIN`, `STEP` y `RESULT`.

## Pruebas

```bash
node --import tsx --test --test-concurrency=1 tests/rescue-capsule.test.ts tests/rescue-capsule-integrity.test.ts tests/rescue-capsule-context.test.ts tests/rescue-capsule-rehearsal.test.ts tests/rescue-capsule-api.test.ts tests/rescue-capsule-client.test.ts
```

**`--test-concurrency=1` es obligatorio y nada más debe escribir en `tests/.tmp` mientras tanto:** cuatro pruebas (integridad «sin destino ni staging», interrupciones, importaciones concurrentes) comparan el listado de `tests/.tmp`, que es compartido; con ficheros en paralelo, o con otra sesión creando `rescue106-*`, fallan por ruido ajeno y no por un defecto de la cápsula (comprobado: 6 fallos en paralelo, 0 en serie). Es una limitación del diseño de esas pruebas, no un resultado a ignorar: la forma fiable de ejecutarlas es una copia con `tests/.tmp` propio.

El E2E (`tests/e2e/rescue-capsule.spec.ts`) necesita `PLANB_KIT_DIST` y `PLANB_ROOM_DIST` (interfaces compiladas) y una configuración propia de Playwright con Chromium headless; lanza sus propios servidores. Detalle y resultados en `coordination/reports/CLAUDE-RESCUE-KIT-116.md`.

## Límites

- **Mismo equipo, carpeta nueva y proceso nuevo.** No se ha probado en otro ordenador ni con HubSpot real; no hay RTO/RPO.
- El simulador **no observa relaciones**; el plan considera como máximo las 200 tareas visibles; el diario admite 5000 hechos.
- Un solo escritor local por carpeta (bloqueo de proceso); no hay exclusión entre ordenadores desconectados.
- Un hash acredita igualdad de contenido, no autoría; la contraseña del ensayo protege la cápsula, no es gestión de claves.
- Una cápsula se importa una sola vez; para repetir hay que exportar otra.


## Reclamo de importación (R2: revisión independiente 138)

El reclamo `<cápsula>.import-claim` registra el destino ANTES de publicarlo y **nunca se libera si el destino pudo publicarse**. Tras un fallo se distingue: *publicado* (marcador propio con roomId y revisión de la cápsula), *no publicado* (verificado: no hay carpeta; solo entonces se libera) y *dudoso* (se conserva y se avisa).

- `IMPORT_PUBLISHED_UNCONFIRMED`: el destino se publicó pero no se pudo escribir la confirmación; no se repite y se consolida al reintentar cuando el reclamo sea escribible.
- `IMPORT_PUBLISHED_WITH_ERROR`: se publicó y la importación terminó con un error posterior; el destino no se borra.
- `IMPORT_AMBIGUOUS`, `CLAIM_UNREADABLE`, `CLAIM_RECOVERY_BUSY`: no se puede saber, no se puede leer o hay una recuperación en curso o interrumpida (fichero `.takeover`, que solo se retira a mano): no se importa a ciegas.
- La recuperación de un reclamo obsoleto (PID ausente) es **exclusiva** y revalida el contenido bajo esa exclusión. La identidad por PID no se puede probar (un PID reutilizado se verá vivo y bloqueará: lado seguro). Un solo equipo.
- `sweepStaging` solo retira el staging de un importador cuyo pid (en el marcador) ya no existe.
- **Propietario del reclamo (R3):** el reclamo lleva `pid` y `owner` (identidad de la instancia del módulo). Un PID vivo solo prueba que hay un proceso, no quién importa: dos hilos o dos copias del módulo pueden compartir PID. Se recupera un reclamo **solo** si su PID ya no existe o lo escribió ESTA instancia y no tiene importación activa sobre él; cualquier otro caso (PID vivo con otro propietario, propietario desconocido, reclamo ilegible, destino dudoso) bloquea. Ni el PID ni el token prueban identidad entre equipos ni frente a escritores que no cooperen.
- **Exclusión de recuperación (`.takeover`):** nunca se retira sola salvo la propia al terminar. Si queda abandonada, `CLAIM_RECOVERY_BUSY` informa de quién (pid, desde cuándo, si existe). `describeClaim(kit, nombre)` es un informe SOLO DE LECTURA del reclamo, de la exclusión y de si el destino está publicado. Paso humano verificable: confirmar que el proceso de la exclusión ya no existe, que el reclamo no ha cambiado y que el destino no está publicado; mientras haya dudas, esperar.
- **Adquisición inicial + recuperación como un solo protocolo (R4):** quien crea el reclamo inicial (`wx`) no pasa por `.takeover`. Por eso el recuperador ya no borra el reclamo obsoleto para crear el suyo (entre ambos pasos un importador nuevo podía crearlo y publicar, y el recuperador recibía un `EEXIST` de sistema): lo **sustituye con un renombrado atómico**, de modo que el reclamo existe siempre y un importador nuevo ve «obsoleto + recuperación en curso» (`CLAIM_RECOVERY_BUSY`). Antes de sustituir se vuelve a leer el reclamo: si cambió, se reevalúa y no se pisa. Si el renombrado falla: `CLAIM_RECOVERY_FAILED` (409) con `claimUnchanged` solo si se comprobó que el reclamo anterior sigue igual; cualquier otro error de sistema durante el reclamo sale como `CLAIM_CHECK_FAILED` (500, «no se importó nada; estado no comprobado»), nunca como un error genérico. Límite: un escritor que no coopere (editar los ficheros a mano) no queda cubierto; no se ha demostrado exclusión entre equipos.
