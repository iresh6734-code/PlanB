# Misión maestra · 4. Estrategia de comercialización

21/11/2026. Distingue tres cosas:

- lo que el producto **demuestra hoy**;
- lo que **demostrará** al cerrar la hoja de ruta;
- lo que es una **hipótesis comercial** pendiente de validar con clientes.

No se promete recuperación, cobertura ni fiabilidad que el producto no pueda enseñar.

## 1. Qué problema se paga

Cuatro situaciones en las que una pyme que vive en HubSpot pierde dinero o credibilidad:

| Situación | Qué ocurre hoy sin Plan B | Qué hace Plan B | Estado |
| --- | --- | --- | --- |
| **HubSpot no está disponible** (incidente, red o acceso bloqueado) | El equipo comercial para o trabaja de memoria y en hojas sueltas | Copia local operable: Hoy, fichas, tablero y agenda sin conexión; modo contingencia con reloj y expediente | **Demuestra hoy** (simulacro aislado) |
| **Hay que volver tras la caída** | Lo hecho fuera del CRM se pierde o se teclea a mano sin saber qué cambió en HubSpot mientras tanto | Registro de cambios, conflictos campo a campo frente al HubSpot actual y comprobación posterior | Motor real. Paquete de vuelta para producción en fase 4 (A4) |
| **Auditoría, cliente o seguro piden un plan de continuidad** | Un documento genérico sin pruebas | Índice de preparación con evidencias, simulacros fechados y pasaporte con huella | Parcial: pasaporte y simulacros existen; índice único en fase 3 (A1) |
| **Error humano o de integración** (borrado o importación mala) | HubSpot ofrece papelera de 90 días, «Restore CRM changes» de 14 días y un tope de 10.000 registros por restauración | Copia histórica local para consultar valores anteriores y preparar la corrección | Parcial: Plan B **no** restaura dentro de HubSpot; ayuda a saber qué había |

Contexto de mercado (fuentes al final):

- Las caídas de CRM existen pero suelen ser cortas: una fuente de monitorización registra 12 incidentes de HubSpot en 90 días, con una mediana de 1 h 42 min.
- Hay casos largos: Salesforce estuvo unas 20 horas sin servicio en 2016.

**Consecuencia para la venta:** el argumento principal no puede ser «HubSpot se cae mucho». Tiene que ser **«demuestra que tu empresa sigue funcionando y vuelve sin perder trabajo»**. Es continuidad comprobable, no miedo.

## 2. Cliente objetivo

**Primario (hipótesis a validar):** pyme española o europea con HubSpot Sales Hub Starter o Pro, de 3 a 30 comerciales, donde el CRM es la agenda del día. Sectores con ciclos de venta activos y clientes recurrentes: servicios profesionales, distribución, formación e inmobiliaria comercial.

**Canal (hipótesis más fuerte):** **agencias partner de HubSpot.**

- Ya gestionan decenas de portales y venden servicios recurrentes.
- Necesitan diferenciarse.
- Pueden prestar los servicios de implantación, preparación y vuelta de la sección 4.

**Secundario:** empresas que deben justificar continuidad ante clientes, auditorías ISO 22301 o 27001, o aseguradoras de ciberriesgo. **Requiere validación legal:** no se afirma que Plan B «cumpla» NIS2, DORA ni ninguna norma; como mucho, aporta evidencias a un plan de continuidad.

**No es para:** empresas que necesitan restaurar configuraciones de HubSpot (workflows, listas, formularios), multiusuario simultáneo en la copia o equipos sin un PC Windows encendido.

## 3. Competencia y diferenciación

| Capacidad comprobable | Plan B | Rewind Backups | Skyvia / SkyBackup | Commvault, SysCloud | HubSpot nativo |
| --- | --- | --- | --- | --- | --- |
| Copia periódica de objetos CRM | Sí (contactos, empresas, oportunidades y tareas) | Sí, continua y más objetos | Sí, diaria | Sí | No (papelera y exportaciones) |
| Restaurar dentro de HubSpot | **No en producción** (solo cuentas de prueba) | Sí | Sí, también por campo | Sí, con límites de API (IDs nuevos) | 90 días de papelera; 14 días de cambios |
| **Seguir trabajando sin HubSpot** | **Sí** | No consta | No consta | No consta | No |
| **Simulacro que demuestra la recuperación** | **Sí, aislado** | No consta | No consta | No consta | No |
| **Devolver el trabajo hecho durante la caída, con conflictos** | **Sí (motor real; paquete en fase 4)** | No consta | No consta | No consta | No |
| Evidencias para auditoría | Pasaporte, informe e expediente | No consta | No consta | Informes de copia | No |
| Dónde viven los datos | **En el equipo del cliente**, cifrados | Nube del proveedor | Nube del proveedor | Nube o instalación del proveedor | HubSpot |
| Objetos de configuración (workflows, listas, formularios) | No | Sí | Parcial | Parcial | — |

«No consta» significa que las fuentes consultadas no lo mencionan, no que esté demostrado que no existe. Antes de usar esta tabla en material público, hay que revisarla en las páginas actuales de cada proveedor.

### Ventajas defendibles

1. **Operar, no solo copiar:** la copia es un entorno de trabajo.
2. **Demostrar:** simulacro aislado e índice de preparación con evidencias.
3. **Volver con control:** la vuelta del trabajo de la contingencia con decisión humana campo a campo.
4. **Soberanía:** los datos no salen del equipo del cliente. Simplifica la conversación de privacidad, y su encaje jurídico tiene que validarse.
5. **Claridad:** una pantalla dice qué está protegido, qué no y qué falta.

### Debilidades que hay que decir en voz alta

