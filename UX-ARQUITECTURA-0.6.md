# Plan B · Reestructuración UX dentro del cierre 0.6

27/10/2026, Europe/Madrid. Este trabajo es una etapa transversal de la fase existente 0.6; no crea otra fase funcional ni da por aceptadas 0.5/0.6 en nube.

## Estado y alcance real

0.4 tiene ciclo sintético verificado. 0.5 aporta identidad/aislamiento/cola/sincronización en código y ensayo local, con aceptación cloud pendiente. 0.6 aporta acciones revisadas y contexto comercial probado con proveedores controlados; OAuth y operaciones auténticas siguen pendientes. No corresponde activar autonomía 0.7. En esta ejecución se cierra arquitectura visual y se avanza la conciliación asistida de resultados comerciales inciertos mediante lecturas verificables, sin repetir escrituras.

La base técnica permanece React/TypeScript/Fastify, SQLite local y PostgreSQL para equipo. Generador y runtime conservan su separación, roles y reglas. No se contratan recursos ni se reutilizan otras conexiones. El checkout contiene trabajo anterior sin publicar y se conserva.

## Auditoría de la interfaz actual

Evidencia nueva en `ux-0.6.1/before/` dentro de las evidencias de esta conversación. Chrome aislado, 1440×1000 y 390×950, demo ficticia nueva 4331/4332. CUA no pudo inicializar sus recursos; se utiliza el flujo de pruebas local autorizado por el usuario. Las primeras capturas de Hoy/Agentes en carga se rechazaron y se sustituyeron por estados estables. No se deduce accesibilidad funcional de una imagen: teclado, foco, contraste y desbordamiento se validan por separado.

| Paso/pantalla | Propósito e información necesaria | Acción prioritaria | Agrupación y redundancia | Espacio/jerarquía observados | Decisión estructural |
| --- | --- | --- | --- | --- | --- |
| 1. Hoy | Elegir el siguiente seguimiento; oportunidades sin próxima acción y compromisos | Preparar/revisar seguimiento o abrir oportunidad | Motivo común repetido en cada fila; separar compromisos de seguimiento | Columna vacía de 430×734 px; filas con título, mismo motivo y enlace en tres alturas | Lista principal con criterio común, estado/contacto y acción en la misma fila. Compromisos vacíos pasan a franja; lateral solo cuando hay tareas |
| 2. Continuidad | Distinguir copia disponible, prueba válida y actualización | Trabajar o probar la copia exacta | Estado de copia y prueba aparecen alejados; captura, servicios y diagnóstico compiten | Dos columnas de ~539×450 px, recuadro de una frase y metadatos duplicados | Resumen de copia/prueba/cambios; verificación y actualización con proporciones distintas; historial compacto |
| 3. Trabajar | Buscar, editar y avanzar cuatro objetos | Buscar/editar un registro | Agrupar filtros/contadores junto a tabla; edición contextual | Filas de altura grande; tablero con espacio de tarjeta poco relacionado con contenido | Barra de herramientas común; tabla de densidad estable, tablero legible y panel lateral proporcionado |
| 4. Cambios | Revisar propuestas y modificaciones CRM sin confundir destinos | Revisar y aprobar el contenido exacto | Vacíos de propuestas/devolución/historial independientes | Caja ancha de 166 px y doble separador, botón de devolución deshabilitado sin cambios | Vacío con acción próxima; devolución progresiva cuando hay operaciones; propuestas como filas expandibles |
| 5. Agentes | Entender alcance y lanzar análisis revisable | Analizar seguimiento | Motor/coste/límites repartidos bajo una presentación grande | Bloque inicial de ~234 px para definición y botón; historial vacío separado | Módulo operativo con acción alineada, restricciones agrupadas e historial denso |
| 6. Integraciones | Distinguir capacidad, autorización y conexión | Abrir herramienta o configuración adecuada | Cinco descripciones idénticas de «espacio comercial» | Seis tarjetas con tamaños equivalentes para contenido desigual | Directorio de proveedores por filas: logo, alcance propio, estado y destino; aviso común único |
| 7. Copia de equipo | Vincular y revisar una réplica separada | Vincular/sincronizar | Origen, empresa y protección como grupo; estado separado del listado | Formulario y explicación abiertos sin región de tarea clara | Formulario de conexión acotado y resumen operativo; tabla posterior en ancho útil |
| 8. Preparación | Importar, revisar y activar con evidencia | Completar el paso actual | Mantener secuencia de cuatro pasos y reglas verificadas | Mucho peso de marco y texto introductorio | Paso actual con región principal y metadatos compactos; controles próximos al contenido |
| 9. Exportar | Conservar una copia verificable de la revisión actual | Exportar/confirmar custodia | Captura, revisión, custodia y formatos deben permanecer próximos | Marcos grandes para condiciones y exportación; avisos de igual apariencia | Resumen exacto de revisión, acciones por finalidad, avisos semánticos; no ocultar límites de recuperación |
| 10. Configuración IA | Elegir conexión y control de consumo | Guardar una configuración válida | Conexión, presupuesto y parámetros son grupos distintos | Modal alto; todos los campos tienen el mismo peso | Grupos visuales coherentes, presupuesto visible, campos y ayudas proporcionados; conservar toda validación |
| 11. Equipo/clientes | Ver empresa y editar bajo rol | Buscar/editar en empresa activa | Contexto empresa/rol debe preceder a datos; ensayo no es una alerta repetida | Selectores y aviso consumen gran cabecera antes del contenido | Barra contextual compacta, región de tarea compartida con app local y alcance explícito |
| 12. Equipo/comercial | Preparar, revisar y verificar acciones | Editar/aprobar/ejecutar versión revisada | Selección de cliente, contexto y propuesta deben estar próximos | Marca Google, pestañas, selector, explicación y vacío alejados | Selector y acción compactos; editor de mensaje y revisión contextual; evidencia por paso y conciliación próxima al error |
| 13. Equipo/personas | Preparar acceso y modificar rol | Conceder/revisar permiso | Datos de miembro y selector juntos | Formularios abiertos y filas espaciadas | Formulario de tarea acotado, lista de permisos alineada; no cambiar autorización |
| 14. Equipo/trabajos/dispositivos | Diagnosticar progreso, interrupción y vinculación | Revisar fallo o revocar dispositivo | Estado/resultado/acción por fila | Vacíos grandes o datos técnicos sin jerarquía | Estado semántico, descripción legible y acción próxima; no mostrar claves en capturas |
| 15. Navegación | Saber dónde se trabaja y encontrar destino | Cambiar sección/contexto | Diferenciar operación y configuración; la app local y el equipo son contextos distintos | Muchos destinos con peso idéntico; dos menús indujeron confusión real | Mismo sistema visual, grupos legibles y contexto explícito; conservar entradas y submenú sin añadir profundidad |

