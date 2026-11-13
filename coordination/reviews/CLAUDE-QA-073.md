# CLAUDE-QA-073 · Auditoría adversa de interfaces 062–070 (relaciones, historial, conexión, activación, devolución manual, réplica, acceso)

Autor: Claude (sesión única, sin subagentes). Fecha de ejecución: 30/10/2026. Checkout `planb-v0.3-local`, Windows 11, Node 24.14. No se editó ninguna fuente, test de Codex, QA056/QA060, memoria de otros ni el tablón a mano. No se aceptó nada, no se desplegó, no se hizo commit.

## 1. Dictamen resumido (por unidad)

| Unidad | Dictamen | Hallazgos propios |
|---|---|---|
| RELATION062 + LABEL063 | **Favorable** | ninguno; observación O-B1 (texto del selector recortado a 320 px) |
| HISTORY064 | **Favorable con una observación** | H-1 (baja): la búsqueda indexa la fecha ISO, de modo que un número de ID devuelve operaciones sobrantes |
| CONNECTION065 | **Favorable** | ninguno; observación O-C1 (listas de campos son regiones de 258 px con scroll interno, deliberadas) |
| ACTIVATION066 (servidor) | **Favorable** | ninguno |
| ACTIVATION066 (UI Preparation) | **Favorable con un hallazgo bajo** | D-1 (baja): A→B→A con la lectura nueva pendiente resucita la casilla de la revisión retirada; el servidor lo protege con 409 |
| MANUAL067 | **Favorable con un hallazgo recomendado** | M-1 (baja-media): `501` y `0501` se aceptan como altas distintas en UI **y** servidor (el servidor es anterior a 067) |
| TEAM069 | **Favorable** | ninguno |
| AUTH070 (componente Protection) | **Favorable** | ninguno nuevo; **AUTH_PARENT072 reproducido** en mi corte (estado previo declarado, ver 7) |

Ninguna de las unidades queda aceptada por este informe: la aceptación es de Codex. Los hallazgos D-1, M-1 y H-1 no son bloqueantes para revisar; M-1 conviene resolverlo antes de usar la comprobación manual con un portal real.

## 2. Congelación y cotejo de hashes

- Las 8 unidades estaban en `review`, no `done`. Sus **47 hashes presentados coincidían con el disco** antes de congelar (CODEX-RELATION-062: 5, LABEL-063: 2, HISTORY-064: 7, CONNECTION-065: 5, ACTIVATION-066: 9, MANUAL-067: 5, TEAM-069: 9, AUTH-070: 5) y **siguen coincidiendo al terminar** (47/47).
- Corte propio: `tests/.tmp/qa073/1168646a-1e57-446e-b0c7-c38c3018febb/` (163 archivos de `server/`, `shared/`, `src/` y configuración, con `manifest.json` de hashes). Todos mis bancos Node se ejecutaron **dos veces**: contra el checkout y contra ese corte (`QA073_ROOT`).
- Al terminar, 2 archivos del corte difieren del checkout: `src/customer-dossier.css` y `src/CustomerDossier.tsx`. No pertenecen a ninguna de las 8 unidades auditadas (su hash presentado no cambió). Mis conclusiones usan el corte congelado, no una mezcla viva.
- Dependencias registradas: `Preparation` → `components.tsx` (Modal, Spinner) + `shared/activation-review.ts` + `api.ts`; `ReferenceSelect` → `components.tsx` (`recordName`) + CSS propio + CSS global `planb-ui.css`/`design-system.css`; `TeamSync`/`ConnectionDialog` → `Modal`; `App.tsx` (reservada por SEARCH053) solo se leyó.

## 3. Resultados reales por banco (pass / fail / skip / todo)

| Banco | Contra checkout | Contra corte congelado | Notas |
|---|---|---|---|
| `tests/independent-activation-contracts.test.ts` | 11 / 0 / 0 / 0 | 11 / 0 / 0 / 0 | API protegida, Store en memoria |
| `tests/independent-history-contracts.test.ts` | 9 / 0 / 0 / **1 todo** | 9 / 0 / 0 / 1 | el *todo* es el hallazgo H-1 |
| `tests/independent-replica-contracts.test.ts` | 10 / 0 / 0 / 0 | 10 / 0 / 0 / 0 | `TeamSyncClient` + rutas, fetcher propio |
| `tests/independent-interface-contexts.test.ts` | 36 / 0 / 0 / **3 todo** | 36 / 0 / 0 / 3 | los *todo*: M-1 UI, M-1 servidor, D-1 |
| `tests/e2e/independent-interface-flows.spec.ts` | 6 / 0 / 0 | — (build del corte) | Chromium headless de caché |

