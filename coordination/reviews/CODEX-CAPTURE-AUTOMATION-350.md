# Continuidad explica qué impide las capturas automáticas

Cuando el servidor informa de que la conexión no está configurada, la cronología, los avisos de Inicio y el parte descargable muestran que las capturas automáticas están detenidas y explican el requisito. Si la programación sigue habilitada pero el último intento falló, la cronología y el parte indican el fallo. El aviso lleva a Estado. Una captura exitosa posterior retira el aviso. Las respuestas antiguas que omiten connection conservan su interpretación anterior.

El aviso usa texto fijo. El parte no exporta el mensaje interno del servidor, la acción interna ni el identificador de la cuenta. No se modifica el cron del servidor ni las rutas reservadas de Inicio, App, Continuidad o los estilos.

## Evidencia

- Banco capture350-VZ7S4R. Las dos regresiones nuevas fallan con el código anterior (6/8 en avisos). Con la corrección pasan las 93 pruebas focales sin omisiones. Incluyen renderizado React de la cronología, parte HTML y recuperación tras un éxito posterior.
- Typecheck completo limpio en la copia con las huellas finales. En el primer pase se corrigió accountType del fixture de prueba al valor de cadena del contrato.
- La sonda de 349 repetida contra Continuity real y una base ficticia en memoria registró que la captura no pudo iniciarse, no creó trabajos y devolvió el aviso stopped con destino Estado.

El renderizado se verificó en Node. Queda pendiente el recorrido en Chromium desde el aviso hasta Estado y la comprobación del paquete instalado.

- src/app-shell/copy-timeline.ts · 20dcf501313793426f7ac2ec19a3f3caf736457997a7b0f84baff5214f982a3d
- src/app-shell/CopyTimeline.tsx · afefa63b8c1736532421ccba56f57627ca6fb3bd88b7d35079d043756e469ff6
- src/app-shell/continuity-alerts.ts · 435ba984b3692ea101f2a1992107f218df9de944cd6dc2ee4fc90f7f1c2de587
- src/app-shell/continuity-report.ts · cfd6e9233aff05137cf9af4f0426cf8c268dcc74ecbb3e796c768a2fd103988c
- tests/continuity-alerts.test.ts · be42938776c89bec5af70e0408fa276a27e0d77a47bb19ff5ff66289b9b59974
