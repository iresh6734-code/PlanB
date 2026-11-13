# CLAUDE-QA-042 · Revisión adversa independiente de LAB035, OPS039 y DIFF040

30/10/2026 (Europe/Madrid). Autor: Claude (una sesión, sin subagentes). Brief `coordination/briefs/CLAUDE-QA-042.md` (hash `d80184d5…`). Reserva tomada con `claim CLAUDE-QA-042 claude`; `check-path` correcto para los dos únicos archivos de escritura. Sin servidores, listeners, Vite/E2E, navegador, build, despliegue, datos reales ni proveedores. Node con `scripts/block-external.cjs`. **Ninguna fuente ni prueba de Codex fue editada** (hashes recomprobados al final, abajo).

## Dictámenes

| Unidad | Dictamen | Defectos demostrados | Nota |
| --- | --- | --- | --- |
| LAB035 motor `shared/continuity-lab.ts` | **Favorable** | ninguno | La entrega figura `working` en el tablón (reabierta por Codex para COORD043, solo memoria/panel). Dictamen sobre el motor congelado, hash abajo. |
| OPS039 radar | **Favorable, con corrección menor recomendada (no bloqueante)** | OPS039-1 | Recorte de texto parte un par sustituto Unicode. |
| DIFF040 comparador | **Favorable, con corrección menor recomendada (no bloqueante)** | DIFF040-1 | Mismo fallo en la vista previa de 500 caracteres. |

La aceptación corresponde a Codex. No he aceptado ninguna entrega ni tocado UX038.

## Hashes revisados (SHA-256) y estado del tablón

Presentados por el tablón y recomprobados contra el disco al empezar y al terminar: **coinciden todos**.

| Archivo | Hash |
| --- | --- |
| shared/continuity-lab.ts | ba46a0e9b1aff7ee71576c3d15485382f93caae6cdf520ad73164ffc799205db |
| tests/continuity-lab.test.ts | 8ee14a6bb0d371b6f6f32719026b83de61a8f116f9212aa9c5e132c0034ad650 |
| coordination/reports/CODEX-LAB-035.md | 682a6b775dcfea9ec702bde0565dac03398010fd99353bfc003f17d90e9276ff |
| shared/response-queue.ts | b5a14ced94bbe12fd2215cc549dbd262a1b4e54113a04d3e3f387754a4015e67 |
| server/response-queue.ts | eb3d0d64b8da5f351f34a0ba2ff0412ec8bc878a43dda730cf50e0d9d1772465 |
| server/app.ts (ruta OPS039) | 6d8d71d3a44bef8f5e7d495ff66ba08faeec4d0ccd0a20b62701b553020464e6 |
| shared/capture-comparison.ts | 594a167d345649b81428888f8cfe208ef8f55af403585f772fd050038361af92 |
| server/capture-comparison.ts | 356fe7ec48d2bb5b070084888b0409dbe2b102f5860842489fbc28106900e46d |
| server/v2.ts (ruta DIFF040) | d4b9bf58f27c5d497ec6b3ce4b3428f08d55b0afcd4031fe7598baef76ea5021 |

Mis archivos: `tests/independent-continuity-review.test.ts` = `323cb6ea425c89524109954483de099cf1866932b5472cfccd766b6d834220d4` (el hash de este informe lo fija `submit`).

Cambios de tablero durante la revisión (no alteran los hashes revisados): a las 07:29:48Z `revise` de CLAUDE-UX-038 (su nota dice que es una iteración 3 pedida por el usuario a otra sesión Claude) y a las 07:32:28Z `revise` de CODEX-LAB-035 junto con la nueva CODEX-COORD-043. El informe CODEX-LAB-035 conservaba su hash a esa hora; si Codex lo reescribe, este dictamen sigue valiendo para el motor (`ba46a0e9…`) pero no para el texto nuevo. UX038 y UX032 no son míos en esta sesión y no los he tocado.

## Método

1. Lectura del código y los tres informes antes de elegir los casos; lectura de las pruebas del autor para **no copiarlas**.
2. Sondas exploratorias efímeras (descartadas; solo dejaron observaciones, algunas convertidas en pruebas).
3. Batería propia `tests/independent-continuity-review.test.ts`: 33 pruebas, cada una con precondición visible y oráculo razonado en comentario (por ejemplo, el cambio de hora de octubre: 2026-10-24T22:30Z = 00:30 CEST del 25; +24 h = 23:30 CET del 25, así que el día 25 dura 25 h y la fecha 26 queda «posterior»).
4. Sensibilidad: 18 mutaciones de una guarda cada una sobre **copias efímeras** de `shared/` (`tests/.tmp/claude-qa042/mut`, borrada al final) con `QA042_SRC=<copia>`; nunca se mutó un archivo compartido.

