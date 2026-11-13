# RESCUE-KIT-116 · Propuesta de integración futura (no ejecutada)

Sesión autora de CLAUDE-RESCUE-KIT-116, 02/11/2026. Describe cómo llevar el Kit de Relevo de la demo aislada al producto. **No se ha integrado nada**: no se tocó App/TeamApp, navegación, APIs existentes, `store.ts`, `recovery.ts`, `crypto.ts`, esquema común, estilos globales, paquetes ni lockfile. Cada punto requiere su propio encargo con reserva y revisión de Codex. Complementa `RESCUE-106-INTEGRACION.md`.

## 1. Punto de entrada mínimo

Un paso secundario dentro de «Ensayo de caída» (la ruta de 106), no una pestaña global: `src/RescueCapsule.tsx` montado lazy, con `CapsuleClient` apuntando a `/api/capsule` registrado por un `registerRescueCapsule(app, room, kit)` análogo al de 106. La demo actual queda como arnés de revisión.

## 2. Contratos estables

- `shared/rescue-capsule.ts`: `planb-rescue-capsule-v1` (componentes, huellas, `STAGE_POLICY`, `coherenceProblems`, informe). Un cambio incompatible crea `v2`; la lectura de `v1` se bloquea con mensaje, sin reinterpretar.
- `shared/rescue-room.ts` (modificado por 116): `lineage` opcional en el estado y hecho `capsule-imported`. Es aditivo; las salas de 106 siguen abriéndose.
- `server/rescue-room-journal.ts` (modificado): `exclusive`, `readAllowlist`, `restoreImported`. El prefijo `rescue:*` sigue reservado.

## 3. Cambios en archivos ajenos que exigirían otra reserva

| Archivo | Cambio | Motivo |
| --- | --- | --- |
| `src/ContinuityHome.tsx` | paso «Relevo» + montaje lazy | punto de entrada |
| `server/app.ts` o `server/main.ts` | registrar la API del kit solo en el servidor local | exponerla |
| `server/recovery.ts` | (opcional) exportar/importar el plan de simulación | hoy el bundle del Store no lo incluye y el kit lo lleva por claves explícitas |
| `server/store.ts` | (opcional) restauración con `workspaceId` nuevo | hoy se reescribe tras `restoreBundle` |
| `package.json` | scripts `rescue:kit` / `rescue:kit:rehearse` | comodidad |

Ninguno es necesario para seguir usando la demo.

## 4. Datos reales

**No se admiten.** La cápsula exige datos de prueba y un remoto de origen `simulation`. Para un portal real haría falta, en un encargo aparte: consentimiento explícito, política de qué se exporta (sin inventario bruto), gestión de claves distinta de una contraseña de ensayo, y una comprobación de **otro equipo** que esta unidad no ha hecho.

## 5. Seguridad y operación

- Servidor propio en loopback, `Host`/`Origin`, `no-store`, CSP, cuerpos acotados, JSON estricto. La contraseña viaja solo en el cuerpo y no se devuelve ni se registra.
- Una importación por cápsula (reclamo con pid y destino; recuperación de reclamos huérfanos). Staging y destinos fallidos tienen prefijos propios (`rescue116-staging-*`, `rescue116-failed-*`); `sweepStaging` limpia solo lo propio y no es recursivo.
- Reclamo de importación (R2): se conserva si el destino pudo publicarse; la recuperación de un reclamo obsoleto es exclusiva y se apoya en el PID del importador **y en un identificador de instancia (`owner`, R3)**; ninguno prueba identidad y no tiene sentido entre ordenadores: antes de montar en un entorno multiequipo hay que sustituirlo por un mecanismo de exclusión adecuado.
- Política de limpieza de carpetas `rescue116-*`/`rescue106-*` en `tests/.tmp`: pendiente de decidir (esta unidad no borra recursivamente).

## 6. Pruebas previas a integrar

1. Revisión independiente de la exportación bajo exclusión y de la política por estado.
2. Repetir el E2E con la integración real (rutas de App) en 1440/390/320.
3. Verificación en un **segundo ordenador** (no hecha): cifrado, rutas, relojes y bloqueo de carpeta.
4. Decidir el límite de tamaño (hoy 64 MiB; medido 6,4 MiB con 10.000 registros, sin SLA).

## 7. Estados que el usuario vería ante una importación (propuesta de presentación; no montada)

Todo es ficción en este equipo; ninguna acción de la lista borra datos. Los códigos son los del servicio.

| Estado | Código | Qué significa | Qué puede hacer la persona |
| --- | --- | --- | --- |
| Publicada y confirmada | (éxito) / `ALREADY_IMPORTED` al repetir | El destino existe y la cápsula queda importada | Abrir el destino. No hay nada que repetir |
| Publicada, confirmación pendiente | `IMPORT_PUBLISHED_UNCONFIRMED` | El destino se publicó pero no se pudo escribir la confirmación | **No volver a importar** (no se creará otro). Reintentar cuando el disco sea escribible; se consolidará. Abrir el destino indicado |
| Publicada con error posterior | `IMPORT_PUBLISHED_WITH_ERROR` | El destino se publicó y algo falló después | Revisar el destino antes de usarlo; no se borra |
| Importación en curso o de otro propietario | `ALREADY_IMPORTED` | Hay una importación activa o un reclamo que no se puede probar obsoleto | Esperar; no hay recuperación automática |
| Dudosa | `IMPORT_AMBIGUOUS` | No se sabe si un intento anterior publicó | Revisar la carpeta de destino que se nombra con `describeClaim`; no importar a ciegas |
| Reclamo ilegible | `CLAIM_UNREADABLE` | El reclamo existe pero no se puede leer | Revisar el fichero; nada se importa |
| Recuperación en curso o interrumpida | `CLAIM_RECOVERY_BUSY` | Hay una exclusión de recuperación; el mensaje dice el pid y si existe | Esperar si ese proceso existe. Si ya no existe: comprobar con `describeClaim` que el reclamo no cambió y que el destino no está publicado antes de decidir nada |
| No se pudo sustituir el reclamo obsoleto | `CLAIM_RECOVERY_FAILED` | El renombrado atómico falló (p. ej. permisos); el mensaje dice si el reclamo anterior quedó comprobadamente igual | No se importó nada. Revisar permisos del reclamo con `describeClaim` y reintentar |
| Error de sistema al reclamar | `CLAIM_CHECK_FAILED` | No se pudo comprobar o tomar el reclamo (código de sistema en el mensaje) | Esta llamada no importó nada y el estado del reclamo no está comprobado: `describeClaim` antes de reintentar. La interfaz recarga el estado real tras cualquier fallo |

Integridad (huella y coherencia), cifrado (contraseña del ensayo) y **autenticidad** (no existe: un hash no atribuye autoría) se muestran por separado. Nada de esto afirma recuperación en otro equipo, RTO/RPO ni HubSpot real. Al montar hará falta diseñar estos textos y repetir 1440/390/320 con teclado, Edge y lector de pantalla; hoy se ven como texto del error.
