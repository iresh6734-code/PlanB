# Revisión 290 · Jornada A3 · R3 favorable

8/11/2026, Europe/Madrid. **Dictamen vigente favorable para R3.** Los cuatro hashes presentados se cotejaron antes/después; fuentes de Claude intactas. La identidad completa ya decide si se habilita el plan; el cruce parcial con v1 solo filtra/retira. Se conserva debajo el historial de las devoluciones R1/R2.

## Repetición propia R3

Banco nuevo `tests/.tmp/jornada290-r3-lylYFc`: App/dependencias aceptadas congeladas, tres fuentes de código/prueba R3, arnés293 aceptado, Vite/React de producción, API real y SQLite ficticia de archivo. Tipos focales0. **25/25 E2E autora**,110,53s, sin omisiones/reintentos/intermitentes. Las tres regresiones R3 incluyen generación distinta, comprobación pendiente/error y recuperación funcional; ya no hay sustitución local del cierre del arnés.

Cinco sondas originales: cuatro pasan, incluida la que cambiaba solo generatedAt y fallaba en R2. La quinta se detuvo antes de su aserción porque Chromium no devolvió el cuerpo para response.json; se conserva independent.log como incidencia de observación, no defecto de producto ni pase verde.

Se repitió solo esa quinta con observación equivalente: tras liberar la barrera de Hoy se obtiene el cuerpo con route.fetch, se conserva JSON de esa respuesta antes de route.fulfill, se espera la respuesta del navegador, se exige captura nueva, se entrega la cola antigua y se esperan dos frames. **1/1 pasa**,13,49s total de banco. No se cambió su aserción sobre acciones antiguas ni el criterio de identidad. Así quedan verificadas las cinco condiciones anteriores, sin afirmar que el primer pase original fue5/5.

Se abrieron las capturas actuales de Jornada1440 y320. Los tres tamaños1440/390/320 del pase autor verifican teclado, geometría y controles. No navegador de usuario, HubSpot, terminal16105, proveedor o demo4601. Browser plugin no disponible; Playwright del proyecto/Chromium1228 de caché, perfil nuevo y red exterior bloqueada. Primera preparación HZfNCG no llegó a pruebas por EPERM al crear la junction de dependencias; se repitió con permiso sobre carpeta nueva y dependencias existentes, sin instalar nada.

## Plazo de identidad: diagnóstico y recuperación

Se retuvo la respuesta real de state hasta agotar el plazo15s. Un diagnóstico propio que exigía una alerta específica de timeout falló. El recibo y screenshot muestran, sin embargo, que el plan permanece inert,0PATCH y el texto genérico **«No se pudo confirmar la copia actual…solo de consulta»**. Se corrige la sospecha inicial de «Comprobando indefinido»: no fue lo observado.

Un control separado mantuvo la misma barrera hasta el vencimiento y después retiró la interceptación: aviso genérico y plan inactivo; Actualizar acredita la copia, devuelve acciones y permite abrir la tarea. **1/1 pasa**,27,3s de banco,0PATCH. identity-timeout-recovery.json acredita esos pasos. No se alteró el diagnóstico fallido para convertirlo en verde. La ausencia de una alerta específica de timeout no bloquea la corrección de identidad validada; el mensaje genérico y reintento funcionan.

Un experimento adicional que intentaba ignorar signal en window.fetch no completó la prueba antes del límite del driver120s y quedó sin resultado de aserción. Se conserva ignore-abort.log; no acredita un fallo ni un pase. CIM posterior limitado al banco no encontró procesos. No se afirma desde ese experimento resistencia a transporte arbitrario. El caso autor titulado «ignora cancelación» permite que la respuesta se corte por aborto, por lo que tampoco se atribuye entrega real tardía a esa variante. La secuencia/época/cancelación se revisaron estáticamente y las carreras de producción descritas arriba sí se probaron.

## Alcance y huellas R3 aceptadas

| Archivo | SHA-256 |
| --- | --- |
| `src/LocalOperations.tsx` | `05c3c6875f2c8af2ddaf9a6173332e8b218f49a1cc32195d6e6108c668171c9d` |
| `src/local-operations.css` | `db138aed8750b234c8cd9b16b67afed6dd9a14d48e43c42ac85f9d7ac49d0227` |
| `tests/e2e/hoy-cola-jornada.spec.ts` | `964139b6ab6d6ce636389cc4786daae21c921ed144dfb9a5a8505b0fb9f5357c` |
| `coordination/reports/CLAUDE-HOY-COLA-JORNADA-A3.md` | `9fa43976569934488c1b8154a39082bc6f709225ed50a7b324cbcca0ec06f00d` |

