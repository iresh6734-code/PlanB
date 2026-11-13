# R2 · Vigencia temporal de las alternativas (dictamen 303, F1)

**Hallazgo:** con la ficha abierta y el reloj 25 h más tarde, `Llevar al formulario` seguía ofreciendo fecha propuesta y «No faltan datos de evidencia» (el cálculo dependía solo del detalle). Reabrir con el mismo reloj sí lo reconocía antiguo.

**Corrección (solo `CommitmentRadar.tsx`):** la evidencia se **revalida con el reloj actual** en dos momentos, sin sondeo: (1) **al llevar** una alternativa al formulario se vuelve a simular con `clock()` y la sección de alternativas pasa a mostrar ese cálculo; (2) **al guardar** una alternativa preparada antes se simula otra vez y, si cambió su fecha propuesta o sus datos que faltan, **no se envía**: se actualiza la instantánea, se explica qué cambió (con fecha y hora completas), se desmarca la confirmación y se pide revisar y confirmar de nuevo. **Se conserva lo escrito a mano** (siguiente paso y fecha editados); solo se refresca lo generado sin editar (si la fecha propuesta deja de ser válida y era la generada, se quita y se avisa). **No es una prohibición**: con datos incompletos la persona puede decidir si elige fecha y confirma la casilla, que ahora dice cuántos datos faltan. No basta cambiar la revisión ni poner «ahora» al cálculo antiguo: la regresión comprueba el resultado recalculado.

**Regresiones nuevas (4, 15 en total):** llevar tras 25 h (fecha vacía, antigüedad nombrada, 0 escrituras, aún se puede decidir con fecha y confirmación: 1 envío); preparar y confirmar tras 25 h sin cambio de revisión (0 envíos al guardar, aviso, edición conservada, confirmación obligada de nuevo, luego 1 evento); **control** con evidencia vigente (1 h después se guarda sin aviso, con la fecha propuesta, 1 evento); fecha escrita a mano no se sobrescribe. El arnés avanza el reloj con `window.__clockOffset` (sin tocar servidor ni esquema). **Con la versión anterior fallan 3/4 y el control pasa en ambas.**

**Ejecuciones R2:** 15/15 en tres ejecuciones sin reintentos; Radar 19/19; `tsc` limpio. **Contrapruebas R2: 4/4** (no revalidar al guardar, reutilizar el cálculo antiguo al llevar, no reconfirmar, pisar el texto manual). No se tocó `shared/commitment-report.ts` (reserva 305 de Codex).

**Huellas R2 (LF):**

| Archivo | SHA-256 |
| --- | --- |
| `src/CommitmentRadar.tsx` | `e3b0bec2a37c87c118d42f8a8485378fbee2ee1e918a90a4c9135a39bf1dc08a` |
| `src/commitment-radar.css` | `4023477f0f544c54e831f5a16943b0365fcc7b04a5ff9760a65ada2035baad0f` |
| `tests/e2e/commitment-radar-scenarios.spec.ts` | `aa7c866300aabc18bfa400e931027fb20b955d26860bb22935dd35a5869e8efa` |

# CLAUDE-COMMITMENT-RADAR-SCENARIOS · alternativas, cronología y exportación en la ficha del Radar

Autor: Claude A. Cuatro archivos: `src/CommitmentRadar.tsx`, `src/commitment-radar.css`, `tests/e2e/commitment-radar-scenarios.spec.ts` y este informe. Reutiliza sin editarlos `shared/commitment-simulation.ts` y `shared/commitment-report.ts` (aceptados). **Estado: pasa solo por el arnés del Radar** (CORE real, conjunto ficticio, SQLite de archivo, red bloqueada); el Radar sigue sin montar en la App (`CODEX-COMMITMENT-RADAR-MOUNT`).

## Qué puede hacer una persona (cuando esté montado)

