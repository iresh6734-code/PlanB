# Plan B · Portal personal HubSpot

Estado a 28/10/2026, Europe/Madrid. Continuación de 0.6 en el checkout actual; no crea otra instalación ni cambia los ensayos históricos.

## Evidencia actual

El navegador integrado oficial abrió el inicio autenticado de **149623262**, con nombre de cuenta Plan B. No se leyeron fichas ni se comprobó el número de registros, su origen o el tipo API de cuenta. El permiso del usuario para comprobar/conectar este portal personal en lectura ya consta; no volver a preguntar titularidad ni repetir el login por un problema de herramienta.

Plan B respondió en `http://localhost:4334/team`; Integraciones mostró la conexión **149623339 · Solo lectura** en el espacio histórico y 62 registros locales. La sesión volvió a mostrar desbloqueo tras la recarga y el usuario la desbloqueó personalmente; comprobado en la misma pestaña. Se creó **Plan B · Portal personal**, ID `c3275ac9-e49b-4b22-839e-5446988a1726`, con **0 registros**, sin conexiones Google/HubSpot heredadas. El espacio histórico permanece disponible.

Configuración HubSpot agotó inicialmente el plazo, pero la pestaña nueva del mismo IAB terminó de cargar. La navegación oficial confirmó que las aplicaciones antiguas no están disponibles en este portal y ofreció claves de servicio. Se preparó `/service-keys/149623262/create` con nombre y siete permisos read, sin pulsar Crear. Los clics de casillas no cambiaron su estado; se comprobó el DOM y se usó la interacción accesible por teclado, verificando exactamente las siete selecciones antes de Actualizar el formulario. No se recurrió a ventanas Windows, Chrome externo, perfiles, cookies o mecanismos alternativos.

## Conexión preparada en código

- Crear espacio vacío desde Integraciones → Crear espacio separado. Nombre propuesto: **Plan B · Portal personal**. Crear el espacio no genera contactos ni conecta servicios.
- Elegir **Portal propio real · solo lectura** e indicar dos veces el mismo ID autorizado. Servidor exige revisión explícita, administración/responsable con permiso de conexiones y protección local. La ruta anterior `/hubspot/private` conserva su límite DEVELOPER_TEST/SANDBOX.
- La ruta nueva `/hubspot/private-production` admite exclusivamente STANDARD, verifica que la clave corresponde al ID indicado y comprueba los esquemas. No deduce STANDARD a partir del nombre del portal.
- Solo admite espacio vacío o historial de producción del mismo portal. Repite la comprobación bajo bloqueo antes de guardar, para detectar cambios durante la lectura remota. Una reconexión al mismo portal conserva su historial; las capturas de otros portales/ensayos impiden mezclarlo.
- Credencial y autorización por ID se conservan cifradas. Cada uso comprueba el tipo y la vinculación guardados; la captura vuelve a comprobar la identidad remota. El transporte compartido bloquea escrituras. Las API de lectura no devuelven la clave.
- Cambiar de empresa desmonta el formulario y descarta clave/revisión. Cambiar de modo borra la clave. La carga opcional de ensayos se rechaza si existe conexión o captura CRM; no se ejecutó esa carga en la instalación real.

## Acción externa concreta pendiente de revisión

No se ha creado, leído ni reutilizado una clave para 149623262. El acceso web no entrega una autorización API a Plan B. El formulario de **clave de servicio** ya está preparado con el nombre **Plan B - Portal personal - Solo lectura 2026-10-28** y estos siete permisos:

| Alcance | Finalidad |
| --- | --- |
| `crm.objects.contacts.read` | Contactos y relaciones comerciales |
| `crm.objects.companies.read` | Empresas |
| `crm.objects.deals.read` | Oportunidades y proceso comercial |
| `crm.objects.owners.read` | Responsables disponibles |
| `crm.schemas.contacts.read` | Esquema de contactos |
| `crm.schemas.companies.read` | Esquema de empresas |
| `crm.schemas.deals.read` | Esquema de oportunidades |

Campos básicos de captura: nombre/apellidos/correo/teléfono del contacto; nombre/dominio/teléfono de empresa; nombre/importe/etapa/proceso/cierre de oportunidad; asunto/estado/fecha de tarea y relaciones. No se solicitan permisos de escritura, `sales-email-read`, permisos sensibles adicionales o webhooks para este primer enlace.

Crear la clave de servicio otorga acceso API persistente hasta su retirada; requiere confirmación concreta antes de pulsar Crear. Preparar el código o autorizar la lectura del inicio no equivale a esa creación. La clave nueva deberá introducirse en el formulario protegido, sin guardarla en chat, archivos de evidencia o documentación, ni recuperar sesiones o claves previas. El usuario conserva la posibilidad de hacer personalmente la creación/entrada.

Procedimiento oficial contrastado con [claves de servicio de HubSpot](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/account-service-keys), actualizado 28/10/2026: son credenciales Bearer para REST con alcances por objeto. El formulario del portal confirma la disponibilidad de los siete permisos. La aplicación privada antigua se descartó por el aviso visible del producto; no se intenta habilitarla ni alterar restricciones.

## Siguiente comprobación auténtica

Confirmación concreta del usuario para emitir la clave con el alcance preparado y actualizar/reiniciar únicamente el backend del piloto. El reinicio exige desbloqueo personal. Después, verificar por API ID/tipo, conectar en el espacio personal ya creado y ejecutar una captura de lectura. Registrar resultados reales o errores, sin inventar registros, convertir ensayos en producción ni dar por aceptada toda 0.6.

Frontend actualizado sin reinicio, con respaldo `runtime/index.before-personal-20261028-985111d5d4364be99bdc6be72196b3ce.html`; hashes backend intactos e índice coincidente con dist. Nueva creación de espacio validada en la app real, sin overlay ni errores/warnings en consola. El backend nuevo permanece en fuente/build, pendiente de desplegar. Su capacidad `hubspotProductionPrivate` mantiene oculta la opción de portal real mientras funciona el backend anterior. No se afirma que el endpoint nuevo esté activo en el piloto.

Evidencias en la carpeta de visualizaciones del chat: `planb-portal-personal-vacio.png`, `hubspot-personal-alcance-sin-crear.png` y `hubspot-personal-alcance-completo.png`. Solo páginas IAB de esta tarea, sin secretos. Los resultados de pruebas técnicas se registran en CONTEXTO-PROYECTO.md y no acreditan acceso API remoto.
