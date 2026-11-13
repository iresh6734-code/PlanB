# Pasaporte de continuidad (214) · traspaso para el montaje

5/11/2026, Europe/Madrid. Estado: **modelo y componente probados con entradas explícitas; NO montado en ninguna pantalla.** El consumidor real (Integraciones o el recorrido de Continuidad/preparación) es una unidad aparte con reserva propia: `src/LocalIntegrations.tsx`, `src/ContinuityHome.tsx` y `src/App.tsx` están fuera de esta unidad.

## Qué hay
- `shared/continuity-passport.ts`: `buildPassport(inputs)` (puro), `passportExport`/`passportToJson`/`passportToHtml` (lista blanca), `safeText`, `when`, `shortId`, `contextLabel`.
- `src/ContinuityPassport.tsx` + `src/continuity-passport.css`: `<ContinuityPassport passport onAction? onDownload? />`. No hace red; la descarga es una acción manual.

## Entradas que el consumidor debe aportar (cada una con `status`: `read` | `unavailable` | `not-provided` y su instante)
| Entrada | De dónde sale hoy | Notas |
| --- | --- | --- |
| `copy` | `GET /api/v7/continuity/evidence` (contrato aceptado; reutilizar `loadContinuityEvidence` de `src/continuity-evidence-client.ts`) | No consulta el CRM. Los registros de exportación/informes son **declarados**, nunca observados. |
| `hubspot` | `GET /api/v2/connection/read-check` (unidad 212; sin tráfico de proveedor) | Solo cuando esa API esté montada y aceptada; mientras tanto `not-provided`. |
| `work` | resumen mínimo por contexto del cuaderno de intenciones (otra sesión, unidad 208; acordado: `status`, `counts` o `null`, `quarantined` aparte) | Ausente ⇒ «sin comprobar», **nunca cero**. Sin IDs de tarea ni valores. |
| `relay` | resultado del ensayo de relevo de la unidad del Kit (`RelayRehearsalRecord`, definido aquí) | Alcance real: mismo equipo, ficción, destino nuevo. |
| `installId`, `now` | `/api/health` y el reloj | `installId` se muestra/exporta acortado. |

## Cómo montarlo (cambio preciso, para quien tenga la reserva)
1. En la pantalla acordada (propuesta: bloque «Pasaporte de continuidad» plegable al final de Integraciones, con enlace desde Continuidad), cargar las cuatro fuentes **a la vez y de forma independiente** (una que falle no borra las otras: `unavailable`), llamar a `buildPassport` y renderizar `<ContinuityPassport passport onAction={...} />`.
2. `onAction` debe mapear a superficies existentes: `open-preparation` → preparación; `open-integrations` → Integraciones (mismo bloque); `open-today` → Hoy; `open-export` → Exportar; `start-rehearsal` → el ensayo del Kit cuando exista; `open-continuity` → Continuidad. Una acción sin superficie disponible debe dejar `onAction` sin definir (el componente no muestra un botón que no hace nada).
3. Recargar la pantalla vuelve a leer las fuentes (GET, sin tráfico de proveedor). No hay segundo menú principal.

## Garantías (probadas) y qué NO acreditan
- Desconocido ≠ cero; una lectura comprobada ≠ copia actualizada; evidencia caducada conserva fecha y alcance con chip «caducado»; otra captura se separa y no acredita la actual; un registro de exportación o un informe técnico es declarado; cifrar no prueba autoría; el ensayo del mismo equipo no prueba otro equipo ni RTO/RPO. Sección fija «¿Qué no se ha demostrado?».
- Exportación manual HTML/JSON por lista blanca, versionada (`planb-continuity-passport-v1`): sin fichas, credenciales, rutas ni estados privados (`safeText` omite rutas y cadenas tipo clave), HTML autocontenido con CSP restrictiva y sin scripts ni recursos externos.
- **No acredita** el montaje real, la forma de las respuestas de las otras unidades más allá de sus contratos, ni que los textos sean los definitivos de producto.

## R2 · reglas para el consumidor
- Regenera la hoja con un `now` actual (temporizador local o al recuperar visibilidad): la vigencia de la lectura de HubSpot se deriva de `freshUntil` y de `now`, no del `view.fresh` recibido. No hace falta volver a pedir nada al proveedor.
- `running`/`checking` se muestra aparte; el próximo paso es «Ver la comprobación en curso» (acción `open-integrations`).
- Un ensayo sin `captureId` no cierra la carencia de la copia actual (contexto desconocido).

## R3 · procedencia del ensayo
Usa `toPassportRecord` de 216 (`scope: 'fiction'`). Un ensayo ficticio completado resuelve «Ensayar un relevo»; la recuperación de la copia activa sigue «sin demostrar». No pases el contexto de la captura activa como contexto del ensayo ficticio.

## Pendiente / siguiente
Unidad de montaje (reserva de `LocalIntegrations`/`ContinuityHome`), adaptador del resumen 208 cuando esté aceptado, y el registro del ensayo del Kit (unidad del paquete 4).