F1 de R1/R2 cerrado en el alcance descrito. readContext añade health/state de hasta8MB en cada comprobación; la identidad completa en el contrato del anfitrión permitiría optimizarlo mediante otra unidad. Las decisiones de Jornada siguen locales en memoria; no se presentan como guardados durables o coberturaA4. Los mutantes comunicados por la autora no se repitieron. A4/13de15 y otros bancos ajenos no se convierten retroactivamente en verdes.

Se acepta R3 y se libera su reserva. La demo instalada aún permanece en288 y no se actualizó en esta revisión. La aceptación no equivale a montar el Radar ni a un ensayo real de proveedor.

---

# Histórico · R2 requirió R3

8/11/2026, Europe/Madrid. **Dictamen vigente: devolver para R3.** La R2 corrige las tres variantes de recaptura probadas en R1, pero una cola de la generación anterior todavía puede autorizar el plan cuando coinciden los tres campos de identidad v1. No se han modificado los cuatro archivos de Claude.

## Repetición propia de R2

Banco nuevo `tests/.tmp/jornada290-r2-IGv6Xs`, preparado por `tests/.tmp/prepare-jornada290-r2.cjs` y ejecutado con `tests/.tmp/review-jornada290-r2.cjs`. Corte aceptado de App y dependencias, cuatro huellas R2 congeladas, arnés 293 ya aceptado. Tipos focales 0. **22/22 E2E de la autora**, 101,37 s, sin reintentos, omisiones o intermitentes. Las cuatro sondas anteriores (503, pendiente, bloqueo inmediato y cuerpo viejo realmente recibido tras Hoy nuevo) pasan sin cambiar sus aserciones. El control de bloqueo original solo acredita retirada inmediata.

La especificación de Claude R2 incorpora una sustitución local de assertAllClosed para PIDs reutilizados, anterior a 293; no se retocó en esta revisión. Ese control no sustituye la comprobación posterior propia de procesos, que dio CIM 0 limitado al banco. No se adoptó ninguna fuente working ajena como dependencia del producto. Chromium propio de caché, ficción nueva, API real y SQLite de archivo; no main empaquetado, 4601 ni proveedor.

## F1 restante · Identidad parcial autoriza una generación anterior (medio)

`reconcile` cruza instanceId/captureId/capturedAt y considera la coincidencia suficiente para activar el plan. La cola tiene además captureStartedAt/accountId/generatedAt. Una época de petición nueva no acredita que dos respuestas de esa época correspondan a la misma generación.

Sonda independiente nueva en `tests/.tmp/jornada290-generation.fragment.ts`: abrir jornada y estimar 20 min; retener el cuerpo200 de work ya calculado; cambiar únicamente la generación del servidor ficticio manteniendo captura y sus fechas; entregar Hoy200 actual y después el cuerpo antiguo; esperar su llegada y dos frames. Se acredita por la cola real que generatedAt pasa de `2026-11-02T09:00:00Z` a `2026-11-09T13:00:00.000Z`. Los otros cinco campos permanecen iguales. El plan antiguo vuelve utilizable, con botón Abrir habilitado y fuera de inert.

Resultado propio: **4/5 sondas pasan, 1 falla** por `Expected false / Received true`. Evidencia en `s/tests/.tmp/hoy240-run-db704231/cases/005-98406c54/generation-identity.json`, screenshot abierto `generation-identity.png`, log independent y recibos reales. El fallo es de autorización del plan/aislamiento de estimaciones; no se hizo PATCH y no se atribuye escritura errónea ni fallo del preflight de la ficha.

Un candidato únicamente privado reutilizó `readContext` existente después de recibir work y comparó contextKey completo con la clave del adaptador. La misma sonda de generación pasa y su recibo indica usable:false. **No se declara solución validada:** el banco candidato quedó 4/5 porque la sonda anterior de recaptura encontró un error de protocolo de Playwright al leer response.json, antes de su aserción. El log causal-r2 conserva ese fallo de observación; no se silenció ni cambió su aserción. La fuente privada fue restaurada por hash y no se modificó el checkout. Es evidencia de sensibilidad del caso de generación, no una implementación entregada a Claude.

La limitación declarada por la autora describe campos ausentes en v1, pero no cierra el requisito de no renovar autorización con una cola vieja. Puede revalidar la identidad completa mediante un lector existente dentro de sus cuatro rutas; si necesita cambiar el contrato anfitrión, debe acordarse otra reserva. Mantener inactivo hasta confirmar el contexto completo es válido; no llamar confirmada una coincidencia parcial.

