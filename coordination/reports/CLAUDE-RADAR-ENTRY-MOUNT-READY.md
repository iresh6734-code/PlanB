# CLAUDE-RADAR-ENTRY-MOUNT-READY · entrada del Radar lista para montar

Autor: Claude A. Siete archivos (los de la reserva): `src/CommitmentRadarEntry.tsx` (nuevo), `src/commitment-radar-client.ts`, `src/CommitmentRadar.tsx`, `src/commitment-radar.css`, `tests/e2e/commitment-radar-entry.spec.ts` (nuevo), `coordination/plans/RADAR-MOUNT-HANDOFF.md` (nuevo) y este informe. **Recorrido disponible:** solo por arnés (servidor real con `mountCommitmentRadar`, SQLite de archivo, reloj fijo, red bloqueada). **Montaje pendiente:** `server/main.ts` y `App.tsx`, dueño Codex (`CODEX-COMMITMENT-RADAR-MOUNT`). No hay una segunda entrada en ninguna ruta.

## Problema

El servidor ya publica la capacidad del Radar (`/api/v7/commitment-radar`: estado, activación explícita y semilla persistente 289/291), pero la interfaz no la conocía: mostraba el Radar o fallaba, sin distinguir copia inactiva, copia no ficticia, escenario sin inicializar o lectura no disponible, y la ficha enseñaba IDs de proveedor sin decir que son datos de ensayo.

## Qué cambia

- **`CommitmentRadarEntry`**: lee la capacidad con el pin y distingue sin pin/copia inactiva, copia no ficticia, **sin inicializar** (explica qué se crea, lista las tres advertencias y ofrece «Activar el escenario de ensayo»: acción explícita, un único POST, 201 la primera vez), no disponible (aviso con reintento, nunca vacío) y disponible (banda de procedencia: creado el…, guardado en disco o solo en memoria, datos ficticios, ningún proveedor conectado). Cambio de pin, 409 de contexto (avisa a quien monta con `onContextStale`), bloqueo y respuestas tardías: todo se retira.
- **Cliente** (`loadRadarCapability`, `activateRadar`): respuesta validada de forma estricta (la capacidad no tiene esquema compartido; se define el mínimo aquí) y recibo del mismo pin.
- **Ficha**: cada vínculo se rotula «HubSpot · datos de ensayo · no conectado», «Pedidos ficticios · no conectado», etc. (`multisystemProviderLabels`) **añadido tras** el texto anterior, y se muestran las tres advertencias de `multisystemDisclosures` (pedidos ficticios, ningún proveedor conectado, mismo ID ≠ mismo registro). Las pruebas aceptadas del Radar no cambian.

## Pruebas de la entrega original (11 casos, 3 ejecuciones seguidas sin reintentos: 54,5 / 53,9 / 55,8 s)

Sin escenario (0 lecturas con efecto, 0 escrituras); activar crea la semilla una vez (201), 2 en riesgo / 4 sin confirmar / 2 sin riesgo, recargar y leer no escribe (única escritura: la activación); reinicio del servidor conserva `seedAt`, conjunto y lista; procedencia en la ficha y mismo ID de pedido en dos cuentas como candidatos sin fusionar; copia inactiva (sin pin; el servidor confirma «copia inactiva»); copia no ficticia (**respuesta simulada en el borde del navegador**: una captura de producción válida exige formato v3 y cuenta STANDARD verificada); lectura no disponible (503) no se presenta como vacío; 409 al activar y bloqueo; teclado y 1440/390/320 (sin desbordamiento, objetivos táctiles, foco devuelto). Capturas inspeccionadas: `activacion-{1440,390,320}.png` y `ficha-procedencia-{…}.png`.

**Contrapruebas: 6/6 detectadas** (activar dos veces, activar sin acción de la persona, fallo presentado como vacío, no avisar del 409, rótulo sin «no conectado», ficha sin advertencias). **Regresiones:** Radar 19/19 y SCENARIOS 15/15 con el componente nuevo. `tsc` limpio en mis archivos (otro agente tiene en curso `tests/source-status-row.test.ts` con errores de sintaxis; no es mío).

## R2 · revisión 315 (F1/P2): la activación ya no puede quedar «Activando…» sin límite

**Defecto reproducido por Codex.** Si el servidor creaba la semilla (201) y el acuse llegaba retenido al navegador, `activating` seguía en `true` y deshabilitaba «Activando…» y «Actualizar estado»: la persona no podía comprobar lo que el servidor ya había creado.

