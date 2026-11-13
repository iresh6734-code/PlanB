# CODEX-OPERATIONS-ROBUST-132 · Respuestas y sesión de Hoy / Agentes

2/11/2026, Europe/Madrid. Codex. Entrega para revisión independiente.

## Cambio

`src/local-operations-client.ts`, cliente ya utilizado por `LocalOperations`, procesa HTTP 401 antes de intentar interpretar el cuerpo. Desencadena `planb:locked` también cuando el cuerpo está vacío o es HTML y devuelve un error 401 tipado. La aplicación sigue consultando su estado de sesión antes de mostrar la pantalla de desbloqueo; un 401 aislado no es, por sí solo, evidencia de que la autenticación del servidor haya cambiado.

Las demás respuestas se leen por fragmentos con un límite de 1.000.000 bytes reales; al superar la cota se cancela la lectura, sin esperar a acumular todo el cuerpo. La decodificación UTF-8 conserva los caracteres divididos entre fragmentos. No se alteran el contrato de datos, el endpoint, los identificadores idempotentes de las revisiones ni componentes de Claude.

## Contraprueba y validación

- Antes del cambio, `tests/local-operations-client-regression.test.ts`: **1/4 pasaban**. Dos fallos reproducían 401 vacío/HTML sin evento de bloqueo; otro mostraba que `response.text()` había consumido la respuesta completa antes de comprobar tamaño. Se añadió después un quinto caso de UTF-8 fragmentado.
- Después: `node --import tsx --test tests/local-operations.test.ts tests/local-operations-mount.test.ts tests/local-operations-client.test.ts tests/local-operations-client-regression.test.ts`: **29/29**, sin omitidas; incluye validación 422, revisión idempotente, abort previo y guardas reales del servidor en memoria.
- `npx tsc -p tests/.tmp/operations132-tsconfig.json`: comprobación focal sobre cliente y nuevas pruebas, 0 errores.
- Vite compiló la app completa en carpeta temporal y se verificó con Chromium headless en `createBaseApp` con SQLite en memoria, captura ficticia y servidor loopback efímero. Se inyectó 401 HTML y el estado posterior de sesión bloqueada: **Hoy 1440 px y Agentes 390 px** mostraron «Tu copia está protegida» y retiraron `.lop`; sin excepciones JS ni solicitudes externas. No se introdujeron credenciales ni se modificó la demo 4591. Se inspeccionó visualmente la captura móvil del bloqueo. Browser plugin no disponible; se usó Playwright ya instalado.
- Evidencia aislada: `tests/.tmp/operations132-5da6466d-b5c8-4280-91cb-9b37f413269f`, incluyendo script y capturas. El build avisó de anotaciones de Zod y de tamaño de chunk; no se trataron como fallos nuevos de esta modificación.

## Límites

El ensayo DOM inyecta respuestas HTTP para controlar la situación; no demuestra caducidad de una sesión real por tiempo ni otros navegadores. No se ejecutó `npm test` completo, no se midió memoria de proceso ni se comprobó 320 px en esta unidad. La demo abierta usa un build anterior: el cambio de fuente debe revisarse y desplegarse en un build posterior para verla allí. Las respuestas de Claude 123 y el montaje de 128 siguen fuera de alcance. No se han usado proveedores o datos de clientes.
