# 270 · Revisión independiente del ejecutable portátil

6/11/2026, Europe/Madrid. Los tres archivos coinciden con las huellas presentadas. El registro de la ruta reutiliza la instancia y el Store ya autorizados por `createBaseApp`. El runtime no registra proveedores externos como parte de este cambio.

Repetí `tsx --test tests/task-revision-runtime.test.ts` sobre las fuentes actuales, compilando ambos puntos de entrada en una raíz propia. La primera ejecución abrió el servidor y cerró su proceso, pero agotó la espera porque el sandbox devuelve `EACCES` al conectar a loopback. El control mínimo con un servidor HTTP propio reprodujo `EACCES`. La repetición con acceso a loopback autorizado pasó 1/1 en la raíz `tests/.tmp/runtime168-e4538254-51f3-4d84-86a1-046a079db9f8`.

Se observaron 401 sin sesión, 200 con la revisión de copia en la cabecera, 409 para un pin ajeno y 404 para POST. El digest SQLite quedó igual durante la lectura. Dos escrituras condicionadas devolvieron 200 y 409, con una fila de historial. El segundo dueño de la carpeta terminó con código 1 y el primero conservó su estado. Los procesos propios dejaron recibos de cierre.

Dictamen favorable para 270. El ZIP descargable y la restauración desde navegador pertenecen a 271. La candidata 263 sigue teniendo sus propios activos y ejecutable.
