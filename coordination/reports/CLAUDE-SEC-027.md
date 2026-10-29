# CLAUDE-SEC-027 · Endurecimiento de seguridad tras la auditoría independiente

29/10/2026, Europe/Madrid. Autor: Claude (Sonnet 5.5), por petición del usuario.

## Origen: tres auditorías independientes de solo lectura

Tres subagentes distintos del autor auditaron (A) autenticación, permisos y aislamiento entre empresas, (B) OAuth, conexiones y secretos, y (C) entrada de datos, acciones externas e interfaz. **Ninguna encontró hallazgos críticos ni altos.** Resistieron: aislamiento entre empresas (IDOR, RLS), escalado de rol, estados OAuth (aleatorios, ligados, de un solo uso, PKCE), evasión del transporte de solo lectura de HubSpot (probadas ~15 variantes), inyección de cabeceras de correo, XSS en correo y vista previa, «aprobación ligada a contenido» (sin TOCTOU ni doble ejecución) y la restricción de piloto «solo mi cuenta». Cada hallazgo se verificó leyendo el código y con una prueba que primero falló.

## Corregido (9 + higiene)

| ID | Gravedad | Qué se hizo |
| --- | --- | --- |
| A1 | Media | El bloqueo de rutas del piloto (invitaciones, miembros, dispositivos, `device/*`) se evadía con query o percent-encoding. Ahora usa la ruta normalizada (`pilotPath`) y **falla cerrado** ante una codificación inválida. |
| B1 | Media | Desconectar Google solo borraba filas. Ahora, tras confirmar la transacción, revoca en `oauth2.googleapis.com/revoke` los tokens de la conexión y de la conexión de archivos (mejor esfuerzo, sin el secreto del cliente; un fallo no impide desconectar). |
| C1 | Baja | La aprobación no caducaba y `execute` no revalidaba la reunión. Ahora la aprobación caduca a las 24 h (`approved_at`; las anteriores reciben fecha al migrar) y `execute` rechaza (409) una reunión ya pasada. |
| A3 | Baja | Las invitaciones no caducaban: ahora a los 14 días; volver a invitar renueva el plazo. |
| A5 | Baja | `REVOKE UPDATE,DELETE` sobre `team_audit` y `team_events` para el rol acotado (solo añadir); también al reejecutar el esquema sobre una base con los permisos antiguos. |
| A4 | Baja | JSON inválido → 400 y cuerpo demasiado grande → 413 (antes 500), con mensaje genérico y sin trazas. |
| B3 | Baja | `accountId` de HubSpot `\d{1,20}` en el inicio OAuth y en la conexión privada. |
| C2 | Baja | CSV de cambios: `csvCell` neutraliza celdas que empiezan por `=`, `+`, `-` (no numérico), `@`, tabulador o retorno; los números no se tocan. |
| C3 | Baja | Sheets: celdas ≤1000 caracteres en la lectura real, `lastname`/`phone` ≤100, `firstname` ≤200, correo ≤254; se conservan solo las **20 vistas previas pendientes más recientes** por empresa y se limpian las de más de 24 h (nunca bloquea al usuario). |
| B10 | Info | `debug.log` en `.gitignore`. |

## Verificación

- `tests/security-hardening.test.ts`: **15 pruebas**. Las 11 que reproducían un fallo **fallaban sobre el código anterior**; ahora 15/15. `tsc` limpio, `npm test` **599/599**, y los **30 recorridos E2E** (navegador aislado) correctos contra el servidor endurecido.
- **Revisión independiente** (subagente distinto, solo lectura, 27 variantes de ruta del piloto probadas contra la app real, mutaciones y simulación de migración doble): *aprobado con reservas*, sin regresiones graves ni evasiones; ningún código escribe, actualiza o borra la auditoría con el rol acotado, y la migración es idempotente. Aplicado: fallo cerrado ante codificación inválida, fecha a las aprobaciones antiguas, vistas previas «las 20 más recientes» en lugar de bloquear 24 h (su hallazgo de usabilidad M1), y tres pruebas nuevas para huecos suyos (reunión a +1 h, `REVOKE` sobre base antigua, limpieza a 24 h). Mutaciones comprobadas sobre los archivos reales (restaurados): sin control de reunión futura, sin `REVOKE` y sin limpieza a 24 h fallan cada una al menos una prueba.
- Hashes SHA-256 (16 primeros): `app.ts` 00ad500cb194767d · `commercial.ts` 830162499226c7a8 · `google.ts` 470b921f34bc19e6 · `schema.ts` a354c2ceb1f523a5 · `repository.ts` 4f19199e439ec8b7 · `server/app.ts` 64cfe725feba154d · `.gitignore` 0f6127658400b60d · `tests/security-hardening.test.ts` 9481e2cacd5e8aef.

## Diferido y por qué

**Para Codex (`server/team/oauth.ts`, archivo suyo):** verificar permisos (`scopes`) y `hub_id` tras canjear el token con `GET /oauth/v1/access-tokens/{token}` y fallar cerrado si faltan (hoy, si HubSpot no los devolviera, no se validan y `ownerPermission` sería siempre falso); tope de estados OAuth pendientes por empresa; `confirmedAccountId` también en el inicio OAuth (hoy un portal STANDARD pasa a producción de solo lectura sin la confirmación que sí exige la ruta privada); revocar el token de HubSpot al desconectar (`repository.disconnectHubspot` no tiene el secreto descifrado a mano: requiere diseño).

**Decisión de producto (del usuario):** un **visor** de solo lectura puede hoy listar el Drive de la cuenta conectada, leer hasta 20 000 caracteres de un Google Doc vinculado y ver cuerpos de notas/correos de HubSpot en vivo; además esas lecturas actualizan estados (`commercial.ts` y `copilot-agent.ts` hacen `UPDATE` dentro de un `GET`). Si el visor solo debe ver la instantánea, hay que exigir `write` o `connections` en esas rutas y mover los `UPDATE` a un job.

**Otros, sin cambio:** cifrado de tokens sin datos asociados (tenant/tabla/columna), sin versión de clave y con regreso a texto plano (`crypto.ts`): migración invasiva, solo explotable con escritura en la base de datos; RLS de `team_spaces`, `team_members`, `team_invites`, `team_device_keys`; revocar y listar invitaciones (necesita interfaz); acceso inicial `/local-pilot/setup` sin secreto y limitador de login global (solo importa con varios usuarios en el mismo Windows); `audience` del token del worker derivado de `Host`; HSTS y `connect-src` del CSP más estrecho; PKCE en HubSpot; DPAPI con `powershell.exe` sin ruta absoluta; el mismo usuario `sales` puede aprobar y ejecutar un envío (no hay doble control); cuerpo de 20 MB leído antes de autenticar y sin límite de frecuencia en toda la aplicación.

## Límites

Probado con la base embebida (PGlite), no con Postgres gestionado: en él el `REVOKE` solo retira lo que concedió el mismo rol migrador. Sin API real de Google: la revocación se probó con transporte de prueba. La revocación bloquea la respuesta de «Desconectar» hasta 10 s si Google no responde, y no informa a la interfaz de si tuvo éxito. Si el proceso cae justo tras confirmar la desconexión, el token puede quedar vivo en Google sin reintento. Sin despliegue: el piloto sigue con el build anterior.
