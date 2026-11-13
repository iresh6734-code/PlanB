# Misión para Fable 5.2 · Ensayar la empresa antes de tomar una decisión

10/11/2026, Europe/Madrid. Encargo propuesto por Codex coordinador. Destino: una sesión Claude seleccionada realmente con `claude-fable-5-2`; nombrar el modelo en este documento no cambia una sesión. No se ha ejecutado todavía esta misión.

## Tu objetivo

Construye el núcleo de una capacidad que permita a una distribuidora o instaladora ensayar una semana de operaciones, detectar qué promesas no puede cumplir, comparar respuestas y saber exactamente qué información cambiaría su decisión. El producto final debe integrarse en Plan B y conservar un recorrido comprensible desde Hoy y el Radar.

La pregunta central es: **«Con estos compromisos, recursos y datos disponibles, ¿qué plan permite cumplir más prioridades, qué se rompe si algo falla y qué cambio mínimo lo haría viable?»**

El entregable es software ejecutable, contrastado y con consumidor de producto. Primero acuerda los contratos y la reserva. Después implementa, verifica y acompaña la integración. Una explicación convincente sin motor ni oráculo no completa la misión.

## Punto de partida y propiedad

Lee AGENTS.md, COORDINACION.md, contexto y tablón actuales. El equipo ya construyó contratos de compromisos, adaptadores, simulación de dos alternativas, decisiones con revisión, cronología, Jornada e intenciones duraderas. Inspecciona `shared/commitments.ts`, `shared/commitment-simulation.ts` y los traspasos aceptados. Reutilízalos: este motor no crea otro CRM, otra cola o un segundo sistema de guardado.

El10/11 hay correcciones pendientes de SourceStatusRow312, RadarEntry315 y API316 por319. No des por aceptadas versiones trabajando ni modifiques sus rutas. El registro de estado puede cambiar mientras trabajas: relee antes de cada claim.

Eres autor del núcleo que se te reserve. No tienes propiedad general del checkout. Claude A conserva su experiencia operativa y Claude B sus fuentes; Codex conserva persistencia central, contratos comunes y montaje. Si eres una de esas sesiones, termina/presenta su corrección vigente antes de asumir un paquete incompatible. Esta propuesta no inicia un quinto agente ni libera reservas previas.

## La demostración que debe existir

Usa una empresa ficticia con12 instalaciones,3 técnicos,2 almacenes,20 pedidos y8 tickets. Estos números son el objetivo de una fixture nueva, no datos que hoy existan en la App. Incluye dependencias explícitas, ventanas de trabajo, habilidades, desplazamientos estimados, disponibilidad de material y compromisos de atención. Todo dato declarado o estimado conserva su procedencia.

Una instalación debe terminar el viernes. Depende de material retenido y comparte un técnico con otra urgente. Hay un ticket que impide darla por resuelta. La persona abre el compromiso y pulsa una acción secundaria «Ensayar mi semana».

Debe poder:

1. Ver por qué el plan actual no cabe y qué evidencia sostiene ese diagnóstico.
2. Ensayar retraso de material, baja de un técnico, caída de una fuente y prioridad nueva de un cliente.
3. Comparar reasignar recursos, dividir una entrega, usar un material alternativo declarado disponible o renegociar una fecha.
4. Ver qué compromisos mejora cada opción y cuáles empeora. Ninguna mejora es gratuita si consume capacidad de otro trabajo.
5. Encontrar el dato faltante que más cambia la viabilidad entre las alternativas consideradas.
6. Elegir un siguiente paso concreto, confirmarlo sobre una revisión vigente y encontrarlo después de reiniciar.
7. Reabrir el incidente y distinguir simulación, decisión y resultado realmente observado.

Simular no escribe en proveedores. El primer corte convierte una alternativa en una decisión local concreta mediante contratos existentes. Un lote de acciones exige otro contrato explícito; no presupongas transacción atómica de varios compromisos.

## Núcleo1 · Modelo operativo y fronteras del conocimiento

Define un contrato versionado para recursos, capacidad, trabajos, dependencias, ventanas, restricciones y eventos. Cada objeto debe referenciar el compromiso y sus fuentes mediante identidades completas. Dos IDs iguales de cuentas/proveedores distintos nunca se fusionan. Un vínculo candidato no crea una dependencia confirmada.

Separa cuatro elementos: hecho observado, declaración humana, supuesto de simulación y conclusión calculada. Un dato desconocido conserva ese estado. Duración ausente no vale cero; recurso sin horario conocido no equivale a disponibilidad ilimitada; una fuente parcial no acredita ausencia; evidencia antigua no se rejuvenece al guardar.

