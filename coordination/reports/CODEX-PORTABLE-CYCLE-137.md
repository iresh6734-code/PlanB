# CODEX-PORTABLE-CYCLE-137 · Descarga y recuperación en carpeta independiente

2/11/2026,Europe/Madrid. Codex de este chat. Presentada para revisión, sin autoaceptación. Tres rutas propias:spec,helper e informe. No cambia producto,paquetes raíz o reservas ajenas.

## Resultado comprobado

**1/1 E2E completo**,0fallos/skip/flaky,128,64s;typecheck focal limpio antes del mismo pase. La descarga no se sustituyó por un archivo fabricado en el test:se pulsó «Descargar aplicación independiente» y se guardó el ZIP real emitido por el servidor. ZIP48.709.835bytes,SHA256 `4bf7c30d0c94d486ea9eb5b1aa78b763d2afad69609f14ee58d1aaa2e2d111c0`.

El productor empieza con otra base vacía,importa Agencia Norte porUI,genera especificación de ensayo,requiere revisión explícita y activa,se desconecta,modifica el teléfono ficticio de contact-1 y configura protección local. La exportación exige revisar la revisión vigente y contraseñas coincidentes;la descarga no altera sus62registros ni su único cambio local.

El ZIP se extrae en `C:/Users/iresh/AppData/Local/Temp/planb-portable137-b94b15c6-f59f-4ca3-b189-5437899f1439`,fuera del checkout D:. Se validan rutas antes de extraer,se rechazan escapes/enlaces y se limita la suma descomprimida a400MB. No se borra ni mueve una instalación existente. El archivo incluye runtime,NodeWindows,dependencias,recursosUI,iniciador,guardiared y copia cifrada;no incluye en su raíz data,continuity.seed.json,.env.local,.ai.local oserver.mjs. La copia cifrada no expone los marcadores ficticios del contacto ni las contraseñas de ensayo.

Se arranca el **node.exe descargado**,no el Node global,con runtime.mjs descargado;v24.14.0,SHA256Node `63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088`. Cuatro imports externos directos se resuelven dentro del paquete;una guardia adicional del ensayo rechaza resolucionesCJS fuera de su carpeta. La extracción está además fuera del árbol del repositorio,por lo que no hereda su node_modules. No se instalan dependencias.

Antes de restaurar,la instancia nueva no tiene captura ni contraseña configurada. Se crea otra protección local porUI;no se traslada la del productor. Se precrea una clave kind:test aleatoria nueva,antes de abrir SQLite:el ensayo no recupera DPAPI ni bases anteriores. La clave de ensayo no ofrece protección comercial para datos reales;solo se usan registros ficticios.

La restauración se hace con el selector de archivos de la app:

-Contraseña incorrecta:422;digest de todas las tablas de la base destino idéntico.
-Copia con un carácter de ciphertext alterado:422;digest de todas las tablas idéntico.
-Archivo original y contraseña correcta:200;62registros exactamente iguales al productor,misma captura/especificación y misma entrada de historial;runtime:true,disconnected:true,aiConfigured:false,hubspotConfigured:false.
-Se registra restoredAt sin inventar confirmación de custodia externa. La edición ficticia se muestra en la tabla real.
-Cierre limpio y reinicio del Node incluido:PID29892→26424,mismo instanceId destino `3c2f167d-4c04-463d-bea8-037d5dd2819f`,distinto del productor `db6196b7-1a25-46bc-b238-474132e15ae5`. La sesión debe desbloquearse otra vez con la contraseña propia del destino;los registros siguen idénticos.
-El productor conserva sus datos. La prueba retiene su cookie ficticia solo en memoria para su comprobación final,porque las cookies del mismo host comparten dominio entre puertos;no se guarda su valor en informes.

Los tres procesos propios finalizaron y se observó PID ausente:productor4180,destino29892y26424. No se liberaron bloqueos a mano. El navegador se cierra a about:blank antes de apagar para no mezclar sondeos con el apagado deliberado.

## Artefactos y atribución

