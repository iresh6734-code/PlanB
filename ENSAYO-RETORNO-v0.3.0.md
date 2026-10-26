# Devolución auténtica de ensayo · propuesta concreta v0.3.0

Destino único: portal ficticio 149623339, tipo DEVELOPER_TEST. La clave 58711306 actual permanece en lectura; no se amplía ni se muestra su valor.

## Alcance propuesto (todavía sin ejecutar)

Crear como máximo cuatro fichas nuevas con prefijo [FICTICIO] Plan B v0.3 QA y un identificador de ejecución: una empresa, un contacto, una oportunidad y una tarea. Sin correos de personas ni direcciones operativas, sin recordatorios, sin eliminar o modificar fichas anteriores. Asociar contacto/empresa, oportunidad/empresa/contacto y tarea/contacto/oportunidad. Elegir pipeline y etapa de los metadatos del mismo portal, sin crearlos ni cambiarlos.

Después modificar únicamente el teléfono ficticio de ese contacto nuevo y el estado de la tarea nueva a través del flujo revisado. Leer valores y relaciones resultantes; repetir el mismo plan para demostrar que no duplica altas. Guardar IDs no secretos, captura/revisión y resultado, sin credencial. Los fallos de red y conflictos se prueban primero con mocks; no provocar un corte que afecte a otros servicios.

## Requisitos para ejecutar

1. Confirmación expresa de este alcance y revisión de workflows/automatizaciones del portal de ensayo.
2. Administrador prepara una credencial temporal del portal de ensayo con lectura y los permisos de escritura estrictamente necesarios para contactos, empresas, oportunidades y tareas según el selector disponible. No añadir accesos de seguridad ni datos sensibles como sustituto.
3. Introducir esa credencial únicamente en el campo oculto de devolución de Plan B. No pegarla en chat ni guardarla en archivos de evidencia. La credencial de captura permanece separada.
4. Revisar el plan visible antes de aprobar/aplicar. Si algo no coincide con el alcance, detener el envío y conservar la sesión.
5. Tras verificar el resultado, revocar la credencial temporal en el portal y conservar únicamente el informe sin secretos. La revocación requiere acceso del administrador.

El código y las pruebas locales están preparados; este documento no demuestra que la devolución auténtica haya ocurrido ni autoriza producción. Revisar la disponibilidad de scopes reales antes de crear la credencial.

## Caso preparado 6c85db4f · 26/10/2026