Total: 72 pasan, 0 fallan, 0 skip, 4 *todo* (hallazgos reproducidos; no se suman como garantías). Las repeticiones checkout/corte no se suman. `tsc` sobre mis 6 archivos TypeScript (`tests/.tmp/qa073/tsconfig.qa.json`): sin errores.

Ramas no ejercitadas aunque Node muestre 0 skip: TeamSync no tiene recorrido de navegador (solo hooks + servidor en memoria); el *setup* de Protection en navegador se hizo por API (la UI de setup solo está en el arnés de hooks); no se probó 429 real (solo mock); el reintento con `honorAbort:true` del transporte existe en el arnés pero los bancos usan el transporte que **ignora** la señal.

Comandos (desde la raíz del repo):

```
node --import tsx --test tests/independent-activation-contracts.test.ts   (y history / replica / interface-contexts; con o sin QA073_ROOT=<corte>/snapshot)
npx playwright test -c tests/.tmp/qa073/e2e/pw.config.ts                  (QA073_E2E_RUN=run-final; puertos 4352/4353; build del corte en <corte>/app)
node tests/.tmp/qa073/mutate.mjs <id-corte> <banco> [ids]                 (mutaciones sobre copias)
```

Evidencia: `tests/.tmp/qa073/<corte>/evidence/*.log`, `app-artifacts.json` (hashes del build de navegador), `mut-*.log`, `mutants-*.json`, `tests/.tmp/qa073/e2e/run-final/shots/*.png` (16 capturas).

## 4. Oráculos y por qué las pruebas podrían fallar

- **Activación:** oráculo = qué objetivo es activo/candidato y qué debe conservarse (identidad de captura, título, recuentos del fixture explícito, `archives`, historial vacío). La revisión devuelta es una ficha opaca; nunca se recalcula. Cada dimensión se cambia **por separado** (candidata, esquema, generación, conciliación, fichas sin historial, historial sin fichas, edición completa, sesión de continuidad, devolución ocupada, error) y se exige 409 **con el mensaje de revisión** (no con la razón `canActivate`), estado idéntico antes/después y revisión estable tras el rechazo. Concurrencia: tres POST simultáneos con la misma revisión → exactamente `[200,409,409]`.
- **Historial:** fixture inventado con 122 operaciones cuyos IDs salen de un `Store` real tras sustituir una captura con 25 operaciones previas (los IDs no empiezan en 1). Oráculo = modelo propio del estado de cada ficha y filtro de fuerza bruta escrito en el test; `total_changes()` de SQLite como oráculo ajeno de «no escribe».
- **Réplica:** listas de IDs construidas en el test; fetcher propio que asserta que nada sale de `https://equipo.example.invalid`; compuertas deterministas (`gated`) para actuar solo cuando el arranque remoto **ya empezó** (mi primera versión usaba `setImmediate` y el análisis de mutantes la delató como vacía: m8/m9/m10 sobrevivían; se rehízo).
- **Cliente:** componentes reales con un arnés propio (ver 8); respuestas **válidas** retenidas del contexto anterior, transporte que ignora la señal, A→B→A, handlers capturados antes del último render, éxito y error tardíos, desmontaje y reapertura. Se afirma el estado actual positivo además de la ausencia del texto viejo.
- **Navegador:** geometría medida con `getBoundingClientRect`/`scrollHeight` sobre CSS global real a 1440/390/320; `getByRole` en Modal real; contadores de POST y de errores de página/consola; red externa abortada.

## 5. Sensibilidad causal (mutaciones sobre copias temporales)

Cada mutante se aplica a una copia del corte y se ejecuta el banco con `QA073_ROOT`; se comprueba que falla el test esperado **por la aserción esperada** (no solo exit 1).

| Banco | Mutantes | Muertos | Notas |
|---|---|---|---|
| Activación (servidor) | 11 | **11** | quitar la comparación de revisión; sacar del hash candidata / continuidad / historial / fichas / devolución ocupada / conciliación; `await` entre comprobar y activar (resultado `[200,200,200]`); runtime sin bloqueo; POST sin `strict()`; GET que devuelve fichas |
| Historial | 10 | **10** | página sin ajuste; límite de marca `>=`; null≡ausente; null no buscable; términos O en vez de Y; acentos; copias en vez de referencias; filtro «incluidas» `>=`; sin tope de tamaño; `==` laxo |
| Réplica (servidor y vista) | 21 | **21** | revisión sin outbox/conflictos/cursor/destino/empresa; lastSync dentro de la revisión; sin comparación al encolar; sin vuelo único; sin recomprobar continuidad / réplica ajena tras el arranque; acuse sin empresa o con operación ajena; duplicados; límite 20 000; sin tope de crecimiento; token en la vista; completitud sin recuento; búsqueda sobre las 100 primeras fichas |
| Cliente (ReferenceSelect, ConnectionDialog, ManualRecovery, Protection, TeamSync, Preparation) | 39 | **36** | 3 supervivientes **equivalentes**, ver abajo |