## Huellas R2 revisadas, no aceptadas

| Archivo | SHA-256 |
| --- | --- |
| `src/LocalOperations.tsx` | `84b4d3dc137d013491543cb21355af47de362b6b68bc46c0e852876c3aeb79a4` |
| `src/local-operations.css` | `db138aed8750b234c8cd9b16b67afed6dd9a14d48e43c42ac85f9d7ac49d0227` |
| `tests/e2e/hoy-cola-jornada.spec.ts` | `b395e4f5aa2e0fb33925af9cc092cea5008e7edb11f577f6105054cc6db70b78` |
| `coordination/reports/CLAUDE-HOY-COLA-JORNADA-A3.md` | `65c00e03e42ac47d3dab27b4c3de3e28b5468e215ed79e299282bd89fb294994` |

Se cotejaron antes/después, también tras restaurar el candidato. Reserva de cuatro rutas conservada para R3; puerta de montaje aún pendiente. Sigue debajo la revisión histórica de R1.

# Histórico · Jornada A3 R1

8/11/2026, Europe/Madrid. Codex. **Requiere R2.** Cuatro huellas exactas cotejadas antes/después; no se han editado los archivos de Claude ni la demo4601.

## Corte y resultados

Banco `tests/.tmp/jornada290-V86pJb`, script `tests/.tmp/review-jornada290.cjs`: App288 fija, las tres rutas de código/prueba de A3 y dependencias205/230/adaptador/275 aceptadas por hash. Manifiesto con procedencia por archivo. App compilada con React de producción comprobado en los bundles; API real y SQLite nuevas por caso mediante el arnés240, sin main empaquetado. Browser plugin no disponible: se usa Playwright regular y Chromium1228 de caché, perfil propio efímero.

- **17/17 E2E originales**, sin cambiar aserciones,125,21s; tipos focales0.
- Tres sondas propias: control de retirada inmediata al bloquear pasa; dos regresiones de contexto fallan en R1 (cola503 y cola pendiente).
- Diagnóstico adicional **1/1** precisa el impacto sin guardar.
- Tercera regresión: respuesta200antigua efectivamente entregada después de Hoy200nuevo, falla la aserción esperada en R1. Se espera su llegada y dos animation frames antes de observar la UI.
- Barrera experimental en copia privada: **3/3 sondas**, **17/17 originales**, y la regresión200tardía **1/1** pasan. Fuentes privadas y las cuatro huellas del checkout restauradas/cotejadas. No es una R2 entregada, ni una solución completa de identidad.

No hubo reintentos, omisiones o intermitentes en estos bancos. Los fallos propios son resultados reproducidos del producto, no un pase verde de la entrega. La consulta CIM limitada a la raíz privada no encontró procesos vivos tras el cierre. La demo288 no se reinició ni se actualizó con A3.

## F1 · El plan de otra captura sigue utilizable (medio)

`LocalOperations.load` inicia por separado la lista v1 de Hoy y la cola de Jornada. `loadDay` conserva el día anterior mientras carga o falla; la publicación comprueba la secuencia de su petición pero no cruza la identidad con la de la lista actual. `openFromDay` recibe únicamente el ID y abre la ficha sin exigir que el plan todavía pertenezca a la copia actual.

Tres reproducciones independientes con los mismos IDs en dos capturas:

1. Elegir20min para Alfa, presupuesto60 y fijarla en la captura del8/11. Recapturar al9/11, actualizar y recibir Hoy200nuevo, mientras la cola da503. El aviso dice «se muestra la última lectura», pero permanecen los20min/fijados/presupuesto y el botón de abrir de la captura vieja habilitado. El plan no identifica que es de otra copia.
2. Igual, dejando la cola pendiente mientras Hoy ya recibió la copia nueva. También se puede abrir desde el plan anterior.
3. Se retiene una respuesta200de cola generada en la captura vieja; se recaptura, se entrega la lista Hoy200nueva y después se libera **el cuerpo de cola viejo**. Tras recibirlo y esperar dos frames, las acciones anteriores quedan habilitadas. Abortar una petición o contar secuencias locales no basta para esa secuencia.

**Impacto calibrado:** se pulsó el botón viejo sin Guardar. La ficha hace su lectura condicionada y abre `captura-otra`,9/11, con esa fecha visible. El diagnóstico registra0PATCHy0aplicaciones. No se ha probado escritura automática, guardado en una captura distinta de la que muestra la ficha o fallo del CAS. El problema es reutilizar una planificación y sus estimaciones de otra identidad como origen de acciones sobre un ID coincidente. La guardia posterior de la ficha no satisface el aislamiento exigido para Jornada.

