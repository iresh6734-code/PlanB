# CLAUDE-TASK-D7-BASELINE-153 · Línea base de D7 en la App real

3/11/2026 (Europe/Madrid). Agente: Claude. Entrega para revisión de Codex; no aceptada. **Solo pruebas e informe**: dos archivos nuevos, sin tocar `App.tsx`, `LocalOperations.tsx`, `LocalTaskFocus.tsx`, el gestor 136, U1-148, 151 ni 128.

## Por qué existe

136 (gestor + superficie) y U1/U2 prometen cerrar D7, pero hasta ahora D7 solo se había demostrado con la ficha en un arnés. 140 declaró el límite («cerrar la ficha con PATCH en vuelo y perder el acuse deja sin aviso posterior») sin una prueba en la App. Esta unidad mide **qué ve hoy la persona en la App real** y deja las aserciones que el montaje (U2) tendrá que invertir. Es la contraprueba causal que pedía el encargo: «la prueba de D7 debe fallar frente al montaje anterior por la falta de seguimiento y pasar con el montaje completo».

**No es** una prueba del gestor, de U1 ni de U2, y **no declara cerrado D7**.

## Cómo se hizo

- **Copia congelada del cliente.** Otras unidades (151 y después) editan `App.tsx`/`LocalOperations.tsx`, así que el spec copia `src`, `shared`, `public`, `index.html`, `package.json` y `tsconfig.json` a `<root>/frozen`, calcula el SHA-256 de cada `.ts/.tsx/.css/.html/.json` y **comprueba contra el original que ninguno cambió durante la copia** (si cambió, aborta). `manifest.json` conserva los hashes. Corte de esta ejecución (3/11/2026 08:02 UTC): `App.tsx` `0613d3a87f65c19f…`, `LocalOperations.tsx` `13bde436302ffdcf…`, `LocalTaskFocus.tsx` `aefb63df80bf9e61…` (los mismos que tenía el checkout al terminar la ejecución). **Atribución corregida tras la revisión 154:** el `App.tsx` `0613d3a87f65c19f…` (completo `0613d3a87f65c19fd63ac045668f6f94c0a61c540ada789979a7b4226d403aa1`) es el corte **con la corrección de 151 ya incluida**, no uno anterior; el `App.tsx` previo a 151 es `b3152438de3e580feed1342022aa37a6881ac1843031fbec6fc99ef104ac2782` (B315…) y no es el que se probó. La aceptación de 151 por el tablero fue posterior a la congelación. El `App.tsx` actual del checkout ya difiere (cambios posteriores, p. ej. 155/158); esta línea base no los cubre y no se ha repetido sobre ellos. No cambian fuentes ni aserciones del spec: no se repiten los seis recorridos.
- **App real**: la copia se compila con Vite (`vite build`, carpeta propia) y se sirve con el `createBaseApp` real (SQLite en memoria, datos ficticios, red externa bloqueada con `scripts/block-external.cjs`, puerto efímero, proceso hijo propio). El código de servidor es el vivo del checkout, no una copia congelada.
- **Barreras** sobre `page.route`: se deja pasar el PATCH al servidor real y se retiene/pierde su respuesta.

## Observaciones (App real, estado actual)

| # | Escenario | Qué se observa | Qué debe invertir U2 |
| --- | --- | --- | --- |
| 1 | Completo `task-2`, el PATCH se aplica, cierro la ficha («Salir de todos modos») y el acuse se pierde | La ficha **sí** avisó antes de salir («Hay un guardado en curso…»). Tras cerrar: el servidor tiene la tarea `completed` (1 PATCH, 1 cambio) pero **Hoy sigue ofreciendo la fila** (cola vieja) y **no hay ninguna mención** a guardado, incertidumbre o comprobación | Superficie montada: «No se sabe si se guardó…», «Comprobar ahora», sin reenvío |
| 2 | Igual, luego navego a Agentes y vuelvo a Hoy | Volver recarga la cola: la fila desaparece (estado real) **pero sin explicar** qué pasó con el guardado incierto | El seguimiento debe sobrevivir a la navegación y explicarlo |
| 3 | El PATCH confirma **después** de cerrar la ficha | La cola **sí** se refresca sola (la ficha avisa a Hoy aunque esté cerrada): la fila desaparece. **No hay confirmación visible** | Mostrar «Guardado confirmado…» sin segundo PATCH |
| 4 | PATCH confirmado y la recarga de la cola falla (503); cierro la ficha | Dentro de la ficha se ve «la cola de Hoy no se actualizó»; **al cerrarla el aviso desaparece** y la fila de una tarea ya completada sigue en Hoy, sin aviso | El fallo debe seguir visible fuera de la ficha con «Reintentar la actualización» (solo lectura) |
| 5–6 | El estado engañoso de (1) a 390 y 320 px | Cabe en pantalla (sin desbordamiento horizontal) y sigue sin aviso | — |

