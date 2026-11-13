# CLAUDE-INTEGRATIONS-119 · Informe

Fecha: 2/11/2026 (Europe/Madrid). Agente: Claude. Estado: entrega para revisión de Codex; no aceptada, no montada.

## Qué se entrega

`LocalIntegrations({onConnectHubspot}:{onConnectHubspot:()=>void})` para `page==='integrations'`. Lee tres fuentes locales con petición, cancelación (15 s), secuencia y error **independientes**:

| Fuente | Qué se usa | Qué NO se concluye |
| --- | --- | --- |
| `GET /api/v2/continuity` | `runtime`, `protected`, `connected`, `realDataEnabled`, `connection` (portal, modo, `verifiedAt`), `latestCapture`, `operations` | `connected` es «servicios habilitados» (`!store.disconnected`), **no** conexión HubSpot. Una credencial guardada se muestra como «Lectura configurada», nunca «conectado»/«verificado ahora». |
| `GET /api/v4/integrations` | catálogo; solo alimenta el detalle plegado «Ver capacidades de ensayo» y dos matices (hubspot `readonly`, gmail/calendar `simulation`) | No prueba conexión ni éxito remoto. |
| `GET /api/v6/workspace` | `origin` validado | Un origen válido no acredita cuenta Google, identidad ni tenant. |

Estados por fila: Sin conectar · Lectura configurada · Servicios deshabilitados · Sin comprobar aquí · Espacio de equipo sin configurar · Dirección no válida · No disponible en este paquete · No se pudo consultar (con «Reintentar» local) · Comprobando…
- HubSpot: «Conectar HubSpot» / «Revisar conexión» llaman a `onConnectHubspot`; no hay formulario ni recogida de credenciales.
- Gmail/Calendar/Drive/Docs/Sheets: solo con origen válido hay enlace (`/team?view=commercial`, más `&tool=drive|docs|sheets`, que `CommercialWorkspace` ya interpreta). Sin origen o con origen rechazado: explicación y siguiente paso real, sin botón.
- Primero «Conexiones» con el bloque «Espacio local»; las capacidades de ensayo van en `<details>` cerrado.
- «Requiere reconectar» **no** se ofrece: ningún contrato expone evidencia (un fallo de captura se muestra como hecho, con la aclaración de que no prueba caducidad).

