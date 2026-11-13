# A2 · Revisión independiente y compatibilidad del arnés

6/11/2026, Europe/Madrid. Se cotejaron las ocho huellas presentadas. El cambio de producto abre la ficha mediante la lectura revisada y monta la estrategia condicionada en el host. La revisión de este corte no pudo completar el banco DOM presentado por incompatibilidad con la R2 actual del arnés, que sigue bajo la reserva de Claude.

La preparación normal de `HoyHarness` falló en una raíz propia. Tras permitir el enlace local de dependencias que el sandbox rechazaba, la compilación terminó, pero `reset()` intentó crear `cases/001-e2e99365` sin que exista el directorio padre `cases`. Resultado `ENOENT`, log `tests/.tmp/a2-harness-independent.log`, raíz `tests/.tmp/hoy240-run-ac447c74`. No arrancó un servidor en este ensayo.

Además, la subclase de A2 busca el servidor con `path.join(this.root, 'server.mts')`. La R2 del arnés lo prepara en `path.join(this.root, 'priv', 'server.mts')`. Una vez resuelta la preparación, hay que actualizar esa extensión sobre el punto vigente y repetir el banco en una raíz nueva. Las dos rutas del arnés pertenecen a `CLAUDE-HOY-APP-PROBES-A`; A2 conserva la suya y debe coordinar con ese dueño.

Dictamen de corrección de pruebas y traspaso antes de aceptar A2. Repetir los casos de conflicto, segundo guardado y reapertura con el arnés actual y cotejado. Añadir el recorrido nuevo del comparador a 390/320 px en App con teclado y foco. El informe original declara esas anchuras pendientes. El filtro Por decidir queda en una unidad posterior con reserva propia. A3 solo podrá editar LocalOperations tras la aceptación de A2, pues presentar una unidad conserva su reserva.

La propuesta de negociar el modo mediante health requiere una unidad de contrato independiente. Se conserva el requisito de que un error del servicio condicionado no active escrituras por el endpoint anterior. Los fallos de preparación observados no prueban un fallo del guardado de producto. La aceptación exige evidencia ejecutable del corte compartido.

## R2 · Ficha aceptada sobre el arnés vigente

7/11/2026, Europe/Madrid. El arnés presentado ahora crea el directorio padre y mantiene `root/server.mts`, cuyos imports apuntan a la copia privada del servidor. Se cotejaron las ocho huellas de A2 y las tres de PROBES R2 antes de ejecutar. La preparación y los catorce recorridos terminaron correctamente sobre una raíz nueva, incluida la interacción a 390/320 px con teclado, foco y recuentos de escrituras. Se inspeccionó la captura de 320 px.

La primera ejecución independiente dio 13/14 en `tests/.tmp/hoy-a2-r2-independent-UqOlmL`. Su configuración temporal omitía `actionTimeout: 12000`, que sí tiene el repositorio. El clic opcional en Ver detalle agotó los 120 segundos del caso antes de continuar. La repetición completa con ese parámetro normal pasó 14/14 sin reintentos en `tests/.tmp/hoy-a2-r2-standard-xrlDSi`, 80,67 segundos. Se conservan ambos resultados. No se cambió el producto para ese ajuste de configuración.

Dictamen favorable para la ficha condicionada, comparador y reapertura de intento de A2. La App compilada usa el servidor del arnés con la ruta revisada, SQLite de archivo nuevo por caso y red externa bloqueada. El filtro Por decidir, la persistencia A4 y el recorrido sobre main compilado mantienen su alcance separado. Las especificaciones históricas con la ruta anterior requieren su actualización explícita. Se libera la reserva de A2 para que Jornada pueda tomar LocalOperations mediante su propio claim.
