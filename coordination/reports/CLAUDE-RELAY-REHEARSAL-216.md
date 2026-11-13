# CLAUDE-RELAY-REHEARSAL-216 · Ensayo de relevo desde el recorrido (informe de entrega)

5/11/2026, Europe/Madrid. Contrato + API del ensayo con el **Kit REAL** (116 R4/QA136, aceptados) y ejecutores simulados para las fronteras. **No montado**; ver `coordination/plans/RELAY-REHEARSAL-216-HANDOFF.md`. Sin red externa ni HubSpot; ficción.

## Qué entrega
Un servicio que, a petición explícita, ejecuta UN ensayo de relevo con ficción (exportar → inspeccionar → aprobar ligado al contenido → importar en destino nuevo → abrirlo en un proceso nuevo → ID equivocado rechazado → conciliar un único create) y guarda un registro estricto de lo observado, con lo que viajó, lo que NO se hereda (aprobación ejecutable, fallo de acuse armado, intentos de tarea solo en memoria) y lo no demostrado. El pasaporte lo consume vía `toPassportRecord`. No reescribe cifrado, `restoreBundle` ni reclamos; no exporta el espacio activo.

## Pruebas (9)
| Garantía | Prueba |
| --- | --- |
| Resultado real del Kit ⇒ registro estricto; completado exige ID equivocado rechazado, un create, cero duplicados, retorno verificado; fallos e interrupción sin éxito falso; texto sin rutas ni errores; el pasaporte lo consume | Node |
| Registro incoherente o con campos de más rechazado (7 variantes + ruta/contraseña/alcance ajeno) | Node |
| GET nunca ejecuta; POST guarda y GET devuelve con su alcance | API con ejecutor simulado |
| Doble clic y segunda pestaña ⇒ 202, un solo ensayo; acción nueva sí ensaya | API |
| Error con ruta y secreto no sale; interrupción por plazo; duplicado ⇒ «falló» | API |
| Sin cookie 401; revocar durante el ensayo ⇒ 401 sin resultado ni registro; sesión nueva no hereda; Origin ausente/externo 403; cuerpo inválido 422 | API con sesión real |
| Cancelar descarta; sin Origin no cancela | API |
| Dependencia obligatoria y fallo cerrado; registro ilegible/incoherente declarado | API |
| **Ensayo completo con el Kit real** en proceso nuevo: completado, un create, sin duplicados, `return-verified`; el espacio activo no cambia | Kit real (~8 s) |

## Resultados
- `tests/relay-rehearsal.test.ts`: **9/9** (dos ejecuciones), con `scripts/block-external.cjs`. Suites vecinas (`rescue-capsule*`, pasaporte) 20/20. `tsc` sin errores en los archivos de esta unidad.
- **Control causal con 9 mutantes** (restaurado con hash idéntico): completado sin ID equivocado, completado con duplicado (2), sin doble clic, sin sesión al devolver, sin Origin, sin incoherencia al servir, dependencia opcional, interrumpido con éxito aceptado, GET que ejecuta ⇒ todos detectados.

## Límites
Sin montaje; el ejecutor por defecto usa las carpetas de ensayo de 116 bajo `tests/.tmp` del cwd (decisión de raíz pendiente de Codex); cancelar no detiene el proceso del Kit. La opción de montaje no se pudo acordar con Codex (conexión cerrada): se eligió el servicio con ficción. No acredita otro equipo, HubSpot real, RTO/RPO ni autoría. No hay botón en la interfaz todavía (es la unidad de montaje del pasaporte).

## R2 (5/11/2026) · exclusión física tras cancelar, vencer y revocar
Reproducidas las tres secuencias del dictamen (POST→DELETE→POST, POST→vencimiento→POST, POST→bloquear→iniciar sesión→GET→POST) con ejecutor retenido por barreras: la fuente presentada daba **2 ejecutores vivos**; ahora **1** en las tres (`R2·1–3`, máximo observado = 1).
- **Plaza = `RunLease` (unidad 224).** La plaza solo se libera cuando la promesa del ejecutor se asienta; el ejecutor real (`createRelayExecutor`) solo la asienta cuando todo su árbol de procesos cerró. Cancelar, revocar, cerrar o agotar el tiempo pasan a **«deteniéndose»**; un POST en ese estado recibe **409 `STOPPING`** y no arranca nada. Se separan el último resultado (`last`), la autorización para publicarlo (`commit` + sesión) y la ocupación (`running`/`stopping`).
- **Contrato (acordado con la unidad 217, misma autora):** `RelayRehearsalApiState.stopping: { since, reason: cancelled|revoked|closing|timeout } | null` (opcional en el parser), issue nueva `STOPPING`, mensaje de `CANCELLED` ajustado a la garantía real (resultado descartado; el proceso puede tardar en cerrar). `run` pasa a ser **obligatorio** (sin valor por defecto que use el cwd del servidor).
- **Promesa rechazada atendida** (la ranura registra la finalización con `then(ok, fail).finally`), **temporizador limpio** al terminar/cancelar/cerrar (`R2·6`), **cierre del servidor** con ejecución retenida (`R2·5`): detener y esperar acotado; uno que no obedece no cuelga el cierre ni se finge drenado. **Hallazgo propio:** con `onClose` el cierre se colgaba con una petición en curso (Fastify espera a las peticiones antes de `onClose`); se movió a `preClose`.
- Resultados anteriores conservados hasta que otro pueda publicarse (`R2·4`); un resultado tardío tras cancelar, vencer o revocar se descarta; un POST posterior tras el cierre real arranca exactamente uno.
- Los 9 casos originales siguen (el del **Kit real** ahora usa el ejecutor aislado desde un código desplegado sin árbol de pruebas, ~15 s). **Las 6 regresiones R2 fallan con la fuente presentada** (copiada a `tests/.tmp/r2-216/relay-rehearsal-api.presented.ts`, hash `7c87109e…`) y pasan con la corregida.
- Resultado: **15/15** Node en este archivo, **29/29** con ranura y ejecutor; `tsc` global sin errores salvo `tests/e2e/continuity-hub.spec.ts` (ver límites).
- **Pasaporte 214 R3:** `toPassportRecord` marca la procedencia `scope: 'fiction'` (el discriminante acordado); la captura activa nunca se asigna a la ficción.

