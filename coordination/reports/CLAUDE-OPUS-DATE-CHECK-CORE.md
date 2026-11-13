# CLAUDE-OPUS-DATE-CHECK-CORE · Comprobar una fecha, paquete 1

11 de noviembre de 2026, Europe/Madrid. Sesión `claude-opus-5-5`. Encargo: `coordination/briefs/CLAUDE-OPUS-55-COMPROBAR-UNA-FECHA.md`, pegado por el usuario. Codex no había preparado una tarea de implementación; la registré yo con ocho rutas nuevas y avisé por el chat.

## Qué existe

| Archivo | Contenido |
| --- | --- |
| `shared/operational-inventory.ts` | Sobre versionado `planb-operational-inventory-v1`: SKU, lotes, llegadas, demandas con reserva y compatibilidad dirigida y explícita. Procedencia con revisión de fuente. Asignador por prioridad y comprobación de saldos con consumos reales. |
| `shared/operational-date-check.ts` | Motor `planb-operational-date-check-v1`: entrada validada, porción de cartera con el resto del plan fijo, protecciones como restricciones, alternativas individuales y combinadas, primera fecha sustentada por bisección, bloqueos explicados, ranking, matriz de escenarios, qué confirmar primero, revisión e invalidación. Generador con pasos cancelables. |
| `shared/operational-date-check-fixture.ts` | Caso Almacén Sur sobre la empresa 12/3/2/20/8, con cuatro ajustes documentados en la cabecera. Incluye la revisión posterior sin franja y tres pedidos extra: cabe, condicionado e inviable. |
| `tests/operational-date-check-oracle.ts` | Oráculo independiente sin imports del motor ni de `shared/`, y generador de instancias con semilla. |
| `tests/operational-inventory.test.ts` | 9 pruebas del inventario. |
| `tests/operational-date-check.test.ts` | 23 pruebas: tabla de aceptación, casos extra, oráculo, propiedades, permutaciones, cancelación y medida. |
| `coordination/plans/OPERATIONAL-DATE-CHECK-CONTRACT-PROPOSAL.md` | Contrato propuesto y seis decisiones para Codex. |

No se ha tocado ningún archivo ajeno. No hay App, servidor, persistencia ni montaje. `planb-operational-twin-v1` sigue igual, así que los ensayos ya guardados siguen siendo compatibles.

## Tabla de aceptación, con los valores que salen

Horas de Madrid. Solicitud de 12 equipos VRF para el viernes 13 a las 16:00, con acceso desde las 08:00 y 6 h 30 min con viaje. Protegidos: instalación 10 y entrega del lunes (pedido 20).

| Acción ensayada | Resultado del motor |
| --- | --- |
| Mantener reservas y turnos | No cabe el viernes (`conflict`, búsqueda completa). Primera fecha sustentada: **martes 17, 15:30**, apoyada en evidencia (reposición observada PO-77098). Bloqueos: faltan 4 unidades hasta el martes 09:00 (Frioval pendiente sin fecha); a Cruz le quedan 315 min el viernes y hacen falta 390, porque la instalación 10 protegida ocupa 165. |
| Usar 4 reservadas | Material disponible. La entrega del lunes queda corta hasta el martes 09:00: proyección el martes 10:30, protección rota. Sigue el bloqueo de personal. No hay fecha que respete las protecciones; el bloqueo es la protección, no el horizonte. |
| Confirmar solo la llegada (jueves 10:00) | El material deja de bloquear. Sigue el choque de horario. Primera fecha: lunes 16, 09:15. |
| Añadir solo la franja (jueves 13:00–16:00) | Con material, cabría el viernes a las 14:30 (`staffing.ok`). Siguen faltando 4 unidades. +180 min. Fecha: martes 17, 15:30. |
| Material y franja | **Cabe el viernes**, de 08:00 a 14:30, como `conditioned` a los dos cambios. Instalación 10: jueves 15:45. Entrega del lunes: sin cambios. Primera del ranking. |
| Revisión posterior sin franja | `assertCurrent` → `revision-changed`. El resultado anterior sigue legible. Al recalcular desaparecen las alternativas con franja y ninguna cumple el viernes sin ceder reservadas. |

**Qué confirmar primero:** que Frioval entregue **antes del lunes 16 a las 08:00**, que es cuando la necesita la reserva; después, la franja de Cruz. Hay más información en la matriz: si Frioval entrega el viernes a las 11:00, basta la franja; y ceder reservadas con la franja no rompe el lunes porque repone antes.

### Casos extra

| Caso | Resultado |
| --- | --- |
| Cabe (6 equipos el miércoles 18) | `verified`, sin condiciones ni bloqueos. |
| Señal ausente (duración sin visita técnica) | `conditioned`. `checkFirst` indica que cabe si dura **765 min o menos**: el viernes después de la 10 más el lunes, menos el viaje. |
| Inviable (2.900 min habilitados) | `conflict` con búsqueda completa. Sin fecha en el horizonte; bloqueo `horizon`. Cruz tiene 2.880 min. |
| Sin reposición conocida | Sin determinar (`conditioned`). Material `short`, con Frioval como llegada pendiente. |
| Existencias observadas hace casi 4 días (umbral: 1 día) | El caso «cabe» pasa a `conditioned` con `stale-evidence`. |
| Sustitución por el 14k | Rechazada: no hay compatibilidad declarada. Con el modelo B de Norte, que tiene 3 unidades con recuento parcial, el material es `impossible`. |
| Proteger la 07, que ya llegaba tarde | Se protege su fecha proyectada (lunes 16, 12:30) y el plan no la empuja más allá. |

