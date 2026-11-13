# CLAUDE-RELAY-EXECUTOR-224 · ranura física y ejecutor del Kit con raíz de la instalación (informe)

5/11/2026, Europe/Madrid. Misión 223, secciones 1 y 3. Archivos nuevos propios; no toca el Kit 116 ni el cwd del servidor. La API 216 R2 los consume (se revisan juntos).



## R2 (6/11/2026) · respuesta al dictamen independiente (tres defectos)
Reproducidos antes de corregir (las 4 regresiones nuevas fallaban con el ejecutor R1) y corregidos:
1. **Inventario fallido ≠ vacío.** `findByMarker` rechaza si la herramienta falla, se deniega o su salida no acaba con la señal de fin; `run()` reintenta y no se asienta hasta un inventario completo y vacío. Mientras tanto `closure()` = `unverified` y la plaza sigue ocupada (POST→DELETE→POST sigue dando «busy»). Fallo → inventario válido, fallo mantenido, cancelación y cierre probados. Pendiente para 216 (en revisión): mostrar `closure()` en el estado público.
2. **Salida.** Éxito = línea válida + código 0 (o código 1 con `ok:false` informado) sin señal. Código 17, señal, ok:true con código 1, ok:false con código 0 y falta de línea → `child-failed` con carpeta conservada y marca `partial`. Lanzador que lanza o emite `error` → `setup-failed` (y se retira la carpeta, no hubo ejecución).
3. **Raíz por destino real.** `realTarget` resuelve enlaces y uniones del ancestro existente; rechaza uniones/grafías equivalentes (mayúsculas, `.`, `..`, `/`, prefijo `\\?\`) hacia `server shared scripts node_modules src dist build tests design coordination` o la raíz del código, y `relay-rehearsals` convertido en alias. Una raíz nueva se admite; si la raíz de ensayos se sustituye por una unión después de construir el ejecutor, `run` falla (`setup-failed`) y barrido/borrado no tocan el destino ajeno (centinela intacto).
**Resultados R2:** `tests/relay-rehearsal-executor.test.ts` + `relay-rehearsal-lease.test.ts` + `relay-rehearsal.test.ts` (API 216 R2 con el Kit real): **33/33** en serie (`--test-concurrency=1`), incluida la ejecución del Kit real con el nuevo inventario de PowerShell y la cancelación con el destino abierto en otro proceso. `tsc --noEmit` sin errores en los archivos de la unidad (errores globales ajenos: `tests/task-intent-journal.test.ts`, 208). Los hijos sintéticos de las pruebas R2 solo inyectan errores; el Kit real se ejecuta en las pruebas de ciclo completo. Solo Windows; POSIX no ejecutado.
**Límites:** `tsx` sigue siendo devDependency (el paquete arrancable debe llevarlo); sin montaje ni prueba en candidata servida; sin proceso real de `findByMarker` fallido (solo doble).

## Qué entrega (R1; vigente salvo lo corregido en R2)
- `server/relay-rehearsal-lease.ts` · **RunLease**: la capacidad solo se libera cuando el ejecutor **termina de verdad**. Distingue cancelación solicitada (señal abortada, ranura «drenando»), publicación descartada (el resultado de esa ejecución no se entrega nunca) y ejecución terminada (`released`). Tiempo agotado, revocación y cierre tampoco liberan. `commit()` impide que un resultado antiguo sobrescriba uno posterior; los temporizadores se limpian al terminar, cancelar o cerrar; `close(grace)` es acotado y no finge haber drenado.
- `server/relay-rehearsal-executor.ts` + `scripts/relay-rehearsal-child.ts` · **createRelayExecutor({ installRoot, appRoot })**: corre el Kit 116 en un **proceso propio con cwd aislado** en `<installRoot>/relay-rehearsals/run-<uuid>` (carpeta nueva y marcada por ejecución; nunca la base activa, exportaciones o copias; el navegador no elige rutas). Cada carpeta contiene **copias verificadas por hash** de `server/` (sin `team`), `shared/`, cuatro scripts y `package.json`, un `tests/.tmp` propio y un enlace a `node_modules`. La contraseña ficticia se genera en el servidor y viaja por stdin (no en argumentos, entorno, salida ni estado). El entorno del hijo es una lista blanca (no hereda secretos del servidor) y se arranca con `block-external.cjs` y tope de memoria. El resultado se reduce a una lista blanca estricta. `run()` solo se asienta cuando **todo el árbol de procesos** (hijo y destino abierto en otro proceso) cerró: se comprueba por la marca de la carpeta en la línea de órdenes y se insiste hasta que no queda ninguno.
- Retención y espacio: un ensayo completado retira su carpeta; los parciales o inciertos se **conservan** (por defecto 3, 24 h), tope total 256 MiB (si se supera no arranca) y tope por ejecución 64 MiB vigilado cada 2 s (se detiene). Solo se limpian carpetas con marca verificable (formato, id = nombre, patrón, no enlace, hija directa de la raíz); los enlaces se retiran sin seguirlos; lo que no tiene marca válida no se toca.

## Pruebas (29 Node en total con 216 R2; 14 son de esta unidad)
| Garantía | Prueba |
| --- | --- |
| POST→DELETE→POST, timeout→POST, revocación→nueva sesión con ejecutor retenido: máximo 1 vivo, «drenando», se admite uno al terminar | lease (3) + API (R2·1–3) |
| Ejecutor que ignora la señal conserva la ranura indefinidamente; cierre acotado que no finge | lease |
| Resultado antiguo no sobrescribe; fallos sin detalle; temporizadores a cero | lease (3) |
| **Kit real** desde un código desplegado SIN árbol de pruebas: un create, 0 duplicados, destino en otro proceso, sin contraseña en argumentos/entorno/resultado, carpeta retirada, cero procesos | ejecutor |
| **Cancelar con el destino ya abierto** en otro proceso: la ranura sigue ocupada hasta cerrar todo el árbol; cero vivos al liberarse; parcial conservado con el hash del código | ejecutor |
| Limpieza solo de carpetas marcadas, antigüedad y tope; enlace no seguido; ajenas y marcas falsas intactas | ejecutor |
| Espacio agotado: no arranca; proceso que no muere a la primera: `run()` no se asienta hasta que no quede ninguno | ejecutor |

## Control causal
Ranura: 5 mutantes detectados (liberar al cancelar, liberar al agotar el tiempo, resultado antiguo sobrescribe, cierre que finge, temporizador sin limpiar). Ejecutor: 6 mutantes detectados (contraseña por argumento, entorno heredado, no esperar el cierre del árbol, conservar sin tope, cwd del servidor y marca ajena aceptada en **ambas** capas). **Superviviente honesto:** quitar la comprobación de marca solo en el barrido no se detecta porque `removeOwn` repite la comprobación (defensa doble); se probó el mutante que quita las dos y se detecta. Restauración por hash en cada caso.

## Límites (honestos)
- Verificado en **Windows** (taskkill /T y PowerShell/Get-CimInstance para localizar descendientes). La ruta POSIX (grupo de procesos y `ps`) está escrita pero **no se ejecutó** aquí.
- `tsx` es hoy `devDependency`: el paquete arrancable debe incluir `node_modules/tsx` (o Codex lo convierte en bundle/dependencia). `appRoot` necesita `server/`, `shared/`, los cuatro scripts, `package.json` y `node_modules/`.
- Si PowerShell no puede listar procesos, la comprobación de huérfanos devuelve «ninguno» y solo queda `taskkill /T` (se documenta; no se probó ese camino).
- Cada ensayo copia ~1,5 MB y tarda ~10 s; no se probó en la candidata servida ni con un `installRoot` real de la App. La raíz concreta (`installRoot`) y `appRoot` los decide Codex en el montaje.
- No acredita otro equipo, HubSpot real, RTO/RPO ni autoría.

## Hashes finales R2 (sha256)
| Ruta | sha256 |
| --- | --- |
| server/relay-rehearsal-lease.ts | 883e38d33bedc3077518495d6a4fd12cd1a1e017bcddd85c0d7adfc949b8dbb9 |
| server/relay-rehearsal-executor.ts | 5d8310a8a24a7934f7e42fc01bbf749626808d4c751a9c7e85d0e46f79fd5378 |
| scripts/relay-rehearsal-child.ts | 5ea7c634cd388ad206cc17e61ce3b19f06d691ed1649c24cba3169c7380dc2d8 |
| tests/relay-rehearsal-lease.test.ts | 4f25da35c0b11e40939d140d77caac7be8b2fee8c18f7b2f931c77319528ae77 |
| tests/relay-rehearsal-executor.test.ts | 73d86728b571d76698ad3fe93eab230f997a8943c8511d6609bfc0cab925a265 |
| coordination/plans/RELAY-EXECUTOR-224-HANDOFF.md | 2894485dcdf75aa5dc5751182eed99e6c3ee6832c1796befe2a762d52631e283 |
| coordination/reports/CLAUDE-RELAY-EXECUTOR-224.md | (este informe) |
Procesos propios: servidores de prueba, proveedor ficticio y navegadores cerrados con cada ejecución; las pruebas del ejecutor dejan cero procesos del Kit (ver pruebas).
