# Mega prompt · Cerrar pendientes y hacer visibles las operaciones de Plan B

Trabaja en D:/AI/Plan-B-CRM-v2.1/source. El usuario pide una app potente, ordenada y utilizable, con entregas comprobables y dos sesiones que no se pisen. Una sesión, sin subagentes, commit/push, despliegue, instalación de dependencias o autoaceptación. No activar proveedores, MCP, acciones externas o autonomía de IA.

Lee AGENTS.md, COORDINACION.md, CONTEXTO-PROYECTO.md y coordination/plans/CIERRE-Y-SIGUIENTE-047.md. Consulta `node tools/coordination/board.mjs list`. El inventario dice expresamente que no está todo cerrado: no marques pendientes como resueltos para poder empezar otra cosa.

## 0 · Identifica tu sesión y conserva sus reservas

- **UX038 iteración5 ya fue aceptada por Codex** tras cotejar20 hashes, compilar y pasar18 recorridos propios. No seguir editando bajo esa unidad cerrada. Si el tablón muestra una unidad posterior working de tu sesión, termina solo su alcance; review significa esperar dictamen. La aprobación de iteración5 no cubre cambios posteriores ni acredita despliegue.
- **UX032 R2 ya aceptada por Codex el30/10 a09:51 Europe/Madrid:** prueba nº13 corregida,73/73 propias y sensibilidad12/13 con defecto solo temporal. No seguir editando bajo UX032 cerrada. La reserva se liberó por aceptación; no hace falta otro traspaso. Dos sesiones llamadas claude siguen sin ser el mismo dueño por defecto para otras tareas.
- Si eres la sesión revisora de **QA045**, esa entrega ya fue contrastada y aceptada. No sigas editando su test o informe bajo el encargo cerrado; los hashes anteriores siguen siendo historia.
- **No tocar REL033**: sus herramientas y pruebas siguen reservadas por Codex. No tomar App/TeamApp o memoria/panel para «poner todo al día».
- UX034 de ficha es otra unidad de cinco archivos. No iniciarla mientras UX038 reserve customer-dossier.css. Si se ejecuta después, no ampliar al Modal o archivos de otra unidad por inferencia.

Dos sesiones pueden hacer tareas disjuntas; ambas no deben iniciar OPS048. Solo quien gane/reserve legítimamente el claim escribe esos seis archivos. Una dependencia pendiente o una colisión no se evade editando board.json o usando el actor codex.

## 1 · Puerta para la siguiente entrega

El siguiente encargo es **CLAUDE-OPS-048**, registrado por Codex. **Sus cuatro dependencias UX032/UX038/OPS039/DIFF040 ya están done** en el corte del30/10 a09:51 Europe/Madrid; los seis archivos estaban libres. OPS048 está ready y Codex no la ha reservado: una sola sesión Claude puede hacer claim ahora. Comprueba de nuevo el tablón; si otra sesión ya la reservó o aparece un conflicto, no fuerces el acceso ni sustituyas su fuente. No escribir código compartido antes de reservar.

```powershell
node tools/coordination/board.mjs brief CLAUDE-OPS-048
node tools/coordination/board.mjs claim CLAUDE-OPS-048 claude
```

Antes de cada edición usa check-path con el archivo exacto. Tus únicos archivos compartidos de escritura son:

1. src/ContinuityHome.tsx
2. src/ContinuityOperations.tsx
3. src/continuity-operations.css
4. tests/continuity-operations.test.ts
5. tests/e2e/continuity-operations.spec.ts
6. coordination/reports/CLAUDE-OPS-048.md

Lectura: src/api.ts, TabList.tsx, WorkspaceUI.tsx, LoadError.tsx, planb-ui.css; shared/response-queue.ts, capture-comparison.ts, operations.ts; server/response-queue.ts y capture-comparison.ts. Esos archivos NO son de escritura. No cambies package, lockfile, backend, contratos, estilos globales, App/TeamApp, otras pruebas, contexto, panel o fuentes presentadas. Si hace falta otro archivo, registra la causa y espera un alcance nuevo.

## 2 · Resultado de producto

Desde **Continuidad del CRM completo**, el operador puede responder:

«¿Qué tareas debo atender durante las próximas horas?» y «¿Qué cambió entre estas dos copias?».

Integra un bloque secundario, claro y compacto, con esos dos recorridos. Conserva la cabecera, preparación, simulacro, copia/recuperación, historial y acciones existentes. No añadir otra sidebar ni aparentar que el piloto de equipo tiene las mismas bases/API. No reemplazar un módulo completo por una tabla de consulta.

Reutiliza tokens y componentes actuales. CSS limitado a `.continuity-operations` y sus descendientes, sin redefinir :root, body, botones/tablas globales o estilos de la ficha/selector. Sigue el sistema visual aceptado; no emprendas otro rediseño. Usa las skills de frontend aplicables y react-best-practices. No fuentes remotas, nuevos iconos externos o dependencias.

## 3 · Radar: qué atender ahora

Consume **GET /api/v2/continuity/response-queue?horizonHours=…&limit=…**. Con `api()` de src/api.ts el path lleva `/v2/...`, pues el wrapper añade `/api`.

- Horizonte configurable y explícito (por ejemplo8/24/72h dentro de1–720). La hora de evaluación viene del servidor, no del reloj del navegador enviado por query.
- Mostrar captura/portal de procedencia, revisión y hora de cálculo; recuentos completos y límite de filas visibles. No transformar null en cero o extrapolar el total del portal.
- Vencidas, dentro del horizonte, por revisar y posteriores; motivo y siguiente paso de cada tarea. Mostrar asociaciones disponibles/ausentes sin tratarlas como dependencias o bloqueo inferidos.
- Fechas civiles sin hora conservan ese carácter; datetime con offset se muestra como instante local legible. Explicar la incertidumbre del horizonte para fechas sin hora.
- Si la copia no está activa o faltan datos, orientar al paso existente sin fingir resultado. Estado desconocido sigue visible. No mostrar una estimación de dinero perdido o una puntuación opaca.
- Acciones de esta unidad son de consulta. No marcar completada, editar, preparar correos o ejecutar agentes. No construir un enlace al piloto suponiendo que comparte los IDs.

