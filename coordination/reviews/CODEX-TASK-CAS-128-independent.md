# Revisión independiente de128 · edición condicional de tareas

2/11/2026, Europe/Madrid. Revisor: chat01a1896e-06ff-7690-9644-4f6de90c2826; autor128: chat01a1979f-9475-7e01-9b05-f51ca3b83ea5. Encargo propio CODEX-TASK-REVISION-REVIEW-129. **Dictamen favorable para el servicio aislado bajo un único escritor; no es aceptación de su montaje o interfaz.** No se editaron las seis rutas128.

## Qué se ha contrastado

Los seis hashes presentados de128 coinciden antes/después. Se leyeron contrato, módulo, ambas suites, informe y traspaso; además Store.saveRecord/transaction/activate, seguridad, registrador base, lanzador principal y bloqueo de instancia. Las fuentes/imports se congelaron en una proyección privada; se excluyeron las rutas de Claude116/123 aún en working al congelar. No se incluyeron esas fuentes en desarrollo como si fueran entregas aceptadas.

Se repitieron **16/16 pruebas del autor** y se crearon **10/10 pruebas independientes**. Typecheck focal de las tres entradas de tests y dependencias limpio.0fail/skip/TODO en el corte final. No se ejecutó la suite global ni un recorrido de navegador: esta unidad no modifica una interfaz y128 aún no estaba montada en la App.

## Garantía real y límite de un escritor

writeTaskRevision hace comprobación de integridad/devolución, lectura de revisión, comparación, validación de campos y saveRecord de forma síncrona, sin await ni devolución de control al event loop. Otros handlers del mismo proceso pueden terminar trabajo asíncrono antes o después, pero no intercalarse dentro de esta llamada síncrona. Store.saveRecord agrupa el registro, historial y estado de devolución en su transacción interna; el fallo instrumentado después de insertar la fila dentro de esa transacción revierte tanto registro como historial.

La comparación de la revisión no comparte esa transacción y no es una instrucción SQL condicional. Por eso **no protege frente a un segundo escritor SQLite que ignore el protocolo**, ni ofrece CAS multiproceso. La revisión tampoco aporta idempotencia por intención. Estos límites ya están declarados en128 y se conservan.

Se ensayó el lanzador principal real compilado desde las fuentes congeladas: adquiere lockInstance antes de abrir Store. Un primer proceso propio abre una base nueva; un segundo intento de ese mismo lanzador/carpeta termina con código1 y «ya está abierto». Se cotejan PID/instanceId del endpoint con health, y se comparan todas las tablas a través de una segunda conexión SQLite **solo lectura**, sin abrir otro Store que pueda migrar datos. La segunda tentativa no cambia ninguna tabla y el dueño continúa vivo. Ambos procesos se cerraron después. PIDs33540/19548, puerto efímero58499 en este corte, sin usar4592/4593 o demos existentes.

Esto demuestra la exclusión cooperativa del punto de entrada ensayado. No demuestra exclusión del sistema operativo sobre cualquier programa que acceda al archivo, ni de otras aplicaciones o herramientas; no debe presentarse como autorización o aislamiento de seguridad. Antes de montar el registrador en otro lanzador hay que verificar o establecer la misma propiedad.

## Oráculos propios

| Caso | Resultado observado |
| --- | --- |
|Ocho solicitudes simultáneas con la misma revisión |Un200/siete409, un cambio guardado, campos no enviados conservados; otro intento obsoleto no modifica tablas |
|Cambio y regreso por PATCH antiguo |El valor vuelve al original, pero las dos entradas de historial invalidan el token antiguo;409 sin escritura |
|No-op actual y otra tarea |El no-op no toca ninguna tabla; editar task-3 no bloquea innecesariamente una posterior edición válida de task-2 |
|Candidata pendiente y sesión nueva |La candidata no sustituye la copia activa; el cambio de sessionId invalida su revisión anterior |
|Validaciones |Campos desconocidos, referencia inexistente, enum inválido, texto mayor del límite y valor no primitivo rechazan422 sin cambios; un control válido posterior sí guarda |
|Devolución incierta válida / plan corrupto |Bloquean cambios y acuses no-op; no exponen el marcador de corrupción ni modifican tablas |
|Fallo dentro de transacción |Un throw después de insertRecord revierte filas/historial; lectura posterior confirma revisión intacta antes de la siguiente edición explícita |
|Reapertura en disco |Mismo token tras cerrar/abrir, edición explícita válida con una única entrada y segunda reapertura conserva la revisión nueva |
|10000 registros |Lectura correcta, ninguna escritura;78,96ms aproximadamente para esa lectura en este corte, no garantía de latencia |
|Segundo lanzador principal vivo |Rechazado antes de abrir el almacén; tablas sin cambios, dueño sigue activo |

