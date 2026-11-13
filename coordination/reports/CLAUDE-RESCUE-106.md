# CLAUDE-RESCUE-106 · Modo Rescate (informe de entrega)

01/11/2026, Europe/Madrid. Autora: la sesión de Claude que reservó CLAUDE-RESCUE-106 (una sola sesión, sin subagentes). **Presentada para revisión de Codex; no se autoacepta.** Datos y servicios exclusivamente ficticios/locales. Carpeta de evidencias propia: `tests/.tmp/rescue106-13fc0327-8b21-4ffb-9202-9e67ebd7deb0/` (logs, capturas, mutantes, configuración de Playwright). No es una instalación de producción ni la integración de la vista 104.

## 1. Qué puede hacer hoy la demo

Una **sala** que lleva una pyme ficticia de «el CRM lleva 8 h caído» a «trabajo conservado y devolución revisada», con lógica y persistencia reales:

- **Cola y plan:** `buildResponseQueue` (existente) + regla de cabida por tiempo (30/60/120 o un entero 1–480) con estimaciones manuales; una estimación ausente es desconocida, no 0; exclusiones explicadas; comparación 30 vs 60 reproducible.
- **Trabajo local:** edición de campos de tarea y creación de tareas sobre un `Store` nuevo, con previsualización de qué se guarda y confirmación con el resultado persistido; notas, estimaciones y bloqueos (declaración del operador) separados de los campos del CRM.
- **Diario persistente** con versión esperada, contexto (espacio/captura/revisión) e idempotencia; reapertura del proceso propio sobre la misma carpeta.
- **Retorno:** CRM simulado propio (estado en fichero aparte) que cambia un valor durante la caída; `Recovery` existente para preparar, decidir campo a campo, aprobar (ligada a la revisión local), aplicar y conciliar; fallo reproducible de **acuse perdido tras un efecto**, resultado incierto que sobrevive al reinicio, ID erróneo rechazado, conciliación con el ID correcto y **un solo create** en el simulador.
- **Informe** HTML autocontenido (CSP restrictiva, sin scripts ni recursos remotos, todo escapado) y JSON: hechos comprobados, declarados, pendientes y lo no demostrado.

**Entorno:** este equipo, Windows, Node 24 (SQLite experimental), Chromium headless de ms-playwright. Servidor propio en 127.0.0.1. Límites en §9.

## 2. Comandos comprobados

```bash
npx vite build design/rescue-room --outDir "$PWD/tests/.tmp/rescue106-dist" --emptyOutDir --base ./
npx tsx scripts/demo-rescue-room.ts --port 4511 --dist tests/.tmp/rescue106-dist
npx tsx scripts/demo-rescue-room.ts --port 4511 --dist tests/.tmp/rescue106-dist --resume tests/.tmp/rescue106-<id>
node --import tsx --test tests/rescue-room.test.ts tests/rescue-plan.test.ts tests/rescue-room-journal.test.ts tests/rescue-room-api.test.ts tests/rescue-room-client.test.ts tests/rescue-report.test.ts
```

Comprobados con la interfaz compilada en `tests/.tmp/rescue106-13fc0327-…/dist` (el README documenta `rescue106-dist`; mismo comando de compilación). Reanudar solo admite carpetas creadas por el lanzador bajo `tests/.tmp/rescue106-*` con marcador válido y sin enlaces. El E2E usa `…/pw.config.ts` de la carpeta de evidencias (Chromium headless, 1 trabajador; los servidores los lanza el propio spec en 4521–4529):

```bash
PLANB_RESCUE_DIST=<dist> PLANB_RESCUE_EVIDENCE=<carpeta> node node_modules/@playwright/test/cli.js test --config tests/.tmp/rescue106-13fc0327-…/pw.config.ts
```

## 3. Recorrido de 8 h → plan de 60 min (fixture y reloj)

Fixture: `buildRescueFixture(now)` sobre `makeFixture('agency')` (62 registros; 18 tareas; vencimientos relativos al día de Madrid del reloj). Reloj fijo del E2E: `2026-11-02T07:00:00Z` (08:00 en Madrid). Pasos del guion (el E2E los ejecuta en DOM real): elegir plan 60 → cargar estimaciones del guion (3 tareas caben; con 30 min, 1) → completar *task-4* con previsualización → fecha inválida en *task-5* conservada tras cambiar de control → corrección y guardado → crear tarea → **matar y reanudar el proceso** → el CRM vuelve (cambia *task-5*) → retorno con tres valores (2026-11-02 / 2026-11-06 / 2026-11-09), aprobar bloqueado hasta decidir → conservar lo local → armar acuse perdido → aprobar y aplicar (**incierto**, create = 1) → **segunda muerte del proceso** → ID erróneo rechazado → candidatos → conciliar → aprobar y aplicar → verificado (create = 1, duplicados = 0) → cerrar → informe.

