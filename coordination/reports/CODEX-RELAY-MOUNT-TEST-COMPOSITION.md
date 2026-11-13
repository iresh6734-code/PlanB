# Composición de pruebas de Relevo tras montar main

7/11/2026, Europe/Madrid. Se adaptó únicamente `tests/e2e/relay-packaged.spec.ts`, aceptada antes como parte de 254. El banco deja de insertar un import y una llamada al módulo de montaje en una copia de main. Ahora comprueba que el punto de entrada contiene un solo registro y empaqueta directamente ese archivo. Conserva los tres recorridos y sus aserciones de contrato, autorización, paquete ausente/alterado/enlazado, cancelación y efecto persistente.

El banco pasó 3/3 sin reintentos sobre main normal. Resultado y capturas en `tests/.tmp/relay-main-mount-ZqAmDZ`. El servidor aislado ejecuta el Kit real con 216 R4 y 254 R2, red externa bloqueada y datos ficticios. Las raíces se conservaron mediante `PLANB_KEEP254=1`. Tipos globales limpios.

Esta unidad modifica el banco de montaje para que siga siendo ejecutable después de incorporar el helper al producto. Los resultados históricos de 254 conservan la proyección que probaron en su momento.
