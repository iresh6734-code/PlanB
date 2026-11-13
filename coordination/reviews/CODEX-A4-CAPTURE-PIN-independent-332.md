# A4 · Una lectura puede mezclar dos copias con la misma identidad visible

11 de noviembre de 2026, Europe/Madrid. Revisión independiente 332 de la ficha de tarea y del contexto que necesitará A4 antes de montarse en Hoy.

Dos importaciones ficticias conservan instancia, identificador de captura, fecha de captura, cuenta, modo ficticio y fecha de generación. La segunda solo cambia las notas de task-2. El servidor calcula una huella de contexto diferente para cada copia.

| Comprobación | Corte de referencia | Ajuste aislado |
| --- | --- | --- |
| Sustituir la copia tras el GET de la revisión y antes del último GET de estado | La ficha devuelve `read`. | La ficha devuelve `context-changed`. |
| Sustituir la copia entre la apertura y la verificación de un intento. La nueva copia ya contiene las notas esperadas. | El cliente devuelve una lectura como evidencia de la verificación. | El cliente devuelve `context-changed`. |
| Abrir y verificar sin sustituir la copia | Lectura disponible, evidencia `unchanged`. | Mismo resultado. |

El arnés usa Fastify real por `inject`, SQLite en memoria, el cliente contextual de producción y solo GET. Tras el reemplazo, el servidor A4 devuelve 409 si se consulta la lista con la huella anterior. En el control devuelve 200. El historial permanece vacío en los tres casos. El ensayo cubre lectura y verificación. La protección del token de revisión del servidor se mantiene en las pruebas existentes.

- `tests/.tmp/capture-pin332-AVCWoK` pasó 16/18. Fallaron los dos casos de reemplazo con `read` donde se esperaba `context-changed`. El control y las 15 pruebas de estrategia anteriores pasaron. Typecheck focal limpio.
- `tests/.tmp/capture-pin332-causal-Q8dgg9` pasó 18/18 con typecheck focal limpio. El ajuste guarda la huella publicada en el mismo estado, valida su asociación con la identidad pública y la compara entre observaciones. Se restauraron las tres fuentes temporales y se comprobaron las 333 huellas de cada banco.
- El primer arnés perdía Content-Type en el puente HTTP. Se corrigió para trasladar el encabezado de Fastify. Los resultados definitivos corresponden a esa corrección. Una suite histórica adicional de 183 divergía de su hash registrado y quedó fuera de ambos bancos.

## Alcance de la corrección

Conservar la huella observada al abrir la ficha y comprobarla antes de guardar, al verificar y al releer tras un acuse compacto. El montaje A4 debe usar esa huella original y comprobar que el contexto vigente sigue siendo el mismo. Si la huella cambia, falta tras haberse observado o contradice la identidad visible, pedir una nueva lectura y conservar el borrador con su procedencia. La ruta de revisión anterior debe seguir funcionando cuando el servidor anterior no anuncia huella. El ajuste causal solo prueba las dos sustituciones y el control, y no cubre toda la compatibilidad o los estados mixtos de una entrega.

Coordinar con 323 y 329 porque sus suites registran huellas de algunos clientes y tipos afectados. Añadir controles de compatibilidad, desaparición de huella y relectura posterior al acuse. Las reservas de producto y los archivos de Claude se conservaron. Falta la corrección compartida y su recorrido desde Hoy en navegador.