Snapshot final `tests/.tmp/portable137-895bc3d2-331d-4625-8c0d-9aacd5e83d9b`. inputs.json conserva tres hashes de spec/helper137y helper133 leído;typecheck.log,results.json,browser.log,observed-portable.json,extraction.json,packaged-node.json,owner/exit/stopped y captura portable-restored.png conservan evidencia. Se inspeccionó esa captura a1440px:tabla de clientes en modo independiente,marcador ficticio del teléfono visible,sin recorte lateral aparente. No inspección móvil en137. Browser plugin not available;CLIPlaywright existente con Chromium1228 en contexto nuevo,serviciosworkerbloqueados,sinperfil delusuario.

Productor/backend/dist proceden del corte probado125,con sus hashes cotejados. Se compilaron runtime.mjs ydrill.mjs desde la **misma fuente congelada125**,sin rootbuild ni dist raíz. El paquete incluye156paquetes de dependencias existentes,5524archivos de recursos preparados:se copió su cierre transitivo y se preservaron alias/versiones/rutas físicas;no se hizo npm install. Manifiesto en `tests/.tmp/portable137-2e6aeb8c-ed74-4204-9c3a-e3f5fe5b745f/assets/manifest.json`,con archivos,hashes,metafiles,versiones y fuentes. Repeticiones reutilizan solo esos artefactos inmutables recotejados;cada base,descarga y extracción es nueva. launch.cjs no estaba en el snapshot125:se tomó el auxiliar actual en lectura,con hash/origen separado del freeze;no se ejecutó ese iniciador.

Este corte **no incluye132/135/140 nuevos**. Verifica el recorrido de recuperación del corte125,con recursos portátiles preparados para él. No es la candidata actual completa ni actualiza4591. No se aprovecha aceptación de otras fuentes para declarar probado su montaje.

## Incidencias preservadas

Dos fallos de preparación antes del navegador:launch.cjs ausente del freeze125(se congeló auxiliar actual separado);aliasnpmstring-width-cjs con nombre interno string-width(el resolvedor de preparación se corrigió para conservar el alias físico). Carpetas b83943b2… y8cab6632… preservadas;sin resultadosDOM atribuidos.

PrimerDOM,corte2e6aeb8c…:ZIP real descargado/extraído,pero la aserción «fuera del repositorio» solo admitía prefijo..;path.relative devuelve ruta absoluta al cambiar deD:aC:. Se admitió también ese caso,con mismo objetivo. SegundoDOM,f9217924…:ZIP/Node incluido funcionaron,pero dos botones «Restaurar archivo» provocaban strict-mode;se acotó al del historial,sin cambiar producto. Ambos0/1y sus descargas/logs/procesos cerrados se conservan. El tercer recorrido completo es el1/1dearriba;no se cuentan como tres pases. No se relajó restauración/integridad para conseguir verde.

## Límites

No se ejecutó ABRIR PLAN B.cmd/launch.cjs,porque abren un navegador del usuario;el ensayo inicia explícitamente el ejecutable y runtime empaquetados,con env mínimo y red externa bloqueada. Se añade una guardiaCJS de pruebas a la extracción;no es parte del ZIP emitido. No se ensayó simulacro/drill,aunque su archivo se incluya. No se verifica otro ordenador,usuarioWindows,DPAPIreal,instalación sin conexión física,disco lleno,corte abrupto,ZIPmalicioso suministradoexternamente niRTOuniversal. Es cierre/reapertura limpia y datos ficticios.

El ZIP de ensayo no es una publicación:su preparación no pasa el flujo de licencias/firmado/release del producto. Las dependencias se copiaron de las ya instaladas;no es una compilación reproducible acreditada desde lockfile/entorno limpio. La evidencia mide este paquete,Node y máquina. La tabla completa/digests prueba este fixture,un cambio y62registros;no certifica todos los planes de devolución o10000registros.

0pageerror,0solicitudesexternas. Dos erroresconsole422 corresponden exactamente a las dos restauraciones rechazadas;no son silencio de consola universal. No huboenvíosHubSpot/IA,contraseñas/cookiesreales,cuentas,perfiles,servicios4331/4334/4451o4591alterados,commit/push/worktree/despliegue. Las carpetas y paquetes se conservan,los procesos de ensayo se cierran. Siguiente:revisión independiente de137 y revisión/montaje140 en un corte nuevo,con incertidumbre136 por separado.
