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
