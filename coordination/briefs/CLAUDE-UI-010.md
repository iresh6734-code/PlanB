# CLAUDE-UI-010 · Mesa de trabajo comercial de Plan B

Eres Sonnet 5.5 y trabajas como desarrollador de interfaz junto a Codex. El usuario pide una entrega grande, útil y con implementación real. Construye el prototipo funcional completo descrito aquí. Codex revisa el backend y tus entregas en paralelo.

## Resultado esperado

Una interfaz de CRM profesional para escoger el trabajo del día, consultar contexto guardado, preparar un seguimiento y revisar sus efectos. Debe resultar clara con pocos datos y con cientos de elementos; prioriza la tarea comercial sobre paneles decorativos. Entrega HTML, CSS y JavaScript utilizables en navegador, más contratos de componentes que permitan portarlo gradualmente a React. No entregues solo un análisis ni una imagen.

## Archivos exclusivos ya reservados

- design/claude/workspace-v2/index.html
- design/claude/workspace-v2/styles.css
- design/claude/workspace-v2/app.js
- design/claude/workspace-v2/README.md
- design/claude/workspace-v2/components.md
- coordination/reports/CLAUDE-UI-010.md

La reserva CLAUDE-UI-010 ya está hecha. No reclames otras tareas ni edites el tablón. Codex gestionará submit y aceptación. Puedes leer este brief y tus seis archivos; no necesitas leer fuentes o documentos privados existentes. No leas otros archivos del repositorio, secretos, configuraciones, clientes o sesiones. No uses agentes secundarios, red, MCP, cuentas, instalaciones, git o cambios de permisos. No cambies la app, sus CSS globales, package.json, lockfile, AGENTS.md o CONTEXTO-PROYECTO.md. No uses CDNs, fuentes remotas o imágenes externas. Si falta una capacidad, registra el límite y sigue con lo independiente.

## Dirección visual

Producto español, escritorio primero y móvil plenamente útil. Identidad azul sobria con base cálida casi blanca, texto azul oscuro y grises neutros. Tipografía de sistema, cuerpo 14–15 px, títulos breves de 20–28 px; evita una landing comercial o un dashboard de métricas. Usa filas, listas y separadores, con superficies suaves solo donde aclaren agrupación. Contenido principal ancho, con jerarquía evidente y pocos contenedores anidados. Nada de gradientes, glassmorphism, fondos brillantes, grandes tarjetas KPI, héroes, insignias repetidas, avatares de relleno o ilustraciones decorativas.

Define tokens CSS para color, espacio, altura de control, bordes, radio y foco. Entre 44–52 px por fila operativa; los textos largos pueden expandirse sin truncar la única información relevante. Usa SVG inline sencillos cuando haga falta un icono y acompáñalos de nombre accesible. Botones de icono con título, aria-label y objetivo táctil de al menos 44 px. Movimiento breve y opcional, con prefers-reduced-motion.

## Navegación y contexto

Cabecera con nombre de espacio, etiqueta de origen y fecha de captura disponible, y navegación Hoy, Comercial e Integraciones. Cambiar vista conserva selección de cliente dentro del mismo contexto. Cambiar espacio limpia selección, borrador y revisión, con aviso local si había cambios sin guardar. La URL puede guardar solo la vista, nunca datos personales o contenido del borrador. No uses localStorage, cookies o persistencia de contenido: todo vive en memoria del prototipo.

Muestra siempre “Prototipo de interfaz · sin conexión a servicios”. La vista inicial es un vacío honesto con explicación y acción para abrir la mesa de preparación. No inventes clientes, ingresos, métricas, actividad, portales, conexiones o resultados. Para demostrar densidad, incluye un control explícito “Ver casos de interfaz” que active exclusivamente escenarios identificados como muestras, con rótulos “Contacto de muestra 01”, “Empresa de muestra” y correos example.invalid. Esos elementos pertenecen solo a este prototipo separado, nunca se insertan en Plan B. Ofrece volver al vacío en un clic.

## Vista Hoy

Lista de próximos trabajos con motivo, origen, fecha disponible y acción concreta. El estado vacío explica qué información falta y cómo llegar a Comercial. En el modo de casos, mostrar una tarea vencida, una sin correo, una de solo lectura y una sin oportunidad; no inventar una clasificación de urgencia sin datos. Cada fila abre contexto o preparación; la acción deshabilitada explica su causa cerca del control. Un filtro “Todas / Requieren revisión / Sin próxima acción” y búsqueda local deben funcionar. Evita que filtrar sin resultados parezca ausencia total de datos.

## Vista Comercial: la pieza principal

Escritorio con cola de clientes a la izquierda y mesa de trabajo amplia a la derecha. La búsqueda contempla nombre, empresa y correo, con lista nativa accesible o patrón de combobox correcto si implementas todos los comportamientos de teclado. Un solo estado de cliente elegido se comparte entre Seguimientos y Archivos. No crear dos selecciones desconectadas.

La mesa contiene contexto breve de captura, oportunidades y próxima acción; editor de destinatario, asunto y mensaje; vista previa; y panel de revisión de efectos. La procedencia y fecha nunca se confunden con una consulta actual. No muestres IDs crudos como nombre. Si no hay nombre, usa la etiqueta “Destinatario del borrador” y el correo editable de ese borrador, sin afirmar identidad CRM.

