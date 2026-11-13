# Revisión independiente · aviso de lectura sustituida 155

3/11/2026, Europe/Madrid. Dictamen: **aceptar 155 en el alcance comprobado**. Los tres hashes presentados coincidían con los archivos actuales antes de decidir; no se modificaron las fuentes del autor.

## Cambio revisado

Se comparó `src/App.tsx` con la proyección de 151 aceptada. Una lectura de estado sustituida, tanto si su respuesta es satisfactoria como si es un error, rechaza mediante `SupersededStateRead`. La comprobación de autenticación ignora ese caso concreto; la promesa sigue rechazando para el consumidor del guardado. Los errores HTTP que siguen siendo actuales se propagan. El cambio no altera `LocalOperations` ni implementa el gestor 136.

## Repetición propia

- **6/6 DOM Chromium**: repetidos los tres casos del autor de 155 y los tres de 151, en App/Vite y servidor `createBaseApp` con SQLite en memoria, datos ficticios y red externa bloqueada. Cubren éxito y error HTTP de lectura antigua, error 503 actual visible, contador tras guardar, fallo de recarga con reintento sin repetir PATCH y lectura antigua frente a otra más reciente. Son pruebas del autor repetidas por este revisor, no seis pruebas nuevas.
- **4/4 Node**: arnés `tests/auth-parent.test.ts`, sobre el checkout actual.
- La proyección del autor tenía **238/238** entradas coincidentes con su manifiesto; en el checkout, 237/238 coincidían: la única diferencia era `debug.log`, no una fuente usada para los recorridos. Los hashes de App y de los dos specs usados se cotejaron con los actuales. Las seis pruebas DOM usaron procesos de servidor propios que quedaron observados como ausentes.
- Evidencia propia: `tests/.tmp/codex-review156-20261103`. Se usó acceso local autorizado porque el entorno restringido bloqueó Chromium contra loopback en la revisión 154; no se usaron proveedores externos.

No se repitieron la suite global, el typecheck focal o los otros 21 DOM que el autor declara como no repetidos. Las pruebas no cubren todas las carreras de autenticación, otros navegadores, lectores de pantalla, datos reales, CAS o D7 montado. La preview en 4594 seguía sirviendo la versión 151 durante esta revisión; aceptar el código no demuestra que esa preview esté actualizada.
