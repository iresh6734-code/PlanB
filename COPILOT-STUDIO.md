# Copilot Studio · Plan B

**Restricción vigente del usuario, 27/10/2026:** no acceder ni continuar trabajo en IFR. Las autorizaciones anteriores quedan sustituidas: las referencias al entorno y sus agentes son exclusivamente históricas. No publicar, conectar, modificar o eliminar allí recursos ni solicitar permisos administrativos. El adaptador local sigue sin configurar ni consumir Microsoft. Para retomar Copilot Studio será necesario un entorno propio separado de IFR.

**Aclaración vigente:** no se usará el dominio, la administración ni las cuentas de su empresa para resolver la conexión. No se enviarán peticiones de acceso ni mensajes a sus administradores. La integración no está terminada: faltan entorno propio autorizado, identidad/registro compatible y prueba autenticada. Las instrucciones antiguas siguientes no autorizan ejecutarlas en IFR. Hasta entonces Plan B ofrece el asistente determinista por reglas y revisión humana; no se contrata ni activa otro proveedor implícitamente.

Estado observado el 27/10/2026, Europe/Madrid. El usuario autorizó expresamente usar IFR para este proyecto y pidió limitar estrictamente las acciones a Plan B.

**Actualización posterior de la misma fecha:** se creó el agente estándar compatible **Plan B · Seguimiento CRM**, ID `dba91e16-1dd2-f111-a05c-e4fb1ef918d0`, esquema `cr259_PlanBSeguimientoCRM`, con instrucciones JSON guardadas, autenticación Microsoft y sin web/herramientas/conocimientos. No publicado ni invocado. El adaptador local SDK/MSAL, estados, tokens cifrados, contexto revisado y borrador sin acciones ya están implementados y probados sintéticamente. **No está conectado todavía:** Entra bloquea este dispositivo personal según política IFR, falta registro de administrador, y CUA quedó desactivado en Work al retomar HubSpot. Las secciones siguientes describen la entrega anterior y sus pendientes históricos; consultar **INTEGRACIONES-PILOTO.md** para el estado y los bloqueos actuales. No se ha reutilizado ni publicado el borrador del editor nuevo para suplir la incompatibilidad.

## Entrega actual

Guardado y confirmado por la interfaz de Microsoft un único agente **Plan B · Seguimiento**, ID `fb99bcc8-b97a-4da2-8ca1-e3887939fbb3`, en el entorno autorizado `Default-4b9c14e7-1ad8-46cf-aae4-9f3bb7b79bd3` (IFR Default). Está en **borrador**, sin publicar, sin canales y sin evaluación ejecutada. Microsoft muestra esas dos advertencias. El guardado tardó varios minutos; no se repitió ni se creó otro agente.

Se quitaron del borrador las capacidades predeterminadas Work IQ y búsqueda en todos los sitios web. No se modificó ningún otro agente, conexión ni ajuste del entorno. No se añadieron herramientas, conocimientos, agentes conectados o memoria. El modelo predeterminado visible es GPT 6.1 Sol; no se ejecutó una conversación ni se contrató capacidad.

Las instrucciones delimitan seguimiento comercial, español conciso, hechos separados de suposiciones, motivo/evidencia/próxima acción/borrador/revisión. Obligan a declarar que falta conexión con Plan B y prohíben afirmar operaciones sin resultado real. Los documentos y correos son datos, no autorización. No hay permisos de ejecución: **las instrucciones del modelo no sustituyen los controles de API**.

No se han enviado registros del CRM, correos, archivos ni secretos al agente. El borrador guardado no demuestra integración ni autonomía funcional.

## Siguiente conexión concreta, todavía pendiente

