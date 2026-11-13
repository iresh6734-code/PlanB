# CLAUDE-OPUS-DATE-CHECK-HOST-MOUNT · Montaje en la App por orden expresa del usuario

11 de noviembre de 2026, Europe/Madrid. Sesión `claude-opus-5-5`. El usuario ordenó: «monta todo lo que necesites o falte y muéstralo en la app». Se aplicó el montaje sobre archivos que no son de esta unidad. El tablón no permite reservarlos, así que sus cambios exactos quedan aquí para que sus dueños vuelvan a presentar sobre el estado nuevo.

## Cambios en archivos ajenos (solo adiciones)

Copias previas en el scratchpad de la sesión (`host-before/`). Sin contar los finales de línea, el diff es exactamente este.

**`server/main.ts`** (reservado por `CODEX-A4-SERVER-MOUNT-318`) y **`server/runtime.ts`** (ídem), el mismo cambio en los dos:
```ts
import { mountDateCheck } from './date-check-mount.js';
import { mountDateCheckReview } from './date-check-review-mount.js';
// … después de mountOperationalRehearsal(app, store);
// «Comprobar una fecha» y «Revisar una decisión»: solo ficción, exigen copia de ensayo activa y no llaman a ningún proveedor.
mountDateCheck(app, store);
mountDateCheckReview(app, store);
```

**`src/App.tsx`** (sin reserva viva):
- importa `DateCheck` y `DecisionReview`;
- añade `'date-check'` a la unión de `page`;
- añade el botón de navegación «Comprobar una fecha» (icono `CalendarDays`, ya importado) justo después de Radar;
- añade una rama de render: `:page==='date-check'?<><DateCheck …/><div style={{marginTop:24}}><DecisionReview …/></div></>`. Es la opción 1 del guion de revisión: la revisión va debajo de la comprobación, en la misma página.

**`src/DecisionReview.tsx`** (de mi unidad `CLAUDE-OPUS-DATE-CHECK-REVIEW`, ya presentada). En la App, las dos pantallas son hermanas y la lista de decisiones solo se cargaba al montar: una decisión recién confirmada arriba no aparecía hasta recargar. Ahora la lista se vuelve a leer al recuperar el foco la ventana y al entrar el puntero o el foco en ella (como mucho cada 3 s), y hay un botón «Actualizar». Solo son lecturas. La huella cambia de `189944571b78…` a `b36bdc4b7009…`: **REVIEW debe revisarse sobre la huella nueva.**

**`.claude/launch.json`**: configuración `comprobar-fecha-demo` para el panel de vista previa. Arranca `tests/.tmp/opus-date-check/showcase/server.mts`, que está ignorado por git.

Huellas nuevas:

| Archivo | SHA-256 |
| --- | --- |
| `server/main.ts` | `8d96ab2a9d8d3d3080eb134db769d246f21f9d137a1a0010001029af54267980` |
| `server/runtime.ts` | `da85c305766a37924988667b0a608fe72571e23854d4a5c4d1f7a649059e0c82` |
| `src/App.tsx` | `dd6f15a879040ad40ed9f78028b3d1d2890cedc88748d7662d66cf2de11d9323` |
| `src/DecisionReview.tsx` | `b36bdc4b7009a2a2bc6c3e9fe0164cc27aa1c5568c5f921af1f7d54f5c01ecae` |

## Verificación

- **App real compilada** (`tests/e2e/date-check-app.spec.ts`, vite a carpeta temporal y el servidor con los mismos montajes que `main.ts`): **1/1**. El recorrido: navegación → «Comprobar una fecha» → resultado del caso Almacén Sur → siguiente paso confirmado → «Actualizar» → la decisión aparece en «Revisar una decisión» → desenlace con proveedor tarde → **reinicio del proceso** → reapertura sin escrituras → 390 y 320 px sin desbordamiento. No hubo red externa ni errores de consola. Capturas en `tests/.tmp/opus-date-check/app-shots/`; revisada la de 1440.
- Recorrido de revisión (`date-check-review.spec.ts`) con el cambio de `DecisionReview.tsx`: **1/1**.
- Pruebas que inspeccionan `App.tsx`, `main.ts` o `runtime.ts` (10 ficheros, en serie): **275/278**, **idénticas** con y sin el montaje. Los dos fallos (AUTH_PARENT072 G6 y una reapertura en disco de revisiones de tareas) ya fallaban con los archivos originales, así que no se deben al montaje.
- `tsc --noEmit -p .`: sin errores en los archivos tocados.
- **Demostración abierta** en el panel de vista previa: configuración `comprobar-fecha-demo`, App compilada en `tests/.tmp/opus-date-check/showcase/dist`, SQLite de ficción en `showcase/case`, con `NODE_ENV=test` porque la clave de esa carpeta es de prueba, como en los recorridos.
- **No se han tocado** `dist/`, `build/`, `data/` ni ninguna instalación `planb-local-*`. El piloto 4334 y el CRM 4331 no tienen este cambio.

## Pendiente

- Codex (318) debe volver a presentar `main.ts` y `runtime.ts` sobre las huellas nuevas y revisar el montaje.
- REVIEW se revisa con la huella nueva de `DecisionReview.tsx`.
- Llevar esto al piloto exige que Codex prepare la candidata. Este montaje no lo despliega.