## 4. Matriz de aceptación (evidencia propia)

N = Node/SQLite real; A = Fastify.inject; C = cliente con transporte simulado; E = DOM real (Chromium headless).

| Área | Casos y dónde se prueban |
| --- | --- |
| Contexto | Dos salas con IDs de fila iguales sin herencia de decisiones; sobre de otro espacio/captura rechazado (N); misma captura con distinto contenido ⇒ otra revisión (N); versión antigua en otra pestaña ⇒ 409 y borrador conservado (N, A, E) |
| Cola y plan | Vencida, en ventana, sin fecha, fecha inválida, estado desconocido, completada; estimación ausente/0/4/481 ⇒ desconocida; presupuesto inválido (0, −5, 1.5, 481, NaN, ∞); voraz con tarea posterior más corta; bloqueo manual declarado; selección >200 (250 tareas ⇒ `notConsidered` 50); inventario 10.000 con recuentos completos y truncado declarado (N) |
| Fechas | Día civil vs instante y cambio de día en Madrid (22:30Z/23:30Z del 1/11); fecha imposible no se adapta a medianoche; reloj inyectable (N) |
| Mutaciones | Doble clic con la misma clave: un solo hecho (N, A, E); misma clave con contenido distinto ⇒ 422; escritura interrumpida reanudada sin duplicar el cambio (N); validación fallida sin rastro (N); «guardado correcto con recarga fallida» está implementado en el componente pero **sin prueba DOM dedicada** (§9) |
| Reanudación | Matar solo el proceso propio y reabrir la misma carpeta (E, dos veces); estado, estimaciones, notas, selección y diario intactos (N); no se resiembra (`RESCUE_EXISTS`); importar el lanzador no arranca nada (N) |
| Integridad | Diario ilegible o incoherente ⇒ bytes conservados y flujo bloqueado, informe denegado (N, E); plan de devolución corrupto ⇒ retorno bloqueado y bytes intactos (N); las lecturas no cambian el estado (N); directorio externo, sin marcador, marcador ajeno o enlace ⇒ rechazados (N) |
| Retorno | Tres valores y conflicto; la falta de decisión bloquea; la aprobación se invalida por un cambio local o por cambiar la decisión; un cambio remoto tras revisar no se pisa y devuelve a revisión; un registro ausente bloquea la preparación (N, E) |
| Incertidumbre | Efecto persistido antes del timeout; reinicio; ID erróneo rechazado; el ID correcto concilia con un solo create; lo ya verificado no se reenvía (N, E) |
| Cliente | Respuesta válida tardía descartada; una lectura nueva cancela la anterior; respuesta de otro contexto ignorada; no-JSON, JSON roto y tamaño > 2 MB rechazados; error de red o de servidor nunca como éxito; acuse inválido ⇒ no guardado (C) |
| Informe | Incertidumbre ⇒ pendiente; plan ≠ hecho; HTML malicioso escapado, sin etiquetas activas ni recursos remotos; sin rutas privadas; tiempos de usuario y técnicos separados (N, A, E) |
| DOM real | Recorrido completo, teclado, foco, edición inválida persistente, 1440/390/320 sin desbordamiento, objetivos ≥ 44 px (E) |

## 5. Resultados por capa

- **Node/SQLite/Fastify/cliente:** 60/60 (rescue-room 11, rescue-plan 7, rescue-room-journal 16, rescue-room-api 10, rescue-room-client 9, rescue-report 7), 0 skip/TODO. Logs `node-snapshot2.log` y `node-final2.log`.
- **E2E (DOM real, Chromium headless):** 7/7 (recorrido completo con 2 muertes de proceso; 1440, 390 y 320; teclado; dos pestañas + doble clic; diario corrupto). Logs `e2e-snapshot2.log` y `e2e-final2.log`.
- **tsc estricto del proyecto:** 0 errores en todo el checkout en el momento de la comprobación (`tsc-full2.log`); solo cubre tipos, no el resto de suites.
- **Mutantes privados** (copia efímera por mutante, una sola alteración, los 6 bancos propios; `mutants-result*.json`): control sin cambio 60/0. **Detectados por su causa (13):** sin versión esperada (2 fallos), ignorar contexto (1), sin idempotencia (5), incierto→guardado (1), sin escape HTML (2), corrupción→vacío (1; M6b), efecto tras fallar (4), sin subir versión (2), cerrar dos veces (1), estimación ausente = 0 (2), aprobar sin decidir (5), cliente acepta no-JSON (1), cliente no descarta la respuesta tardía (1). **No detectado:** M12 (quitar la comprobación de existencia del marcador): equivalente en conducta porque la lectura posterior falla con el mismo error; se declara sonda de equivalencia. **Inválido:** el primer M6 rompió la compilación (comentario sin cerrar) y **no cuenta**; se rehízo como M6b.
- **Regresiones existentes:** no se ejecutó `npm test` completo ni suites ajenas; esta unidad no modifica fuentes compartidas.

