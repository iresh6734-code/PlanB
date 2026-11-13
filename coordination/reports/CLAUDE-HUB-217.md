# CLAUDE-HUB-217 · ContinuityHub: consumidor listo para montar (informe de entrega)

5/11/2026, Europe/Madrid. Prepara el montaje **sin tocar archivos reservados**: archivos nuevos propios y un plan exacto (`coordination/plans/MONTAJE-CONTINUIDAD-217.md`). No monta nada.



## R2 (6/11/2026) · respuesta al dictamen independiente (cuatro fronteras)
Reescritura del hub; ver `coordination/plans/MONTAJE-CONTINUIDAD-217.md` para el contrato de montaje.
1. **Fuentes independientes.** Copia, lectura de HubSpot y ensayo se publican cada una al responder (sin `Promise.all`); estados `loading / read / locked / unavailable` por fuente. Con la tercera retenida se ven las otras dos y sus acciones; el resumen dice «Leyendo: …» y no se ofrece exportación incompleta.
2. **Identidad.** Generación de consulta + clave de identidad (`installId`, `context`, `sessionKey`, `connectionKey`): una respuesta anterior se descarta aunque el transporte ignore `AbortSignal` (probado con un fetch que no pasa la señal). `context` del anfitrión frente a `context.captureId` de la respuesta: si difieren, no se acredita (aviso + «datos de otra copia» en el mapa); `extra.*` exige su propio `context`, no se rellena con la captura nueva. Probado A→B con A visible y con A retenida.
3. **Efectos inciertos.** Sin consentimiento de lectura propio (ahora «Abrir Integraciones» navega; el panel 218 conserva el consentimiento y la caducidad). Para el ensayo: 401 durante la ejecución → «se bloqueó durante el ensayo… pudo haber empezado», se retira lo leído y no se afirma «no se ensayó nada»; respuesta perdida → mensaje neutro + GET del estado guardado (sin otro POST), mostrado «sin atribuirlo a la acción»; no se ofrece otro ensayo hasta conocerlo; «Leer el estado guardado» siempre disponible. Cancelación visible (DELETE) con «se pidió detener» → resultado descartado → fin físico.
4. **Handoff** alineado con 218 y 223 (ver plan). Caducidad con la página abierta: reloj local (vencimiento, foco, visibilidad, 30 s) sin peticiones; probado con +16 min de reloj y contador de peticiones.
**Resultados R2:** Node `tests/continuity-hub.test.ts` 5/5; DOM Chromium (headless-shell 1228, config aislada `tests/.tmp/claude-b-run/pw.config.ts`, sin Edge) `tests/e2e/continuity-hub.spec.ts` **15/15** (11 en la primera pasada + 4 tras corregir fallos del propio arnés: detalle plegado, aserción sobre un texto siempre presente, pérdida de respuesta simulada antes de llegar al servidor y reautenticación); incluye el **Kit real** (ejecutor 224 desde código desplegado sin árbol de pruebas) y 390/320 px. `tsc --noEmit` sin errores en los archivos de la unidad (errores ajenos en `tests/task-intent-journal.test.ts`, unidad 208 de otra sesión). Proveedor ficticio de loopback, red externa abortada en el navegador; 0 peticiones al abrir/recargar/navegar/caducar; 5 al hacer la comprobación desde «otra superficie»; 0 escrituras externas.
**Límites:** no se conservó una copia del hub R1, así que las pruebas nuevas no se ejecutaron contra él (el dictamen de Codex reprodujo las cuatro fronteras sobre R1). Arnés ≠ App. Las pruebas de 401/pérdida de respuesta de la LECTURA pertenecen ahora al panel de Integraciones (218), no al hub.

