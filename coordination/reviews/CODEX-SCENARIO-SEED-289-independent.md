# Revisión independiente de semilla 289

8/11/2026, Europe/Madrid. Revisor: este chat Codex. **Favorable para el helper interno y su contrato de montaje.** No acredita todavía Radar en la App.

Se cotejaron las cuatro huellas presentadas, el escenario multisistema aceptado y una copia fija de sus dependencias. Repetición propia en `tests/.tmp/seed289-independent-ZsMVPL`: **20/20 Node** (doce de la semilla y ocho del escenario), sin omisiones ni cancelaciones, 14,44 s. Tipos focales: exit 0. El manifiesto conserva todas las fuentes copiadas y se verificó igualdad después del banco y de los cuatro archivos del checkout. Script: `tests/.tmp/review-seed289.cjs`.

El código conserva un marcador pequeño por instalación. La inicialización es explícita, transaccional y exclusiva de copia activa ficticia. Una lectura no crea ni repara el marcador. Los reinicios recuperan el mismo dataset sin consultar un reloj nuevo; la evaluación mantiene reloj actual y envejece la evidencia. No hay renovación silenciosa de fechas o traslado de decisiones.

La prueba API real acredita asignación, reinicio y recuperación del historial con la semilla persistida. El control que regenera el dataset con otro instante deja de mostrar el historial de la revisión anterior, y volver a la semilla vuelve a mostrarlo. El caso de dos procesos acredita el candado cooperativo existente y conservación por un proceso posterior. No se presenta como CAS entre procesos que ignoren ese candado.

Marcadores null, versión desconocida, otra instalación, forma o hash incompatibles y cifrado ilegible quedan intactos e indisponibles. Un fallo después de set revierte la transacción. Copia de producción e identidad ausente no revelan el escenario. El soporte de archivo conserva cifrado y dataset después de reabrir. Los objetos devueltos no mutan el marcador.

No se encontraron procesos vivos al consultar CIM limitado a la raíz del banco. No hubo navegador, main, App, proveedores o cambios en 4601. Las cuatro mutaciones son evidencia del autor; no se repitieron en esta revisión. Los intentos anteriores de fixtures incompletas y dependencia dinámica omitida se conservan y se describen como problemas del arnés, sin atribuirles defectos de producto no demostrados.

Huellas de la presentación aceptada:

| Archivo | SHA-256 |
| --- | --- |
| `server/commitment-scenario-seed.ts` | `98bc0ebc20649eda5af34e53b7e8676f15277e26f763fe54196b037363c1f57b` |
| `tests/commitment-scenario-seed.test.ts` | `bd58f78b75d28fc117b884c8b5b47a1313ae2b2a08b7c744cddec1112a33f4f5` |
| `coordination/plans/COMMITMENT-SCENARIO-SEED-289-CONTRACT.md` | `dd8a1b6b95c2c05cdb913ec31033becb8b36bc45ca6b6f57943c57d0211f3de6` |
| `coordination/reports/CODEX-COMMITMENT-SCENARIO-SEED-289.md` | `a6c944906e564d6988ecbd3575bdff13934c6aa476abca18af799ee89abb5613` |

El contrato identifica correctamente el siguiente hueco: `registerCommitments` recibe un dataset estático. La activación explícita desde una instalación sin copia activa y la provisión posterior requieren diseño de montaje; este helper no las resuelve. No se debe crear una semilla desde un GET ni congelar el reloj de evaluación en seedAt. Un generador nuevo necesita migración explícita; un marcador inválido no se reemplaza para ocultar el error.

El montaje se mantiene en `CODEX-COMMITMENT-RADAR-MOUNT` con sus puertas vigentes. La cobertura A4 del cuaderno de guardados sigue siendo independiente y falsa hasta su instrumentación aceptada. Se acepta 289 por los hashes anteriores. Este dictamen se presenta para revisión cruzada, sin autoaceptación.
