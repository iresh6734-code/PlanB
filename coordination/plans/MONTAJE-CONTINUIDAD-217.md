# Montaje de Continuidad (217, R2) · cambios exactos para quien tenga las reservas

6/11/2026, Europe/Madrid. Este plan **no monta nada**: los archivos centrales (`server/main.ts`, `server/app.ts`, `src/App.tsx`, `src/ContinuityHome.tsx`, `src/LocalIntegrations.tsx`, Store/Recovery) tienen reservas de otros. Lo preparado y probado: el consumidor `ContinuityHub` (pasaporte 214 + mapa 215) y su prueba de extremo a extremo con las APIs 212, 216 y el ejecutor 224 registrados como se describe abajo.

## Qué cambió en R2
- **Carga por fuente.** Copia, lectura de HubSpot y último ensayo se cargan y publican cada una al responder (`data-source` / `data-state`: `loading`, `read`, `locked`, `unavailable`). Con una retenida se muestra lo ya leído, con sus acciones; el resumen de turno dice «Leyendo: …» y la exportación no se ofrece hasta tener las tres.
- **Generación + identidad.** Cada consulta lleva una generación; cambiar `installId`, `context`, `sessionKey` o `connectionKey` descarta lo leído y lo tardío, aunque el transporte ignore `AbortSignal` (probado con un `fetch` que no pasa la señal).
- **Contexto.** `context` es la captura activa **en la notación de `context.captureId` de la evidencia**. Si se informa y la respuesta es de otra captura, no se acredita (aviso `hub-context`, y el mapa la declara «datos de otra copia»). Si no se informa, se confía en la propia respuesta: el montaje DEBE pasarlo cuando exista un vínculo autorizado (ver «Pendiente de identidades»). Las fuentes de `extra` traen su `context`; sin contexto no se ligan a la copia.
- **Sin consentimiento propio de lectura.** «Abrir Integraciones» llama a `navigate['open-integrations']` y el panel de 218 conserva el consentimiento, las cinco lecturas y la caducidad. El hub solo muestra lo guardado (GET).
- **Vigencia local.** El reloj se actualiza al vencer la lectura, al recuperar foco/visibilidad y cada 30 s; nunca pide nada al proveedor. Pasaporte y mapa usan la misma regla (`readWindow`).
- **Mensajes con hechos.** Tras bloqueo (401) o pérdida de respuesta del ensayo no se dice «no se ensayó nada»: se retira lo leído (401) o se consulta el estado guardado (sin otro POST), se muestra sin adjudicarlo a la acción y no se ofrece otro ensayo hasta saberlo. «Leer el estado guardado» siempre disponible.
- **Cancelación visible.** Botón «Cancelar el ensayo» (DELETE) → «Se pidió detener…» → resultado descartado (409 CANCELLED) → fin físico (el GET deja de mostrar `stopping`). Seguimiento por GET cada 2 s, acotado a 3 min, solo mientras hay ensayo vivo.

## 1 · Servidor (Codex; solo en el servidor principal protegido, NUNCA en el runtime independiente ni en `server/team`)
`registerHubspotReadCheckApi`/`mountHubspotReadCheck` **ya están en `main`** (218): no se registran de nuevo. Pendiente:
```ts
registerContinuityEvidenceApi(app, store);       // si aún no (103/239)
const executor = createRelayExecutor({ installRoot: <carpeta de datos de la instalación>, appRoot: <código desplegado con node_modules> });   // 224
registerRelayRehearsalApi(app, { captureAuthorization: security.captureAuthorization, store: storeRelayRecord(store), run: executor.run });   // `run` es OBLIGATORIO
```
`installRoot` nunca puede estar dentro de `server/`, `shared/`, `scripts/`, `node_modules`, `src/`, `dist/`, `build/`, `tests/`, `design/` ni ser un alias hacia ellos (se resuelve el destino real).

## 2 · Interfaz (quien tenga `ContinuityHome`/`App`)
```tsx
<ContinuityHub
  installId={health.instanceId}
  context={/* captura activa en notación de evidencia, solo con vínculo autorizado */}
  sessionKey={unlockEpoch} connectionKey={connectionSeal}
  navigate={{ 'open-integrations': () => goIntegrations({ returnTo: 'continuity' }), 'open-preparation': …, 'open-today': …, 'open-export': …, 'open-continuity': … }}
  extra={{ /* work/inventory/queue/comparison, CADA UNO con su context */ }}
  evidenceLink="#/continuidad" />
```
Reglas: una acción sin superficie en `navigate` se explica, no se simula; el hub no guarda nada en el navegador; con la sesión bloqueada se desmonta con la App.

## 3 · Pendiente de identidades (Codex / dueño de `/api/v2/state`)
La identidad derivada de la evidencia (`capture:<sha256>`) y el contexto de `/api/v2/state` **no son el mismo dato**. Hace falta un enlace autorizado obtenido de la misma lectura o un contrato explícito. Mientras no exista, el montaje no debe inventar `context`.

## 4 · Verificación
`tests/continuity-hub.test.ts` (5) y `tests/e2e/continuity-hub.spec.ts` (arnés del componente; no es la App). La App real y el Kit en paquete arrancable siguen siendo prueba aparte (unidad de montaje).
**No cubre:** comprobación contra una cuenta real de HubSpot (ID del portal de ensayo y autorización expresa de las cinco lecturas; la credencial la introduce la persona).
