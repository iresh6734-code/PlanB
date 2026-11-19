# CLAUDE-SEARCH-PERF-R · Búsqueda global rápida con 10.000 registros

**Autor:** Claude (Opus 5.5), sesión «planb-rendimiento» · **Fecha:** 18/11/2026, Europe/Madrid
**Orden:** del usuario, transmitida por la sesión principal: hacer rápida la búsqueda global (hallazgo de `CLAUDE-PERF-BUDGETS`, ~470 ms).
**Archivos:** `shared/workspace-search.ts` (modificado), `server/workspace-search.ts` (modificado, **reserva ajena**), `tests/workspace-search-perf.test.ts` (nuevo), este informe.
Sustituye a `CLAUDE-SEARCH-PERF`, que quedó bloqueado sin cambios: incluía el archivo reservado en `files` y `claim` lo rechazó.

## Reserva ajena: `server/workspace-search.ts`

Tiene la reserva `CODEX-SEARCH-STALE-CONTEXT-207` (en revisión). El usuario autorizó tomar reservas antiguas avisando. `take-over` del tablón solo lo registra Codex, así que el archivo va en `readFiles` de este encargo, como hizo la sesión principal con sus reservas antiguas. Se siguió el protocolo G4: copia y huella de antes, aviso a Codex en el chat **antes** de editar y cambio mínimo.

| Archivo | Antes | Después |
| --- | --- | --- |
| `server/workspace-search.ts` | `303c179628bae6d2badefb6a0098ed47f99ead0d3f95f356923574b133abef05` | `5239fc2cda06484a4606ccd7b1df498cd40cb5b6eaa7417fb7431091547ef089` |
| `shared/workspace-search.ts` (sin reserva activa) | `610ca847b8d2e1fbbcaf06633af24e99722623a271b48528c4e7abc81b07034e` | `158ada53d692b18b6adeebed10282c9a775536331d188c30598243d9f968ea15` |

Codex debe re-presentar o aceptar la 207 con la huella nueva del servidor. Sus pruebas de la 207 siguen en verde sin tocarlas (abajo).

## Cambio

**`shared/workspace-search.ts`** (lo usa también el cliente; su comportamiento no cambia):
- `prepareWorkspaceSearch(spec, records, reuse?)`: normaliza **una vez** los textos buscables (mismos campos, etiquetas de opción y `normalizeSearch`, que no cambia). `reuse` permite aprovechar el índice de un registro con contenido idéntico.
- `searchWorkspace` acepta `prepared` y solo lo usa si se preparó con **esos mismos objetos** `spec` y `records`; si no, lo rehace.
- Las vistas previas y etiquetas se construyen **solo para la página devuelta**, después de ordenar. El orden nunca dependió de ellas. Antes, «example» (6.500 coincidencias) calculaba 6.500 vistas previas para devolver 25.

**`server/workspace-search.ts`**: una caché por almacén (`WeakMap<Store>`) con:
- **Identidad de búsqueda y `ready`.** La clave son las filas de `meta` que la deciden (`instanceId`, `snapshot`, `spec`, `generation`, `reconciliation`, `sessionId`). Ya no se analiza la captura de 4,5 MB ni se hace su SHA-256 en cada búsqueda. **También beneficia a `/api/v2/state`**, que usa `workspaceSearchIdentity`.
- **Revisión e índice.** La clave es el spec y las filas de `records` en orden. Tras editar unas fichas solo se normalizan esas: el índice de cada registro se reutiliza con su **JSON exacto** leído en esta petición como clave, no su posición. La revisión se calcula con esos mismos textos y da el mismo SHA-256 que `JSON.stringify({contextRevision, spec, records})`.
- **Clave de fila.** Fila sellada: IV y etiqueta GCM más la longitud (`octet_length`). El IV es aleatorio en cada escritura y la etiqueta autentica el cuerpo, así que otro contenido da otra clave, venga de esta conexión, de otra o de otro proceso. Fila en claro (base en memoria): el texto entero. Mismo principio que `recoveryCache` en `store.ts`.
- **Carrera con otro proceso.** La clave se lee **antes** que los registros. Si alguien escribe en medio, lo guardado queda bajo la clave antigua, que ya no puede volver (IV nuevo), y nunca se sirve.
- **Se sigue llamando a `store.records()` en cada búsqueda actual.** La prueba de la 207 cuenta esas lecturas y espera que una copia ajena no lea registros y una actual sí. Sin esa restricción, la búsqueda repetida bajaría unos 70–90 ms más.

Sin cambios en rutas, validación, errores, códigos ni forma de las respuestas.

## Verificación

**Equivalencia exacta.** `tests/workspace-search-perf.test.ts` lleva una **copia literal** de la versión anterior (búsqueda e identidad) como referencia.
- 30 consultas × 6 paginaciones sobre 10.000 registros ficticios, las dos capturas de demostración y casos límite: nombre en blanco, nombre numérico o booleano, opción desconocida y spec sin una entidad. `searchWorkspace` con y sin índice da **exactamente** el mismo resultado: elementos, orden, recuentos, `total`, `hasMore`, etiquetas y vistas previas.
- Por la API, sobre un almacén **cifrado**: identidad, revisión y resultados iguales a la referencia en cada paso:
  - búsqueda repetida;
  - edición desde **otra conexión** al mismo archivo, varias ediciones seguidas y un alta;
  - cambio de spec (no reutiliza nada y aparecen las etiquetas nuevas);
  - nueva sesión, captura candidata y captura activada.