## Resultados de ejecución

```powershell
node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/independent-continuity-review.test.ts
```

**33 pruebas: 31 correctas, 0 fallos, 2 `todo`** (los dos defectos menores reproducidos; un `todo` se ejecuta y su fallo no rompe `npm test`; Codex puede quitar la marca al corregir). `tsc --noEmit`: sin errores.

Pruebas focales del autor, ejecutadas para contraste (sin modificarlas):

```powershell
node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/continuity-lab.test.ts tests/response-queue.test.ts tests/response-queue-api.test.ts tests/capture-comparison.test.ts tests/capture-comparison-api.test.ts
```

**61/61 correctas.** Coinciden con los resultados que Codex declara; las cifras de cada informe (17, 20+53, 24+29) no las he reproducido por separado.

### Sensibilidad (mutaciones en copia efímera)

17 de 18 detectadas. La que no se detecta es un **mutante equivalente**, no un hueco: M6 quita la guarda `Object.hasOwn(...)` de DIFF040, pero para datos JSON `undefined !== null` ya distingue ausente de null, así que el comportamiento observable es idéntico.

| Mutación | Detectada por |
| --- | --- |
| M1 OPS «hoy» en UTC en vez de Madrid | frontera Madrid 22:59:59.999Z |
| M2 OPS sin desempate por ID | invariancia a la permutación |
| M3 OPS referencia sin cualificar por entidad | referencias por entidad |
| M4 OPS estado desconocido tratado como completado | estados configurados |
| M5 OPS recuentos tras el límite | permutación/recuentos |
| M7 DIFF compara vistas previas, no valores completos | matriz de valores; vistas previas |
| M8 DIFF `!=` (coerción) | matriz de valores |
| M9 DIFF relaciones sin etiqueta en la clave | relaciones (tras añadir el caso de etiqueta; ver fallos del arnés) |
| M10 DIFF relaciones como conjunto | relaciones |
| M11 DIFF ID sin cualificar por entidad | 7 pruebas |
| M12 DIFF offset ignorado | paginación |
| M13 DIFF acepta otro entorno | compatibilidad de origen |
| M14 LAB ensayo de otra captura vale | evidencia ajena |
| M15 LAB restauración antes de verificar la copia | evidencia ajena; cadena temporal |
| M16 LAB ensayo caducado sigue valiendo | cadena temporal (vigencia exacta) |
| M17 LAB `dueAt: null` cuenta como vencida | inventario de 10.000 |
| M18 LAB copia de otra captura vale | evidencia ajena |

Reproducción: `node tests/.tmp/claude-qa042/mutate.mjs` (script efímero, hash `7df9d617…`).

## LAB035 · Favorable

Precondición base: `device-loss` y `crm-outage` con evidencia coherente dan `ready`; cada prueba cambia un solo dato.

| Esperado | Observado |
| --- | --- |
| Evidencia de otro espacio/fuente/captura en copia, restauración, captura o tareas no prepara nada (12 combinaciones), `measuredRecoveryMs` y `exposure` quedan `null` | Cumple: `unproven` |
| Cada escenario solo mira su evidencia: en `device-loss` un simulacro local fallido o `localRuntime` caído no bloquean; en `crm-outage` una restauración fallida, kit caído o copia ausente no bloquean, pero su propio ensayo fallido sí (`blocked`) | Cumple |
| Cadena captura → copia → ensayo con igualdades exactas es válida; un ms de inversión la invalida; vigencia de evidencia con frontera exacta | Cumple |
| 10.000 tareas se aceptan, el recuento es invariante al orden y `dueAt: null` no cuenta como vencida | Cumple |
| `measuredRecoveryMs` es `null` sin ensayo | Cumple |

**Observaciones (caracterizaciones, no defectos; cada una tiene prueba que fija el comportamiento actual):**

- Un ensayo con duración 0 ms se acepta y da `ready` con `measuredRecoveryMs: 0`. El motor no valida plausibilidad del cronómetro; la limitación «la procedencia… y la medición… debe verificarlas el adaptador» lo declara, y no atribuyo al motor autenticidad alguna.
- En `device-loss` no se exige que la captura se verifique antes que la copia o el ensayo: una copia creada y verificada y un ensayo completado antes de `snapshot.verifiedAt` siguen dando `ready`. Es una decisión de diseño razonable (la copia depende de `capturedAt`, no de la verificación); si se quiere lo contrario, es un cambio de contrato.
- Un ensayo fallido ya caducado (fuera de `maxEvidenceAgeMs`) se trata como falta de ensayo vigente (`unproven`), no como `blocked`. Coherente con la vigencia; el fallo antiguo no aparece en el detalle. Lo observé en el código; no lo fijé con una prueba.

## OPS039 · Favorable con corrección menor