## Pruebas ejecutadas

- `npx tsx --test tests/operational-inventory.test.ts tests/operational-date-check.test.ts`: **32/32**.
- **Oráculo:** 120 instancias comparadas con semilla fija. Coinciden la fecha pedida (cumple o no) y la primera fecha al minuto. Hay 78 descartadas porque el motor congela trabajos que terminan antes de la ventana y el oráculo los considera movibles. De las 120: 85 cumplen, 27 no tienen fecha en el horizonte y 34 tienen reservas cedidas.
- **Mutantes** sembrados en sitio con restauración verificada por SHA-256 (`scratchpad/mutants-dc.mjs`): **10/11** en la primera pasada. El superviviente, «una bisección a medias se rotula probada», motivó la prueba «si la bisección se queda a medias…». Comprobé que falla con ese mutante y pasa restaurado: **11/11**.
- **Propiedades:** saldo nunca negativo con los consumos reales en todas las alternativas, sin solapes por recurso, sin trabajo fuera de franja, identidad entre cuentas, compatibilidad dirigida y estabilidad ante permutaciones de trabajos, recursos, compromisos, lotes, llegadas, SKU, cambios y protecciones.
- **Tipos:** `tsc --noEmit -p .` sin errores en los archivos nuevos.
- **Pruebas `operational-*` existentes:** 77/83. Los seis fallos son las sondas independientes 325 (F4) y 330 (cuatro), que documentan hallazgos abiertos de Fable, y «fuentes: lo que el Radar no pudo leer…», de `tests/operational-rehearsal-mount.test.ts` (MOUNT, en corrección). Ninguno importa mis módulos; solo mis tres pruebas los importan. No ejecuté esa batería antes de crear mis archivos, pero son archivos nuevos que nada más importa.

## Medida con la empresa completa

40 trabajos, 5 recursos y 27 compromisos. La porción tiene 3 trabajos movibles y 27 fijos. Se evalúan 8 alternativas y 16 celdas de escenario en 66 búsquedas (760 nodos), todas completas, en **1,26–1,5 s** en este equipo. Es una medida, no una promesa. La mayor parte del tiempo se va en reconstruir la porción por alternativa (simulación completa del plan actual), no en buscar.

## Motor consumido (sin editar)

| Archivo | SHA-256 | Estado en el tablón |
| --- | --- | --- |
| `shared/operational-twin.ts` | `8c2c49e1fb33386f3af296d7b8f90ab014b127e7799d0069981676cc16e4cdb9` | CORE-1 R2, en corrección R3 |
| `shared/operational-simulation.ts` | `fc620125ef36b0e756a8056f9e5b970499c1a680f61c1c606f75bd30e5381748` | CORE-1 |
| `shared/operational-planner.ts` | `3c5ad39d23de17da64bd47b4c0704c6952e67bd9dbaff0baf1bde65044fd55e3` | CORE-1 R2, en corrección R3 |
| `shared/operational-company.ts` | `39e53e35d1818cc60d9cf356c289d087299d4dbabcfcccfdce490e81d31b12a8` | CORE-2, en corrección R2 |
| `shared/commitments.ts` | `126d44e05372c0ece060c6ef6b547ba6226543641d2e63b2222537a577901328` | aceptado |

Hay que cotejarlo con las versiones aceptadas antes de conectar el consumidor (paquete 0). El hallazgo F4 de 325, el orden de trabajos inciertos en `toPlan`, no afecta a mi porción: ordeno por ID y no hay trabajos inciertos en el caso. Un cambio de R3 en el planificador puede mover planes con empate, pero no las claves que comprueban mis pruebas.

## Límites

- **«Comprobado» significa dentro de la porción.** No se reorganiza lo que termina antes de la ventana ni lo que no comparte recurso o material. Está rotulado en `slice.frozenBefore` y lo decide Codex (punto 3 del plan).
- **ATP.** Una reserva protege su cantidad en su instante de necesidad. La alternativa estricta cambia la fila 3 (punto 1 del plan).
- Las demandas existentes sin reserva van por detrás de la solicitud. El oráculo no las genera.
- No hay transporte entre almacenes ni tiempo de preparación en la sustitución: el material de Norte cuenta como disponible en Norte.
- El planificador adelanta lo que puede: en «mantener», propone pasar la instalación 12 a Ana el miércoles. Aparece como `reassigned` en `affected` y no se aplica nada sin confirmar.
- La cancelación corta entre búsquedas, porque cada búsqueda pequeña no llega a los 256 nodos donde el planificador cede. Una búsqueda cancelada nunca afirma conflicto ni fecha probada.
- `checkFirst` ordena por cuántas alternativas que cumplen dependen de cada condición. No da probabilidades.

## Siguiente

`CLAUDE-OPUS-DATE-CHECK-FLOW` (paquete 2), registrada y reservada con once rutas nuevas: contrato HTTP, estado de ficción con revisión, montaje de servidor con registro local y confirmación idempotente, cliente, pantalla «Comprobar una fecha», pruebas de servidor con SQLite de archivo y reinicio, recorrido en Chromium y guion de montaje. `App.tsx`, `RadarHost.tsx`, `main.ts` y `runtime.ts` no se tocan: el montaje lo hace su propietario con el parche que dejaré.
