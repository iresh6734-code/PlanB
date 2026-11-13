# CLAUDE-RESCUE-KIT-QA-136 · QA complementaria del Kit de Relevo (informe)

> **Léase primero §0bis (R2, 4/11/2026): estado vigente sobre 116 R4.** Las secciones §0–§9 conservan el informe de la entrega del 2/11 (sobre 116 R2): sus afirmaciones sobre el «PID compartido» y los «pendientes» son **históricas** y se anotan donde ya no rigen.

02/11/2026. Autora de 116 ⇒ esto es **QA propia ampliada, no revisión independiente**. Datos ficticios, este equipo (Windows 11, Node 24), raíces y procesos propios, sin red ni proveedores. El ID 133 estaba ocupado (`CODEX-LIFECYCLE-EXIT-133`): se usó **136**.

## 0bis · R2 (4/11/2026): reconciliación con 116 R4 aceptada (dictámenes 175 y 180)

**Continuidad:** QA-136 seguía `working` bajo `claude` con las diez rutas reservadas; se retoma por instrucción expresa del usuario («Prompt B · Fase 2»). No se tocó 116, ninguna prueba independiente de Codex, ni ruta fuera de la reserva (`check-path` permitido en las cinco editadas; `tests/e2e/rescue-capsule-followup.spec.ts` sigue sin crearse: no se modificó ninguna interfaz).

**Qué cambió.** El caso 8 caracterizaba un defecto de 116 R2 (dos instancias con el mismo PID). 116 R3/R4 lo corrigieron con un `owner` por instancia, así que esa prueba falla *correctamente* sobre R4 (baseline de esta unidad: **24/25**, la roja era solo el caso 8; coincide con el dictamen 180). No se invirtió una expectativa para dar verde: se escribió una **regresión vigente** del comportamiento corregido (`tests/rescue-capsule-followup-claims.test.ts`, caso 8):

1. Primera importación real **retenida** en `import:components-written` (worker propio, mismo PID, instancia de módulo distinta ⇒ owner distinto; **sin `fakePid`**).
2. Antes de pedir la segunda se guardan: **bytes** del reclamo, su `status/destination/pid/owner`, la **huella del staging** (ruta→tamaño:sha256) y la vista `describeClaim` de la segunda instancia (`pidAlive: true`, `ownedByThisInstance: false`, `activeHere: false`).
3. La segunda debe ser rechazada con `ALREADY_IMPORTED`; **bytes del reclamo idénticos, `deepEqual` del reclamo, huella del staging idéntica**, ningún destino anunciado por ella y nada publicado todavía.
4. Al soltar la primera: termina `ok` con **su** destino; reclamo final `imported` con ese destino, `sha256`/`revision` de lo inspeccionado y sin `recovered`; marcador cuyo `roomId` es ese destino; **un único destino** entre los identificados por las operaciones de esa cápsula (no se enumeran carpetas ajenas); su staging consolidado.
5. El worker se libera (`.go`) y termina **en `finally`**; esperas acotadas (30 s para la barrera, 60 s para el fin, 20 s en el cierre). Nuevos auxiliares del arnés: `treeDigest` y `describeClaim`.

**Control causal (procedencia: *mutación de R4*, no un baseline R2 completo).** Proyecciones privadas en `tests/.tmp/q2/{a,m}` (copias de `server/shared/src/scripts/design`, helpers y suites; `a` = R4 byte a byte, sha256 de `server/rescue-capsule.ts` `968e4db0…` igual al del tablón; `m` = misma copia sin `info.owner === INSTANCE` en `ownStale`, `1adc8380…`). Resultado del caso 8 (`causal.log`):

| Versión del caso 8 | R4 intacta | R4 sin la guarda de owner |
| --- | --- | --- |
| **Nueva (regresión)** | **pasa** | **falla**: «la segunda no debe importar» (la segunda importó) |
| Antigua (caracterización) | falla («recupera como obsoleto el reclamo activo» ya no ocurre: la segunda es rechazada) | pasa (la segunda importa) |

Las dos versiones reaccionan en sentido contrario ante la presencia/ausencia de la guarda; la nueva protege lo que R4 corrige. **Un primer intento de mutante falló por otra causa**: la ruta de la proyección (`.../mutante/...`) superaba MAX_PATH y SQLite devolvía `ERR_SQLITE_ERROR` en el worker (la barrera nunca se alcanzaba); se detectó trazando el resultado del worker y se rehízo con rutas cortas. No es un fallo del producto.