**Qué cambia (cinco archivos de la reserva; `CommitmentRadar.tsx` y `commitment-radar.css` intactos).**
- `src/commitment-radar-client.ts`: `activateRadar(pin, signal?, timeoutMs = 15 s)` envuelve la activación COMPLETA (fetch, cabeceras y lectura del cuerpo) en una carrera con un plazo propio y con la señal de cancelación. No depende de que el transporte atienda `AbortSignal`. Al vencer rechaza con `CommitmentError` `unknown:true`; el temporizador y el oyente se limpian siempre y un resultado posterior queda sin efecto (sin rechazos sin atender).
- `src/CommitmentRadarEntry.tsx`: la activación tiene su propio contador (`act`) y su propio `AbortController`. Una nueva lectura, el reinicio por cambio de pin, el bloqueo y el desmontaje invalidan la activación en curso y descartan su éxito o error tardío. La lectura inicial también corta su espera con una carrera, no solo con `abort()`. Texto al vencer (el de siempre): «No se sabe si el escenario llegó a crearse. No se ha reenviado nada…»; no afirma que no se creó.
- Ningún reenvío automático: ni el plazo, ni la cancelación, ni el desmontaje, ni una recuperación vuelven a hacer POST. Solo una nueva pulsación humana en «Activar el escenario de ensayo» inicia otro POST (el servidor es idempotente: 200 si ya existe).

**Pruebas nuevas (5, en `tests/e2e/commitment-radar-entry.spec.ts`, reloj virtual de Playwright).** (1) Acuse retenido DESPUÉS de que el servidor creó la semilla: antes de 15 s sigue esperando; después libera ambos controles, avisa de la incertidumbre, comprobar por GET muestra el escenario, hay 1 POST y 1 escritura en total, y el éxito liberado más tarde no muestra «creado ahora». (2) y (3) Transporte que ignora la cancelación, sin respuesta y con cabeceras sin cuerpo: plazo propio, el contador de POST del navegador sigue en 1 tras 120 s más, la lectura confirma 0 activaciones en el servidor y solo una pulsación humana crea el escenario (201). (4) Bloqueo con la activación pendiente y respuesta tardía: no repuebla. (5) Cambio de pin con la activación pendiente: sin alertas, sin errores de consola ni rechazos sin atender, 1 POST. **Las tres primeras fallan con la versión anterior** (3 rojos medidos antes de corregir); las dos últimas ya pasaban y quedan como guardas de regresión.

**Combinación ejecutada** (Chromium headless-shell 1228, 1 trabajador, `retries:0`, un solo proceso de Playwright, 7,1 min): **59/59, 0 omitidas, 0 con reintento.** Son: entrada 16 (11 originales sin tocar + 5 nuevas), sondas de Codex 315 sin editar (2; huella `acdf0cf4…`), Radar 19 + independientes 3 + sesión 1, SCENARIOS 15 y su informe autónomo 3. Tipos: `tsc --noEmit` sin errores en mis archivos. La lectura inicial sigue sin activar ni sembrar nada (prueba «SIN ESCENARIO»: 0 escrituras y 0 activaciones). Capturas 1440/390/320 de activación y ficha regeneradas por esas pruebas (no reinspeccionadas en R2: no cambió ninguna regla visual).

**Límites de R2.** Sigue siendo arnés: no es la App instalada ni `main` compilado. El plazo se probó con reloj virtual; el cuerpo detenido y el transporte mudo se simulan sustituyendo `fetch` en la página (ningún servidor retiene bytes de verdad). Ante un plazo no se sabe si el servidor llegó a recibir el POST. El plazo de 15 s es una decisión de la entrada, no un contrato del servidor.
## Límites

No prueba la App, `main` compilado ni 401 real. La clase de estado «no disponible» del servidor (semilla ilegible) no se reproduce en el arnés; se prueba el fallo de lectura por 503. El instante del escenario lo fija el servidor al activar; `seedAt` mostrado es el de ese reloj.

## Huellas (SHA-256, LF) · R2 — el propio informe no se auto-referencia

| Archivo | SHA-256 |
| --- | --- |
| `src/CommitmentRadarEntry.tsx` | `b006c446de47e48f140d28ed6f963c9fd0d3b2eff00778bd4a186eb0cd997f4b` |
| `src/commitment-radar-client.ts` | `b133be0b7bef06a385389147d6bc97d167d147dddf9716c405592a953d09fe12` |
| `src/CommitmentRadar.tsx` | `60224e3b553fdf698936ed583cc4314d5ae6c4f80817d8083426c6e8a1d283c1` |
| `src/commitment-radar.css` | `fc47d8206f50a0b8edc619aa29c92d688fe95cb23f2349893f3ba31e94a530d8` |
| `tests/e2e/commitment-radar-entry.spec.ts` | `b34bf92d5a3b1da81e856693340741f2f55bcd0a74602f9806d8e8284f15ddf2` |
| `coordination/plans/RADAR-MOUNT-HANDOFF.md` | `b47806064990210889333c326a524dc798029d6ca2033e4451b3e3f74d83f1b2` |