Instancia nueva: [http://127.0.0.1:4324/](http://127.0.0.1:4324/), carpeta `planb-ensayo-retorno-2026-10-26-6c85db4f`. Contiene cuatro fichas locales nuevas y cuatro cambios pendientes. La demo 4323 y la instalación de lectura 4322 se conservan separadas.

Prefijo exacto de las cuatro altas: **[FICTICIO] Plan B v0.3 QA 6c85db4f**.

| Fase | Operación propuesta | Valores y relaciones |
| --- | --- | --- |
| 1 | Crear Empresa | Nombre con el prefijo y sufijo Empresa; dominio `planb-6c85db4f.invalid`. |
| 1 | Crear Contacto | Nombre con prefijo y sufijo Contacto; apellidos Ensayo; teléfono `000 000 001`; sin correo. Asociar a la empresa nueva. |
| 1 | Crear Oportunidad | Nombre con prefijo y sufijo Oportunidad; importe 100; pipeline `[FICTICIO] Plan B · Nuevos clientes` (`4252418259`); etapa Contacto inicial (`6289265901`). Asociar a empresa y contacto nuevos. |
| 1 | Crear Tarea | Asunto con prefijo y sufijo Tarea; estado `NOT_STARTED`; vence `2026-10-28T10:00:00Z` (11:00 Europe/Madrid). Asociar a contacto y oportunidad nuevos. |
| 2 | Actualizar el contacto recién creado | Teléfono de `000 000 001` a `000 000 002`. |
| 2 | Actualizar la tarea recién creada | Estado de `NOT_STARTED` a `COMPLETED`. |

No se incluyen fichas existentes en esta instancia. No se enviarán valores de propietario, cuerpo, prioridad o recordatorios. Esto no prueba que las automatizaciones del portal no puedan producir otros efectos: **su revisión sigue pendiente**.

La preparación usa solo el esquema de la captura guardada `6d65d147-1ecd-4e87-bf56-9fb742f2e9ce:2026-10-26T10:58:24.957Z`; no copia sus registros, credenciales o contraseña. Las dos fases se han ejercitado con el motor de devolución real y un destino en memoria: cuatro altas, cinco relaciones y dos actualizaciones; reenvío del plan completado bloqueado; cambios originales conservados pendientes. **No se ha realizado el envío auténtico.**

Comprobación nueva por API de lectura el 26/10/2026 a las 13:45 UTC: portal `149623339`, tipo `DEVELOPER_TEST`, pipeline/etapa y 14 valores/campos propuestos confirmados. La credencial de lectura guardada en este Windows se utilizó únicamente en memoria y no se copió a la instancia nueva. No se solicitaron scopes adicionales. Los metadatos pueden cambiar antes del envío y deben verificarse de nuevo si ocurre.

Evidencia externa Codex: carpeta `ensayo-retorno-2026-10-26`, con `plan-retorno-6c85db4f.json`, `preflight-6c85db4f.json`, `qa-local.json`, capturas y 71 pruebas de código superadas. El plan JSON documenta la propuesta; no es una aprobación ni contiene IDs remotos auténticos de las altas. En la interfaz hay un plan **simulado**, estado **Pendiente de revisión**; no se aprobó ni aplicó.

## Siguiente actuación necesaria

1. **Completado:** protección local elegida por el usuario en 4324; comprobada únicamente su existencia, sin leer contraseña o cookies.
2. **Completado:** lectura del mismo portal en esta instancia protegida, reutilizando internamente la conexión cifrada de este PC. Nueva cuenta DEVELOPER_TEST confirmada a las 13:50 UTC; credencial cifrada con la clave Windows propia del ensayo. La instalación de origen no se modificó. Se reinició exclusivamente 4324, que sigue con red externa bloqueada y cuatro cambios pendientes; hay que desbloquear de nuevo con la contraseña del usuario. No existe clave temporal de escritura guardada.
3. Revisar workflows por interfaz con un administrador. La [API de workflows exige el scope automation](https://developers.hubspot.com/docs/api-reference/legacy/automation/workflows/guide), que permite acceder a esa familia de operaciones; no se ampliará la clave de lectura para revisar automatizaciones.
4. Preparar la clave de servicio temporal **Plan B · Retorno temporal · 6c85db4f**, sin crearla todavía automáticamente. HubSpot requiere acceso de desarrollador y solo permite conceder scopes que el usuario ya tenga, según su [documentación de Service Keys](https://developers.hubspot.com/changelog/service-keys). El selector real y los permisos de tareas todavía necesitan revisión; no inventar permisos ni añadir accesos de seguridad como sustituto.
5. Revisar el plan vivo de las cuatro altas, aprobar expresamente el alcance y aplicar. Tras verificar valores y cinco relaciones, preparar una segunda revisión para los dos cambios sobre sus IDs auténticos. Conservar evidencia y revocar la credencial temporal al cerrar.

Acceso visual pendiente: el control de navegador devolvió `Local browser use is disabled in Work settings`; apertura en Codex solicitada con resultado `queued`, sin confirmación de render. A petición del usuario se intentó Edge: no apareció en el inventario y `msedge.exe` no arrancó (ShellExecuteW 2). No se instaló otro navegador ni se desactivaron controles. La interfaz local se verificó con Chrome de pruebas aislado, sin utilizar la sesión del usuario ni autenticarse en HubSpot.

Próxima acción manual: abrir [Claves de servicio del portal 149623339](https://app-eu1.hubspot.com/service-keys/149623339), iniciar el formulario **Crear clave de servicio**, dar el nombre **Plan B · Retorno temporal · 6c85db4f** y detenerse en el selector de permisos para revisarlos. No crear todavía la clave ni enviarla al chat. El acceso visual a ese selector y la revisión de workflows siguen siendo requisitos previos al envío.
