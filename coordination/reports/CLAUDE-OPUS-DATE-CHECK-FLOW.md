# CLAUDE-OPUS-DATE-CHECK-FLOW · Comprobar una fecha, paquete 2

11 de noviembre de 2026, Europe/Madrid. Sesión `claude-opus-5-5`. Consume `CLAUDE-OPUS-DATE-CHECK-CORE` tal como se presentó. Las huellas se verificaron y no cambiaron tras el `submit`.

## Qué existe

| Archivo | Contenido |
| --- | --- |
| `shared/date-check-api.ts` | Contrato `planb-date-check-api-v1`: formulario mínimo, vista legible con evidencia, registro, lista y peticiones. Incluye las conversiones horarias de Madrid. No importa el motor, así que el navegador no lo carga. |
| `shared/date-check-demo.ts` | Construye la entrada del motor a partir del formulario y del estado de ficción. El estado tiene revisión propia: retirar la franja es una revisión **posterior**, no un escenario. Solo se ofrecen los cambios declarados que afectan a la solicitud. |
| `server/date-check-mount.ts` | `mountDateCheck(app, store)`: catálogo, comparar, lista, guardar, reabrir, confirmar y revisión de ficción. Lleva recuentos separados para las pruebas. |
| `src/date-check-client.ts` | Cliente con esquema y pin en cada respuesta. Un 401 emite `planb:locked`. Las respuestas perdidas se marcan como `unknown`. |
| `src/DateCheck.tsx` y `src/date-check.css` | Pantalla «Comprobar una fecha». |
| `tests/date-check-mount.test.ts` | 8 pruebas de servidor. |
| `tests/e2e/date-check.spec.ts` y `tests/e2e/date-check-page.tsx` | Recorrido en Chromium con servidor real en proceso propio y página de arnés. |
| `coordination/plans/DATE-CHECK-MOUNT-HANDOFF.md` | Parche exacto para `main.ts`, `runtime.ts` y `App.tsx`. |

**No está montado en la App.** `main.ts` y `runtime.ts` siguen reservados por 318. `App.tsx` y `RadarHost.tsx` los integra su propietario. No he tocado ningún archivo ajeno, ni `dist/` ni `build/`.

## Garantías y dónde se comprueban

| Garantía | Prueba |
| --- | --- |
| Comparar no escribe: ni tablas de negocio (`records`, `changes`, `captures`, `archives`) ni claves `date-check:*` | servidor, «comparar no escribe nada…»; e2e: solo `POST analyze` tras comparar todas las alternativas |
| Guardar es idempotente por UUID. La misma clave con otro formulario da `ID_REUSED`; una revisión distinta da `STALE` | servidor |
| Confirmar escribe **una** decisión ligada a la revisión. La revisión se recalcula dentro de la transacción de escritura | servidor: recuento `{analyses 1, saves 1, decisions 1, replays 1}` |
| Si se pierde el acuse, repetir con la misma clave devuelve lo persistido sin escribir, también después de una revisión posterior o de un reinicio | servidor; e2e: `route.fetch()` y después `abort`. La pantalla pide «Repetir con la misma clave» y el recibo muestra lo guardado |
| La misma clave con otros valores da `OPERATION_REUSED`; una segunda decisión da `ALREADY_DECIDED` | servidor |
| Dos pestañas confirmando a la vez dejan una sola decisión (201 + 409) | servidor; e2e: la segunda pestaña ve el recibo y no ofrece confirmar |
| Una revisión posterior (franja retirada) deja la comprobación como histórica pero legible. Confirmar da `STALE` y el recálculo no ofrece el viernes | servidor y e2e |
| Sesión bloqueada → 401; otra copia → `CONTEXT_CHANGED`; formulario inválido → 422 sin calcular | servidor |
| El reinicio conserva la comprobación, la decisión y el estado. Arrancar y reabrir no escriben ni recalculan | servidor: misma app sobre el mismo archivo; e2e: **proceso nuevo** |

## Recorrido en navegador

`PLANB_PLAYWRIGHT_EXECUTABLE=<ms-playwright>/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe npx playwright test -c tests/.tmp/opus-date-check/pw.config.ts` → **1/1** (14 s).

El recorrido: formulario por defecto (Lumen, viernes 13 a las 16:00) → con el teclado, Tab hasta Comprobar e Intro → el foco va al resultado → fecha pedida y primera fecha (martes 17, 15:30) → causas con sus cifras → «antes del lunes 16, 08:00» → flechas entre alternativas → llegada sola (personal no), franja sola (material no), reservadas (rompe la entrega del lunes) → evidencia de la reserva RES-2020 con cuenta, fuente, revisión y momento → matriz de escenarios → confirmar con acuse perdido → repetir → recibo → **reinicio del proceso** → reabrir → segunda pestaña → retirar la franja → histórico → recalcular («No se puede prometer esa fecha…») → 390 y 320 px sin desplazamiento horizontal. No hubo peticiones externas ni errores de consola.

Capturas en `tests/.tmp/opus-date-check/shots/` (ignorado por git): `1440-01…05`, `390-resultado` y `320-resultado`. Revisé la de 1440 (resultado) y la de 320. En el primer intento a 390 px había un desborde de 218 px: la hoja global de la App fija `table{white-space:nowrap}`. Lo neutralicé dentro de `.dc-table`, y la prueba ahora nombra los elementos que se salen.

## Pruebas ejecutadas

- `npx tsx --test tests/date-check-mount.test.ts tests/operational-date-check.test.ts tests/operational-inventory.test.ts`: **40/40**.
- e2e **1/1**.
- `tsc --noEmit -p .`: sin errores en las rutas nuevas.

## Límites

- El siguiente paso es un **registro local** de la comprobación, en claves `date-check:<pin>:*`. No crea una tarea en el CRM ni avisa a nadie. Dónde debe vivir lo decide Codex (punto 4 del plan de contrato).
- El reinicio en proceso nuevo se prueba en el e2e. La prueba de servidor reabre otra app en el mismo proceso sobre el mismo archivo, como en las unidades de Fable.
- La ventana de acceso se deriva: 08:00 del día pedido. El viaje es fijo, 30 min. Solo hay un material por solicitud en la pantalla, aunque el motor admite cuatro.
- El reloj del caso es fijo (lunes 9/11/2026 08:00). Es ficción; con datos reales habría que fijarlo por contexto (punto 5 del plan).
- Es una página de arnés, no la App compilada con su navegación. Esa prueba se hace al montar.
- Pendiente: paquete 3 (revisar el desenlace), paquete 4 (piloto) y paquete 0 (correcciones de Fable sobre CORE-1, CORE-2 y MOUNT).
