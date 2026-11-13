# Diario 208 · Dictamen independiente

## Dictamen vigente · R5 favorable

6 de noviembre de 2026, Europe/Madrid. Las seis huellas de R5 coinciden con la presentación y la proyección `tests/.tmp/journal-r5-iopLYi`. Pasan las 53 pruebas de la autora, las diez sondas anteriores y las cinco sondas de ámbito mutable y copia de transporte, 68/68 en dos invocaciones. Tipos focales limpios. La misma ejecución de las cinco sondas con el modelo R4 restaurado en la proyección falla 5/5. El modelo R5 se restituyó y se cotejaron las seis huellas al terminar.

Las operaciones fijan el ámbito antes de esperar almacenamiento. Editar y promover un borrador compara con la intención preparada, y el callback recibe una copia. La liquidación usa la identidad propia del intento. Las pruebas de archivo del autor usan Store real, una clave de ensayo recién creada y la guarda de red. El banco mantiene las comprobaciones anteriores de límite, forma y calendario, evidencia concurrente, normalización de valores y retención.

Se acepta R5 como protocolo y adaptador del diario. El punto de entrada HTTP, la autorización del ámbito en la integración, su consumidor en Hoy y el ciclo tras reiniciar la App siguen en las unidades de montaje. Los casos de caída del proceso y exclusión de instalación requieren ese recorrido integrado. Este dictamen desbloquea la dependencia de A4.

## Dictamen anterior · R4 devuelta para R5

6 de noviembre de 2026, Europe/Madrid. Las seis huellas de R4 coinciden con la presentación y el checkout. Pasan 46 pruebas propias y las diez sondas anteriores, 56/56. La normalización JSON, evidencia y calendario quedan corregidos. Cinco sondas nuevas fallan sobre SQLite de archivo con una clave ficticia por raíz y barreras deterministas. No existe todavía un consumidor de la App que acredite estas combinaciones.

**F1 · El contexto mutable puede cambiar la autorización del registro durante una espera.** Se guarda un borrador de B y se pide editar o promover ese ID desde A. Se retiene `storage.readAll` después de tomar su lectura y, mientras la operación espera, el llamador cambia el objeto de contexto a B. `prepare` ya había construido un registro para A, pero la guarda posterior comprueba el objeto cambiado a B. Tanto `saveDraft` como `attempt` admiten sobrescribir el borrador B con el registro A. En `attempt` se invoca el callback una vez. Debe conservarse el rechazo `wrong-context` y el valor de B. Las variantes `boot` y `abandon` también usan el contexto mutable después de esperar. `boot` ofrece restaurar el borrador de B a una petición iniciada para A. `abandon` liquida el registro de B. Las dos deben mantener el ámbito solicitado al iniciar la llamada.

**F2 · El callback puede dirigir el acuse a otro intento.** Primero se conserva `other-intent` como incierto. Se inicia `sent-intent` y su callback cambia el ID del objeto recibido a `other-intent` antes de devolver un acuse. El diario comparte ese objeto con su seguimiento posterior y liquida el otro intento. Debe entregar una copia al callback y conservar su propia identidad para asentar el acuse del envío que inició. El otro intento conserva sus bytes y su fase incierta.

El contraste privado fija el ámbito al entrar, compara la promoción con la intención preparada y separa el objeto entregado al transporte del que conserva el protocolo. Pasan las 61 pruebas y los tipos focales. El corte es `tests/.tmp/journal-r4-vdVBO2`, con `known.log`, `exact-scope.log`, `proposed.log`, `types.log`, `result.json` y `proposed-task-intent-journal.ts`. Se usa la Store aceptada de 055 que contiene 236. Los archivos de Claude y la copia exacta dentro del corte conservan sus seis huellas. El primer arnés terminó sus pruebas pero omitía el tsconfig de la proyección. Se corrigió y se repitió el corte final.

