# Revisión independiente de activación 291

8/11/2026, Europe/Madrid. Revisor: este chat Codex. **Favorable para el backend y su contrato**, sin atribuir interfaz montada, actualización de demo o cobertura A4.

## Repetición del corte

Se cotejaron las seis huellas presentadas y la procedencia aceptada de las pruebas de regresión, semilla 289 y escenario multisistema. Se copió el corte fijo a `tests/.tmp/activation291-independent-VJYbq8`, sin consumir cambios activos de otros agentes. El script es `tests/.tmp/review-activation291.cjs`; su result.json conserva manifiesto y presentación.

Repetición propia de los seis archivos de prueba: **55/55 Node**, sin omisiones ni cancelaciones, 30,87 s. Tipos focales exit 0. Se verificaron otra vez fuentes privadas y las seis huellas del checkout al terminar. Red externa bloqueada, entorno acotado, SQLite ficticia en memoria/archivo y carpetas nuevas. No se usó navegador ni 4601. CIM posterior limitado a la raíz propia no encontró procesos vivos.

Son 19 pruebas nuevas y 36 regresiones: montaje y proveedor por petición, CORE estática y autorización, semilla y escenario. Los cinco mutantes del informe son evidencia del autor; no se repitieron en esta revisión. No se ejecutó npm test completo.

## Revisión funcional

El registro conserva la validación/copia del dataset estático y permite un proveedor local síncrono. Cada petición dinámica captura y valida una sola copia; revisión, evidencia, definición, clave del diario y recibo usan ese corte. Un origen ausente o incompatible devuelve indisponibilidad y revalida permiso/contexto incluso cuando el proveedor lanza. No acepta datasets o rutas de disco del navegador.

El módulo se puede registrar sin copia activa. GET de capacidad y GET de CORE no crean la semilla. POST de activación requiere ficción activa, pin estricto y autorización original, con revalidación después del reloj y antes de publicar. Un marcador inválido se conserva y no se devuelve éxito si la relectura final ya no acredita available. Las lecturas mantienen las tablas, y activar no modifica registros o historial CRM.

Los casos de archivo demuestran activación explícita, decisión y conservación después de reiniciar. La semilla sigue fija y el reloj de evaluación actual envejece la evidencia. El candado cooperativo se acredita mediante la regresión 289, sin extenderlo a escritores que ignoren dicho protocolo.

## Huellas aceptadas

| Archivo | SHA-256 |
| --- | --- |
| `server/commitments.ts` | `3de235166d2c89488e937bd849fe684be76c1cc8f4823d1e06b32f52891bb70f` |
| `server/commitment-radar-mount.ts` | `fbc88df7bcee7db09eaada039aa5e14bcd50e4251bcbe60f5531eb9050c0859e` |
| `tests/commitment-radar-mount.test.ts` | `6125e819f1d6d48f4667209e2611ff0219939ffda932454666a447fb8e3ef039` |
| `tests/commitment-dataset-source.test.ts` | `e7ecf8290b2406da565747b78ebc950b7505cf55d166a48896f0d0ed0c5cbbaa` |
| `coordination/plans/COMMITMENT-RADAR-ACTIVATION-291-CONTRACT.md` | `b241988aec9dac07bdeda69f91a2cf5540daa18cffd02b2f81f6308b5da3eed3` |
| `coordination/reports/CODEX-RADAR-ACTIVATION-291.md` | `9f664efe160f64a05cfba879d86f9f67170233d7c0901098f62dc6f96d375c72` |

## Puerta de montaje

291 resuelve el hueco backend de registro desde instalación vacía; no introduce todavía la acción humana en la App. main/App y la candidata siguen en `CODEX-COMMITMENT-RADAR-MOUNT`, con sus dependencias y puerta de producto. Jornada A3 y Radar UI se devolvieron a corrección en unidades separadas; esta aceptación no las desbloquea implícitamente.

La futura interfaz debe consultar estado local, ofrecer habilitación explícita cuando proceda, conservar el pin y tratar el acuse de activación perdido sin regenerar fechas. El recorrido desde Hoy con reinicio debe verificarse en App/main compilados antes de darlo por visible. Ningún proveedor real se ha consultado. La semilla no habilita covers:true ni recupera guardados A4. La demo actual permanece en el corte 288.

Se acepta 291 por los hashes anteriores. Este dictamen se presenta para revisión cruzada, sin autoaceptación.
