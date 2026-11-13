# TEXT044 · Corrección tras QA042

30/10/2026, 08:51 Europe/Madrid. Codex, corrección ordinaria de texto. QA042 se presentó, Codex contrastó sus hashes/informe y aceptó **su revisión**, sin aceptar por ello los módulos revisados. Después se reabrieron OPS039/DIFF040 para corregir sus dos hallazgos en las reservas del autor. TEXT044 reserva este informe únicamente.

## Cambio

Los recortes de etiquetas, IDs de respaldo, fechas inválidas y vistas previas de ambos módulos dejan de partir pares sustitutos UTF-16. Si el límite cae entre las dos unidades de un carácter suplementario, se omite ese carácter entero. Se mantienen los máximos de100/180/500 unidades, no se amplían ni se modifican registros o valores usados en la comparación. No repara cadenas que ya lleguen mal formadas; evita introducir el defecto al recortar.

Fuentes modificadas bajo reservas propias OPS039 y DIFF040: shared/response-queue.ts, shared/capture-comparison.ts y sus dos tests originales. Informes actualizados con esta corrección. Ninguna fuente o test de Claude editado.

## Evidencia

- **63/63 focales:** laboratorio17 + radar21 + comparador25. Las dos regresiones nuevas cubren etiquetas, fallback, fechas inválidas y vista previa, límite justo y carácter que cruza la frontera. Los casos previos de comparación del valor completo se conservan.
- **Typecheck completo: correcto.** Primer intento con mis regresiones usaba String.isWellFormed, ausente de libES2023; se corrigieron solo mis tests con comparaciones explícitas de las cadenas esperadas, sin cambiar tsconfig ni producción para acomodar el test.
- **QA042 sin editar** conserva sus dos TODO históricos. Tras el arreglo, DIFF ya pasa su aserción; OPS tropieza antes con una precondición de longitud exactamente180. El contrato fija un máximo, por lo que devolver179 al omitir el carácter que cruza el borde es válido.
- En una **copia temporal** de QA042 se retiraron las dos marcas TODO y se sustituyó únicamente esa precondición por longitud<=180; se mantuvieron todas las aserciones de sustitutos huérfanos y el resto de la batería. Resultado **33/33, sin TODO ni fallos** sobre copias de las fuentes corregidas. No es una nueva entrega de Claude ni se atribuye ese resultado al archivo histórico original sin cambios. Logs en tests/.tmp/coord043/focal-fixed.log y qa-normal-cases-fixed.log; copias temporales en fixed-qa.

QA042 fue aceptada como informe independiente de los hashes previos con defectos, no como aprobación de estas nuevas fuentes. **CLAUDE-QA-045 ready**, archivos exactos tests/independent-continuity-review.test.ts y coordination/reviews/CLAUDE-QA-045.md: su autor contrastará el contrato de tamaño máximo, conservará las aserciones Unicode y retirará los TODO después de verificar los hashes nuevos. Instrucciones en la sección QA045 de coordination/briefs/CLAUDE-COORD-043.md. No se envió nada a una CLI/proveedor.

## Hashes nuevos

| Archivo | SHA-256 |
| --- | --- |
| shared/response-queue.ts | d717bf6c039aca65e2f6413beecbf5cdbe3bca439d726860c1f1ddaeec3c0d76 |
| tests/response-queue.test.ts | 4d7e8cac3870271dbafd6217194e7f61ec8cc011d3ce6d50617fd549277fb86b |
| shared/capture-comparison.ts | d2e0da8aeeccf5ae46331cec04e4a53cb557d1664a547a1ad5b48980f3241970 |
| tests/capture-comparison.test.ts | cfcc032b746a01604bf1eb7b31067f818048df6d8360402ff9f1ea8c6fb1b7c8 |

Sin despliegue, servicios, UI, proveedores o datos reales. Corrección presentada con nuevos hashes para revisión; no autoaceptada. UX038 permanece devuelta por selector36/44 y conserva sus archivos. Fuente de LAB035 intacta; su reserva solo actualiza memoria/panel.
