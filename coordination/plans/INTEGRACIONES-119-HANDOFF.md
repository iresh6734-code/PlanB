# Integraciones 119 · Traspaso a Codex 117

## Montaje esperado

```tsx
import { LocalIntegrations } from './LocalIntegrations.js';
// page === 'integrations' (solo instalación completa)
<LocalIntegrations onConnectHubspot={abrirFlujoHubspotDeContinuidad} />
```

- El componente importa sus estilos (`local-integrations.css`, clases `lint-*`, sin CSS global) y usa `api()` de `src/api.ts`. No requiere props de estado: carga por su cuenta.
- Debe montarse bajo `<main>` del contenido; trae su propio `<header className="page-header">` con `h1` «Integraciones». Si la App ya pinta un título para esa página, retirarlo para no duplicar el `h1`.
- Recomendado montarlo con `key` por instalación/contexto si la App puede cambiar de copia sin desmontar; al desmontar cancela y descarta respuestas.
- `onConnectHubspot` debe abrir el flujo ya existente de conexión/protección de Continuidad. No hay formulario de claves aquí.
- En paquete independiente (`runtime`) el componente muestra «No disponible» sin acciones; no depende de que App lo oculte.

## Contratos consumidos (solo lectura, sin cambios de backend)

`GET /api/v2/continuity` (`ContinuityStatus`), `GET /api/v4/integrations` (`{integrations: IntegrationCapability[]}`), `GET /api/v6/workspace` (`{origin: string|null}`). Lectura defensiva en `shared/local-integrations.ts` (`parseContinuity/parseCatalog/parseWorkspace`): una forma inesperada es error de esa fuente, no datos.

Enlaces generados: `origin + '/team?view=commercial'` (+ `&tool=drive|docs|sheets`). `TeamApp` lee `view`; `CommercialWorkspace` lee `tool`.

## Qué sigue sin estar acreditado y exige consentimiento real posterior

- Conexión HubSpot real (credencial, protección, verificación de cuenta): se hace en el flujo de Continuidad, con decisión explícita del usuario.
- Cuenta Google, OAuth y operaciones reales (envío, calendario, archivos): solo en el espacio de equipo, con su propia autorización. Esta pantalla nunca lo comprueba ni lo afirma.
- «Requiere reconectar» necesita un contrato nuevo (p. ej. un indicador de fallo de autenticación en `operationError`); no se ha inventado.
- La política de origen es estricta (ver informe). Si el despliegue de equipo usa `https` con host de una etiqueta o IP, hay que decidir ampliar `validateTeamOrigin`.

## Verificación pendiente de 117

Tras montar: comprobar en la App real el callback, el `h1` único, el ancho con la barra lateral a 1440/390/320 y la navegación por teclado. Este informe no declara la app actualizada.