Supervivientes del cliente tras reforzar los tests (rs7 y pr3 sobrevivían y se corrigieron: añadí «más de 50 sin total» y la inspección del estado `useState` tras el acuse):
- `cli-pr5` (`current()` de Protection siempre verdadero): equivalente, porque `flight.current` se anula en el cleanup del efecto de `setup` y al desmontar; la guarda redundante cubre los mismos casos.
- `cli-pp4` y `cli-pp5` (no poner `reviewed` a null al fallar la activación / al «Actualizar revisión»): equivalentes, porque el *nonce* cambia `reviewKey` y por tanto `approvalKey`, de modo que el valor antiguo nunca coincide con el nuevo. **Ojo:** esa misma redundancia es la que **no** actúa en D-1, donde no hay *nonce* nuevo.

Guardas pedidas (H): servidor (activación exacta + revisión de réplica) y cliente (contexto/cierre/vuelo único) están cubiertas y matan con la aserción esperada.

## 6. Hallazgos con reproducción mínima

**H-1 · baja · HISTORY064.** `historyPage` indexa `change.at` (y entidad y operación) además de ID, campo y valores; el placeholder promete «ID, campo o valor anterior/actual». Repro: historial de 122 operaciones, buscar el ID de una operación (p. ej. «33») devuelve 3 operaciones más cuya fecha ISO contiene «33»; buscar el año devuelve las 122. Test: `H3b` (*todo*), caracterización `H9`. No pierde resultados (el recall es completo); afecta a la precisión.

**M-1 · baja-media · MANUAL067 (UI y servidor).** La validación compara cadenas. `501` y `0501` en la misma entidad pasan la UI (`E2b`, *todo*) y `verifyManualRecovery` (`E7b`, *todo*: «aceptado: passed=true, registros=2» con un remoto de solo lectura que, como HubSpot, trata ambos como el mismo objeto). Efecto: dos altas locales idénticas se confirman contra **un** registro remoto. El servidor es anterior a 067; la UI hereda el hueco. No es un bypass de escritura (el comprobador solo usa `verify`/`read`/`hasRelation`: `E7` lo asegura con un `Proxy` que falla ante cualquier otro método).

**D-1 · baja · ACTIVATION066 (UI).** `reviewed` no se reinicia al cambiar el contexto y `reviewResponse` conserva la respuesta de A. Repro (`D6`, *todo*): revisión A cargada y casilla marcada → el estado cambia a B → vuelve a A antes de que la lectura nueva termine → la casilla aparece **marcada** y el botón habilitado con los datos antiguos de A (`casilla=true, botón deshabilitado=false`). El servidor lo neutraliza: si algo cambió, la activación devuelve 409; si no cambió, la revisión es legítima. Por eso se clasifica como baja.

**Compatibilidad conocida (no es hallazgo):** `/api/activate` legado sigue aceptando `reviewed:true` sin revisión (`A11` observó 200). La garantía nueva pertenece a la ruta nueva.

**Diagnóstico ya corregido (distinción pedida):** `Preparation` llama a `preparationTarget(sourceState)` y recibe del `App` el estado ya consultado; un test aislado con props sin adaptar no prueba que el recorrido normal viejo mostrase la activa. Mis pruebas (`D1`…`D5`, `B5`) pasan el estado con candidata y comprueban que el objetivo mostrado es la candidata.

## 7. AUTH_PARENT072 (estado previo declarado, no hallazgo nuevo)

Confirmado con evidencia propia en el navegador (`B7`, build del corte, backend de autenticación real, `GET /api/v2/state` interceptado a 503 tras el login): `pageerrors=["Estado no disponible ficticio"]` (rechazo no atendido) y pantalla «No se puede conectar con el servidor local. Volver a intentar» (`shots/b7-auth-parent072.png`), mientras `GET /api/v2/auth/status` devuelve `authenticated:true` (no es bypass de autenticación). En mi flujo no había estado retenido previo, de ahí la pantalla de error en lugar de la «apertura del estado retenido» descrita en el plan. Además `G6` caracteriza que `App.tsx` pasa `done={()=>{setAuth('open');void refresh();}}`. **No está arreglado.** `B7` no falla si el defecto desaparece: deja constancia en el log; `G6` sí avisará si se corrige. Lo que **sí** funciona y está probado: con un `done` asíncrono que falla tras el acuse, Protection conserva el acuse y reintenta solo `done` sin otro POST (`G5`).

## 8. Qué es y qué no es el arnés de hooks