Precondición: tareas ficticias y `AppSpec` derivado de `makeDemoSpec(makeFixture())`; el tipo de campo, las opciones de estado y los roles se alteran por prueba.

| Esperado | Observado |
| --- | --- |
| Día civil Madrid: `2026-10-29` en 22:59:59.999Z (23:59:59.999 CET) sigue «dentro del horizonte»; con +1 ms (00:00 del 30) está «vencida» | Cumple |
| Cambio de hora: horizonte absoluto de 24 h acaba el día que dice Madrid (otoño y primavera) | Cumple |
| El mismo instante con `Z`, `+02:00` y `-05:00` es la misma tarea; el día local sale del instante (`23:30-05:00` del 29 = día 30 en Madrid) | Cumple |
| Mismo texto interpretado según el tipo configurado (`date`/`datetime`/`text`); vacío y `null` son «sin fecha», números/booleanos/ cadenas largas son «inválidas»; valor inválido recortado a 100 | Cumple |
| Solo se descarta lo inequívocamente completado; «Cancelada», id/etiqueta contradictorios, valor igual a la etiqueta, `null`, número y campo de estado no enum quedan visibles; los recuentos cuadran | Cumple |
| Un rol que apunta a un campo inexistente no oculta nada | Cumple |
| Orden determinista por unidades de código (`B` < `Task-3` < `a` < `task-10` < `task-2`), invariante a la permutación; el límite no cambia los recuentos | Cumple |
| Referencias por entidad (mismo ID en otra entidad no cuenta), `''` no es referencia, número se lee como texto, destino ausente no escala la prioridad | Cumple |
| Parámetros fuera de contrato, duplicados en la misma entidad, ID vacío y 10.001 registros se rechazan; mismo ID en entidades distintas se admite | Cumple |
| Entradas congeladas no se mutan | Cumple |

API (Fastify inject, SQLite `:memory:`, sin red): con `Date.now` fijado **antes** de registrar la ruta, `evaluatedAt`/`horizonEndsAt` salen del reloj del servidor, el cuerpo coincide exactamente con el motor sobre la copia activa y la revisión no depende del reloj; 409 sin copia, 422 por parámetros y un POST rechazado no modifican `meta`, `records`, `changes`, `captures`, `archives` ni `usage`. La autenticación y Host/Origin ya las prueba el autor sobre la misma ruta; no las repetí.

### Defecto OPS039-1 (menor, demostrado)

`shared/response-queue.ts:55` (`value.slice(0, 100)` del vencimiento inválido) y `:95` (`text.slice(0, 180)` de la etiqueta) cortan por unidades UTF-16. Si el corte cae entre las dos mitades de un carácter fuera del BMP (emoji), queda un sustituto huérfano: cadena mal formada que se muestra como «�» y que algunos serializadores rechazan.

Reproducción exacta: `tests/independent-continuity-review.test.ts`, prueba `OPS · etiqueta (180) y valor inválido (100) recortados…` (marcada `todo`). Entrada: asunto `'a'×179 + '😀' + 'z'` y vencimiento `'x'×99 + '😀'`. Observado: ambos resultados contienen un sustituto alto sin pareja. Esperado: cadena bien formada. **Impacto:** cosmético; no afecta a prioridad, recuentos ni orden. **Corrección recomendada:** recortar por puntos de código (`Array.from(s).slice(0, n).join('')`) o descartar un sustituto alto final tras el `slice`; no implementada, la fuente es de Codex.

## DIFF040 · Favorable con corrección menor

Precondición: dos capturas del fixture (`2026-10-28` y `2026-10-29`), conciliadas y del mismo origen; cada prueba muta un dato.

| Esperado | Observado |
| --- | --- |
| Matriz 10×10 {ausente, null, '', 0, false, '0', 'false', 1, '1', true}: iguales solo si son idénticos en presencia, tipo y valor (sin coerción) | Cumple (100 pares) |
| Mismo ID en `contacts` y `companies` son dos registros; mover el contenido de una entidad a otra es ausente + añadido, nunca «modificado» | Cumple |
| Vista previa idéntica con contenido distinto: diferencia en el carácter 501, espacio final; 500 exactos no se marca recortado, 501 sí | Cumple |
| Cambio solo de esquema (tipo, obligatoriedad, solo lectura, entidad referenciada, orden de opciones, columnas, campo principal): cero diferencias de datos y aspectos exactos por campo + secciones de configuración | Cumple |
| Relaciones: dirección invertida y etiqueta cambiada = 1 alta + 1 baja; multiplicidad 3→1 = 2 bajas, 1 grupo; simetría al invertir | Cumple |
| Simetría general: al comparar en orden inverso, añadidos↔ausentes, modificados y sin cambios iguales | Cumple |
| Paginación: las páginas de tamaño 1, 3, 7 y 200 reconstruyen la lista completa sin saltos ni duplicados cruzando tres entidades; `offset = total` da página vacía con `totalDifferences` intacto y `truncated: false` | Cumple |
| Portal con otras mayúsculas o espacio final y entorno ausente frente a `test` → `SOURCE_MISMATCH`; fecha inválida, extremo de relación inexistente, campo sin definición, entidad faltante, recuento incorrecto o `manifest.complete=false` en **cualquiera** de las dos capturas → `INVALID_CAPTURE` sin filtrar el contenido | Cumple |

