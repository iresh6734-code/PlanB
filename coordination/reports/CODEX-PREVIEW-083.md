# PREVIEW083 · App iniciada en el equipo actual

31/10/2026, 14:52:56, Europe/Madrid. Petición directa del usuario: iniciar la app y continuar.

## Instancias nuevas que permanecen encendidas

- CRM: http://127.0.0.1:4420/ · PID18952. Agencia Norte,62registros ficticios, portal demo-agency.
- Equipo: http://127.0.0.1:4421/team · PID26404. Demo con contactos y acciones exclusivamente ficticios.

Carpeta nueva **D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/live-preview083-aee881ac-e511-48c5-9f26-5dea49a89b76**. Se copiaron únicamente los23artefactos hash por hash de candidate-5e94390e-745e-40e1-ac1f-d412eaf4672f. Datos nuevos fuera de runtime: fresh-crm y fresh-team, este último PostgreSQL de demo nuevo. Entorno de hijos por allowlist del sistema y variables explícitas de demo/orígenes locales, sin heredar claves o configuraciones privadas. Procesos ocultos independientes; no se configuró arranque automático ni se reiniciaron servicios anteriores. La copia conserva los23hashes originales después del smoke.

No aceptación de fuentes o despliegue de una entrega aprobada: candidata de ensayo solicitada por el usuario. No se accedió a4331/4334, equipo corporativo, bases/config/credenciales originales o proveedores. block-external.cjs restringe las conexiones de estos procesos a loopback. La contraseña del CRM no se eligió en nombre del usuario: la instancia nueva queda en su estado inicial de configuración local. No introduce una contraseña conocida o copiada.

## Comprobación actual

Health200 de ambos servicios: CRM0.6.0 con instanceId nuevo, equipo0.6.0 mode:local-demo. Importación de fixture, generación demo y activación se hicieron exclusivamente en4420, no mediante IA o cuenta remota.

Smoke propio de navegador: Continuidad y nuevo inspector visibles en CRM; Contactos y ficha de Lucía ficticia visibles en Equipo. Sin errores de página ni peticiones externas; desktop1440 y móvil390 sin overflow. Capturas crm-1440.png y team-390.png inspeccionadas. Evidencia **D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/live-preview083-aee881ac-e511-48c5-9f26-5dea49a89b76/smoke-a1d8ee40-1bf3-42b0-bf2f-0ebf6d2b5ee9** con results.json y log. Chromiumheadless1228 propio; no perfil/navegador del usuario. Browser plugin not available.

La primera comprobación Node del arranque no pudo leer health desde su contexto de red y terminó por plazo. Los procesos ya estaban iniciados: se conservaron, y PowerShell con permiso explícito verificó los200y completó la fixture. Se conserva preview.json inicial y preview-ready.json posterior; no se inventa un arranque inicial sin incidencias.

open_in_codex solicitó abrir los dos paneles y devolvió **queued**, no confirmación de pestañas visibles. Los enlaces están disponibles; el smoke independiente sí comprobó render real.

## Continuación

Se corrigió el pendiente REL033 dentro de sus cuatro reservas, sin modificar fuentes de Claude.38/38 y cinco controles causales de versión anterior. Fuente de herramientas independiente de las instancias encendidas; no se recompilaron o sustituyeron estas mientras se comprobaba su UI. QA079/081 siguen ready sin reserva al último cotejo: no acredita ejecución de Claude. AUTH_PARENT072 sigue pendiente.
