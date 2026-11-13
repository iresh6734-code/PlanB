# CLAUDE-FABLE-OPERATIONAL-CORE-1 · Gemelo operativo, primera puerta

10/11/2026, Europe/Madrid. Autor: Claude. Misión: `coordination/briefs/CLAUDE-FABLE-5-2-GEMELO-OPERATIVO-2026-11-10.md`, pegada por el usuario en esta sesión.
Modelo: el arnés de la sesión declara `claude-fable-5-2` (dato del cliente, no autoafirmación; no se ha contrastado con facturación). Esfuerzo configurado por el cliente; sin subagentes ni delegación.

## Resumen

Existe un núcleo puro y probado que simula un plan, busca el mejor plan bajo restricciones, compara respuestas, explica por qué algo no cabe y dice qué tendría que cambiar. Coincide con un oráculo exhaustivo independiente en 160 casos generados y en la fixture con sus ramas. **No está montado, no persiste nada y el contrato es una propuesta sin acordar.** Cubre la primera puerta de la misión; las puertas segunda, tercera y cuarta no están hechas.

## Qué existe

| Archivo | Contenido |
| --- | --- |
| `shared/operational-twin.ts` | Contrato propuesto `planb-operational-twin-v1`, clases de conocimiento, `Fact<T>`, supuestos, `applySuppositions`, revisión SHA-256 pura, límites publicados |
| `shared/operational-simulation.ts` | `compileModel`, `simulatePlan` (eventos discretos), `comparePlans` |
| `shared/operational-planner.ts` | `planSchedule`, `compareAlternatives`, `explainConflict`, `whatWouldMakeItWork`, versiones `…Steps` cancelables y `runCancellable` |
| `shared/operational-fixtures.ts` | Ficción «la instalación del viernes» (inviable y sana), cuatro opciones y cuatro perturbaciones |
| `tests/operational-oracle.ts` | Oráculo exhaustivo; no importa el motor |
| `tests/operational-*.test.ts` | 31 pruebas |
| `coordination/plans/OPERATIONAL-TWIN-CONTRACT-V1-PROPOSAL.md` | Contrato y seis decisiones que pido a Codex |

No se tocó ningún archivo existente. Sin dependencias nuevas, sin red, sin cuentas, sin datos reales.

## La demostración, hoy, como funciones

Empresa ficticia pequeña: 3 técnicos, 2 almacenes, 3 materiales, 4 compromisos, 5 trabajos (2 instalaciones, 2 pedidos, 1 ticket). No es todavía la de 12/3/2/20/8.

1. **Por qué el plan actual no cabe.** Con el plan declarado, la instalación Norte termina el lunes 16 a las 11:30Z, 4110 minutos tarde. Cadena derivada de la traza: ticket ← instalación Norte ← técnico ocupado en la Urgente ← el cliente de la Urgente solo da acceso desde el jueves. Cada dato usado conserva su procedencia.
2. **Conflicto.** Norte, Urgente y Pedido Sur no caben juntos. Conjunto irreducible verificado por el motor y, aparte, por el oráculo: los tres no caben; quitando cualquiera, sí. Restricciones activas: Ana, Cruz y la bomba retenida.
3. **Ensayar.** Retraso de material, baja de Ana el jueves, caída de la cuenta de pedidos A y reapertura de un trabajo. La caída de fuente deja Norte y Pedido Sur como indeterminados, no como incumplidos ni como sanos.
4. **Comparar.** Cinco alternativas no dominadas: sin cambios (un incumplimiento), una hora extra de Cruz el jueves, bomba alternativa, mover la fecha de Norte, dividir la instalación. Las once combinaciones restantes quedan descartadas por pedir más sin lograr más. Ninguna se presenta como autorizada.
5. **Qué tendría que cambiar.** Para Norte conservando las otras dos: fecha mínima lunes 16 11:00Z, o la bomba como tarde el miércoles 11 a las 11:30Z (hoy llega el jueves 07:00Z), o cualquiera de las cuatro opciones. La fecha de material es exacta dentro del modelo: a las 11:30 cabe y a las 11:31 no, comprobado con motor y oráculo.
6. **Prioridad.** La elige la persona. Con Norte primero se retrasa la Urgente; con Urgente y Pedido primero se retrasa Norte.

Los puntos 6 y 7 de la misión (confirmar una decisión sobre revisión vigente, reiniciar, reabrir y distinguir simulación, decisión y resultado observado) **no existen**: necesitan persistencia y montaje de Codex.

## Qué se probó