En la ficha de un compromiso, bajo la evidencia:
- **Alternativas** (calculadas en memoria con `simulateCommitment` sobre el detalle leído; rotuladas «solo en memoria»): *Retrasar dos días* (fecha comprometida + 48 h, supuestos y datos que faltan) y *Buscar stock alternativo* (sin fecha prometida, «efecto desconocido», con los dos datos pendientes). Con evidencia ausente, caída, parcial, antigua o ambigua la fecha propuesta es «ninguna» y se nombra qué falta. Un compromiso cerrado muestra el motivo y no ofrece alternativas.
- **Llevar al formulario de decisión** (un único formulario): rellena el siguiente paso con «Alternativa «…»: …» y, solo en retrasar, la fecha propuesta; el foco pasa a «Responsable». Responsable y fecha son de la persona; hace falta marcar **«Confirmo que llevo esta alternativa…»**. Nada se guarda hasta «Guardar asignación» (revisión esperada y clave de operación, como siempre).
- **Cronología del incidente** (derivada del mismo detalle e historial, no otro almacén) que distingue *Evidencia observada*, *Decisión humana* y *Cierre manual (decisión humana)* / *Cierre con evidencia observada, confirmado por una persona*. Las simulaciones no figuran: viven en memoria.
- **Descargar HTML / JSON** (`createCommitmentReport`) de la misma lectura que se ve: nombre con ID y 8 caracteres de la revisión. Exportar no hace ninguna petición.

## Decisiones y límites

- **Procedencia de la alternativa**: el contrato de decisiones no tiene campo estructurado; la alternativa viaja como prefijo editable del texto del siguiente paso. Si se quiere un campo (p. ej. `source`), es un cambio de contrato de Codex.
- **Revisión vigente**: el borrador recuerda la revisión sobre la que se calculó; si cambia (409 u otra lectura) se avisa, la casilla se desmarca y se deshabilita, y guardar exige volver a llevar la alternativa. Tras un 409 el borrador se conserva (ya lo hacía R2).
- **Reloj**: la antigüedad de la evidencia se evalúa con el reloj del navegador (prop `clock` solo para pruebas con servidor de reloj fijo). Si el reloj local precede a una observación, se muestra «No se pudo simular».
- **HTML a 320 px**: no desborda ni ejecuta el contenido, pero su tabla de 5 columnas queda muy estrecha y el texto se parte; el motor de informes está aceptado y no se toca aquí (mejora sugerida: tarjetas apiladas bajo 480 px, unidad propia).
- **No incluye** relevo operativo (otro contrato) ni persistencia de simulaciones.

## Pruebas (11 casos, 3 ejecuciones seguidas sin reintentos: 1,8 / 1,9 / 1,8 min)

Alternativas con fecha propuesta calculada por un oráculo propio (fecha comprometida del API + 48 h) y 0 escrituras; datos ausentes (fuente caída, ambiguo); llevar al formulario → faltan responsable y confirmación → un evento con la alternativa en su texto y `dueAt` igual a la fecha propuesta; dos pestañas (una decide, la otra conserva su borrador desde una alternativa: 409, casilla desactivada, borrador intacto, `[200, 409, 200]`, 2 eventos); acuse perdido con una alternativa (comprobar leyendo +0 envíos; reintento explícito con la misma clave: 2 POST, 1 evento); cronología y exportación (JSON y HTML con el compromiso y la revisión correctos, contenido hostil escapado como dato, el archivo se abre sin ejecutar nada y cabe a 320 px, 0 escrituras y ningún evento nuevo); reinicio del servidor (mismo historial, revisión y cronología); cerrado manual y observado; teclado y 1440/390/320 (sin desbordamiento, objetivos táctiles, foco devuelto al botón). Capturas inspeccionadas: `alternativas-{1440,390,320}.png`, `cronologia-{…}.png`, `pelicula-320.png`.

**Contrapruebas: 7/7 detectadas** (guardar sin confirmación, alternativa de otra revisión, llevar de nuevo sin reconfirmar, archivo de otra revisión, HTML/JSON intercambiados, simulación no rotulada como memoria, motivo de cierre oculto). Archivo restaurado y comprobado.

**Regresiones:** Radar 19/19 con el componente nuevo; `tsc` limpio.

## Huellas (SHA-256, LF)

| Archivo | SHA-256 |
| --- | --- |
| `src/CommitmentRadar.tsx` | `6ad5c443819a69d19dafc72bd46ec8de1c746e427ecf5bacfd3d762243336881` |
| `src/commitment-radar.css` | `4023477f0f544c54e831f5a16943b0365fcc7b04a5ff9760a65ada2035baad0f` |
| `tests/e2e/commitment-radar-scenarios.spec.ts` | `f2cd863bd289590f58acd53587dd82d90b6be8d9815c944662ac61b2d657a4f6` |

## Siguiente

- Montaje central del Radar (Codex) y repetir estos casos con `main` compilado.
- Relevo operativo: unidad propia y contrato.
- Informe HTML responsivo a 320 px: unidad propia.
