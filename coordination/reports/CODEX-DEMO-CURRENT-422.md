# 422 · Demo independiente arrancada y comprobada

La demo está en http://127.0.0.1:4386/. La comprobación final de otro proceso cotejó salud, recibo de instancia, PID 31960 y los 56 artefactos copiados. Se creó una base nueva con 62 registros de fixture, cuenta ficticia demo-revision-423 e isTestData true. No se copiaron bases o credenciales anteriores. La protección por contraseña no está configurada en esta demo de datos ficticios.

## Entorno y corte

Chromium headless local; Browser no está disponible en esta sesión (no hay herramientas ni skill Browser), por lo que se aplicó el fallback Playwright de frontend-testing-debugging. Viewports 1366×900 y 390×844. El servidor escucha solo en 127.0.0.1; tiene entorno reducido, carpeta nueva y preload block-external. La prueba de navegador bloquea destinos externos y métodos distintos de GET/HEAD; no hubo peticiones bloqueadas durante el recorrido.

Candidata candidate-0c7e2616-b9e5-495f-a8f3-c41589151d78, capturada el 17/11/2026 a las 22:10:46 Europe/Madrid. Sus 875 fuentes y 56 artefactos coinciden con el manifiesto; tipos, Vite, seis bundles, activos y 163 integraciones correctos. La candidata sigue con approved/deployed/releaseEligible false y reservas pendientes.

## Comprobaciones actuales

| Comprobación | Escritorio | Móvil |
| --- | --- | --- |
| URL/título Plan B y contenido visible | pasa | pasa |
| Página no vacía, un h1 visible | pasa | pasa |
| Sin overlay de framework | pasa | pasa |
| Consola sin errores ni avisos | pasa | pasa |
| Ambas fuentes locales cargadas, HTTP 200 font/woff2 | pasa | pasa |
| Inicio sin desbordamiento horizontal | pasa | pasa |
| Navegación y ficha con retorno de foco | pasa | pasa |
| Capturas guardadas e inspeccionadas | pasa | pasa |

Recorrido: Inicio → Clientes mediante navegación de la app → primera ficha (Lucía, datos sintéticos) → Escape, cierre y foco en el enlace original → Continuidad, con título y contenido. No se guardaron registros ni se activaron escenarios. browser.exit es 0 y ambas entradas de browser.json indican passed true.

## Problema encontrado y corregido durante la preparación

La primera candidata 422 omitía los WOFF2 de src/assets y Vite dejaba sus URL sin resolver. El servidor devolvía el índice HTML y Chromium usaba fuentes de sustitución. Se corrigió bajo las reservas propias 046/095 y la prueba 423, sin editar la CSS de Claude. En la candidata final las fuentes y sus avisos están presentes y cotejados. Informe CODEX-CANDIDATE-FONT-ASSETS-423.md, 29/29 focales y dos controles que fallan con el selector anterior.

La primera demo propia, PID 31536, se detuvo únicamente después de comprobar su ruta de comando contra el recibo. Su carpeta y base se conservan. Se arrancó otra instalación nueva en el mismo puerto. No se usaron ni reiniciaron los pilotos 4331/4334.

## Evidencia

Banco final tests/.tmp/font423-eb8d88fd350f4ae6892a780bc0d4f972, con installation/, server-receipt.json, final-check.json, browser.json, logs, manifiesto de candidata y verificación de integridad. Banco previo tests/.tmp/demo422-822319b3cc8041c2864f91cd653c10bd conservado.

Capturas fuera del repositorio:

- C:/Users/iresh/AppData/Local/Temp/planb-font423-FiPmKp/1366-inicio.png
- C:/Users/iresh/AppData/Local/Temp/planb-font423-FiPmKp/1366-clientes.png
- C:/Users/iresh/AppData/Local/Temp/planb-font423-FiPmKp/390-inicio.png
- C:/Users/iresh/AppData/Local/Temp/planb-font423-FiPmKp/390-clientes.png

## Límites

No es una release aceptada ni una comprobación del checkout posterior al corte. La CSS final de D7 y ediciones posteriores de CSV, Deshacer y foco no se incluyen. final-check.json enumera las diferencias observadas. El servidor informa que el ensayo de relevo no está disponible por falta de paquete del Kit en esta instalación; no se probó ese flujo. No se hicieron escrituras ni pruebas de integraciones, exportaciones o devoluciones al CRM. No se usó lector de pantalla, Edge ni dispositivos físicos.

D7 se devolvió a R2 después de reproducir 1/3 con StrictMode sobre su entrega 49c606c3. El recorrido de producción de esta demo no acredita que ese problema de desarrollo esté corregido. La memoria y el tablón conservan esa distinción y las fuentes compartidas posteriores permanecen intactas.