**Fuente anterior conservada** (no se borró): `tests/.tmp/rescue136-ev-16c77246-14b8-4bb9-8eac-4bcb61537d78/r2-start/` guarda `rescue-capsule-followup-claims.test.ts` (sha256 `861c72c2b0f8bc6dfa038ead25f86b9411d8612d3d11498eacd7de18cdb70b56`), el arnés anterior (`906314b2…`), `hashes-before.txt`, el log `baseline-R4-25.log` (24/25) y, en el directorio padre, los logs R2 de la entrega (`claims-run1.log`, `qa-final.log`, …). (`tests/.tmp` no se versiona.)

**Comprobaciones repetidas sobre el corte exacto 116 R4**
- Los 25 hashes de 116 coinciden con los presentados/aceptados en el tablón (comprobación automática al empezar y al final).
- **25/25** en serie (`--test-concurrency=1`, 90 s): `r2-final-25-run1.log`. Caso 8 nuevo 3/3 en ejecuciones aisladas previas.
- Orquestación paralela **repetida** (`--mode two --rounds 10`): dos ejecuciones simultáneas **25/25 + 25/25**, solape 88,5 s, raíces nuevas y señuelos cruzados: cada una vio intacto el suyo y ninguna vio la otra (`r2-par-two.log`). Una pasada de carga con 10 rondas es un estrés probabilístico; **no** es prueba causal.
- `tsc --noEmit` focal de las tres suites y del hijo: exit 0.
- Suites independientes de Codex (solo ejecutadas, no editadas): `independent-rescue-claim` y `independent-rescue-r4` **4/4 pasan** sobre el corte actual (hashes `74c5552a…`, `b6f369d6…`); `independent-rescue-recovery-race` queda **omitida** sin la proyección R2 congelada (`PLANB_RESCUE_R2_BASELINE`). Por tanto ya no están «observacionalmente rojas»; esa afirmación solo vale para su corte histórico.
- DOM **no repetido**: no se modificó superficie ni banco; la aceptación de 116 ya tiene 7 DOM.

**Cuatro estados del reclamo `importing` (vigente en R4)** — owner activo de la misma instancia (ocupado); **owner distinto con PID vivo** (rechazo sin tocar; caso 8 y caso 4 de PID ajeno); PID ausente con destino verificado no publicado (recuperación bajo exclusión, una importación); destino publicado o dudoso (consolidación o `IMPORT_AMBIGUOUS` con el reclamo intacto). R4 sustituye el reclamo de forma atómica (nunca ausente) y los errores de recuperación son de dominio. Detalle en el traspaso §5.

**Límites (sin cambios):** claves y datos ficticios; el `owner`/PID no son autenticación ni exclusión entre equipos o contenedores; sin protección frente a escritores que no cooperan; otro equipo no ensayado; sin HubSpot real ni DPAPI recuperado; disco lleno/corte de energía y enlaces simbólicos reales no acreditados; un hash no prueba autoría y la cápsula cifrada no es por sí sola una firma de origen. Procesos propios: workers e hijos del arnés terminados; sin servidores abiertos.

**Hashes (sha256) de las fuentes de R2 ensayadas**

| Ruta | sha256 |
| --- | --- |
| tests/helpers/rescue-capsule-followup-harness.ts | 71397031dc788e6ef80763f3226242787cc4b701f8d370dbafa474566c3aa577 |
| tests/helpers/rescue-capsule-followup-child.ts | 94fee3dbee769a8eaf1c55b8be58732422fc0dcbd40883e5ad1a85a1f715587d |
| tests/helpers/rescue-capsule-followup-parallel.mjs | 56a5a221b2e2786877742616a9d2a0295fbe5e0c126f4a7f56494521c394c29c |
| tests/rescue-capsule-followup-claims.test.ts | db898a592049fa4ce3aa9ccd4916551b6e51d0bab7477fd6223f9ee195518e70 |
| tests/rescue-capsule-followup-capture.test.ts | e2dac5da8dc503f1abc418a9f2773d74c901ded3989c2d3487786160fb17effb |
| tests/rescue-capsule-followup-isolation.test.ts | 430a1572cae909279a565393c7a8f297baf69dcd160451ad053c415cebc6b568 |
| coordination/plans/RESCUE-KIT-QA-136-HANDOFF.md | 6b365ee1c2befa561fcf0a397b1c0b12f4b17b54ff3989c395d479e9d30afbbc |
| coordination/reports/CLAUDE-RESCUE-KIT-QA-136-CHECKPOINT.md | ea437d79367cba92d22774857a90ff4385c951a74153f8838cbf6b7ddc9a53c5 |
| coordination/reports/CLAUDE-RESCUE-KIT-QA-136.md | (este informe; su hash figura en el tablón al presentar) |
| tests/e2e/rescue-capsule-followup.spec.ts | ausente (sin crear) |

