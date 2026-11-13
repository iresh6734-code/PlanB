# Revisión independiente · estado padre 151 y arnés 152

3/11/2026, Europe/Madrid. Revisión de otra sesión Codex, sin modificar los seis archivos del autor. Se cotejaron los **4/4 hashes** presentados de 151 y **2/2** de 152 antes y después de las pruebas. Dictamen: **aceptar ambas entregas en el alcance comprobado**.

## Alcance revisado

Se compararon `App.tsx` y `LocalOperations.tsx` con la copia anterior a 151. Tras el acuse de la ficha, se espera una lectura del estado padre y luego la cola; una lectura sustituida o fallida rechaza el callback. `refresh` compara una secuencia antes de actualizar el estado, y el pie usa singular para un cambio. Esto no implementa el gestor de operaciones 136, CAS, persistencia ni resolución de incertidumbre al cerrar la ficha.

Se comparó `tests/auth-parent.test.ts` con la copia anterior a 152: el único cambio es añadir `useRef` al simulador de hooks, conservando el resto del archivo y sus aserciones. El arnés no equivale a un navegador ni verifica por sí mismo toda la autenticación.

## Comprobaciones propias

- **4/4 Node**: `node --import tsx --test tests/auth-parent.test.ts` sobre el checkout actual.
- **3/3 DOM Chromium**: repetición de las tres pruebas del autor en una nueva carpeta de resultados `tests/.tmp/task-state-review154-escalated`, usando su proyección congelada `tests/.tmp/task151-ab82dc5e-b177-41f0-9e69-929ccb87026a/source` y servidores loopback con SQLite en memoria y datos ficticios. Se comprobaron los tres hashes relevantes y los **236/236** del manifiesto de fuentes de la proyección; coincidían tanto con la proyección como con el árbol al iniciar. Los tres procesos de servidor de esta repetición quedaron observados como ausentes.
- Los casos repetidos comprueban contador actualizado desde Hoy, acuse conservado ante error de lectura y reintento sin segundo PATCH, y descarte de una respuesta anterior cuando otra lectura devuelve estado posterior. Son **pruebas escritas por el autor y repetidas por este revisor**, no tres pruebas nuevas independientes.
- El primer intento de DOM dentro del entorno restringido tuvo **0/3** por `ERR_NETWORK_ACCESS_DENIED` al abrir 127.0.0.1, antes de interactuar con la aplicación; no es un fallo funcional acreditado. Se repitió fuera de esa restricción con la misma proyección y solo el servidor ficticio local: 3/3. Los fallos iniciales no se suman como pruebas funcionales ni se ocultan.

No se repitieron los 150 Node, las otras 21 pruebas DOM o los mutantes que declaró el autor; se dejan atribuidos a su informe. No se ejecutó `npm test` completo ni se probaron otros navegadores, lectores de pantalla, datos reales, una instalación actualizada o HubSpot. La garantía de orden se limita a las lecturas de `App.refresh`, no evita escrituras concurrentes por rutas antiguas.

El gestor `CLAUDE-TASK-UNCERTAINTY-136` fue aceptado por el otro revisor según el tablero; sigue sin montarse en la ficha ni en la App. La aceptación de 151/152 no cierra D7 ni autoriza cambios en los archivos reservados por otras tareas.