El editor comienza con acciones externas apagadas. Un botón “Guardar borrador local” guarda solo el estado en memoria del prototipo. Editar después de guardar marca cambios pendientes e invalida la revisión. La casilla “He revisado…” y “Marcar revisión local” requieren contenido válido y guardado; cambiar destinatario, texto o acciones obliga a revisar de nuevo. El resultado dice “Revisión local completada; no se ha enviado nada”. No simules éxito de Gmail o creación de archivos.

Presenta las capacidades “Correo”, “Reunión”, “Documento” e “Informe” como controles de demostración deshabilitados por ausencia de conexión, con motivo accesible. Junto al resumen, explica destinatario, alcance y efectos que requeriría una integración futura. Ningún botón se llama “Enviar” si no puede enviar. Puedes permitir explorar los campos de reunión o documento mediante una acción distinta “Ver campos” que no active un efecto externo.

En Archivos, incluye lista vacía, búsqueda sin coincidencias y estados “sin autorización”, “cargando” y “error”. Los controles de añadir/abrir documentos remotos permanecen deshabilitados. El cliente seleccionado sigue siendo el mismo al volver a Seguimientos.

## Ficha lateral

Desde cliente o tarea abre un panel lateral semántico con título, procedencia, campos disponibles, oportunidades, actividad conservada y acciones internas. En móvil ocupa el ancho y permite cerrar claramente. Escape cierra, Tab no escapa del panel modal, se devuelve foco al disparador y el fondo no recibe interacción. No reconstruyas el foco usando índices que cambian al filtrar.

Explica las causas de “Preparar seguimiento” deshabilitado: operación en curso, acceso de lectura, origen no activo y ausencia de correo. La actividad incluye tareas CRM y acciones internas, distinguiendo su origen y las fechas de vencimiento. Una acción interna solo afecta memoria de este prototipo; no sugiere escritura HubSpot. Crear o completar una acción actualiza la interfaz sin duplicados por doble clic.

## Integraciones

Lista por proveedor/capacidad, sin mosaico de logos. Diferencia “Sin configurar”, “Configurada”, “Autorizada” y “Operación verificada”, con explicación y fecha solo cuando existe evidencia. En el prototipo, el estado real es sin conexión. El selector de escenarios puede mostrar tarjetas de ejemplo explícitamente rotuladas; nunca convertirlas en conexiones reales. No botón de autorización que abra un tercero. Añade explicación de reconexión necesaria y acceso de lectura frente a edición.

## Estados, teclado y adaptación

Un control de escenarios de revisión permite activar vacío, carga, error, solo lectura, origen desactualizado y datos de muestra. Debe ser visible como herramienta del prototipo, no como ajuste de una app conectada. Error no borra selección válida ni muestra un borrador de otro contexto. Carga tiene texto, aria-busy y no depende de spinner. Éxitos locales se anuncian con role=status; fallos con role=alert sin repetir anuncios por cada pulsación.

Prueba en diseño 1440, 1024, 768, 390 y 320 px. A menos de 900 px, la cola pasa a selección compacta; el editor y contexto se apilan. El panel de revisión queda junto al contenido que revisa, sin tapar teclado, botones o mensajes. No hay scroll horizontal global ni texto esencial recortado. Las tablas pueden tener su propio contenedor desplazable. El orden de Tab sigue la jerarquía visual y no hay atajos de letra única que secuestren la escritura.

## Implementación y comprobación

HTML semántico con lang=es, viewport, título, enlace de salto y landmarks. CSS aislado por prefijo pbw- y tokens bajo una raíz propia; no selectores globales invasivos. app.js sin bibliotecas ni eval, innerHTML de contenido de usuario, peticiones HTTP o almacenamiento. Renderiza el contenido introducido mediante textContent/DOM seguro. No URLs externas clicables ni enlaces inventados. Desacopla estado y representación, y concentra las transiciones de selección, borrador, revisión y panel en funciones comprobables.

Puedes comprobar sintaxis con `node --check design/claude/workspace-v2/app.js`. Si no hay herramientas de navegador disponibles, no afirmes QA visual, contraste medido o navegación de teclado probada: documenta la lista para que Codex lo haga. No instales dependencias para comprobarlo ni levantes procesos sin necesidad. Devuelve una implementación completa sin TODO, botones decorativos sin respuesta o contenido lorem ipsum.

## Documentación para integrar

README: abrir el prototipo, modelo de escenarios, flujos implementados, límites y comprobaciones realizadas. components.md: componentes React propuestos, props mínimas, ownership de selección/borrador/revisión, eventos y adaptación móvil; no inventar endpoints. Plan de integración en tres entregas pequeñas: selector compartido, mesa/editor y ficha/estados, cada una con aceptación y riesgos. Informe final con archivos, decisiones, resultados reales y límites; no autoaceptes. Codex revisará y decidirá qué se integra en la app.

Empieza implementando la interfaz completa en los seis archivos reservados. No detengas el trabajo tras proponer un plan.