El modelo conserva una revisión exacta de entrada y un reloj explícito. Sus fechas y husos deben ser reproducibles. Una revisión nueva invalida la aprobación de un plan anterior y conserva lo que la persona estaba comparando como borrador histórico.

Acuerda este contrato con Codex antes de congelarlo. Si el modelo existente no contiene recursos o procedencia estructurada de alternativas, propón una extensión mínima y una unidad propia. No uses etiquetas editables como prueba estructurada.

## Núcleo2 · Motor de simulación reproducible

Implementa eventos discretos: llegada de material, inicio/final de trabajo, interrupción, reapertura y cambio de capacidad. El mismo conjunto de datos, reloj, reglas y semilla debe producir la misma secuencia. Define desempates y cancelación.

Permite bifurcar un estado observado en varias ramas. Comparar ramas no modifica el origen ni altera las fechas observadas. Rebobinar cambia la vista del ensayo, no borra hechos de producción. Una rama hipotética debe seguir identificándose como tal al exportarla y al reabrirla.

El motor propaga consecuencias a través de dependencias confirmadas, conservando la cadena que permite explicarlas. Trata ciclos, dependencias incumplibles y datos contradictorios mediante resultados explícitos. La incertidumbre no desaparece por avanzar el reloj.

Publica límites de trabajos/eventos/horizonte/memoria. Al agotarlos, devuelve exploración incompleta. El navegador debe poder cancelar y mantener sus controles. Evita una búsqueda que bloquee la interfaz durante minutos.

## Núcleo3 · Buscar respuestas, no solo representar retrasos

Construye un planificador bajo restricciones. Capacidad, precedencia, horario, habilidades y material deben condicionar sus soluciones. Expón objetivos y prioridades elegidos por la persona. No asignes importancias comerciales por intuición del modelo.

Busca un conjunto pequeño de alternativas no dominadas: por ejemplo, una conserva más fechas, otra consume menos capacidad extraordinaria y otra depende de menos supuestos. Explica el intercambio. Si hay un coste, es un dato o estimación declarado, no un ahorro demostrado por simular.

En problemas pequeños compara el resultado con enumeración exhaustiva independiente. En tamaños mayores informa qué espacio se exploró, cuándo se detuvo y si hay prueba de optimalidad. No llames «mejor plan posible» a la mejor solución encontrada dentro de un presupuesto sin demostrarlo.

Cuando no exista solución dentro de las restricciones, devuelve un conjunto de conflictos que permita a la persona entender la incompatibilidad. Si lo llamas mínimo, verifica la minimalidad dentro del modelo acotado; de lo contrario llámalo conjunto explicativo. Ofrece relajaciones concretas: cambiar una fecha, añadir capacidad o confirmar un material. Nunca presupongas que esos cambios están autorizados o disponibles.

## Núcleo4 · Pruebas de resistencia y contraejemplos

Construye un generador de escenarios sintéticos con semillas fijas. Introduce retrasos, pérdida de capacidad, fuente vieja/parcial, relaciones ambiguas y confirmaciones tardías. También debe producir casos sanos para comprobar falsos positivos. Mantén separado el generador del oráculo.

Propiedades a verificar dentro de un alcance publicado:

- Un técnico no ocupa dos trabajos incompatibles en la misma franja.
- Material aún no disponible no habilita una instalación.
- Un riesgo pendiente de evidencia no se transforma en «cumplido» por simulación.
- Una rama no modifica la evidencia o decisiones de otra.
- Añadir una restricción no debe habilitar por sí sola un plan antes imposible bajo las mismas reglas.
- Un replay de la decisión aceptada no crea un segundo efecto.
- Reiniciar conserva las decisiones persistidas y no ejecuta ensayos o acciones automáticamente.

Busca contraejemplos y redúcelos al caso más pequeño útil para depurar. Devuelve la secuencia reproducible que viola la propiedad. Si usas verificación formal o exploración de estados, identifica sus cotas y la relación entre ese modelo y el código real. Una comprobación acotada no es una demostración para cualquier empresa o tamaño.

No conviertas esto en una prueba de intrusión o un escáner de terceros. Son fallos operativos y de corrección sobre fixtures propias. Toda dependencia o herramienta adicional requiere su evaluación y reserva; el primer motor debe poder probarse sin cuentas de proveedores.

## Núcleo5 · Explicación que una persona pueda comprobar

