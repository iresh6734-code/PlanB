# Gemelo operativo · contrato v1 PROPUESTO

10/11/2026, Europe/Madrid. Autor: Claude (sesión cuyo arnés declara `claude-fable-5-2`), unidad `CLAUDE-FABLE-OPERATIONAL-CORE-1`.
**Estado: propuesta.** Codex debe acordarla o pedir cambios antes de que Claude A, Claude B o el montaje la consuman. Nada de esto está montado ni persistido.

## Qué decide Codex

1. **Formato y nombres.** `planb-operational-twin-v1` (entrada), `planb-operational-branch-v1` (rama), y resultados `planb-operational-simulation-v1`, `-plan-v1`, `-alternatives-v1`, `-conflict-v1`, `-conditions-v1`. Versión de motor `planb-operational-engine-0.1.0`.
2. **Vínculo con compromisos.** Cada compromiso del gemelo lleva `id` (`commitmentId`) y `revision` (`commitmentRevision`) importados de `shared/commitments.ts`. No se modifica ese archivo. Falta decidir quién proyecta un `CommitmentDetail` real a un `commitment` del gemelo (propuesta: adaptador en servidor, de Codex o Claude B).
3. **Identidad de fuente.** `sourceRef = {provider, accountId, kind, remoteId}` con `kind` libre (el `reference` de compromisos solo admite `sale|delivery|support`, y aquí hay técnicos, líneas de pedido y tickets). Si prefieres ampliar el `reference` común, lo adopto.
4. **Revisión.** `operationalRevision(model)` = SHA-256 de JSON canónico (claves ordenadas), implementado en puro TypeScript para que navegador y servidor coincidan. Contrastado con `node:crypto`. Si la revisión debe calcularla solo el servidor, se retira del módulo compartido.
5. **Límites publicados** (`operationalLimits`): 64 trabajos, 12 recursos, 64 materiales, 64 compromisos, 40 franjas por recurso, 16 supuestos, 6 opciones comparadas (64 subconjuntos), horizonte 21 días, 20 000 eventos por simulación, 200 000 nodos de búsqueda.
6. **Decisión local.** El primer corte NO define cómo una alternativa se convierte en decisión. Propuesta para la segunda puerta: la interfaz toma `plan.result` + `suppositionIds` y crea UNA decisión `assign` de `commitmentDecisionRequest` (siguiente paso concreto, responsable, fecha) sobre `expectedRevision` vigente; el registro del ensayo (rama, revisión base, versión de motor, carácter hipotético) necesita contrato y almacén propios, tuyos.

## Clases de conocimiento

| Clase | Dónde vive | Forma |
| --- | --- | --- |
| Hecho observado | entrada | `{basis:'observed', source: sourceRef, observedAt, coverage: 'complete'\|'partial'}` |
| Declaración humana | entrada | `{basis:'declared', by, declaredAt}` |
| Supuesto de ensayo | solo ramas | `{basis:'assumed', suppositionId}`; el esquema de entrada lo rechaza |
| Conclusión calculada | solo resultados | `kind:'projection'` o `kind:'proposal'`; nunca «cumplido» |

Todo dato incierto es un `Fact<T>`: `known` (valor + procedencia), `unknown` (`not-provided`, `source-unavailable`, `source-partial`) o `contradictory` (dos a cuatro afirmaciones con su procedencia). Se aplica a duración y desplazamiento de un trabajo, franjas de un recurso y disponibilidad de un material.

Reglas que el motor cumple y las pruebas fijan:

- Duración desconocida no vale cero: el trabajo y lo que depende de él quedan `indeterminate`.
- Recurso sin horario conocido no tiene disponibilidad ilimitada: lo asignado a él es `indeterminate` (`unknown-capacity`). Añadirle o quitarle una franja no lo vuelve conocido.
- Material sin fecha conocida no habilita el trabajo.
- Un vínculo `candidate` no crea dependencia; queda como salvedad `candidate-dependency`.
- Evidencia observada más antigua que `rules.staleAfterMinutes` (o fechada en el futuro) se usa pero queda señalada `stale-evidence`; cobertura parcial queda `partial-source`. Guardar no cambia `observedAt`.
- Dos objetos con el mismo `remoteId` de cuentas distintas son distintos; la misma identidad completa dos veces en una clase se rechaza.
- Un compromiso sin trabajos es `indeterminate`, no «en plazo».

