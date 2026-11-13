# 277 · Montaje real de Relevo: favorable

7/11/2026, 11:07:17, Europe/Madrid. Se aceptan CODEX-OPERATIONS-RELAY-MOUNT y CODEX-RELAY-MOUNT-TEST-COMPOSITION.

## Cambios y revisión

Se cotejaron los hashes vigentes de ambas presentaciones. Al retirar únicamente el import de mountRelayRehearsal y su llamada se reproduce exactamente el hash baseline de main e6693d2d27aa13facb6a40623c000a97a7b2a79c6435a741ddfdcadd3c47eeae. Las demás líneas conservan sus bytes y terminaciones originales. Se registra después de createBaseApp y del lectorHubSpot, con la seguridad original; el helper aceptado sigue a cargo de validar el Kit y de no registrar si falta.

La prueba de composición elimina la copia parcheada de main y compila directamente server/main.ts. Mantiene las tres pruebas y sus aserciones de autorización, integridad del paquete, cancelación/exclusión, único create, reinicio y efectos. operations-relay-main.spec.ts no existe y su hash presentado esnull: la cobertura reutiliza de forma explícita relay-packaged.spec.ts, sin atribuir un segundo banco.

## Evidencia independiente

Copia fija relay-main277-378DS9,291entradas fuente cotejadas, base263 y módulos216R4/254R2 aceptados. Kit73paquetes. Tiposfocales incluyendo main:0. Chromium3/3 sin retries, instalación nueva, entrypointnormal compilado sin insertar import o registro. 401sin sesión; paquete ausente/alterado/enlazado404 conAppdisponible; consentimiento,cancelación,procesosdranados,segundapestaña,uncreateficticio,IDerróneorechazado,descargas y resultado persistido tras reinicio. Se mantienen cero escriturasCRM y tráficoexterno, y anchos1440/390/320. ConsultaCIM posterior limitada a raízexclusiva:ceroprocesos.

No se repitieron las12pruebas del helper porque sus bytes se cotejaron con254aceptada y ya se repitieron en268. No hay registro global de consola en este banco; no se afirma ausencia de todos sus mensajes. Primera preparación277 se detuvo antes de lanzar procesos al comparar las líneas añadidas sin admitirCRLF; se corrigió solo el comparadorprivado y la repetición completa anterior es la válida.

## Límites

Montaje de fuente y instalación ficticia efímera comprobados. El binario histórico263 y el ZIP271 conservan sus cortes anteriores. Esto habilita una nueva candidata; no acredita despliegue, copia activa recuperable, otro equipo ni proveedor. Todo cambio posterior necesita nueva composición por hashes.

- mainSHA: 430f956716ffdb43dcc6a2670ceef9bbd05a18d675870494e5f963689a35f93b
- E2ESHA: 6e6248e1ee15be329c2392db95cd729cac1fc1ffb7daa0a2cfe4ea9767fd7f0b