R5 requiere fijar las entradas antes de atravesar almacenamiento y separar referencias entregadas al transporte. Conserva la reserva de los seis archivos. El brief existente contiene las reproducciones y los controles. Estas pruebas no acreditan arranque o recuperación desde la App.

## Dictamen anterior · R3

Las seis huellas presentadas coinciden. Pasan 37 pruebas de la autora y las siete sondas de revisión anteriores sin cambios. La aceptación intercalada y las fechas persistidas inválidas de R2 quedan corregidas. Pasan los tipos focales. Dos pruebas nuevas sobre la API pública fallan en la escritura. El control con número finito y null explícito pasa.

- **El parche persistido puede diferir de lo que recibe send.** Con un campo numérico igual a Number.NaN, un valor representable por el tipo number de TypeScript, attempt responde journaled true y llama una vez al callback. El callback recibe NaN. El registro escrito, con checksum válido, se lee como null por la serialización JSON. El módulo promete guardar el parche que va a entregar al ejecutor. El callback es sintético. No se prueba un PATCH real ni se afirma que esta entrada cruce el validador HTTP.
- **El diario puede poner en cuarentena su propio intento válido.** Tras crear un intento incierto, recordEvidence recibe applied con fecha 2026-02-30T10:00:00.000Z. Devuelve ok y sobrescribe el registro. Al volver a leer, boot lo clasifica como quarantined. Se debe rechazar esa evidencia y conservar la versión válida, incluidos los bytes y la posibilidad de comprobar después.

Los dos casos usan el adaptador SQLite real en memoria. El primer corte privado tenía un discriminante incorrecto en el retorno del doble (uncertain en vez de unknown). Se corrigió la sonda y se repitieron todas las pruebas en tests/.tmp/j231-9e74a6ed. En una segunda copia privada se comprobó el efecto de validar patch y baseline antes de serializar y validar el registro resultante antes de escribir. Pasan 47/47 y tipos. El código de ese control está solo en la carpeta control del corte. No es una entrega para integrar, ni cubre si la capacidad o la poda preceden a un alta inválida.

El diario sigue sin montaje de App. Las pruebas de archivo propias del autor se repitieron con claves de tipo test nuevas. El hallazgo de apertura de Store y el montaje conservan sus reservas.

---

**Diario 208 R2 devuelto para R3**

Las seis huellas presentadas coinciden con el corte privado `tests/.tmp/j210r2-0fdc463a`. Pasan los 31 casos del autor, las cinco reproducciones originales de 210 sin modificarlas y los tipos focales. Las correcciones de identidad, base del parche, límite atómico y fecha ilegible de R1 quedan verificadas.

**F6 · Aceptación basada en una lectura que ya cambió**

La API pública permite dos diarios sobre el mismo Store. El primer lector obtiene un snapshot con evidencia applied. Antes de devolver ese snapshot a acceptRead, otro escritor registra evidencia diverged. Ambas acciones usan el adaptador real y entradas válidas. acceptRead valida el snapshot viejo y después change vuelve a leer el registro. Esa segunda lectura ya contiene diverged, pero el método la liquida sin volver a exigir applied. El resultado es accepted true, phase settled y evidencia diverged, con nuevos bytes. Se pierde la condición exigida por la aceptación humana.

La comprobación y la escritura deben usar la misma versión del registro. Si la evidencia cambia entre leer y escribir, la comparación de bytes debe rechazar el cambio o la lectura nueva debe ser validada otra vez antes de intentar escribir. El intento debe conservar la evidencia vigente y seguir pendiente.

**F7 · Una fecha imposible se toma como válida y permite la purga**

Se toma un registro liquidado válido, creado en enero, y se cambia solo updatedAt por 2026-02-30T10:00:00.000Z con un checksum coherente. decodeRecord lo acepta porque Date.parse normaliza ese día a marzo. prune elimina la fila como vencida. La sonda observa decoded true, removed 1 y pérdida de bytes.

