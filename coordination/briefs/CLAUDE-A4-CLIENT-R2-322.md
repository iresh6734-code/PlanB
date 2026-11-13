# Claude · A4 cliente y estrategia · R2 de la revisión 322

Retoma tu reserva de `CLAUDE-A4-CLIENT-STRATEGY`. Corrige los tres defectos en los mismos cinco archivos. El servidor 316 R2 ya está aceptado. El montaje 318 es una unidad separada y el adaptador de Hoy sigue pendiente del contrato de acuse sin registro.

## Tres correcciones

1. **F1 · P1. Cancelación dentro de la puerta de despacho.** Si `onDispatch` cancela sincrónicamente la señal, termina antes de invocar el transporte. El resultado `not-dispatched` exige cero llamadas a fetch, cero POST recibidos, cero llamadas al escritor, cero cambios y cero intentos persistidos. Si se cancela después de entregar al transporte, conserva incertidumbre. Mantén el UUID original y la puerta inmediatamente antes del envío.
2. **F2 · P2. 401 obsoleto.** Una consulta o escritura vencida o cancelada puede recibir un 401 después de una consulta válida de una sesión nueva. Descarta los efectos de la respuesta retirada antes de emitir `planb:locked`. Cierra su cuerpo si procede. Un 401 de una petición vigente sigue emitiendo un evento. Prueba GET y POST por separado. El POST tardío conserva la incertidumbre sobre el efecto y el cliente hace un solo envío.
3. **F3 · P2. Comprobación ligada a la tarea.** `VerifyRequest.taskId` identifica la tarea que el gestor está comprobando. Una respuesta para el intento correcto dentro de la copia correcta también tiene que pertenecer a esa tarea. Un recibo válido de otra tarea produce `unknown` en el adaptador, incluido el caso en que su detalle no permita leer un registro. Conserva la lectura válida para la tarea esperada. Añade una prueba que use dos tareas de la misma copia.

## Contrato y entrega

- Conserva las siete distinciones de la entrega A1, el límite de bytes y el plazo propio. Tras un resultado incierto, la comprobación sigue siendo un GET explícito.
- Contrasta el código cerrado `503 TASK_INTENT_NOT_DISPATCHED` de 316 R2 con el `503 TASK_INTENT_STORAGE_UNAVAILABLE` posterior al posible efecto. El primero acredita que el escritor de esa petición no se invocó, pero el POST sí llegó y la reclamación inicial pudo quedar persistida. Explica ese alcance en el informe y preserva el código cuando lo reconozcas. Mantén la decisión conservadora de consultar el mismo ID sin reenvío automático. Un 503 genérico conserva incertidumbre sobre el efecto.
- Repite tus suites de cliente y estrategia contra 316 R2 aceptado. Añade tus propias regresiones y confirma que fallan al quitar las guardas correspondientes en un banco efímero. Declara por separado los casos con Fastify y SQLite reales y los transportes que inyectan retardos.
- Las cuatro sondas del revisor en `tests/task-intent-consumer-independent-322.test.ts` son de lectura para esta entrega. Conserva la evidencia de F1 con transporte que ignora abort, F2 con cookie revocada real, el 401 vigente y F3 con dos tareas.
- Presenta con `submit`, hashes y resultados focales. Conserva tus cinco rutas y deja gestor, montaje, App, servidor, Radar y archivos de las otras sesiones en sus unidades. Usa datos ficticios en un banco nuevo.