API: la captura consigo misma da 0 diferencias y el mismo `contentHash`; el hash de una captura no depende de su pareja y coincide con SHA-256 del JSON guardado (identificación de contenido, no firma: lo declara el informe y no lo contradice ninguna salida). Identidad forzada en la **primera** captura → 422; IDs `%`, emoji, inyección SQL de texto y 400 caracteres → 404; 401 caracteres y vacío → 422; ninguno produce 5xx ni borra capturas. El 409 por portal distinto **no** revela el `accountId` ajeno ni el propio; 409/422/404 y el 200 no modifican ninguna de las seis tablas (tampoco se ejecuta la poda de capturas).

**Observación (caracterización, con prueba):** `source.accountType`, `name` y `description` no forman parte de la identidad ni cuentan como cambio. Para datos de prueba es razonable; los datos reales ya exigen `STANDARD`/v3 en el esquema. El informe dice «metadatos de entorno diferentes»: se refiere a `environment`, no a `accountType`.

### Defecto DIFF040-1 (menor, demostrado)

`shared/capture-comparison.ts:45` corta `value.slice(0, 500)` por unidades UTF-16 y `label` (`:50`, `slice(0, 180)`) igual. Un valor de 499 `a` + `😀` + resto genera `before.value` mal formado (sustituto alto huérfano, `JSON.stringify` lo emite como `\ud83d`). Los valores completos se siguen comparando bien; solo la vista previa es defectuosa. Reproducción: prueba `DIFF · la vista previa no corta un par sustituto Unicode` (`todo`). **Corrección recomendada:** la misma que OPS039-1, conservando `truncated` calculado sobre la longitud original.

## Fallos previos del arnés (no son defectos de producto)

1. Primera ejecución: 5 fallos míos. Un oráculo de offset mal calculado (`23:30-05:00` del 29 son las 04:30Z del 30, que cae **dentro** de 24 h desde el mediodía del 29, no «posterior»); una comparación con `source: undefined` que `JSON.stringify` descarta; una mutación de esquema que cambiaba el destino de una referencia con valores (la conciliación la rechazaba correctamente, con lo que el producto tenía razón); una paginación que escribía el campo `notes` en entidades que no lo definen; y un caso `isTestData=false` que en el modelo falla antes por el esquema de producción (INVALID, no SOURCE_MISMATCH; ya lo cubre el autor). Se corrigió el arnés, nunca una aserción para adaptarla al producto.
2. La mutación M9 se escapó al principio porque mi prueba de relaciones prometía «cambiar la etiqueta» y no lo ejercitaba; añadí ese caso y ahora se detecta.
3. Un script de Python mío truncó a 0 bytes `tests/independent-continuity-review.test.ts` al fallar su codificación a mitad de escritura; lo reconstruí íntegramente con las mismas correcciones y repetí tests, typecheck y mutaciones sobre la versión final. Solo afectó a mi archivo reservado.

## Límites de lo verificado

- Lógica pura y API por `inject` con SQLite en memoria; **no** hay QA visual, listener real, Vite/E2E, recuperación en otro equipo, despliegue ni datos reales. El estado de 4331/4334 no se consultó.
- LAB035 es un motor sin adaptador: no hay garantía de procedencia y no se atribuye ninguna. La aceptación del plan y de los textos de PLAN-POTENCIA-035, memoria y panel no forma parte de esta revisión.
- Las sondas eran exploratorias y se descartaron; solo lo recogido en la batería o descrito arriba como «observado en el código» sostiene este informe. Una de ellas mostró que una opción con id abierto y etiqueta fuera del diccionario («pending» + «Cancelada») se interpreta como abierta; es una hipótesis de configuración rara, sin prueba retenida, y no la cuento como defecto.
- Tres módulos fuente ajenos al alcance (BACKUP041, UX032, UX038) no se revisaron.
- `typecheck` completo sin errores, atribuible a ambos: mi archivo y las fuentes revisadas.

## Siguiente paso recomendado

Codex contrasta mis pruebas y dictámenes. Si acepta LAB035/OPS039/DIFF040, corregir los dos recortes UTF-16 puede ir en un encargo propio (dos funciones pequeñas y quitar los dos `todo`); no bloquean la aceptación.
