# CLAUDE-HS-READ-API-212 · API protegida de comprobación de lectura de HubSpot (informe de entrega)

5/11/2026, Europe/Madrid. **Sin llamada real a HubSpot.** Servicio y contrato probados con `createBaseApp` real (Store real, hooks de host/Origin/sesión reales, HTTP en 127.0.0.1) y un proveedor ficticio de loopback (portal 12345 inventado). **No montado** en la factoría principal: ver traspaso `coordination/plans/HUBSPOT-READ-API-212-HANDOFF.md`.

## Qué entrega
- `server/hubspot-read-check-api.ts`: `registerHubspotReadCheckApi(app, deps)` (GET/POST/DELETE `/api/v2/connection/read-check`) con dependencias inyectadas (configuración, almacén de evidencia, fetch de proveedor, reloj, plazo, política de producción) y `storeReadCheckEvidence(store)` (adaptador sobre `store.get/set`, sin base nueva). Reutiliza `checkHubspotRead` (160) y `guardedReadFetch` (173 R2): no reimplementa transporte ni cifrado ni copia la credencial a ningún estado, log o evidencia.
- `shared/hubspot-read-check-api.ts`: contrato PÚBLICO con parser estricto (lista blanca; un campo de más no pasa). Públicos: portal configurado, consentimiento (5 lecturas, 0 escrituras, 15 min), `running`, `view` (`viewOfReadCheck`), `evidence` de ESTA configuración, `invalidated` (historia de otra configuración), `issue/message` cerrados. Sin token, cabeceras, cuerpos ni mensajes de excepción.

## Garantías y cómo se comprobaron (21 pruebas, todas con servidor real + loopback)
| Garantía | Prueba |
| --- | --- |
| Sin configuración: resultado útil y 0 peticiones | GET y POST |
| Abrir/recargar/consultar = **0 tráfico**; solo la acción explícita lo genera | 5 GET de estado = 0 peticiones; 5 lecturas tras POST; más GET = sin tráfico |
| 5 GET exactos, identidad primero, solo cabecera de credencial hacia el proveedor, sin filtraciones | POST feliz + lista blanca de claves + almacén sin credencial |
| Una comprobación por configuración (doble clic / segunda pestaña) | identidad retenida: segundo y tercer POST ⇒ 202 sin lecturas; total exacto 5, luego una acción nueva = otras 5 |
| Identidad rechazada con **un solo GET** (401/403/500), sin reintento | 3 casos |
| Portal distinto / cuenta no de ensayo: 1 GET y sin revelar el otro portal | 3 casos |
| Respuestas > 64 KiB sin entregar prefijos; tope exacto aceptado; truncadas declaradas | identidad, objeto y límite exacto |
| 403 parcial: «lectura parcial» con el detalle de lo leído | contacts/companies/tasks legibles, deals prohibido |
| Sesión bloqueada (401, GET incluido), Origin ausente/externo/otro esquema/otro puerto (403), solo la válida genera tráfico | 6 solicitudes |
| Consentimiento: cuerpos incompletos o con campos de más (422), portal distinto (409), sin tráfico | 5 + 1 |
| **Cambio de configuración con respuesta retenida:** no salen más peticiones, el resultado no se publica, la evidencia anterior pasa a historia | cambio con consulta de estado, cambio **silencioso** (solo la puerta previa lo detecta), `invalidate()` |
| Caducidad 15 min: conserva fecha y alcance, `fresh:false`, sin tráfico | reloj inyectado |
| Endpoint caído → «no disponible» sin reintento; recuperación solo por acción explícita | 503 y luego loopback sano |
| Timeout: cierra dentro del plazo, libera la ranura, siguiente acción funciona | proveedor mudo, 1 s |
| Cancelar (DELETE) descarta y libera; sin Origin no cancela | retenida + DELETE |
| Producción rechazada sin tráfico | modo `production_readonly` |
| Configuración o evidencia ilegible: el error (con ruta y credencial dentro) no sale | `config()` que lanza; evidencia con credencial de más |

**Política con la configuración cambiante en vuelo (definida y probada):** la configuración se relee antes de CADA petición al proveedor, antes de publicar y al servir el estado. Si cambió: no se envía ninguna petición más; las ya enviadas se abortan y **su respuesta se descarta** (no pueden recordarse en la red, pero jamás se publican); la evidencia anterior pasa a `invalidated` y no acredita la nueva. Una respuesta tardía de la configuración antigua no confirma la nueva.

