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
