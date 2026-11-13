# QA052 · Auditoría adversa de recuperación, cobertura y candidata portátil

Trabaja en D:/AI/Plan-B-CRM-v2.1/source. El usuario pide un encargo difícil, extenso y útil. Tu misión es intentar refutar, con pruebas independientes y ejemplos mínimos, las garantías de tres entregas de Codex: BACKUP041, SAFE049 y REL046. No basta ejecutar sus suites o redactar recomendaciones. Debes construir un banco adverso reproducible y entregar un dictamen técnico por unidad.

Una sesión, sin subagentes ni delegación. Codex continúa RESTORE050 en paralelo: no leas su trabajo inacabado como si fuera una entrega ni tomes sus archivos. No se requiere ningún proveedor, cuenta, navegador personal o instalación del usuario.

## 0. Comienza por el estado real

Lee AGENTS.md, COORDINACION.md, CONTEXTO-PROYECTO.md, este brief y los informes CODEX-BACKUP-041, CODEX-SAFE-049 y CODEX-REL-046. Consulta el tablón.

QA052 depende de aceptar OPS048. Si ya está done, no vuelvas a editarla; si sigue review/working, espera el dictamen y no fuerces claim. No confundas un informe anterior con el estado actual. Codex está contrastando R2; este archivo no la acepta por sí mismo.

```powershell
node tools/coordination/board.mjs brief CLAUDE-QA-052
node tools/coordination/board.mjs claim CLAUDE-QA-052 claude
```

Antes de cada edición, check-path. Tus cuatro archivos compartidos exactos son:

1. tests/independent-recovery-integrity.test.ts
2. tests/independent-backup-coverage.test.ts
3. tests/release-candidate-adversarial.test.mjs
4. coordination/reviews/CLAUDE-QA-052.md

No edites fuentes revisadas, sus pruebas existentes, package/lockfile, contratos, memoria, panel o informes de Codex. No usar actor codex, aceptar entregas, liberar reservas o editar board.json. Si necesitas una corrección del producto, entrega el repro y deja la fuente a su dueño. Si necesitas otro archivo compartido, plantea el alcance antes de escribirlo; scratch temporal propio dentro de tests/.tmp/qa052 sí está permitido.

## 1. Congela la evidencia y separa las tres garantías

Registra SHA-256 inicial de módulos, CLI y dependencias leídas. Copia a un snapshot propio las fuentes que vas a ejecutar. Mantén la resolución de dependencias local, sin instalar versiones. No escribas sobre node_modules. Si la fuente cambia durante la prueba, conserva el resultado con el hash realmente probado y vuelve a cotejar; no aprobar la versión posterior por semejanza.

Las preguntas son distintas:

- BACKUP041: ¿este JSON portátil supera formato/descifrado y el contrato real de restauración, exclusivamente en memoria?
- SAFE049: ¿esta copia cubre la exportación de referencia aportada, o hay divergencias que no se pueden ordenar? La referencia no es un estado vivo acreditado.
- REL046: ¿el snapshot/compilación conserva entradas y artefactos, y distingue verificado de aceptado/instalado? No es un instalador.

Una igualdad de hashes no prueba custodia externa; una fecha no prueba precedencia; una restauración en memoria no prueba recuperación en otro equipo; una suite verde no prueba que la app instalada corresponda a esa fuente. Mantén estas distinciones en aserciones e informe.

## 2. Banco independiente de integridad portátil

Construye tus propios fixtures válidos con makeFixture/makeDemoSpec y Store(':memory:'). No copies los casos existentes cambiando nombres. Antes de corromper un fixture, demuestra que el original es válido; cuando esperes aceptación, valida también que no has provocado otro error previo que enmascare la propiedad estudiada.

Cubre familias relevantes y sus límites:

- JSON válido/ inválido, formatos heredados admitidos, contenedor cifrado, contraseña faltante/incorrecta, autenticación de ciphertext y alteración de salt/data/kdf.
- Canonicalidad y longitudes de envoltorio/base64. Diferencia rechazo previsto de una excepción no controlada. No guardar ciphertext o contraseñas en el informe.
- Datos activos coherentes frente a cambios sin historia; before/after que no corresponden a la captura; operaciones create/update inconsistentes; IDs de cambio duplicados o fuera de orden; registros omitidos/añadidos/duplicados y referencias rotas.
- Manifest de captura, límites de registros, reglas y generación no aprobada. Un bundle con JSON/schema válido puede seguir siendo irrestaurable.
- Marca producción: formato/cifrado requeridos y clase de destino; no usar datos de clientes o una cuenta real. Una fuente ficticia con metadatos de producción para un caso negativo sigue siendo un fixture del test.
- Watermark/mapping/plan de devolución: aprobación retirada al restaurar, envío en curso que se vuelve incierto, comprobación manual ligada a sesión/captura/watermark; historial total distinto de operaciones pendientes.
- Inspección repetida determinista, Store llamante intacto y ausencia de efectos de fichero/proveedor. No abrir una base real para demostrarlo.