Producto 116 R4 (sin cambios, coincide con el tablón): `server/rescue-capsule.ts 968e4db08a5a181f2bb14d4667bdf90eafb52d9d15e86783bc34797418334017`, `server/rescue-room.ts c87e7f57694d16e0619ba72854f75558be1364186e3ad429e44b5d9178d22210`, `server/rescue-room-journal.ts 1985262937a5b92863f7dd7c81eae08ca59c0cc66a1597fbd07680b175e9c010`, `shared/rescue-capsule.ts e96e50edfe5578cf00ca3d2dfd928ca67504bcc919c190ad687b1ae661b901f6`, harness de 116 `b0dcd75853a42fe361858b0cb46aa957725b013327bc981aeca9f555dbdcc938`.

---

*(Lo que sigue es el informe de la entrega del 2/11 sobre 116 R2, conservado como historia.)*

## 0. Qué pasó durante la unidad

Mientras trabajaba, Codex devolvió 116 a `working` (revisión independiente 138) por un defecto que esta QA **también había reproducido** (reclamo borrado tras publicar ⇒ segundo destino). Atendí primero ese dictamen **bajo la reserva de 116** (corrección, regresiones, mutantes y aclaraciones, ya presentada de nuevo: ver «R2» en `CLAUDE-RESCUE-KIT-116.md`). Las pruebas de QA-136 se ejecutaron **antes** (contra la versión entregada: evidencia del defecto) y **después** (contra la corregida: regresión). QA-136 no modifica ninguna ruta de 116.

## 1. Aclaración de la evidencia (Misión 1; texto completo en R2.5 del informe de 116)

- **«48/48»**: una pasada serial de los 6 ficheros dio **47/47** (`final-116b.log`); luego añadí un caso a `context` y repetí solo ese fichero (13/13, sin log). 48 = 47 + 1 de dos ejecuciones; **no fue una pasada única**. La corrección R2 sí tiene una pasada única: **54/54** (`fix-116.log`).
- **Captura 1440 px**: la afirmación correcta es la del mensaje de entrega: en la entrega abrí 3 de 4 (`kit-1440-destino`, `kit-390-inspeccion`, `kit-320-inspeccion`) y **no** `kit-1440-inspeccion`; el informe de 116 lo contradecía. Lo comprobé en el registro de la conversación. Abrí `kit-1440-inspeccion` **después, en R2**: es una inspección nueva y está datada así, no una reconstrucción de la entrega.

| Tipo | Qué |
| --- | --- |
| **Propios de esta unidad** | QA-136: 25 casos (claims 13, capture 9, isolation 3) en pasada serial única sobre la proyección `pqa` (`qa-final.log`: 25/25); dos ejecuciones simultáneas (25/25 y 25/25); reproducción de la interferencia; mutantes de R2 |
| **Propios de R2 (116)** | 54/54 serial único; 6 regresiones causales; 6/6 mutantes |
| **Repetidos (mismos casos, no suman)** | 106 (68), 115 (31), DOM 116/106/115 (7/9/10) sobre el código corregido |
| **Históricos (sin repetir)** | medidas de 10.000 registros; mutantes M1–M5 de 116 R1; la demo 4511 (no se usó) |

## 2. Aislamiento y reproducibilidad (Misión 2)

**Diseño.** `tests/helpers/rescue-capsule-followup-harness.ts` crea una raíz propia `<base>/rescue136-<uuid>/tests/.tmp` y hace `chdir` a ella **antes** de cargar el código de 116, que resuelve sus carpetas con `resolve('tests','.tmp')` ⇒ el código entregado se ensaya sin modificarlo. Ninguna prueba lista ni cuenta carpetas: cada destino, staging y reclamo se identifica por el **reclamo de su propia cápsula** (que registra el id de destino antes de publicar) y por los pasos del servicio. La limpieza solo retira **directorios vacíos** de la raíz propia y los ficheros de control que el arnés creó; nunca borra por patrón.

