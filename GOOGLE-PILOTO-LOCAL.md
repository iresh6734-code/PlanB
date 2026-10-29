# Google · Piloto local autenticado

Estado comprobado el 27/10/2026, Europe/Madrid. Es una aceptación parcial de 0.6; no sustituye el despliegue multiusuario ni cierra 0.5 en nube.

**Ensayo posterior completado, 27/10/2026 17:50:** propuesta `b00607ff-4c4a-494c-8d90-07d609412eac`, aprobada expresamente por el usuario y ejecutada una sola vez. Correo Personal con firma «[Ensayo Plan B] Próximos pasos · Nube de Ensayo» enviado a la propia cuenta y recibido en Gmail (búsqueda exacta, un resultado en Recibidos). Docs `1JmNtBvzSkI6dy0lnCDUYFuIz0rMbRCnoCXgs0Uuy2oI` y Sheets `1qlcD5e7tZJQkvMlESHXWeDLhlXI5ZJVbdmAZgJmx4DE` creados, contenido/celdas verificados por API y abiertos en Google, privados solo para mí. Cabecera y anchura del informe mejoradas manualmente sin cambiar datos; automatizar la presentación sigue pendiente. Tarea interna y cuatro evidencias persistentes tras recarga. Calendar desactivado; no se compartieron archivos, escribió CRM ni repitió el ensayo antiguo. La recepción es comprobación manual adicional; la API Gmail y la interfaz siguen indicando aceptación, sin atribuirles prueba de entrega/lectura. Sin código, build, pruebas unitarias o reinicio nuevos en esta operación.

## Configuración real

- Proyecto **Plan B - Piloto**, ID `planb-crm-piloto-20261027`, número `699668775458`.
- Cliente web **Plan B - Piloto local**, un único callback: `http://localhost:4334/team/oauth/google/callback`. Sin orígenes JavaScript adicionales.
- Gmail, Calendar, Drive, Docs y Sheets habilitados y comprobados en consola. Audiencia externa en **Prueba**, con una cuenta propia de ensayo autorizada por el usuario.
- Consentimiento real completado; Plan B confirmó la conexión. Permisos: identidad/correo, `gmail.send`, `calendar.events.owned`, `calendar.freebusy` y `drive.file`. No hay lectura amplia del buzón.

## Instalación y arranque

Carpeta nueva del ordenador actual: `planb-local-google-pilot-2026-10-27/`. La demo anterior conserva sus bases y proveedores simulados.

```powershell
npm run build
npm run start:google-pilot
```

Abrir **http://localhost:4334/team?view=commercial** en Codex. Usar `localhost`, no `127.0.0.1`: el host y el callback se comprueban exactamente. El servicio escucha exclusivamente en loopback. El lanzador conserva una copia propia de los binarios y de la interfaz en `runtime/`; usa una junction a las dependencias de este checkout. No es un paquete portable.

El operador eligió personalmente su contraseña en el navegador. Las sesiones duran 30 minutos y se pierden al reiniciar el servicio; la identidad y la contraseña derivada persisten. No se conserva la contraseña original ni existe recuperación automática. El acceso de perfiles de demo, las invitaciones y la vinculación de otros dispositivos están bloqueados en este modo. El despliegue de equipos sigue utilizando identidad gestionada.

## Custodia

El cliente OAuth está cifrado en `.google-oauth.enc`. La clave AES queda protegida por **Windows DPAPI CurrentUser** en `.planb-key`; los tokens OAuth se cifran con esa clave antes de persistir. El identificador local del operador y la derivación scrypt de la contraseña se guardan cifrados en `.operator.enc`. Estos archivos y todos los datos de la instalación están excluidos de Git.

El navegador no entregó un JSON descargado utilizable. Se realizó un transporte cifrado en memoria con AES-GCM y RSA-OAEP; la clave privada de transporte también estaba cifrada bajo DPAPI. El guardado definitivo se abrió y comprobó antes de eliminar los tres archivos de transporte cifrado. No se escribió un JSON de credenciales en texto plano. No compartir esta carpeta como un ZIP de producto ni moverla a otro usuario de Windows.

El cifrado descrito cubre credenciales y tokens. Los registros ficticios de PostgreSQL embebido no adquieren cifrado integral de base de datos por usar esta modalidad.

## Uso comprobado y límites

Se creó **Plan B · Ensayo Google** y se cargaron 62 registros ficticios nuevos. El flujo de navegador acreditó entrada, creación del espacio, carga y navegación comercial. La conexión OAuth real se completó con identidad verificada, PKCE y estado de un solo uso; las pruebas automatizadas conservan su cobertura de separación por empresa, permisos e invalidación.

Una lectura de Drive mediante el conector real terminó sin errores; no había archivos autorizados para esta aplicación. Con `drive.file` no se enumera todo el Drive. La selección de archivos preexistentes mediante Picker sigue pendiente.

**Ensayo real completado el 27/10/2026:** el usuario aprobó expresamente el correo «[Ensayo Plan B] Gmail y Calendar», su texto, la propia cuenta como único destinatario y la reunión del **28/10/2026, 16:30–17:00 Europe/Madrid**. Plan B comprobó disponibilidad, guardó una tarea interna, obtuvo aceptación Gmail y creó/leyó el evento para verificar contenido, horario y participante. Propuesta `120dd14f-8f1b-4604-a917-2bbd802da179`; evento determinista `planb120dd14f8f1b4604a9172bbd802da179`. El navegador confirmó además el correo recibido y el detalle del evento con una única cuenta invitada. La consulta de Gmail fue una comprobación manual del ensayo; no amplía los permisos de lectura del conector ni transforma la aceptación API en un recibo de entrega general.

