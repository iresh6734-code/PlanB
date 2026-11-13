# CLAUDE-IMPACT-MAP-215 · Mapa de impacto y resumen de turno (informe de entrega)

5/11/2026, Europe/Madrid. Modelo, componente, exportación y pruebas; **sin consumidor montado** (ver `coordination/plans/IMPACT-MAP-215-HANDOFF.md`). Sin llamadas externas: evidencia de copia del servicio REAL de continuidad, cola y comparación con los contratos REALES (`buildResponseQueue`, `compareCaptures`) sobre una ficción.



## R2 (6/11/2026) · respuesta al dictamen independiente
Los tres hallazgos se reprodujeron con el código R1 (cuatro regresiones nuevas fallaban; los 13 casos previos seguían verdes) y se corrigieron:
1. **Vigencia efectiva de la lectura de HubSpot.** La fila, la acción, el resumen y la exportación derivan de `readWindow` (la misma regla del pasaporte 214) con el reloj del mapa, no de `view.fresh` del instante de la respuesta. Límite exacto = vigente (`now > freshUntil` caduca); reloj o ventana inválidos = desconocida (`unknown`, nunca vigente); una comprobación en curso es un estado aparte (no caducidad) y ofrece abrir Integraciones. La respuesta antigua conserva fecha y alcance. Regenerar el mapa con otro reloj no pide nada al proveedor (la entrada no se modifica).
2. **Un solo dictamen del ensayo.** `evaluateRelay` produce el estado, la vigencia y la acción que usan fila, resumen y exportación. Ambos lados del umbral, fecha inválida y reloj inválido probados.
3. **Ensayo ficticio con alcance propio.** Un registro con `scope: 'fiction'` se muestra en su propia fila (`recovery:practice`, contexto `null`, sin acción si está completado, «no acredita la recuperación de la copia activa») y nunca se rellena con la captura activa ni se trata como «datos de otra copia». Se mantienen aparte: alcance desconocido (sin captura ni procedencia: `unknown`), otra copia identificada (fila `other-context:relay`) y evidencia ligada a la captura exacta de la copia activa. El resumen termina con «no está demostrado: recuperación de la copia activa con sus datos…» salvo ensayo ligado completado.
Cambio de contrato de pruebas: el ensayo «ligado» de las pruebas previas ahora lleva `captureId` = contexto activo (antes `null`, que es justo el caso ambiguo que el dictamen señaló).
**Resultados R2:** Node `tests/impact-map.test.ts` 17/17 (4 nuevos), DOM Chromium 1228 headless-shell `tests/e2e/impact-map.spec.ts` 5/5, `tsc --noEmit` sin errores en los archivos de la unidad (errores globales ajenos: `tests/task-intent-journal.test.ts`, 208). **Control causal:** las 4 regresiones R2 fallan con el código R1 (log en la sesión) y pasan con R2.
**No cubre:** montaje; el mapa sigue sin consumidor propio (lo consume ContinuityHub 217).

## Qué entrega (R1; vigente salvo lo corregido en R2)
«Qué podría impedir que sigamos trabajando»: filas por área (copia, antigüedad, cobertura por entidad, referencias sin comprobar, trabajo local, cola, acceso a HubSpot, exportación, ensayo de relevo, cambios entre capturas) con estado (bloquea / atención / sin comprobar / sin incidencia), base, vigencia, instante, límites y la superficie existente que abre o qué acción falta; más un resumen de turno generado solo con lo acreditado y exportación breve HTML/JSON (plan de relevo + enlace local relativo).

## Pruebas
| Garantía | Prueba |
| --- | --- |
| Contratos reales: cobertura observada por entidad, antigüedad, comparación, recuperación | Node |
| Datos ausentes ⇒ desconocido (no cero); cero observado ≠ desconocido | Node |
| Referencias sin comprobar desde la cola real; jamás «borrado» | Node + DOM |
| Sin copia utilizable bloquea y la primera decisión es prepararla; copia antigua = atención | Node |
| Otra captura no se mezcla (se excluye y se declara; sin contexto activo no se acepta ninguna fuente contextual) | Node + DOM |
| Trabajo por comprobar / borradores / cuaderno ilegible; sin IDs ni valores | Node |
| Acceso a HubSpot caducado, producción no autorizada, ensayo antiguo o fallido | Node |
| Orden por urgencia, decisión urgente primero, plan de relevo accionable, determinismo | Node |
| Fila sin acción explica qué falta | Node |
| Exportación por lista blanca (claves exactas), texto hostil/rutas/claves y enlaces externos fuera, HTML escapado con CSP | Node + descarga real |
| Presentación, 1440/390/320 sin desbordamiento, ≥ 44 px, teclado | render de servidor + DOM |

## Resultados
- `tests/impact-map.test.ts`: **13/13**. DOM Chromium `tests/e2e/impact-map.spec.ts`: **5/5**. `tsc` sin errores en los archivos de esta unidad (el análisis global tiene un error ajeno en `tests/task-intent-journal.test.ts`, de otra sesión).
- **Control causal con 6 mutantes** (restaurado con hash idéntico): otra copia mezclada, referencia como «borrado», cero por desconocido (2), sin explicación si falta acción (tras añadir un caso que lo ejerce), sin orden de urgencia, enlace externo aceptado ⇒ todos detectados.
- Capturas abiertas e inspeccionadas: `impact-1440`, `impact-320` (`tests/.tmp/im215-r1/`; también 390).

## Límites
Sin consumidor montado; el inventario y `expectedContext` los define el consumidor; no acredita el estado actual del CRM, otro equipo ni tiempos; depende de tipos del pasaporte 214 (en review).

## Hashes finales R2 (sha256)
| Ruta | sha256 |
| --- | --- |
| shared/impact-map.ts | a44cb50f6d46a086848b7830dd11de4a4548dac455b1eecf84e82eca55545232 |
| src/ImpactMap.tsx | 7bcbce55db5fcd27e979fc3d58feba195b5c21a7d2ab9b6569cf6c04cf485082 |
| src/impact-map.css | 86d8c369300ee9c9074feccf10fa65032e0c802a90dea898ec2029fe8aec5dae |
| tests/impact-map.test.ts | 3b39470f244c8536c92ada26466f4dd2ac1c9a6b218f943ffac518cb4c46d0d2 |
| tests/e2e/impact-map.spec.ts | 54a0cd5846f706d4541fb46290f9cee0f1f69bfb89ca6fda76c5d9d97a137662 |
| coordination/plans/IMPACT-MAP-215-HANDOFF.md | a63fc08edef5fffd8f66b45a8e6236b5f5e799f8f02a11563b44dde3d045219b |
| coordination/reports/CLAUDE-IMPACT-MAP-215.md | (este informe) |
Procesos propios: servidores de prueba, proveedor ficticio y navegadores cerrados con cada ejecución; las pruebas del ejecutor dejan cero procesos del Kit (ver pruebas).