## Resultados
- `node --import tsx --test tests/hubspot-read-check-api.test.ts tests/hubspot-read-check.test.ts tests/hubspot-read-check-cli.test.ts` ×3: **51/51** las tres veces (21 API + 14 módulo 160 + 16 CLI/transporte).
- `tsc --noEmit -p tsconfig.json`: exit 0.
- **Control causal con 6 mutantes** sobre el módulo (restaurado con el mismo hash `d33a2a55…` tras cada uno): sin puerta de publicación ⇒ fallan 3 (cambio retenido, cancelar…); sin unirse a la comprobación en curso ⇒ falla el doble clic; sin comprobación de Origin ⇒ fallan origen y cancelar; sin puerta previa a cada petición ⇒ falla el cambio silencioso (una primera versión de la prueba **no** lo detectaba porque otra vía abortaba antes; se añadió el caso silencioso); revisión sin huella de credencial ⇒ fallan 2; GET que llama al proveedor ⇒ fallan 9.

## Límites
- Arnés ≠ montaje central: no se ha comprobado `server/v2.ts`/`main.ts` ni el lanzador instalado.
- Proveedor ficticio ≠ HubSpot: no se prueba la forma real de las respuestas ni que 15 min sea el plazo adecuado.
- `invalidate()` debe llamarse desde la ruta que guarda/retira la configuración; sin esa llamada, el servicio lo detecta igualmente en la siguiente petición, al publicar o al servir el estado.
- Falta decidir con Codex qué sello (`version`) aporta `Continuity` si se quiere invalidar sin cambiar la credencial.
- Sigue pendiente la primera comprobación real: ID numérico del portal de ensayo propio + autorización expresa de las cinco lecturas; la credencial la introduce la persona.

## Hashes finales (sha256)
| Ruta | sha256 |
| --- | --- |
| server/hubspot-read-check-api.ts | d33a2a5530d92f932533945bbb32e346e7092182680cab40b94a7df71d623766 |
| shared/hubspot-read-check-api.ts | 1501140ca188be7cda133686c25efba750cb2ddfe1c3bfcc0ef846f4caf8701d |
| tests/hubspot-read-check-api.test.ts | a2e3c8ae19814e292bded1b8e0501205d3f2721ef033c3f52955db1c7b31c799 |
| coordination/plans/HUBSPOT-READ-API-212-HANDOFF.md | (traspaso; hash al presentar) |
| coordination/reports/CLAUDE-HS-READ-API-212.md | (este informe; hash al presentar) |
Fuentes reutilizadas sin cambios: `server/hubspot-read-check.ts` `0d9b1142…`, `server/hubspot-read-check-transport.ts` `b4dfbf40…`, `shared/hubspot-read-check.ts` `f7d47ea8…`. Procesos propios: servidores de prueba cerrados con cada prueba.


---

# R2 · corrección del dictamen independiente (5/11/2026)

Dictamen: `coordination/reviews/CLAUDE-HS-READ-API-212-independent.md`; encargo: `coordination/briefs/CLAUDE-HS-READ-API-212-R2.md`. Antes de editar se comprobó que la unidad seguía `working` bajo `claude` con las cinco rutas y que sus tres hashes de código coincidían con los presentados. Las versiones R1 se conservaron en `tests/.tmp/u212/` (`api.R1.ts`, `shared.R1.ts`, `test.R1.ts`). Sin llamada real a HubSpot.