Este caso afecta a metadatos persistidos alterados o heredados. El reloj normal de Date.toISOString no produce esa fecha. El contrato R2 promete conservar en cuarentena las fechas inválidas, por lo que la comprobación debe validar también el calendario.

Las dos sondas están en `s/tests/independent-intent-journal-r2-races.test.ts` del corte. Ambas fallan por AssertionError sobre los valores descritos. Sus tipos están limpios y el manifiesto de fuentes permanece igual. Los resultados constan en r2-races.log y r2-races-result.json. La primera ejecución de estas sondas se repitió solo para conservar el log y comprobar tipos. Las mutaciones comunicadas por la autora quedan atribuidas a su informe. Las pruebas de archivo del autor usan una clave test nueva en una carpeta del corte, con red externa bloqueada.

Las seis reservas de la autora continúan. El arranque de la App, el montaje persistente, la exclusión entre procesos y DPAPI siguen fuera de esta repetición. El brief vigente R3 se encuentra al principio del archivo de encargo R2 conservado.

---

**Primer dictamen sobre R1 · histórico**

# Diario de intención 208 · revisión independiente 210

**Dictamen. Devolver para corrección.** Se conservaron las seis huellas presentadas. Pasan los 21 casos del autor y el análisis focal de tipos. Las cinco sondas propias fallan en las aserciones descritas abajo. Usan la API pública del diario y el adaptador real de Store con SQLite en memoria.

1. **F1 · Identidad de la captura.** Se guarda un borrador de la captura A y se reutiliza su ID al llamar a `attempt` desde B con el mismo ID de tarea. Se escribe el intento en A y se ejecuta una vez el callback de envío. La liquidación posterior no coincide con B y A queda con un intento sin resolver. La identidad debe validarse antes de escribir o entregar el intento al callback.
2. **F2 · Identidad de la tarea.** Se guarda un borrador de `task-1` y se llama a `attempt` con su ID y `task-2` en la misma captura. El callback corre una vez y cambia el registro de `task-1` aunque se solicitó la otra tarea. El borrador debe permanecer byte a byte, como en F1. Revisar también la edición de un borrador existente, que construye el registro a partir del ID de tarea entrante.
3. **F3 · Valor base del intento.** Se guarda una modificación de notas y luego se promueve con un parche de estado, una base de estado y una revisión nueva. El callback recibe el parche y la revisión nuevos junto a la base vieja de notas. Al recuperar la intención, no se puede comparar el estado con la base que realmente se revisó.
4. **F4 · Tope y altas concurrentes.** Con un máximo de un registro, dos altas simultáneas con IDs distintos se aceptan y dejan dos filas. Sucede con una única instancia del diario y un único Store. La escritura con comparación por ID funciona, pero no hace atómico el límite total.
5. **F5 · Retención.** Un registro liquidado con fecha de actualización inválida y checksum coherente se elimina en `prune`. `Date.parse` devuelve `NaN` y la condición que compara con el corte lo deja pasar. Sin fecha válida no se acredita que haya vencido. Debe conservarse y clasificarse como dañado.

## Evidencia

Corte privado `tests/.tmp/j210-98fe684e` de 129 entradas, con manifiesto, `author.log`, `independent.log`, `typecheck.log` y `results.json`. Las seis huellas del autor se cotejaron antes de devolver. Para repetir las pruebas de archivo del autor, se redirigió exclusivamente su carpeta temporal a una raíz del corte y se precreó una clave aleatoria de tipo test. Se comprobó el comportamiento con valores sellados y reapertura de SQLite. Las sondas de identidad cuentan un callback en memoria. No hubo PATCH, llamadas externas ni montaje. No se probó DPAPI, exclusión entre procesos, reinicio de la App ni la apertura de una base con JSON plano dañado que menciona la autora.

Almacenamiento ilocalizable, procedencia de aceptación y validación de la forma completa también requieren definición antes del montaje. Este dictamen tiene cinco reproducciones independientes y reserva las decisiones de integración para otra unidad.