**Resultados**
- **Dos ejecuciones simultáneas** en raíces separadas (`--mode two`): 25/25 y 25/25, solape de 136 s, **cada una vio intacto su señuelo** (carpetas con nombre y marcador válidos, contenido ajeno) y **ninguna vio nada de la otra**. Registro: `par-two4`.
- **Reproducción de la interferencia de 116** (`--mode noise`, proyección propia): las dos pruebas de 116 que comparan el listado compartido pasan **2/2 sin ruido y 0/2 con ruido** (un proceso que crea y borra carpetas `rescue106-<uuid>` con marcador); las de QA-136, con la misma ruido en su base, **9/9**. Es una limitación de diseño de esas pruebas de 116, **demostrada**, no un defecto del producto. No cambié 116 por ello.
- Primera pasada paralela con ficheros de 116: 6 fallos; en serie, 0 (ya declarado en R1).

**Defectos del arnés encontrados y corregidos en el camino** (no son del producto): los ganchos `onStep` no se esperan (el trabajo debe ser síncrono antes del paso siguiente); una barrera sin plazo dejaba un hijo colgado si la prueba fallaba (ahora termina a los 90 s con código 87); mi primera limpieza podía tocar el marcador de un señuelo (cambiada a «solo vacíos»); un gancho sin desarmar contaminaba el reintento.

## 3. Importación, reclamos y caídas (Misión 3): clasificación

**R** = reproducido · **I** = inferido del código · **N** = no comprobado. «Antes» = versión entregada de 116; «Después» = R2.

| # | Punto | Clase | Antes | Después |
| --- | --- | --- | --- | --- |
| 1 | 3 procesos importan a la vez la misma cápsula (barrera) | R | 1 destino, reclamo `imported`, 2×`ALREADY_IMPORTED` | igual |
| 2 | Muerte antes de restaurar / tras restaurar / antes de publicar | R | reintento importa una vez; **staging huérfano** del intento muerto | igual; el barrido lo retira (pid muerto) |
| 2 | Muerte tras publicar / tras primer arranque, antes de confirmar | R | reintento ⇒ `ALREADY_IMPORTED`, reclamo consolidado `recovered`; el destino abre y conserva lo incierto | igual |
| 3 | **Fallo REAL al escribir la confirmación tras publicar** (reclamo en solo lectura ⇒ `EPERM`) | R | **reclamo borrado y reintento publica un SEGUNDO destino** (defecto) | `IMPORT_PUBLISHED_UNCONFIRMED`, reclamo conservado, ningún reintento duplica, consolida al poder escribir |
| 3b | Mismo fallo con una **carpeta** ocupando el reclamo | R | destino publicado + error crudo | `UNCONFIRMED`; luego `CLAIM_UNREADABLE`; sin duplicar |
| 4 | Reclamo ilegible | R | `ALREADY_IMPORTED`, sin tocarlo (ambigüedad: decisión humana) | igual |
| 4 | **PID vivo ajeno** a la importación | R | bloquea (identidad no comprobada) | igual (lado seguro) |
| 4 | PID ausente + carpeta «publicada» con marcador de OTRA revisión | R | se consolidaba a ciegas | `IMPORT_AMBIGUOUS`, reclamo intacto |
| 4 | PID ausente sin destino | R | libera y importa una vez | igual |
| 4 | **Carrera**: 2 hilos recuperan a la vez el mismo reclamo obsoleto | R | **2 destinos en 11 de 20 rondas** | 0 de 20 (hilos con PID distinto) |
| 4 | Dos instancias del módulo con el **mismo PID** | R (aplicabilidad limitada) | — | **[Histórico R2]** la segunda recuperaba como obsoleto el reclamo ACTIVO de la primera. **Vigente R4 (§0bis): rechazada con `ALREADY_IMPORTED`, sin tocar nada** |
| 4 | Reutilización de PID | I | un PID reutilizado se ve vivo ⇒ bloquea | igual |
| 4 | `destination` del reclamo con segmentos `..` | I | sondeo `existsSync` fuera de `tests/.tmp` | cerrado: `publication()` exige un UUID |
| 5 | **Barrido de staging vs importación ACTIVA** (hijo congelado en un paso) | R | vació el staging (4→1 ficheros) y la importación acabó en `ROOT_NO_MARKER` | no retira nada; la importación termina bien |
| 5 | Carpeta ajena parecida (nombre y marcador válidos) | R | **se retiraba** (sin comprobar propietario) | solo cae la de un importador **muerto** con marcador completo; sin pid, con pid vivo, `roomId` distinto o sin marcador se conservan; un fichero desconocido nunca se borra |
| 5 | En POSIX el barrido borraría ficheros abiertos | I | — | mitigado por el pid |
| 6 | Cápsula reemplazada entre inspección e importación (barrera en `import:start`) | R | `CONTENT_CHANGED`, sin destino, reclamo liberado | igual; reescritura idéntica = no cambia (control negativo) |
| 6 | Bytes alterados / **relleno del salt `==` alterado** | R | alterar el cuerpo ⇒ `DECRYPT_FAILED`; alterar el relleno se **acepta al leer** pero cambia el hash ⇒ `CONTENT_CHANGED` | igual |
| 7 | Mutación del escritor PROPIO en 3 fases de la captura | R | espera (se serializa, no hay reintento); cápsula de UNA versión | igual |
| 7 | Mutación propia tras capturar (durante el cifrado) | R | se aplica; cápsula del instante capturado; el origen ya difiere | igual |
| 7 | Cambio EXTERNO del simulador en 3 fases | R | detectado, reintento, cápsula con el estado final; si no cesa ⇒ `CAPTURE_UNSTABLE` sin publicar | igual |
| 7 | Cambio externo del simulador DESPUÉS de capturar | R | **no se detecta** (por diseño de instantánea) | igual |
| 7 | Otro escritor sobre la BASE (otra instancia de `Store`) | R | detectado por el digest lógico y reintentado | igual |
| — | Disco lleno, corte de energía | N | — | — |
| — | Enlaces simbólicos (no se pueden crear aquí) | N | — | — |