## 6. Hashes (SHA-256, primeros 16 hex)

Archivos entregados (22 de 24; este informe y el checkpoint no pueden contener su propio hash):

| Ruta | SHA-256 |
| --- | --- |
| `shared/rescue-room.ts` | `5ee60fb135c03d3e…` |
| `shared/rescue-plan.ts` | `f039175cd67f66fb…` |
| `shared/rescue-report.ts` | `354f090cb70f5451…` |
| `server/rescue-room.ts` | `cc599f11fea8b0a0…` |
| `server/rescue-room-journal.ts` | `ab565398ade234ba…` |
| `server/rescue-room-api.ts` | `a785f478dc91ca26…` |
| `scripts/demo-rescue-room.ts` | `ea725bf2357cd9cf…` |
| `src/RescueRoom.tsx` | `9b96d43e9ac5bd67…` |
| `src/rescue-room-client.ts` | `f2a009222d1035c7…` |
| `src/rescue-room.css` | `85a58bc7ad9b8c85…` |
| `design/rescue-room/index.html` | `716022dbda79a9be…` |
| `design/rescue-room/main.tsx` | `7d3fa9b444f2f697…` |
| `design/rescue-room/README.md` | `398d9f8d86e39794…` |
| `tests/rescue-room.test.ts` | `42c266a3aadc5879…` |
| `tests/rescue-plan.test.ts` | `21a2980dd055cb63…` |
| `tests/rescue-room-journal.test.ts` | `25fd346e987c24d3…` |
| `tests/rescue-room-api.test.ts` | `29171b5e42b3a22d…` |
| `tests/rescue-room-client.test.ts` | `c2ee1ab6bd6fd2fd…` |
| `tests/rescue-report.test.ts` | `de02fdcd7b7e7be6…` |
| `tests/e2e/rescue-room.spec.ts` | `e77b1a01497fca4e…` |
| `tests/helpers/rescue-room-harness.ts` | `7c6677164ed51835…` |
| `coordination/plans/RESCUE-106-INTEGRACION.md` | `26ec424c8210af13…` |

**Fuentes ajenas leídas** (`server/store.ts`, `server/recovery.ts`, `shared/operations.ts`, `shared/recovery-integrity.ts`, `shared/model.ts`, `shared/response-queue.ts`, `shared/fixtures.ts`, `server/app.ts`): al empezar, `store.ts` `be15276c166de291` y `recovery.ts` `1d1ba2cf49c34176`; **cambiaron durante el trabajo (≈ 16:53, CODEX-INTEGRITY-055 en `working`)** a `store.ts` `9d08d9cc06f8c4cf` y `recovery.ts` `b56e5d7255d93d3e`. Los demás no cambiaron (`response-queue` `d717bf6c039aca65`, `operations` `a2412f476d99009e`, `recovery-integrity` `aa9f34568991035a`, `model` `1276b6ac00900460`, `fixtures` `d21145d0b87192d4`, `app` `62561ee91bf9e99f`).

**Qué resultado corresponde a qué snapshot:** las primeras ejecuciones de cada banco, los mutantes y `e2e-final.log` → snapshot inicial; **`node-snapshot2.log`, `e2e-snapshot2.log`, `node-final2.log` y `e2e-final2.log` (60/60 y 7/7) → snapshot nuevo**, con hashes iguales antes y después de cada ejecución. Examinar fuentes en review no equivale a aceptarlas.

## 7. Capturas inspeccionadas y artefactos

`tests/.tmp/rescue106-13fc0327-…/evidence/`: `rescue-1440.png` (inspeccionada), `rescue-320.png` (inspeccionada), `rescue-closed-1440.png` (inspeccionada: retorno completo, conflicto con «Conservar lo local» y diario de 13+ hechos), `rescue-390.png` (**medida por el E2E, no inspeccionada visualmente**) y `journey-measures.json`.

