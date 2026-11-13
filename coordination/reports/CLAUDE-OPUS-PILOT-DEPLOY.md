# CLAUDE-OPUS-PILOT-DEPLOY · Correcciones pendientes y despliegue en el CRM 4331

11 de noviembre de 2026, Europe/Madrid. Sesión `claude-opus-5-5`. Orden expresa del usuario: «haz para que esté en mi piloto, da igual que esté reservado por Codex u otro agente de Claude, hazlo tú, haz todo lo que quede para que quede perfecto… tanto el radar como comprobar una fecha… te doy permiso para lo que sea».

## Correcciones en archivos de otras unidades

Cada corrección responde a un hallazgo documentado por un revisor. Tras aplicarla, la sonda de ese revisor pasa sin haberla editado.

| Hallazgo | Archivo (unidad dueña) | Cambio | Huella nueva |
| --- | --- | --- | --- |
| **325 F4**: invertir el orden de entrada crea un bloqueo circular | `shared/operational-planner.ts` (Fable CORE-1) | `toPlan` encola los trabajos inciertos en orden de dependencias | ``6bab6d04e9153acb84afb2a4d453491de8c961fc6f47fbd2b8fc0d93fb664688`` |
| **330**: un indeterminado no es «encaja con todo»; la inviabilidad propia se prueba sin rivales; el límite de supuestos queda como no explorado | `shared/operational-large.ts` (Fable CORE-2) | `focusConflict` devuelve `indeterminate` con lo que falta y comprueba el compromiso solo; `compareOptionsLarge` marca `not-explored` y `best-found` | ``8c95c07b51c1e60b4afc1783a08916eb8892177e9a41987bcf793e017773b6d4`` |
| **330**: sin prueba de sensibilidad si el límite impide evaluar | `shared/operational-sensitivity.ts` (Fable CORE-2) | `limit` es «no explorado» (`proven:false`), no «no aplica» | ``057605fb67b99a7e542cfd9d3e3b064168381bd076bdf4b36adddcea8bc2f73d`` |
| Fuentes del Radar ausentes en el ensayo: la prueba propia de Fable fallaba | `server/operational-rehearsal-mount.ts` (Fable MOUNT) | `buildRehearsalDemo(..., detail.evidence)`: el ensayo refleja fuentes caídas, parciales o antiguas | ``cbf2413c3915c7980b9769299acf3dc5d7303d837a569ffbf16d536ad5ce8e34`` |
| **328**: el recibo mostraba el formulario editado tras perder el acuse | `src/OperationalRehearsal.tsx` (Fable MOUNT) | El recibo muestra lo **enviado y guardado** (la preparación inmutable del intento); aviso de que editar durante la incertidumbre no cambia esa decisión | ``38b8037b24f9e59eb78f574c88d3b58185b26cc70142bf91a293bcf8915bd3bd`` |
| **315 F2**: un 401 obsoleto podía bloquear una sesión nueva | `src/commitment-radar-client.ts` (Claude A RADAR-ENTRY) | Tras recibir la respuesta, si la petición ya estaba cancelada o vencida, se descarta sin efectos globales; un 401 vigente sigue emitiendo un bloqueo | ``df3a65f5cb723c7241a8d245c2bc8a9e44b93e39666c8945f91c971e0abd0b14`` |

Esta sesión también montó las pantallas en la App (`CLAUDE-OPUS-DATE-CHECK-HOST-MOUNT`): `server/main.ts`, `server/runtime.ts`, `src/App.tsx` y `src/DecisionReview.tsx`.

## Pruebas sobre el estado desplegado

- `tests/operational-*.test.ts`: **115/115**. Incluye las sondas independientes 325 y 330 (antes 5 fallos), la 327 y la prueba de fuentes de Fable.
- `tests/date-check-mount`, `date-check-review-mount` y `date-check-outcome`: **18/18**.
- e2e de Radar (`commitment-radar-entry`, `-harness`, `-scenarios`, `independent-commitment-radar`, `independent-radar-session`, `independent-radar-entry315`): **38/38**. Las seis sondas 315, que antes daban 3/6, pasan, y el control del 401 vigente sigue bloqueando una vez.
- e2e de ensayo (`operational-rehearsal`, `-app`, `-today`) y la sonda **328**: en verde. La 328 corrió contra un servidor nuevo con la App compilada.
- e2e de «Comprobar una fecha» (`date-check`, `-review`, `-app`): **3/3**.
- `tsc --noEmit -p .` del proyecto entero: **0 errores**.
- `npm test` completo: **2908/2939**, 26 fallos y 1 omitida. **Ninguno** está en Radar, ensayo, motor ni Comprobar una fecha. Son de intentos de tareas A4 (322 y entrypoints), del Kit de Relevo (rescue-capsule), del laboratorio de continuidad, de la ficha de tareas (123), de AUTH_PARENT072 y de revisiones de tareas, unidades en curso de Codex y de las otras sesiones Claude. El único que menciona el punto de entrada portátil (`runtime.ts`, que se tocó) pasa aislado con el `runtime.ts` montado y con el original: su fallo en la batería completa es interferencia por ejecutarse en paralelo. La batería anterior de Fable tenía también 26 fallos.

