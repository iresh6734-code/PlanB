# D4 · Temporizador de vigilancia y capturas semanales

24/11/2026, Europe/Madrid.

El servicio fija la captura de firma con su acta. Para programar otra lectura exige credencial y documento vigente del mismo portal y encargo, más la confirmación de que el documento cubre lecturas recurrentes. Guarda cada captura con su acta en una transacción. Una pausa cancela la lectura activa y evita incorporar su resultado. Entre dos fallos sucesivos deja una hora. Después de reiniciar está disponible el parte histórico y hace falta volver a introducir la credencial para programar lecturas.

- El reloj controlado activó el intervalo real sobre HubSpot simulado. Se comprobaron aviso por ausencia, captura retenida, aceptación por huella y parte idéntico byte a byte al script. Al reabrir SQLite se conservó la huella del parte y la integridad del acta. Se comprobó que el almacén no contenía la credencial.
- Una autorización caducada produjo cero peticiones. Dos consultas concurrentes al temporizador compartieron una sola lectura. Pausar en mitad de esa lectura conservó solo la captura de firma.
- Una escritura forzada a fallar revierte la captura y su acta. Se conserva la firma, se respeta el intervalo de reintento y la segunda escritura guarda una sola captura nueva.

La primera entrega se probó como módulo local. El montaje posterior en el servidor y «Vigilancia» y sus comprobaciones están en el [informe D4 de integración](CODEX-VERIFICA-D4-INTEGRACION.md).