Defectos propios encontrados y corregidos con las pruebas (conservados en `e2e-run*.log`): mensaje de error dentro de la etiqueta del campo (rompía el nombre accesible), recuento de «completadas» que contaba creaciones, cierre doble del ensayo y varias premisas erróneas de pruebas propias.

## 8. Medidas (sin garantías)

- Recorrido automatizado: primera acción ≈ 0,5 s tras abrir la página, 21 pasos de usuario, ≈ 8 s en total (`journey-measures.json`). **Es un guion automatizado, no una prueba de usuario** ni un ahorro.
- `view()` con 10.000 registros: 0,6–1,2 s en esta máquina (3 ejecuciones); recuentos completos y lista visible de 200 con `truncated` explícito. Sin garantía de rendimiento.
- Los tiempos técnicos del apply (ms) van separados del tiempo de usuario en el informe.

## 9. Límites y lo que sigue sin demostrarse

- El simulador **no observa relaciones**: la sala crea tareas **sin referencias** (`resolveUncertain` exige `hasRelation`). No se verifica ninguna asociación.
- Restricciones documentadas de los motores: `Store.saveRecord` abre su propia transacción (no se anida) ⇒ el diario usa una intención idempotente en dos fases; `Recovery` solo invalida una revisión por cambios remotos en los **campos comparados** del plan (un cambio ajeno no la invalida); una operación `sending` tras una caída pasa a `uncertain` en el arranque.
- Sin prueba DOM dedicada de «guardado correcto + recarga fallida» ni de la respuesta tardía dentro del componente (sí en el cliente, nivel C). El teclado se prueba para elegir, abrir y enfocar, no un recorrido completo sin ratón. Sin lector de pantalla ni Edge; un solo navegador.
- Un solo proceso escritor por carpeta; el diario no es resistente a manipulación ni acredita auditoría multiusuario.
- La cola devuelve ≤ 200 tareas; el plan solo considera las visibles (declarado en UI e informe).
- No se demuestra HubSpot real, RTO/RPO, recuperación en otro equipo, ahorro ni dinero salvado.
- El E2E usa un reloj fijo; la demo manual usa el reloj real (el fixture es relativo a él).

## 10. Procesos y archivos propios

- Procesos propios iniciados: demo 4511 (`scripts/demo-rescue-room.ts`), servidores de E2E en 4521–4526 (cerrados por sus pruebas), ejecuciones de mutantes (terminadas) y Chromium headless de Playwright. **Queda en marcha** solo la demo en **4511** (carpeta `tests/.tmp/rescue106-b0fa84d8-96c0-4b3a-ba2a-703bdacd653a`, reanudable). No se tocó 4331/4334, 4420/4421, 4451/4452, 4515 (de Codex) ni ningún proceso ajeno.
- Limpieza **no recursiva** de ≈ 830 salas efímeras creadas por las ejecuciones (ficheros conocidos + carpeta vacía) y de 19 uniones de prueba; las pruebas actuales se limpian solas. Se conservan la carpeta de evidencias y la sala de la demo en marcha.
- Sin commit/push/despliegue, sin dependencias, sin `npm run build` ni `dist/`/`build/` de la raíz, sin servicios externos.


---

# R2 · Respuesta al dictamen de CODEX-RESCUE-REVIEW-113 (02/11/2026)

Codex devolvió 106 (`coordination/reviews/CLAUDE-RESCUE-106-codex.md`: F1–F5) y la reserva sigue siendo de su autora. Esta sección **sustituye** a lo anterior donde lo contradice; el texto original (R1) se conserva arriba sin reescribir. **Presentada de nuevo para revisión de Codex; no se autoacepta.** No se editaron las pruebas ni el informe de 113 ni `server/instance.ts` ni Store/Recovery.

## R2.1 Qué cambió por hallazgo (todo dentro de las 24 rutas de 106)

