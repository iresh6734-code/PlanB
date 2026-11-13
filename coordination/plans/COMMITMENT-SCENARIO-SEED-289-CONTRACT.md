# Semilla estable del escenario multisistema · contrato289

8/11/2026, Europe/Madrid. Complemento de los fixtures aceptados286 y de `registerCommitments`. No monta rutas, no modifica App/main ni cambia4601.

## Resultado y motivo

El historial de compromisos queda ligado a instalación/copia y a la revisión exacta de compromisos+observaciones. Generar `createMultisystemScenario(Date.now())` en cada arranque cambia esa revisión y hace que una decisión anterior deje de aparecer. La semilla289 conserva el mismo conjunto entre reinicios. **El reloj de evaluación sigue siendo actual:** la evidencia envejece y las fechas comprometidas vencen. Persistir no refresca evidencias.

## API interna y soporte

- `initializeCommitmentScenarioSeed(store, clock?)`: paso explícito del instalador/activación local. Solo con copia activa identificada como datos de ensayo. Dentro de una transacción síncrona, si no existe marcador genera el conjunto y guarda **un marcador**; no guarda una segunda copia de las observaciones. Si ya existe, lo valida y lee sin consultar el nuevo reloj o reescribirlo.
- `readCommitmentScenarioSeed(store)`: lectura sin escrituras. Ausencia, corrupción, otra instalación o cambio de algoritmo nunca crean un conjunto nuevo.
- Resultado ready: dataset, seedAt, datasetRevision, provenance durable/memory-only y created. No hay credenciales, datos reales o estado «conectado». Los errores son códigos fijos, sin excepción de almacenamiento o contenido original.

Marcador estricto `planb-commitment-scenario-seed-v1`, escenario `multisystem-v1`, UUID de instalación, instante ISO y SHA-256 del objeto `{commitments, observations}` en el orden del contrato existente. Vive en Store.meta bajo `commitment-scenario:multisystem:v1`. Store de archivo ya cifra sus valores; memoria no ofrece persistencia. No se crean tablas ni se usa almacenamiento del navegador. Su dimensión es constante; no hay un marcador por captura.

La falta de fila se distingue de una fila cuyo contenido es null: null es inválido y se conserva. Un hash incompatible puede significar un generador nuevo; se declara inválido, no se migra ni se borran decisiones. Un archivo que no se puede descifrar se conserva byte a byte. No existe API para resetear, adoptar otra instalación, rejuvenecer o reparar el escenario.

## Identidad y cambios de copia

El escenario es fijo por instalación. Sus historiales siguen separados por la clave completa de copia/contexto que ya usa el backend de compromisos. Cambiar de copia ficticia no regenera semilla ni traslada decisiones. Una copia marcada como producción no puede leer o inicializar el dataset de ensayo; al volver a la misma copia ficticia, el marcador original sigue allí. Una instalación con otro UUID no adopta el marcador copiado. Esto no detecta una clonación privilegiada de una base entera que conserve el UUID; el helper no es una protección contra quien controla los archivos y la clave.

Solo un proceso cooperativo debe poseer la carpeta: el launcher existente usa lockInstance. La transacción del helper hace atómica el alta/lectura en el Store; no se presenta como un sustituto de ese candado, un servicio multiusuario o una coordinación con procesos que ignoren el protocolo.

## Montaje sucesor y puerta de producto

Dueño central: `CODEX-COMMITMENT-RADAR-MOUNT`. Espera además la aceptación de UI de Radar y JornadaA3, y la revisión de289 antes de consumirlo.

1. Al habilitar explícitamente el ensayo, inicializar el marcador solo después de que la copia ficticia esté activa y bajo el candado normal. No inicializar en un GET de lectura, no importar o activar una copia por abrir la página.
2. Usar exclusivamente el dataset ready para la instancia de `registerCommitments`. Pasar su reloj de evaluación actual, **nunca `() => Date.parse(seedAt)`**. Al reiniciar leer el marcador, sin llamar al generador con el reloj actual para sustituirlo.
3. Si la app arranca sin copia activa o sin semilla, el montaje todavía debe acordar la activación explícita y el registro/provisión diferida del dataset. El backend actual recibe un dataset estático:289 no cambia ese contrato ni afirma resolver el montaje desde una copia inicialmente vacía. No esconder la necesidad de reiniciar ni dibujar un botón que solo cambie una etiqueta.
4. Un marcador ilegible o incompatible requiere diagnóstico local y un encargo de recuperación/migración separado; mostrar indisponibilidad, conservar diarios y datos y no registrar otro escenario para que la pantalla parezca funcionar.
5. Probar App normal detectar→fuente→decidir→reiniciar→historial con la misma semilla y con controles de otra copia/cuenta. La API/Store de289 no sustituye ese recorrido. Los proveedores continúan siendo fixtures y ninguna llamada externa se inicia por mostrar el Radar.

El contrato A4 de intenciones y cobertura duradera lo lleva el otro chat Codex en rutas separadas. Una semilla del Radar no habilita covers:true del resumen de trabajo ni certifica guardados recuperables. ZIP271 y demo4601 requieren sus unidades de actualización posteriores.