Al recargar se conservaron una propuesta completada, las tres evidencias y una tarea interna; no se volvió a ejecutar ni enviar. La deduplicación ante repetición deliberada de la petición sigue cubierta por pruebas sintéticas anteriores, no por una segunda ejecución remota en este ensayo. Una búsqueda manual por el Message-ID esperado no encontró el mensaje; la comprobación de recepción se hizo por asunto/cuentas/fecha y contenido, sin depender de esa cabecera.

Docs y Sheets estaban desactivados: su escritura real sigue pendiente. No se han conectado HubSpot o IA a esta instalación, contratado recursos facturables, publicado la app OAuth ni desplegado infraestructura. El siguiente ensayo recomendado es preparar una propuesta ficticia en Docs y un informe Sheets, revisarlos y obtener su aprobación antes de ejecutar. La aceptación completa de nube, datos, agentes e integraciones de 0.5/0.6 permanece abierta.

## Seguimientos personales · mejora del 27/10/2026

Tras revisar el primer correo técnico, el usuario eligió **«Sobrio y personal: buen texto, firma y reunión clara»**. El editor incorpora presentación Personal (HTML) o Texto simple, firma opcional y vista previa. El formato Personal utiliza párrafos legibles, un bloque discreto con fecha/hora de Madrid y firma; sin imágenes remotas, seguimiento ni HTML introducido por el usuario. La vista previa y el emisor MIME comparten el renderizador. El envío contiene alternativas HTML y texto, conservando el comportamiento antiguo en propuestas sin formato.

Los nuevos borradores usan empresa, oportunidad abierta, etapa y etiquetas de servicio de la copia CRM del espacio. Se guarda el contexto empleado y su origen; la redacción se prepara con reglas, sin llamar a IA ni leer el buzón. No se afirman conversaciones ni acuerdos previos. Cambiar formato, firma o contenido invalida la aprobación. Los correos de prueba ya enviados conservan su contenido original; esta mejora no los reemplaza ni autoriza otro envío.

Compilación y **159/159 pruebas** de lógica/API correctas en esta revisión, incluidas alternativas MIME, escape HTML, zona horaria, compatibilidad con propuestas antiguas, contexto y aprobación. La primera revisión visual detectó que estilos globales de tablas del CRM causaban alineación derecha/nowrap en el correo; corregido mediante aislamiento CSS y comprobado después. Build y tres pruebas del correo repetidos correctamente tras la corrección de redacción/estilo. Navegador de Codex: guardar, recargar, alternar formatos y conservar firma; **1440×1000 y 390×900**, sin desbordamiento, overlay ni errores de consola. Evidencias en `correo-personal/` dentro de la carpeta de este chat. La aceptación del HTML renderizado por Gmail requiere un nuevo ensayo aprobado; la vista previa local y las pruebas del emisor no la sustituyen.

El piloto final, PID 13896, conserva el borrador `37c1771b-5f72-425f-be36-315897efc2a8` y OAuth, pero debe desbloquearse tras el último reinicio. Una demo independiente en **http://127.0.0.1:4335/team?view=commercial** permite revisar el nuevo formato sin contraseña; utiliza datos ficticios nuevos, adaptadores simulados y tráfico externo bloqueado. Carpeta `planb-local-correo-2026-10-27`, PID 16164. No confundirla con las escrituras reales del piloto 4334. El borrador nuevo no se ha aprobado ni ejecutado.

## Validaciones anteriores

- Build completo y TypeScript correctos; **155/155 pruebas de lógica/API** superadas, incluidas cuatro nuevas de configuración cifrada y piloto local.
- Denegación sin sesión, origen/host distinto, suplantación de perfil, recuperación de identidad, expiración/revocación de sesiones y límite de intentos comprobados.
- DPAPI real confirmado al guardar y al arrancar Windows. Las pruebas con secretos sintéticos no sustituyen esa comprobación nativa.
- Navegador integrado de Codex: pantalla real, sin overlay ni errores de consola, entrada realizada por el usuario, espacio/carga/navegación y OAuth reales. La comprobación de esta tarea es de escritorio; los 16 E2E de la entrega UX anterior no se presentan como repetidos aquí.
- Evidencias actuales: `C:/Users/iresh/.codex/visualizations/2026/10/27/01a17cef-9628-7662-9968-804ac53455ba/`.

Validación posterior de operación real: borrador → revisión humana en chat → aprobación en Plan B → ejecución → correo recibido/evento verificado → recarga. Sin errores de consola en Plan B. La edición automática inicial de las fechas no llegó al estado React; se usaron los controles nativos, se guardó y se volvió a leer el horario persistido antes de pedir aprobación. No se cambió código ni se repitió el build o las 155 pruebas en este ensayo operativo. Evidencias específicas: `ensayo-gmail-calendar-completado.png`, `ensayo-persistencia-verificada.png`, `ensayo-gmail-recibido.png`, `ensayo-calendar-verificado.png` y `ensayo-real-validacion.json`. Las capturas de proveedores se limitan al mensaje/evento de prueba; no se conserva contenido ajeno de la bandeja ni de la agenda.