**Distinción pedida en el punto 7:** el escritor propio **se excluye** (la mutación espera), un escritor ajeno **no se puede excluir** y solo se **detecta** si cambia el contenido *durante* la lectura; un cambio posterior a la captura queda fuera de la cápsula y no se avisa.

## 4. Qué es producto y qué es arnés (sin atribuir de más)

- **Defectos de producto reproducidos** (corregidos en 116 R2): borrado de reclamo tras publicar; carrera de recuperación; barrido que destruye una importación activa o una carpeta ajena; consolidación a ciegas sobre cualquier carpeta con marcador.
- **[Histórico R2; corregido en R3/R4 con `owner`, ver §0bis] Artefacto del PID compartido (prueba 8)**: reproducido de forma determinista, pero solo ocurre con dos instancias del módulo en un proceso. No afecta a procesos distintos ni al servidor normal. **Importante:** la primera versión de la carrera de QA-136 (hilos con PID compartido) falló bajo carga por **este** artefacto y no por un defecto de la importación entre procesos; se corrigió dando a cada hilo el PID de un proceso ajeno vivo. La regresión «CARRERA» que añadí a 116 tiene la misma estructura y es **previsiblemente** sensible a la carga (inferido, no medido): ver §6.
- **Limitación de diseño de las pruebas de listado de 116** (interferencia del arnés): demostrada con ruido; sin cambios por estar 116 bajo revisión.

## 5. Procedencia causal de las regresiones de QA

Contra la versión entregada (`62886ac81e3134c0` / `727848a886f0a4d2`): las pruebas 3, 3b, 4, 5 y 6 **fallan** y 1, 2 y 7 pasan (`qa-prefix-run1.log`, 8 rondas). Contra R2: todas pasan (25/25). Las pruebas «1·», «2·», «7·» y las de captura documentan comportamiento correcto ya presente (no detectan un defecto de la entrega).

## 6. Pendiente / riesgos que dejo señalados *(2/11, sobre R2; el estado vigente está en §0bis)*

