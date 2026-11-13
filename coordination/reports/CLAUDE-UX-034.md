# CLAUDE-UX-034 · Ficha de cliente: foco estable y bloqueo efectivo de operaciones

30/10/2026, Europe/Madrid. Autor: Claude (Sonnet 5.5). Entrega **pendiente de revisión independiente**: no la acepto yo. Sin servidor, contratos, permisos ni esquema tocados; sin commit, push, despliegue ni proveedores.

## Qué problemas se reprodujeron en el código anterior

Línea base = `CustomerDossier.tsx` de `HEAD`, cuyo hash (`eaa66280…`) coincide con el de la reserva. Se ejecutaron **las mismas pruebas nuevas** contra ese archivo (`PLANB_UI_SRC` en la prueba de componente; compilación Vite aparte en el E2E):

| Defecto (código anterior) | Evidencia |
| --- | --- |
| `run()` solo se protegía con el estado `busy`, que llega en el siguiente render: dos activaciones seguidas enviaban dos peticiones. | Componente: «Completar» ×2 y envío ×2 fallan. |
| Los controles usaban `disabled={busy}`: al pulsar Guardar/Completar/Actualizar el propio control (y los campos) dejaban de poder tener foco. | Componente + Chromium (`toBeFocused` falla). |
| Con el formulario vaciado tras guardar, el botón pasaba a inválido y el foco se perdía en `<body>`. | Chromium. |
| El foco se forzaba al encabezado siempre, aunque la persona lo hubiera movido, y antes de recargar. | Componente (documento simulado). |
| **No había bloqueo en el handler**: con solo lectura, llamar al `onClick` de «Completar» enviaba la petición; un título de solo espacios con fecha válida se enviaba. El único bloqueo era el atributo `disabled`. | Componente (hallazgo no previsto en el encargo). |
| Fallar «Actualizar» decía «La acción se realizó…» sin haber ninguna acción. | Componente + Chromium. |
| Tras acción correcta + recarga fallida la fila vieja dejaba «Completar» activo sobre una acción ya hecha. | Componente + Chromium. |
| Cerrar con una operación pendiente preguntaba por «texto sin guardar» (mentira: se estaba guardando) y, al terminar, escribía estado y recargaba una ficha ya cerrada. | Componente + Chromium. |

Resultado de la línea base: **componente 16 de 22 fallan; Chromium 10 de 11 fallan** (el que pasa es «solo lectura», porque el `disabled` nativo sí existía). Los 6 de componente que pasan en ambos son guardas de lo que ya funcionaba (id renovado tras éxito, recarga simple sin aviso, foco al encabezado tras completar/reabrir, fallo sin mover foco, contratos).

## Cambios

**`src/CustomerDossier.tsx`**
- **Guarda síncrona** `lock` (ref) en `run()`: una operación a la vez entre Guardar, Completar/Reabrir, Actualizar y Preparar. Todos los handlers comprueban además `canWrite`, validez y `stale`: el bloqueo es real en el handler, no solo visual.
- **Bloqueo durante la operación = `aria-disabled` + `readOnly`**, no `disabled`; el control que inicia la operación conserva el foco. Se mantiene `disabled` nativo por permisos (`!canWrite`) y por entrada inválida (título vacío/solo espacios, fecha vacía).
- **Foco tras la operación** (efecto posterior al pintado, `focusAfter`): solo se recoloca si se perdió (`activeElement` es `body`, está desconectado o deshabilitado). Completar/Reabrir → encabezado «Próxima acción»; Guardar → campo «Qué hay que hacer». Si la persona movió el foco, o la ficha se cerró, no se toca. Un fallo no mueve el foco.
- **Tres resultados distintos**: acción fallida (mensaje con el nombre de la acción; guardar indica que reintentar con los mismos datos no duplica — el servidor es idempotente por `id`), acción correcta + recarga correcta, acción correcta + recarga fallida (`stale`: se bloquean los cambios de estado, que llevan la versión vieja, y los botones apuntan al aviso con `aria-describedby`). Reintentar la recarga no repite la mutación. «Actualizar» fallido ya no habla de una acción inexistente.
- Texto de estado único `role="status"` («Guardando la próxima acción…», etc.) que pasa a ser el aviso de éxito en el mismo elemento. El aviso de fallo se acerca a la vista sin mover el foco.
- **Cierre**: con una operación pendiente (no una simple recarga) la confirmación avisa de que no se verá el resultado; sin operación conserva exactamente el aviso anterior de borradores/archivos. Tras desmontar no se escribe estado, no se recarga y no se pide foco. `onPrepared` se sigue llamando como antes.
- Guarda `typeof document` en el efecto de foco para que el componente no falle en arneses sin DOM (`ui-journeys` solo funciona hoy porque un test anterior deja un `document` simulado global).
- **Sin cambios** en «Preparar seguimiento» (sigue con `disabled` nativo y sus motivos), operaciones de archivos, IDs de operación, `sourceKey`, versiones, hora local y borradores.

**`src/customer-dossier.css`**: estilo de `aria-disabled` y de campo `readonly`; `scroll-margin-top` del aviso de fallo (sin él, a 320 px la primera línea quedaba **oculta bajo la cabecera fija**: lo vi en una captura; sin la regla el aviso queda 65 px por encima del borde inferior de la cabecera, con ella queda visible).

**Pruebas nuevas**: `tests/customer-dossier-focus.test.ts` (22) y `tests/e2e/customer-dossier-focus.spec.ts` (13, escritorio + 390 + 320).

## Comandos y resultados reales

