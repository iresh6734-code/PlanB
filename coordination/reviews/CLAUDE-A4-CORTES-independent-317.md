# Cuatro cortes A4 · revisión independiente317

9 de noviembre de2026, Europe/Madrid. **Dictamen favorable exclusivamente como guion histórico y sondas de primera ausencia. No acredita los cuatro cortes funcionales de A4.**

Unidad revisada CLAUDE-A4-QA-CORTES-V2, dos huellas cotejadas antes y después:
- tests/e2e/hoy-trabajo-por-recuperar-cortes.spec.ts: cf451a4bdd52dcf6f1eb92af469ea4f11e591018c05d3c3bf7143488ce0473bc
- coordination/reports/CLAUDE-A4-QA-CORTES.md: 21c3fb0b03911f67b97c4c7867d7723ccefaedbc37c3ba9ddc8b676dfb8da09f

## Evidencia propia

Banco tests/.tmp/cuts317-BdPlQ0: tipos focales exit0; cuatro pruebas Chromium ejecutadas, **cuatro fallan intencionalmente**, sin omitidos/reintentos/flakies. Cada una tiene un único error y alcanza exactamente firstStep con FUNCIÓN AUSENTE (primer paso), GET /api/v7/task-intents responde404. No se convierten esos fallos en cuatro pruebas verdes. El resultado completo conserva duración y mensajes. La compilación y todos los pasos previos se ejecutan sobre fuentes congeladas303; no se copia ni lee el servicio316 working.

Corte1 prueba abrir/editar sin guardar y cero PATCH/filas, no un fallo real de persistencia. Corte2 aborta el PATCH antes de que llegue al servidor, reinicia y conserva cero efectos; no prueba haber persistido un intento. Corte3 acredita200 recibido por el arnés, una fila de task-2, valoraplicado yhomónima intacta, pierde el acuse al navegador y reinicia conservando una fila. Corte4 acredita efecto normal200 y una fila; no inyecta una liquidación fallida. Las aserciones posteriores a cada barrera no se alcanzan. Esto coincide con el alcance y límites explícitos de la entrega, no con su eventual título funcional.

El arnés293 conserva ChildProcess y recibos de cierre, no soloPID. La última comprobación assertAllClosed no añade error. Los reinicios también conservan nueva identidad de proceso. La igualdad de PID distinta es una aserción adicional de la autora, no la única prueba de cierre/reinicio. No se prueba matar abruptamente el proceso en una frontera A4 real.

## Qué se acepta y qué queda pendiente

Se acepta que las sondas documentan el primer404 en esa combinación histórica. No se declara que la API316 actual no exista ni se evalúa código working desde este banco. El contrato304 y tipos311 ya aceptados sustituyen las propuestas históricas. El cliente deja de enviar un PATCH separado: el POST A4 llama al escritor en el servidor. Por ello cambiar solo INTENTS ya no basta para convertir estas sondas enQA funcional.

La futura suite debe usar ámbito válido, validar respuestas311, registrar el UUID exacto y contar POST de ejecución, invocaciones al escritor y filas por separado. Las referencias .first() de los pasos aún inalcanzables deben sustituirse por el intento exacto. identity={} y not404 no validan una lectura ni la disponibilidad de recuperación. Los ganchos de fallo deben ser DI de arnés, sin ampliar variables de entorno de producción. La matriz companion317 especifica las puertas; requiere otra unidad reservada antes de editar los dos archivos de Claude.

Browser plugin not available; Playwright y Chromium de caché del proyecto. Frontend compilado en copia, SQLite ficticia de archivo, puertos efímeros, red exterior bloqueada. No instalación de dependencias, App/main del checkout, demo4601, proveedores o credenciales. No se hicieron afirmaciones visuales nuevas ni auditoría de consola. Baseline completo e histórico enumerado porhash; sus dependencias pendientes no se aceptan en bloque.

Siguiente: cerrar316 con revisión independiente; después nueva QA de cortes sobre servicio y frontend aceptados. Mantener covers:false y la separación entre biblioteca, HTTP opt-in y montaje real.