Conclusión acotada: en la App actual D7 está abierto en tres puntos —(1) fila obsoleta sin aviso, (2) recuperación silenciosa por navegación, (4) fallo de recarga que se pierde al cerrar—; el caso (3) está mitigado parcialmente por 123/140 (la cola se refresca) pero sin confirmación a la persona.

## Pruebas y resultados

Node v24.14.0, Playwright 1.64.1, chrome-headless-shell 1228 (Chromium sin perfil), 1440 y 390/320.

```powershell
$env:PLANB_D7BASE_ROOT="<repo>/tests/.tmp/d7baseline153-f425f774-9c1c-489c-ad79-000cb69fa69c"
npx playwright test -c "$env:PLANB_D7BASE_ROOT/pw.config.ts"                         # 6/6 (dos ejecuciones seguidas: 6/6 y 6/6)
$env:PLANB_D7BASE_MUTATE="notice"; $env:PLANB_D7BASE_ROOT="<otra carpeta>"; npx playwright test -c "<config>"   # 0/6: sensibilidad
```

- **Sensibilidad (contraprueba)**: con `PLANB_D7BASE_MUTATE=notice` el spec inserta en la copia congelada de Hoy un aviso «No se sabe si se guardó: seguimiento simulado» (no existe en el producto). Las **6 observaciones fallan** por la causa correcta (`mentions` ya no está vacío); sin mutar, pasan 6/6. Es decir: las aserciones detectan un Hoy que sí muestra seguimiento. **No se ha probado todavía que fallen contra el montaje real de U2**, porque aún no existe.
- Primer corte: la primera observación se ejecutó sola para validar que la App congelada arrancaba (1/1); después se añadieron las otras cinco registrando valores antes de fijar aserciones. No hubo fallos de producto.
- `tsc`: sin errores atribuibles al spec.

## Capturas

`<root>/d7-1440.png` y `d7-320.png` **inspeccionadas por mí**: Hoy lista «Llamar a Ana · Más adelante · 2026-11-05» aunque el servidor ya la tiene `completed`, y sin aviso alguno. `d7-390.png` **no inspeccionada** (cubierta por la aserción de desbordamiento).

## Hashes

| Archivo | SHA-256 |
| --- | --- |
| tests/e2e/task-d7-real-app-baseline.spec.ts | 10e077c2be5e10c0788873d4fc833f574bacaec035ca68646ef52f3fe1c7010c |

(El informe lo hashea el `submit`.) Procesos propios cerrados: 0 `node` con `d7baseline153`/`server.mts`. Carpeta propia (git la ignora): `tests/.tmp/d7baseline153-f425f774-…/` con `frozen/`, `dist/`, `manifest.json`, config, capturas y `mut-notice/`.

## Límites

- Son **observaciones del estado actual**, no una especificación: si 151 u otra unidad cambia `App`/`LocalOperations`, hay que **refrescar la congelación** (el test lo hace en cada ejecución, pero las aserciones podrían dejar de describir la realidad y entonces fallarán, lo cual es la señal correcta).
- Un solo escenario de tarea (`task-2`, estado → completada), un navegador (Chromium headless), sin otros navegadores, lector de pantalla ni equipos. El servidor es el vivo, no congelado.
- La detección de «aviso» usa una expresión regular sobre el texto de Hoy (`incierto|No se sabe|se guard|guardando|cola de Hoy no|comprobar`); un aviso con otras palabras no se detectaría. La mutación demuestra que detecta el texto previsto, no cualquier aviso posible.
- No se prueba ni se promete persistencia tras recargar, concurrencia entre pestañas ni 128.

## Siguiente paso

Cuando 136 pase a `done` → reclamar U1-148 (ficha delega en el gestor). Cuando U1 esté aceptada y 151 libere `App.tsx`/`LocalOperations.tsx` → unidad U2 de montaje: **invertir las aserciones marcadas «U2 DEBE INVERTIR»** de este spec y mantener las pruebas de 140. Coordinación: sin canal directo operativo con Codex (el servidor `codex` no conectó); el tablero es el aviso y no hay prueba de que se lea.
