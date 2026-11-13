# CLAUDE-RESCUE-QA-115 · Evidencia complementaria de Modo Rescate 106

02/11/2026, Europe/Madrid. Autora: la misma sesión que construyó CLAUDE-RESCUE-106, por lo que esto es **ampliación de QA propia, no revisión independiente** (la revisión independiente es de Codex). Una sola sesión, sin subagentes. **Presentada; no se autoacepta.** No se editó ninguna fuente de 106 ni de otros agentes; las correcciones citadas se probaron **solo en proyecciones privadas**.

**Estado de la revisión 113:** `coordination/reviews/CLAUDE-RESCUE-106-codex.md` **no existe** al terminar (el tablón mostraba `CODEX-RESCUE-REVIEW-113` en `working`, sin dictamen). No se afirma que haya terminado. Las dos hipótesis atribuidas a 113 (replay que se salta el contexto; creación interrumpida confundida con otra idéntica) se contrastaron aquí **con reproducciones propias**; si 113 aporta las suyas, esas prevalecen y estas quedan como variantes.

## 1. Congelado y atribución (A1)

Proyección coherente `p1` (copia de `server/shared/src/scripts/design` + pruebas de Rescate) en `tests/.tmp/rescue115-bcb1b367-65d3-4188-ab40-4135f06ccaf8/`, con `manifest.json` de hashes. **Las 22 fuentes/pruebas de 106 no cambiaron** respecto de su informe. `server/store.ts` `9d08d9cc06f8c4cf` y `server/recovery.ts` `b56e5d7255d93d3e` son las del «snapshot nuevo» de 106 (cambiaron en su día por CODEX-INTEGRITY-055); **no cambiaron durante 115** (diferencias entre `p1` y `pfinal3`: 0). Imports efectivos: `server/crypto.ts` `fe126b84878716d8`, `server/instance.ts` `f2271e6caf8bd72f`, `shared/model.ts` `1276b6ac00900460`, `shared/operations.ts` `a2412f476d99009e`, `shared/recovery-integrity.ts` `aa9f34568991035a`, `shared/response-queue.ts` `d717bf6c039aca65`, `shared/fixtures.ts` `d21145d0b87192d4`, `server/app.ts` `62561ee91bf9e99f`.

**Repetición de las suites Node de 106:** `p1` → **60/60**; `pfinal3` (corte final) → **60/60** (0 skip/TODO). El número sigue siendo 60. Un `tsc` limpio del proyecto no sustituye esta regresión funcional, y no se ejecutó `npm test` completo.

Capas separadas: **resultados del autor (106):** 60 Node + 7 E2E + mutantes; **repetición actual:** 60 Node; **casos nuevos (115):** 31 Node + 10 E2E.

## 2. Matriz y resultados

Cada fila: oráculo observable (sin buscar cadenas en el código). Los casos «DEFECTO ·» **afirman el comportamiento correcto** y por tanto fallan mientras el defecto exista (no TODO/skip). Control positivo: con una corrección **privada** (proyección `pfix`) esos mismos casos pasan (§4).

### Node (SQLite real, Fastify, procesos reales) — 31 casos: **25 pasan, 6 fallan**

| Archivo | Casos | Resultado |
| --- | --- | --- |
| `rescue-followup-context.test.ts` | idempotencia vs autorización de contexto; acuse repetido lleva su versión; clave ligada a ruta y contenido; revisión depende del contenido y contexto forjado rechazado; salas con IDs iguales no comparten decisiones; aprobación/orden de otro plan rechazadas | 6 pasan, **2 fallan** (D1) |
| `rescue-followup-persistence.test.ts` | reapertura en **proceso nuevo** (digest de registros, cambios, estado, diario, idempotencia, plan y CRM simulado idéntico; 2 aperturas no reescriben); intención con efecto se reanuda sin duplicar; control de ediciones idénticas; un escritor | 5 pasan, **2 fallan** (D2, D3) |
| `rescue-followup-paths.test.ts` | marcador malformado/vacío/enorme/array/número/cadena; roomId incorrecto, tipo/formato ajenos, `..`/barras; ubicación, anidadas, prefijo parecido; `open` rechaza sin crear nada; uniones como raíz y como marcador | 7 pasan, **1 falla** (D4) |
| `rescue-followup-scale.test.ts` | primera tarea estimada viable tras la posición 200 (no se considera, se declara); 10.000 registros: recuentos completos y plan no global; informe: truncado, creadas/completadas, estimaciones declaradas, inciertas vs verificadas, cierre no recupera negocio | 7 pasan, **1 falla** (M1) |

