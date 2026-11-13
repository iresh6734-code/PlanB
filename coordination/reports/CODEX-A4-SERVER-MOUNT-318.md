# Recuperación A4 en los dos servidores

10/11/2026, Europe/Madrid. Autor de 318, chat «Prepara un plan potente para Claude», `01a1979f-9475-7e01-9b05-f51ca3b83ea5`.

`main` y `runtime` registran las seis rutas aceptadas de A4 sobre el mismo `Store` y la misma protección local que el resto de la aplicación. El bloqueo de instancia precede a la apertura de SQLite. El montaje conserva el ámbito de ficción de 316 y el resumen mantiene cobertura `none` y recuentos nulos hasta comprobar el recorrido de usuario.

## Qué se comprobó

El banco `tests/task-intents-entrypoints.test.ts` compila cada servidor, arranca un hijo con un archivo SQLite ficticio y usa HTTP sobre loopback. Comprueba protección con una contraseña de ensayo, cabeceras `no-store` y `Vary: Cookie`, rechazo de otro ámbito, identidad publicada por PID e instancia, revocación de la sesión al reiniciar y nuevo acceso tras iniciar sesión. El segundo propietario se rechaza y su arranque deja intactas las filas. Cada caso verifica también que la tarea homónima conserva sus bytes y que la fila de historial, cuando existe, sigue siendo exactamente la misma al reabrir.

| Corte | Efecto observado en SQLite | Lectura y acción posterior |
| --- | --- | --- |
| Fallo de persistencia inicial con trigger SQLite | Cero filas de tarea y ninguna intención parcial. El POST devuelve `TASK_INTENT_NOT_DISPATCHED`. | Lista vacía y detalle/comprobación 404 tras reiniciar. |
| Terminación después de persistir y antes del escritor | El intento existe y el banco registra la barrera, con cero llamadas al escritor y cero filas nuevas. | El mismo UUID sigue pendiente. La comprobación devuelve `unchanged`, la repetición no escribe y el abandono cierra el seguimiento. |
| Respuesta de guardado descartada | El servidor responde 200 y el cliente descarta el cuerpo. Una sola fila acredita el efecto. | El mismo UUID conserva el acuse `server-ack`. Comprobar y repetir conservan toda la base. |
| Fallo de liquidación con trigger SQLite | Una fila de tarea. El intento permanece pendiente y sin acuse. | La lectura detecta `applied`. La decisión expresa persiste `person-accepted-read`, sin otro guardado de tarea. |

El binario sin instrumentación inicia los cortes 1, 3 y 4 en ambas entradas. Para el corte 2, una variante privada inyecta en la llamada real a `registerTaskIntents` el gancho `afterPersist` de 316. La variante de los reinicios también registra llamadas al escritor real para acreditar cero despachos nuevos durante lectura, repetición y resolución. El marcador y la pausa pertenecen al banco. Para los cortes 3 y 4, el efecto en el binario inicial se mide con filas persistidas. Los contadores de llamadas en esos recorridos también se contrastan por separado en las regresiones 316/319. El banco envía los guardados por POST de A4. El flujo de la ficha queda para su propio montaje.

Las comprobaciones posteriores al reinicio exigen igualdad de filas y metadatos. Se admite exclusivamente el recifrado previo del indicador `returnBusy:false` y, en el servidor portátil, `disconnected:true`. Se valida el valor descifrado de ambos con la clave de ensayo. Los GET y las repeticiones posteriores comparan los bytes completos.

## Cortes de fuentes e incidencias

El banco parte de 322 y añade API 316 con los contratos aceptados. Durante la composición se detectaron dos diferencias de procedencia. El corte de referencia usa `server/task-revision.ts` de 185, `0887c809…`, y `server/workspace-search.ts` de 053, `5bbd6f2e…`. El banco de compatibilidad incorpora por separado los hashes `df80a317…` de 206 y `303c1796…` de 207, ambos en revisión. La compatibilidad comprobada se limita al montaje A4. El dictamen sobre 206 y 207 corresponde a sus revisores.

La primera preparación detuvo el banco antes de ejecutar pruebas por esa diferencia de fuentes. La primera pasada del corte de referencia detectó que la fixture carecía de `instanceId` antes de calcular el ámbito. Se inicializó un UUID ficticio y el test contrasta el resultado con el estado devuelto por el servidor. El corte de referencia pasó con ese ajuste. En el banco de compatibilidad, una lectura de `.endpoint.json` coincidió con el truncado de `writeFileSync` durante el reinicio portátil y falló al interpretar el JSON vacío. El banco final espera un recibo completo y sigue exigiendo PID, URL e instancia exactos. Se conservan los logs de las pasadas previas `a4-mount318-vzMRSP`, `a4-mount318-BdAarn` y `a4-mount318-dLqLeH`.

## Resultados finales

- `tests/.tmp/a4-mount318-gXEbTd`. Corte de referencia. Tipos focales sin errores, 10/10 del banco de montaje (ocho cortes y dos grupos) en 49,9 s y 36/36 de regresión (28 de API 316, siete independientes 319 y una de servidor portátil) en 20,0 s. Cero omitidas. Binario principal `01bb8f8564f921a77276bb9e130ed81989826bc9f18c931fffbeafb81fe0c9a7` y portátil `731e1b95a3968e89ac60151dc19fb9381eb0abc8239208678f00740423da8d9b`.
- `tests/.tmp/a4-mount318-vS8uWw`. Corte de compatibilidad. Tipos focales sin errores y 10/10 del mismo banco en 50,2 s. Cero omitidas. Binario principal `212e79ac735fedfa5ecbbb188b2c5d0d3ffef03f8dd10ead24c615ca7db8583e` y portátil `3031a24aa0244150ac917aba7e68d54e021afc45b21c0db146c07c36e80f20e1`.
- Los dos manifiestos conservan 331 entradas cada uno. Se cotejaron todas tras ejecutar y las tres fuentes de 318 coinciden con el checkout. Hay 18 recibos de cierre del banco de montaje por corte. Los hijos propios se terminan de forma abrupta durante la prueba. Los contendientes salen con código 1 y el mensaje de propiedad esperado.
- SHA-256 de `server/main.ts` `44988a72bf490743103fbf0517a7734cf50b0bc85a10b49725eeb5b54bc1fbf3`, `server/runtime.ts` `783a31eceadbc15ddce087b7eac8f3cde8a850e1ae61a116406e1b16c6115a1d` y `tests/task-intents-entrypoints.test.ts` `7f1d8f2edd5be6549911c3855f00dfeef43a30ee896aa2fa5b2a622b47228f7b`.

## Siguiente entrega

318 entrega los puntos de entrada para el cliente A4. El recorrido de usuario requiere revisar la estrategia de Claude A, montar «Trabajo por recuperar» y repetir los cuatro cortes en la App compilada desde Hoy. La demo abierta en 4601 sirve su corte anterior. El ensayo HTTP de pérdida de acuse descarta el cuerpo en el cliente de prueba y deja la pérdida de acuse en navegador para la candidata. Las pruebas ejercen un reinicio de proceso del mismo equipo con SQLite local. El despliegue del paquete portátil requiere regenerar el ZIP y probarlo por separado.