No conviertas un caso no comprobado en TODO verde. Si el entorno impide reproducir una propiedad, declárala sin verificar y describe exactamente qué falta.

## 3. Pruebas generativas de cobertura con oráculo propio

Implementa un generador determinista pequeño, con semilla y número acotado de secuencias. Sin dependencia nueva ni aleatoriedad no reproducible. Para cada fallo imprime solo semilla/índice/categoría segura; conserva el ejemplo sintético mínimo en scratch. No vuelques bundle/valores completos.

Genera cadenas válidas de operaciones mediante Store, exporta en puntos intermedios y evalúa estas propiedades:

1. Reflexividad de revisión: una copia respecto a sí misma coincide. Encriptaciones distintas del mismo contenido no deben crear divergencia semántica.
2. Cambiar solo exportedAt u orden de claves de objetos no cambia bundleRevision. No extrapolar esta invariancia al orden de arrays.
3. Prefijo estricto: únicamente mismo contexto íntegro y misma captura permiten contar el sufijo de operaciones no cubiertas. El recuento se obtiene de tu secuencia, no del resultado bajo prueba.
4. Reversión A→B→A conserva historia adicional aunque los valores finales coincidan. Dos operaciones no equivalen a dos registros distintos.
5. Dirección inversa y bifurcación: no deben etiquetarse como un prefijo faltante ni fabricar missingLocalChanges. Dos ramas con el mismo número de entradas pueden ser distintas.
6. Igualdad de registros con distinto watermark, mapping, plan, sesión, generación o configuración no es igualdad de revisión.
7. Mismo identificador de captura con contenido alterado no concede cobertura; las comparaciones deben conservar el contexto necesario.
8. Límites de portal, tipo/clase/origen/entorno y captura deben impedir una afirmación de cobertura. No reemplazar identidad ausente por una identidad inventada.
9. Fechas de exportación invertidas, iguales o futuras no ordenan historia. Un archivo «más nuevo» puede omitir operaciones de otro.
10. Recuentos completos: la diferencia al final de un conjunto grande debe detectarse; no asumir que un límite de lista visual es límite de cálculo. Reserva un caso de10.000registros, sin generar decenas de archivos gigantes simultáneos.

Diseña el oráculo desde las operaciones que generaste y la especificación pública del contrato. No copies la función prefix/canonical de producción dentro de la expectativa y luego declares independencia. Usa propiedades distintas y casos concretos con resultado conocido.

## 4. CLI, límites, privacidad y efectos

Ejecuta ambas CLI reales en subprocesos con fixtures nuevos y red externa bloqueada. Distingue exit0/1/2 y salida de ayuda, JSON de resultado y errores de uso.

- Ayuda por defecto sin abrir archivos o esperar stdin. Repetición de flags, flags desconocidos, valores ausentes y contraseñas por argv rechazadas sin eco.
- Stdin correcto/malformado/límite; contraseñas diferentes para referencia/copia, no confundirlas. No obtener contraseñas del entorno ni guardar archivos de secretos.
- Rutas explícitas, archivo inexistente/directorio/enlace, fichero sobre el límite y lectura acotada. Si una prueba de symlink requiere permisos no disponibles, separa límite de entorno de defecto del producto y no cambies controles del equipo.
- Misma ruta, dos copias de los mismos bytes y dos cifrados del mismo contenido: distinguir identidad de entrada, identidad de bytes y revisión. Ninguna demuestra custodia fuera del equipo.
- Toma hashes de todos los ficheros de entrada y verifica que no se modifican ni se crean salidas inesperadas. No restaurar una instalación o inspeccionar carpetas del usuario.
- Canarios sintéticos en nombre, correo, ID, campo libre, valores before/after, origen y contraseña. Busca filtración en stdout/stderr/resultado; no publiques el canario de contraseña en el informe. Distingue metadatos permitidos de contenido personal.
- Errores del parser/cipher/OS no deben convertir rutas o valores en mensajes de éxito. Usa valores ficticios propios; nunca enumeres variables reales del proceso para buscar secretos.

## 5. Ataca el empaquetado de REL046

Revisa scripts/prepare-release-candidate.mjs sin modificarlo. Construye un workspace mecánico sintético en scratch cuando haga falta probar rutas/activos/tamaños. La herramienta copiada debe ser exactamente la fuente revisada; cualquier variación del arnés se documenta. El workspace mecánico no es una app Plan B validada y sus tests mínimos no son las pruebas de negocio.

Comprobar, cuando sea viable:

- Sin --prepare solo ayuda; argumentos no admitidos no crean una candidata. Cada ejecución genera carpeta nueva, sin sobreescritura o borrado de candidatos previos.
- Las raíces permitidas incluyen lo necesario y excluyen outputs, .tmp, build/dist, node_modules, dotfiles y carpetas de ejecución. Aserciones sobre nombres/bytes de fixture, no sobre datos reales.
- Activos públicos de distintas extensiones se copian byte a byte. Detectar recursos ausentes; no basta que index.html exista. Probar un logo/JSON/binario inocuo y que no se confunda fuente con salida anterior.
- Límites por fichero, total y número de entradas. No generar GB de datos o agotar disco para ejercitar una guarda; usa fixtures acotados y termina cuando el límite causal esté demostrado.
- Enlaces/junctions de entrada rechazados; no recorrer directorios externos a través de ellos. No apuntar un enlace de prueba a perfiles o instalaciones. Destinos únicamente sintéticos dentro del workspace propio.
- Cambios durante captura: error o marca honesta, nunca «fuente estable» falsa. Evita tests dependientes de suerte/velocidad: barreras deterministas de proceso o fixture reproducible, sin alterar producción.
- Mapa de reservas: working/review no equivale a fuente aceptada. Un build verde no activa approved/deployed/releaseEligible. No usar esta revisión para liberar archivos ajenos.
- Integridad de manifiesto y hashes de artefactos; fallo de typecheck/bundle/test preserva evidencia incompleta y exitcode, no una candidata aprobada.
- Sanitización de entorno con canarios inventados solo para el hijo. Nunca copies ni imprimas credenciales reales. No afirmes aislamiento hermético del SO por cargar block-external.

Como máximo una compilación real completa aislada en esta unidad, si añade evidencia que no existe; un solo trabajo pesado a la vez. No ejecutar npm run build de raíz. Una limitación que no pudiste ejercitar se informa, no se fabrica un mock que «prueba» la propiedad real.

## 6. Sensibilidad: demuestra que tus pruebas pueden fallar

Selecciona varias garantías críticas de familias distintas y aplica una mutación controlada solo a copias efímeras: por ejemplo ignorar estado de devolución, decidir cobertura por recuentos/fecha, omitir validación de restauración o aceptar activos faltantes. Debe cambiar el comportamiento que tu prueba pretende proteger.

Registra qué aserción falla, y demuestra que al volver a la fuente exacta pasa. Si una mutación provoca un error anterior ajeno a la propiedad, no la cuentes como sensibilidad de esa propiedad. No mutar código compartido ni desactivar guardas del sistema. No guardar ni enviar un parche para eludir controles.

No necesitas alcanzar una cifra artificial de tests. Sí necesitas cobertura suficiente de las familias y contraejemplos con causas claras. Muchas aserciones de texto o wrappers de pruebas existentes no sustituyen una auditoría causal.

## 7. Clasifica hallazgos con precisión

Cada hallazgo incluye unidad/hash, precondición real, entrada mínima sintética, pasos/comando, resultado observado, expectativa sustentada, impacto y corrección propuesta. Diferencia bug, límite documentado, mejora y fallo de arnés. No convertir un límite declarado (sin RTO, sin estado vivo, sin custodia acreditada) en vulnerabilidad ficticia.

No arregles un hallazgo editando el archivo reservado de su autor. Si hay un fallo grave, deja un resumen temprano en tu informe propio y continúa con frentes independientes. Nunca rebajar aserciones existentes para que una fuente defectuosa pase. Una prueba que demuestra un bug debe quedar claramente identificada: no usar skip/TODO y contarla como aprobada.

Si hace falta presentar una suite que reproduce fallos, entrega recuento pass/fail honesto y explica el defecto. Es preferible un repro válido y acotado a un «todo verde» sin cobertura.

## 8. Informe final verificable

El informe CLAUDE-QA-052.md debe poder leerse sin esta conversación:

- Resultado ejecutivo por BACKUP041, SAFE049 y REL046: favorable, con hallazgos o incompleto; nunca una aceptación del tablón.
- Hashes exactos revisados y cotejo final, archivos de prueba propios, seeds y oráculos independientes.
- Matriz de familias/casos ejecutados, resultados propios, sensibilidad y límites no comprobados.
- Hallazgos ordenados por impacto con reproducciones mínimas y correcciones propuestas.
- Inventario de artefactos temporales y puertos (idealmente ninguno), procesos concluidos, fuentes/inputs intactos y contenido seguro del informe.
- Separar CLI/fuentes, empaquetado mecánico, candidata real y runtime instalado. Ninguna cuenta o instalación real se considera comprobada.

Ejecuta typecheck y tus tres archivos focales según sus runtimes. No repetir todo npm test por rutina. Coordina con Codex si vas a hacer la única compilación pesada; no tomes la ventana de navegador de otra sesión. No instalaciones, proveedores, MCP, DPAPI de equipos/perfiles ajenos, bases reales, despliegue, commit/push o autoaceptación.

```powershell
node tools/coordination/board.mjs submit CLAUDE-QA-052 claude --note "Revisión independiente por hashes: casos adversos/generativos/CLI/empaquetado, sensibilidad, resultados reales y límites; sin aceptación de fuentes o despliegue"
```

Tras submit deja de editar. Codex contrastará la evidencia, corregirá sus propios hallazgos y aceptará únicamente las versiones revisadas. Esta misión no autoriza encadenar tareas ilimitadas o prometer trabajo permanente después del chat.
