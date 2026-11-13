# CLAUDE-FABLE-OPERATIONAL-CORE-2 · Gemelo operativo, segunda puerta

10/11/2026, Europe/Madrid. Autor: Claude. El usuario autorizó esta unidad («Sí, segunda puerta») con CORE-1 todavía en revisión.
Modelo: el arnés declara `claude-fable-5-2`. Sin subagentes. Solo archivos nuevos; CORE-1 se consume tal como se presentó (sus nueve huellas siguen coincidiendo).

## Resumen

La empresa de ficción completa existe y se puede ensayar: plan, perturbaciones, conflicto enfocado, comparación de opciones y «qué conviene comprobar antes de decidir». Hay un generador de escenarios con semilla, un comprobador de propiedades separado y un minimizador que reduce un contraejemplo de 13 trabajos a 1. El registro de ensayo es un contrato puro propuesto. **Nada está montado ni guardado; el registro no tiene almacén ni contrato aprobado, así que la segunda puerta no está cerrada hasta que Codex lo apruebe y lo persista.**

## Qué existe

| Archivo | Contenido |
| --- | --- |
| `shared/operational-company.ts` | 12 instalaciones, 3 técnicos, 2 almacenes, 20 pedidos, 8 tickets; 27 compromisos, 4 materiales; 4 opciones, 4 perturbaciones, 2 listas de prioridad |
| `shared/operational-large.ts` | `projectModel`, `improvePlan` (búsqueda local reproducible), `planLarge`, `compareOptionsLarge`, `focusConflict` |
| `shared/operational-scenarios.ts` | `generateScenario(semilla, clase, tamaño)`: siete clases, plan testigo propio, sin importar el motor |
| `shared/operational-properties.ts` | `traceViolations`, `checkScenario` con motor inyectable, `shrinkScenario` |
| `shared/operational-sensitivity.ts` | `whatToCheckFirst`: un dato cada vez, valores declarados, sin probabilidades |
| `shared/operational-rehearsal.ts` | Registro de ensayo propuesto: crear, elegir, reabrir, borrador de decisión, anotar decisión, exportar |
| `tests/operational-{company,scenarios,sensitivity,rehearsal}.test.ts` | 22 pruebas |
| `coordination/plans/OPERATIONAL-REHEARSAL-RECORD-PROPOSAL.md` | Reglas del registro y cinco decisiones que pido a Codex |

## La demostración sobre la empresa completa

1. **Plan declarado.** Solo la instalación 07 (Residencia Norte) llega tarde: lunes 16 a las 11:30Z. Cadena: ticket 03 ← instalación 07 ← Ana ocupada en la 08 (Hotel Faro) ← acceso solo desde el jueves. El ticket 07 no tiene duración y queda indeterminado, ni atendido ni incumplido. La fecha de los paneles, observada hace tres días, queda señalada.
2. **Conflicto enfocado.** Residencia Norte y Hotel Faro no caben juntos. Conflicto irreducible verificado sobre la proyección a esos dos compromisos, comprobado aparte con el planificador exacto. Vale para toda la empresa porque los trabajos omitidos solo quitan capacidad. Restricciones activas: Ana, Cruz y la bomba retenida. Fechas mínimas: lunes 16 11:00Z para la 07 o lunes 16 07:30Z para la 08.
3. **Ensayos.** Bomba el viernes o baja de Ana el jueves: la 07 ya no llega. Reapertura de la instalación 04 el jueves: su compromiso del miércoles pasa a tarde. Caída de la cuenta de pedidos A: más de diez compromisos quedan indeterminados y los de la cuenta B siguen en pie.
4. **Opciones.** Cruz aplaza la formación (480 minutos), bomba alternativa, mover la fecha de la 07 o dividir la instalación: cada una salva al Hotel Faro y no empeora ningún otro compromiso en los planes encontrados.
5. **Prioridad nueva.** Con el Hotel Faro por delante, quien se retrasa es Residencia Norte.
6. **Qué comprobar antes.** Con la fecha de la bomba equivalente sin confirmar, ese dato decide más que la duración del ticket 07: si llega el martes la alternativa funciona; si llega el viernes, no.

## Qué se probó

`npx tsx --test tests/operational-*.test.ts` → 53/53 (31 de CORE-1 + 22 nuevas). `npx tsc --noEmit -p .` → 0 errores en el repositorio.

- **Escenarios.** 322 generados (280 pequeños, 42 medianos) en siete clases; el motor real no viola ninguna propiedad. Las clases sanas (sano, evidencia antigua, vínculos ambiguos, confirmación tardía) dan 0 alertas en 184 casos; retraso de material 39/46, pérdida de capacidad 46/46 y fuente parcial 46/46 producen algo fuera de plazo o indeterminado.
- **Oráculo.** En más de cien escenarios pequeños con datos conocidos, el planificador coincide con la enumeración exhaustiva de CORE-1.
- **Motores defectuosos sembrados.** Cuatro envoltorios del motor real (ignora materiales, toma candidatos por confirmados, inventa duraciones, olvida la antigüedad): cada uno es detectado por su propiedad. Una traza manipulada a mano cae por doble ocupación y por «en plazo» sin terminar.
- **Minimización.** Un contraejemplo de 13 trabajos se reduce a 1 trabajo, 1 material, 1 recurso, 1 franja y 1 supuesto en 24 reducciones. El caso reducido es válido, falla con el motor defectuoso, pasa con el real y sale idéntico al repetir.
- **Mejora local.** Nunca empeora el plan de partida, es idéntica por semilla, y su evaluador rápido coincide con la simulación en la empresa y en 84 escenarios medianos (si difiriera, lanza un error en vez de devolver un plan).
- **Registro de ensayo.** Exportar y reabrir conserva todo; sin marca de hipótesis no valida; revisión nueva lo vuelve histórico sin perder lo comparado y bloquea la confirmación; el borrador de decisión es una `commitmentDecisionRequest` válida de un solo compromiso; repetir la anotación de la decisión no cambia nada y otra distinta se rechaza.
- **Mutantes.** 31 mutaciones en sitio sobre los seis módulos nuevos, restauradas por hash: 30 detectadas. La superviviente es equivalente: quitar la validación previa de un candidato en el minimizador no cambia nada porque el candidato inválido hace fallar el predicado, que ya está protegido.