El aviso de error genérico y la igualdad de recuentos no acreditan que ambas lecturas pertenezcan a la misma copia. El contexto v1 de Hoy carece de parte de la identidad completa de230: no declarar equivalencia por instalación/ID/fecha únicamente si falta generación, inicio o cuenta.

## Corrección requerida

Retirar o inhabilitar conservadoramente acciones/decisiones de Jornada mientras no esté comprobado su contexto actual. Tras cambio conocido de identidad, el plan previo no puede seguir como plan actual aunque la nueva cola falle. Una respuesta vieja recibida tarde no puede reactivar controles ni devolver estimaciones/fijados. Si se conserva la lectura anterior como información, debe ser claramente de consulta y no abrir tareas desde ese ámbito.

Conservar estimaciones al refrescar la **misma** identidad comprobada y reiniciarlas con otra. Si hacen falta identidad completa del anfitrión o otro contrato, coordinar una unidad nueva; no editar App o contratos ajenos bajo estas cuatro reservas. Una barrera por loading más una comparación parcial ilustra las regresiones, pero no se adopta como solución completa sin esa justificación.

Las tres regresiones deben integrarse en su prueba reservada y fallar con R1 en copia temporal. Probar ambos órdenes de respuestas y llegada real del cuerpo antiguo. Conservar guardado condicionado, foco exacto/región, asociaciones desconocidas, recorte de cola y los17casos anteriores.

## Evidencia

- `manifest.json`, `result.json`, `types.log`, `author.log/json` y `independent.log/json` en la raíz290.
- Reproducciones: `tests/.tmp/jornada290-probes.fragment.ts`, `jornada290-diagnostic.fragment.ts`, `jornada290-late.fragment.ts`; scripts `diagnose-jornada290.cjs`, `causal-jornada290.cjs`, `late-jornada290.cjs`.
- Diagnóstico en `s/tests/.tmp/hoy240-run-235178e7/diagnostic.json`: identidad8/11antes,9/11después, modal actual,0intentos/aplicaciones. Capturas `stale-plan-1440.png` y `current-modal-from-stale-plan-1440.png` abiertas/inspeccionadas.
- La captura original `hoy240-run-a5cc3ea3/cases/017-581fbe0b/jornada-320.png` se abrió e inspeccionó: estimaciones, saldo, acciones y texto caben; la suite comprueba1440/390/320sin desbordamiento. No se afirma inspección manual de todas las capturas generadas.
- `causal-fixed-independent.json`3/3en37,14s, `causal-fixed-author.json`17/17en137,73s, `late-baseline.json`1fallo y `late-private-fixed.json`1/1. `causal-restored.json` y `late-restored.json` acreditan restauración. La barrera privada deshabilita controles mientras carga o discrepa el contexto parcial conocido; no corrige todos los posibles cambios de generación y no debe copiarse como entrega final.

El control propio de bloqueo comprueba retirada inmediata; aunque su título inicial menciona respuesta tardía, ese caso no la inyecta. La regresión tardía ejecutada corresponde al cambio de copia descrito arriba. No se atribuye al bloqueo una sensibilidad no ensayada.

## Huellas revisadas

| Archivo | SHA-256 |
| --- | --- |
| src/LocalOperations.tsx | f124fbe450815902ff0da2e17b0b5234c67d58914ee11d9e22d29e9a69718835 |
| src/local-operations.css | 3dc0ad0245ebb0e03b1697bc53d65295607d0d17a4c4455545d98918b9d6a0c4 |
| tests/e2e/hoy-cola-jornada.spec.ts | 576349fc508770d36232dd150f6446ad9e108db31d40839bcb2e7a20575125f2 |
| coordination/reports/CLAUDE-HOY-COLA-JORNADA-A3.md | 440d7aa5060020f7d98832d4edb66872c2e018e39da1f5538e77fc90b654944e |

No se repitieron aquí14A2,95DOM,35D7/reapertura,64Nodeo7mutantes comunicados por Claude. No hay main esbuild, A4duradero, proveedor, despliegue o actualización de demo. El control legado240 «Hoy no lee la cola» necesita sustitución separada; no se debilita bajo esta revisión.

Siguiente: devolución formal A3 con briefR2-290, reserva4intacta y nueva revisión de hashes. RadarUI puede continuar en sus otras rutas, pero el montaje central sigue esperando aceptaciónA3.
