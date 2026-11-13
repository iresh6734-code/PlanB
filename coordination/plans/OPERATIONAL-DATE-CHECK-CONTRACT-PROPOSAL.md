# Comprobar una fecha · propuesta de contrato

11 de noviembre de 2026, Europe/Madrid. Unidad `CLAUDE-OPUS-DATE-CHECK-CORE`, encargo `coordination/briefs/CLAUDE-OPUS-55-COMPROBAR-UNA-FECHA.md`. **Es una propuesta.** Nada de esto está montado, persistido ni aceptado. Codex decide los puntos del último apartado antes de que la App lo consuma.

## Qué añade y qué no toca

| Formato | Módulo | Papel |
| --- | --- | --- |
| `planb-operational-inventory-v1` | `shared/operational-inventory.ts` | Sobre aparte con SKU, lotes, llegadas, demandas, reservas y compatibilidad. Libro de saldos y asignador. |
| `planb-operational-date-check-input-v1` | `shared/operational-date-check.ts` | Entrada de una comprobación: modelo del gemelo con plan actual, inventario, solicitud, política, cambios declarados y escenarios. |
| `planb-operational-date-check-v1` | ídem | Resultado: alternativas, ranking, matriz por escenarios y qué confirmar primero. |

`planb-operational-twin-v1` no cambia. Un ensayo guardado con el formato anterior sigue siendo válido tal cual. El inventario viaja junto al modelo y no dentro de él. El motor consume `operational-twin`, `operational-simulation` y `operational-planner` sin editarlos. Las huellas consumidas figuran en el informe.

## Inventario

Cada dato es un hecho `known`, `unknown` o `contradictory`, igual que en el gemelo. La procedencia observada añade `sourceRevision`. Dos lecturas de la misma cuenta en revisiones distintas son dos observaciones. La identidad de fuente es `(provider, accountId, kind, remoteId)`. El mismo ID remoto en otra cuenta es otro objeto. La misma identidad dos veces se rechaza.

- **Existencias** (`lots`): cantidad en el instante del reloj. Desconocida no vale cero ni infinito. Cuenta como entrada posible de cantidad desconocida.
- **Llegadas** (`inbound`): cantidad y fecha, cada una con su estado. Si falta cualquiera de las dos, la llegada no cuenta como disponible. Sí aparece como dato que cambiaría el resultado.
- **Demandas** (`demands`): consumo de un trabajo del gemelo. Si llevan `reservation`, son una reserva ya hecha en la fuente.
- **Compatibilidad**: solo la declarada. Es dirigida: que B sustituya a A no implica que A sustituya a B. Un nombre parecido no crea compatibilidad.

### Semántica del saldo

Las demandas consumen cuando su trabajo **empieza**. En un mismo instante entran antes las llegadas que los consumos. Un plan es válido si ningún almacén y SKU queda con saldo negativo en ningún instante. `checkBalances` lo verifica después de planificar con los inicios reales.

### Asignación antes de planificar

Para que el planificador trate el material como una fecha, cada demanda recibe el primer instante `t ≥ necesidad` con `min_{t' ≥ t}(entradas(t') − asignado(t')) ≥ cantidad`. El orden es: reservas protegidas, por necesidad e ID; después la solicitud; al final las partes de reserva cedidas y las demandas sin reserva.

**Decisión de semántica que conviene validar:** una reserva protege su **cantidad en su instante de necesidad**, no unidades físicas concretas. Si hay una reposición conocida antes de esa necesidad, la solicitud puede usar unidades reservadas sin dejar corta la reserva. Es el criterio habitual de disponible para prometer (ATP). En el caso Almacén Sur, por eso Frioval puede entregar hasta el **lunes 16 a las 08:00** y no hace falta que llegue antes del viernes.

Resultados de una demanda: `allocated`, con fecha; `short`, si con lo conocido no cabe pero una entrada desconocida podría cubrirla; e `impossible`, si ni sumando las entradas de cantidad conocida alcanza y no hay ninguna de cantidad desconocida.

## Comprobación

### Entrada

- `request`: ID propio (no puede coincidir con un trabajo o compromiso existente), fuente opcional, fecha pedida, ventana (inicio y fin opcional), duración y viaje como hechos, habilidades, hasta cuatro materiales con cantidad como hecho y quién lo pide.
- `policy.protected`: compromisos cuya fecha protege la persona. `policy.tiers`: orden opcional de los demás. El motor no asigna importancia comercial.
- `offers`, hasta cuatro: `use-reserved` (ceder N unidades de una reserva), `confirm-arrival` (fecha de una llegada), `add-slot` (franja extra de un recurso) y `substitute` (SKU compatible, quizá de otro almacén). Ninguno está autorizado por aparecer.
- `scenarios`, hasta cuatro: llegada con fecha, retirada de un cambio declarado y ausencia de un recurso.

### Porción de cartera

Se simula el plan actual completo con el material de las demandas existentes. Se pueden mover: los trabajos de los recursos capaces de hacer la solicitud que terminan después del inicio de su ventana, los que consumen del mismo almacén y SKU, y su cierre por dependencias y compromiso. Todo lo demás conserva su horario y ocupa la agenda como tiempo bloqueado. Un predecesor fijo ya terminado se convierte en inicio mínimo. Un trabajo fijo sin horario conocido deja sin usar el tiempo de su recurso desde donde podría empezar, y queda señalado (`unknown-frozen-work`).

