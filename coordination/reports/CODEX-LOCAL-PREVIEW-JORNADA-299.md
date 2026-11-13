# Jornada R3 visible en la demo local · 8/11/2026

Entrega de Codex, pendiente de revisión independiente. Reservas exactas: este informe y `tools/preview/update-day-plan.mjs`. No se modificaron fuentes de Claude, App, main, configuración, dependencias o empaquetado.

## Resultado observado

`http://127.0.0.1:4601/` sirve ahora Jornada R3 dentro de **Hoy → Organizar mi jornada**. Permite declarar estimaciones, calcular propuestas para 30/60 minutos, fijar una tarea y abrir su ficha por ID. Cerrar la jornada descarta su selección en memoria, como establece el componente. No se guarda ninguna tarea durante este recorrido.

La instalación es exclusivamente la copia ficticia nueva `tests/.tmp/preview278-SRZe1u/installation`. Antes y después conserva PID **22988**, creación de proceso **1794140466075**, instancia **3cb33118-1596-44cc-b78a-b2961615f4ff**, binario **165e06560ff938b942634a79f1180b257a863dc5d0a789b23c79f312c5f5625b** y **62 registros**. La cola actual devuelve **14 tareas abiertas**, no 62 tareas. El estado real confirma `snapshot.source.isTestData:true`; el array compacto del endpoint de estado no se usa para contar la base.

## Construcción y publicación

- Fuente congelada: banco `tests/.tmp/jornada290-r3-lylYFc`, 311 archivos y sus procedencias. El corte base corresponde al montaje284 aceptado; las sustituciones205/275/adapter/230 y A3R3 se contrastan con sus entregas `done`. Los cuatro hashes actuales de A3 se vuelven a comprobar. No se adopta el árbol de trabajo actual ni archivos `working`.
- Nueva candidata: `tests/.tmp/preview299-C2tnu0/prepared.json`; Vite con React de producción, `configFile:false`, entorno reducido y sin cargar `.env` del repositorio. Se comprueba ausencia del módulo React de desarrollo. No hay build de servidor, instalación o `npm run build`.
- Antes de publicar se probó la API **real** `/api/v7/local-operations/work` con el esquema aceptado y se leyó el contexto completo mediante el cliente aceptado. Las seis partes de identidad deben coincidir. No se utilizó el servidor de pruebas de A3 ni una cola sustituida.
- Guardias: ruta absoluta fija resuelta; activos288 y binario originales; proceso Node, comando, PID y fecha de creación; endpoint, instancia, copia activa ficticia y autenticación sin configurar. Clave nueva de tipo `test` comprobada sin descifrar ni imprimirla. No se usan DPAPI, perfiles o credenciales.
- Copia íntegra de los 15 activos anteriores en `installation/dist-before299`. Se publicaron primero los archivos nuevos con creación exclusiva, rechazando colisiones de distinto contenido. Se sustituyó **solo index.html al final**, por rename de un archivo temporal del mismo directorio. Los URL anteriores siguen sirviendo los mismos bytes; hay 18 activos en la unión instalada.
- Recibo aplicado: `tests/.tmp/preview299-C2tnu0/applied.json`. Se cotejaron por HTTP los 18 activos instalados. No se reinició el servidor ni se reemplazaron carpetas, datos o claves.

## Verificación actual

Banco propio: `tests/.tmp/preview299-C2tnu0/qa-SNywSS/result.json`; script reproducible de evidencia en `tests/.tmp/verify-preview299.cjs`.

| Comprobación | Resultado |
| --- | --- |
| Título, Hoy, Jornada y contenido significativo | Correctos en 1440, 390 y 320 px |
| Propuestas con cuatro estimaciones20/25/30/15 | 30 min: task-2, 20 min; 60 min: task-2/task-3/task-5, 60 min |
| Fijar, cambiar presupuesto, abrir ID exacto y Escape | Correcto en los tres tamaños |
| Cerrar/reabrir jornada | Estimaciones descartadas; vuelve a 30 min y cero tareas seleccionadas |
| Desbordamiento horizontal, overlay, consola, errores HTTP | Ninguno observado |
| Peticiones de escritura/red exterior | Cero; ambas bloqueadas por el banco |
| Tablas, esquema y valores SQLite incluidos cifrados | SHA-256 antes/después idéntico: `0ade7792ed8c6f46ede4b69487e5b8427f296f601987019ac7ef6d58678616a3` |
| Comprobación posterior de proceso, contexto, clave, endpoint, binario y activos HTTP | Iguales al recibo aplicado |

La base se abre `readOnly:true` bajo una transacción de lectura; se ordenan filas para calcular la huella, sin guardar contenidos de registros. No se descifra, restaura, migra ni escribe en ella.

Se abrieron visualmente las capturas1440/390/320 a resolución legible: controles y tarjetas se adaptan sin recorte horizontal. Evidencia fuera del repositorio: `C:/Users/iresh/AppData/Local/Temp/planb299-9dRYWR/viewport-1440.png`, `viewport-390.png`, `viewport-320.png`. También hay capturas completas del recorrido en esa carpeta. Browser plugin no disponible; CLI de Playwright no instalada. Se usó la biblioteca Playwright existente y Chromium de su caché, sin instalar nada ni utilizar el navegador del usuario. Navegadores/contextos propios cerrados al terminar.

## Incidencias conservadas y límites

El primer registro de tarea rechazó un plan expresado como array: no se creó reserva ni se editaron archivos hasta registrar el formato correcto. El primer `--check` utilizaba `captureId` donde el contrato exige `snapshotId`; se detuvo antes de publicar. Se corrigió esa guardia y se repitió satisfactoriamente. La ejecución restringida inicial de GET devolvió EACCES; la comprobación autorizada fuera del sandbox confirmó que la demo estaba viva, sin arrancar otro proceso.

Primer banco `qa-Ax8BkT`: falló la comprobación inmediata del texto de una ficha que aún cargaba; cero escrituras, errores HTTP o de consola. Se conservó el fallo. El banco final espera el mismo ID solicitado en el diálogo, manteniendo la aserción; los tres tamaños pasan. No se atribuye al producto aquel fallo de observación.

`--rollback` restaura solo el index anterior tras cotejar el recibo aplicado, proceso, tablas y copia de activos; mantiene ambos conjuntos de recursos para pestañas abiertas. La rama de error durante publicación también vuelve al index anterior. **No se ejercitaron** estas dos ramas sobre la demo que quedó funcionando; su corrección necesita revisión estática/independiente y no se afirma una prueba de recuperación real.

No se repitieron las25 pruebas A3 sobre esta instalación: pertenecen al banco congelado290 y a su dictamen aceptado. Aquí se probó el recorrido descrito con los datos ficticios actuales, no cambios de captura, fallos de red o envíos. Tampoco se verificaron lector de pantalla u otros motores de navegador.

Radar UI y su montaje central siguen a cargo del otro chat; esta publicación no instala Radar ni nuevas API. Pipedrive y SourceStatus R2 siguen reservadas por sus autores según el último tablón leído. LAB036 se conserva sin editar ni integrar una versión nueva; el usuario desconoce qué sesión la lleva. No se tocaron login HubSpot, terminal16105, cuentas/proveedores, equipo corporativo original,4331/4334,ZIP271,launcher272,Git o despliegues externos.

Siguiente paso concreto: revisión independiente de los dos archivos, del manifiesto y del estado servido; después montaje Radar únicamente tras aceptación de su UI y reserva correspondiente. La entrega299 no se autoacepta y el objetivo general sigue activo.
