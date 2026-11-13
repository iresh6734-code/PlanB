# CLAUDE-RELAY-PACK-254 · Ensayo de relevo empaquetado (informe de entrega)

6/11/2026, Europe/Madrid. Tanda 3 del encargo 240 (Claude B). **`server/main.ts`, `package.json` y los scripts de candidata no se han editado** (parche exacto para Codex en `coordination/plans/MONTAJE-RELEVO-254.md`); el ejecutor 224, la API 216 y el hub 217 se consumen tal cual (en revisión).

## R2 (6/11/2026) · respuesta al dictamen 268
Reproducidos antes de corregir (las tres regresiones fallaban con R1: el cambio de mismo tamaño en `tsx/package.json` daba `ok`, la unión de `node_modules` con contenido idéntico daba `ok` y la obligatoria ausente no lanzaba) y corregidos:
1. **Bytes vinculados.** Manifiesto v2 con «ruta:tamaño:SHA-256» por archivo de `node_modules`, comprobado en el montaje; un manifiesto v1 se rechaza explícitamente pidiendo reconstruir.
2. **Uniones y tipos.** La raíz y cada entrada de primer nivel se verifican con `lstat` antes de seguirlas; uniones, enlaces y tipos no regulares se rechazan en cualquier nivel aunque el contenido sea idéntico; conjunto de entradas acotado; scripts de entrada y cargador completos.
3. **Obligatorias y opcionales.** El constructor resuelve la clausura antes de escribir: obligatoria ausente o fuera del árbol ⇒ error sin manifiesto ni carpeta a medias; opcionales de otra plataforma pueden faltar (26 en este equipo, registradas). Probado con paquetes sintéticos y con la clausura real (73 paquetes).
4. **Arnés sobre 263.** Sin parche de App ni segundo registro de la evidencia; proyecta solo el relevo; nuevo caso de 404 con paquete ausente, alterado y enlazado.
**Resultados R2:** Node `tests/relay-rehearsal-mount.test.ts` **9/9** (tres regresiones nuevas), Chromium `tests/e2e/relay-packaged.spec.ts` **3/3** en carpeta nueva fuera del repositorio con el Kit REAL (arranque y registro, 404 ausente/alterado/enlazado y 200 íntegro, ciclo completo con cancelación y reinicio), `tsc` sin errores en los archivos de la unidad. Las carpetas temporales de la prueba se retiran (0 restantes). API del ensayo: 216 R4. Solo Windows y datos ficticios.

## Qué entrega
- `scripts/build-relay-kit.mjs`: construye el **paquete del Kit** (`kit/`): `server/` sin `team`, `shared/`, los cuatro scripts, `package.json`, la **clausura mínima de `node_modules`** (tsx, zod, fastify, @fastify/static y dependencias: ~100 paquetes, ~43 MiB, incluido el binario nativo de esbuild de la plataforma) y `kit-manifest.json` (hash por archivo de código, plataforma/arquitectura/Node, resumen de node_modules). Sin tests, src, tools ni datos.
- `server/relay-rehearsal-mount.ts`: `mountRelayRehearsal(app, store, security, opciones)`, análogo a `mountHubspotReadCheck`. Verifica el paquete por manifiesto (cambiado, sobrante, faltante, cargador ausente, dependencias o plataforma distintas ⇒ **no registra nada**: 404 verdadero), crea el ejecutor 224 con la carpeta de datos de la instalación (`dirname(store.filename)`), barre al arrancar solo carpetas propias vencidas y registra la API 216 **una vez** con la autorización original (`security.captureAuthorization`). Host, Origin y bloqueo por sesión los hereda `createBaseApp`.
- Pruebas: `tests/relay-rehearsal-mount.test.ts` (Node) y `tests/e2e/relay-packaged.spec.ts` (App compilada en carpeta nueva, Kit real).

