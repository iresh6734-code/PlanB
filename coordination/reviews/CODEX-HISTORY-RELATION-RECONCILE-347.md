# Historial y relaciones verificados con la interfaz compilada

13 de noviembre de 2026, Europe/Madrid. Banco history-relation347-DqYAdc. Usé los artefactos de la candidata 340 por huella y las dos suites E2E sin cambios. Las fuentes objetivo y las cuatro suites coinciden con el checkout actual. Se ejecutaron dos servidores locales con bases ficticias nuevas, puerto 4398 para relaciones y 4401 para historial. Browser plugin no disponible. Playwright usó el Chromium de su caché.

- Relaciones: 7/7 en Chromium. «Cliente» conserva su nombre accesible al cargar y reintentar; la selección de homónimos se guarda por ID exacto. El editor añade un espacio para historial de ficha y la integración de ReferenceSelect conserva label={field.label}.
- Historial: 3/3 en Chromium. Las 122 operaciones siguen accesibles, los valores tipados siguen completos en el detalle y los filtros no escriben. El resumen añadido muestra hasta dos campos de la operación. La prueba de la marca usa una respuesta local simulada. Se inspeccionaron las capturas de ambas vistas a 320 px.
- Unitarias de relaciones e historial: 26/26. Sin skips o fallos en las dos ejecuciones focales.

Las presentaciones 063 y 064 se actualizan con estas huellas. Se conservan sus informes y las presentaciones anteriores en el banco. Sus informes históricos describen sus cortes originales. La evidencia posterior consta aquí y en las notas de presentación. Se usó el typecheck de la candidata 340 como antecedente. No se repitió un build completo ni se probó lector de pantalla. Los avisos de arranque corresponden a SQLite experimental y ausencia del Kit de relevo en el banco.

- CODEX-RELATION-LABEL-063 · src/components.tsx · fb857268a42568359e2491031ce9105f69328ae67ffd9d883bad0055edd613c6
- CODEX-HISTORY-064 · src/ChangeHistory.tsx · 092e27f12649c0f00af867bfedca9f93bd5ebae3fcd5e32694ef7cf5c8c70b3b
