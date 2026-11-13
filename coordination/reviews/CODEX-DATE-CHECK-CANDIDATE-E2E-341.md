# Candidata 340 · Recorrido de decisión y reapertura

13 de noviembre de 2026, Europe/Madrid. Chromium 1/1 y TypeScript focal limpio en `tests/.tmp/candidate341-YEEErB`. El banco coteja las 800 fuentes congeladas de la candidata 340 y la nueva prueba. Verifica las huellas de los activos web antes de abrir la App compilada.

Desde la navegación real se abrió «Comprobar una fecha», se analizó Almacén Sur, se confirmó el siguiente paso de Marta y se registró «El proveedor llegó tarde». El navegador mostró la fecha ofrecida incumplida y los 40 minutos pendientes de comprobar. El servidor recibió exactamente cuatro POST: análisis 200, registro 201, confirmación 201 y desenlace 201. La base mantuvo cero cambios de registros de negocio y tres entradas del flujo (índice, comprobación con decisión y desenlace).

Se cerraron Fastify y el Store, se reabrió el mismo SQLite ficticio en instancias nuevas y se recargó el navegador. Se recuperaron la decisión y el desenlace sin nuevos POST y con idénticas las tres entradas. Se comprobaron 1440, 390 y 320 px sin desbordamiento horizontal y se inspeccionó la captura a 320 px. Cero solicitudes externas, errores de página y respuestas HTTP fallidas en el pase definitivo.

El primer montaje del arnés omitía la ruta local de espacio de equipo y por eso daba 404 al abrir y recargar. El pase definitivo monta `registerTeamSync` como el servidor principal, con el origen de equipo sin configurar. El navegador pasa las peticiones al Fastify real mediante `inject`. El ensayo acredita la App compilada y la reapertura de SQLite dentro del proceso de pruebas. Quedan fuera el arranque del binario principal, el reinicio de su proceso y el instalador.

Las correcciones 337, 338 y 339 siguen en manos de Opus. El recorrido de referencia acredita ese caso en la candidata 340, que conserva sus impedimentos y sigue sin aprobación ni despliegue.