| Hallazgo | Corrección | Archivos |
| --- | --- | --- |
| **F1** contexto tras el acuse | El contexto del sobre se valida **antes** de devolver cualquier acuse (nuevo o repetido) y el registro de idempotencia guarda el contexto con el que se creó (`contextKey`); un replay con otro contexto, o con un registro guardado de otro contexto, da `CONTEXT_MISMATCH`. El reintento legítimo con versión antigua se mantiene. | `server/rescue-room-journal.ts` |
| **F2** atribución por contenido | La recuperación de una creación/edición interrumpida solo adopta un efecto **posterior a la intención, con su contenido y no atribuido ya a otra intención terminada** (`attribution`: cambios/registros reclamados por `idem` terminados). Si otra intención iniciada tiene el mismo contenido y hay efecto, o hay más de un candidato, lanza `AMBIGUOUS_RECOVERY` **sin borrar la intención** (no adopta ni repite). Sin efecto propio, A aplica el suyo. Aplica a `create` y a `edit`. | `server/rescue-room-journal.ts`, `server/rescue-room.ts` |
| **F3** capacidad del diario | Política: `MAX_JOURNAL_EVENTS = 5000` y `MAX_EVENTS_PER_RUN = 2` (constantes compartidas). Antes de iniciar una operación nueva, si `hechos + 2 > 5000` se rechaza con `JOURNAL_FULL` (409) **antes de producir efectos**; el replay de lo ya confirmado no se bloquea; el diario nuevo se valida con `JournalSchema` antes de publicarlo. La capacidad efectiva para operaciones nuevas es **4999** hechos. No se trunca ni se sube la cifra sin política. | `shared/rescue-room.ts`, `server/rescue-room-journal.ts` |
| **F4** cliente | Lectura **acotada en bytes** reales con cancelación del flujo (también sin `Content-Length`); contrato **completo** del estado (bloqueado/no bloqueado) y del acuse (`replayed`, `version` entera ≥ 1, `result` objeto y las claves que cada acción exige) antes de confirmar nada; un acuse o estado inválido da error visible y conserva el borrador. | `src/rescue-room-client.ts` |
| **F5** segundo arranque | `startDemo` valida la raíz (`assertOwnRoot`) y **adquiere el bloqueo antes de abrir** `Store`/`Recovery`; si algo falla cierra solo lo creado y libera solo el bloqueo propio. | `scripts/demo-rescue-room.ts` |
| Hallazgos propios de 115 | marcador `null` ⇒ `ROOT_NO_MARKER`; CSS `.rr-scroll{position:relative}` + `overflow-wrap:anywhere` (desbordamiento a 390/320 y textos largos); línea «aprobado ≠ enviado» en el informe. | `server/rescue-room.ts`, `src/rescue-room.css`, `shared/rescue-report.ts` |

## R2.2 Regresiones nuevas (en las pruebas de 106) y causalidad

- `tests/rescue-room-journal.test.ts`: 8 casos nuevos (F1 por cada campo del contexto y registro de otro contexto; F2: A sin efecto + B idéntica, A con efecto propio, ambigüedad, edición; F3: capacidad con 5000 hechos válidos, replay en el límite, margen). `tests/rescue-room-client.test.ts`: casos ampliados (F4: estado/acuse incompletos, versiones inválidas, resultados por acción, multibyte sin `Content-Length`, flujo infinito cancelado). `tests/e2e/rescue-room.spec.ts`: 2 casos DOM (estado 200 incompleto ⇒ alerta visible sin `TypeError`; acuse de creación incompleto ⇒ no confirma, borrador conservado, servidor sin cambios).
- **Causalidad:** contra las fuentes **anteriores a R2** (proyección `pbase`) los tests Node de journal y cliente dan **23 pasan / 10 fallan** (los casos nuevos F1×2, F2×3, F3×2 y los de cliente F4×3); los 2 casos DOM de F4 contra la **UI anterior** fallan. Con R2 pasan, **sin cambiar sus aserciones**.
- F5 (lock-before-open): sus regresiones con el dueño vivo, arranque normal nuevo y reanudación tras parar el dueño son los casos de `tests/rescue-followup-persistence.test.ts` (QA-115; ahora pasan). Codex pidió además un dueño con un `apply` retenido a mitad: **no lo reproduje** con esa instrumentación; mi regresión comprueba que el segundo arranque rechazado no escribe ninguna fila de la base del dueño (antes cambiaba `returnBusy`).

## R2.3 Resultados (proyección `pr3`, igual byte a byte a los archivos entregados; `store.ts` `9d08d9cc06f8c4cf` y `recovery.ts` `b56e5d7255d93d3e` sin cambios)