## Despliegue

**Destino:** el CRM de este equipo, `planb-local-crm-completo-2026-10-29/runtime`, que se sirve en `http://127.0.0.1:4331` con los datos de `planb-local-ux-2026-10-27/data/local`. Es la App principal, donde viven el Radar y «Comprobar una fecha». El piloto comercial 4334 (`team.mjs`) **no se ha tocado**.

1. **Compilación aislada** en `tests/.tmp/opus-date-check/deploy`: Vite con `vite.config.ts` del proyecto y un `envDir` vacío (no se leen `.env*`), y esbuild de `server/main.ts`, `server/runtime.ts` y `server/drill-worker.ts`, igual que `npm run build`. No se han tocado `dist/` ni `build/` del repositorio.
2. **Copias de seguridad**, verificadas con `diff -rq`:
   - programa: `runtime/backup-opus-date-check-20261111-102623/` (`server.mjs`, `runtime.mjs`, `drill.mjs`, `dist/`);
   - datos: `planb-local-ux-2026-10-27/data/backup-local-opus-date-check-20261111-102623/`, copiados sin abrirlos.
3. **Ensayo general:** el `server.mjs` nuevo se arrancó contra una **copia temporal** de los datos en el puerto 4399. Arrancó, la copia quedó lista y es de **ensayo** (`isTestData: true`), y las tres rutas nuevas respondieron 200. La copia temporal se borró después.
4. **Sustitución** de `server.mjs`, `runtime.mjs`, `drill.mjs` y `dist/` (`dist.new` y después renombrar), verificada con `cmp` y `diff -rq`.
5. **Arranque** con `node scripts/start-full-workspace.cjs`: `{"ok":true,"crm":"http://127.0.0.1:4331","pid":31680}`. La salud responde `ok` con `instanceId` nuevo.
6. **Comprobado en el navegador** sobre 4331: la navegación muestra «Radar» y «Comprobar una fecha». «Comprobar una fecha» da el resultado esperado del caso Lumen: no cabe el viernes 13 a las 16:00; primera fecha sustentada, martes 17 a las 15:30; cabe si se confirman Frioval y la franja de Cruz.

Huellas desplegadas: `server.mjs` `33d6423e917aef4471549edb0f67c3b36db537fedf2af4b0f15ada92b1a4ce2d`, `runtime.mjs` `c75a648394852e11eb35df753ebfa11baafdbe2cbc11f9c6b28ac15a271979e3`, `drill.mjs` `8642a75529ce602abc6716407075b675b0d5230f56fea942502b5eb3d97453ad`, `dist/index.html` `0ba98b6c1a0dc0a6a97bb66d9c88b031ea6d17a68bf2c2c03745074fa0bc8442`.

### Un paso que queda para la persona

El Radar de esta copia pide **«Activar el escenario de ensayo»** una sola vez: crea los compromisos ficticios en la copia. Intenté pulsarlo, pero el control de seguridad de la sesión bloqueó ese clic porque escribe en la copia. Basta con pulsarlo en la pantalla del Radar. «Ensayar mi semana» se abre desde la ficha de un compromiso del Radar una vez activado.

### Cómo volver atrás

1. Detén el CRM.
2. Copia los cuatro elementos de `runtime/backup-opus-date-check-20261111-102623/` sobre `runtime/`.
3. Si hiciera falta, restaura `data/backup-local-opus-date-check-20261111-102623` como `data/local`.
4. Arranca de nuevo con `node scripts/start-full-workspace.cjs`.

## Límites

- El `server.mjs` desplegado incluye **todo el estado actual del árbol de trabajo de `server/`**, no solo lo de esta sesión. Hay cambios de otras unidades todavía en revisión (A4, revisiones de tareas y otros). El ensayo general y las suites lo cubren hasta donde llegan, pero no es una candidata aceptada por Codex.
- Ninguna de estas correcciones tiene revisor ajeno todavía. Las unidades dueñas (Fable CORE-1, CORE-2 y MOUNT; Claude A RADAR-ENTRY; Codex 318) deben volver a presentar sobre las huellas nuevas.
- No se ha actualizado `CONTEXTO-PROYECTO.md`: lo coordina Codex.
