# CODEX-TASK-FOCUS-MOUNT-140 · Abrir una tarea desde Hoy

2/11/2026, Europe/Madrid. Codex. Entrega presentada para revisión independiente; no actualiza la demo ya abierta.

## Cambio

Cada tarea mostrada en Hoy tiene un botón que abre su ficha `LocalTaskFocus` por ID, también en lectura si la copia está importada sin activar. El nombre accesible incluye el ID para diferenciar tareas homónimas. Si la tarea se completa y deja de estar en la cola, al cerrar la ficha el foco vuelve al encabezado de la cola si el botón original ha desaparecido. La ficha se monta solo desde Hoy; Agentes mantiene su flujo de revisión existente.

La recarga posterior a guardar sigue siendo solo lectura. El callback de la ficha ahora rechaza cuando la lectura falla, se sustituye por otra o la vista se desmonta, de modo que la ficha puede conservar el acuse y ofrecer reintento sin volver a enviar el PATCH. Las cargas ordinarias y la revisión de Agentes conservan sus mensajes anteriores.

## Verificación

- **6/6 DOM en la App real** con Chromium headless y SQLite en memoria, servidor temporal propio, datos ficticios y red externa bloqueada. Comprueba dos tareas con el mismo nombre/ID distinto, apertura por teclado, completar y foco tras desaparecer la fila; PATCH confirmado con GET de cola 503 y reintento sin nuevo PATCH; copia importada sin activar y paso a Preparación; anchos 1440/390/320 sin desbordamiento horizontal y objetivo de apertura ≥44 px en 390/320. Evidencia `tests/.tmp/task-mount140-97258420-2909-46a4-bb0a-37fb7eac5019`, `results.json` y capturas. Captura 320 inspeccionada: ficha visible y contenida; en el momento de esa captura las relaciones aún se estaban buscando.
- **29/29 Node** de operaciones locales, cliente y montaje previo. `npx tsc -p tests/.tmp/task-mount140-tsconfig.json` sin errores, focal en componente, test y sus imports. Vite compila la App en la carpeta temporal como parte del ensayo.
- Hashes de `LocalOperations`, estilos, ficha/cliente/contrato, App, server/app, Store y el test coincidían antes y después del corte DOM. Otros archivos del checkout no fueron congelados íntegramente; no presentar esta ejecución como snapshot inmutable de todo el repositorio.
- Dos cortes anteriores se conservan: primero 0/6 antes de llegar a la interfaz por imports absolutos de Windows en el arnés; segundo 4/6 porque el nombre accesible correcto del selector obligatorio era «Estado *», no «Estado». Se corrigieron exclusivamente las pruebas y se repitieron los seis. No se atribuyen esos fallos al producto ni se suman como pruebas distintas.

## Límites

La ficha sigue usando la API antigua, sin comparación de versión ni idempotencia por intención. Dos pestañas pueden sobrescribir el mismo campo simultáneamente; 128 no está montada. D7 permanece abierto: si se cierra la ficha con PATCH en vuelo y se pierde el acuse, no hay aviso posterior fuera de la ficha; se advierte antes de salir y Claude desarrolla una unidad separada. No se probaron proveedores reales, lector de pantalla u otros navegadores; no se ejecutó `npm test` completo. La captura anterior 4591 no se reinició: requiere un build posterior revisado para mostrar este montaje.
