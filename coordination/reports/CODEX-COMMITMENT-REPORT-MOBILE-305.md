# Informe HTML móvil305

9 de noviembre de 2026, Europe/Madrid. Entrega de Codex para revisión independiente; no autoaceptada ni instalada.

## Cambio de producto

Al abrir el HTML exportado en móvil, cada rol muestra Estado, Vínculo y base, Observación y cobertura y Candidatos sin confirmar en bloques verticales con su etiqueta. En escritorio conserva la tabla de cinco columnas. La tabla mantiene encabezados, roles y asociaciones; las etiquetas visuales móviles son aria-hidden para no duplicarlas en el árbol accesible. El encabezado de columnas permanece disponible para tecnología asistiva. La regla móvil solo afecta screen; imprimir conserva la tabla.

Solo se modifica la presentación HTML y se nombran las tablas. No cambia esquema, datos, cronología, decisiones, reglas del Radar ni JSON. No hay JavaScript, recursos externos ni nuevas dependencias.

## Alcance reservado

- shared/commitment-report.ts: 19e0264ec298c6606e0718515b7a77b0e0e6c3b85acb65c62e63d4f1112b9bf3
- tests/e2e/commitment-report-responsive.spec.ts: 5e34bca6e8c2818e0f93085052ddd769e5c3b453af6ab9f5416e1fc0e66797ca
- Este informe; su hash lo registra submit.

La fuente anterior aceptada está archivada en tests/.tmp/commitment-report305-before.ts. La devolución303 usa su copia congelada anterior; no se sustituyó la versión bajo revisión. Las cuatro rutas de SCENARIOS siguen con Claude y A4 con el coordinador.

## Validación

Browser plugin not available. Se usa Playwright del proyecto y Chromium de caché, sin perfiles del usuario, una instancia propia por banco, datos ficticios, un trabajador y cero reintentos.

Banco tests/.tmp/report305-xCVuIz: tipos focales0; tres pruebas de navegador a320/390/1440 pasan. Se abre un HTML autónomo file:// nuevo y se comprueban título/contenido, roles de tabla, cinco columnas y tres roles, estado parcial y vínculo confirmado en la misma fila de Entrega, ambigüedad de Soporte, ancho, ausencia de overflow, escape de etiquetas, cero scripts/recursos/red/errores, cronología alcanzable al desplazar y vista print de tabla. Se inspeccionaron las capturas320y1440.

Las mismas pruebas, sin cambiar aserciones, se ejecutaron antes sobre el generador anterior. Pasó escritorio; fallaron los dos tamaños móviles precisamente por el ancho de celda:57,390625px frente a mínimo284 a320, y71,390625 frente a354 a390. Con la corrección miden286y356px respectivamente. El ancho1440es281,390625, distribuido en columnas. No hay skips ni flakies.

Los tres JSON de ambos pases son byte a byte iguales; SHA256 5035a7a340462925bd3945a2622ec356e78d09582b384ec6a63200d8fd812e53. Las ocho pruebas unitarias previas se conservaron sin editar y pasan8/8. El primer comando de unitarias falló antes de cargarlas por usar una rutaWindows como URL de importación ESM. unit.log conserva esa incidencia; unit-replay.log usa la CLI tsx ya instalada y result-calibrated.json distingue ambos intentos. No hubo fallo de producto ni cambio de aserciones.

Banco tests/.tmp/report305-download-EDTB9b: la prueba existente CRONOLOGÍA Y EXPORTACIÓN de SCENARIOS pasó1/1 en25s. Sus fuentes son las congeladas303, con únicamente el generador305 sustituido. Descarga real mediante botones HTML/JSON desde el Radar del arnés, misma revisión/contexto/eventos, contenido hostil escapado, apertura del HTML a320y cero envíos adicionales durante exportación. No se usa la edición working de Claude. Manifest y hashes antes/después acreditan el corte exacto.

## Límites y siguiente paso

La semántica se comprobó mediante roles del navegador; no se ejecutó lector de pantalla. Se probó Chromium, no Edge/Firefox/Safari. Print se comprobó por media y layout, no impresora ni PDF. La demo4601 respondió200y misma instancia3cb33118-1596-44cc-b78a-b2961615f4ff en una comprobación GET aparte, pero continúa con Jornada299: esta mejora aún no está montada allí. Sin proveedores, credenciales, original corporativo, root build, commit ni despliegue.

El chat coordinador debe revisar las tres huellas y aceptar o devolver305. Después puede incluirse el generador en una candidata de Radar cuando cierre SCENARIOS R2 y se cumplan las puertas de montaje.
