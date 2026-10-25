# Plan B v2 · Registro de implementación

Objetivo autorizado: completar continuidad local, capturas verificadas, simulacros aislados y devolución revisada; mantener interfaz sencilla y preparar pilotos de agencias.

Orden: 1. versiones activas/candidatas; 2. protección y migración; 3. conector y trabajos; 4. simulacros y devolución; 5. interfaz y paginación; 6. pruebas, paquetes y materiales comerciales.

Las verificaciones con una cuenta real de HubSpot, el proveedor IA elegido y las ventas requieren servicios/personas externos. Ningún resultado simulado se presentará como evidencia real. No se habilitan datos reales antes de superar los criterios técnicos y revisión del piloto.

La ejecución conserva los ZIP v1 existentes. Los nuevos entregables se publicarán con sufijo v2. La ampliación autorizada se limitará a mejoras comprobables de este producto; no se añadirán módulos ajenos.

## Checkpoint del 24 de octubre de 2026

Implementados: activa/candidata, cifrado AES-GCM con clave DPAPI, migración SQLite v1, contraseña y sesión local, bloqueo de instancia, capturas e historial, trabajos persistentes con cancelación, programación horaria/mensual, simulacro aislado, devolución de tres vías con diario e incertidumbre, exportación/recuperación cifrada y página local para agencias. UI Continuidad/Trabajar/Cambios, paginación y buscador de relaciones.

La devolución valida las decisiones antes de enviar, no repite creaciones inciertas y conserva IDs, marcadores y diario al exportar/restaurar. Una devolución parcial bloquea nuevas ediciones. Las simulaciones no confirman una devolución real.

Validación actual: compilación correcta; 46 pruebas unitarias/API; 7 recorridos Edge; medición HTTP de 10.000 registros en SQLite cifrado (10 páginas de 50: máximo/p95 520 ms; búsqueda 347 ms en este equipo). Revisión visual realizada en escritorio y móvil. Las pruebas ZIP, traslado y restauración portable se documentan al cerrar el empaquetado.

Coordinación HubSpot autorizada por el usuario: chat «Configurar HubSpot de prueba para Plan B», ID 01a16e81-9e99-7b93-b8c8-fb4889a932eb. Servidor de preparación: http://127.0.0.1:4340; carpeta de datos data/hubspot-v2. El otro agente opera el navegador y escribe HUBSPOT-HANDOFF.md sin secretos. No modificar su configuración durante el recorrido. No presentar datos de ese portal como plantilla de entrega; los ZIP usan los conjuntos ficticios incluidos.

Pendiente externo: acreditar captura auténtica y devolución revisada en HubSpot de ensayo, y generación con el proveedor IA que el usuario elija. No se han efectuado llamadas IA de pago en esta fase ni hay ventas acreditadas. La habilitación de datos de producción sigue bloqueada.

Conexión auténtica en curso: cuenta desarrollador de ensayo 149623339, Service Key de lectura configurada por el otro chat en el formulario local. La primera captura verificó cuenta, pipelines, propiedades y objetos, y rechazó un HTTP 207 en asociaciones. Se corrigió el importador para comprobar por GET individual paginado cualquier ID omitido o con error en el lote; no se asume que una respuesta parcial signifique cero relaciones. Dos pruebas nuevas verifican este caso y el rechazo de permisos insuficientes. Servidor 4340 actualizado y reiniciado. La captura auténtica completa y la devolución siguen pendientes hasta obtener sus resultados.

Lectura auténtica posterior superada con scripts/verify-live-read.ts: API DEVELOPER_TEST, conciliación 5 contactos / 2 empresas / 0 oportunidades / 2 tareas / 2 relaciones / 1 pipeline, cero errores de especificación. Credencial leída de la base activa en modo solo lectura; validación/activación en tests/.tmp/hubspot-live-read. No se modificó el espacio operativo ni se escribió en HubSpot. Informe sin secretos en outputs/pruebas-hubspot-lectura-v2.json. El conjunto previsto aún no está completo y el navegador del otro chat vuelve a estar bloqueado por Work. No confundir importación del contenido existente con aceptación del conjunto de ensayo.

Refuerzo final: el bloqueo de importación/generación/promoción durante continuidad se aplica también en Store, para impedir que una petición iniciada antes de la sesión la modifique al terminar. Restaurar exige que no haya trabajos pendientes. La verificación ZIP inicial encontró un error del propio verificador: comparaba el paquete cifrado del primer conjunto con el ID aleatorio de la tarea del segundo conjunto. Corregido para comparar con el conjunto realmente exportado. Se repite la aceptación del ZIP final actualizado.

18:09 CEST: scripts/capture-configured.ts guardó una captura auténtica conciliada en el historial operativo. Se detuvo el servidor antes de abrir su base con bloqueo de instancia, se respetaron los estados de servicios/sesión existentes y no se reemplazó el espacio de trabajo. Servidor 4340 reiniciado con las últimas correcciones, protección y conexión intactas. Informe outputs/pruebas-hubspot-captura-v2.json. El conjunto del portal aún no contiene oportunidades ni las dos configuraciones previstas. No ampliar permisos sin revisar el alcance.

Aceptación final completada: ambos ZIP superan edición, simulacro aislado, reinicio y traslado; paquete cifrado exportado por API restaura en carpeta nueva y rechaza contraseña incorrecta (exportación 123,3 s). 3/3 verificaciones, sin tráfico externo ni secretos. Últimos recorridos estándar Edge: 7/7 en 20,7 s. Prueba adicional scripts/verify-imported-ui.mjs sobre copia auténtica importada: cliente, oportunidad creada localmente y avance, tarea completada/referenciada, conversión Europe/Madrid→UTC y reinicio; sin errores ni peticiones externas. No escribe en el portal. El código compilado queda congelado; el cierre de entrega solo añade evidencias y scripts de reproducción a los ZIP y recalcula hashes.
