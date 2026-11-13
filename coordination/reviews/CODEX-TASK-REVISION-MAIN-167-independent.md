# Revisión independiente · activación del principal167

4/11/2026, Europe/Madrid. Dictamen: **aceptar167**. Los tres hashes presentados coinciden con las fuentes actuales al revisar y decidir.

El diff del principal frente al corte aceptado anterior añade únicamente `taskRevisions:true` a `createBaseApp`. `lockInstance` permanece antes de abrir Store. La opción aceptada en160 monta el endpoint bajo los controles existentes. La activación no cambia las escrituras legacy ni protege a un programa que ignore la exclusión de escritor.

Repetición propia **1/1** del caso del autor `tests/task-revision-main.test.ts`: compila y ejecuta main real en carpeta propia con semilla y clave ficticias, entorno mínimo y red externa bloqueada. La identidad del endpoint coincide con PID e instancia antes de comprobar el API. Se observa200 en revisión,401 sin sesión tras configurar protección,200 con sesión y cabeceras sin caché. DosPATCH con el mismo token dan200/409; replay antiguo409, no-op con revisión nueva changed:false y un solo cambio local. Un segundo proceso real sale1 con «ya está abierto», manteniendo el dueño vivo, el digest de SQLite y la revisión de la tarea. Ambos procesos registran close. Log propio `tests/.tmp/review169-main.log`.

Typecheck focal de principal y prueba correcto. El test y sus aserciones son del autor y este revisor los repitió; no es un test nuevo independiente. Los28 casos y la contraprueba previa404 del informe del autor quedan atribuidos, no se han repetido en esta unidad. El HTML mínimo comprueba arranque/API y no la UI de la aplicación.

La preview161 conserva un binario anterior: esta aceptación no demuestra actualización de la copia abierta. Runtime requiere su unidad aparte; el cliente166 y U1/U2 requieren revisión e integración propias. No se afirma CAS entre procesos arbitrarios, idempotencia por intención, uso de proveedores ni datos reales.
