# Almacenamiento A4 310 · revisión independiente 313

9 de noviembre de 2026, Europe/Madrid. Codex coordinador revisa la implementación del otro chat Codex. **Dictamen: aceptar 310 con el alcance y baseline indicados.** No es aceptación de API, montaje, cobertura general o ejecución multiproceso.

## Código y verificación

Las cuatro rutas coincidían con su presentación antes y después del banco. Código `server/task-intent-claims.ts`: `c5cab43ae0d4f08938184f722b213a79dae2e384837f11b36798e1da8519912c`; pruebas originales `22e756948e0b3e11c380a825613aaa075a8199885a5d8f24c00cdc07417a6301`; contrato `0ab8eba95aabfbcdb5a9b6411fd3214291b5d5e5fd7556b15325abf786a7cdfe`. No se editaron estas rutas.

Banco propio `tests/.tmp/claims313-E7aOOe`: una ejecución **76/76**, cero omitidos, 56.314,7725 ms, tipos focales **exit 0**. Son 19 originales de 310, 53 regresiones del diario/almacenamiento 208 y cuatro pruebas independientes nuevas. `manifest.json` conserva hashes, dependencia histórica pendiente y presentación revisada; `run.mjs`, `result.json`, `node.log` y `types.log` reproducen y documentan la ejecución. Sin navegador, credenciales, proveedores ni cambios en 4601.

Las pruebas originales ejercitan SQLite real, atomicidad de claim/raw/índice/época, fallos de escritura y relectura, CAS, límites físicos, guardia original, cifrado en archivo, cierre/reapertura y tombstones. Los límites masivos usan fixtures coherentes directas: esta revisión no los convierte en un benchmark o en miles de operaciones desde App. No repetí las tres mutaciones del autor; se revisó su evidencia separadamente.

## Cuatro sondas propias

1. Dos diarios 208 compiten por el mismo ID mientras el envío primero está retenido. El segundo no despacha, no cambia filas y una instancia de diario recreada clasifica sin escribir. Recuento final: un callback de envío. Es recreación de objeto, no reinicio de proceso.
2. Se pierde el acuse de COMMIT al liquidar, después de conservar un recibo no-op. El módulo declara `commit-uncertain`; la lectura conserva `acknowledged`, `changed:false` y su revisión. Repetir liquidación con el raw anterior produce conflicto y cero cambios.
3. Un parche que no coincide con la huella no inicializa ninguna fila. Un lookup con cuenta null en vez de vacía devuelve exclusivamente `wrong-scope`, sin incluir el recibo.
4. Los metadatos y el acuse se proyectan al esquema público 311 R2 aceptado antes y después de retirar explícitamente el detalle. Se conserva la confirmación sin reconstruir el registro de tarea; el lookup pasa a expired y el raw desaparece.

Estas sondas cuentan llamadas de diario y filas de `meta`, no PATCH HTTP ni cambios de tarea. No hay escritor de tareas en este módulo.

## Baseline y límites que siguen abiertos

El banco copia los bytes de dependencias congelados del banco final 310 y los verifica por hash. `shared/recovery-integrity.ts` (`aa9f3456…`) y `shared/operations.ts` (`a2412f47…`) son dependencias históricas de Store procedentes del banco 298. La unidad 087 sigue en revisión: **esta aceptación no la acepta ni elimina su puerta antes del montaje**. Los dos archivos constan en `pendingBaseline`. No se adoptaron ediciones working de otros agentes.

El módulo no valida autorización HTTP: la guardia suministrada debe capturar el permiso y contexto originales. La API debe filtrar sus metadatos por ámbito antes de publicarlos. El recibo compacto debe proceder del escritor real, no del cliente. La transacción de reclamos no engloba `Store.saveRecord`; el hueco tras aplicar y antes de liquidar sigue pudiendo dejar incertidumbre. La exclusión de procesos depende del candado de instalación. Una restauración externa coherente antigua no se detecta por esta lógica.

## Siguiente entrega

Codex coordinador implementará el servicio y las rutas A4 bajo una nueva reserva, consumiendo 310 y 311 aceptadas. La aceptación humana debe conservar evidencia y liquidación en una sola mutación, con revisión de tarea/secuencia/permiso comprobadas en la frontera síncrona de escritura. El montaje en main/App, el cliente de Claude A y la QA de los cuatro cortes siguen pendientes; `covers:false` no cambia por esta revisión.
