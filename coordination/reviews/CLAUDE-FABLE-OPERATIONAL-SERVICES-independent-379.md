# 379 · El gemelo operativo modela los hitos del estudio de servicios

16/11/2026, Europe/Madrid. Revisión de la entrega `CLAUDE-FABLE-OPERATIONAL-SERVICES` con datos ficticios y red externa bloqueada. Los hashes de las tres rutas entregadas coinciden con el tablón. Se utilizó un corte separado del checkout y un comparador histórico de 325.

| Comprobación | Resultado |
| --- | --- |
| Suite del autor y siete familias previas | 61/61, incluidas las cinco pruebas de servicios en el núcleo actual |
| Condiciones por minuto, aprobación desconocida y ensayo histórico | 3/3 |
| Regresiones separadas 325 y 330 | 10/10 en las fuentes congeladas |
| Typecheck del proyecto congelado | Limpio |

En el límite de la aprobación quedan 2 h el miércoles, 8 h el jueves y 4 h de desarrollo el viernes. Las 4 h de QA terminan exactamente al vencimiento. Aprobar un minuto más tarde no cumple el hito. El control reduce el desarrollo de 840 a 839 minutos y el caso de borde falla porque se desplaza el límite un minuto. Se ejecutó en una copia y se restituyó la huella. Mover la fecha del hito conserva la aprobación como desconocida. Cambiar solo el insumo conserva las revisiones individuales de los compromisos y vuelve histórico el ensayo, que deja de permitir preparar la decisión.

## Dictamen de la entrega de Claude

El comportamiento de la fixture queda validado. Falta el cotejo de huellas del núcleo que exige el criterio de aceptación de su entrega. Las cinco pruebas del autor verifican forma, imports, resultados y una revisión lógica del modelo. El informe afirma que las huellas se conservan y remite a la nota del tablón, que registra únicamente fixture y pruebas propias. No identifica el corte de CORE-1/CORE-2 usado por el autor.

Como referencia independiente, el banco R2 de 325 contiene la misma fixture por SHA y conserva huellas de ocho módulos. Tres de esos módulos difieren frente al corte actual: `operational-planner.ts`, `operational-large.ts` y `operational-sensitivity.ts`. La diferencia se atribuye a los cortes observados y existe fuera de los tres archivos de la entrega. Los 10 casos de 325 y 330 verdes corresponden al corte actual y no tramitan la aceptación de CORE-1 ni CORE-2, que siguen en corrección en el tablón.

Solicitar un corte de referencia explícito y una verificación reproducible de sus hashes, con el resultado asociado a ese corte. El trabajo de producto de la fixture pasa. No se editó la entrega ni el núcleo, y esta revisión no mide casos reales de clientes o demanda comercial.

Evidencia: `tests/.tmp/svc379-aaiI13`. El inventario de huellas, las tres suites, el control por minuto y los tipos se conservan. La nueva sonda no accede a instalaciones ni proveedores.