### DOM real (Chromium headless limpio de Playwright) — 10 casos: **5 pasan, 5 fallan**

| Caso | Resultado |
| --- | --- |
| Guardado confirmado + recarga fallida (POST real pasa; solo falla el GET posterior): la UI lo distingue, 1 único POST y 1 único cambio en Store, el borrador nuevo se conserva, una acción sin refrescar da conflicto sin perder el borrador y tras actualizar no hay segundo POST | **pasa** |
| Lectura retenida (respuesta válida real y antigua; también con transporte que **ignora AbortSignal**): sin interacción posible que la compita, la ficha/versión finales son las actuales y el borrador sobrevive a la recarga completa | **pasa** (×2) — ver límite L2 |
| Teclado completo sin ratón: plan, estimaciones, selección (foco al encabezado), fecha inválida (`aria-invalid` + `aria-describedby` al error, texto conservado), corrección, previsualizar, guardar, crear tarea, CRM vuelve, retorno, decisión con grupo nombrado, acuse perdido, ID erróneo (**foco a la alerta**), candidatos, conciliar, aprobar, aplicar, cerrar y **descarga por Enter** | **pasa** (1 create, 0 duplicados) |
| Capturas 1440 px del estado más exigente (conflicto + incierto): sin desbordamiento, objetivos ≥ 44 px, foco visible | **pasa** |
| Capturas 390 y 320 px del mismo estado | **fallan** (D5): `scrollWidth` 490 > 390/320 |
| Asunto de 300 caracteres sin espacios y error de servidor de 1400 caracteres, a 1440/390/320 | **fallan** (D6) |

## 3. Defectos y mejoras (confirmados con reproducción; todos son de 106 y los corrige su autora bajo su reserva)

