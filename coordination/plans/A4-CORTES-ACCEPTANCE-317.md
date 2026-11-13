# A4 · matriz de aceptación posterior al guion317

9 de noviembre de2026, Europe/Madrid. Codex. Documento de coordinación para la siguiente unidad de QA; no implementa rutas ni autoriza editar reservas ajenas. Fuentes de contrato: A4-DURABLE-RECOVERY-HTTP-CONTRACT.md aceptada304, shared/task-intents.ts aceptada311R2, claims310 aceptados.316 permanece trabajando al preparar esta matriz. Su interfaz de inyección concreta se comprobará tras presentación; aquí se fijan comportamientos, no nombres inventados deAPI.

## Puertas y reparto

1.316 debe presentarse, pasar revisión independiente y quedaraceptada antes de tomar su implementación como baseline.
2.Claude A implementa cliente/estrategia sobre UUID estable aceptado y contratos311, bajo tareas exactas separadas. Recuperación/superficie/host y montajeApp/main tienen sus propias reservas.
3.QA registra otra tarea para los archivos de cortes. La aceptación del guionV2 no implica que su cuerpo actual sea la suite futura ni que se edite sin nueva reserva.
4.Primero pruebas de servicio opt-in ySQLite real; después los cuatro cortes por navegador con servidor yfrontend compilados; finalmente candidata instalada/portátil. Cada nivel conserva su manifiesto. Un arnés no acredita los otros niveles.

## Identificadores y contadores obligatorios

- Generar UUID de intento antes del despacho y conservarlo en petición, respuesta, diario, reinicio y selección de interfaz. Dos tareas homónimas y dos intentos de la misma tarea obligan a seleccionar porID, ámbito ytaskId. No usar .first() para decidir qué intento se verificó.
- Leer ámbito completo vigente: seis campos deidentity más contextRevision. Enviar el parche y token de loadRevisedTask. No enviar baseline inventada ni fingerprint elegido por cliente.
- Registrar separadamente: solicitudes POST /attempts recibidas, llamadas reales a writeTaskRevision y filas dehistorial delID exacto. Contar soloPATCH produciría ceros engañosos enA4. Un escritor llamado con no-op cuenta una llamada y cero filas.
- Identificar fila de historial por suID además del contenido; tras reinicio debe ser la mismafila. Guardar hash de tarea homónima antes/después. No deducir efecto de un texto ni deHTTP200 solamente.
- GETlista/detalle/check no cambian tarea, diario, claims/índice/época, secuencia ni updatedAt. Comparar filas persistidas antes/después en transacción de lectura, excluyendo únicamente metadatos cuya mutación esté expresamente documentada; no normalizar diferencias para forzar pase.
- Toda respuesta exitosa debe pasar su esquema311 y corresponder alID/ámbito pedidos. Validar TaskIntentList read/unavailable yrecuentos; no usar not404 conidentity={} como puerta funcional. Un422 solo prueba rechazo deesa entrada.

## Los cuatro cortes funcionales

| Corte e inyección de prueba | POST ejecución / escritor / filas | Estado que debe observarse | Tras reinicio y acción explícita |
|---|---|---|---|
|1. Persistencia inicial falla antes de cambiar almacenamiento |1 /0 /0|Rechazo previo con código cerrado; UI conserva borrador y explica sin enviar. No registro confirmado|Abrir/leer añade0 escritor y0 filas. Distinguir ausencia real de lectura indisponible|
|2. Claim+raw confirmados; terminar proceso antes de entrar al escritor |1 /0 /0|Intento exacto phaseattempt, incertidumbre; capturar barrera confirmada antes del cierre|Otro proceso sobre mismaSQLite encuentra mismoUUID/seq. Checkunchanged,0 envíos. RepetirPOST con mismoID no llama al escritor|
|3. Escritor aplica una vez y se pierde acuse al navegador |1 /1 /1|Interfaz incierta por transporte; estado persistido puede estar acknowledged si liquidó. No exigir incertidumbre en servidor si hay acuse duradero|Mismafila yUUID. GETcheck applied no acredita autoría por sí solo. Si hay liquidación server-ack, mostrarla con suprocedencia;0 envíos nuevos|
|4. Escritor aplica y falla liquidación antes de guardarla |1 /1 /1|Intento sigue attempt/incierto aunque seobservevalor. Ningún confirmed inventado|Checkapplied sobre mismobase/parche; no liquida porGET. Aceptación humanaCAS registra person-accepted-read;0 escritor/filas de tarea nuevos|

