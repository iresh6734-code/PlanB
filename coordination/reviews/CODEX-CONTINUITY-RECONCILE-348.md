# Continuidad conciliada con la navegación actual y el informe offline

Banco continuity348-cL8LoL. Contrasté la versión de continuity.spec.ts presentada por 058 con la versión posterior. Los cambios existentes actualizan la navegación tras la nueva portada, la barra móvil y las pestañas de Continuidad. Preservan las comprobaciones de los recorridos.

- Con la suite previa pasaron seis de ocho. El primer recorrido intentaba desconectar una copia que ya estaba en modo independiente. El informe descargado registraba cinco comprobaciones aprobadas en una lista y la prueba buscaba cinco celdas.
- El recorrido ahora comprueba la transición a modo independiente. Si la copia inicial ya está desconectada, habilita servicios en la copia ficticia, comprueba el estado local y vuelve a desconectar. Conserva la comprobación de cero solicitudes externas. El informe offline exige exactamente cinco comprobaciones, una por identidad y con resultado Superada visible.
- Pasaron los ocho recorridos Chromium con los artefactos de 340 cotejados, worker de simulacro incluido, y el Kit v2 del banco 277 configurado en el servidor local. Se abrieron bases ficticias nuevas en 4394. El caso que verifica que cada captura requiere su propia prueba pasó con el Kit presente. La ejecución no invoca el simulacro propio del Kit.
- Pasaron también las doce pruebas de drill-evidence de las fuentes actuales, con validación de informes y worker compilado en su banco.

El primer arranque superó el límite inicial de 30 segundos antes de servir health. El siguiente banco levantó el servidor con margen superior. Una repetición intermedia se interrumpió después de tres pruebas y no dejó recibo completo. El resultado definitivo final.json recoge las ocho pruebas sin omisiones ni reintentos. El alcance es Continuidad y su informe técnico. Los casos históricos de recuperación integrada y v4 de 058 conservan su evidencia anterior y no se repitieron aquí. Sin instalación o despliegue.

Prueba vigente SHA-256 d2cbde6d73624f6c2c3a8f981f351511737a302a58e8d3052448e8a53db5f8f1. Manifiesto Kit SHA-256 7614e89794021caf566aca5f04c1ee5db5c65ce0fc8b2b2d2a5224c6b729964b.
