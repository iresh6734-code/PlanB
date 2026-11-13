# Reapertura de la App existente · 10/11/2026

Codex, chat «Prepara un plan potente para Claude», 01a1979f-9475-7e01-9b05-f51ca3b83ea5. Petición expresa del usuario: iniciar la App. Unidad operacional CODEX-APP-OPEN-2026-11-10; no integra ni acepta código nuevo.

## Resultado

Demo disponible en http://127.0.0.1:4601/ y abierta en una pestaña visible del navegador integrado, conservada como entregable. Se seleccionó Hoy y se observó la lista de 14 tareas pendientes, 4 completadas y el botón Organizar mi jornada. No se editaron tareas ni se ejecutaron proveedores.

- Instalación ficticia existente: tests/.tmp/preview278-SRZe1u/installation.
- Recibo actual: tests/.tmp/reopen-20261110-MVKi2A/result.json; openedAt 2026-11-10T15:14:18.884Z, 16:14 Madrid.
- PID nuevo: 26936; PID histórico ausente: 25224. Instancia conservada: 3cb33118-1596-44cc-b78a-b2961615f4ff.
- Binario conservado: 165e06560ff938b942634a79f1180b257a863dc5d0a789b23c79f312c5f5625b.
- 18 activos comprobados contra el recibo publicado299 tanto en disco como por HTTP; 62 registros ficticios. GET salud, estado, autenticación y cola estructurada correctos; HubSpot e IA sin configurar.
- Huella de tablas y esquema excluyendo únicamente returnBusy: 1e62b72d7b37034de11878f7e5bb312cc9032ad18ed8072dff3f17a694b5b3d3, igual a la reapertura anterior y antes/después de este arranque. returnBusy sigue false; el arranque recifra ese indicador y cambia la huella raw. Clave de ensayo comprobada sin imprimirla.

## Incidencias y alcance

El primer GET restringido dio EACCES. La comprobación autorizada de loopback confirmó ECONNREFUSED: no había servidor. No se mataron procesos ajenos. El iniciador privado reutiliza las guardias del preparador de reapertura299, valida bytes y raíz resuelta, entorno mínimo, bloqueo de red exterior y proceso oculto.

Primera ejecución: tests/.tmp/reopen-current-9UgIiJ/failure.json. Agotó 75 sondeos sin obtener salud; cerró exclusivamente su hijo11284. Ya había recifrado returnBusy. El segundo intento de preparación rechazó correctamente la huella raw antigua, antes de iniciar otro hijo. Se amplió a300 sondeos y se verificó igualdad estricta de todas las otras tablas/filas mediante exceptBusy, además de returnBusy false. La ejecución final pasó todas las comprobaciones y dejó su hijo separado en marcha.

El registro inicial CODEX-APP-REOPEN-2026-11-10 declaró erróneamente299 como dependencia de aceptación para una mera reapertura. Su claim fue rechazado, no reservó ni editó nada y quedó bloqueado como sustituido. CODEX-APP-OPEN-2026-11-10 registra el alcance correcto: abrir la misma demo ya publicada por petición del usuario, conservando299 en review. No hay aceptación implícita de299, actualización de fuentes, nueva build ni incorporación de A4/Radar/gemelo operativo.

No se comprobaron de nuevo todos los recorridos, tamaños o guardados. Navegador observado en Hoy, sin capturas ni escrituras de fichas. No instalaciones corporativas, credenciales reales, cambios de dependencias, commits o despliegues. Siguiente: seguir revisiones e integrar novedades bajo sus reservas; esta reapertura no las presenta como visibles.
