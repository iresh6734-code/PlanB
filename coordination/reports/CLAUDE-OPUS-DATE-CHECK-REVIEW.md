# CLAUDE-OPUS-DATE-CHECK-REVIEW · Comprobar una fecha, paquete 3

11 de noviembre de 2026, Europe/Madrid. Sesión `claude-opus-5-5`, a petición del usuario («Sí, paquete 3»). Todo va en rutas nuevas. CORE y FLOW están presentadas y no se han editado: la revisión lee la decisión por la ruta pública de FLOW y guarda el desenlace en claves propias.

## Qué existe

| Archivo | Contenido |
| --- | --- |
| `shared/date-check-outcome.ts` | Revisión pura `planb-date-check-review-v1`. Compara condiciones supuestas con hechos observados (fecha, referencia y alcance). Calcula la proyección contrafactual con el motor sobre la **revisión exacta** de la decisión. Guarda aparte el desenlace observado. Atribuye el retraso hasta lo que explica la proyección y deja el resto por comprobar. Juzga contra la fecha que la decisión **permitía ofrecer**. Incluye dos cierres de ficción. |
| `shared/date-check-review-api.ts` | Contrato `planb-date-check-review-api-v1`. |
| `server/date-check-review-mount.ts` | `mountDateCheckReview`: lista de decisiones, ver una revisión (no escribe ni recalcula) y registrar un desenlace por decisión, idempotente por clave. Si no puede reconstruir la entrada exacta de la decisión, la rechaza. |
| `src/date-check-review-client.ts`, `src/DecisionReview.tsx` y `src/decision-review.css` | Pantalla «Revisar una decisión». |
| `shared/date-check-services-fixture.ts` | Caso de servicios y proyectos sobre `servicesWeek()` de Fable. La capacidad son las horas de Inés. La aprobación del cliente es una entrada de cantidad 1 en un buzón de aprobaciones, el único recurso añadido, que no ejecuta trabajos. |
| `tests/date-check-outcome.test.ts` | 6 pruebas puras, incluido el caso de servicios. |
| `tests/date-check-review-mount.test.ts` | 4 pruebas de servidor. |
| `tests/e2e/date-check-review.spec.ts` y su página de arnés | Recorrido en Chromium. |
| `coordination/plans/DATE-CHECK-REVIEW-HANDOFF.md` | Montaje y cómo llevarlo a la ficha. |

## Los dos cierres (Almacén Sur, decisión «Frioval + franja de Cruz», horas de Madrid)

| | Cumplido | Proveedor tarde |
| --- | --- | --- |
| Frioval | Llega el jueves 12 a las 09:40, 20 min antes de lo supuesto: **se cumplió** | Llega el lunes 16 a las 11:00 (albarán ALB-5602): **4 d 1 h más tarde** |
| Franja de Cruz | Trabajada | Trabajada, con un parte de jornada **parcial** |
| Proyección con lo observado | Viernes 13, 14:30 | **Martes 17, 09:30** |
| Desenlace observado (acta) | **Viernes 13, 14:20**: se cumplió la fecha ofrecida | **Martes 17, 10:10**: no se cumplió |
| Atribución | Sin retraso | 3 d 19 h 40 min de retraso; **3 d 19 h** se explican por la llegada tardía de Frioval; **quedan 40 min por comprobar** |

El contrafactual y el observado se guardan por separado. Si una franja no se trabajó, desaparece del contrafactual. Una llegada a tiempo no explica nada. Lo explicado nunca supera el retraso observado.

## Caso de servicios y proyectos

Informe de arquitectura para el cliente E, entregado el miércoles 18 a las 17:00, con 20 h de análisis. Solo Inés tiene la habilidad «análisis».

- **Mantener:** queda **sin determinar**, porque falta la fecha de aprobación del cliente.
- **Solo la aprobación del martes:** no cumple (Inés tiene 16 h); primera fecha: jueves 19, 13:00.
- **Aprobación + 4 h extra de Inés:** cumple exactamente a las 17:00 del miércoles (condicionado) y encabeza el ranking.
- **Revisión con la aprobación 6 h tarde:** la proyección pasa al jueves 19 a las 15:00 y el acta dice 15:40. De 22 h 40 min de retraso, 22 h se explican por la aprobación tardía y quedan 40 min por comprobar.

Son el mismo motor, las mismas protecciones, la misma revisión y el mismo modelo de desenlace.

## Pruebas ejecutadas

- `npx tsx --test` de los cinco ficheros de Comprobar una fecha (outcome, review-mount, mount, date-check, inventory): **50/50**.
- e2e de revisión: **1/1** (12 s), con `tests/.tmp/opus-date-check/pw-review.config.ts` y `PLANB_PLAYWRIGHT_EXECUTABLE` = headless shell 1228. El recorrido: dos decisiones creadas por las rutas públicas → cierre cumplido → cierre tardío perdiendo el acuse y repitiendo con la misma clave (un 201 que no llegó a la página y un 200 al repetir) → **reinicio del proceso** → reapertura idéntica sin escrituras → 390 y 320 px sin desbordamiento. No hubo red externa ni errores de consola. El e2e de FLOW sigue pasando: 1/1.
- Mutantes sobre la revisión: **6/6** detectados, con restauración verificada por SHA-256.
- `tsc --noEmit -p .`: sin errores en las rutas nuevas.
- Capturas en `tests/.tmp/opus-date-check/review-shots/` (ignorado por git). Revisé la del cierre tardío a 1440.

## Límites

- **No montado.** El parche está en el guion. Llevarlo a la ficha de `DateCheck.tsx` exige devolver FLOW o componerlo en el anfitrión.
- Los cierres son **ficción**: el desenlace se elige con un botón. En un piloto, las observaciones vienen de las fuentes (paquete 4).
- La entrada exacta de la decisión se reconstruye a partir del formulario y de uno de los dos estados de ficción. Con datos reales habría que guardar la entrada o su procedencia completa al decidir (decisión de persistencia de Codex).
- El retraso se mide en tiempo de reloj, noches y fin de semana incluidos. Es lo que ve el cliente, no las horas de trabajo perdidas.
- Ceder reservadas o sustituir un SKU son decisiones internas, sin un hecho que observar en este corte (`not-observable`).
- Hay un desenlace por decisión. Una corrección posterior del desenlace necesitaría su propio contrato.
