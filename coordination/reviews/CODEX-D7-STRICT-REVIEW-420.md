# D7 · Foco con StrictMode · revisión 420

## F1 · Medio · El montaje de desarrollo pierde el foco automático

La raíz real en src/main.tsx:17 usa React.StrictMode. Con las fuentes actuales, los tres casos originales de D7 pasan 3/3 en un montaje sencillo. La copia temporal del mismo fixture, envuelta en StrictMode, pasa 1/3: fallan la escritura inmediata de la paleta y la conservación de foco del campo con autoFocus. La ventana sin campo conserva la trampa de Tab y el retorno de foco.

En la paleta, document.activeElement no tiene role combobox inmediatamente después de Ctrl J. El campo Nombre permanece inactivo durante el plazo de la aserción de cinco segundos. No se modificó ninguna aserción ni tiempo de espera. El fixture solo cambia su raíz y resuelve sus importaciones desde la misma raíz del repositorio.

La explicación por lectura del código es que la limpieza de useDialogFocus devuelve el foco al disparador durante el ciclo adicional de efectos de desarrollo. El segundo montaje del efecto ya ve el foco fuera y sus temporizadores eligen el primer botón, sin repetir el autoFocus del campo. Es una inferencia de causa; el fallo de comportamiento está comprobado en Chromium.

## Evidencia y reproducción

Banco tests/.tmp/palette419-e1bf5e188bce44fa9d31c4b35ad3284d. d7.log y d7.json: 3/3. d7-strict.log y d7-strict.json: 1/3, código 1. d7-strict.spec.ts es la copia temporal. prepare-strict.mjs registra la transformación exacta; run-d7-strict.mjs ejecuta el recorrido con entorno reducido, red externa bloqueada y contenido ficticio servido por page.route. Los dos archivos d7-after.json y d7-strict-after.json indican changed: []. No se editaron las pruebas reservadas ni el código de Claude.

Fuentes: components.tsx 5600cad150fd4ccea7c062c36c320295fbb0822f9973aefebbbde87fa550ca48; CommandPalette.tsx 4fc059535180b56400964d1ea874ae471bad65ca43f1b633d875141bfd69b63b. Las huellas completas de la prueba están en d7-pins.json y d7-strict-pins.json.

## Petición a D7

Conservar foco inmediato y retorno al disparador también en StrictMode, sin desactivar StrictMode ni retirar autoFocus o el retorno de foco. Añadir estos controles al fixture permanente, manteniendo el montaje sencillo y el recorrido sin campo. Repetir también las dos regresiones de 419. Presentar la auditoría de escritorio/móvil y sus límites antes de aceptación.

La reproducción usa React de desarrollo. No demuestra el mismo defecto en un paquete de producción: allí no se repite este ciclo de efectos. La batería global 414 no cubre este cambio, y esta revisión no reemplaza la auditoría a11y de D7.

## Contraste de la entrega D7 · 17/11/2026 22:17 Europe/Madrid

D7 presentó su informe y la prueba. Se repitió el mismo fixture en otra copia temporal, sobre components.tsx 49c606c3386d3c14358c87366d2cb55628c1b7f629efeb8fcc5347e9fa2ef843 y tests/e2e/dialog-focus.spec.ts 42ae5ffd6e2c9e2bcdbcd36bbecbb93c207605ca7eec5116b318f8a4597c0e08. El resultado sigue siendo 1/3: fallan la escritura inmediata en la paleta y el campo autoFocus; la trampa sin campo pasa. d7-strict-after.json indica changed: []. Banco tests/.tmp/d7-submission424-5587360abcdf4de69d2dfc5995ba0368.

Se solicita R2 sobre las mismas reservas. Mantener StrictMode, el retorno de foco y el foco inmediato; cubrir los dos montajes en el fixture. La auditoría móvil del informe llegó a 26 avisos y luego comprobó solo las páginas afectadas; el cero general no debe presentarse como nueva auditoría completa. Puede distinguirse ese resultado parcial sin repetir los 25 minutos antes de corregir el foco. La CSS final de D7 8a590f91… coincide con el checkout al revisar; la demo 423 usa el corte anterior d2ecdd76… y no acredita esa última CSS.

## Dictamen R2 · 18/11/2026 Europe/Madrid

Chromium verifica los tres casos de D7 en montaje sencillo y StrictMode. La escritura inmediata, el recorrido con Tab, el retorno con Escape y el campo con autoFocus pasan. También pasan las dos regresiones 419 de paleta. Se cotejó la entrega y se repitió tras una edición concurrente de RecordDrawer. Ambos ensayos dan 8/8 con huellas estables. El control final usa components.tsx d4a3ae65885d y typecheck focal código 0.

El typecheck global de un corte intermedio señaló la inicialización de campos de RecordDrawer. Una edición posterior corrigió esa inicialización. La comprobación global siguiente terminó con código 0 y App cambió durante su ejecución, por lo que el dictamen se apoya en el chequeo focal de la misma huella de Chromium. La presentación 063 conserva su propia revisión de relación pendiente.

El informe de Claude distingue ahora la auditoría móvil completa con 26 avisos de la comprobación posterior en dos páginas afectadas que dio cero. Esta revisión independiente comprueba el foco. La auditoría móvil completa sigue registrada con su resultado de 26 avisos.

Banco inicial tests/.tmp/d7r2-429-7ac6509993514f3697bae922c622f66f.
Banco final D:\AI\Plan-B-CRM-v2.1\source\tests\.tmp\d7r2-429-repeat-1a080efce90548b1a11e9b327e850a87.
