# SAFE049 · Cobertura verificable de una copia portátil

30/10/2026, Europe/Madrid. Codex. El usuario pide revisar lo que hace Opus y desarrollar otra misión en paralelo. **Código nuevo en módulo/CLI;37/37 pruebas y typecheck propios correctos. Pendiente de revisión separada, sin pantalla, endpoint o instalación nueva.**

## Problema y comportamiento

Una copia puede ser válida y restaurable en memoria pero no cubrir los últimos cambios de otra exportación. BACKUP041 responde a integridad; SAFE049 compara dos archivos explícitos y responde a cobertura respecto a la referencia aportada. No lee el Store vivo ni considera que esa referencia sea necesariamente la última revisión.

- `matches-reference`: misma revisión según el contrato existente bundleRevision. Ignora exportedAt; conserva semántica de orden de arrays y todo el estado de sesión/devolución/configuración.
- `missing-local-changes`: copia con historial prefijo estricto y resto del contexto íntegro idéntico. Solo aquí cuenta operaciones no cubiertas. Un valor revertido sigue dejando dos cambios en historia aunque los registros actuales coincidan.
- `different-revision`: divergencia, dirección inversa, configuración, sesión o watermark de devolución distintos. No ordena revisiones por fechas ni presenta recuentos de registros como cambios.
- `incompatible`: límites de portal/origen/entorno/clase/tipo de cuenta/captura. Las diferencias históricas entre capturas pertenecen a DIFF040, no a una afirmación de cobertura.
- `invalid`: formato, tamaño, contraseña o integridad incorrectos. No sigue comparando parcialmente.

Salida limitada a hashes de bytes/revisión, fechas de metadatos, recuentos completos, motivos y siguiente paso; no valores, campos, nombres o IDs de fichas. La identidad se usa internamente sin reflejar los identificadores de portal/captura en el resultado. No guarda contraseñas o resultados ni toca datos de una instalación. Cada JSON pasa por la restauración de prueba existente en Store(':memory:').

## Uso de CLI

```powershell
node --import tsx scripts/check-backup-coverage.ts --help
node --import tsx scripts/check-backup-coverage.ts --reference REFERENCIA.json --backup COPIA.json
```

Sin argumentos muestra ayuda. Opcional `--passwords-stdin`: stdin contiene JSON con claves reference/backup y contraseñas independientes (opcionales). Ninguna contraseña por argv. No se crea archivo de contraseñas. Lectura stdin limitada a4096 bytes; cada archivo regular a32MiB con lectura acotada también si crece. Rechaza enlaces de archivo y errores sin reflejar rutas/contenido. Marca sameInputFile por identidad/ruta real; ni dos rutas diferentes ni dos hashes diferentes acreditan custodia externa.

SalidaJSON; código0 coincide,1 no coincide/incompatible/inválida,2 uso/lectura. El0 no significa recuperación garantizada, RPO/RTO medido o copia fuera del equipo. La herramienta trabaja en fuente con dependencias ya instaladas; no está añadida al runtime o HTTP del piloto.

## Validación propia

Snapshot final: `tests/.tmp/safe049-final-e7356f81-f70a-4b46-8d2f-845919cb7dc1`. Fuentes con SHA-256 en manifest.json; resultados en results.json. Sin proveedores ni listeners. Tests CLI ejecutan subprocesos reales, con entorno saneado, block-external y archivos ficticios nuevos dentro del snapshot.

```powershell
node --require scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/backup-coverage.test.ts tests/backup-coverage-cli.test.ts tests/recovery-preflight.test.ts tests/recovery-preflight-cli.test.ts
node node_modules/typescript/bin/tsc --noEmit --project RUTA_SNAPSHOT/tsconfig.json
```

- **37/37**:20 nuevos (15 módulo +5 CLI),17 existentes BACKUP041. SinTODO/skipped. Log coverage-final.log. Typecheck completo del snapshot correcto, typecheck-final.log.
- Igualdad de revisión frente a exportAt/orden de claves; cifrados aleatorios con contraseñas distintas y mismos contenidos; inversa e historia divergente; valor revertido; retorno con watermark distinto y misma lista de registros; configuración y sesión distintas.
- Identidad incompatible, corrupción con JSON válido, producción cifrada ficticia, contraseñas erróneas/faltantes, límites y stdin malformado; canarios de privacidad ausentes y bytes/Store llamante intactos.
- **10.000 registros**: un cambio al final del inventario se detecta sin truncar por tamaño visible. Igualdad de registros no oculta historia adicional.
- Primera ejecución36/36 y después caso10.000 incremental1/1; suite final37/37 tras el nuevo caso. No sumar las ejecuciones repetidas como casos únicos. Snapshot inicial de progreso preservado por sus hashes; snapshot final separado.

## Revisión de Opus durante el desarrollo

OPS048 estaba working y luego presentó seis archivos. Se ejecutaron sus10 pruebas Node sobre copia congelada y se revisaron las fuentes/informe. **Caso nuevo P2 reproducido:** retirar del historial una captura con comparación pendiente no invalida req; respuesta vieja reaparece como resultado/paginación junto al aviso de indisponibilidad. La prueba adversa del revisor falla en temporal. Se cotejaron los seis hashes al submit y se registró revise con reproducción; autor conserva sus seis reservas working. No se editaron sus fuentes.

Informe y corrección requerida: coordination/reviews/CLAUDE-OPS-048-progress.md. Los105 focales/4+8E2E del autor se mantienen atribuidos; Codex no repitió navegador ni ocupa su ventana. No confundir10verdes de su suite con aceptación integral o afirmar lectura del aviso por Claude.

## Plan, estado y límites

Plan propio: coordination/plans/RECUPERACION-VERIFICABLE-049.md. Secuencia: revisión BACKUP041/SAFE049; corregir/aceptar OPS048; consumidor de recuperación con unidad exacta posterior; ensayo en carpeta nueva ligado a revisión; candidata integrada con respaldo vigente y comprobación servida. No añadir esa UI a mitad de la reserva de Opus.

SAFE049 conserva siete archivos propios exactos disjuntos de OPS048. Memoria/panel actualizados bajo LAB035 solo documental, código anterior intacto. REL033 y revisiones previas siguen pendientes; no se autoaceptan para limpiar cola. Sin cuentas o bases reales, DPAPI, perfiles personales/corporativos, proveedores, dependencias, build/dist raíz, despliegue, commit o push. Reutilizar BACKUP041 pendiente de revisión no equivale a aceptarla.

La salida no es una firma de autoría ni una prueba de disponibilidad operativa, custodia separada o recuperación futura. Se compara lo aportado con su procedencia declarada; no inventa una certificación de negocio recuperable.

## Hashes de entrega de código

- server/backup-coverage.ts: be819d0ab21cae9501fac5f15c19190f6a94becd02c62936f93873641a3a6940
- scripts/check-backup-coverage.ts: 2f97d79e172e4c9955ed49c22b53e4376bd270c7e39d0b0da2859967ae7ebd98
- tests/backup-coverage.test.ts: e591ca2e91d9b1830bb687d83ed9d811bdcea95b790f4a479c8deaccd87e6c66
- tests/backup-coverage-cli.test.ts: e35a5be88f6facad8ad293f197188a7d42593eca0b73deb78b1c21fc009f76ea