## Pruebas
| Garantía | Prueba |
| --- | --- |
| Contenido del paquete (solo lo necesario), clausura cubre todas las importaciones reales de los puntos de entrada (esbuild), sin herramientas de desarrollo | Node |
| Verificación por manifiesto: archivo cambiado/sobrante/faltante, dependencia alterada, plataforma ajena, manifiesto roto ⇒ falla cerrada; restaurado | Node |
| Registro: sin paquete 404; con paquete una sola vez (segunda llamada = mismo resultado), 401 sin sesión, Origin ajeno rechazado, 422 sin consentimiento de ficción, estado inicial sin ejecutar nada; raíz relativa, paquete alterado y raíz hacia el código ⇒ no registra | Node 6/6 |
| **Carpeta nueva fuera del repositorio**: contenido exacto `build, data, dist, kit` (sin tests/src/node_modules ni `.tmp`); el servidor empaquetado no referencia la ruta del repositorio; 401 sin sesión, Origin ajeno ≥ 400; en reposo 0 procesos del Kit y 0 carpetas de ejecución | DOM/servidor 1 |
| **Ciclo real** en la App compilada (Continuidad → hub): cancelar el consentimiento = 0 POST, 0 procesos, 0 carpetas; iniciar y cancelar con el destino abierto (**2 procesos vivos medidos** por la carpeta de cada ejecución, no por nombre); segunda pestaña ve el ensayo en curso y su POST recibe 202 `ALREADY_RUNNING` sin segunda carpeta; DELETE → «Se pidió detener (cancelación)» → 409 CANCELLED → 409 STOPPING mientras viva el árbol → **0 procesos**; nada publicado y carpeta parcial conservada con marca `partial` | DOM/servidor 2 |
| Ensayo completo real: `completed`, `createCalls 1`, `duplicates 0`, ID equivocado rechazado, conciliado una vez; solo queda el parcial; descargas del pasaporte y del resumen (JSON/HTML con nombre `pasaporte-continuidad-…`/`resumen-de-turno-…`, sin rutas, sin contraseña, sin `planb.sqlite`, sin lenguaje de cápsula restaurable, CSP y sin `<script>`) | DOM/servidor 2 |
| **Reinicio de main**: el mismo resultado (sha16 de la cápsula idéntico) se recupera y el mapa dice que la práctica ficticia no acredita la copia activa; el pasaporte lista «ESTA copia activa» como no demostrada; 1440/390/320 sin desbordamiento | DOM/servidor 2 |
| Medidas finales: 2 POST de ensayo, **0 peticiones externas** (todas abortadas y contadas), 0 cambios en el CRM (`state.changes`), archivos de datos solo `.endpoint.json, .instance, .planb-key, planb.sqlite, relay-rehearsals` | DOM/servidor 2 |
Resultados: Node 6/6; DOM **2/2 en dos ejecuciones seguidas** (24 s la prueba larga). Las primeras ejecuciones fallaron por defectos del arnés, ya corregidos: una ruta relativa entre unidades distintas de Windows, un recuento de procesos que contaba el propio PowerShell, una comparación estricta del número de procesos (fluctúa durante el ensayo; se sustituyó por «una sola carpeta de ejecución») y un archivo legítimo de `main` (`.endpoint.json`). Capturas abiertas e inspeccionadas: `relevo-1440` y `relevo-320`. `tsc --noEmit` sin errores en los archivos de la unidad (errores globales ajenos: `tests/task-intent-journal.test.ts`, 208).

## Qué NO se sustituyó
El Kit se ejecutó **real** (procesos reales, base y destino reales, bloqueo de red del propio Kit). Lo único añadido al servidor de la prueba es la proyección del parche de `main` (montaje del relevo y, solo para ver la pantalla completa, el registro de la evidencia de copia 239, que NO es de esta unidad).

## Límites
- Solo **Windows**; POSIX no ejecutado. El paquete es de la plataforma y la versión de Node que lo construyen.
- `tsx` es dependencia de ejecución del paquete (decisión de Codex); empaquetar hijo y destino con esbuild exigiría tocar `openDestination` de 116 (no hecho).
- `closure()` del ejecutor (cierre sin verificar) aún no se ve en el estado público de 216; el inventario de procesos fallido no se reprodujo con el Kit real (solo dobles, en 224).
- La App real no incluye todavía el registro (parche de `main`), la evidencia (239) ni el parche de `App.tsx` (253): lo probado es la proyección.
- No se probó revocación de sesión con el Kit real en la App ni cierre del servidor durante un ensayo vivo (cubiertos con ejecutor retenido en 216/224).
- No acredita otro equipo, HubSpot real, RTO/RPO ni autoría.

## Hashes finales R2 (sha256)
| Ruta | sha256 |
| --- | --- |
| scripts/build-relay-kit.mjs | b4b2d8851ce116ff95749338c2888a9f53889f427492c8e0c7872ba28fe30931 |
| server/relay-rehearsal-mount.ts | 74bbc1053b6b02138587f74ba7149c911404232ea4fbece5600060e43349c481 |
| tests/relay-rehearsal-mount.test.ts | 1d8811d3acd2884af380b2360ba9a9ef3b7a989b023c03034f1cf85437d13994 |
| tests/e2e/relay-packaged.spec.ts | d8104e45b541fdad7327f4aeaaca7fb20c35ebe3e8bdfb124d6b4db17095ceb4 |
| coordination/plans/MONTAJE-RELEVO-254.md | 0aa4c0de4f8e3a0e321db1d5fa17e1d1a2057bb586faa569cfc0866edf359e79 |
| coordination/reports/CLAUDE-RELAY-PACK-254.md | (este informe) |
Procesos propios: servidor de prueba y procesos del Kit cerrados (0 medidos al final).