Para cortar2 se requiere señal del arnés después de confirmación/relectura yantes de escritor; abortar en el navegador no equivale a esa frontera. Matar o cerrar solo el ChildProcess original identificado, esperar recibo y reiniciar enel mismo directorio del caso. El cierre ordenado puede probar reinicio; el corte abrupto debe declararse por separado si se exige. No usar hook accesible porHTTP deproducción.

En3 la pérdida debe retener la respuesta después de acreditar servidor/SQLite, no reemplazar alservidor por unmock. En4 el fallo debe ocurrir en lapersistencia real deldesenlace; abortar larespuesta no inyecta ese fallo. La homónima permanece intacta enlos cuatro casos.

## Controles que evitan conclusiones falsas

| Control | Aserción necesaria |
|---|---|
|Replay mismoUUID/mismocuerpo, antes ydespués de reinicio|Respuesta persistida oincierta acorde;0 llamadas adicionales al escritor|
|MismoUUID con otroparche/revisión/ámbito|Reutilización/ámbito rechazados sinvalores ajenos;0 efectos|
|Dos peticiones concurrentes del mismoUUID|Un único escritor; no deducirlo solo de una fila si ambas pudieron ser no-op|
|No-op válido|Un escritor,0 filas,acuerdochanged:false; no anunciar otra escritura|
|COMMIT inicial aplicado pero acuse perdido|0 escritor; reconciliar claim porlectura, no repetir automáticamente|
|COMMIT de liquidación aplicado pero acuse perdido|Respuesta incierta, lectura conserva acuse auténtico si estápersistido; no borrarreceipt ni duplicar tarea|
|Permiso revocado y nuevo login duranteespera|La petición original falla yno adopta permiso nuevo; no devuelve valores deotra sesión|
|Cambio solo de generación,scope o revisión|Conflicto segúnfrontera; estado/tarea anteriores intactos antes de escritor|
|Aceptar seq o revisión antiguas|409; evidencia yaccepted-read seguardan juntos en una sola writeIntent/CAS. Nunca recordEvidence yacceptRead separados|
|Abandonar ejecución aúnviva|409. Tras clasificación permite cerrar seguimiento conconfirmación; no dice que deshizo la tarea|
|TTL/poda yreplay|Claim superviviente, detalleomitido explícito,0 escritor. Índice corrupto no reconstruye ni inicializa enGET|
|Respuesta real >512KiB por campo ajeno al parche|Un efecto, acuse compacto persistido,writeResult:null+omisión explícita. Detalle/check no inventan lectura aplicada si elpayload nosepuede devolver|
|Peticiones >256KiB,parches/formato inválidos|Rechazo previo y0 escritor. Usar UTF8 real y valores válidos si seprueba únicamente tamaño|

## Estados de interfaz y prueba de sensibilidad

Resultado server-ack yactualización deHoy son dimensiones distintas. Un fallo enrecarga no degrada la confirmación ni añadePOST. La lectura applied sinacuse conserva evidencia devalores, noautoría. Sin detalle no secompara baseline/parche ausentes. Accepted-read lleva decisiónhumana, secuencia yrevisiónde tarea revalidadas.

Probar cada aserción de corte con una mutación causal privada: saltar persistencia, permitir replay al escritor, convertir falta de liquidación enconfirmed, o hacer que checkescriba. Debe fallar la aserción correspondiente de efecto/estado, sin usar una huella de archivo comoúnico detector. Registrar también uncontrol sinmutación. No cambiar aserciones para acomodar la implementación.

La lista vacía no prueba cobertura completa. Mantener covers:false del resumen general yexplicar alcance A4 desde activación. Borradores sinenviar siguen fuera de persistencia yno se inventan durante restore. El guion317, la futuraQA funcional, elmontaje y elZIP deben aparecer como entregas diferentes enmemoria ydictámenes.
