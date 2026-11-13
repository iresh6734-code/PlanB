# Plan B Operaciones · Comprobar una fecha y revisar la decisión

Encargo para Claude Opus 5.5, preparado el 10 de noviembre de 2026, Europe/Madrid. Se puede usar también con Fable 5.2. Lee el tablón vigente al empezar. El objetivo es un recorrido funcional en la App para ventas y operaciones.

## Misión

Construye **Comprobar una fecha**. Una persona recibe una solicitud de instalación, indica los requisitos y ensaya si puede ofrecer la fecha pedida. Plan B calcula si caben el trabajo nuevo y los compromisos que ya existen. Si hacen falta cambios, muestra qué cliente se vería afectado, qué condiciones permiten mantener las fechas y qué dato conviene confirmar primero. La persona puede registrar un siguiente paso y, más adelante, comparar el ensayo con el desenlace observado.

Reutiliza Radar, Ensayar mi semana, el planificador y sus explicaciones, las decisiones locales y la procedencia de las fuentes. La misma capacidad sirve a quien necesita reaccionar a un retraso en operaciones y a quien necesita responder antes de prometer una fecha en ventas. El primer recorrido usa una distribuidora e instaladora. El segundo caso de negocio, servicios y proyectos, comprueba la reutilización del modelo con capacidad y aprobaciones.

Elige un diseño que permita explicar el resultado directamente desde sus restricciones y datos. La aplicación debe poder ejecutar el cálculo localmente con el motor de planificación. La persona controla la política de prioridades y confirma las decisiones.

## Punto de partida y reparto

El tablón en la revisión 2327 mostraba `CLAUDE-FABLE-OPERATIONAL-CORE-1` y `CLAUDE-FABLE-OPERATIONAL-MOUNT` en corrección. CORE-2, SERVICES y el montaje del host estaban presentados. La entrada desde Hoy estaba en desarrollo. El navegador mostró una compilación de ensayo desde Radar, con una instalación ficticia y alternativas calculadas. El nuevo trabajo conserva esos avances y lleva el cálculo a varios compromisos que comparten recursos.

| Responsable | Encargo |
| --- | --- |
| **Opus 5.5** | Lidera esta entrega. Implementa la proyección de cartera, cantidades y reservas, cálculo, explicación y recorrido de producto en los módulos asignados. Puede llevar todos los paquetes en secuencia si trabaja una sola sesión Claude. |
| **Fable 5.2** | Si la sesión sigue activa, termina las correcciones que tiene reservadas. Después puede contrastar la búsqueda, los límites, la semántica de prioridades y los casos difíciles en una unidad de revisión propia. |
| **Otro agente de Claude** | Si está disponible, prepara el segundo caso de negocio o los casos de importación y procedencia, con rutas propias y contrato acordado. |
| **Codex coordinador** | Acuerda contratos, propietario de las rutas y persistencia, y organiza el montaje en Hoy/Radar y la candidata. |
| **Codex revisor** | Comprueba los cortes aceptados, los efectos persistidos y la prueba independiente sobre App compilada. |

Confirma quién lleva cada paquete con el tablón y `check-path` antes de escribir. `App.tsx`, `RadarHost.tsx`, los componentes actuales del ensayo y los registros de servidor se integran con su propietario cuando queden disponibles. Trabaja sobre una combinación identificada por huellas. La revisión de un componente y la prueba de una candidata navegable son entregas con evidencias propias.

## Caso de aceptación

Usa las 12 instalaciones, 3 técnicos, 2 almacenes, 20 pedidos y 8 tickets del caso de ensayo existente. Añade un posible pedido de **12 equipos para instalar el viernes a las 16:00**. Almacén Sur tiene 16 unidades compatibles, con 8 reservadas para el lunes. La técnica habilitada comparte capacidad con otro compromiso. Un proveedor podría aportar las cuatro unidades que faltan. La fecha de llegada empieza como desconocida.

Ajusta la fixture para que un oráculo pequeño pueda verificar estos resultados antes de diseñar la pantalla:

| Acción ensayada | Resultado que se debe poder comprobar |
| --- | --- |
| Mantener las reservas y turnos | La App calcula la primera fecha sustentada por la evidencia disponible o explica por qué todavía queda sin determinar. La fecha pedida permanece visible. |
| Usar cuatro unidades reservadas | La instalación podría disponer del material. La App identifica la entrega del lunes que quedaría corta y conserva la restricción de personal. |
| Confirmar solo la llegada de las cuatro unidades | El material deja de bloquear. El choque de horario sigue visible. |
| Añadir solo una franja compatible | Se libera capacidad. Las cuatro unidades siguen pendientes. |
| Confirmar material y franja conjuntamente | Los dos cambios permiten conservar las fechas de los compromisos protegidos y ofrecer el viernes en este escenario. |
| Recibir una revisión posterior que retira la franja | La comparación previa sigue consultable y la confirmación pide recalcular sobre la revisión vigente. |

Define en la fixture el SKU, almacén, reservas, compatibilidad, disponibilidad y franjas exactas que hacen verdaderas estas expectativas. Comprueba también un pedido que sí cabe desde el principio, otro que queda condicionado por una señal ausente y otro que el cálculo completo demuestra inviable dentro del horizonte.

## Paquete 0 · Cerrar la base del ensayo

Lee los dictámenes 325, 327 y 328 y las presentaciones más recientes. Coordina con sus autores el cierre de los casos abiertos. El recibo debe reflejar el evento persistido. Una alternativa solo queda vinculada a la preparación, ensayo e intento que la originaron. Si el guardado se aplicó y falla el vínculo, el siguiente intento recupera ese vínculo conservando la decisión existente. La incertidumbre de un predecesor debe propagarse de forma coherente, con independencia del orden de entrada.

La base queda lista para montar el flujo nuevo al superar la revisión de las versiones exactas del motor y del guardado. Mientras se resuelve, avanza la fixture de cartera, el contrato y el oráculo en módulos con reserva propia. Coteja el resultado con las versiones aceptadas antes de conectar el consumidor.

## Paquete 1 · Calcular para toda la cartera

1. Define una extensión versionada del modelo para cantidades, SKU, almacén, disponibilidad y reservas. Atribuye cada dato a una cuenta, fuente, revisión y momento de observación. Una sustitución requiere compatibilidad explícita. Verifica el saldo en cada instante pertinente, el orden de consumo y reposición y la conservación de reservas. Mantén compatibles los ensayos ya guardados.
2. Añade el posible compromiso como entrada de ensayo con identidad propia, duración, ventana, habilidades, materiales y fecha pedida. Una duración, cantidad o disponibilidad desconocida debe poder propagarse y condicionar la fecha ofrecida. La fuente parcial o antigua conserva su estado y su fecha de observación.
3. Evalúa alternativas individuales y combinadas. El operador marca las fechas que protege y fija prioridades. Las protecciones se comprueban como restricciones. Revisa con un ejemplo qué significa priorizar un trabajo que ya llega tarde y cómo se ordenan las alternativas en ese caso. Conserva una explicación del objetivo elegido.
4. Devuelve la fecha solicitada, la fecha sustentada o condicionada, los compromisos que mejoran o empeoran, las reservas consumidas, las horas adicionales y la comprobación que cambiaría el resultado. Cada explicación debe corresponder a asignaciones y restricciones del cálculo. Si hay varios escenarios declarados, informa en cuáles funciona cada alternativa.
5. Conserva los límites de búsqueda y la cancelación. Distingue solución comprobada dentro del modelo, alternativa condicionada, conflicto verificado y exploración incompleta. Contrasta el planificador con un oráculo independiente en problemas pequeños, y mide tiempo y tamaño con la empresa completa. Comprueba doble reserva, no solapamiento de técnicos, conservación de unidades, identidad entre cuentas y estabilidad ante permutaciones irrelevantes de la entrada.

## Paquete 2 · Llevar el cálculo a la decisión

Añade **Comprobar una fecha** en la navegación habitual de Hoy o Radar. Reutiliza la vista de ensayo donde ayude a comparar. La primera pantalla pide solo el trabajo, fecha, duración, habilidad y material requeridos. A continuación muestra la fecha y condiciones que la persona puede evaluar, las filas de compromisos afectados y la acción siguiente. Cada fila abre la evidencia pertinente. Usa el caso de aceptación para recorrer el flujo con ratón, teclado y a 1440, 390 y 320 px.