## Alternativas antes de elegir

Se comparan tres composiciones con el mismo contenido ficticio en `alternativas.html` y captura de comparación:

- **Lista operativa con contexto adaptable:** métricas secundarias, prioridades por filas, acción próxima; compromisos sin columna reservada cuando están vacíos.
- **Mesa con lateral persistente:** región de trabajo y lateral fijo para agenda/estado. Útil con mucha actividad, pero mantiene reserva cuando el contenido es escaso.
- **Módulos de distinta proporción:** bandas y paneles por finalidad. Mejora Continuidad, pero como patrón universal volvería a producir tarjetas repetidas.

Se selecciona la primera para Hoy/Trabajo/Cambios y la tercera únicamente donde hay decisiones operativas distintas, como Continuidad. El lateral se gana por contenido real, no por simetría. Se mantiene identidad azul y se incorporan capas neutras y una escala tipográfica profesional.

## Contrato visual y de densidad

Modo de uso: **operar**. Una sola familia tipográfica de interfaz; títulos de 24 px, secciones de 15–17 px, cuerpo de 13–14 px y metadatos de al menos 12 px. Controles de 36–40 px en escritorio y 42–44 px en móvil; la densidad no reduce el área de interacción. Escala de espacios 4/8/12/16/24/32, con separación mayor entre finalidades que entre elementos de la misma tarea.

Canvas matizado, superficie principal cálida clara, navegación gris azulada, tinta azul profunda y acción azul luminosa. Éxito/aviso/error tienen vocabulario propio y contraste suficiente. Bordes finos y elevación limitada a superficies que la necesitan; sin gradientes decorativos ni familias de tarjetas iguales.

Patrones comunes: cabecera de tarea, barra de acciones, resumen de estado, lista operativa, tabla y panel de revisión. Estados vacíos compactos con causa y siguiente acción, sin alturas mínimas decorativas. Las proporciones se adaptan a vacíos, contenido largo y permisos. En móvil se reordenan regiones manteniendo DOM/foco y lectura. No se añade navegación principal ni se promete una conexión que no esté configurada.

## Secuencia de ejecución y aceptación

1. Auditoría con capturas estables y matriz anterior.
2. Comparación de composiciones y sistema de diseño documentado.
3. Implementación en componentes reales y avance de conciliación asistida de 0.6.
4. Revisión visual conjunta de escritorio/móvil y corrección acotada.
5. Pruebas de lógica/API, recorridos funcionales, teclado, estados, contraste y desbordamiento. Registrar qué se comprueba y qué sigue dependiendo de cuentas externas.