| Comprobación | Resultado |
| --- | --- |
| `npx tsc --noEmit` | sin errores |
| `node --import tsx --test tests/customer-dossier-focus.test.ts tests/ui-journeys.test.ts` | **82/82** (22 nuevas + 60 existentes) |
| Mismas 22 contra `HEAD` | 6 pasan / **16 fallan** |
| E2E nuevo, Chromium headless-shell 1228, código nuevo | **13/13**, dos ejecuciones completas seguidas con 11/11 antes de añadir los 2 de sesión caducada, y una final con 13/13 |
| E2E nuevo contra compilación de línea base | 1 pasa / **10 fallan** (de los 11 de entonces) |
| Mutación del CSS (quitar `scroll-margin-top`) | los 2 tests móviles fallan con −65 px; CSS restaurado idéntico (`cmp`) y recompilado |
| E2E previos `customers`, `session-lock`, `ux`, `v6` (12 tests) | código nuevo **8 pasan / 4 fallan**; línea base **8 / 4, los mismos cuatro** → no es regresión |

Los cuatro fallos preexistentes: `customers.spec.ts:7` y `session-lock.spec.ts:66` hacen clic en «Lucía Martín» sin pasar antes por «Contactos» (la pantalla inicial del árbol de trabajo actual es el resumen de empresa); `ux.spec.ts:6` y `v6.spec.ts:6` fallan en menos de 0,5 s y **no investigué la causa**. Son archivos ajenos a esta reserva y no los he tocado. Consecuencia: el único E2E previo que ejercitaba «Actualizar» con un 401 no sirve de evidencia hoy; lo cubro con dos tests propios (401 en «Actualizar» y 401 en la recarga tras una acción correcta). Esos dos son **guardas de no regresión**: la línea base también los pasaría.

### Cómo repetir (entorno aislado, sin tocar el piloto ni `build/`/`dist/`)

```
npx vite build --outDir tests/.tmp/claude-ux034/run/dist --emptyOutDir
npx esbuild server/team/main.ts --bundle --platform=node --format=esm --packages=external --outfile=tests/.tmp/claude-ux034/run/build/team.mjs   # y copilot-worker.ts, pilot-alias.ts
cp scripts/block-external.cjs tests/.tmp/claude-ux034/run/scripts/
PLANB_TEAM_URL=http://127.0.0.1:4361 PLANB_EVIDENCE_DIR=<carpeta> npx playwright test -c tests/.tmp/claude-ux034/run/pw.config.ts
```
`pw.config.ts` (puerto 4361, datos ficticios nuevos por ejecución, un trabajador, `executablePath` al `chrome-headless-shell` de `ms-playwright`) y `vite.base.config.ts` (línea base) están en `tests/.tmp/claude-ux034/`, fuera de las rutas reservadas. El spec lee `PLANB_TEAM_URL` (por defecto 4341, como los demás).

## Hashes finales (SHA-256)

```
224ae6509ba7d0bde634c39e0be03f9e26f2176e1b357eedc2745987c452557a  src/CustomerDossier.tsx
54901a2e3e068e9630d9158009db414a651f9e8d3acc6488ead80c1b82e31113  src/customer-dossier.css
187df1cc870a4ac3d08d28ee2902cb6b2fc6e77015370f9e7efbd7c76171afa6  tests/customer-dossier-focus.test.ts
cbafa5511901ec44196f4e436061a2c8b54e433097c25f5b96ae7464cb949c3d  tests/e2e/customer-dossier-focus.spec.ts
```
Línea base: `src/CustomerDossier.tsx` `eaa66280…2503`, `src/customer-dossier.css` `37e13fe7…5b2`.

## Qué prueba cada capa (y qué no)

- **Arnés de hooks (componente)**: estado, props y la *decisión* de recolocar el foco con un `document` simulado. **No prueba foco real.**
- **Chromium (`document.activeElement`)**: foco real, bloqueo, peticiones y geometría contra el servidor de ensayo real con datos ficticios. Retención/fallo de peticiones por `page.route`; una respuesta «perdida» tras crear de verdad en el servidor demuestra que el reintento no duplica.
- **Lector de pantalla: no comprobado.** `aria-disabled`, `aria-describedby` y el `role="status"` único son correctos por construcción, pero no los oí con NVDA/JAWS. Edge no se usó (headless-shell de Chromium).

## Límites y pendientes reales

1. **El texto «Guardando…» y el aviso de éxito están arriba de la ficha.** Quien esté desplazado hacia abajo no los ve (los avisos de fallo sí se acercan). Antes ocurría con el éxito. Una región de estado fija exigiría fijar su `top` según la cabecera del Modal compartido, que no está en mi alcance.
2. **Id de guardado tras un fallo ambiguo**: si la respuesta se pierde y la persona *edita* el texto antes de reintentar, se renueva el id (comportamiento anterior, conservado) y podría crear una segunda acción. Reintentar con los mismos datos no duplica (probado).
3. «Preparar seguimiento» sigue usando `disabled` nativo durante una operación: su botón puede perder el foco. Intencionado: el encargo pide no cambiar su comportamiento.
4. En estado `stale` solo se bloquean Completar/Reabrir; Guardar sigue disponible (no depende de versiones viejas).
5. No se ejecutó la batería completa (620 pruebas / 32 E2E) ni `npm run build`; solo las focales y los cuatro E2E previos relacionados, con el resultado indicado arriba. Sin pruebas de rendimiento ni de varios navegadores.
6. R08 global no está resuelto: este encargo cierra solo el alcance de la ficha.

Sin datos reales, credenciales, proveedores ni red externa (el spec la aborta y comprueba que no hay peticiones). Usé brevemente el panel de navegador integrado contra mi propio servidor de ensayo (127.0.0.1:4361) para localizar el perfil «Solo lectura». Los puertos 4331/4334 no se tocaron. Quedan en `tests/.tmp/claude-ux034/` artefactos de compilación y capturas (`evidence/`), sin datos personales.