`npx tsx --test tests/operational-twin.test.ts tests/operational-simulation.test.ts tests/operational-planner.test.ts` → 31/31. `npx tsc --noEmit -p .` → 0 errores en todo el repositorio.

- **Oráculo.** 160 casos con semilla fija (3 a 6 trabajos, 2 recursos, franjas, materiales, dependencias confirmadas y candidatas, niveles de prioridad): la clave del planificador coincide con el mínimo de 141 062 planes enumerados por el oráculo; 132 casos con algún incumplimiento y 28 sanos. Además la fixture, sus cuatro opciones y tres perturbaciones, con tres objetivos cada una. El oráculo evalúa con una línea de tiempo de minutos, técnica distinta de la del motor.
- **Semilla.** Con exploración completa, el desempate sembrado no cambia el óptimo.
- **Monotonía.** En 60 casos, añadir una dependencia, quitar una franja, retrasar un material o retrasar un inicio nunca mejora el resultado.
- **Invariantes sobre la traza** (fixture, ramas y planes del planificador): un técnico no hace dos trabajos a la vez; ningún trabajo empieza sin su material, antes de sus dependencias, fuera de franja o sin la habilidad; «en plazo» exige todos los trabajos terminados; el resultado nunca dice «cumplido».
- **Conocimiento.** Duración, material y horario desconocidos o contradictorios dan `indeterminate` y se propagan; vínculo candidato no retrasa nada; evidencia antigua, futura o parcial queda señalada; compromiso sin trabajos es indeterminado.
- **Identidad.** Dos pedidos «1001» de cuentas distintas no se fusionan; la caída de la cuenta A no toca lo que acredita la B.
- **Ramas.** Bifurcar no modifica el origen (entradas congeladas con `Object.freeze` profundo); una rama conserva `hypothetical:true` y la revisión base al serializar y releer; el esquema de entrada rechaza una rama.
- **Determinismo.** Misma entrada, mismo JSON de salida en simulación y en comparación de alternativas.
- **Límites.** Con presupuesto agotado: `best-found`, nunca `proven-within-model` ni `verified-irreducible`. Con límite de eventos: simulación incompleta y lo pendiente indeterminado. Cancelación: la búsqueda cede cada 256 nodos y devuelve lo explorado.
- **Mutantes.** 25 mutaciones en sitio sobre mis tres módulos (cota no admisible, orden canónico, colocación, dominancia, filtro de conflicto, bisección, compuertas de material y dependencia, candidatos, antigüedad, identidad de cuenta, clonado, revisión base…), restauradas por hash: 25/25 detectadas.

Medición en este equipo, modelo sintético de 40 trabajos y 3 recursos: 2 000 nodos 63 ms, 20 000 nodos 147 ms, 200 000 nodos 1,5 s; en los tres casos exploración incompleta y `best-found`.

## Límites y riesgos conocidos

- **Tamaño.** La búsqueda es exacta en problemas pequeños. Con 40 trabajos agota el presupuesto y devuelve una solución de despacho mejorada, sin prueba de optimalidad; entre 2 000 y 200 000 nodos mejoró la penalización un 12 % y ningún incumplimiento. La fixture 12/3/2/20/8 necesitará una mejora local (vecindarios) además de la poda; no está hecha.
- **Conflicto en tamaños grandes.** `explainConflict` reparte el presupuesto entre comprobaciones; con muchos compromisos devolverá `explanatory` o `unknown`. No se ha medido en la fixture grande.
- **Bisección de material.** Supone que recibir antes nunca perjudica. Es cierto con búsqueda completa; con búsqueda incompleta la condición sale con `proven:false`.
- **Modelo.** Un recurso por trabajo, desplazamiento como tiempo fijo por trabajo, sin cantidades de stock, sin coste económico, sin preferencias entre técnicos. El coste extra se cuenta en minutos pedidos, se usen o no.
- **Trabajos indeterminados no reservan capacidad.** El plan no guarda hueco para un trabajo de duración desconocida; se informa como indeterminado, pero un plan «en plazo» para otros puede dejar de serlo cuando ese dato se conozca. Debe verse en la interfaz.
- **Presupuesto de nodos.** El contador puede pasar del presupuesto en una unidad por búsqueda.
- **Sin revisión ajena.** Nadie más ha leído este código. Las pruebas, el oráculo y los mutantes son míos.
- **Contexto.** No actualicé `CONTEXTO-PROYECTO.md`: no lo tengo reservado. Codex debe registrar esta entrega.

## Qué falta