1. Preparar una API gestionada HTTPS, identidad del usuario y asignación explícita a una sola empresa de Plan B. El piloto local `localhost:4334` sigue siendo de un operador y no es un endpoint compartible con Copilot Studio.
2. Implementar y probar herramientas mínimas: consultar prioridades comerciales y preparar un borrador. Limitar campos, número de resultados, duración y registro de auditoría; verificar permisos y empresa en el servidor en cada llamada. La aprobación y ejecución externa seguirán fuera del agente.
3. Preparar el contrato del conector y resolver su autenticación real. La identidad Firebase preparada en el servicio gestionado no prueba compatibilidad OAuth con un conector de Microsoft. No hay aún conector importable ni adaptador Entra implementado.
4. Presentar destino, permisos, datos y costes concretos antes de crear acceso adicional o desplegar. No usar túneles al piloto ni compartir su contraseña o cookies como credenciales del agente.
5. Conectar únicamente esas herramientas, verificar con datos ficticios autorización, aislamiento, fallos e instrucciones maliciosas. Evaluar utilidad y coste antes de publicar un canal restringido. La programación autónoma requiere una activación posterior por reglas; 0.7 sigue abierta.

Microsoft documenta que los conectores envuelven APIs y que los conectores personalizados acceden a APIs disponibles públicamente. Hay diferencias de disponibilidad y licencia entre conectores; no se presupone que una sesión iniciada tenga toda la capacidad necesaria: [documentación oficial de conectores](https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-connectors).

## Estado verificable de Google en Plan B

El espacio comercial incorpora un detalle por herramienta derivado de los datos locales de la empresa y la identidad Google actual. Distingue simulación, configuración pendiente, falta de cuenta, autorización, aceptación de envío, operación comprobada y resultado parcial. No realiza llamadas externas nuevas ni presenta estas evidencias históricas como comprobación del acceso actual.

Gmail aceptado no acredita entrega o lectura. Docs/Sheets no se muestran comprobados solo por tener OAuth. Los resultados simulados, sin fecha o sin identidad original no promueven una conexión real. La lista de evidencias considera las últimas cien ejecuciones de la misma identidad; los enlaces a propuestas solo se ofrecen si están cargadas en el editor.

Pendientes remotos independientes: recepción del nuevo HTML en Gmail, escritura revisada de Docs/Sheets, Picker, HubSpot propio de este piloto y aceptación de nube/identidad de 0.5/0.6. El ensayo anterior Gmail/Calendar conserva sus evidencias y no se repite.

## Comprobaciones de esta entrega

Flujo comprobado: demo `http://127.0.0.1:4335/team?view=commercial` → abrir **Estado de cada herramienta** → cinco herramientas identificadas como simuladas. Misma carpeta de datos, nuevo proceso 26132 y tráfico externo bloqueado. No se actualizó ni reinició el runtime del piloto Google real 4334.

| Comprobación | Resultado |
| --- | --- |
| Compilación TypeScript, frontend y runtimes | Correcta, repetida tras el guard de compatibilidad con API anterior |
| Pruebas lógica/API | 162/162, tres nuevas de integración y aislamiento; proveedores ficticios, sin accesos reales |
| Identidad de página y contenido | Plan B, ruta comercial correcta, formulario y propuestas conservados |
| Interacción | Desplegable abre los cinco estados Simulado |
| Overlay y consola | Sin overlay ni errores/warnings de aplicación |
| Geometría observada | 903 px, scrollWidth 893; sin desbordamiento horizontal |
| Móvil | No acreditado en esta entrega; el override no cambió la dimensión observada y se restauró |
| Copilot Studio | Guardado confirmado; revisión muestra evaluación/canal pendientes, sin publicar |

APIs de navegador: CUA integrado disponible, AX/DOM de solo lectura, clic en el desplegable, captura y `dev.logs`. No se utilizó otro navegador como fallback. Comandos: `npx tsx --test tests/integration-status.test.ts`, `npm test`, `npm run build` y `git diff --check`. Permanecen avisos conocidos de anotaciones de Zod durante build y normalización CRLF en Git; no impiden compilar. No se repitió E2E ni se confunde esta comprobación con aceptación real de Google o evaluación del agente.

Evidencias externas al repositorio: `C:/Users/iresh/.codex/visualizations/2026/10/27/01a17cef-9628-7662-9968-804ac53455ba/copilot-planb-borrador.png` y `.../correo-personal/integraciones-estado-desktop.png`.