- **D1 · Replay sin autorización de contexto** (`server/rescue-room-journal.ts`, `runLocked`): si la clave ya tiene un acuse guardado y el contenido coincide, devuelve ese acuse **antes** de comprobar el contexto; un sobre con otra revisión de captura u otro `workspaceId` obtiene el éxito (`rescue-followup-context` ×2). Reproduce la hipótesis de 113 sobre «replay». Corrección propuesta: comprobar `sameContext` antes del replay (con ella ambos casos pasan, §4).
- **D2 · Una creación interrumpida puede adoptar el efecto de otra intención idéntica** (`server/rescue-room.ts`, `createTask`/`editTask`, rama `resume`): la búsqueda `changes.find(id > baseChangeId && mismo contenido)` no distingue de qué intención procede el cambio; una intención A **sin efecto** queda «recuperada» por el cambio de otra intención B y se pierde su efecto (1 tarea donde hay dos intenciones). Reproduce la hipótesis de 113 sobre «creación interrumpida». Corrección: correlacionar el efecto con la intención (marca persistida en la propia operación) o rechazar la ambigüedad. No se probó una corrección.
- **D3 · Un segundo proceso escribe en la raíz ANTES de fallar por el bloqueo** (`scripts/demo-rescue-room.ts`, `startDemo`: `RescueRoom.open` antes de `lockInstance`): el intento rechazado ya ha ejecutado `Store`/`Recovery`, que reescribieron `returnBusy` en la base de la sala viva (filas crudas distintas). Riesgo: normalización de un plan `sending → uncertain` mientras el escritor original aplica. Corrección: validar la raíz y adquirir el bloqueo antes de abrir (con ella pasa, §4). Dueño exacto: `scripts/demo-rescue-room.ts` (106); `lockInstance` es de `server/instance.ts` (ajeno, sin cambios).
- **D4 · Marcador con JSON `null`** (`server/rescue-room.ts`, `assertOwnRoot`): lanza `TypeError` sin controlar en vez de `ROOT_NO_MARKER`. Menor.
- **D5 · Desbordamiento horizontal a 390/320 en el retorno**: la leyenda `.rr-sr` (posición absoluta) del grupo de decisión queda dentro de `.rr-scroll`, que no es contenedor de posicionamiento, y ensancha la página (490 px a 390). Los E2E de 106 a 390/320 solo medían el estado **previo** al retorno. Corrección CSS: `.rr-scroll { position: relative }` (con ella pasa, §4).
- **D6 · Textos largos sin salto** (`src/rescue-room.css`): un asunto de 300 caracteres o un error de servidor largo desbordan el diario, la lista del plan y la alerta (la página llegó a ~9000 px). Corrección: `overflow-wrap: anywhere` (con ella pasa, §4).
- **M1 · Mejora (no defecto)**: el informe no refleja que el plan está **aprobado**; solo dice «0 de 3 verificadas». No afirma nada falso, pero el brief pide separar aprobado/enviado.
- **Corrección a mi informe 106 (M12):** clasifiqué el mutante «sin comprobación de existencia del marcador» como **equivalente**. **Era un error**: la línea eliminada también contenía la **guarda de enlace**. Con la prueba nueva de «marcador = unión a un directorio» el mutante se **detecta** (proyección `pm12`, por el mensaje «no tiene el marcador del lanzador»). La parte que sí se comporta igual es solo «marcador ausente». Lo que no se pudo ejercitar: un enlace **simbólico de archivo** válido (EPERM sin privilegio en este equipo), así que el caso «éxito indebido a través de un enlace real» no se prueba aquí (límite de entorno declarado en el test).

## 4. Controles positivos de las pruebas (correcciones privadas, no entregadas)

Proyección `pfix` con 4 parches mínimos (comprobar contexto antes del replay; adquirir bloqueo antes de abrir; `marker` nulo → `ROOT_NO_MARKER`; CSS `position` + `overflow-wrap`): `context` + `paths` **16/16**, el caso de un escritor **1/1**, y los 6 E2E de desbordamiento **6/6**. Esto demuestra que los oráculos son satisfacibles y que fallan por su causa, no por el arnés. **D2 y M1 no tienen control positivo** (no se escribió una corrección).

## 5. Límites y lo que no se demuestra

- **L1 · Hash de reanudación**: el digest acredita igualdad de ese contenido lógico entre procesos, no autenticidad.
- **L2 · Respuesta tardía dentro del componente:** la interfaz **no permite solapar lecturas** (durante una acción los controles se deshabilitan y «Actualizar la sala» sustituye la pantalla por una carga sin botones). Por eso no se pudo construir un caso donde una respuesta antigua compita con una acción nueva desde la UI; se probó la propiedad estructural con una respuesta retenida real (con y sin `AbortSignal`) y el descarte por ticket sigue probado a nivel de cliente (`rescue-room-client.test.ts`, 106). No se afirma una carrera React no demostrada.
- **L3 · Plan de 200 tareas**: el plan solo considera las 200 visibles; los recuentos de 10.000 **no** demuestran planificación global. Posible unidad posterior: un plan sobre el inventario completo (p. ej. paginar la cola o añadir un método de cola con desplazamiento), sin editar `buildResponseQueue` desde aquí.
- Sin Edge, lector de pantalla ni personas; un solo navegador (Chromium headless de ms-playwright). Sin `npm test` completo. El reloj de los E2E es fijo (`2026-11-02T07:00:00Z`).
- La recarga fallida carece de un control «Reintentar la carga» (hoy se resuelve recargando la página o con «Actualizar la sala» tras un conflicto): mejora de producto, no defecto de datos.

## 6. Capturas (rutas en `tests/.tmp/rescue115-…/evidence-final3/`)

