# O2 · Clasificación de carpetas sin distinguir mayúsculas

31/10/2026, 16:16:55, Europe/Madrid. Autor Codex. Hallazgo deClaudeQA086, corrección de builder bajo reservaREL046; pruebas nuevas en esta unidad.

Se usa entry.name.toLowerCase() solo para clasificar exclusiones. Se conservan rutas y mayúsculas originales en selección/copias/metadatos. Data/Dist/Node_Modules y otras variantes protegidas quedan declaradas y no recorridas. public/Data,public/DATA ypublic/data siguen admitidas. public/Dist sigue la política de exclusión de dist. O3 (archivos raíz predeclarados que faltan) no se modifica: el fallo posterior sigue explícito, no candidata válida.

5/5nuevas, más10SNAPSHOT084 y3ASSETS057:18/18,0skip/TODO. Ante builder b026 congelado por088 fallan3por captura de variantes, public/Dist y recorrido indebido; pasan los2controles positivos de public/Data y conservación de capitalización. Logs selection-final.log y selection-baseline.log en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/final091-36a2d7eb-c634-49c3-8443-c8481cbf2d5d. No se editan tests/informeClaude: su O2 y SHA anterior requieren R2 por el autor. No se afirma que esos bancos antiguos pasen contra la corrección.

Candidata final: tests/.tmp/release-candidates/candidate-42c5f15c-99a2-4f4d-bd96-275f84c47f0f;357 fuentes/23 artefactos, snapshotStable:true y liveSourcesStillMatch:true al cierre de la captura. Typecheck,Vite,seis bundles,activos públicos y162 pruebas Node correctos. Sigue approved/deployed/releaseEligible:false por revisiones y exclusiones declaradas. No es imagen íntegra del repositorio ni reconstrucción en máquina limpia. Dependencias existentes, sin nuevas instalaciones.

Los116 focales y24E2E se ejecutaron contra candidate-d4cc1c48-2201-48d9-94de-2bab0fb2faf0. El cierre final conserva todas las fuentes R1 de negocio/UI y21/23 artefactos idénticos; solo server.mjs/runtime.mjs cambian por las condiciones de arranque. Tres pruebas de arranque adicionales pasan contra fuentes finales y contra ambos ejecutables finales. Detalle de comparación y logs en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/final091-36a2d7eb-c634-49c3-8443-c8481cbf2d5d. No se suman repeticiones como pruebas únicas.

La app abierta PREVIEW083 en4420/4421 conserva sus artefactos anteriores: no incluye automáticamente R1. Ambos health200 comprobados en esta continuación. No se reemplazó/reinició esa vista, no instalaciones4331/4334, equipo original, proveedores, cuentas, claves, build/dist raíz, commit/push o despliegue. Fuentes para revisión independiente; no autoaceptación.

Builder final: ae74ce22ea6a2ed14cc78f1b5735c763b937aa1a7199f9875764eba9a0ef2935.

- tests/candidate-path-case.test.mjs: `bf46796b8748b58b81ec67ab5b86a2a71e70655339077121bfb61d3205ebe02b`

submit sella informe.