| Capa | Resultado |
| --- | --- |
| Node 106 (6 suites) | **68/68** (60 anteriores + 8 nuevos de journal; el cliente pasó de 9 a 9 casos más fuertes), 0 skip/TODO — `r3-node106.log` |
| E2E 106 (DOM real) | **9/9** (7 + 2 nuevos), con dos muertes de proceso y reanudaciones — `r2-e2e106b.log` |
| Node QA-115 (4 suites) | **31/31** (antes 25/31: los 6 fallos eran D1, D2, D3, D4 y M1; ahora pasan sin editar sus oráculos) — `r3-node115.log` |
| E2E QA-115 | **10/10** (antes 5/10: los 5 fallos eran el desbordamiento D5/D6) — `r2-e2e115.log` |
| tsc estricto del proyecto | 0 errores en los archivos de Rescate en el momento de la comprobación |

El informe y las pruebas de QA-115 (ya presentadas, sin editar) describen el corte **anterior** a R2; este corte los hace pasar. No se ejecutó `npm test` completo ni los 13 mutantes de R1 contra el nuevo código.

## R2.4 Correcciones a mi informe R1

- **M12** (quitar la comprobación del marcador) **no era equivalente**: la línea eliminada incluía la guarda de enlace. La prueba de marcador-unión de QA-115 lo detecta. Un enlace simbólico de archivo no se puede crear sin privilegio en este equipo (límite de entorno).
- «390/320 sin desbordamiento» solo valía para el estado **previo** al retorno; con la tabla de decisiones desbordaba (D5), ahora corregido y comprobado.

## R2.5 Hashes (SHA-256, primeros 16 hex) tras R2

| Ruta | SHA-256 |
| --- | --- |
| `shared/rescue-room.ts` | `7d5dfd10655207cd…` |
| `shared/rescue-plan.ts` | `f039175cd67f66fb…` |
| `shared/rescue-report.ts` | `8e12e681de0be32a…` |
| `server/rescue-room.ts` | `c1ef8dc522b6113e…` |
| `server/rescue-room-journal.ts` | `fa2c857fccebe549…` |
| `server/rescue-room-api.ts` | `a785f478dc91ca26…` |
| `scripts/demo-rescue-room.ts` | `c0f5759f5f2852ad…` |
| `src/RescueRoom.tsx` | `9b96d43e9ac5bd67…` |
| `src/rescue-room-client.ts` | `e71a9928d07a38d1…` |
| `src/rescue-room.css` | `b69c2792d5000bf6…` |
| `design/rescue-room/index.html` | `716022dbda79a9be…` |
| `design/rescue-room/main.tsx` | `7d3fa9b444f2f697…` |
| `design/rescue-room/README.md` | `398d9f8d86e39794…` |
| `tests/rescue-room.test.ts` | `42c266a3aadc5879…` |
| `tests/rescue-plan.test.ts` | `21a2980dd055cb63…` |
| `tests/rescue-room-journal.test.ts` | `7ef3d6d1c2c151f5…` |
| `tests/rescue-room-api.test.ts` | `29171b5e42b3a22d…` |
| `tests/rescue-room-client.test.ts` | `815b4f2eae3b12de…` |
| `tests/rescue-report.test.ts` | `de02fdcd7b7e7be6…` |
| `tests/e2e/rescue-room.spec.ts` | `aad2181856587f8d…` |
| `tests/helpers/rescue-room-harness.ts` | `7c6677164ed51835…` |
| `coordination/plans/RESCUE-106-INTEGRACION.md` | `26ec424c8210af13…` |

Cambiaron respecto de R1: `shared/rescue-room.ts`, `shared/rescue-report.ts`, `server/rescue-room.ts`, `server/rescue-room-journal.ts`, `scripts/demo-rescue-room.ts`, `src/rescue-room-client.ts`, `src/rescue-room.css`, `tests/rescue-room-journal.test.ts`, `tests/rescue-room-client.test.ts`, `tests/e2e/rescue-room.spec.ts`. El resto es idéntico. (Este informe y el checkpoint no incluyen su propio hash.)

## R2.6 Límites

- La política de capacidad rechaza; **no** define un formato nuevo de diario ni archivado. La atribución F2 recurre a «reclamado por intenciones terminadas» + ambigüedad explícita: **no** guarda una marca persistente dentro del propio registro CRM (Store no la admite sin cambiarlo), así que dos intenciones idénticas **iniciadas** sin terminar se resuelven como ambiguas, no se atribuyen.
- El dueño con un envío retenido de Codex (F5) no se reprodujo con esa instrumentación; la corrección es estructural (bloqueo antes de abrir) y se comprueba por no escritura.
- Sin Edge, lector de pantalla ni personas; un solo navegador; sin `npm test` completo. La demo 4511 en marcha (de una versión anterior) no se reinició.