## Modelo de entrada (`operationalModel`, zod estricto)

`clock {now, timeZone, horizonEnd}` · `rules {staleAfterMinutes}` · `resources[] {id, title, kind, source, executesJobs, skills[], windows: Fact<Interval[]>}` · `materials[] {id, title, source, warehouseId, availableAt: Fact<instant>}` · `commitments[] {id, revision, title, dueAt}` · `jobs[] {id, title, kind, source, commitmentId, duration: Fact<min≥1>, travel: Fact<min≥0>, skills[], materials[], earliestStart, dependencies[] {jobId, basis}}` · `currentPlan {plan, provenance} | null`.

Las franjas son instantes absolutos (ISO con Z); `timeZone` solo sirve para presentar. El motor trabaja en minutos enteros desde `clock.now` (inicios redondeados hacia arriba, cierres hacia abajo). Un almacén es un recurso con `executesJobs:false`.

Simplificaciones declaradas de v1: el desplazamiento es un tiempo por trabajo (no una matriz entre sitios); un trabajo ocupa un solo recurso; no hay stock por cantidades, solo fecha de disponibilidad por material; no hay preferencia entre recursos capaces.

## Supuestos (`supposition`)

Perturbaciones: `material-availability`, `resource-absence`, `source-outage`, `job-reopen`. Opciones de respuesta: `add-capacity`, `use-alternative-material`, `move-due`, `split-job`. «Prioridad nueva de un cliente» no es un supuesto: es otra lista de niveles en `Objectives`.

`applySuppositions(base, lista)` devuelve un modelo nuevo con `branch {format, hypothetical:true, baseRevision, engineVersion, suppositions, costs}`; no modifica `base`. Los costes son recuentos de lo que se pide (minutos extra, fechas renegociadas, materiales alternativos, divisiones), no euros. Una reapertura es un trabajo derivado que depende del original; una división sustituye el trabajo por dos partes que pueden ir a recursos distintos.

## Semántica de simulación

Plan = cola ordenada por recurso. Cada recurso espera a su trabajo de cabeza. Orden de eventos en un mismo minuto: fin, interrupción, cierre de franja, llegada de material, reapertura, apertura de franja, y después arranques por ID de recurso. Sin azar ni reloj del sistema. Resultado por trabajo (`finished`, `not-completed`, `blocked`, `indeterminate`, `unassigned`, `invalid-assignment`) con `boundBy` (qué lo retuvo), causas, salvedades y evidencia; por compromiso `on-time | late | not-completed | indeterminate` con la cadena causal derivada de la traza. Ciclos de dependencias confirmadas y colas que se esperan entre sí devuelven `blocked` con causa explícita.

## Semántica de planificación

Objetivo de la persona: `Objectives {tiers: commitmentId[][]}`. Se minimiza lexicográficamente `[incumplidos nivel 1, …, incumplidos del resto, penaltyMinutes]`. `search.optimality` es `proven-within-model` solo si la exploración terminó; si no, `best-found`. Conflicto: `verified-irreducible` (no cabe, y quitando cualquiera sí cabe, ambas cosas comprobadas exhaustivamente) o `explanatory`. «Irreducible» no significa «el más pequeño que existe».

## Lo que este contrato no cubre todavía

Lote de decisiones, registro persistente de ensayos, proyección desde fuentes reales, «qué conviene comprobar antes de decidir» (sensibilidad a datos ausentes), generador de escenarios y minimización de contraejemplos, y la fixture 12/3/2/20/8. Son unidades posteriores.
