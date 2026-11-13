# Revisión independiente de la demo 4601

7/11/2026, Europe/Madrid. Este chat Codex revisa las unidades 278, 279, 280 y 281 del otro chat Codex. Dictamen: **aceptables dentro de su alcance local de ensayo**. No equivale a cerrar la candidata conjunta de la Fase 0.

## Procedencia comprobada

La composición `tests/.tmp/preview279-g1Cnt7/result.json` identifica 163 fuentes y diez incorporaciones aceptadas por hashes en el tablón. Se comprobaron todos los archivos de fuente y esos diez estados `done`. También se verificaron los 3623 archivos de runtime del recibo 278 que no pertenecen a `dist`, incluido el binario principal y el Kit. Los 15 activos actuales coinciden con el manifiesto tanto en disco como en sus respuestas HTTP 200. La UI anterior permanece archivada.

La salud devuelve la misma instancia `3cb33118-1596-44cc-b78a-b2961615f4ff`. El informe 278 distingue correctamente que la instalación nueva no tiene contraseña configurada y que su lectura de relevo vacía responde 200. Las comprobaciones 401 con contraseña corresponden al banco independiente 277, no a este arranque.

## Repetición independiente

Script propio `tests/.tmp/review-preview279.cjs`, resultado `tests/.tmp/preview279-independent-ci003o/result.json`. Chromium aislado con bloqueo de tráfico externo y de toda petición modificadora. Se recorrieron Continuidad, Integraciones y Hoy. En Continuidad se desplegó «Sin comprobar» para verificar que la acción de ensayo existe dentro de su grupo. No se inició el ensayo ni una comprobación externa.

La ficha de `task-2` generó una única petición a `/api/v7/task-revision/task-2`, con revisión esperada y solo el campo de notas modificado. Se interceptó antes de salir y se devolvió un 422 ficticio. Después de cerrar la ficha, «Por decidir (1)» respondió a Enter, conservó el foco y `aria-pressed`, y mostró el rechazo junto al ID exacto. Las comprobaciones a 1440, 390 y 320 px no detectaron desbordamiento horizontal. Se abrió e inspeccionó la captura de 320 px en resolución original; las otras dos quedaron generadas sin inspección visual en esta revisión.

Recargar retiró el resultado efímero. Hubo cero peticiones modificadoras enviadas al servidor, cero peticiones externas y cero errores de página. El único HTTP >=400 fue el 422 simulado. El digest canónico de todas las tablas SQLite permaneció en `e4dfc6626500435ac1eed420cd39dc2c2f669add8d2aaec05bb1a83571268aea`. El navegador terminó y la App quedó abierta en `http://127.0.0.1:4601/`.

El primer intento propio, raíz `preview279-independent-ZXZQYE`, se detuvo al buscar la acción de ensayo sin abrir el grupo plegado. No llegó al guardado simulado. Se corrigió el recorrido de navegación del script y se repitió en una raíz nueva; no se modificó el producto ni se eliminó el primer intento.

## Límites

No se repitió un guardado aplicado 200 sobre esta instalación ni se realizaron escrituras a proveedores. Los bancos de A2 y 277 conservan esas otras evidencias con datos ficticios. Este corte sí muestra la ficha condicionada, «Por decidir» y la entrada al ensayo de relevo. Jornada, recuperación duradera de intentos y Radar siguen pendientes de montaje. La instalación no ejecuta agentes de IA en segundo plano. No se reinició ni se detuvo su servidor durante la revisión.

Se revisaron las cuatro presentaciones exactas del tablón antes de aceptarlas. Este dictamen queda presentado para revisión del otro Codex; su autor no se autoacepta.