La evidencia local no cierra OAuth real, Cloud SQL, webhook/actividad completa, Google Picker ni el piloto humano. La autonomía 0.7 conserva su puerta de aceptación.


## Implementación y resultado comprobado · cierre 27/10/2026

Aplicadas las instrucciones de `compliance-autopilot-execution-core` para continuidad, alcance/evidencias y prioridad funcional; `impeccable` (shape/layout/operate/craft) para comparar composición antes de estilo, reglas de densidad y una ronda visual de corrección; Product Design audit para capturas estables; frontend-testing-debugging para validar estados reales, consola y recorridos. El script de contexto de Impeccable se ejecutó una vez; el detector mecánico de layout final devuelve una lista vacía, lo cual no sustituye inspección visual. GPT-6.1 Terra realizó una revisión visual independiente de solo lectura e identificó el recorte de Clave API y la contradicción de carga en Clientes; ambos corregidos.

Se implementan `WorkspaceUI` (métricas, cabecera, vacío y estado), `CommercialEditor` (contenido + revisión contextual), tokens y patrones de `design-system.css`. Hoy reserva lateral solo para compromisos reales. Continuidad agrupa comprobación e historial; detalles de mantenimiento secundarios se pliegan, y los errores operativos abren su sección automáticamente. Cambios pliega la devolución vacía. Integraciones presenta directorio con capacidades concretas y enlaces directos. Preparación/exportación/configuración/equipo comparten jerarquía, contraste y controles. Los contextos local/equipo se identifican y la demo permite volver a la app local. No se fusionan bases ni permisos.

Correcciones funcionales adicionales: indicador de carga/errores en datos, recarga al volver a seleccionar la misma sección, contador/paginación pendientes durante carga, grupos de configuración sin scroll interno que recorte campos y selección explícita de la propuesta recién preparada. El E2E esperaba un borrador antiguo durante la petición: se sincroniza con la confirmación de preparación antes de editar y mantiene todas sus aserciones de revisión/ejecución.

Mediciones a 1440×1000 sobre los mismos datos ficticios:

| Observación | Antes | Después |
| --- | --- | --- |
| Compromisos sin tareas en Hoy | Columna 430×734 px | Franja 1164×38 px, sin lateral vacío |
| Lista de prioridades, cinco filas | Región 644×734 px | Región 1164×530 px, criterio común y acción próxima |
| Continuidad | Documento de 1149 px, historial debajo de dos bloques iguales | Documento de 1000 px, comprobación e historial juntos y mantenimiento proporcional |
| Integraciones | Seis tarjetas con descripción reiterada | Seis filas con capacidad específica, logo, estado y acceso |

Validación: compilación/TypeScript correctos; **151/151** pruebas de lógica/API (incluye **15** comerciales), **16/16** recorridos Chrome, **1,2 min**. Ensayo visual final: **19 PNG** de vistas principales y formularios, más capturas de E2E con compromisos, revisión y estado incierto. Equipo comprobado en 1024/390/320 y recorridos locales en esos tamaños, sin desbordamiento de página; las tablas conservan scroll interno. Sin errores de consola ni solicitudes externas en la auditoría visual. Foco/Tab/Escape, roles, formularios, edición, revisión, exportación/cifrado/restauración y sincronización tienen recorridos funcionales. Los tokens principales de texto tienen ratio mínimo calculado **5,20:1** frente a las cuatro superficies; borde de control **3,23:1**. No es una certificación global de accesibilidad ni prueba con lector de pantalla.

Evidencia: `C:/Users/iresh/.codex/visualizations/2026/10/26/01a179cf-4d25-75a0-9cab-061933f2b4d8/ux-0.6.1/`: `before/`, `after/`, `alternativas.png`, `token-contrast.json`, `layout-scan-after.json`, `unit-tests.log`, `build.log` y `verified/` con informe y capturas E2E. Las dos primeras pasadas E2E fallidas se conservan como diagnóstico; el resultado vigente es `e2e-verified.log`.

La revisión de esta etapa está implementada y verificada en ensayo local. La demo nueva escucha en 4331/4332, sin credenciales externas y con datos propios. La apertura en Codex devuelve `queued`; CUA continúa sin inicializar sus recursos y no se afirma inspección visual del navegador integrado. El renderizado se verificó con Chrome aislado. Fuente sigue siendo 0.6.0, sin ZIP nuevo, commit/push ni despliegue. Siguiente paso: aceptar nube/identidad y cuentas OAuth de ensayo cuando existan proyecto/configuración autorizados; continuar Picker y profundidad/eventos HubSpot según la hoja de ruta. Autonomía 0.7 permanece pendiente.
