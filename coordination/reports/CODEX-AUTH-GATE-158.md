# CODEX-AUTH-GATE-158 · Orden de las comprobaciones de acceso

4/11/2026, Europe/Madrid. Presentada para revisión independiente. La preview144 aceptada sigue en el corte155; esta entrega todavía no se ha instalado allí.

## Problema y resultado

Una respuesta anterior de `/v2/auth/status` podía cambiar el acceso después de un bloqueo más reciente. También podía terminar una apertura iniciada antes de bloquearse de nuevo la sesión. En la reproducción de navegador, contenido ya cargado volvió a montarse aunque la API protegida devolvía401. Esto describe una reapertura de la interfaz con datos en memoria: **no se ha observado una evasión de la autenticación del backend**.

App aplica una secuencia a las comprobaciones de acceso y descarta sus respuestas y errores anteriores. Un bloqueo confirmado invalida las lecturas de estado pendientes. El bloqueo explícito y el inicio de una apertura confirmada por Protection invalidan comprobaciones anteriores; esa apertura solo puede abrir App si sigue vigente tras leer el estado. La limpieza del efecto invalida sus operaciones pendientes. Se conserva la guarda155 y el rechazo de las lecturas sustituidas a sus consumidores.

Solo se editan App y las dos rutas nuevas de esta unidad. No se cambia Protection,el servidor,el gestor136 ni archivos Claude.

## Evidencia y causalidad

Observación inicial privada con el banco072:1/1 muestra que un status anteriortrue reabre el App cacheado tras un statusfalse posterior,con una lectura de estado todavía pendiente. Es observación que pasa al existir el defecto;no es una regresión aceptada. Evidencia `tests/.tmp/auth158-probe-76628665-538a-4dbc-a013-f18d1d97c97f`.

Se contrastó en App real con Vite,createBaseApp/seguridad reales,SQLite en memoria y contraseña ficticia nueva. Las respuestas retenidas se obtienen del servidor real mediante route.fetch;no se inventa un status de autenticación para provocar el cambio. Dos pruebas usan el evento existente planb:locked para ordenar avisos;las otras vías incluyen el botón real de bloqueo y el formulario real de login.

Contra App155,con SHA-256 `c96134b7c799fac795ddbdc97bacdbc9d158fdf022d9942c0dc058eae007253e`,las **cuatro regresiones fallan por la causa**:

1. Un status autenticadotrue anterior reabre contenido después de que otro confirme el bloqueo.
2. Ese status anterior también reabre contenido después del acuse del botón de bloqueo local.
3. Un statusfalse anterior vuelve a cerrar la interfaz después de un login válido nuevo.
4. Una respuesta200 de estado capturada antes del bloqueo completa una apertura ya obsoleta y vuelve a montar contenido.

En1/2/4,un MutationObserver registra la reaparición de `.sidebar`,incluso si luego otra respuesta401 la oculta. Los registros observed-*.json guardan sawCachedApp:true y blockedStatus:401. En1/2 además se inicia una lectura de estado innecesaria. La primera tentativa del banco tenía una guarda de carpeta incompatible con el reinicio del trabajador tras un fallo:1fallo funcional,1fallo de arnés y2sin ejecutar. Se conserva en `auth158-e22d04fe-a53a-4a06-b983-3484e2663334`. Se corrigió el arnés para usar carpeta nueva por trabajador y **se repitieron las cuatro contra155:0/4,cuatro fallos funcionales,0skip**,sin errores de infraestructura. No se cuentan los primeros resultados como cuatro reproducciones.

Con la corrección,snapshot `tests/.tmp/auth158-cbec1c48-8600-4441-b5fd-82c3ccd16328`:

- **4/4 DOM158** y **6/6 DOM151/155** sin cambiar sus aserciones:10/10,no skips/flaky.
- **3/3 DOM072 existentes**,con solo el origen4455 sustituido por otro puerto efímero en una copia privada. La sustitución inversa reconstruye exactamente el original;legacy-origin-only.json lo acredita. Esas pruebas conservan los fallos de lectura,reintento solo GET y401 real tras login. No se abrió4455 ni una instalación existente.
- **15/15 Node**:4auth-parent y11Protection. Typecheck focal limpio.
- Diez instancias propias de servidor de los diezDOM quedaron cerradas y ausentes;un PID se reutilizó entre instancias distintas. Los tres casos072 compartieron otro servidor propio,PID24592,cerrado y ausente. No afirmar trece procesos distintos.

Fuente y prueba congeladas cotejadas al final. El App anterior se conserva en tests/.tmp/App.before158.tsx y en el corte155 aceptado del que se construyó el baseline. Las carpetas baseline conservan sus artefactos y resultados anteriores;la carpeta source del snapshot final contiene la corrección. El manifiesto final no se presenta como manifiesto de fuentes anteriores a la corrección.

Entorno mínimo,red externa bloqueada,Chromium1228 propio,sin perfil del usuario,cuentas/proveedores o datos reales. Browser plugin/skill browser no disponibles para esta ejecución de pruebas del repositorio;se usó Playwright CLI. No se guardan cookies ni valores de sesión en la evidencia.

## Límites

Una instancia de App y las intercalaciones descritas. No es una auditoría exhaustiva de autenticación;no prueba otras ventanas,otros navegadores,lectores de pantalla o todas las latencias. Las peticiones anteriores se descartan al terminar;no se afirma cancelación física de su transporte. Los datos en memoria se ocultan con Protection,no se borran de la memoria del proceso. No se ha cambiado la protección del backend ni su duración de sesión. D7 sigue pendiente de U1/U2 y no se integra CAS,persistencia del gestor o el kit116.

Siguiente:dictamen ajeno sobre los tres hashes158;si se acepta,actualizar una preview bajo una unidad nueva con activos/evidencia propios,sin atribuir la aceptación de código a un runtime aún antiguo.
