# Cliente y lanzadores condicionales · ciclo177

4/11/2026, Europe/Madrid. **Dos recorridos completos pasan y se presentan para revisión ajena.** Unidad solo de prueba e informe;no cambia producto,Claude o la demo161.

El cliente166 y los lanzadores main167/runtime168 ya tienen aceptación independiente. Este banco comprueba su composición sobre los ejecutables reales,en lugar de asumir que los resultados separados de cliente y factoría prueban el conjunto.

## Evidencia propia

Snapshot `tests/.tmp/c177-423b6d6b`. **2/2 casos Node y typecheck focal**,0skip/TODO. Un caso compila y ejecuta main y el otro runtime,cada uno con carpeta,base,semilla,clavekindtest y sesión ficticia nuevas,HTML mínimo,puerto efímero y entorno mínimo/red externa bloqueada. Endpoint publicado debe coincidir con PID e instancia antes de iniciar el cliente.

En ambos:

- Setup real con contraseña inventada y cliente166 usando fetchnativo/HTTP real,con cookie solo en memoria y no en evidencias.
- Dos editores desde la misma vista:changed/conflict y un cambio. No-op con revisión nueva devuelveunchanged;token viejo devuelveconflict.
- Otro guardado se aplica,pero el transporte desecha deliberadamente su acuse después de consumir el cuerpo. El cliente informauncertain. La comprobación posterior solo lee y observa el valor;no prueba quién lo escribió. No aparece otro PATCH hasta una decisión explícita de la prueba,y el token anterior sigue enconflict. Hay dos cambios antes del controllegacy.
- Las peticiones del cliente usan únicamente /api/v7/task-revision/. No se activa fallbacklegacy.
- La prueba hace luego **un PATCHlegacy explícito separado del cliente**,para dejar acreditado el límite todavía vigente:la ruta antigua admite escritura sin revisión. Ese tercer cambio invalida la vista anterior del cliente condicional,que devuelveconflict. El informe no presenta esas rutas como protegidas porCAS.
- Bloquear la sesión real hace que read devuelvafailed/status401. Los procesos se cierran por sus handles y registranclose.

Manifest.json conserva las fuentes consumidas y los hashes de las tres entregas aceptadas. Logs de cada ejecutable y observed.json guardan los resultados y las rutas/métodos del cliente,sin contraseña/cookies/tokens. Los artefactos,semillas y bases son propios nuevos;no se abrió una instalación anterior ni se operó4594.

## Límites

La secuencia se ha ensayado en una instalación por lanzador y con un escritor cooperativo. No son dos pruebas de UI:el HTML es mínimo y el cliente se invoca desde Node. No se monta aún en la ficha136/U1/U2,no se conserva su borrador a través de una vista,y no se demuestra idempotencia por intención,CAS multiproceso o persistencia del gestor. El cliente no crea un recibo de autoría al leer un valor coincidente.

Las fuentes aceptadas no actualizan automáticamente la demo161,que conserva el backend anterior160.177 se presenta sin autoaceptación;la adopción de UI y una actualización compilada requieren unidades separadas y reservas coordinadas con Claude.
