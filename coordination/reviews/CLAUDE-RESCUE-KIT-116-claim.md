# Revisión independiente de 116 · fallo después de publicar

2/11/2026, Europe/Madrid. Dictamen: devolver 116 a corrección; no integrar todavía.

## Hallazgo reproducido

En `importCapsule`, el `catch` elimina el archivo de reclamo para cualquier error. `RescueRoom.importComponents` publica por `renameSync` antes de completar el primer arranque y antes de que el importador actualice el reclamo a `imported`. Si se produce una excepción después de publicar, el destino puede seguir existiendo aunque el reclamo desaparezca; un reintento de la misma cápsula crea otro destino.

`node --import tsx --test tests/independent-rescue-claim.test.ts`: 1/1 **observación del defecto**, no prueba de corrección. Con una cápsula de datos ficticios, se inyectó una excepción síncrona mediante el hook existente exactamente en `import:published`; se comprobó primero el marcador del destino y después la ausencia del reclamo. Un segundo `importCapsule` con el mismo nombre y revisión publicó una carpeta distinta; ambos destinos existían simultáneamente. El test usa las utilidades de prueba existentes y carpetas propias; sin red o credenciales reales.

La inyección prueba el camino de excepción posterior a `rename`, no demuestra por sí sola que haya ocurrido un fallo real de disco ni reproduce directamente el error de `writeFileSync` de confirmación. Ese otro caso comparte el `catch` pero requiere una prueba causal específica. Una terminación abrupta es otro escenario: no confundir el `catch` ejecutado con una muerte de proceso.

## Corrección y comprobaciones esperadas

No eliminar el reclamo cuando el destino ya se ha publicado o cuando su publicación sea incierta. Conservar información suficiente para recuperar y distinguir publicación completa, fallida y ambigua sin crear otro destino a ciegas. Considerar fallos de escritura, primer arranque, excepción posterior al rename, proceso interrumpido y reintentos concurrentes. No borrar un destino ya existente para forzar el pase; no tratar un hash como autenticidad ni ejecutar efectos externos.

Añadir regresiones de esos casos que fallen por la causa en esta versión y pasen en la corrección, conservando además las de 116, 106 y 115 pertinentes. La prueba observacional de este informe debe invertirse o sustituirse tras corregir; en su forma actual pasa cuando existe el defecto.

## Alcance de la revisión

El informe de 116 declara 48/48 combinando una ejecución de 47 con un caso añadido ejecutado aparte; no es una pasada única de 48. Hay discrepancia entre el informe y el mensaje de entrega sobre si se inspeccionó visualmente la captura de inspección de 1440 px: aclarar según evidencia, sin reconstruir retrospectivamente. No se han repetido aquí las 48 pruebas ni los DOM, ni se ha evaluado el kit completo. El barrido `sweepStaging` no parece consultar la vida del escritor: es una hipótesis estática, no un defecto reproducido ni una llamada concurrente demostrada.

## Seguimiento R2 · 3/11/2026

El autor corrigió la clasificación tras publicar; la observación anterior se convirtió en una regresión que exige conservar el reclamo y rechazar la segunda importación. Su resultado se registra al presentar de nuevo 138. La revisión independiente 148 detectó otro defecto reproducido: dos instancias del módulo dentro del mismo PID pueden confundir un reclamo activo con uno obsoleto. 116 volvió a `working` para corregirlo; la regresión de este archivo solo cubre la excepción inyectada tras publicar y no demuestra la solución de ese defecto distinto. La aclaración de 48=47+1 y captura 1440 posterior consta en el informe R2 del autor.
