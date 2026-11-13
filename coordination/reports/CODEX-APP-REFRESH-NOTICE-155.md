# CODEX-APP-REFRESH-NOTICE-155 · Aviso de lectura sustituida

3/11/2026, Europe/Madrid. Entrega para revisión independiente; no autoaceptada ni actualizada todavía en preview144.

## Problema y cambio

En la inspección visual de la preview144, compilada desde el corte151, apareció un aviso global «Otra consulta sustituyó esta lectura» junto a contenido cargado correctamente. El descarte de respuestas anteriores de151 era necesario, pero la comprobación inicial de autenticación trataba ese descarte como fallo actual y dejaba el aviso visible. No se afirma que ocurra en todo arranque o que la configuración de ensayo equivalga al build de producción.

App distingue ahora `SupersededStateRead`. Una respuesta o error HTTP de `/v2/state` correspondiente a una lectura anterior sustituida produce ese error específico. La comprobación inicial lo ignora; los errores vigentes conservan su tratamiento. La promesa de `refresh` sigue rechazando lecturas sustituidas para los callbacks de guardado: no se transforma un refresco fallido en éxito ni se elimina la guarda contra datos viejos. No se cambian LocalOperations, fuentes Claude, rutas API o el banco de autenticación.

## Verificación propia

Snapshot `tests/.tmp/app155-13fbb22f-95ab-43d9-96ec-5e5476320ba9`, manifiesto de fuentes congeladas y logs preservados. La primera regresión se ejecutó contra151 antes del cambio: **0/1 por AssertionError**, `.global-error` tiene un elemento cuando debe tener cero. No fue un fallo de navegador, imports o servidor. La reproducción ordena dos comprobaciones con el evento existente `planb:locked` y una lectura anterior retenida; la fixture mantiene autenticación abierta, no simula una cuenta real bloqueada.

Con el cambio:

- **3/3 DOM nuevos**: lectura inicial anterior con éxito no deja aviso ni pisa el cambio más nuevo; error HTTP de esa lectura anterior tampoco deja aviso; un503 vigente sigue visible y no inventa un estado cargado.
- **3/3 DOM151 repetidos sin editar sus aserciones**: contador inmediato tras guardar por Hoy, fallo de lectura padre y reintento sin segundo PATCH, respuesta antigua después de una más reciente.
- **4/4 Node auth-parent** del arnés152 aceptado, sin cambios.
- Typecheck focal App/ambos specs/auth limpio. Seis procesos propios cerrados y ausentes según sus registros. Cero skips/flaky en6/6DOM.

App real/Vite y createBaseApp real, SQLite en memoria y datos ficticios, servidores loopback efímeros y red externa bloqueada. Browser plugin not available; Playwright CLI/Chromium1228 propio, sin perfil del usuario. En los dos casos nuevos de orden se hace un PATCH de contacto explícito como control para distinguir estados; no es una escritura repetida por el producto.

No se repitieron150Node ni los otros21DOM anteriores porque no se editan sus fuentes; no se declara suite global verde. No se cubren todas las carreras del estado de autenticación, lectores de pantalla, otros navegadores, CAS, persistencia o D7 montado. Preview144 continúa sirviendo151 hasta dictamen ajeno y actualización expresa de sus artefactos. La URL operativa no demuestra que este parche ya esté instalado.
