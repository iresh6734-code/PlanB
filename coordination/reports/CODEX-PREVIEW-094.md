# PREVIEW094 · App iniciada en este ordenador

1/11/2026, 10:52:52, Europe/Madrid. Autor Codex. Nueva vista de pruebas; no aceptación de código o instalación de producción.

La comprobación de los servicios083 anteriores devolvió conexión rechazada en4420/4421 y sus dosPID históricos no aparecían. No se infiere ejecución desde el JSON antiguo. No se detuvo ningún proceso o consultó el equipo original. Ambos puertos estaban libres antes de arrancar la vista nueva.

## Estado observado

- CRM: http://127.0.0.1:4420/; PID26820, health200, instanceId bd263b21-b478-4e8e-9090-674b37183639.
- Equipo: http://127.0.0.1:4421/team; PID27956, health200, mode local-demo.
- Carpeta nueva D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/live-preview094-5d016ff6-39ee-4f83-96d8-635b7e764e63;23artefactos comprobados por SHA-256 y copiados de D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/release-candidates/candidate-42c5f15c-99a2-4f4d-bd96-275f84c47f0f. El runtime ahora incluye el corteR1/090 compilado, a diferencia de083. No se copian fuentes o bases de083.
- Nuevas bases fresh-crm/fresh-team. CRM creado por fixture agency+generación demo+activación de ensayo; ready:true/isTestData:true, accountId:demo-agency, Agencia Norte,62registros según UI. Plan de devolución inexistente (recoveryIntegrity:none), sin cambios previos. Equipo crea su propio seed ficticio de demo. Ninguna cuenta o proveedor real configurado.
- Entorno de hijos por lista permitidaOS, luego variables explícitas de demo. Sin .env/configuración anterior, tokens, contraseñas o claves copiadas. Loopback y bloqueo externo con script existente. Procesos ocultos y separados; sin autostart o servicio del sistema añadido.

## Navegador

Browser plugin not available: skillfrontend-testing-debugging permite Playwright regular. Chromium ya instalado en caché, contexto propio sin perfil/navegador del usuario. Flujo: CRM→Continuidad→abrir inspector→referencia local visible; equipo→Contactos→Lucía ficticia→ficha. TítuloPlanB/URL comprobados; contenido significativo y capturas sin overlay.1440/390, móvil sin desbordamiento horizontal. Segunda ejecución completa la comprobación explícita de consola que la primera no recogía:0pageerrors,0consoleerrors,0warnings,0solicitudes de otro origen. No se suman esas repeticiones como casos distintos. Capturas de la primera ejecución1440CRM y390equipo inspeccionadas; segunda conserva sus propias capturas y results.json en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/live-preview094-5d016ff6-39ee-4f83-96d8-635b7e764e63/smoke-938e40b1-29a9-4e2c-afbe-248263d61cdf.

Inicial observación de health deequipo agotó el plazo; el mismo PID27956 siguió iniciando PGlite. Se consultaron sus logs y health propios hasta obtener200, sin reiniciar. Se continuó el setup del CRM solo después de verificar el mismo instanceId y ausencia de snapshot. preview.json inicial se conserva; preview-ready.json documenta el estado confirmado. Un intento de crear el runner de navegador falló por comillas dePowerShell, antes de ejecutar navegador; se usó archivo de código estructurado. No fue fallo de app.

open_in_codex devolvió queued; se proporciona URL, no se declara una pestaña del usuario visible comprobada. Abrir esa pestaña no acredita sincronización de datos entre CRM/equipo. Health/DOM son observaciones puntuales, no garantía de permanencia tras cerrar/reiniciar el equipo.

## Límites

Fuentes de candidata siguen enreview y acceptedRelease:false/deployed:false. Regresión general de94archivosTypeScript en ejecución separada bajo093; esta vista no la sustituye ni se declara resultado global todavía. No proveedor/lector de pantalla/datosreales/equipooriginal/4331/4334/depsnuevas/build-dist raíz/commit/push/despliegue.

Artefactos y hashes exactos en preview-ready.json; submit sella este informe.