- Abrir un resultado: 200 con la revisión actual y 409 con la anterior. Sin copia activa, identidad nula y 409 como antes.
- Un índice preparado con otros objetos se ignora.

**Mutantes 3/3 detectados**, con el archivo restaurado por huella después: acierto sin comparar filas, reutilizar con otro spec e identidad sin comparar filas.

**Pruebas existentes:** `workspace-search`, `workspace-search-api`, `workspace-search-identity`, `workspace-search-stale-context` (la 207 de Codex), `independent-workspace-search-143`, `commitment-scenario-seed` (usa `workspaceSearchIdentity`), `api-v2-contracts` y `perf-budgets`: **66/66** junto con las 6 nuevas. `tsc`: sin errores en estos archivos. Los únicos errores actuales están en `tests/return-explain.test.ts`, que es trabajo en curso de la sesión principal sobre `shared/return-explain.ts`.

## Medidas (10.000 registros ficticios, almacén cifrado)

La prueba alterna en la misma ventana la ruta nueva por HTTP con lo que hacía la versión anterior en cada búsqueda (identidad, revisión y búsqueda de la referencia, sin coste HTTP). Así la carga del equipo afecta a las dos por igual:

| Caso | CPU | Ahora (mediana) | Antes (mediana) | Aceleración |
| --- | --- | --- | --- | --- |
| Búsqueda repetida | ~80 % | **92,6 ms** | 348 ms | 3,8× |
| Búsqueda repetida | 100 % (batería en paralelo) | 205 ms | 839 ms | 4,1× |
| Editar una ficha y buscar | 100 % | 343 ms | 896 ms | 2,6× |

La prueba exige ≥ 2× en búsquedas repetidas, ≥ 1,5× tras editar y una mediana por debajo de 400 ms. Es un techo con margen para un equipo saturado; con carga normal ronda los 90–200 ms. El objetivo de 150 ms del README se alcanza con carga normal, pero no con el equipo al 100 %.

`tools/perf/measure.ts` guarda un cambio antes de cada búsqueda, así que mide el caso «editar y buscar»: 368 ms con la CPU al 100 %. El techo `globalSearch` de `budgets.json` (1.800 ms) no se ha tocado porque ese archivo pertenece a `CLAUDE-PERF-BUDGETS`, ya presentado. Cuando Codex acepte, propongo bajarlo a 800 ms.

## `/api/v2/state` · propuesta para Codex (`server/store.ts`, sin editar)

Con este cambio, el estado ya no calcula la identidad. Medido con la CPU al 100 %: 276 ms, que son casi exactamente `store.snapshot` (268 ms) más el análisis que hace `store.ready` (160 ms). Antes había unas cuatro lecturas más un SHA-256 de la captura. Quedan dos lecturas completas de la captura por petición. Propuesta, por orden de ganancia:

1. **`get ready()` sin analizar la captura** (`server/store.ts:122`). La fila `snapshot` solo se escribe con un objeto validado (`store.ts:184`, `246` y `383`), nunca con `null`, así que comprobar que existe es equivalente:
   ```ts
   get ready() {
     // Existe una captura (sin descifrar 4,5 MB) y el resto de condiciones, que son filas pequeñas.
     return !!(this.db.prepare("SELECT 1 FROM meta WHERE key='snapshot'").get() && this.spec && this.generation?.approved &&
       this.reconciliation?.complete);
   }
   ```
   Medido: `SELECT 1` tarda 0,1 ms frente a 160 ms de `ready` hoy. `ready` se llama en casi cada petición (estado, registros, CSV, búsqueda…).
2. **`readState` lee la captura una vez** (`server/app.ts:66`; ese archivo no tiene reserva activa, pero pertenece al núcleo). Con el punto 1, la única lectura pesada que queda es la de `snapshot`, que luego se compacta a `records: []`. Un getter `snapshotSummary` que devuelva la captura sin registros ni relaciones ahorraría `JSON.parse` de 10.000 registros. Exige descifrar igual, pero analiza menos si se guarda aparte; es un cambio de formato que conviene diseñar con Codex.
3. Medir con `NODE_ENV=test npx tsx tools/perf/measure.ts --check`. `coldList` debería bajar de ~930–1.300 ms a menos de la mitad.

No he editado `server/store.ts`: Codex lo está modificando (`CODEX-COPY-ACTIVATION-EPOCH-428`, con cambios sin commit).

## Límites

- Equipo al 80–100 % de CPU por otras sesiones durante todas las medidas: las cifras absolutas están infladas. La aceleración relativa es la medida fiable.
- La caché vive por proceso y almacén. La primera búsqueda tras arrancar cuesta lo mismo que antes; la reutilización empieza en la segunda.
- Memoria: el índice normalizado y el JSON de cada registro de la última copia (unos 10 MB con 10.000 registros). Son datos que ya están en memoria en claro mientras se usan (`plainCache` de `store.ts`). No hay texto cifrado completo ni nada en disco.
- No se ha medido en 4331 o 4334 ni con datos reales. No hay despliegue.

## Huellas de los archivos nuevos (SHA-256)

| Archivo | Huella |
| --- | --- |
| `tests/workspace-search-perf.test.ts` | `39202a0be97f7bb7863479cbcb5a64a98030e8c26143cf2ddef3abd186fcbf66` |
