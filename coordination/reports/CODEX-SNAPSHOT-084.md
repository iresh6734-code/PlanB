# SNAPSHOT084 · Fuentes de candidata con exclusiones explícitas

31/10/2026, 15:10:36, Europe/Madrid. Autor Codex. Unidad nueva de regresiones; builder corregido dentro de su reserva REL046. Entregas para revisión, no autoaceptadas.

## Pendiente que se resuelve

QA056 O1 constató que archivos auxiliares fuera depublic quedaban fuera sin declaración. También hubo que copiar tools/coordination/core.mjs manualmente al revisar una candidata anterior. Ahora sourceSelection declara raíces, archivos raíz, cada exclusión con motivo y repositoryImage:false. No pretende ser una imagen íntegra del repositorio. Archivos con extensión no admitida siguen excluidos, pero se añaden bloqueos SOURCE_AUXILIARY_EXCLUDED y no quedan silenciosos.

Se incluyen tools y extensiónHTML junto a códigoTS/JS/CSS/SVG: core de coordinación, herramientas REL033 y páginas de sus paneles viajan en el snapshot. Los directorios data fuera depublic se excluyen sin inspeccionar contenido; public/data sigue siendo un activo público admisible. Se declaran nombres ocultos y directorios excluidos una sola vez, sin enumerar su interior o copiar datos. No se incluyen .env, bases, logs o dependencias.

La estabilidad compara la selección y las exclusiones, además de hashes capturados. Añadir un auxiliar cambia el inventario; cambiar solo bytes de un excluido no significa que esos bytes se hayan capturado. Límite2000fuentes y2000exclusiones. API candidateSourceSelection importable sin ejecutar CLI; ayuda/--prepare conservados.

## Comprobación propia

- **13/13focales finales:**10nuevas y3ASSETS057. Logs enD:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/snapshot084-d0decfa5-f436-428f-8db4-9d8a5c2e185d/final-4ddfbdfd-674b-4930-80df-68d0d9e54928/final-focal.log. Cubren inventario/motivos, ausencia de contenido privado, tools/HTML, extensión/mayúsculas, public/data, enlaces/junctions, límite, capturas previas al compilador e importación sin efectos. Los dos tests de captura usan workspace sintético sin compilador: esperan fallo posterior al inventario y no afirman build de producto.
- **Sensibilidad:** dos regresiones de captura fallan ante builder anterior por ausencia de sourceSelection y de tools/core, y pasan con nuevo. EvidenciaD:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/snapshot084-d0decfa5-f436-428f-8db4-9d8a5c2e185d/run-23cbd9e7-d8ad-44d5-8321-3a3ef856cff9/baseline.log.
- **Banco histórico QA056 sobre corte intermedio:**17pass/1fail. Falla únicamente O1 que exigía que los nombres omitidos NO apareciesen en el manifiesto, justamente la conducta sustituida. Se usó QA056_SCRIPT explícito porque su SHA histórico pertenece a otra versión. No se altera ese archivo ni su informe; no se declara18/18 o cierre de su revalidación independiente. Se repitieron después las13focales con hash final tras añadir HTML de herramientas.
- **Candidata real final:**tests/.tmp/release-candidates/candidate-dcfb83d9-f72c-4f8f-872c-8f124530b8f5,350fuentes/23artefactos. Typecheck,Vite,seis bundles,activos públicos y162Node correctos; snapshotStable:true y liveSourcesStillMatch:true. Nueve exclusiones declaradas: ocho auxiliares y tests/.tmp/; bloqueos de revisión y auxiliares conservados, approved/deployed/releaseEligible:false.
- **Autosuficiencia acotada:**38/38tests/workspace-release.test.mjs ejecutadas desde el source de esa candidata, con sus tools copiados y sin añadir manualmente archivos de apoyo. Resultado observado en herramienta; no se inventa log completo persistido. Dependencias ya instaladas por ancestros, no se instalan/copian node_modules ni se afirma reconstrucción en equipo limpio. La política raíz sigue declarada y no contiene todos los archivos del repositorio.
- **Artefactos sin cambio:** los23hashes finales coinciden con PREVIEW083 y con sus bytes en disco. candidate-evidence.json enD:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/snapshot084-d0decfa5-f436-428f-8db4-9d8a5c2e185d/final-4ddfbdfd-674b-4930-80df-68d0d9e54928. Se conserva la evidencia visual anterior y no se repiten E2E de una UI cuyos artefactos no cambiaron. No reinicio o sustitución de la app abierta4420/4421.

Primer intento10focales:9pass/1fail por directorio data que aún no se excluía; se corrigió. Primera candidata348fuentes compiló, pero liveSourcesStillMatch:false tras el ajuste de public/data y pruebas: evidencia conservada, no se usa como corte final. Final350 incorpora HTML de herramientas y tiene fuentes estables. node--check y gitdiff--check focal correctos. No proveedor, datos reales, instalaciones4331/4334, dependencias, build/dist raíz, commit/push o despliegue.

## Revisión independiente siguiente

CLAUDE-QA-086 ready: tres rutas propias distintas de QA079/081. Debe actualizar el banco histórico tras cotejar fuente nueva, reemplazar la caracterización O1 y añadir oráculos independientes; conservar F2/F3 y evidencia UUID. No se acredita su reserva o ejecución. QA079/081 permanecen intactas. R1 del plan persistido malformado y AUTH_PARENT072 siguen pendientes separados.

## Hashes

- scripts/prepare-release-candidate.mjs: b026f0ddd9f0ad729ff7eba8c2d1f1bd4fbd0e467695c9c566407ed90ebb5b2b
- tests/candidate-source-coverage.test.mjs: 4c60530e772db8f94be1463010e9763abec227e81c3afdcbf729052d60e0e498

El hash del informe lo registra submit.