Esto es una **restricción declarada del modelo**: no se reorganiza lo que ya termina antes de la ventana ni lo que no comparte recurso o material. «Comprobado» significa comprobado dentro de esa porción. El límite publicado es de 16 trabajos movibles; por encima, la entrada se rechaza con `limit`.

### Objetivo y protecciones

El planificador busca sobre la porción con niveles `[protegidos][solicitud][resto según la política]`. Proteger significa:

- un compromiso en plazo en la línea base conserva su fecha comprometida;
- un compromiso que **ya llegaba tarde** conserva su **fecha proyectada actual**. No se da por perdido. Con el objetivo lexicográfico simple, un compromiso ya incumplido cuenta igual tarde o muy tarde, y el planificador podría retrasarlo sin límite para salvar otros. El ejemplo y la prueba están en `tests/operational-date-check.test.ts` (instalación 07, bomba retenida);
- lo indeterminado no se puede proteger con una fecha. Queda fuera del nivel y se informa.

El **suelo de protecciones** es lo que se incumple con el cambio declarado aunque no exista la solicitud. Una alternativa cumple la fecha pedida si no incumple más protecciones que su suelo y la solicitud llega a tiempo. Si la búsqueda del suelo no termina, se usa 0, que es conservador.

### Primera fecha sustentada

Se calcula por bisección sobre el plazo de la solicitud, entre la ventana más el trabajo (o la llegada del material) y el horizonte o la terminación tardía del plan de la fecha pedida. Cada «cabe» tiene un plan testigo simulado. Cada «no cabe» exige búsqueda completa; si alguna se agota, `supported.proven = false`.

### Clases de resultado para la fecha pedida

| Clase | Significado |
| --- | --- |
| `verified` | Hay un plan testigo sin cambios declarados, sin datos desconocidos y sin evidencia antigua o parcial en lo que lo sostiene. |
| `conditioned` | Cabe solo si se confirman los cambios declarados, o depende de un dato desconocido, antiguo o parcial. |
| `conflict` | La búsqueda completa demuestra que, con estos datos, no cabe sin romper una protección. |
| `incomplete` | Búsqueda agotada o cancelada. No se afirma nada. |

### Explicación

Cada alternativa devuelve bloqueos derivados del cálculo:

- `material`: demanda, almacén y SKU, cuándo haría falta, cuándo llega, qué entrada lo permite, unidades que faltan y llegadas pendientes;
- `staffing`: minutos libres de los recursos habilitados entre la ventana y la fecha pedida, minutos necesarios y qué trabajos los ocupan en el mejor plan sin restricción de material;
- `protection`: protección rota con su fecha proyectada y sus causas;
- `horizon`.

También devuelve los compromisos que mejoran, empeoran o terminan más tarde o más pronto, con las reasignaciones propuestas; las reservas cedidas y hasta cuándo queda corta la reserva; los minutos añadidos; el plan de la porción; y el recuento de violaciones de saldo, que debe ser cero.

### Ranking y qué confirmar primero

El ranking ordena por: protecciones rotas; fecha pedida (cumple, desconocido, no cumple); primera fecha sustentada; compromisos que empeoran; número de cambios; minutos añadidos; y unidades reservadas cedidas. Para la mejor alternativa que cumple sin romper protecciones, `checkFirst` lista cada condición con las alternativas que dependen de ella. Para una llegada calcula **la última fecha que todavía sirve**. Si la solicitud tiene la duración ausente, calcula la duración máxima que todavía cumple.

### Revisión e invalidación

`dateCheckRevision(input)` es el SHA-256 del JSON canónico de la entrada. Cualquier cambio de cartera, recursos, reservas, cambios declarados o escenarios la cambia. `assertCurrent(result, input)` responde `revision-changed` con la revisión vigente. El resultado anterior sigue siendo legible: es dato, no estado.

## Lo que Codex debe decidir

1. **ATP frente a unidades físicas.** ¿Se acepta que una reserva proteja su cantidad en su instante de necesidad? La alternativa más estricta (retener unidades físicas) es una línea en el asignador, pero cambia la fila 3 del caso: Frioval tendría que llegar antes del viernes.
2. **Demandas existentes sin reserva.** Hoy van por detrás de la solicitud. Si deben ir delante, son otra clase.
3. **Porción con resto fijo.** ¿Es aceptable como modelo de producto, rotulado «el resto de la cartera conserva su horario»? La alternativa es planificar toda la empresa con `planLarge`, que en tamaño real queda en `best-found`.
4. **Persistencia.** El registro local de la comprobación (entrada, resultado, revisión, alternativa elegida y siguiente paso con clave de operación) debe vivir en el almacén que Codex decida. Propuesta: un registro hermano del ensayo de Fable (`planb-operational-rehearsal-v1`), no dentro de él, porque la comprobación no está ligada a un compromiso del Radar existente.
5. **Reloj.** La revisión incluye `clock.now`. Un recálculo en otro momento es otra revisión. Igual que en el ensayo de Fable: conviene fijar el reloj por contexto.
6. **Ubicación de la entrada en la navegación.** Hoy o Radar: la decide el propietario de `App.tsx` y `RadarHost.tsx`.