### Límites R2 añadidos
- **La unidad 217 queda desfasada:** su prueba E2E registra la API sin `run` (ahora obligatorio) y el hub aún no muestra `stopping`; se corrige al devolverse 217. No es un cambio de ese archivo en esta entrega.
- Esta API depende de `server/relay-rehearsal-lease.ts` (224): revisar y aceptar juntas.
- La revocación durante el ensayo se detecta al consultar el estado o al terminar (no hay vigilancia periódica de sesión): hasta entonces la ranura sigue ocupada y no se publica nada.

## R3 (6/11/2026) · respuesta al dictamen 258 (sesión revalidada junto a la persistencia y a la salida)
Reproducido antes de corregir con las dos sondas de Codex sin cambiar aserciones: el reloj cruzaba el vencimiento al preparar el registro (1 escritura y 200 con la sesión ya vencida) y al leer el estado final (200 con el resultado a una sesión vencida). Corrección en `server/relay-rehearsal-api.ts`: tras `recordFromRehearsal` y de nuevo tras `inspectRelayRecord`, antes de `commit`/`save`, se revalida la sesión original (si venció: `lease.cancel('unauthorized')`, cero escrituras, 401 con cuerpo `{error}`); y TODA respuesta del POST que lleva estado (200, 202 ALREADY_RUNNING, 403, 409 STOPPING/CANCELLED, 422, 502, 503) se prepara primero y el permiso se revalida DESPUÉS de leer el almacenamiento y el reloj: si venció, 401 sin estado ni resultado. El registro confirmado con permiso se conserva aunque la respuesta ya no se pueda entregar. Errores con las cabeceras de caché de la ruta y cuerpo acotado.
**Resultados R3:** `tests/relay-rehearsal.test.ts` + lease en serie **27/27** (cuatro regresiones nuevas: las dos sondas, control positivo con una sola escritura y 200, y sesión vencida con el ensayo en curso con no-store y cuerpo < 200 bytes), incluido el ciclo con el Kit real; las dos sondas de Codex pasan con el archivo original; las dos fallaban con R2; `tsc` sin errores en los archivos de la unidad. **Límite:** la caducidad se reprodujo con barreras del reloj y del almacenamiento (Fastify real, SQLite en memoria), no en el navegador ni dentro del paquete instalado.

## R4 (6/11/2026) · respuesta al dictamen 267 (GET y DELETE)
Reproducido antes de corregir (cinco regresiones fallaban con R3: `200 !== 401` en GET y DELETE, el 422 de GET con estado, el 403 de DELETE con estado y la cancelación autorizada cuyo estado se entregaba a una sesión vencida). Corrección en `server/relay-rehearsal-api.ts`: GET y DELETE capturan la autorización original al entrar, preparan el estado y la revalidan después (`respondWith`), igual que POST; DELETE exige permiso vigente antes de cancelar y, si la sesión vence tras una cancelación autorizada, responde 401 sin estado conservando el cierre físico (la plaza sigue ocupada hasta que el ejecutor termina). Nota sobre el origen: `createBaseApp` rechaza orígenes ajenos antes del manejador, así que el 403 propio de la API solo se alcanza sin cabecera Origin; se prueba así.
**Resultados R4:** `tests/relay-rehearsal.test.ts` + lease en serie **32/32** (cinco regresiones nuevas, incluidas las dos sondas del dictamen por método y la cancelación con ejecutor retenido), con el Kit real; la sonda `relay216-r3-probe` de Codex pasa con su archivo original; `tsc` sin errores en los archivos de la unidad. **Revisión de la API que usa 254:** esta R4. **Límite:** caducidad reproducida con barreras de reloj y almacenamiento, no en el navegador ni en el paquete portátil.

## Hashes finales R4 (sha256)
| Ruta | sha256 |
| --- | --- |
| shared/relay-rehearsal.ts | f0839c039e0fd3b36c2e45f500a84dc0b1df6621a874f6606710c0bd64392e43 |
| server/relay-rehearsal-api.ts | 2f800e46fcbdbfe660c5608527348d71a62f3eb98a520050ad0c92ea325d0a1d |
| tests/relay-rehearsal.test.ts | 8d782bf0bf688e55da979d8d7806057a8c8f830d50ba82889ec9577096fd2ccb |
| coordination/plans/RELAY-REHEARSAL-216-HANDOFF.md | dfedfee3d3ff37e45ccc59e6e1f9fe61746f84430d6dbb3ccc5808eda68284d2 |
| coordination/reports/CLAUDE-RELAY-REHEARSAL-216.md | (este informe) |
Procesos propios: el ensayo real abre y cierra su destino; servidores de prueba cerrados con cada test.