**Inspeccionadas** (leídas como imagen): `followup-390-conflicto-incierto.png` (primera ejecución; pantalla completa a resolución reducida), `followup-390-retorno-detalle.png`, `followup-320-retorno-detalle.png`, `followup-1440-retorno-detalle.png`, `followup-1440-conflicto-incierto.png`, `followup-320-texto-largo.png` (ancho 9017 px: muestra D6). **Medidas pero no inspeccionadas:** `followup-320-conflicto-incierto.png`, `followup-390-texto-largo.png`, `followup-1440-texto-largo.png`. Observación visual del retorno a 390/320: la tabla de operaciones se desplaza dentro de su región y la columna «Operación» queda fuera de vista tras interactuar; los controles de decisión y conciliación se ven completos y a tamaño táctil.

## 7. Hashes (SHA-256, primeros 16 hex) de los archivos entregados

| Ruta | SHA-256 |
| --- | --- |
| `tests/rescue-followup-context.test.ts` | `570e0bdaf80a637d…` |
| `tests/rescue-followup-persistence.test.ts` | `bb79122e096c7632…` |
| `tests/rescue-followup-paths.test.ts` | `3a506975e8a2e735…` |
| `tests/rescue-followup-scale.test.ts` | `9cf3044fe9f7ead4…` |
| `tests/e2e/rescue-followup.spec.ts` | `201b31293b57b3e3…` |
| `tests/helpers/rescue-followup-harness.ts` | `5ee6c52c97039ca5…` |

(El informe, el checkpoint y el traspaso no incluyen su propio hash.) Los resultados finales provienen de la proyección `pfinal3`, **byte a byte igual** a estos archivos (comprobado con `cmp`); `server/store.ts`/`recovery.ts` iguales al principio y al final.

## 8. Comandos y salidas comprobados

```bash
node tests/.tmp/rescue115-…/projection.cjs pfinal3                       # proyección + manifest de hashes
cd tests/.tmp/rescue115-…/pfinal3 && npx vite build design/rescue-room --outDir "$PWD/../dist-final3" --emptyOutDir --base ./
node --import tsx --test tests/rescue-room.test.ts tests/rescue-plan.test.ts tests/rescue-room-journal.test.ts tests/rescue-room-api.test.ts tests/rescue-room-client.test.ts tests/rescue-report.test.ts   # 60/60
node --import tsx --test tests/rescue-followup-context.test.ts tests/rescue-followup-persistence.test.ts tests/rescue-followup-paths.test.ts tests/rescue-followup-scale.test.ts          # 31: 25 pasan / 6 fallan
PLANB_PROJ=$PWD PLANB_RESCUE_DIST=<dist> PLANB_RESCUE_EVIDENCE=<carpeta> node <repo>/node_modules/@playwright/test/cli.js test --config tests/.tmp/rescue115-…/pw.config.ts      # 10: 5 pasan / 5 fallan
```

Logs: `final3-node106.log`, `final3-node115.log`, `final3-e2e115.log`, `fix-node-a.log`, `fix-node-b.log`, `e2e-pfix.log`, `m12-paths.log`, `a1-node106-p1.log`.

## 9. Procesos y archivos propios

- Procesos lanzados y cerrados por cada prueba (servidores de la demo en puertos libres elegidos por el sistema; sondas puntuales en 4561, cerrada). **No se tocó** la demo de 4511 ni ningún otro puerto o proceso ajeno; 4511 sigue escuchando por su cuenta.
- Cada prueba crea sus salas y las elimina **sin borrado recursivo** (ficheros conocidos + carpeta vacía). Dos fallos de higiene de mis propias pruebas (carpetas de las pruebas de marcador y de `startDemo` dejadas tras un fallo) se detectaron y corrigieron; los restos propios (8 carpetas con el reloj fijo de las pruebas) se retiraron sin recursión. En `tests/.tmp` quedan solo la sala de la demo en marcha y la carpeta de evidencias de 106. Dentro de la raíz de 115 hay 5 carpetas residuales de proyecciones (autocontenidas).
- Sin commit/push/despliegue, sin dependencias, sin `npm run build`, `dist/` ni `build/` de la raíz, sin servicios externos.
