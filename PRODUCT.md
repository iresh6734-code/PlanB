# Product

Actualización de fuente, 28/10/2026: asistente de borradores Ollama integrado en equipo local, apagado por defecto y pendiente de aceptación con modelo real. Solo contexto visible revisado, sin herramientas, claves o acciones externas. Microsoft bloqueado en el piloto por el límite corporativo del usuario. Esta entrega no se ha desplegado en el runtime abierto para no reiniciar su bóveda Windows; los resultados ficticios no acreditan generación real ni autonomía. Ver `AGENTE-IA-LOCAL.md`.
<!-- impeccable:product-schema 1 -->
## Platform
web
## Users
Un responsable local de una pyme usuaria de HubSpot. Agencias de HubSpot preparan, prueban y supervisan la continuidad.
## Product Purpose
Conservar una copia utilizable, demostrar sus procesos mediante un simulacro y devolver cambios revisados cuando el CRM vuelva a estar disponible.
## Operating Context
Windows, una instalación y un portal por carpeta. Copias actualizadas mientras el ordenador está encendido. Trabajo desconectado sin HubSpot ni IA. La preparación, las credenciales y la devolución requieren red explícitamente habilitada.
## Capabilities and Constraints
Mantener React, Vite, Fastify, Node 24 y SQLite. Cuatro objetos: clientes, empresas, oportunidades, tareas. Un operador. 10000 registros totales en piloto. Versiones candidatas nunca inutilizan la activa. Sin campañas, borrados remotos automáticos ni multiusuario.

La candidata 0.3.0 admite producción STANDARD únicamente en lectura y recuperación manual comprobada. La IA queda deshabilitada para datos reales. Clave propia y consentimiento explícito por instalación; datos reales solo se exportan/restauran cifrados y con contraseña local previa. El runtime independiente no contiene conectores. El primer piloto autónomo y la devolución auténtica de ensayo necesitan aceptación con evidencia; no están acreditados por las pruebas sintéticas.
## Brand Commitments
La fuente 0.4 añade Hoy, Agentes e Integraciones y propuestas de seguimiento en simulación para datos ficticios. El motor usa reglas, conserva artefactos separados del CRM y exige revisión antes de simular. No llama a IA ni conecta Google Workspace. Exportación y custodia identifican la revisión exacta; los límites de producción siguen vigentes.

La 0.5 prepara un servicio de equipos independiente: roles, empresas aisladas mediante PostgreSQL/RLS, trabajos persistentes, OAuth HubSpot de lectura y vinculación de réplica local con revisiones/conflictos. La demo utiliza dos empresas ficticias y PostgreSQL embebido; identidad gestionada y despliegue GCP requieren aceptación real. El CRM local sigue siendo un operador/portal por carpeta; la réplica no reemplaza sus datos y no devuelve cambios a HubSpot. Infraestructura y estimación se revisan antes de contratar.

Nombre Plan B, español, consola de operaciones de una oficina comercial (identidad «Consola de operaciones», ver DESIGN.md): bastidor grafito para el menú, mesa gris lisa, bahías y tiras claras, cobalto para actuar. Conservar tablas legibles y edición lateral de la demo.

La fuente 0.6 añade un espacio comercial con borradores y aprobaciones ligadas a la revisión, tareas internas, adaptadores Google de permisos acotados y evidencia de resultados. La demo no accede a cuentas. Documentos autorizados vinculados y Sheets con vista previa amplían el contexto comercial; HubSpot mantiene lectura. Una aceptación de Gmail no se presenta como entrega y las operaciones inciertas no se repiten automáticamente. El submenú de Trabajar y los logos oficiales conservan el lenguaje visual aprobado.
## Evidence on Hand
Demo v2, pruebas locales y lectura auténtica de la cuenta DEVELOPER_TEST 149623339, con captura conciliada y ensayo de trabajo sobre copia aislada. No hay testimonios, pilotos vendidos ni prueba de devolución auténtica o del proveedor IA elegido. Cada informe debe identificar su captura y distinguir estas evidencias.
## Product Principles
Continuidad comprobable. Independencia del proveedor. Procedencia explícita. Configuración progresiva. No inventar evidencia comercial.
