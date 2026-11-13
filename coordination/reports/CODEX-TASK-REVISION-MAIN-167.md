# Revisiones condicionales en el principal · 167

4/11/2026, Europe/Madrid. Presentada para revisión independiente. Se añade **una línea** `taskRevisions:true` a createBaseApp en server/main.ts. La exclusión lockInstance sigue ejecutándose antes de abrir Store. Main se reservó después de la aceptación074;runtime090 y las fuentes de Claude/cliente166 no se editaron.

La API condicional queda activada al ejecutar este código del principal. **La preview161 sigue con su binario anterior y no incorpora este cambio**. El cliente actual de la ficha continúa por la ruta legacy;esto no le añade protección condicional todavía. Runtime es otra activación con reserva y revisión propias.

## Comprobación propia

Snapshot `tests/.tmp/main167-19647e93-af9e-4aca-9ebb-05333dde88f5`. La prueba nueva compila y ejecuta el principal real con carpeta,base,clavekindtest y semilla ficticia nuevas,HTML mínimo,puerto efímero y entorno mínimo/red externa bloqueada. El endpoint publicado debe coincidir con PID e instancia del proceso antes de probar la API.

**Contraste previo:**con main196c51… sin la opción,la misma prueba falla por404 frente a200 en la ruta de revisiones;el proceso había iniciado y publicado su identidad.0/1 porAssertionError,no por fallo de imports,servidor o puerto. Main previo y manifestbaseline quedan archivados. Es una función no activada antes,no un defecto atribuido al lanzador antiguo.

**Con la opción:**28/28Node,typecheck focal limpio,0skip/TODO. Son1caso nuevo del principal,8montaje160,16servicio128 y3bootstrap090. No se ejecutó npmtest global ni navegador:el HTML mínimo verifica backend/arranque,no la App visual.

El caso nuevo comprueba:

- GET real de la revisión y asociación con la instancia publicada;tras configurar protección ficticia,la ruta devuelve401 sin sesión y200 con sesión,no-store/VaryCookie.
- Dos PATCHHTTP con la misma revisión dan200/409 y una sola operación de historial. Un reenvío con token viejo sigue en409;un no-op con la revisión nueva devuelvechanged:false y conserva el contador1.
- Mientras el principal propietario sigue vivo,se intenta arrancar otro proceso real sobre la misma carpeta y puerto. Sale con código1 y «ya está abierto»,antes de abrir su Store;el digest leído en SQLite readonly de meta/records/changes no cambia. El dueño original sigue vivo y la revisión posterior coincide con la ganadora.

Evidencia observada:dueño25676,rechazado15524,instancia `a9fd0507-9e9c-4daa-9eb0-ec288932dba0`,puerto63814. El dueño de la prueba final,el rechazado y el proceso del baseline27240 registran close. Las tres pruebas de bootstrap también usan sus cierres por evento. No se detuvo la preview ni procesos ajenos.

Las fuentes y la prueba consumidas se cotejan con manifestfinal. La prueba no registra manualmente el servicio:es el principal compilado quien activa la opción. No se guardan cookies o valores de sesión en el informe;las credenciales de esta fixture son inventadas.

## Límites y siguiente paso

Garantía de un escritor cooperativo en este lanzador y carpeta,no CAS multiproceso arbitrario ni idempotencia por intención. La ruta legacy continúa admitiendo escrituras sin revisión. El bloqueo se prueba sobre dos instancias de este principal;no demuestra que otros programas que ignoren el protocolo no puedan abrir SQLite.

090R2 se aceptó de forma independiente163 mientras se desarrollaba167,pero su runtime no se incluyó en esta reserva. El cliente166 y U1/U2 requieren sus propias revisiones e integración;conservar changed:false y la nueva revisión. No se actualizó una distribución o runtime161 ni se conectó un proveedor. Tras dictamen167,preparar activaciónruntime en otra unidad exacta y actualizar una copia compilada con manifest e identidad verificables.
