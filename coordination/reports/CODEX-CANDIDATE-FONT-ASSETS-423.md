# 423 · Activos importados y fuentes locales de la candidata

La primera demo 422 compiló correctamente pero recibió HTML al pedir /assets/assets/fonts/*.woff2. Chromium emitió avisos de decodificación y usó fuentes de sustitución. La captura había excluido los dos WOFF2 y tres archivos de texto de src/assets/fonts. No era un defecto de la CSS de Claude: faltaban sus entradas en la copia de compilación.

## Corrección y reservas

Bajo la reserva propia REL046, candidateSourceSelection conserva los archivos regulares no ocultos de src/assets como activos opacos, manteniendo exclusiones de carpetas privadas, enlaces y límites. Vite puede emitir las fuentes referenciadas. Los avisos .txt/.md de ese directorio se copian a dist/assets con sus bytes; una colisión distinta se rechaza.

Bajo la reserva propia INTEGRITY095, el inspector admite esos activos declarados y exige que los avisos tengan una copia idéntica en runtime. Conserva el rechazo de rutas privadas, enlaces, límites y banderas de aprobación. Esta tarea 423 reserva solo su nueva prueba y este informe; no reasigna CSS, componentes ni archivos de Claude.

## Evidencia causal

Antes de corregir, las dos pruebas nuevas fallan: el selector pierde las entradas y una compilación real de Vite no emite ningún WOFF2 aunque termina con código 0. Tras corregir, el mismo fixture emite exactamente el WOFF2 original y la CSS apunta a su nombre de artefacto, sin URL sin resolver. font-baseline.log conserva los dos fallos.

Las suites focales pasan 29/29: fuentes nuevas, 23 casos de integridad (incluido el nuevo) y cuatro controles de activos/cobertura. Al retirar solo el cotejo ASSET_NOTICE_MAPPING en una copia temporal, su regresión falla; el módulo real permanece intacto. Ambos módulos superan node --check.

## Candidata y app real

La nueva candidata candidate-0c7e2616-b9e5-495f-a8f3-c41589151d78 declara 875 fuentes y 56 artefactos. Pasan typecheck, Vite, los seis bundles, activos públicos y 163/163 de integración Node. El inspector coteja sus 875/56 sin incidencias. También mantiene compatible la candidata anterior (869/51); esa coincidencia de bytes no elimina su defecto histórico de fuentes.

Se conservan Inter, Source Serif 4, LEEME y los dos avisos OFL. El runtime servido incluye los tres textos con sus hashes. Los 56 artefactos copiados se volvieron a cotejar desde otro proceso, junto a la identidad de salud y al recibo de PID.

Chromium local verifica ambas fuentes como font/woff2, HTTP 200, faces loaded. En 1366×900 y 390×844 pasan Inicio → Clientes → ficha de Lucía → Escape con foco de retorno → Continuidad. Hay contenido, título/URL correctos, cero overlays, cero errores/avisos, cero peticiones bloqueadas y sin desbordamiento horizontal en Inicio. Las capturas se inspeccionaron visualmente. La comprobación solo admite GET/HEAD al propio origen y bloquea red exterior y escrituras HTTP.

## Límites y evidencia local

Banco anterior: tests/.tmp/demo422-822319b3cc8041c2864f91cd653c10bd. Banco corregido: tests/.tmp/font423-eb8d88fd350f4ae6892a780bc0d4f972. En ellos están compilación, integración, integridad, mutante, recibos, final-check.json y browser.json. Capturas corregidas en C:/Users/iresh/AppData/Local/Temp/planb-font423-FiPmKp.

La demo es una instalación ficticia nueva de 62 registros, sin contraseña configurada, con guardia de red y puerto propio 4386. El aviso de servidor «Ensayo de relevo no disponible» corresponde a que esta instalación no tiene paquete del Kit; no se ensayó ese flujo. No se aprueba una release ni se afirma que todo el producto esté comprobado.

El corte de código es el 17/11/2026 a las 22:10:46 Europe/Madrid. La CSS final de D7 y otras ediciones posteriores de CSV/Deshacer/foco no quedan acreditadas por esta demo. final-check.json enumera las diferencias observadas. D7 fue devuelta a R2 tras repetir 420 (1/3 con StrictMode). Esta corrección de fuentes no resuelve ese defecto de desarrollo.