- No restaura configuración ni datos borrados dentro de HubSpot. Se complementa con una copia en la nube, no la sustituye.
- Necesita un PC Windows encendido para capturar. Un solo operador por copia.
- Sin clientes ni pilotos: la fiabilidad está probada en laboratorio, no en producción.

## 4. Producto más servicios

| Oferta | Qué incluye | Qué automatiza la App | Qué es trabajo profesional |
| --- | --- | --- | --- |
| **Implantación** (pago único) | Instalación, conexión de lectura a HubSpot, primera captura, revisión de cobertura, contraseña, exportación cifrada y primer simulacro | Asistente «Configurar Plan B», índice de preparación y simulacro | Crear la app privada en HubSpot, decidir cobertura y formar al equipo |
| **Preparación** (cuota) | Seguimiento mensual del índice, simulacro mensual, informe del mes con su marca y recomendaciones | Capturas, simulacro programado (A3) e informe del mes | Revisar resultados, proponer mejoras y reunión trimestral |
| **Continuidad** (cuota o bolsa de horas) | Acompañamiento durante una caída en horario pactado | Modo contingencia y expediente | Atención humana. Sin SLA 24/7 mientras no exista equipo para darlo |
| **Recuperación** (por incidente) | Revisión de conflictos, paquete de vuelta, importación asistida en HubSpot y comprobación | Conflictos, paquete de vuelta (A4) y comprobación | Decidir conflictos con el cliente e importar |
| **Mantenimiento** (incluido en la cuota) | Actualizaciones y soporte | Diagnóstico sin fichas ni claves | Soporte |

**Modelo de licencia (hipótesis):**

- Personal gratuito (copia manual y simulacro manual).
- Pro por portal y mes (capturas programadas, simulacro programado, índice e informes).
- Agencia por paquete de portales.

Los precios **no se fijan aquí**: se validan con 5-10 entrevistas a agencias, preguntando cuánto cobran hoy por servicios recurrentes de HubSpot. Referencia de mercado: Skyvia tiene un nivel de entrada gratuito.

## 5. Qué falta antes de vender a un cliente real

| Requisito | Bloquea la venta | Estado | Fase |
| --- | --- | --- | --- |
| Arranque sin alertas de antivirus/EDR (DPAPI vía PowerShell) | **Sí** | Pendiente de decisión (A7) | 2-3 |
| Licencias verificables (clave de firma) | **Sí, para cobrar** | Representado (A6) | 6 |
| Instalador firmado y actualización | Sí | `ABRIR PLAN B.cmd` | 6 |
| Paquete de vuelta probado en un sandbox de HubSpot | Sí, para prometer la vuelta | Motor real, sin prueba auténtica | 4 |
| Índice de preparación único | Sí, es la promesa | Fase 3 (A1) | 3 |
| Interfaz coherente (Superplan B) | Sí, por percepción de calidad | En curso | 2-5 |
| Política de retención y borrado de capturas | Sí (RGPD) | No declarada | 5 |
| Copia de la propia base de Plan B antes de migraciones | Sí | Parcial | 5 |
| Documentación de cliente (instalación, simulacro, vuelta y límites) | Sí | Dispersa | 6 |
| Condiciones de uso, contrato de encargo de tratamiento (si la agencia accede a datos) y revisión de los términos de la API de HubSpot | **Sí: validación legal** | No iniciado | 6 |
| Multiempresa en la nube | No para 1.0 | Demo | Después de 1.0 |

## 6. Versión comercial objetivo: **Plan B 1.0 · Continuidad para HubSpot**

**Incluye:**

- Captura de lectura programada y cifrada en local.
- Índice de preparación de cinco criterios.
- Simulacro manual y programado con evidencia.
- Modo contingencia.
- Trabajo diario sobre la copia: Hoy, Agenda, listas, fichas y tablero.
- Cambios y paquete de vuelta con conflictos y comprobación.
- Exportación cifrada.
- Informes: parte, informe del mes, expediente y pasaporte.
- Licencia Pro verificable.

**No incluye (dicho en la web):**

- Restauración dentro de HubSpot y objetos de configuración.
- Multiusuario y nube.
- IA con datos reales.
- Laboratorio (solo en el modo demostración).

**Se considera terminada** cuando se cumplen los criterios de `05-hoja-de-ruta.md`, §4.

## Fuentes consultadas (21/11/2026)

- [Rewind · Backups for HubSpot](https://rewind.com/products/backups/hubspot/)
- [Skyvia Backup en G2](https://www.g2.com/products/skyvia-skyvia-backup) · [Rewind vs Skyvia en TrustRadius](https://www.trustradius.com/compare-products/rewind-backups-vs-skyvia-backup) · [SkyBackup en el marketplace de HubSpot](https://ecosystem.hubspot.com/marketplace/apps/skybackup)
- [ProBackup · comparativa (material del proveedor)](https://www.probackup.io/compare/probackup-vs-skyvia-for-hubspot)
- [HubSpot · Restaurar registros eliminados](https://knowledge.hubspot.com/records/restore-deleted-records) · [HubSpot · Restaurar cambios de workflows](https://knowledge.hubspot.com/workflows/restore-workflow-crm-property-changes)
- [Commvault · Restaurar datos de HubSpot](https://documentation.commvault.com/fujitsu/11.46/software/restore_hubspot_data.html) · [SysCloud · Límites de restauración de HubSpot](https://help.syscloud.com/hubspot-restore-limitations)
- [UptimeRobot · Incidentes de HubSpot](https://uptimerobot.com/is-it-down/hubspot/2026-09-24/) · [Invenio IT · Caídas de Salesforce](https://invenioit.com/continuity/salesforce-outage/) · [HubSpot · Fiabilidad](https://www.hubspot.com/reliability)
