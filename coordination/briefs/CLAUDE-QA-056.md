# QA056 · Verificación independiente de las correcciones F1/F2/F3

Trabaja en D:/AI/Plan-B-CRM-v2.1/source. Lee AGENTS.md, COORDINACION.md y el contexto vigente. Codex aceptó tu auditoría QA052 como informe tras reproducir sus 33 casos correctos y sus dos fallos causales. Eso no acepta el código auditado. Conserva el informe histórico QA052: no lo reescribas para convertir el pasado en verde.

Tu encargo es CLAUDE-QA-056. Antes de reclamarlo, comprueba que CODEX-INTEGRITY-055, CODEX-REL-046 y CODEX-ASSETS-057 estén en review, con hashes finales coincidentes. No exijas done: esta revisión sirve para decidir sobre esas fuentes. Si siguen working, no tomes una versión intermedia como definitiva ni cambies de actor para forzar estados.

Ejecuta primero:
    node tools/coordination/board.mjs brief CLAUDE-QA-056
    node tools/coordination/board.mjs claim CLAUDE-QA-056 claude

Usa una sola sesión, sin subagentes. Cuatro archivos exactos de escritura, con check-path antes de editar:

1. tests/independent-recovery-integrity.test.ts
2. tests/independent-backup-coverage.test.ts
3. tests/release-candidate-adversarial.test.mjs
4. coordination/reviews/CLAUDE-QA-056.md

Tus tres pruebas de QA052 pueden evolucionar en esta unidad; el tablón conserva sus hashes anteriores. Las fuentes revisadas, pruebas de Codex, RESTORE050, SEARCH053, EXPORT054, REL033, contexto y panel son solo lectura. No amplíes reservas, instales dependencias o uses un proveedor. No despliegue, commit, push o autoaceptación.

## F1 · Resultados inciertos durante restauración y reinicio

Revisa Store.restoreBundle y el constructor de Recovery. Todo sending debe convertirse en uncertain aunque el plan diga review, approved, partial o complete. Toda incertidumbre heredada retira autorización efectiva: plan partial, approvedAt:null. Un plan applying sin operaciones en vuelo también requiere revisión. No debe haber reenvío ni resultado remoto inventado.

Conserva controles positivos: la restauración de una aprobación ordinaria vuelve a review; un plan completo realmente resuelto sigue completo. Comprueba datos, historial y entrada inmutables, y operaciones aplicadas o pendientes preservadas. Verifica bloqueo de editar, aprobar y aplicar un plan incierto.

Tu caso F1 original debe pasar sin rebajar su expectativa: el resumen cuenta incertidumbres y no quedan operaciones sending. Contrasta las cuatro pruebas de matriz de Codex; añade cobertura independiente donde falte. El módulo preflight no queda aceptado automáticamente por depender del Store corregido.

## F2 · Activos públicos completos o exclusión explícita

Revisa scripts/prepare-release-candidate.mjs. Los archivos públicos regulares admisibles se capturan por bytes, independientemente de extensión o mayúsculas, conservando límites y rechazo de enlaces. Verifica GIF, PNG mayúscula, webmanifest, texto, PDF, WASM, archivo sin extensión y extensión arbitraria.

Las rutas públicas ocultas o de salida excluidas deben constar en excludedPublicPaths, generar un bloqueo PUBLIC_PATH_EXCLUDED y dejar publicAssetCoverage.complete:false. No copies contenido oculto para aparentar completitud. Comprueba que fuente, snapshot y runtime tienen los hashes que el manifiesto declara, y que approved/deployed/releaseEligible permanecen falsos.

Actualiza REVIEWED_SHA solo después de cotejar el script presentado. Explica ese cambio de versión; no ajustes expectativas para esconder un fallo. El baseline anterior empieza por bd3d8388; Codex conserva una copia exacta en el snapshot QA052. No confundas un fallo de junction, permisos o typecheck del arnés con sensibilidad a un activo omitido.

## F3 · Entorno de todos los subprocesos

La caracterización antigua «QA052_BENIGN se hereda» cambia de contrato: ahora hay una lista permitida de variables del sistema operativo. Exige ausencia de todos los canarios arbitrarios inventados, tanto inocuos como con nombres de credenciales, conservando PATH/SystemRoot/temporales necesarios. Explica expresamente esta expectativa nueva.

También esbuild se ejecuta por CLI a través del mismo runner saneado. Verifica los seis logs y las seis salidas; no basta comprobar el proceso de pruebas Node. No afirmes que esta lista constituye un sandbox hermético. No uses valores reales ni imprimas canarios.

## Ejecución, sensibilidad y dictamen

- Congela primero fuentes y hashes. Ejecuta tus 35 casos originales, o la nueva cifra si añades casos, informando pass/fail/skip/TODO por separado. No cuentes fallos de preparación como defectos de producto ni skipped como éxitos.
- Repite SAFE049: sus semillas y oráculo no cambian, pero Store es una dependencia compartida que sí cambió. No extiendas el dictamen anterior a esta versión sin comprobarla.
- Ejecuta F1/F2 contra sus versiones anteriores congruentes en scratch. Deben fallar por la causa correcta. No hace falta repetir por rutina las once mutaciones antiguas completas; justifica cuáles conservas como evidencia histórica.
- Typecheck y focales de las correcciones. Un trabajo pesado a la vez, workspaces mecánicos nuevos bajo tests/.tmp/qa056, dependencias locales existentes. Sin npm test general por rutina, red externa, navegador personal, puertos 4331/4334 o build raíz.
- Si faltan permisos para junction/symlink, informa del límite con precisión y conserva el resto de resultados. No debilites las aserciones ni fuerces la reserva de otro agente.
- Ante un hallazgo nuevo, aporta reproducción mínima y recomendación por unidad; no arregles la fuente reservada a Codex. Diferencia robustez, regresión y limitación no reproducida.

Entrega un informe nuevo con hashes cotejados, comandos y resultados propios, baseline y cambios de expectativa justificados. Dictamen separado sobre Store/Recovery, BACKUP041, SAFE049 y REL046. Distingue pruebas mecánicas, candidata real y runtime instalado: un build verde no acredita instalación.

    node tools/coordination/board.mjs submit CLAUDE-QA-056 claude --note "Verificación independiente F1/F2/F3 sobre hashes corregidos; bancos adversos, sensibilidad y límites; sin aceptar fuentes ni desplegar"

Tras submit, conserva las reservas y deja de editar. Codex contrastará tu informe y decidirá la aceptación. Este brief local no acredita que otra sesión lo haya recibido o esté ejecutándose.