La lectura tras un acuse perdido muestra el estado actual, pero no acredita quién causó un valor coincidente. El caso de rollback no autoriza reintentar automáticamente cualquier500: se instrumenta un punto conocido y se lee de nuevo antes de enviar otra edición explícita. Las rutas antiguas siguen admitiendo escritura sin revisión; no se han convertido en condicionales por registrar este servicio nuevo.

## Sensibilidad causal

Tres mutaciones en copias privadas del mismo corte; las aserciones no cambian:

1. Omitir la comparación expectedRevision hace fallar el caso de ocho peticiones: ya no hay un único ganador.
2. Retirar lastChangeId del fingerprint hace fallar el caso de ida y vuelta por la ruta antigua: acepta indebidamente el token original.
3. Escribir también en el no-op hace fallar su control de changed:false/ausencia de historial nuevo.

Cada mutante da exactamente un fallo AssertionError en el test seleccionado, no un fallo de importación, timeout o compilación. Las mismas pruebas pasan con el módulo original. No se afirma cobertura completa de mutantes, ni se suman como tres nuevas pruebas de producto.

## Evidencia y fallos de preparación

Snapshot final: `tests/.tmp/task129-ebe34dc1-d603-4786-ba0e-d2b58315b924`. manifest.json guarda hashes de archivos e inputs128; author16.log, independent10.log y typecheck.log conservan comandos/resultados. La subcarpeta causal-* contiene tres módulos mutados privados y sus logs/result.json. Los fixtures en source/tests/.tmp tienen registros de reapertura, bloqueo y procesos; permanecen preservados.

Primer intento: las16 del autor pasaron y el control del lanzador también. Nueve pruebas propias fallaron antes de ejercitar producto porque mi seed usaba snapshot.reconciliation en lugar de snapshot.manifest; tsc identificó esa misma propiedad inexistente. Se corrigió únicamente el fixture propio y se creó otra proyección. Los logs anteriores en task129-c1e8632a-* no se borraron ni se presentan como nueve defectos de128. No se modificaron aserciones de protección ni fuentes ajenas para conseguir el verde.

Bases nuevas en memoria y disco, claves kind:test precreadas/NODE_ENV=test cuando se usa disco. No DPAPI o datos/claves anteriores en estas pruebas. Proceso/entorno allowlist y block-external.cjs, sin proveedores/credenciales, listeners de usuario o perfiles. No se tocó4591/4451 ni4592/4593, que el otro chat estaba usando para repetir126. Esbuild solo compiló un backend privado para la prueba del lanzador; no rootbuild/dist, dependencias nuevas, commit o despliegue.

El servicio128 original tiene SHA-256 `1ca2cad0ccad733219f72d653992fbddbcebd97aaed2ec432225744808f988f8`; contrato `5ece83d81336ddce7833b0f3b2e172aba0500bc3855fc11e0391068e65f211c5`. Los seis hashes completos del submit se cotejan nuevamente inmediatamente antes de aceptar.129 conserva su reserva y no se autoacepta.

## Siguiente paso

128 se acepta como módulo revisado bajo el límite indicado. El montaje debe tener una unidad nueva, exacta, dentro de la reserva vigente de server/app.ts; la interfaz123 conserva sus archivos y contrato hasta su propia revisión. Un cliente posterior debe distinguir TASK_REVISION_CHANGED de otros409, conservar borrador y resolver mediante lectura/comparación explícita. Una lectura coincidente no se convierte en recibo de intención ni en permiso para reenvío automático.

No se acredita una mejora visible de la ficha de usuario por aceptar el módulo. Su adopción requiere probar dos pestañas, edición concurrente, guardado confirmado con recarga fallida y resultado no confirmado sobre la App y backend realmente montados. El coste de hashear una captura entera queda medido en un caso de10000, sin optimización/benchmark universal.
