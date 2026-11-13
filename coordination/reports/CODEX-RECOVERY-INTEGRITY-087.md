# R1 · Preservar un plan de devolución inválido

31/10/2026, 16:16:55, Europe/Madrid. Autor Codex. Cambios compartidos repartidos en reservas propias055/064/067/074/076;090 cubre los entrypoints. No archivos de Claude editados.

## Comportamiento

La estructura guardada se valida con RecoveryPlanSchema. Estado explícito none/valid/invalid; valid significa estructura, no éxito remoto o permiso. Caché por bytes reales de la fila meta y copias al devolver objetos: detecta cambios directos yA→B→A. JSON o datos inválidos producen diagnóstico fijo sin serializar contenido/errores privados. Se conserva la fila original sin normalizarla a un plan vacío.

Store rechaza edición, importación, generación, activación, sustitución de bundle, reserva de uso y reinicio de devolución bajo estado inválido. Transacciones repiten las barreras necesarias. Recovery no descarta un plan inválido al arrancar; protege preparación, decisiones, aprobación, envío y resolución. Comprueba antes/después de cada espera remota y guarda plan/mapeo atómicamente. Manual tiene controles equivalentes antes/después y antes del commit final. Sending/uncertain no permiten aprobación/envío directo. Un efecto remoto ya despachado no puede deshacerse: se detienen pasos posteriores y no se inventa confirmación local.

GETchanges mantiene historial legible, con plan:null y recoveryIntegrity explícita si es inválido. Continuidad pausa captura/scheduler sin cambiar lastAttempt; no se confirma custodia o copia actual sobre ese estado. Exportar bundle falla explícitamente en lugar de omitir el plan. El inspector admite verificar por separado la integridad del archivo, sin referencia activa/cobertura/custodia falsas.

ChangesView valida coherencia y conserva el historial aun con metadatos antiguos, ausentes o incoherentes. Deshabilita devolución, retira autorizaciones y descarta respuestas antiguas incluso si ignoran abort. Ref sincrónica impide ejecutar handlers capturados después del bloqueo y doble solicitud. Botón de actualización mantiene foco y44px. ManualRecovery conserva el acuse ya confirmado si falla la lectura local posterior y permite reintentar solamente GET, sin repetir POST. No botón de reparación/reset automático.

## Evidencias propias

- Nuevas16backend/API y12UI: pasan. Las12UI usan un runtime de componentes simulado, no DOM ni lector de pantalla; dos ejercitan ManualRecovery real y las otras el padre con widgets auxiliares simulados.
-116/116focales: recuperación, incertidumbre, producción, IDs/manual, inspector, historial e integridad independiente. Log tests/.tmp/recovery087-a4c9c14f-2919-42d2-92ba-4ab6fc29a390/evidence/focal.log.
- Cuatro controles causales ante la candidata anterior350: doscore fallan por arranque/bundle defectuoso y dosUI por metadatos/handler de aprobación capturado. Logs baseline-core.log y baseline-ui.log en la misma carpeta. No atribuir fallos de resolución del módulo a sensibilidad.
-24/24E2E reales:7R1,6manual,3historial,8inspector. Chromium de caché propio, cuatro servidores efímeros y datos ficticios nuevos; transporte remoto interceptado. Arranque con SQLite corrupta, historial/CSV, mutaciones/custodia bloqueadas, inspector independiente, actualización explícita sin repetición, respuesta retenida y móvil1440/390/320. Logs y JSON: D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/recovery087-b42d9633-4619-4250-ac81-c64cfde3e5aa/evidence. Capturas1440/320 inspeccionadas, sin desbordamiento horizontal; foco y44px cubiertos.
- Tres pruebas de bootstrap090 pasan desde las fuentes finales y los ejecutables finales. Dos fallan con entrypoints anteriores que intentaban restaurar la semilla; la nueva guardia evita tumbar la app y sobrescribir evidencia.

Incidencias del arnés conservadas: primer intentoUI7/10 porque el helper simulaba timeout pero no interval; se capturó interval en el test y pasan10, luego12 con los casos Manual añadidos. Primera semilla temporal falló por imports ESM absolutos Windows; se usó pathToFileURL y se repitió solo semilla/navegador, no se falsea ese intento como producto. Candidata355 marcó deriva solo en dos pruebas deClaude, R1 quedó cotejada; intermedia356 cambió durante incorporación090. Final357 estable.

## Límites

No es reparación de toda corrupciónSQLite o de todos los metadatos, ni prueba de integridad semántica/relacional completa. Store.set/SQL de un proceso privilegiado no son una barrera del sistema operativo. La reparación usada porE2E es exclusivamente SQL sobre su fixture con marcador, no un endpoint añadido a la app. No lector de pantalla, proveedor remoto o paquete instalado anterior verificados.

Candidata final: tests/.tmp/release-candidates/candidate-42c5f15c-99a2-4f4d-bd96-275f84c47f0f;357 fuentes/23 artefactos, snapshotStable:true y liveSourcesStillMatch:true al cierre de la captura. Typecheck,Vite,seis bundles,activos públicos y162 pruebas Node correctos. Sigue approved/deployed/releaseEligible:false por revisiones y exclusiones declaradas. No es imagen íntegra del repositorio ni reconstrucción en máquina limpia. Dependencias existentes, sin nuevas instalaciones.

Los116 focales y24E2E se ejecutaron contra candidate-d4cc1c48-2201-48d9-94de-2bab0fb2faf0. El cierre final conserva todas las fuentes R1 de negocio/UI y21/23 artefactos idénticos; solo server.mjs/runtime.mjs cambian por las condiciones de arranque. Tres pruebas de arranque adicionales pasan contra fuentes finales y contra ambos ejecutables finales. Detalle de comparación y logs en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/final091-36a2d7eb-c634-49c3-8443-c8481cbf2d5d. No se suman repeticiones como pruebas únicas.

La app abierta PREVIEW083 en4420/4421 conserva sus artefactos anteriores: no incluye automáticamente R1. Ambos health200 comprobados en esta continuación. No se reemplazó/reinició esa vista, no instalaciones4331/4334, equipo original, proveedores, cuentas, claves, build/dist raíz, commit/push o despliegue. Fuentes para revisión independiente; no autoaceptación.

## Hashes finales

- shared/recovery-integrity.ts: `aa9f34568991035a18f1f3b45f4573cf1858933fced38ecd311c1f6eb7d50680`
- shared/operations.ts: `a2412f476d99009e90a5948e17296ba91b0ad1376162ad4648834251b1a916c0`
- server/v2.ts: `98a4e9bc0ba81883ad7cbbb232c7aa681ac7c8f7a0a22990b990771a107b9972`
- server/continuity.ts: `2e605d95c837e80d259811bbe45152147a133d9a3848f6caebddaec260b5a9d5`
- server/recovery-copy.ts: `2e397e7dab1f9817c9cf01bd3f3d821fb648f22a138c153f443897459d51bd04`
- tests/recovery-integrity.test.ts: `a292ff1ec917c9593567e41c0bff8e0d24162550fa81ac4cc6e09777f401d396`
- tests/recovery-integrity-ui.test.ts: `b0b13fa33c4417b8d6cd9f09c27e30781ef485b2270e4feb8621a3d6370f6df7`
- tests/e2e/recovery-integrity.spec.ts: `62a47836d81c8d229e33838d39ea22cd1c3f6270c975da9703c2bef5de2aeff8`

Los informes compañeros registran sus hashes; submit sella este informe.
