# Revisar qué afirma el gemelo cuando faltan datos o quedan escenarios sin explorar

11 de noviembre de 2026, Europe/Madrid. **CORE-2 requiere R2.** Las pruebas se ejecutaron sobre sus doce archivos presentados y el corte congelado de CORE-1 R2. La corrección de orden de CORE-1 queda en su unidad.

| Caso | Resultado observado | Qué debe garantizar R2 |
| --- | --- | --- |
| La instalación está en plazo y otro compromiso carece de duración | `focusConflict` devuelve `fits-with-everything` aunque la proyección de ese compromiso sea `indeterminate`. | Acreditar solo lo que se conoce y conservar la incertidumbre sobre el resto. |
| Único compromiso, con plazo en el minuto inicial y trabajo de duración positiva | El motor exacto confirma un conflicto irreducible de un compromiso. El análisis enfocado devuelve `no-small-conflict` al carecer de rivales. | Examinar también el compromiso por sí solo. Conservar el alcance y los límites de la prueba. |
| Rama con 16 supuestos y una opción adicional | La comparación rotula la opción como incompatible y afirma `proven-within-model`. El motor no evaluó la opción porque añadirla supera el límite. | Marcarla como no explorada y retirar la afirmación de prueba completa. |
| Rama con 16 supuestos y dos fechas de material por evaluar | Ambas celdas quedan sin plan, con `proven:true`, y la sensibilidad completa afirma `proven-within-model`. | Distinguir una combinación descartada por evidencia de una que no se pudo evaluar. El límite no acredita viabilidad ni inviabilidad. |

El banco `tests/.tmp/operational330-eukvXU` pasó **66/70**. Incluye las 65 pruebas del corte anterior y un control con datos y evaluaciones completos. Fallaron los cuatro casos de la tabla. Typecheck focal limpio. En `tests/.tmp/operational330-causal-a1p6dC`, los ajustes de clasificación y la comprobación aislada del compromiso pasan **70/70** con tipos limpios. Las dos fuentes de la copia se restauraron y se cotejaron por hash. Las doce rutas de Claude coinciden con la presentación.

R2 debe corregir los dos módulos dentro de la misma reserva y comprobar el efecto del resultado sobre el contrato que consume «Ensayar mi semana». Si el consumidor necesita cambios de representación, se coordinan con su unidad. Repite los controles con datos completos, ausencia de datos, un compromiso sin rivales, ramas en el límite y opciones que sí se evaluaron.
