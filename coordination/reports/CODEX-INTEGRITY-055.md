# INTEGRITY055 · Arranque con metadatos de diario dañados

La unidad 232 reproduce que una fila no JSON bajo task-intent: abortaba la migración de Store. La excepción se limita a esa familia. El archivo abre y el lector del diario puede aislar la fila dañada. Las filas válidas siguen cifrándose y el control de metadatos ajenos sigue rechazando JSON inválido. Con SQLite de archivo se conservan datos e historial tras dos aperturas. Pasan 2 pruebas nuevas, 16 de recuperación, 44 del diario preservado, tipos y compilaciones de main y runtime. La prueba funcional usa createBaseApp inyectado. El informe 232 separa el control de compatibilidad y los límites de montaje.

SHA-256 vigente de Store: 990baafc88e636a667fbf9848ce2bbd5f87aae318398d1ced3e5d3f19d6af12c. Recovery y la matriz de incertidumbre conservan las huellas anteriores. La reserva 055 vuelve a revisión. La decisión de 111 sigue referida a su corte anterior.

---

# INTEGRITY055 · Resultados inciertos al restaurar y reanudar

## Corte vigente111 · 1/11/2026, 17:06:50, Europe/Madrid

Nuevo encargo coordinado111corrigeF1–F3deQA091en las dos fuentes exactas que055ya reservaba;111solo reserva brief/test/informe nuevos. No se acepta055para liberar sus archivos o se tocan fuentesClaude.

Store omite exclusivamente la migración de recoveryPlanmalformado/noJSONo estructura inválida, conserva sus bytes y permite estadoinvalid/APIlegible. Planválido/nullsí se cifra; corrupción JSON de otras filas sigue rechazándose. Una fila heredada inválida sin sellar permanece sin sellar: se conserva evidencia, no se repara/cifra ese contenido.

Recovery controla ausencia de registro local enapprove yantes delverifydeapply, y lo relee después de esperar. ValidaIDdecreate como cadena no vacía antes de asignarlo/mapearlo; no convierteNumber/String. Si el remoto pudo crear pero responde mal, queda uncertain/partial, aprobación retirada y mapa sin contaminar; no se despacha otra llamada o se repite automáticamente. save valida estructura en la transacción, antes de mapa/plan. La semántica R1 sigue siendo estructural, no éxito remoto.

Verificación actual:194/194focales(12nuevas111),247/247banco independienteQA091con cuatroTODOforzados como normales en copias privadas,0fail/skip/TODO. Trespruebas propias fallan con la parejaStore/Recoveryanterior por causa esperada; tresmutantesprivados detectados. Typecheck focal ydosbundlesbackendprivados correctos. Snapshot D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/qa091-resilience111-c86e2d80-a27b-4deb-b302-d45b138e04b7; informe CODEX-PERSISTED-RECOVERY-111.md. La matriz original055no cambió y pasa dentro del banco actual.

055y111vuelven areview, sin autoaceptarse. No candidata357/23actualizada, instalación, UIoarquitectura de reparación automática. Los resultados antiguos siguientes son históricos yno se suman. Algunas suites existentes usan DPAPIactual para claves nuevas ficticias; las doce nuevas111precrean claveskind:test/memoria, no claves previas. Sin equipooriginal/proveedor/commit/push/despliegue.

Hashes nuevos:Store 9d08d9cc06f8c4cf45f60d6b963e3ad566e95aa34253a9c2ab2dc25bd682f65f;Recovery b56e5d7255d93d3e7526dc2afbe6a629e558f1378e473c33cb8ce18a357ea86f. Testoriginal055 31c5065783f8af4a9b429281c27acbc0d8d2c9c0d4314e6285006e6f2b1c1a9f. SHAdeesteinforme ensubmit.

## Historial anterior conservado


30/10/2026, Europe/Madrid. Codex. Corrección del hallazgo F1 de la auditoríaQA052 contrastada. **52/52 focales,13/13 del banco independiente de integridad y typecheck correctos sobre snapshot corregido.** Fuente presentada para revisión, sin autoaceptación o despliegue.

## Problema y cambio

Un artefacto con operación sending y un estado de plan distinto de applying podía restaurarse dejando el envío en curso. El proceso emisor ya no existe; ese estado representa un resultado remoto desconocido. El verificador contaba solo uncertain y podía informar cero inciertas.

Store.restoreBundle convierte **todo sending auncertain**, con mensaje de verificación, cualquiera que sea el estado del plan. Si queda incertidumbre o el plan era applying, lo deja partial y retira approvedAt. Una aprobación ordinaria sin incertidumbre sigue volviendo a review al restaurar; un plan completo realmente resuelto sigue complete. Campos, registros, historial y operaciones ya resueltas conservados.

El constructor Recovery aplica la misma normalización conservadora a planes persistidos de versiones anteriores: sending/uncertain no conservan autorización efectiva aunque el plan diga approved/complete. No llama un proveedor ni reenvía operaciones. La UI y la aprobación existentes mantienen el bloqueo de incertidumbre; no se inventa un éxito remoto.

## Pruebas propias

Snapshot `tests/.tmp/integrity055-final-3ac98ea0-b001-4840-a0bc-5984370badc2`: hashes en manifest.json; resultados en results.json; logs focal.log, independent-integrity.log ytypecheck.log.

