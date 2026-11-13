# A4 · La ficha conserva la huella de la copia que revisó

11 de noviembre de 2026, Europe/Madrid. Entrega 334 de Codex. Corrige los dos casos del dictamen independiente 332.

- La ficha toma `contextRevision` del mismo estado que describe la copia y verifica instalación, identificador, fecha, cuenta y modo ficticio. Una copia activa con metadatos contradictorios devuelve «copia cambiada». Un servidor anterior que omite la huella sigue funcionando con su identidad pública.
- El cliente compara la huella junto a los seis campos públicos al abrir, antes de guardar y al comprobar un acuse perdido. Si desaparece una huella ya observada, se detiene antes de enviar. Se conserva la clave de agrupación del historial.
- La ficha en 329 aplica la misma comparación al releer un acuse compacto y al recibir la lectura del comparador de conflictos. Si la procedencia cambió, conserva el acuse o el borrador y deja la ficha fuera de edición en la copia nueva.

## Evidencia

| Banco | Resultado |
| --- | --- |
| pin334-rehash-Jk1KRZ, 368 entradas | 131/131 Node, sin omitidos, y TypeScript limpio. Incluye 332 sin cambios, la prueba nueva de 334, tres guardias de huella y la suite contextual que sustituyó 183 en la entrega aceptada 185. |
| pin334-full-tpPJmw, 367 entradas | 47/47 Chromium y TypeScript limpio. Node pasó las 114 pruebas de comportamiento y detectó las tres huellas antiguas. La suite posterior confirmó las huellas nuevas. |
| pin334-ui-control-cvXghS, 367 entradas | Falló el único caso de navegador al restaurar solo la comparación de seis campos en la relectura. Con la fuente final la misma prueba mantiene el acuse y el editor cerrado. Se restauró y cotejó la fuente experimental. |

El caso nuevo de Chromium usa SQLite ficticia, el servicio A4 real y una estrategia de prueba que envía la huella observada por la ficha. Importa y activa otra captura con las mismas identidades visibles después de confirmar. La relectura indica que cambió la copia y el recuento de escritores sigue en dos. La prueba cubre la ficha y su gestor. La rama nueva del comparador se validó por tipos y revisión de código, sin sonda de navegador dedicada.

El banco histórico `pin334-rehash-L4ldpp` pasó 130/131 con 183 sin su actualización. La expectativa obsoleta era que un cambio de generación en el transporte permitiera el PATCH. La ruta de revisión de 185 ya devuelve conflicto en esa ventana y su prueba aceptada exige ese comportamiento. Ninguna prueba histórica se editó.

## Relevo de integración

El cliente A4 de Claude recibe una función `contextRevision(context)`. Para guardar y verificar debe devolver la huella observada en `context.contextRevision` solo si sigue siendo válida para el ámbito vigente, o devolver `null`. Resolverla solo por los seis campos visibles podría volver a asignar a una operación la huella de otra copia. El servidor mantiene el chequeo de ámbito al tramitar la intención. Falta conectar esta estrategia y verificar el recorrido completo desde Hoy, incluido el reinicio con acuse compacto. Las lecturas sucesivas no forman una transacción. No se editó la estrategia de Claude ni se actualizó el paquete abierto en 4601.
