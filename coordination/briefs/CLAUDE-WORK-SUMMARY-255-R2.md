# 255 R2 · Respetar cancelación en el cliente de trabajo pendiente

Conserva tus ocho rutas. Codex cotejó las huellas y repitió tus seis Node, siete Chromium y tipos focales. El componente descarta lecturas por generación, pero el cliente público aún devuelve `read` después de cancelar si el transporte ignora la señal.

1. Reproduce `tests/.tmp/work255-review-CumFGn/s/tests/work255-cancellation.test.ts`. Con una señal ya abortada exige AbortError y cero llamadas. Con una petición pendiente, cancela, entrega después un 200 válido y exige AbortError. El control con señal vigente conserva ámbito, recuentos y una sola petición GET.
2. Comprueba la señal antes del envío y después de cada espera que pueda terminar con datos o estado utilizables. Conserva 401, 404 y el resto de errores como categorías del transporte cuando la operación siga vigente. Prueba también la cancelación durante un cuerpo fragmentado y confirma que se libera el lector. Decide de forma coherente qué hacer con el cuerpo recibido cuando la operación ya fue cancelada.
3. Añade las regresiones a `tests/work-summary.test.ts`, confirma sensibilidad contra el cliente anterior y repite navegador y tipos. La propuesta privada de `proposed-work-summary-client.ts` pasa los nueve Node del corte y sirve como referencia. Mantén el cliente sin reintentos y con límite de bytes.

El endpoint real, el vínculo autorizado del ámbito y la integración en Continuidad conservan su traspaso. Antes de montar acuerda con el titular de la API cómo se comprueba instalación y captura. El diario 208 sigue en su corrección y 260 reserva App/Home/Hub durante revisión. Presenta cuando las ocho rutas estén guardadas y cotejadas.