## Qué entrega (R1; vigente salvo lo corregido en R2)
- `src/continuity-hub-client.ts`: clientes same-origin de las APIs 212 y 216 (GET de lo guardado, POST explícitos), con límite de bytes, cancelación y parsers estrictos; 401 = bloqueada; sin reintentos ni detalles del servidor.
- `src/ContinuityHub.tsx` (+ CSS): carga **independiente** de la evidencia de la copia, la lectura de HubSpot y el último ensayo (solo GET), construye pasaporte 214 y mapa 215 (lo no disponible queda «sin comprobar») y ofrece dos acciones con **confirmación explícita**: «Comprobar lectura» (portal, cinco lecturas, no escribe) y «Ensayar un relevo» (ficción, no exporta la copia activa).

## Pruebas
| Garantía | Prueba |
| --- | --- |
| Abrir y recargar = **0 tráfico** hacia el proveedor; tres fuentes por GET | DOM contra `createBaseApp` real + 3 APIs |
| Confirmación (portal, cinco lecturas, no escribe); cancelar sin tráfico; confirmar = exactamente cinco GET; doble clic sin duplicar; recargar no repite | DOM |
| Parcial (403) y proveedor caído se muestran tal cual (una petición, sin reintento) | DOM |
| Fuente que falla no borra las demás | DOM |
| Ensayo: confirmación con alcance de ficción, un solo ensayo, resultado en pasaporte y mapa; **Kit real** completo desde el hub | DOM (simulado + real) |
| Sesión bloqueada: no rompe, sin tráfico, «sin comprobar» | DOM con sesión real |
| 390/320 sin desbordamiento, ≥ 44 px, teclado | DOM |
| Cliente: 401, contrato estricto, tamaño, sin reintento, cuerpos exactos de POST, cancelación; consumidor sin almacenamiento ni credenciales y sin POST en la carga | Node |

## Resultados
- DOM `tests/e2e/continuity-hub.spec.ts`: **10/10** (incluye el ensayo con el Kit real, ~10 s). Node `tests/continuity-hub.test.ts`: **4/4**. `tsc` sin errores en los archivos de esta unidad.
- **Control causal con 4 mutantes** del hub (restaurado con hash idéntico): comprobar sin confirmación, fuentes no independientes, abrir que genera tráfico, ensayo sin confirmación ⇒ todos detectados. **No detectable por diseño:** quitar la guarda de doble envío del cliente (el servidor ya devuelve 202 y evita duplicar); la protección real es la del servidor, probada en 212/216.
- Capturas abiertas: `hub-1440`, `hub-confirm-390/320`, `hub-relevo-1440` (`tests/.tmp/hub217-r3/`).

## Límites
Arnés ≠ App: las tres APIs se registraron en el arnés como se propone; el montaje real y el recorrido en la App siguen siendo de quien tenga las reservas. El botón del próximo paso lleva la etiqueta fija del pasaporte («Abrir Integraciones») aunque abra la confirmación de lectura. Sin llamada real a HubSpot (pendiente de portal de ensayo y autorización).

## Hashes finales R2 (sha256)
| Ruta | sha256 |
| --- | --- |
| src/continuity-hub-client.ts | f334f8a9dc58383d40ab43e2bedeff33d025f3fcb47a9ea504d80d28bdf8291b |
| src/ContinuityHub.tsx | 3c53702a5a02ae138717f77f4f25bbcceecbaa7bb7cc2007af0ba44cd2272a1c |
| src/continuity-hub.css | 8a915030c8fd504274025d7782e6eb1640efd10228b931be2887fbf267f78f5a |
| tests/continuity-hub.test.ts | 284412ec57e05d319261922c406146d9e4ab4ee8fcfb8ed8af038c61776afa02 |
| tests/e2e/continuity-hub.spec.ts | 097f63a664c72096d0f6589964d12cac06be7a36b2dca576156d8183997c1735 |
| coordination/plans/MONTAJE-CONTINUIDAD-217.md | 022921bb602174d450d58ba0932194c3db9d88ad1540dd453662ce96f3fcf60c |
| coordination/reports/CLAUDE-HUB-217.md | (este informe) |
Procesos propios: servidores de prueba, proveedor ficticio y navegadores cerrados con cada ejecución; las pruebas del ejecutor dejan cero procesos del Kit (ver pruebas).