1. *[Resuelto: 116 R3/R4 añadieron el `owner`; R4 aceptada.]* **116 R2 está presentada y no la edito.** Si Codex la devuelve: añadir un `owner` (instancia) al reclamo, y rehacer la regresión «CARRERA» de `rescue-capsule-rehearsal.test.ts` con PIDs distintos (como hace QA-136) y comprobarla bajo carga.
2. *[Superado: sobre el corte actual esa prueba pasa; ver §0bis.]* `tests/independent-rescue-claim.test.ts` (Codex) ahora **falla a propósito** (era la observación del defecto): hay que invertirla o sustituirla.
3. Las pruebas de listado de 116 siguen sensibles al `tests/.tmp` compartido.
4. No se probó: disco lleno, corte de energía, enlaces simbólicos reales, otro sistema operativo, otro equipo, HubSpot, relaciones, datos reales, otros navegadores. Ver `RESCUE-KIT-QA-136-HANDOFF.md`.
5. `tests/e2e/rescue-capsule-followup.spec.ts` estaba reservado y **no se creó**: no encontré un caso de interfaz que no cubra ya el DOM de 116 (los mensajes nuevos de R2 se ven hoy como texto del error).

## 7. Comandos y evidencia

```bash
# QA-136 (serial; cada archivo crea su raíz propia bajo tests/.tmp/rescue136-<uuid>)
node --import tsx --test --test-concurrency=1 tests/rescue-capsule-followup-claims.test.ts tests/rescue-capsule-followup-capture.test.ts tests/rescue-capsule-followup-isolation.test.ts
# dos ejecuciones simultáneas en raíces separadas / reproducción de la interferencia de 116
node tests/helpers/rescue-capsule-followup-parallel.mjs --mode two   --out tests/.tmp/rescue136-par-<id>
node tests/helpers/rescue-capsule-followup-parallel.mjs --mode noise --out tests/.tmp/rescue136-par-<id>
```
Variables: `QA136_ROUNDS` (rondas de la carrera, 20 por defecto), `PLANB_QA136_BASE` (base de raíces). Evidencia en `tests/.tmp/rescue136-ev-16c77246-14b8-4bb9-8eac-4bcb61537d78/`: `claims-run1.log` (versión entregada), `qa-prefix-run1.log`, `qa-final.log`, `par-two4*`, `par-noise2*`, `fix-*.log`, `mutants2*`, `r2-prefix-run1.log`, `r2-fixed-run*.log`.

## 8. Hashes de las fuentes ensayadas (SHA-256, 16 hex)

Archivos de QA-136: 
```
906314b298478242  tests/helpers/rescue-capsule-followup-harness.ts
94fee3dbee769a8e  tests/helpers/rescue-capsule-followup-child.ts
56a5a221b2e27868  tests/helpers/rescue-capsule-followup-parallel.mjs
861c72c2b0f8bc6d  tests/rescue-capsule-followup-claims.test.ts
e2dac5da8dc503f1  tests/rescue-capsule-followup-capture.test.ts
430a1572cae90927  tests/rescue-capsule-followup-isolation.test.ts
81e4654efe7dd8bb  coordination/plans/RESCUE-KIT-QA-136-HANDOFF.md
```
Código de 116 ensayado (R2): `server/rescue-capsule.ts 4787016b9c635070`, `server/rescue-room.ts c87e7f57694d16e0`, `server/rescue-room-journal.ts 1985262937a5b928`, `shared/rescue-capsule.ts e96e50edfe5578cf`; harness de 116 `b0dcd75853a42fe3`. Versión entregada (antes de R2): `62886ac81e3134c0` / `727848a886f0a4d2`. Intactos: `crypto fe126b84878716d8`, `store 9d08d9cc06f8c4cf`, `recovery b56e5d7255d93d3e`, `instance f2271e6caf8bd72f`. Las proyecciones `pqa` y `pfix` son byte a byte iguales al árbol para los archivos de QA y para `rescue-capsule.ts`/`rescue-room.ts`.

## 9. Procesos y carpetas

Procesos propios (hijos con barrera, hilos, servidores de prueba de las pruebas DOM, un servidor Vite por compilación) terminados; un hijo de la ejecución contra la versión entregada quedó bloqueado por una prueba fallida y se liberó con su propio fichero de barrera. Se detuvieron dos tareas en segundo plano propias con `TaskStop`; **una orden para terminar procesos por patrón fue denegada** por el sistema y no la repetí. Residuos: carpetas vacías de las raíces de `par-two*` y la copia `pmut-M1` de R1 (bloqueada) dentro de las raíces de evidencia, que se conservan. No se tocaron la demo 4511 ni carpetas ajenas.
