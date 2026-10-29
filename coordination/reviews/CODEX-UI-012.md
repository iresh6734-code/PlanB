# CODEX-UI-012 · QA independiente del prototipo `workspace-v2`

29/10/2026, Europe/Madrid. **Ejecutado por Claude (Sonnet 5.5) por delegación expresa del usuario**, que autorizó hacer el trabajo de Codex porque Codex no puede trabajar. Esta revisión la hace el mismo agente que escribió `CLAUDE-QA-013` y verificó el estado de `CLAUDE-UI-010`, no un revisor ajeno a ambos; las comprobaciones son mediciones en navegador, no juicios. Registro de la delegación: `coordination/reports/DELEGACION-CLAUDE-COMO-CODEX-2026-10-29.md`.

## Qué se probó y cómo

- Prototipo: `design/claude/workspace-v2/index.html` abierto por `file://` en **Chromium headless propio de Playwright (1228)**, perfil nuevo, sin cuentas, con las peticiones no locales abortadas y registradas. No se tocó el piloto, `build/` ni `dist/`.
- Versiones (SHA-256, 16 primeros): `index.html` 859e7496c91c8a55 · `styles.css` b3529fa18c1ace64 · `app.js` e8782df118db7f88 · `README.md` a8da5d1c9fcb574f · `components.md` 9302e5435a50f9e9 · `tests/workspace-v2-state.test.mjs` 1eb5359b7bc140ef. `CLAUDE-UI-010` sigue en `working` (otra sesión Claude); no se aceptan sus archivos aquí.
- Script de QA: `tests/.tmp/qa-ui012/run.mjs` (ignorado por Git, no versionado) y capturas en `tests/.tmp/qa-ui012/out/` (también sin versionar).

## Resultados (medidos)

| Comprobación | Resultado |
| --- | --- |
| Identidad: título «… (prototipo)», franja «Prototipo de interfaz · sin conexión a servicios», pie con el mismo aviso | Correcto |
| Estado inicial vacío sin clientes, correos ni textos de muestra | Correcto |
| Seis escenarios disponibles (Vacío, Carga, Error, Solo lectura, Origen desactualizado, Datos de muestra) | Correcto |
| Vistas Hoy, Comercial e Integraciones con contenido en «Datos de muestra» | Correcto |
| Consola del navegador y excepciones de página | 0 errores |
| Peticiones no locales | 0 |
| Desbordamiento horizontal a 1440, 900, 390 y 320 px (3 vistas × vacío y muestra) | Ninguno |
| Seleccionar cliente → «Preparar seguimiento» → rellenar → «Guardar borrador local» → casilla de revisión habilitada → «Marcar revisión local» → mensaje «no se ha enviado nada» | Correcto |
| Editar el asunto después de revisar marca «Cambios pendientes» e invalida la revisión (aviso visible) | Correcto |
| Ficha lateral abre como `dialog`, Escape la cierra y el foco vuelve a «Abrir ficha» | Correcto |
| Contraste texto/fondo de 74 botones y enlaces visibles (cálculo WCAG sobre estilo computado) | Mínimo 6,01:1; ninguno bajo 4,5:1 (se incluyeron los deshabilitados en la medición y se excluyeron del mínimo) |
| Capturas revisadas a mano: 1440 con borrador, 390 en Comercial | Composición coherente, sin solapes ni cortes de texto |

`CLAUDE-QA-013`: `node --test tests/workspace-v2-state.test.mjs` → 98 pruebas, 89 correctas y 9 `todo` (las contradicciones documentadas), 0 fallos.

## Hallazgos

1. **Objetivos táctiles de 22×22 px** (6 casillas visibles a 390 px, p. ej. las de acciones externas deshabilitadas y «Crear una acción interna…»). El criterio del plan de colaboración es 44 px. **No se midió el área clicable de la etiqueta que las envuelve**, así que puede estar cubierto; falta esa medición.
2. **Un borrador incompleto no se puede guardar** (el aviso es «No se puede guardar el borrador: Escribe el mensaje») y la casilla de revisión permanece deshabilitada hasta guardar contenido válido. Es el comportamiento diseñado y coincide con la contradicción nº 7 de `QA-013`; la consecuencia de uso es que no se puede aparcar un borrador a medias. Decisión de producto pendiente, no un fallo del prototipo.
3. **La cola de clientes se recorta con desplazamiento interno** (en la captura de 1440 el sexto cliente queda cortado justo encima de «Mostrar más (180 restantes)»). No comprobé si el corte es un scroll normal o un recorte; conviene confirmarlo.
4. El defecto de contraste de botones primarios que figuraba en la nota del tablón de `CLAUDE-UI-010` **no se reproduce** con los archivos actuales (el botón «Guardar borrador local» tiene texto blanco sobre azul y todos los controles miden ≥ 6,01:1).

## Lo que NO se comprobó

Lector de pantalla; orden completo de tabulación con teclado (solo Escape y el retorno del foco); Firefox, Safari y Edge; zoom de texto del 200 %; escenarios Carga, Error, Solo lectura y Origen desactualizado en navegador (solo vacío y muestra); las acciones sobre la pestaña Archivos; el rendimiento de la cola con los 240 elementos. El prototipo **no es la app**: no está integrado en `src/` ni desplegado, y sus datos son de muestra rotulados.
