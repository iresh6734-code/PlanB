# HubSpot · API protegida de comprobación de lectura (212) · traspaso para el montaje central

5/11/2026, Europe/Madrid. Estado: **servicio y contrato probados con `createBaseApp` real y un proveedor ficticio de loopback. NO montado en ningún arranque. Ninguna llamada real a HubSpot.** El montaje en la factoría principal (`server/v2.ts`/`server/main.ts`) y el contrato de estado (`shared/operations.ts`) están reservados por otros agentes (055/087): esto es el cambio preciso que hay que hacer allí, no una edición mía.

## Firma

```ts
import { registerHubspotReadCheckApi, storeReadCheckEvidence } from './hubspot-read-check-api.js';
const handle = registerHubspotReadCheckApi(app, {
  config: () => continuity.connection(),          // ÚNICA fuente de verdad (la que ya guarda la credencial cifrada); puede lanzar: se trata como «ilegible»
  evidence: storeReadCheckEvidence(store),         // adaptador sobre store.get/set (clave `hubspotReadCheck`, JSON sin secretos); sin tabla ni base nuevas
  // fetch, now, timeoutMs, allowProduction: opcionales (por defecto fetch global, Date.now, 8 s por petición, SOLO ensayo)
});
```
`config()` debe devolver `{ token, accountId, mode, version? }` (`SavedConnection` de `server/connection.ts` ya encaja: `mode` `'test'|'production_readonly'`). `handle.invalidate()` debe llamarse desde la ruta que **guarda o retira** la configuración (aborta lo que esté en vuelo y descarta su resultado). `handle.cancel()`/`running()` son para pruebas y para un posible apagado ordenado; `onClose` de Fastify ya aborta.

## Dónde registrarlo
Tras `createBaseApp` (no antes: hereda su `onRequest` de host local, Origin y bloqueo por sesión de todo `/api/*`) y **solo en el servidor principal protegido**, nunca en el runtime independiente ni en `server/team`. Ruta única: `/api/v2/connection/read-check` (GET, POST, DELETE). El cliente debe usar el contrato de `shared/hubspot-read-check-api.ts` (`parseReadCheckApiState`: un campo de más o un valor fuera de contrato ⇒ «no disponible», jamás éxito).

## Cómo se obtiene la revisión de configuración
`readCheckRevision(config) = sha256(portal | modo | sha256(credencial) | version?)`. **No la aporta el montaje:** se deriva dentro del servicio cada vez que lo necesita (antes de cada petición al proveedor, antes de publicar y al servir el estado). Cambiar credencial o portal la cambia. Si el propietario de la configuración quiere invalidar aunque la credencial no cambie (p. ej. «volver a guardar» o cambio de modo), basta con devolver un `version` distinto desde `config()` (un contador o el `savedAt`). **Pendiente de Codex:** decidir qué sello usa `Continuity` para `version` (no existe hoy un contador de guardado de la conexión).

## Política de autorización (implementada)
- GET: solo sesión (hook de `createBaseApp`). **Cero** tráfico al proveedor.
- POST: sesión + `Origin` http del **mismo host** (sin Origin ⇒ 403 `ORIGIN_REQUIRED`) + cuerpo estricto `{ portalId, authorizedReads: 5 }` cuyo `portalId` coincide con el portal configurado AHORA (si no, 409 `PORTAL_MISMATCH` sin tráfico) + conexión de **ensayo** (producción ⇒ 403 `PRODUCTION_NOT_AUTHORIZED` sin tráfico salvo `allowProduction: true`, que exige otra autorización).
- Una comprobación por configuración: la segunda solicitud (doble clic, segunda pestaña) recibe **202 `ALREADY_RUNNING`** sin lecturas nuevas.
- DELETE cancela y descarta el resultado (exige el mismo Origin).

## Único consumidor de UI esperado
`src/LocalIntegrations.tsx` (unidad aparte con reserva; tras aceptar esta API y acordar el montaje): GET al montar la fila de HubSpot (sin tráfico), botón «Comprobar lectura» con confirmación explícita (portal, cinco GET, no escribe) → POST `{ portalId, authorizedReads: 5 }`, y un GET para refrescar tras 202. `shared/local-integrations.ts` es parser estricto: un campo nuevo debe aceptarse a la vez que se muestra; este contrato ya es estricto por su lado.

## Qué NO acredita
Un arnés con el módulo registrado acredita el contrato local. No acredita el montaje central, el comportamiento de HubSpot real, ni que 15 min sea el plazo adecuado. Una comprobación puntual no demuestra sincronización, escritura ni lectura de otros objetos o campos.

## Lo que falta para la primera comprobación real (no concedido)
ID numérico del portal de ensayo propio y autorización expresa de las cinco lecturas; la credencial la guarda la persona en su flujo de Continuidad, nunca en un chat. Tras el montaje se presentará una única orden revisable.


## R2 (dictamen independiente)

- **Dependencia de sesión obligatoria:** el montaje debe pasar `captureAuthorization: security.captureAuthorization` (lo devuelve `createBaseApp` en `{ app, store, security }`). Sin ella `registerHubspotReadCheckApi` lanza. Se captura al entrar en POST y se revalida en cada frontera asíncrona; una sesión revocada recibe 401 sin evidencia.
- Nuevo `issue` público `EVIDENCE_INCONSISTENT` (evidencia legible pero incoherente con la configuración, el recorrido o el reloj: no se acredita). `EVIDENCE_UNREADABLE` sigue siendo formato ilegible; la ausencia de evidencia no es una incidencia.
- `retryAfterSeconds` público: entero 1–3600 o `null` (los valores fraccionarios o inválidos del proveedor se normalizan antes de guardar). Lo que se escribe se valida con el esquema y la coherencia; si no pasa, no se persiste.
- Frontera de montaje: la dependencia de sesión y el registro en `server/v2.ts`/`main.ts` siguen siendo de Codex; este módulo no toca la factoría ni la seguridad.