1. Acuerdo de Codex sobre el contrato (seis decisiones en el plan) y revisión independiente del motor por el otro Codex.
2. Segunda puerta: fixture 12/3/2/20/8, generador de escenarios con fuentes viejas y parciales, minimización de contraejemplos, «qué conviene comprobar antes de decidir», registro local de ensayo con contrato aprobado.
3. Tercera puerta: «Ensayar mi semana» desde Hoy y Radar (Claude A), proyección de fuentes (Claude B), persistencia, rutas y montaje (Codex), decisión confirmada sobre revisión vigente y reinicio.
4. Cuarta puerta: segundo caso de negocio con el mismo núcleo.

## Huellas SHA-256 de la entrega

```
3ca0c94f7e2f29e1f8366150952454e43e6e76e1bfc0ecd9bb69101a7f243d60  shared/operational-twin.ts
fc620125ef36b0e756a8056f9e5b970499c1a680f61c1c606f75bd30e5381748  shared/operational-simulation.ts
eb969e9d159d9b5ac44052112e5dde12f51670e59635bd3f3155bb3a371752af  shared/operational-planner.ts
8e607402e74da49241df34a983261153829aa80ee16c01910006f229735d2033  shared/operational-fixtures.ts
a206158b2d3140b2a32670aa7a6489f71ad5d477a151f6f0942dacda6ec62e49  tests/operational-oracle.ts
e17c3346b636307428c6d73826b2da0e9a1c8e1a2baf7133a7a503a52442b752  tests/operational-twin.test.ts
ae4f7285c24608f77a6beae06c09771b4984301af5497f48039c91eebdcc94a3  tests/operational-simulation.test.ts
dc5fa06a8e76c8a0434eda625908c3357d1902a6a764a6a912f3c56d724b4bbe  tests/operational-planner.test.ts
e909751f11545fd10e38691192ac5d714eda77ad07076a95a84aebb3b1a604a9  coordination/plans/OPERATIONAL-TWIN-CONTRACT-V1-PROPOSAL.md
```

---

## R2 · respuesta a la revisión independiente 325

10/11/2026. Dictamen: `coordination/reviews/CLAUDE-FABLE-OPERATIONAL-CORE-1-independent-325.md`. Sonda del revisor: `tests/operational-core-independent-325.test.ts`, sin editar, 4/4.

| Hallazgo | Corrección | Dónde |
| --- | --- | --- |
| F1 · conflicto falso por capacidad desconocida | La comprobación de incertidumbre recorre el mismo cierre de dependencias confirmadas que la búsqueda. Un predecesor de otro compromiso con horario desconocido deja indeterminado al que depende, con la causa (`unknown-capacity`, trabajo y recurso). Horario conocido sin huecos sigue siendo falta real de capacidad y da conflicto. Además el plan devuelto deja en cola lo que depende de un trabajo de capacidad desconocida, para que la simulación lo proyecte como indeterminado y no como «sin sitio en el plan». | `indeterminate` y `toPlan` en `shared/operational-planner.ts` |
| F2 · horizonte admitido que el motor rechaza | El contrato exige al menos un minuto completo de horizonte, igual que el motor. | `operationalModel` en `shared/operational-twin.ts` |
| F3 · consulta interrumpida en el límite de supuestos | Superar el máximo es `OperationalInputError('limit')`, no `ZodError`. `whatWouldMakeItWork` devuelve `unexplored[]` con lo que no pudo probar; `explainConflict` marca la relajación como `not-explored`; `compareAlternatives` la descarta como `not-explored`. En los tres casos `search.complete` es falso. | ambos archivos |

Cambios de contrato: campo nuevo `WhatWouldWorkResult.unexplored`; valor nuevo `'not-explored'` en `ConflictResult.relaxations[].effect`.

Verificado: `npx tsx --test tests/operational-*.test.ts` → 71 de 73; las dos que fallan son las sondas 327 del montaje, que corresponden a otra unidad. Las 31 originales de esta unidad, las tres regresiones R2 nuevas (en `tests/operational-planner.test.ts`) y las cuatro sondas 325 pasan. `tsc` 0 errores. Ocho mutantes sobre las correcciones, restaurados por hash: 8/8 detectados. CORE-2 y SERVICES repetidos sobre el corte corregido: en verde, sin editar sus archivos.

Huellas que cambian respecto a la lista anterior (las demás siguen igual):

```
8c2c49e1fb33386f3af296d7b8f90ab014b127e7799d0069981676cc16e4cdb9  shared/operational-twin.ts
3c5ad39d23de17da64bd47b4c0704c6952e67bd9dbaff0baf1bde65044fd55e3  shared/operational-planner.ts
0f4b0a61ba3a9c2e5fc88d68574fa1189ce007682e0718e0b7da290113c58f12  tests/operational-planner.test.ts
```