El borrador y la simulación pueden usar un registro local de ensayo identificado. Los registros de negocio se conservan durante el cálculo. La confirmación registra un siguiente paso local con revisión y clave de operación. En el primer corte cada confirmación afecta a una sola decisión. Un cambio de cartera, recursos, ámbito o reservas relevantes invalida el cálculo anterior. Verifica esa revisión en la frontera de escritura. Reintentar tras perder el acuse conserva el mismo resultado y el recibo muestra el contenido persistido.

El montaje se valida en la App compilada y con servidor real, SQLite de archivo y un proceso nuevo para el reinicio. Recuenta por separado las ejecuciones de simulación, decisiones guardadas y reintentos. El resultado esperado es cero cambios de negocio al comparar y exactamente una decisión al confirmar. Comprueba dos pestañas, pérdida de respuesta, cambio de copia, bloqueo de sesión y reapertura.

## Paquete 3 · Revisar el desenlace

En la ficha, añade **Revisar una decisión**. Abre la revisión con la que se ensayó, la alternativa elegida, las condiciones que la sustentaban y el resultado observado después. Cada hecho observado lleva fecha, referencia y alcance. Cuando la evidencia solo permite atribuir una parte del retraso, muestra esa parte y lo que queda por comprobar. Conserva por separado una proyección contrafactual y el desenlace que realmente se observó en el escenario.

Demuestra dos cierres en la ficción. En uno, se cumplen las condiciones y la fecha ofrecida coincide con el resultado observado. En el otro, el proveedor llega tarde y la App muestra la diferencia entre la condición original y la observación posterior. Repite la reapertura después de reiniciar. Valida después el caso de servicios y proyectos usando capacidad y aprobaciones sobre el mismo recorrido.

## Paquete 4 · Pasar de ficción a un piloto útil

Prepara un contrato de lectura de las señales necesarias para cada decisión. Empieza con una fuente de pedidos e inventario y otra de compromisos. Mapea referencias explícitas, detecta vínculos ambiguos y conserva la cobertura por cuenta y objeto. Una importación de ensayo con datos de distintas fuentes debe demostrar qué observación cambia una fecha y cuál sigue faltando. Los pilotos con cuentas de ensayo se programan por proveedor con alcance autorizado y pruebas de identidad, pérdida de acceso, cobertura y frescura. El flujo de confirmación de esta entrega registra decisiones locales.

Evalúa el recorrido con ventas y operaciones. Mide cuánto se tarda en obtener una fecha utilizable, qué proporción de casos queda condicionada, en cuántos se descubre un compromiso afectado que el operador no había visto y qué predicciones se pueden contrastar con un desenlace observado. Publica cifras con su denominador y procedencia.

## Entrega que tiene que poder verse

Deja una candidata navegable con el caso de Almacén Sur. En una misma sesión, introduce el pedido nuevo, prueba la llegada de las cuatro unidades, añade la franja de la técnica, compara la cartera, confirma un siguiente paso y vuelve a encontrarlo tras reiniciar. Abre después el desenlace y muestra por qué la fecha se cumplió o cambió. Incluye instrucciones para reproducir la demo, huellas de fuentes y ejecutables, pruebas ejecutadas, límites y un inventario de lo que puede abrirse desde la App.

El primer objetivo es entregar los paquetes 0 a 2 con una prueba de aceptación en navegador. Presenta cada unidad cuando sea revisable y avanza trabajo independiente durante la revisión. El paquete 3 completa el ciclo de decisión. El piloto de fuentes tiene su propia puerta después de la demo.

## Elección del modelo

Opus 5.5 es la primera opción para liderar la implementación. Anthropic lo documenta para programación prolongada e ingeniería de sistemas complejos. Usa `claude-opus-5-5` si la sesión lo admite. El alcance de cada fase y los resultados contra el oráculo y en navegador deciden si conviene ampliar el esfuerzo o pasar un problema difícil a Fable. [Ficha oficial de Opus 5.5](https://platform.claude.com/docs/en/models/opus-5-5/overview)
