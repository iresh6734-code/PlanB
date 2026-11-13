# ASSETS057 · Regresiones de activos y entorno de candidata

30/10/2026, Europe/Madrid. Codex. **3/3 pruebas propias sobre REL046 corregida. Sensibilidad contra la fuente anterior:1pass/2fail por activos omitidos y variables heredadas.** Pruebas mecánicas; no una compilación de PlanB o un runtime instalado.

El banco tests/release-candidate-completeness.test.mjs copia el script exacto a un workspace sintético nuevo bajo tests/.tmp/assets057. Usa las dependencias locales mediante junction, sin instalarlas/modificarlas. Fuentes y activos inventados, diez tests de negocio vacíos: solo comprueban mecanismo de captura/compilación/manifiesto, no los comportamientos del producto.

- GIF,PNGmayúscula,webmanifest,robots.txt,PDF,WASM,archivo sin extensión y extensión arbitraria aparecen en snapshot/dist con bytes ySHAiguales. Ninguna lista de extensiones los omite.
- Archivo público oculto se conserva como exclusión declarada, blocker PUBLIC_PATH_EXCLUDED y publicAssetCoverage.complete:false. No se copia contenido oculto para aparentar completitud ni se aprueba la candidata.
- Canarios inventados tanto credencial-shaped como inocuos se retiran por allowlistOS. Los seis bundles usan el runner saneado; cada uno genera su log/artefacto. Ningún valor del canario se imprime.
- Origen intacto después y hashes de runtime iguales al manifiesto; approved/deployed/releaseEligible siemprefalse.

Primera corrida corregida3/3 en13.6s (salida de herramienta). Workspaces y execution.log quedan conservados; no se borra recursivamente ninguna carpeta. Baseline es la versión exacta bd3d8388... del snapshotQA052 de Codex: tests/.tmp/qa052-review-8458cf2d-cf3d-415a-a099-c5e6f9d3bdcd/source/scripts/prepare-release-candidate.mjs. La misma suite contra esa fuente falla en las dos aserciones causales y pasa preservación de origen; log tests/.tmp/assets057/baseline-sensitivity.log. No mutación de fuentes compartidas ni expectativas relajadas.

Comando propio `node --test tests/release-candidate-completeness.test.mjs`; baseline usa CANDIDATE_TEST_SCRIPT apuntando al archivo congelado. Permiso de ejecución para junctions y fixture propios, sin cambiar controles del equipo. El entorno restringido sin junction produjo fallos de preparación en la repetición originalQA052: se registran como límite de arnés, no se confunden con estas regresiones.

Corrección vive en scripts/prepare-release-candidate.mjs bajo reserva REL046, no en esta unidad. F1 vive en INTEGRITY055; pruebas/refuerzo de fuentes revisadas se presentan por separado y QA056 debe contrastarlas. Sin self-accept, proveedor, instalación, build/dist raíz, commit o push.

## Hashes de fuente cotejados antes de presentar

- tests/release-candidate-completeness.test.mjs: c966ed4dc718fab82525ec3be0b3ada1a27b8d613c2c89e404d649de81749a69

El hash del propio informe lo registra submit; no se incluye un hash autorreferente.

## Regresión de raíz pública enlazada · 9/11/2026

La cuarta prueba crea una junction `public` a un directorio inexistente en un proyecto sintético nuevo. Comprueba que la entrada es un enlace y su destino está ausente. Ejecuta la CLI real y exige código 1, manifiesto `incomplete`, motivo de enlace, ningún check y ningún dictamen de cobertura pública. La creación del enlace se ejercitó. Si el sistema la impide con EPERM, EACCES o ENOTSUP, la prueba declara un skip con causa. Otros errores se propagan.

| Banco | Resultado |
| --- | --- |
| `qa052-link-baseline-4K6yJS` con `ae74ce22…` | Falla la nueva aserción. La CLI sale 0 con diez checks y declara cobertura completa con cero activos. |
| `qa052-link-corrected-1AsrfA` con `97197656…` | 4 de 4 pruebas, sin skips. El caso del enlace termina antes de la compilación. Los controles de activos y entorno pasan. |

Los logs y manifest están en cada raíz bajo `tests/.tmp`. Se verificaron las huellas de origen y de las copias. Una repetición previa sobre el constructor anterior dejó 3 de 3 pruebas ASSETS057 y 38 de 38 REL033 en `qa052-current-r8OuW6`. Su recopilador esperaba TAP y no leyó el resumen del reporter spec de Node. `calibrated-result.json` recupera los recuentos de los logs originales y preserva el fallo del recopilador. Las suites no se ejecutaron de nuevo para recuperar esos recuentos.

El hash presentado de la suite es `2234f02f1fd0c98ef805856278b2e7aca91fafcb25d05da1a85a37bc969b6ef2`. Las comprobaciones se limitan al empaquetador y los proyectos de prueba. La demo 4601 conserva su corte y su recibo de arranque por separado.
