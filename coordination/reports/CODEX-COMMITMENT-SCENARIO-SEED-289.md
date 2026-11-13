# 289 · Conservar el escenario del Radar entre reinicios

8/11/2026, Europe/Madrid. Codex. Entrega interna presentada para revisión independiente; no autoaceptada ni montada en main/App/demo.

## Comportamiento

Nuevo `server/commitment-scenario-seed.ts`: inicialización explícita de una semilla del escenario multisistema286 en Store.meta, marcador estricto cifrado por el soporte existente. La primera inicialización guarda instante, revisión del conjunto, versión e instalación. Las posteriores leen el mismo conjunto sin consultar el nuevo reloj ni reescribir la fila. `readCommitmentScenarioSeed` nunca inicializa.

Resuelve la causa concreta de que las decisiones desaparezcan de la vista al generar fechas nuevas en cada arranque: el diario de compromisos ya se liga al hash del dataset. No cambia ese diario ni traslada decisiones entre copias. El reloj actual sigue envejeciendo las observaciones. Una copia de producción, identidad ausente, marcador null/corrupto/de otra instalación/revisión incompatible o soporte fallido dan indisponibilidad fija; se conservan bytes e historial. No hay renovación ni recuperación silenciosa.

El contrato en `coordination/plans/COMMITMENT-SCENARIO-SEED-289-CONTRACT.md` explica su consumo y el hueco central todavía pendiente: el backend actual recibe un dataset estático y el montaje debe acordar activación explícita/provisión cuando la app arranca sin copia activa. Esta entrega no inventa una inicialización con escrituras en GET ni promete un montaje que todavía no existe.

## Verificación positiva

Banco fijo **`tests/.tmp/scenario289-xW60Ja`**, script `tests/.tmp/verify-scenario289.cjs`. Copia de fuentes transitivas de TypeScript, más `server/instance.ts` cargado dinámicamente por el worker, con manifiesto; escenario286 aceptado y sus tres huellas intactas. Entorno mínimo, claves de ensayo nuevas y datos inventados, sin red externa.

**20/20 Node** sin reintentos, omisiones o cancelaciones,17,17s: doce casos propios y ocho existentes del escenario. Tipos focales limpios de ambos archivos y sus dependencias; no un nuevo typecheck global.

Los doce casos cubren lectura ausente sin escrituras; alta única constante y reloj posterior ignorado; copia inactiva/producción/identidad ausente; reloj inválido; null/versión/instalación/hash/forma inválidos conservados; cifrado ilegible preservado; fallo después de set con rollback transaccional; contexto cambiado durante reloj; archivo cifrado y reinicio exacto; cambio entre copias y vuelta; API real con asignación y reinicios A→B→A; candado de instancia y dos procesos cooperativos reales.

En el recorrido API, una decisión persiste al reiniciar con reloj actual distinto usando la semilla. El control que vuelve a generar el conjunto con el reloj nuevo hace desaparecer ese historial de esa revisión; al volver al conjunto persistido reaparece. La evidencia se vuelve stale al avanzar25h, en lugar de rejuvenecer. La lectura de fichas conserva todas las tablas. El caso de dos procesos acredita rechazo del segundo por el candado existente y conservación de semilla por un proceso posterior, no acceso concurrente sin candado.

La consulta CIM limitada a la raíz exclusiva del banco no encontró procesos vivos después del cierre esperado de los workers. No se arrancó navegador ni se reinició4601.

## Sensibilidad

`tests/.tmp/causal-scenario289.cjs` ejecutó cuatro mutaciones **solo sobre la copia privada** y focalizó casos del banco, sin cambiar expectativas:

| Mutación | Resultado |
| --- | --- |
| Ignorar marcador existente y regenerar en cada inicialización | Fallan las regresiones de reinicio/lectura con otro reloj |
| Admitir UUID de otra instalación | Falla marcador incompatible |
| Confiar en revisión aunque el generador difiera | Falla marcador incompatible |
| Permitir copia de producción | Falla puerta de ficción |

Cada proceso devuelve1por la aserción esperada. La selección por nombre deja casos no seleccionados fuera de esos pases causales; no se presenta como cuatro bancos completos. Los originales privados y fuentes del checkout se restituyeron/cotejaron por hash; causal-result.json registra cuatro detecciones yrestoredtrue. El banco completo positivo anterior probó el mismo corte exacto.

## Intentos conservados y correcciones del arnés

- `scenario289-IITTqK`:18/20,tipos0. Dos fixtures propios se marcaban como producción sin cumplir formato v3STANDARD, así que Store los rechazaba antes de llegar al helper. Se corrigió el fixture ficticio de política, conservando el rechazo esperado del helper. No hubo cuenta o datos reales.
- `scenario289-WndjPu`:19/20,tipos0; worker sin respuesta. La copia aislada había omitido la dependencia dinámica server/instance.ts al retirar su import estático sin uso en el test. El diagnóstico inicial no capturaba salida del hijo.
- `scenario289-8OzjIY`:19/20,tipos0; el diagnóstico mejorado registra ERR_MODULE_NOT_FOUND del mismo módulo, confirmando la preparación incompleta. Se añadió ese archivo explícitamente al manifiesto, sin cambiar el candado de producto ni sus expectativas. El worker ahora vacía el mensaje IPC antes de salir y conserva errores de arranque.
- `scenario289-xW60Ja`:20/20 y tipos0, corte final. Estos intentos no se borraron ni se declararon todos verdes.

## Huellas de código y contrato

| Archivo | SHA-256 |
| --- | --- |
| server/commitment-scenario-seed.ts | 98bc0ebc20649eda5af34e53b7e8676f15277e26f763fe54196b037363c1f57b |
| tests/commitment-scenario-seed.test.ts | bd58f78b75d28fc117b884c8b5b47a1313ae2b2a08b7c744cddec1112a33f4f5 |
| coordination/plans/COMMITMENT-SCENARIO-SEED-289-CONTRACT.md | dd8a1b6b95c2c05cdb913ec31033becb8b36bc45ca6b6f57943c57d0211f3de6 |

El tablón registra también la huella de este informe. Reservadas únicamente estas cuatro rutas. No se tocó código de Claude, marcador de una instalación existente, main/App, ZIP271, demo288, clientes/proveedores ni cuentas.

## Límite y siguiente paso

El helper no autentica ni autoriza HTTP por sí solo. Se ofrece al instalador local, bajo candado; el montaje mantiene la seguridad y las puertas de copia de la API existente. Una clonación privilegiada que copie UUID/base/clave no se detecta como otra instalación física. Cambiar el generador requiere un encargo de migración, no adoptar automáticamente nuevos datos. Un marcador corrupto no se recupera aquí. Memoria no es durabilidad de archivo.

Siguiente: revisión independiente de las cuatro huellas; después, consumo por `CODEX-COMMITMENT-RADAR-MOUNT` junto con UI/Jornada aceptadas y prueba de App normal. A4 y cobertura del cuaderno de guardados siguen en otro encargo del coordinador; una semilla del Radar no habilita covers:true. JornadaA3 ha pasado a review durante esta entrega y se revisará por separado.
