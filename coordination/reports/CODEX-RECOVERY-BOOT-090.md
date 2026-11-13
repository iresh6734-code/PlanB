# R2 · Banco de arranque con espera acotada y diagnóstico

4/11/2026, Europe/Madrid. Corrección solicitada por la revisión independiente163. **Presentada para nueva revisión; no autoaceptada.** `server/runtime.ts` permanece idéntico (`b1324021f93ba8be9bf9acce5d5067e5ecd5c7db5af8559b71668b53f77b4ca5`). Se modifican solo el banco de pruebas y este informe bajo090.

El banco espera hasta30segundos con probes de300ms y pausas de100ms,dejando de esperar si termina el hijo. Es un plazo de prueba acotado,no una garantía de tiempo de recuperación del producto. Cada caso guarda bootstrap-status.json con duración,salud,último resultado y estado del proceso. El cierre espera el evento close con límite10segundos y guarda bootstrap-close.json;el log se conserva también ante fallo.

Las fixtures precrean claves nuevas kind:test antes de Store y fijan NODE_ENVtest únicamente en su worker. Evitan la creación/descifrado DPAPI en esta ejecución;no cambia crypto ni la protección del producto. Las11expresionesassert originales son idénticas según AST/printerTypeScript. La guarda de integridad y las comprobaciones de plan intacto,registros vacíos,diagnóstico inválido y semilla normal se conservan.

**Comprobaciones propias R2:**3/3casos por fuentes y3/3sobre ejecutables recién compilados del mismo corte;son los mismos tres casos en dos formatos,no seis casos distintos. Typecheck focal limpio. Control privado:se compila runtime quitando solo la guarda de integridad;el caso corrupto falla porAssertionError de salud y el log del hijo muestra RECOVERY_PLAN_INVALID/409 en restoreBundle. Se restaura la copia de fuentes al hash original. No hubo errores de importación,compilación o timeout en ese control.

Evidencia `tests/.tmp/bootstrap090-r2-6401ebe2-ab87-437c-a6cb-fd7e2745a234`:before.json y copias previas,assertions.json,manifest,source3.log,compiled3.log,mutant-corrupt-runtime.log,result.json y binarios propios. Siete casos físicos incluyendo el control adverso;los siete registran close y clavekindtest. Se usan carpetas nuevas y puertos efímeros,sin tocar previews. Main074 se lee/compila sin editarlo;el servidor160 del corte está aceptado como opt-in pero sus lanzadores aún no lo activan. El HTML mínimo prueba arranque/API,no la UI.

**Evidencia anterior del otro Codex163,leída y atribuida:**banco original por fuentes2/3 y1/3,solo por no acreditar salud en su bucle de5segundos;compilados3/3;su copia privada de espera ampliada3/3 y su mutante sin guarda falla con409. Esas ejecuciones son del revisor y no se suman a las propiasR2. Las primeras limitaciones se conservan en su dictamen. No se identificó un defecto en la guarda de runtime ni se acepta090 solo para liberar una reserva.

Nuevo hash del banco:`1a3e0c6151cca9b38c6e50f42c098dcbe7709ca91745e4ed8b3ad04498b0cbd0`. Submit sella el informe. Siguiente:dictamen ajeno sobre090R2;solo después puede otra unidad reservarruntime para activar160. No se activa CAS ni se actualiza un runtime por presentar este banco.

## Historial R1 · Bootstrap conserva diagnóstico de un plan dañado

31/10/2026, 16:16:55, Europe/Madrid. Autor Codex. runtime de esta reserva y main deCOPY074.

Con snapshot ausente, un plan persistido inválido impide restaurar automáticamente la semilla del paquete; el servidor sigue disponible para consultar el diagnóstico. No se borra ni sustituye el plan, ni se presentan los registros de la semilla como datos restaurados. El arranque ordinario sin corrupción sigue restaurando la semilla legítima.

Tres pruebas con procesos/entrypoints reales, basesSQLite ficticias nuevas, HTML mínimo propio y puertos efímeros: main corrupto, runtime corrupto y runtime normal.3/3fuentes y3/3ejecutables finales. Dos controles de corrupción fallan ante las fuentes355previas, con error409 de restoreBundle que terminaba el proceso; logs preservados. No es un fallo de importación/puerto ni una prueba del equipo original. El HTML mínimo verifica disponibilidadAPI/arranque, no renderizadoUI. No se suman las dos ejecuciones de los mismos3casos como6casos distintos.

Logs bootstrap-source.log/bootstrap-baseline.log/bootstrap-compiled.log en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/final091-36a2d7eb-c634-49c3-8443-c8481cbf2d5d; carpetas únicas tests/.tmp/bootstrap090/case-* con bootstrap.log. Los procesos se cierran por sus handles propios y no se borran evidencias.

Candidata final: tests/.tmp/release-candidates/candidate-42c5f15c-99a2-4f4d-bd96-275f84c47f0f;357 fuentes/23 artefactos, snapshotStable:true y liveSourcesStillMatch:true al cierre de la captura. Typecheck,Vite,seis bundles,activos públicos y162 pruebas Node correctos. Sigue approved/deployed/releaseEligible:false por revisiones y exclusiones declaradas. No es imagen íntegra del repositorio ni reconstrucción en máquina limpia. Dependencias existentes, sin nuevas instalaciones.

Los116 focales y24E2E se ejecutaron contra candidate-d4cc1c48-2201-48d9-94de-2bab0fb2faf0. El cierre final conserva todas las fuentes R1 de negocio/UI y21/23 artefactos idénticos; solo server.mjs/runtime.mjs cambian por las condiciones de arranque. Tres pruebas de arranque adicionales pasan contra fuentes finales y contra ambos ejecutables finales. Detalle de comparación y logs en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/final091-36a2d7eb-c634-49c3-8443-c8481cbf2d5d. No se suman repeticiones como pruebas únicas.

La app abierta PREVIEW083 en4420/4421 conserva sus artefactos anteriores: no incluye automáticamente R1. Ambos health200 comprobados en esta continuación. No se reemplazó/reinició esa vista, no instalaciones4331/4334, equipo original, proveedores, cuentas, claves, build/dist raíz, commit/push o despliegue. Fuentes para revisión independiente; no autoaceptación.

## Hashes

- server/runtime.ts: `b1324021f93ba8be9bf9acce5d5067e5ecd5c7db5af8559b71668b53f77b4ca5`
- tests/recovery-bootstrap.test.ts: `2843371c830f84a2683f0bb3ca666377f8134ecb7b172e00391bba3482794767`

server/main.ts pertenece aCOPY074 y su hash se registra allí. submit sella informe.