- **4 pruebas nuevas de matriz**: cinco estados de plan×sending; incertidumbre preexistente; constructor sobre metadata heredada; controles aprobado ordinario/completo resuelto. Comprueban datos/historial/entrada inmutables, avisos preflight, bloqueo de editar/aprobar/aplicar y operaciones pendientes/aplicadas conservadas.
- **52/52 focales**:4 nuevas+12preflight+4custodia/exportación+23v2+9RESTORE050. Incluyen recuperación persistente en dos procesos con datos ficticios nuevos, resultadosinciertos que impiden completar trabajo, creación remota simulada sin duplicación y controles de sesión. SinTODO/skips. No invocación remota real.
- **13/13 del banco de integridad de Claude**, copia exacta sin editar sus tests. El casoF1 que fallaba antes pasa; se conservan todos los rechazos/CLI/cifrado. Antes del fix, reproducción propia del banco exacto12pass/1failporF1, registrada en snapshotQA052 de Codex. Esa comparación constituye sensibilidad del caso, no una expectativa relajada.
- **Typecheck completo correcto.** No se repite toda la batería de la aplicación por rutina; las revisiones SAFE049/REL046 de fuentes nuevas se encargan aQA056.

El preflight fuente no cambió: su información mejora porque utiliza el Store corregido. BACKUP041 sigue en su propia revisión; un test verde de su dependencia no la autoacepta. Los primeros intentos de reproducirQA052 necesitaron preparar tests/.tmp y junction de dependencias en el snapshot; fueron problemas de arnés propios, detallados en el informe de contraste.

## Alcance y entrega

Cuatro archivos exactos: server/store.ts, server/recovery.ts, tests/recovery-uncertainty.test.ts y este informe. Reservados antes de editar; no se tocaron archivosClaude. QA052 aceptada como informe histórico; QA056 revisará estos hashes junto con F2/F3 deREL046/ASSETS057, cuando estén en review.

La corrección maneja estados incoherentes de artefactos/metadatos; no prueba que un envío haya llegado o no al CRM, ni sustituye la verificación remota autorizada. Sin base/cuenta real, instalaciones originales, proveedor, dependencia nueva, build/dist raíz, publicación, commit/push o autoaceptación.

## Hashes de fuente cotejados antes de presentar

- server/store.ts: 42e4ec0c9e20e54dcf12d3d712e8ae30513a7949de0c7c93bb9a724cd965e197
- server/recovery.ts: 2d725e30c5c8ac48cf218e188ce68aa183fc6d18a37f2c980d1d541ad5021230
- tests/recovery-uncertainty.test.ts: 31c5065783f8af4a9b429281c27acbc0d8d2c9c0d4314e6285006e6f2b1c1a9f

El hash del propio informe lo registra submit; no se incluye un hash autorreferente.


## R1/O2 · Corte final 31/10/2026, 16:16:55, Europe/Madrid

Store añade estado de integridad por bytes persistidos y guardas/transacciones; Recovery conserva el plan inválido y verifica antes/después de esperas remotas. Persiste atómicamente mapeo/plan. Normalización de sending válida conservada. No implica reparación general o cancelación de un efecto ya enviado.

Detalle transversal en CODEX-RECOVERY-INTEGRITY-087.md, CODEX-SOURCE-CASE-089.md y CODEX-RECOVERY-BOOT-090.md.

Candidata final: tests/.tmp/release-candidates/candidate-42c5f15c-99a2-4f4d-bd96-275f84c47f0f;357 fuentes/23 artefactos, snapshotStable:true y liveSourcesStillMatch:true al cierre de la captura. Typecheck,Vite,seis bundles,activos públicos y162 pruebas Node correctos. Sigue approved/deployed/releaseEligible:false por revisiones y exclusiones declaradas. No es imagen íntegra del repositorio ni reconstrucción en máquina limpia. Dependencias existentes, sin nuevas instalaciones.

Los116 focales y24E2E se ejecutaron contra candidate-d4cc1c48-2201-48d9-94de-2bab0fb2faf0. El cierre final conserva todas las fuentes R1 de negocio/UI y21/23 artefactos idénticos; solo server.mjs/runtime.mjs cambian por las condiciones de arranque. Tres pruebas de arranque adicionales pasan contra fuentes finales y contra ambos ejecutables finales. Detalle de comparación y logs en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/final091-36a2d7eb-c634-49c3-8443-c8481cbf2d5d. No se suman repeticiones como pruebas únicas.

La app abierta PREVIEW083 en4420/4421 conserva sus artefactos anteriores: no incluye automáticamente R1. Ambos health200 comprobados en esta continuación. No se reemplazó/reinició esa vista, no instalaciones4331/4334, equipo original, proveedores, cuentas, claves, build/dist raíz, commit/push o despliegue. Fuentes para revisión independiente; no autoaceptación.

### Hashes que sustituyen las versiones previas para esta revisión

- server/store.ts: `be15276c166de29123ee9acbc8eb33644b8b06abb103bb4ce66576becb0dacd7`
- server/recovery.ts: `1d1ba2cf49c3417609ea943486af767728d906da5192e73864b1b25b5ee4ac17`
- tests/recovery-uncertainty.test.ts: `31c5065783f8af4a9b429281c27acbc0d8d2c9c0d4314e6285006e6f2b1c1a9f`

El informe lo sella submit.