`tests/helpers/independent-interface-harness.ts` es propio. **Es:** un reconciliador mínimo con hooks reales (`useState` con setters funcionales, `useRef`, `useEffect`/`useLayoutEffect` con deps y cleanups en el orden de React, `useMemo`, `useCallback`, `useId`), expansión de componentes hijo, temporizadores virtuales y un `fetch` ficticio con respuestas diferidas. **No es:** React DOM, un navegador, CSS, foco real, layout ni un lector de pantalla (las `ref` no se enlazan a nodos; el foco al limpiar se prueba solo en `B2`). Un fallo adverso observado en el arnés podía ser del arnés: así ocurrió dos veces y se explica (`fillIds` leía los dos campos de un mismo render y el segundo manejador, obsoleto, fue correctamente ignorado por la guarda del componente; `A6` asumía que cambiar el valor invalida el manejador de búsqueda, pero la clave de la lista no incluye el valor). Los recorridos importantes se repiten en Chromium real.

## 9. Capturas inspeccionadas y límites concretos

Inspeccionadas: `b1-relation-320` (select de relación a 320 px, objetivo 44 px), `b3-connection-320` (lista de campos con scroll interno), `b5-activation-390` (revisión completa de la candidata), `b2-history-320` (**solo la parte superior de la página: es captura de viewport y el historial queda debajo; la composición se verificó con medidas numéricas**), `b7-auth-parent072`. Medidas (1440/390/320): sin desplazamiento horizontal en todos los recorridos; controles nuevos ≥ 44 px (buscador y selector de relación, filas del historial 70/94/94 px, campo de ID remoto, casilla de revisión 56/74/74, «Actualizar revisión» 44).

Observaciones menores: **O-B1** a 320 px el texto de la opción elegida del `<select>` queda recortado («… · ID extra073-1»). **O-C1** las listas de campos de la conexión son regiones de 258 px con scroll interno; identidad y acción principal no quedan en ningún scroll pequeño (el formulario del diálogo es el scroll principal). **O-D2** «Activar y abrir aplicación» mide 32 px (1440) y 40 px (390/320), por debajo de 44; es un botón anterior a esta unidad.

Límites: un solo motor (Chromium headless de caché, sin lector de pantalla, sin otros navegadores). El build de navegador es **del corte congelado** (`<corte>/app`, hashes en `app-artifacts.json`), no el runtime instalado ni `build/dist` de la raíz; no se verificó el runtime instalado ni 4331/4334. La rama de producción de la devolución manual en navegador es **contrafactual**: solo se falsea el flag de origen mostrado y se interceptan todos los POST de verificación; el backend sigue `isTestData:true`, `connection:null`, marca 0, `manualReport:null` (comprobado), no hay portal real. TeamSync no tiene recorrido de navegador. Ningún proveedor ni servicio externo real; todas las respuestas de conexión/equipo son ficticias. No se probaron symlinks/junctions (no aplica a esta unidad). Reproducibilidad: dos mutantes y una carpeta de ensayos se reejecutaron tras corregir tests (declarado en 5).

## 10. Cumplimiento del protocolo y desvíos

- Escrituras solo en los siete archivos exactos y en `tests/.tmp/qa073/` (herramientas y evidencia). `check-path` de los siete archivos devolvió `allowed:true`.
- Se **borraron con `rm -rf` cinco carpetas propias de mutantes** (`mut-rep-m8/m9/m10`, `mut-cli-rs7`, `mut-cli-pr3`) para reaplicarlas tras corregir mis tests. El brief pedía evidencia sin borrados recursivos: queda declarado; los logs de esas ejecuciones se sobrescribieron con los de la repetición.
- La instancia de la aplicación que el usuario pidió arrancar (puerto 4351, datos en `tests/.tmp/app-live/data`) es independiente de esta auditoría y de su evidencia; no se usó para ningún resultado.
- No se editaron fuentes ni tests de otros autores; no se usó el tablón a mano; no hay nada de `data/`, `.env*`, `planb-*` ni perfiles personales.

## 11. Inventario de archivos de esta entrega

`tests/helpers/independent-interface-harness.ts`, `tests/independent-interface-contexts.test.ts`, `tests/independent-history-contracts.test.ts`, `tests/independent-activation-contracts.test.ts`, `tests/independent-replica-contracts.test.ts`, `tests/e2e/independent-interface-flows.spec.ts`, `coordination/reviews/CLAUDE-QA-073.md` (el hash de este informe lo registra `submit`). Hashes (primeros 16 hex, sha256) al presentar: harness `ce7e81c15a50499b`, contexts `de99257ddd934376`, history `728b2e3ba13de9ca`, activation `db4c503da2448ff4`, replica `40a3cbe58c474994`, e2e `48c59660427f400c`.
