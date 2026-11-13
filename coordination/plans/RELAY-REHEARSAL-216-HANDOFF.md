# Ensayo de relevo desde el recorrido (216) · traspaso para el montaje

5/11/2026, Europe/Madrid. Estado: **contrato y API probados con el Kit REAL y con ejecutores simulados; NO montados.** El registro en la factoría (`server/v2.ts`/`main.ts`, reservas 055/087) y el botón en el pasaporte son unidades aparte. No pude acordar con Codex (conexión cerrada) la opción de montaje: se eligió la que conserva los límites de la API aceptada del Kit — **un servicio de ensayo con ficción en raíz propia**, sin reutilizar vistas ni exportar el espacio activo.

## Qué hay
- `shared/relay-rehearsal.ts`: contrato estricto del registro (`RelayRehearsalStored`), coherencia semántica (`inspectRelayRecord`), `recordFromRehearsal` (desde el resultado real de `rehearse()`; nunca copia mensajes de error), `toPassportRecord` (forma que consume el pasaporte 214) y el contrato público de la API con parser.
- `server/relay-rehearsal-api.ts`: `registerRelayRehearsalApi(app, deps)` y `storeRelayRecord(store)` (clave `relayRehearsal`, JSON sin secretos).

## Montaje (cambio preciso)
```ts
registerRelayRehearsalApi(app, { captureAuthorization: security.captureAuthorization, store: storeRelayRecord(store) /* run, now, timeoutMs opcionales */ });
```
Ruta `/api/v2/relay/rehearsal`: GET (último registro, **nunca ejecuta**), POST `{ fiction: true }` (inicia UN ensayo; doble clic/segunda pestaña ⇒ 202), DELETE (cancela: descarta el resultado, NO detiene el proceso del Kit). Hereda host/Origin/sesión de `createBaseApp`; POST exige además Origin del mismo host y `captureAuthorization` (obligatoria, fallo cerrado, revalidada antes de devolver: una sesión revocada recibe 401 sin resultado).
**Decisión pendiente de Codex:** el ejecutor por defecto reutiliza `rehearse()` de 116, que crea sus carpetas bajo `resolve('tests', '.tmp')` del cwd del servidor. En una instalación sin ese árbol hay que fijar una raíz de ensayo (inyectar `run`). Se ejecuta en un proceso hijo propio (destino abierto en proceso nuevo) y tarda ~6–8 s.

## Consumidores
1. Pasaporte 214 / mapa 215: `relay: { status, at, value: toPassportRecord(last) }` desde `GET` (sin ejecutar).
2. Botón «Ensayar un relevo» (acción `start-rehearsal` del pasaporte): confirma explícitamente que es con ficción y que no exporta el espacio activo; muestra qué viajó y qué NO se hereda (`included`/`notInherited` del registro) y lo no demostrado (`scope.notProven`).

## R2 · registro y contrato
`registerRelayRehearsalApi(app, { captureAuthorization: security.captureAuthorization, store: storeRelayRecord(store), run: createRelayExecutor({ installRoot, appRoot }).run })` (ver `RELAY-EXECUTOR-224-HANDOFF.md`). `run` es obligatorio. El estado público añade `stopping` (`cancelled|revoked|closing|timeout`) y el POST devuelve **409 `STOPPING`** mientras el ejecutor anterior termina: la interfaz debe explicarlo («el ensayo anterior todavía se está deteniendo») y no ofrecer iniciar otro. El pasaporte recibe `scope: 'fiction'` desde `toPassportRecord`.

## Garantías (probadas) y límites
Completado exige destino abierto, ID equivocado rechazado, un solo create, cero duplicados y retorno verificado; fallo/interrupción nunca declaran conciliación; un registro incoherente o ilegible se declara y no se acredita; el origen y el espacio activo no se tocan (el ensayo usa su propia ficción); los intentos de tarea solo en memoria se declaran NO heredados, no incluidos. **No acredita** otro equipo, HubSpot real, RTO/RPO ni autoría. Un fallo posterior a publicar y destino ya publicado los cubre el Kit (116 R4/QA136), no se reimplementan aquí.

## R3 (6/11/2026)
La API revalida la sesión que inició el ensayo tras preparar el registro, antes de confirmar y guardar, y tras preparar CADA respuesta que lleva estado: una sesión vencida recibe 401 `{error}` sin estado ni resultado (el registro confirmado con permiso se conserva). 254 (`mountRelayRehearsal`) la consume sin cambios.

## R4 (6/11/2026)
GET y DELETE capturan la autorización original al entrar y la revalidan DESPUÉS de preparar el estado (también en las respuestas de error que adjuntan estado: 422 y 403): sesión vencida ⇒ 401 `{error}` con cabeceras restrictivas, sin estado ni resultado. DELETE exige permiso vigente antes de cancelar; si la sesión vence tras una cancelación autorizada, responde 401 sin estado pero la plaza sigue ocupada (drenando) hasta que el ejecutor termina. El último registro válido sigue disponible para otra sesión válida. La API usa `respondWith(authorized, reply, code, extra)` en las tres rutas.
