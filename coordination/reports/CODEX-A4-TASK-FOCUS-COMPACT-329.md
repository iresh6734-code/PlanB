# La ficha muestra un acuse de guardado aunque falte el registro

10 de noviembre de 2026, Europe/Madrid. Unidad `CODEX-A4-TASK-FOCUS-COMPACT-329`.

Al recibir un acuse compacto de 323, la ficha mantiene la confirmación a la vista y oculta el formulario anterior. Muestra el estado de la actualización de Hoy y ofrece leer la tarea actual. La lectura tiene que corresponder a la misma copia. Si falla, la ficha conserva el acuse y permite repetir la consulta. Si funciona, el editor abre con el registro y la revisión recién leídos. El siguiente guardado exige una edición explícita.

En `tests/.tmp/task-receipt329-DHazs3` pasaron **47/47** en Chromium. La prueba nueva usa la ficha y el gestor reales en un arnés de Hoy con la API A4 montada en Fastify. La tarea ficticia supera el tamaño de respuesta de A4 y el servidor devuelve realmente `response-too-large` junto con el acuse. Una estrategia de prueba lo adapta a `compact-ack`. Tras el primer guardado, se observa un POST, una invocación al escritor y una fila. Se fuerza un fallo de lectura y después se recupera por GET. El segundo guardado, iniciado por la persona, usa otro UUID y la revisión de la lectura nueva. Los contadores finales son dos POST, dos invocaciones y dos filas. La captura queda en el banco.

Las otras 46 pruebas cubren las suites existentes de ficha y gestor, incluidas autenticación, cambios de copia, carreras y tamaños de pantalla. Typecheck focal limpio. Los siete casos de comportamiento de QA130 pasaron con la huella anterior y esa aserción falló al detectar la ficha modificada. Después de aprobar el navegador se renovó exclusivamente la huella de la ficha. **8/8** en `tests/.tmp/task-receipt329-hash-juz0PN`.

La prueba cubre el contrato 323 presentado con una estrategia de ensayo sobre la API 316. La conexión con la estrategia de Claude y la prueba desde Hoy en la App completa quedan pendientes de sus entregas.

## R2 · El acuse permanece si la captura cambia · 11/11/2026

La relectura y el comparador contrastan la huella original, además de la identidad pública. La regresión en Chromium activa otra captura con los mismos campos públicos y huella distinta. Conserva el acuse compacto, muestra el aviso y mantiene el editor cerrado, sin un escritor adicional. Banco pin334-full-tpPJmw 47/47 Chromium; la contraprueba que omite la huella falla en ese punto. La guardia de QA130 se revalidó con 131/131 Node y tipos limpios en pin334-rehash-Jk1KRZ. La rama del comparador carece de sonda propia de navegador. El recorrido usa la ficha, el gestor y la API reales con una estrategia de prueba, sin montaje de Hoy.

## R3 · Comparador de incompatibilidad desde Hoy · 11/11/2026

335 mueve la comprobación de procedencia al modelo de comparación. La ficha conserva la pantalla de incompatibilidad y bloquea el guardado al volver al borrador anterior. R3 renueva la guardia de QA130. Banco comparator335-new-6JKEJY, 16/16 Chromium, 8/8 Node y tipos limpios. El acuse compacto sigue cubierto. El informe 335 conserva el 409 real, los recuentos y la contraprueba, además de la corrección de un localizador antiguo en 336.
