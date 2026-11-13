# Dictamen Codex sobre CLAUDE-QA-056

30/10/2026, Europe/Madrid. **Aceptable como revisión independiente sobre los hashes indicados.** No acepta automáticamente Store/Recovery, BACKUP041, SAFE049, REL046/ASSETS057 ni sus otras dependencias; no acredita instalación.

## Contraste propio

Cuatro archivos presentados cotejados antes y después, sin editar ninguno. Oráculos revisados: matriz explícita de estados/operaciones, secuencia propia de cobertura por recuento, públicos enumerados con bytes conocidos, observador de hijos con canarios inventados. Cambios de REVIEWED_SHA y expectativa lista negra→permitida justificados por contrato, no relajación de F1/F2. Se inspeccionaron también los logs/mutantes declarados; esos otros ensayos siguen atribuidos a Claude salvo los repetidos aquí.

Snapshot propio congelado: D:\AI\Plan-B-CRM-v2.1\source\tests\.tmp\qa068-f8149567-1f4d-43cb-9189-c23ffab8549f. Dependencias revisadas coinciden con la fuente viva y presentación; los tests se copian byte a byte. Baseline de producto tomado de candidate-7444fd6d-da9d-4304-8d6b-59a7af5f3158 con overlays finales de los cuatro archivos QA056 y tools/coordination/core.mjs de apoyo inventariado.

| Banco reproducido | Pass | Fail | Skip | TODO |
|---|---:|---:|---:|---:|
| Integridad |20|0|0|0|
| Cobertura |12|0|0|0|
| Candidata mecánica |18|0|0|0|

Typecheck correcto. Los50 incluyen dos caracterizaciones de observaciones conocidas (F1-6 y O1); son ensayos ejecutados, no cincuenta garantías de producto ni cierre de esas observaciones. Symlink de archivo se diagnostica dentro de los casos, sin cubrirlo: cero SKIP en el contador de Node no significa que esa subruta se haya comprobado. Junctions sí verificadas en este replay.

**Sensibilidad repetida por Codex:** caso F1 original contra baseline antiguo falla0/1 por sending superviviente y resumen0inciertas en review/approved/partial/complete. Banco focal de candidata baseline:2pass/3fail, con controles0/2 correctos y fallosF3-1(canarios heredados),F3-2(bundles fuera del runner),F2-1(13de18 omitidos aunque public-assets:true). Los mismos casos están dentro de los50 correctos con fuente nueva. No preparación rota ni payload inválido usado para fingir sensibilidad. Logs baseline-f1.log ybaseline-f2-f3.log conservados.

## Incidencias del revisor

La primera copia no tenía tests/.tmp: integridad se detuvo tras8 casos y una ruta ENOENT, conservado en initial-integrity-missing-scratch.log. Se creó solo scratch y se repitió integridad. Después candidata no encontraba tools/coordination/core.mjs porque no forma parte del manifiesto del producto; se conservó initial-candidate-missing-tool.log, copió ese apoyo por hash y repitió únicamente candidata/typecheck. Ninguna prueba/fuente se modificó para corregir esos errores del arnés. Una junction propia requirió permiso de ejecución fuera del sandbox; no es hallazgo de la app. Resultados finales separados enresults.json.

## Límites y pendientes conservados

- R1: plan persistido malformado sinoperations hace fallarconstructorRecovery; no alcanzable por escritores normales/restore validado. Caracterización reproducida, mejora de robustez pendiente.
- O1: auxiliares fuera depublic con extensiones no listadas quedan fuera del snapshot sin declaración. Caracterización reproducida; candidato no promete imagen íntegra del repositorio. Pendiente evaluar declaración de exclusiones.
- O2/O3/O4 conservados: rutas públicas ocultas bloquean completitud; huecos de sensibilidad en mínimos testsCodex cubiertos aquí por bancoClaude; redacción del reset de aprobación imprecisa para partial.
- Suelo Windows conenv:{} reproducido: USERNAME/USERPROFILE canarios pueden reinyectarse. La lista permitida no es sandbox. Binarios nativos no instrumentados directamente.
- Candidata mecánica sintética, no PlanB instalado. No recompilación propia de candidata real por esta revisión, tampoco lector de pantalla, navegador/E2E de producto, puertos4331/4334, proveedor, bases/claves reales, despliegue, commit o push.

## Hashes aceptados de la revisión

| Ruta | SHA-256 |
|---|---|
| tests/independent-recovery-integrity.test.ts | `11277086196ee4d7464a02f905d0f0305ca3edcf4dbf805f7c7f7aa1cc02edd2` |
| tests/independent-backup-coverage.test.ts | `09fbd66df134cd7846c0b8021bf13bc545da3d9c017ccefb0853e101096a01c5` |
| tests/release-candidate-adversarial.test.mjs | `15a9790fc5049840fe991c45298406995a9b27cf28663238d7ba34df1789d266` |
| coordination/reviews/CLAUDE-QA-056.md | `71dc9c820a986cf58ac43c13b1ff8ca3b1846d89e6b4b1d101ecfe446436d120` |

Se revalidan justo antes de aceptar únicamente CLAUDE-QA-056. QAREVIEW068 y las fuentes propias de Codex siguen presentadas, sin autoaceptación. El siguiente encargo independiente disponible es CLAUDE-QA-060, cinco rutas distintas según su brief; no habilita revisar062–067 implícitamente.