Política de origen (`validateTeamOrigin`): origen canónico simple, sin credenciales/ruta/consulta/fragmento/`@`/`\`/espacios/`%`; `http` solo en bucle local (`localhost`, `127.x`, `[::1]`, `*.localhost`); `https` solo con nombre de dominio con punto (no IP ni nombre sin punto). El valor rechazado no se reproduce en pantalla. **Decisión que Codex puede querer ajustar** si el equipo se publica en un host `https` de una sola etiqueta o por IP.

## Archivos y hashes (SHA-256, tras la última edición)

| Archivo | SHA-256 |
| --- | --- |
| shared/local-integrations.ts | a157c67b9be4fd04cdd6753d55d0b848e9fa5afdc01421a723485c30769f5d49 |
| src/LocalIntegrations.tsx | d3f4fd818ff5c325c0aadf5e426d432215fe6eef76c347116b9556b6b2885624 |
| src/local-integrations.css | f6ca58088c1bc8ce7532b5f1a8ee8f21b221e8688120f82576fa208d5c51b077 |
| tests/local-integrations.test.ts | baee43fb162c79c8fe371bce38abf597d9e827085d4f3da43fe78ef085c32a2b |
| tests/e2e/local-integrations.spec.ts | 81ea065bb82756f123129d264efc665491b79e7386266f0026ea0763c6cf46e8 |

Los otros cuatro archivos reservados son este informe, el checkpoint, `coordination/plans/INTEGRACIONES-119-HANDOFF.md` y `design/integrations119/README.md`.

## Comandos y resultados

Node v24.14.0, Playwright 1.64.1, `chrome-headless-shell` de `ms-playwright/chromium_headless_shell-1228` (Chromium limpio, sin perfil).

```powershell
npx tsx --test tests/local-integrations.test.ts      # 18/18 correctas
npx tsc --noEmit -p .                                 # sin errores en el árbol actual (incluye ajenos)
$env:PLANB_INT119_ROOT="<repo>/tests/.tmp/integrations119-538c0f25-9b3f-4d13-b15d-93fe81a7059d"
npx playwright test -c "$env:PLANB_INT119_ROOT/pw.config.ts"   # 14/14 correctas
```

- Unitarias (15 de contrato/proyección + 3 de **arnés de hooks**, que no es DOM real): sin cuenta; `connected` no es conexión; solo catálogo; conexión declarada/pausada/NOT_VERIFIED; discrepancia catálogo–Continuidad; fallo de captura; paquete independiente; 24 orígenes inválidos y 7 válidos; enlaces por herramienta; orígenes maliciosos sin enlace ni eco; un endpoint caído y datos conservados; carga; catálogo vacío/desconocido; contratos incompatibles; ninguna combinación afirma «conectado/verificado»; callback; respuesta tardía y desmontaje.
- DOM real (Chromium): callback efectuado (`window.__connects`), hrefs exactos con `target=_blank rel=noopener`, nombres de enlace únicos, `<details>` cerrado al inicio y operable con Enter/Espacio y foco visible por Tab, reintento local (solo se repite `/v6/workspace`), reintento fallido que conserva datos, catálogo caído/vacío, respuesta antigua tardía con `fetch` que ignora la señal (solo protege la guarda de secuencia), desmontaje con petición pendiente (sin errores de consola), petición colgada → tras 15 s (reloj simulado) error con reintento, contrato incompatible, y 1440/390/320 × 3 escenarios sin desbordamiento horizontal, sin elementos fuera de ventana, objetivos ≥32 px (escritorio) / ≥44 px (móvil) y todos los controles con nombre. El tráfico a hosts distintos de 127.0.0.1 se aborta; se verificó que no hubo ninguno.
- Defectos encontrados y corregidos durante la verificación visual: copy repetido en las cinco filas de Google (reducido a una frase); botón «Actualizar» convertido por CSS global en icono sin texto en móvil; objetivos táctiles de 40 px por especificidad de `body .button`.

## Capturas inspeccionadas

`tests/.tmp/integrations119-538c0f25-9b3f-4d13-b15d-93fe81a7059d/shots/` (9 PNG: `sin-cuenta`, `declarada-con-equipo`, `errores` × 1440/390/320). Vistas por mí: `declarada-con-equipo-1440`, `sin-cuenta-390`, `errores-320`, `sin-cuenta-320` (esta última tras las correcciones). Las demás las valida el test de geometría, no mi inspección visual.

## Recursos propios

Carpeta `tests/.tmp/integrations119-538c0f25-9b3f-4d13-b15d-93fe81a7059d/` (ignorada por git): `entry.tsx`, bundle esbuild, `pw.config.ts` (config del runner, fuera de las nueve rutas, solo andamiaje temporal indicado por el encargo), `results/`, `results.json`, `shots/`. Servidor HTTP propio en `127.0.0.1` con puerto efímero (0), cerrado al terminar; ningún proceso ajeno tocado. No se ejecutaron `npm run build`, `dist`, 4451/4511/4515 ni `npm test` completo.

## Límites

- El montaje E2E es un arnés (`div.app-shell` + `aside` vacío + `main`), no la `App` real: no prueba la navegación, el ancho real con la barra lateral ni que 117 llame bien al callback.
- Chromium headless únicamente; sin contraste calculado ni lector de pantalla; la accesibilidad comprobada es estructura, nombres, teclado y foco.
- No se hizo prueba de mutación/línea base contra una versión anterior (el componente es nuevo).
- Los fixtures son sintéticos con la forma real leída en `server/continuity.ts`, `server/agents.ts` y `server/team-sync.ts`; no hay prueba con proveedores, HubSpot ni Google, y el estado de 4451 no se ha vuelto a comprobar.
- Que el callback «abra el flujo HubSpot de Continuidad» es contrato del encargo; no lo he podido ejercitar sin `App`.
