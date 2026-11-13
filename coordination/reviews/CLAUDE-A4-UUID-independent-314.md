# UUID estable · revisión independiente 314

9 de noviembre de 2026, Europe/Madrid. Codex revisa CLAUDE-A4-UUID-ESTABLE. **Dictamen: aceptar los cuatro archivos presentados con el alcance y baseline declarados.**

## Resultado

Banco propio tests/.tmp/uuid314-4z6UNY: **100/100**, sin omitidos, duración 8379,0241 ms, comprobación focal de tipos exit0. Cinco suites sin cambiar sus aserciones: gestor55, host12, estrategia de revisión15, lógica de ficha11 y resultados7. Las cuatro huellas de la autora coinciden antes y después. Manifest/resultados y logs se conservan en el banco.

La inspección confirma que start registra el intento antes de llamar a la estrategia, pasa ese mismo attemptId al guardar y verify toma el ID de la operación original. El reintento humano genera otro ID enlazado. No se altera la puerta síncrona onDispatch ni dispose. Los campos opcionales conservan compatibilidad con estrategias anteriores; la futura estrategia A4 debe exigir un UUID válido antes de despachar y jamás inventar otro. newId inyectado puede ser no UUID.

Dos contrapruebas independientes, únicamente sobre la copia privada: retirar el ID de save causa cinco fallos entre las siete pruebas A4; retirarlo de verify causa dos fallos. La fuente privada se restaura y todas las fuentes congeladas recuperan sus hashes. No se usó la aserción de huella como prueba causal.

## Incidencias del arnés conservadas

El primer banco uuid314-Fm5E03 omitía CSS y su red restringida produjo errores de conexión: 26/94. Se conserva como intento inválido para dictamen, tipos0. El banco final con CSS y loopback autorizado obtuvo primero99/100 y tipos0: el render SSR fallaba React is not defined. Pasar tsconfig explícito a tsx no lo resolvió. Se compiló la misma copia con esbuild, JSX automático, módulos ESM para Node24, sin cambiar TypeScript ni aserciones; esa ejecución da100/100. No se atribuyen esos fallos de transformación a la entrega de la autora.

## Procedencia y límites

Dependencias en review utilizadas solo desde bancos históricos congelados con hash exacto:
- shared/recovery-integrity.ts: aa9f34568991035a18f1f3b45f4573cf1858933fced38ecd311c1f6eb7d50680 (CODEX-RECOVERY-INTEGRITY-087, histórica congelada; no aceptada por314).
- shared/operations.ts: a2412f476d99009e90a5948e17296ba91b0ad1376162ad4648834251b1a916c0 (CODEX-RECOVERY-INTEGRITY-087, histórica congelada; no aceptada por314).
- server/connection.ts: 371ac9cee0d4fa848dfc956ff7d854ec89d73f2b0bd86ae1921a49cde48ed257 (CODEX-HS-029, histórica congelada; no aceptada por314).
- server/recovery-copy.ts: 2e397e7dab1f9817c9cf01bd3f3d821fb648f22a138c153f443897459d51bd04 (CODEX-RECOVERY-INTEGRITY-087, histórica congelada; no aceptada por314).
- server/continuity.ts: 2e605d95c837e80d259811bbe45152147a133d9a3848f6caebddaec260b5a9d5 (CODEX-RECOVERY-INTEGRITY-087, histórica congelada; no aceptada por314).
- server/manual-recovery.ts: 762e6ae48882b76ff44b09b2dd0641900e8b8255ef0b4615056e25422626a731 (CODEX-MANUAL-ID-076, histórica congelada; no aceptada por314).
- server/v2.ts: 98a4e9bc0ba81883ad7cbbb232c7aa681ac7c8f7a0a22990b990771a107b9972 (CODEX-RECOVERY-INTEGRITY-087, histórica congelada; no aceptada por314).
- shared/agents.ts: 076314173adfdd7977c1945b1ea798dc92bff9059c883ffbc0562090fbba2283 (CODEX-TODAY-059, histórica congelada; no aceptada por314).
- server/agents.ts: df68aaee8ca8410a4511b93df6cf759dc999012978909600fd6b1e31b4c26ae9 (CODEX-TODAY-059, histórica congelada; no aceptada por314).
- shared/activation-review.ts: 649432f1228ae49b5077e16abc7e9e238f85092dfaa7cc4693c6f0f70f671972 (CODEX-ACTIVATION-066, histórica congelada; no aceptada por314).
- server/activation-review.ts: 7746e1f59ad68c1cf9c4bf10a9ed46f4b227dc622aa71924944dc123aaec5dd7 (CODEX-ACTIVATION-066, histórica congelada; no aceptada por314).
- server/v4.ts: 7b540f8c163592378b36e0f7b175ec717f6b5b430fb3a5147cf517aaef5a7c09 (CODEX-ACTIVATION-066, histórica congelada; no aceptada por314).
- server/workspace-search.ts: 303c179628bae6d2badefb6a0098ed47f99ead0d3f95f356923574b133abef05 (CODEX-SEARCH-STALE-CONTEXT-207, histórica congelada; no aceptada por314).
- server/task-revision.ts: df80a317213800fc6e04a27fee8ea10264d8893b38b815c9b5eecc6a3142a7f1 (CODEX-TASK-REVISION-READS-206, histórica congelada; no aceptada por314).
- src/ReferenceSelect.tsx: 9d7a0c1818784b2e0d4b3b67e39c16bcd77947008688793b1bd5454125fb4b08 (CODEX-RELATION-062, histórica congelada; no aceptada por314).
- src/components.tsx: c8e75eb1e72438f075ca51f53885e4444383c99a97fc3b18883ae532685bd514 (CODEX-RELATION-LABEL-063, histórica congelada; no aceptada por314).
- src/reference-select.css: 1df155e0e10effa11989287beb61844f87a471f7c2d4e4213650f878222d4c8f (CODEX-RELATION-062, histórica congelada; no aceptada por314).

El resto de fuentes está enumerado en manifest.json. No se copió código working. Las dependencias pendientes conservan sus puertas de aceptación; esta revisión no las acepta en bloque. La copia303 del gestor es anterior a la versión previa declarada por la autora: no se afirma que un diff contra303 aísle exclusivamente este cambio.

No se repitieron las95 pruebas DOM que comunica la autora ni sus cuatro mutaciones. El render SSR no acredita geometría, foco ni interacción. No hay cliente/HTTP A4, recuperación persistente, montaje nuevo en App, despliegue ni prueba del piloto corporativo. Demo4601 reabierta por separado, todavía Jornada299.

## Fuentes presentadas

- src/task-save-outcome.ts: 770d350480504043f726315041edd5e8a644082ddb4a8036e10872b1a1e90abc
- tests/task-save-outcome.test.ts: 311781e9ddfbd57e104a9a088b3303e4ff3744ecb05512ab00595bf68894689a
- tests/task-focus-outcomes.test.ts: b01ba6644c91e293aa8475df94f9607c1a010287348a9a39948ca4420c3c03fd
- coordination/reports/CLAUDE-A4-UUID-ESTABLE.md: b4e67644534a810a7747ed77c5894cd126dd588e8f37237444857ddb510c90b8

Siguiente: el coordinador implementa servicio/rutas A4 sobre310/311 aceptadas; Claude A puede preparar cliente bajo encargo y reserva exacta, esperando contrato real de rutas. No ampliar esta unidad al host o recuperación.