## Hallazgos y corrección
| Hallazgo | Corrección |
| --- | --- |
| **F1** la revocación de sesión no detiene una comprobación admitida | `deps.captureAuthorization(cookie)` **obligatoria y con fallo cerrado** (sin ella no se registra; si lanza o devuelve `false` ⇒ 401 sin tráfico). Se captura **síncronamente al entrar en POST** y se revalida **tras esperar la ranura, inmediatamente antes de CADA petición al proveedor, antes de persistir y antes de devolver**. Revocada: se corta y se descarta, y la sesión revocada recibe **401 sin estado ni evidencia**. `state()` aborta también un recorrido cuya sesión dejó de ser válida. Una sesión nueva no reactiva un recorrido antiguo (el cierre de `captureAuthorization` es un pestillo). Montaje: `captureAuthorization: security.captureAuthorization` (lo devuelve ya `createBaseApp`). |
| **F2** se acreditaba evidencia incompatible con el portal y el recorrido | `inspectReadCheckEvidence` (al escribir y al servir): positiva exige mismo portal y entorno, **exactamente cinco peticiones**, las cuatro entidades distintas y legibles, **cero** bloqueos/truncados y ventana de 15 min exacta; parcial coherente (≥1 legible y ≥1 no legible); paradas de identidad sin objetos. Incoherente ⇒ no se acredita, `issue: EVIDENCE_INCONSISTENT` (**nuevo**, ≠ `EVIDENCE_UNREADABLE` de formato ilegible y ≠ ausencia) y `invalidated: null` (no es historia). El historial **válido** de otra revisión se sigue conservando como historia. |
| **F3** una observación futura acreditaba la lectura | `checkedAt > ahora` ⇒ incoherente; además la duración de la ventana debe ser exactamente `READ_CHECK_TTL_MS`. |
| **F4** la API persistía evidencia que luego rechazaba (`Retry-After: 0.4`) | `normalizeRetry`: entero 1–3600 o `null`; 0.4/0/negativos/no numéricos ⇒ `null`, 99999 ⇒ 3600, 30 ⇒ 30; **antes de guardar se valida con el esquema público y la coherencia**: si no pasa, no se persiste (`502 EVIDENCE_INCONSISTENT`). Un solo GET y cero reintentos se mantienen. |

## Cinco regresiones del revisor: antes y después
Su archivo `tests/.tmp/h212-142b7b32/s/tests/independent-hubspot-read-api.test.ts` (sin editar) sobre **R1: 0/5** (`tests/.tmp/u212/probes-BEFORE-R1.txt`). Copia adaptada solo para pasar la dependencia obligatoria (`captureAuthorization: security.captureAuthorization`) sobre **R2: 5/5** (`probes-AFTER-R2.txt`). Además hay 7 pruebas nuevas propias (28 en total con las 21 originales) que cubren: revocar con la identidad retenida; revocar antes de publicar la última respuesta + sesión nueva que no hereda; segunda sesión que se une; dependencia obligatoria y fallo cerrado (cuatro variantes); 14 variantes incoherentes; controles válidos/caducados/otra revisión/malformada ≠ ausente; Retry-After (siete valores).

## Resultados R2
- `node --import tsx --test --test-concurrency=1` de 212 + 160 + 173 + independiente del revisor ×3: **61/61** las tres veces (28 de 212: 21 originales + 7 nuevas; 14 de 160; 16 de CLI/transporte; 3 independientes de 178). Los casos de límite de bytes, origen, cancelación y cambio de configuración siguen.
- `tsc --noEmit -p tsconfig.json`: exit 0. Pasaporte (consumidor del contrato) 11/11.
- **Control causal con 7 mutantes** (restaurado, hash idéntico): sin puerta de sesión antes de cada GET ⇒ fallan 2; sin sesión al publicar ⇒ falla; sin frontera final de 401 ⇒ fallan 3; sin coherencia al servir ⇒ falla; sin normalizar `Retry-After` ⇒ falla; dependencia opcional ⇒ falla; sin captura al entrar ⇒ fallan 4.

## Límites que siguen
Arnés ≠ montaje central (sigue sin registrarse en `server/v2.ts`/`main.ts`); proveedor ficticio ≠ HubSpot; la primera comprobación real sigue pendiente de portal de ensayo propio y autorización expresa. La dependencia de sesión debe pasarse **tal cual** en el montaje: sin ella el registro lanza.

## Hashes finales R2 (sha256)
| Ruta | sha256 |
| --- | --- |
| server/hubspot-read-check-api.ts | 4d6e6bd2094f09bef46e5c01dbe98b34e46d198e7a6ff1fb69377231289ae8ad |
| shared/hubspot-read-check-api.ts | 4bd6ce777514fa319bc0c7f5cc210a44368686cff983340f5af26dc5b7943808 |
| tests/hubspot-read-check-api.test.ts | e3723ced41f226407c4e33b7ba489a57ce14a67d275b549a8932565dc7a1418b |
Los hashes de la sección anterior quedan como historia (R1).