## 4 · Comparador: qué cambió entre copias

Usa los IDs exactos del historial disponible en ContinuityStatus; no inventes identidades concatenando fechas visuales. Consume **GET /api/v2/captures/compare?from=…&to=…&offset=…&limit=…** con encodeURIComponent.

- Etiquetas «Primera captura» / «Segunda captura», fechas y procedencia claras. Con menos de dos opciones, estado vacío útil. No elegir una captura recién llegada sobre una selección explícita del usuario.
- Registros añadidos, ausentes, modificados y sin cambios por entidad. «Ausente en la segunda captura» no es «borrado en HubSpot».
- Antes/después con tipos preservados: propiedad ausente, null, vacío, booleano y número no se muestran todos como un guion. No comparar vistas previas en el cliente para decidir si cambió algo.
- Mostrar avisos de valor recortado/campos omitidos y los totales reales. El servidor ya limita previews; no presentar esas cadenas como una propuesta ejecutable de devolución.
- Cambios de esquema/configuración y relaciones en grupos separados. Respetar sus propias marcas de muestra truncada y multiplicidad.
- Páginas de registros coherentes con offset/limit y totalDifferences. Al cambiar cualquiera de las capturas, volver al inicio y retirar el resultado viejo. No invertir automáticamente el orden elegido: chronological:false es una comparación inversa válida.
- Captura no encontrada404, incompatibilidad409 y validación422 dan mensajes claros. No corregir metadatos ni cambiar de portal para evitar el error. Cero POST/PATCH/DELETE de esta UI.

## 5 · Concurrencia, errores y permisos

- Cada consulta debe tener cancelación o número de petición para descartar resultados antiguos. Cambiar horizonte, par de capturas, fuente, cerrar el bloque o desmontar no debe dejar entrar una respuesta vieja.
- No disparar nuevas consultas porque el padre repinta cada2500ms; depende de claves estables y acciones explícitas, con una carga inicial acotada. No añadir sondeo paralelo.
- La respuesta del radar incluye la identidad de la captura activa. Si difiere de la fuente esperada, no mezclar filas: retirar resultado y proponer actualizar el contexto mediante refresh existente.
- Estado carga, vacío, error recuperable y reintento real. Reintentar consulta no ejecuta operaciones. 401 debe conservar el comportamiento de bloqueo del wrapper existente; no ocultarlo con una pantalla de éxito.
- El servidor instalado puede ser anterior y devolver404 para la ruta nueva: explicar que requiere actualizar Plan B. No generar un radar ficticio o esconder el error. Verificar este caso en E2E.
- La activación de botones es real, no solo aria-disabled. No añadir escritura o alterar roles. Evitar texto/status duplicado que rompa los mensajes existentes de la página.
- Teclado, foco visible, controles etiquetados y tablas/listas con desbordamiento contenido a1440/390/320. No afirmar foco por un arnés de hooks: comprobar DOM real.

## 6 · Pruebas de aceptación causales

Escribe pruebas nuevas sobre comportamiento, no capturas de implementación:

1. Radar usa API y fuente reales del fixture; horizonte y recuentos se actualizan. Nulos y estado desconocido permanecen explícitos.
2. Dos respuestas diferidas en orden inverso no reponen datos viejos, tampoco tras cambiar la captura o desmontar.
3. Comparar dos capturas sintéticas produce datos/esquema/relaciones correctos y una vista previa recortada lo indica; ausente/null/vacío distintos.
4. Selecciones y paginación no mezclan pares; error409/404/422 y reintento no sustituyen la selección por otra.
5. Prueba de servidor anterior404 y bloqueo401 sin éxito falso ni filtración bajo la puerta de desbloqueo.
6. Navegador: recorrer desde Continuidad ambos paneles, teclado, escritorio/móvil, consola sin errores, sin overflow de página y sin red externa. Contabilizar métodos: ninguna operación de escritura procede de este bloque.
7. Comprobar que menús, historial, simulacro y recuperación existentes siguen accesibles. No tocar sus aserciones para dar por buena una regresión.

Fixtures nuevos y build aislado en tests/.tmp/claude-ops048. Nunca npm run build ni bases/servicios4331/4334. Un trabajador y un navegador; coordinar la ventana con la otra sesión. No repetir todo npm test por rutina; typecheck, pruebas nuevas y focales relevantes. Al presentar, incluir snapshots/puertos usados y comprobar que los hashes aún coinciden con las fuentes probadas.

## 7 · Entrega revisable

Informe con problema, comportamiento resultante, archivos exactos, decisiones de fuente/concurrencia, comandos y resultados propios, capturas, hashes y límites. Distinguir backend existente, nueva UI, build aislado y piloto instalado. No declarar toda la fase completa o la app desplegada por una prueba verde.

```powershell
node tools/coordination/board.mjs submit CLAUDE-OPS-048 claude --note "UI real de radar/comparador, pruebas, hashes y límites; sin despliegue"
```

Tras presentar, dejar de editar. Codex revisa y acepta la versión concreta; no usar el actor codex para aprobarla. No encadenar tareas nuevas ilimitadas. Las integraciones reales, laboratorio con evidencias persistidas y verificador de archivos en pantalla requieren unidades posteriores: no añadirlas aquí a mitad de entrega.