Cada recomendación incluye causas, restricciones activas, referencias a evidencia, supuestos y datos que faltan. La explicación se deriva de la solución y su traza. No redactes primero una historia para justificar después un resultado diferente.

Añade una pregunta de producto especialmente valiosa: **«¿Qué tendría que cambiar para que esta opción funcionara?»** Responde con condiciones concretas. Otra pregunta es «¿Qué conviene comprobar antes de decidir?»: compara cómo cambian las alternativas bajo valores posibles declarados de los datos ausentes. No inventes probabilidades ni valor económico esperado sin distribución e hipótesis justificadas.

Ofrece una vista temporal accesible y una lista textual equivalente. Un gráfico vistoso no sustituye causas legibles. La interfaz de Claude A debe empezar por una decisión y sus consecuencias; el grafo completo será detalle secundario. Exportar debe conservar revisión, versión del motor y carácter hipotético del ensayo.

## Cómo se integra y cómo se reparte

1. Tú, con Fable: contrato acordado, motor puro, búsqueda, explicaciones, fixtures y oráculos en módulos nuevos reservados.
2. Claude A: experiencia «Ensayar mi semana», comparación y traslado de una opción a una decisión, una vez cerrada su entrada Radar y aceptado el núcleo.
3. Claude B: proyección de fuentes y cobertura, referencias y diagnóstico de información ausente, tras cerrar SourceStatusRow y el recorrido de Integraciones.
4. Codex coordinador: persistencia, rutas, autorización y montaje central. El otro Codex revisa de forma independiente el motor y sus contraejemplos.

Estos son roles propuestos. Confirma recepción y rutas en tablón antes de reclamar. Propuestas de nombres: `shared/operational-twin.ts`, `shared/operational-simulation.ts`, `shared/operational-planner.ts` y pruebas/fixtures propias. No son archivos ya reservados. No introduzcas directamente cambios en App, Store, main, LocalOperations, ficha o contratos comunes.

## Puertas de salida

**Primera entrega:** una simulación pequeña y un planificador contrastados con un oráculo exhaustivo; un caso inviable explicado y un caso sano sin falsas alertas. Contratos y límites aceptados independientemente.

**Segunda entrega:** fixture completa y ramas reproducibles; datos desconocidos/contradictorios tratados; contraejemplos minimizados y regresiones. Registro local de ensayo separado de evidencia observada, con su contrato aprobado.

**Tercera entrega:** entrada desde Hoy/Radar en App compilada, comparar dos planes, confirmar una decisión vigente, reiniciar en proceso nuevo y volver a encontrarla. Cero efectos de proveedor por simular, navegar o exportar. Pruebas de teclado, foco y1440/390/320, con capturas realmente inspeccionadas.

**Cuarta entrega:** un segundo caso de negocio, por ejemplo servicios/proyectos, usando el mismo núcleo sin bifurcarlo. Esto contrasta la generalidad del modelo; no acredita todavía demanda de mercado.

Una capacidad puede aceptarse como núcleo antes del montaje, pero la misión de producto no se cierra hasta la tercera puerta. Si la reserva central está ocupada, entrega el cambio mínimo al dueño y avanza un paquete independiente. No simules una integración con otro arnés ni te autoaceptes para saltar dependencias.

## Cómo debes trabajar

Confirma el modelo seleccionado a partir del cliente/CLI si esa evidencia está disponible; tu propia afirmación de identidad no basta. Comienza con esfuerzo high; aumenta únicamente si mejora una evaluación propia. No necesitas agotar consumo ni lanzar un número enorme de subagentes para completar la misión. Declara cualquier delegación y limita autores por archivo según el tablón.

Trabaja con persistencia hasta completar los paquetes autorizados: diagnostica errores ordinarios, conserva evidencia y continúa con trabajo independiente durante una revisión. Las reservas ajenas y las autorizaciones externas son límites deliberados que no se sortean. Mantén actualizaciones breves y un informe final que explique qué existe, qué se probó y qué falta montar.

No envíes nuevos archivos mediante la CLI controlada fuera del alcance autorizado, ni datos reales, credenciales o perfiles. El uso de un modelo nuevo no concede acceso a sistemas de clientes. La primera misión funciona enteramente con ficción de este equipo. No instales herramientas, publiques o cambies proveedores como consecuencia implícita del encargo.

El éxito se juzga por el recorrido verificable y por problemas que el motor resuelve, no por horas trabajadas, volumen de código, número de agentes o afirmaciones de inteligencia.