Medición en este equipo: plan de la empresa completa 0,2–0,5 s; conflicto enfocado alrededor de 1 s; comparación de cuatro opciones alrededor de 1,5 s; sensibilidad con dos datos, dos valores y tres alternativas, 3,7 s. Todas ceden el control y se pueden cancelar.

## Hallazgos sobre CORE-1 que no puedo corregir aquí

1. **Objetivo.** Cuando un compromiso prioritario ya no llega, el objetivo actual (incumplidos por nivel y después penalización total) puede preferir dejarlo sin terminar dentro del horizonte si así salva a otros de nivel inferior. Es coherente con lo publicado y el oráculo lo confirma, pero no es lo que una persona espera de «prioritario». Propuesta para la revisión de CORE-1: penalización por nivel, antes de contar incumplidos del nivel siguiente.
2. **Búsqueda exacta en tamaño real.** Con 40 trabajos, la primera rama de la búsqueda deja once compromisos sin terminar; el plan útil sale de la mejora local. `planLarge` es el punto de entrada correcto para la empresa completa.
3. **Supuesto de duración.** Falta en el contrato; la sensibilidad lo aplica internamente con procedencia de supuesto.

## Límites

- **Sin prueba en tamaño real.** Todo plan de la empresa completa es `best-found`. Que una opción no mejore se rotula `no-better-plan-found`, no «dominada». Ejemplo real: una hora extra de Cruz el viernes resuelve el conflicto examinado en la proyección, pero la búsqueda no encontró un plan mejor para la empresa entera; no sé si existe.
- **Conflicto enfocado.** Examina hasta 6 compromisos (máximo 8) añadiendo rivales de uno en uno. Un conflicto que necesite más compromisos, o rivales que el orden heurístico no alcance, sale como `no-small-conflict`. Las relajaciones que lista resuelven solo lo examinado.
- **Comparación en tamaño real.** Solo opciones individuales, no combinaciones.
- **Sensibilidad.** Un dato cada vez; no detecta interacciones entre dos datos ausentes. Sin probabilidades por diseño.
- **Generador.** Jornadas regulares, un recurso por trabajo y trabajos que no parten jornada en el plan testigo. No genera ciclos, contradicciones ni reaperturas; esas rutas están cubiertas por pruebas dirigidas de CORE-1, no por escenarios.
- **Propiedades de persistencia.** «Repetir una decisión aceptada no crea un segundo efecto» y «reiniciar conserva decisiones y no ejecuta nada» solo están cubiertas en su parte pura. La parte real necesita el almacén de Codex.
- **Comprobación acotada.** 322 escenarios y dos fixtures no demuestran nada para cualquier empresa o tamaño.
- **Sin revisión ajena.** Código, oráculo, comprobador y mutantes son míos. No actualicé `CONTEXTO-PROYECTO.md` (sin reserva).

## Qué falta

1. Codex: acuerdo sobre los contratos (gemelo y registro), revisión independiente, almacén y rutas del registro, fijar el reloj del modelo por contexto.
2. Tercera puerta: «Ensayar mi semana» desde Hoy y Radar (Claude A), proyección de fuentes reales al modelo (Claude B), montaje, decisión confirmada y reinicio (Codex).
3. Cuarta puerta: segundo caso de negocio con el mismo núcleo.

## Huellas SHA-256

```
39e53e35d1818cc60d9cf356c289d087299d4dbabcfcccfdce490e81d31b12a8  shared/operational-company.ts
ea1db9341fc799f3ed313e74329791104cd0ec02795ff13354ceee399e1bd8bd  shared/operational-large.ts
4be67ceab755f61abf494af521590c7060673fef88dca4d6a4b78208f475065f  shared/operational-scenarios.ts
b3d145add2321c82cfaae6ce2b0315177914a192d4b127c40e2fedda651af0ee  shared/operational-properties.ts
a3e13a699027e80ed65932bb11e3be03b845481bdd9d7d7c017be0475d967afc  shared/operational-sensitivity.ts
f8e488542250f7eeee132a2198275074e461fc9b60806d87dd62d32a854b5e55  shared/operational-rehearsal.ts
d365265bd2483df4cc2615c535a66b340b740966ec3b5ac4550d773ff2cf592a  tests/operational-company.test.ts
cf78b089ac18a660f20b680d32fdbc1a70db64c87cc6de4bb284b6e5a6617ea7  tests/operational-scenarios.test.ts
ebec9c11e2dd74d11c476ea2853ee5da280c58b6011d027d9fb488a68b547628  tests/operational-sensitivity.test.ts
7f16cef93fb0b022b02d3d9de503579c4c3b9a7321f30ab26f190150b6823b34  tests/operational-rehearsal.test.ts
8413b1f422ee72d05eef33f6b088d4e05811b64de11e21ce25edd4f68231d4a9  coordination/plans/OPERATIONAL-REHEARSAL-RECORD-PROPOSAL.md
```
