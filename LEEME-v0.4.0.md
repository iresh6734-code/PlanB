# Plan B 0.4.0 · Primer agente y continuidad comprobable

Esta entrega implementa la fase 0.4 del plan 1.0: una base local fiable y un agente de seguimiento en simulación. Conserva el diseño aprobado y el alcance de producción en lectura. No es todavía el SaaS multiusuario ni una integración operativa con Google.

## Usar la nueva experiencia

1. Prepara y activa el conjunto ficticio Agencia Norte o Distribuidora Atlas.
2. Abre **Hoy**. Muestra oportunidades abiertas sin tarea pendiente en los próximos siete días y tareas vencidas o para hoy, con fecha de Europe/Madrid.
3. Pulsa **Preparar seguimiento simulado** o abre **Agentes → Analizar seguimiento**.
4. En **Cambios → Propuestas de agentes**, revisa cada motivo, la captura/revisión, las acciones y sus destinatarios. Una propuesta sin contacto con correo válido prepara únicamente la tarea ficticia.
5. Marca la revisión y pulsa **Aprobar simulación**, después **Ejecutar simulación aprobada**. Los resultados se guardan como tarea, mensaje y reunión ficticios, separados de los registros CRM.
6. Abre **Integraciones** para distinguir la conexión HubSpot existente, los adaptadores simulados Gmail/Calendar y las capacidades futuras de Drive/Docs/Sheets.

El motor de esta fase usa reglas deterministas: no llama a IA, no consume presupuesto de modelos, no lee el buzón ni consulta disponibilidad de calendario. Una reunión propuesta no equivale a una reserva. Tampoco envía correos, escribe en HubSpot o crea tareas en el CRM activo.

Las propuestas y resultados se cifran en el almacenamiento local y sobreviven al reinicio de la misma carpeta. La exportación CRM incluye registros e historial CRM, **no** el historial de simulaciones. Restaurar o activar un conjunto distinto elimina las propuestas del espacio anterior. Se conservan hasta 100 propuestas, 50 ejecuciones y un máximo de 20 propuestas por análisis. Al alcanzar 100 propuestas se detiene el ensayo, sin borrar evidencia automáticamente.

## Revisión, límites y resultados inciertos

Cada aprobación queda ligada a un hash del contenido y a la revisión de datos utilizada. Una edición posterior invalida la ejecución pendiente. La aprobación caduca a las 24 horas; puede revocarse rechazando la propuesta y preparando otra. Una ejecución repetida ya verificada devuelve el resultado existente.

Solo se admite el modo `simulation`. Máximo una ejecución a la vez, ocho herramientas y 120 segundos por ejecución. Un fallo parcial conserva los resultados previos y bloquea nuevos intentos de esa propuesta; no implica que se haya completado el ciclo. El proceso registra las ejecuciones interrumpidas después de reiniciar.

## Exportar y custodiar la revisión correcta

**Exportar** identifica el espacio activo, su captura, revisión, registros y cambios. Si el historial contiene una captura más reciente, muestra la diferencia explícitamente: la descarga sigue conservando el espacio activo.

La exportación cifrada registra hash de archivo y revisión. La confirmación de custodia solo vale para esa revisión. Las ediciones posteriores hacen que deje de aparecer como vigente; hay que volver a exportar y confirmar. Los comprobantes históricos sin revisión identificada necesitan una exportación nueva.

**Continuidad** muestra si la actualización está pausada, último intento, último éxito de conexión y fallos previos al arranque de un trabajo. Un proceso apagado sigue sin poder detectarse a sí mismo; el monitor externo pertenece a la fase de nube.

## Desarrollo y validación

Windows, Node >=24. Mantener una carpeta de datos por instalación y no reutilizar instalaciones operativas para las pruebas.

```powershell
npm ci
npm run build
npm test
# El proyecto usa Edge por defecto. Para Chrome instalado:
$env:PLANB_PLAYWRIGHT_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:e2e
```

API nueva: `GET /api/v4/today`, `/agents`, `/integrations`, `/export-summary`; `POST /api/v4/agent-runs`; `POST /api/v4/proposals/:id/approve`, `/reject`, `/execute`. Las mutaciones exigen modo simulado y las aprobaciones/ejecuciones exigen revisión explícita y hash de contenido. Se conserva la autenticación local existente. No hay identidad de equipos ni conexión cloud en esta entrega.

Las rutas de exportación v2 admiten un campo opcional `revision` para rechazar descargas sobre una vista previa desactualizada. La confirmación v3 comprueba la revisión real incluso cuando un cliente antiguo omite ese campo. No se altera el formato del paquete de continuidad ni se amplían permisos de las conexiones existentes.

El roadmap aceptado está en `PLAN-1.0.md`. La lectura auténtica y devolución de ensayo histórica mantienen sus condiciones y evidencias independientes; las simulaciones nuevas no las sustituyen.
