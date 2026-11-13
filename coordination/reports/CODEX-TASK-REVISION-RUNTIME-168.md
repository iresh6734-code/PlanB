# Revisiones condicionales en runtime · 168

4/11/2026, Europe/Madrid. Presentada para revisión independiente. Una línea añade taskRevisions:true en createBaseApp del runtime ya aceptado090R2. Se conservan lockInstance antes de Store y la guarda que impide sustituir un plan corrupto por la semilla. No se cambia main167,cliente166,la ficha de Claude o la preview161.

## Evidencia propia

Snapshot `tests/.tmp/runtime168-15a3a24b-f018-4109-b63f-368a8d913ddd`. Misma prueba nueva con runtime previo:b132… devuelve404 en la ruta de revisiones después de acreditar endpoint/PID/instancia;falla0/1por404vs200,AssertionError,sin error de infraestructura. Runtime previo y manifiesto guardados. No se atribuye al runtime antiguo un defecto:era una ruta todavía sin activar.

Con la opción: **28/28Node y typecheck focal**. Un caso nuevo del runtime,8montaje160,16servicio128 y3bootstrap090;sin skips/TODO. El caso compila y ejecuta runtime real con carpeta/base/clavekindtest/semilla nuevas,HTML mínimo,puerto efímero y entorno mínimo/red externa bloqueada.

Comprobaciones:GETrevisión200 ligado a instancia publicada;tras protección ficticia401sin sesión/200con sesión,no-store/VaryCookie;dosPATCHdesde una revisión200/409 y1historial;replayviejo409;no-opcon revisión nueva changed:false ycontador1. Estado runtime:true/aiConfigured:false yreconectar servicios externos403.

Con el runtime propietario vivo,se intenta arrancar **main real** sobre su misma carpeta. Segundo proceso18860sale1 con «ya está abierto» antes de abrir suStore,con digest SQLite readonly meta/records/changes idéntico. El runtime26788 sigue vivo y su revisión coincide con la ganadora. Instancia propia67489caa-7a07-4516-b79c-7208df4c0de7,puerto60229. Ambos procesos y el runtimebaseline28540 registran close. Losbootstrapregistran sus cierres propios;no se operan previews existentes o procesos ajenos.

Fuentes consumidas y prueba cotejadas con manifestfinal. HTMLmínimo comprueba arranque/API,noUI;no se afirma prueba de lector de pantalla o navegador. No se guardan cookies o credenciales reales en el informe. No se ejecuta npmtest global ni se recompila distribuciónraíz.

## Límites

Escritor cooperativo único en una carpeta mediante los dos lanzadores existentes,no CAS entre procesos que ignoren ese protocolo ni idempotencia por intención. Las rutaslegacy y la ficha actual siguen sin adopción de revisión. La aceptación de160/167 y esta presentación no instala un nuevo binario en161;esa actualización requiere otra unidad con fuentes/artefactos/identidad verificables. U1/U2 y el kit116 mantienen sus revisiones y reservas propias.
