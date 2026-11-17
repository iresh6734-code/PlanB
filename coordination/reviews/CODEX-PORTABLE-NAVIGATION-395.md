# Ciclo del ZIP con el menú actual

## Cambio y alcance

El recorrido usa los controles accesibles del menú actual. Abre **Ajustes → Preparación**, **Continuidad → Estado**, **Continuidad → Exportar** y **Clientes → Clientes**. Si el lugar ya está desplegado, abre su apartado directamente. Esto evita plegar Continuidad al repetir una comprobación tras restaurar. La revisión se hizo dentro de la reserva propia 373.

El único cambio en el E2E es de navegación. Conserva las comprobaciones de la descarga real, cifrado, aislamiento, identidad de la copia, rechazos sin escritura, custodia y persistencia. SHA-256 del E2E probado `79d5c924a01cdbbfd8b83714e9f6c57d63ac1092dd8b376196df5f5b19e3b1b8`.

## Compilación y navegador

La candidata `candidate-6c5e18c4-dced-4309-98a1-f61a95cf1f1a` pasó tipos, Vite, seis bundles de servidor, cobertura de sus diez activos públicos y 163/163 pruebas Node del empaquetador. Contiene las huellas exactas de `server/store.ts` y `server/v2.ts` de la restauración atómica 388 y el nuevo E2E. Las 847 fuentes y 51 artefactos cotejados conservaron sus huellas antes y después del recorrido. El manifiesto conserva 140 bloqueos de revisión y distribución, incluidos los trabajos activos de contraseña y Deshacer.

El caso pasó 1/1 en Chromium, sin reintentos, en 125,8 s. El botón de Exportar descargó un ZIP cifrado de 48.943.514 bytes. Su SHA-256 es `11cb5beff4f283fb3d8ca423ab176a4db73cdf86c60e0c57a21307192364ddfb`. En un destino nuevo, los dos rechazos 422 conservaron la huella de SQLite. El intento válido devolvió 200 y mantuvo los 62 registros y su cambio local. Tras reiniciar conservaron identidad, evidencia y revisión. La prueba comprobó el ancho móvil a 390 px, cero errores de página y cero solicitudes a otros orígenes.

El `ABRIR PLAN B.cmd` del mismo ZIP pasó los cuatro controles. Abrió la copia restaurada, reutilizó el proceso, rechazó portada 404 con salud 200 y reabrió con los mismos registros y cambios. Se verificaron los cierres de origen, destino, destino reiniciado y lanzador. El observador del comando impidió abrir un navegador del usuario.

## Evidencia

Banco `tests/.tmp/portable395-707197439bcd455e84a6458851d901a3`. `prepare.log`, `stages.json`, `integrity-after.json`, `playwright.json`, `observed-portable.json` y `packaged-command/results.json` conservan la evidencia. Se probó el E2E exacto del árbol capturado, con Playwright y el Chromium local porque el complemento Browser no estaba disponible. Datos ficticios nuevos, solo loopback y verificación del ZIP y sus dependencias por huella.

Quedan pendientes los demás E2E con rótulos anteriores y la batería global. El resultado acredita el recorrido probado en la candidata aislada y el manifiesto mantiene `approved:false`, `deployed:false` y `releaseEligible:false`.
