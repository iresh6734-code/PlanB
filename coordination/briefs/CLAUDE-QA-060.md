# QA060 · Auditoría funcional adversa de las nuevas capacidades de Plan B

Trabaja en D:/AI/Plan-B-CRM-v2.1/source. Lee AGENTS.md, COORDINACION.md, contexto vigente y coordination/plans/REVISION-CONJUNTA-060.md. Tu misión es producir una revisión independiente que pueda impedir una aceptación equivocada de SEARCH053, EXPORT054, RESTORE050 y TODAY059, contrastando también la evidencia de integración058. No es una tarea de maquillaje ni de producir un número de tests.

Hay dos encargos de Claude compatibles: **QA056 revisa las correcciones F1/F2/F3; QA060 revisa estas capacidades funcionales.** No tomes QA056 ni sus tres archivos de pruebas. No se presupone que otra sesión llamada claude sea tuya. Puedes trabajar en paralelo solo si cada sesión reclama su encargo y conserva sus rutas exactas.

## Inicio y límites

Comprueba primero que las cinco unidades citadas están en review y sus archivos coinciden con los hashes presentados. Una fuente modificada exige nueva presentación; no congeles una mezcla intermedia. No exijas done: precisamente estás revisando antes de aceptar. Registra los hashes por unidad y también Store/Recovery como dependencias, sin editar esos archivos.

    node tools/coordination/board.mjs brief CLAUDE-QA-060
    node tools/coordination/board.mjs claim CLAUDE-QA-060 claude

Cinco archivos exactos de escritura, con check-path antes de editar:

1. tests/independent-workspace-contracts.test.ts
2. tests/independent-export-contracts.test.ts
3. tests/independent-rehearsal-contracts.test.ts
4. tests/e2e/independent-workspace-flows.spec.ts
5. coordination/reviews/CLAUDE-QA-060.md

Fuentes, tests de Codex, QA052, QA056, REL033, memoria y panel son solo lectura. Una sesión sin subagentes, proveedores, instalación, dependencias nuevas, commit/push o autoaceptación. No CLI general de Claude, MCP adicional, perfiles personales, servicios 4331/4334 o recursos del equipo corporativo original. Usa datos ficticios nuevos y carpetas UUID bajo tests/.tmp/qa060. No borres recursivamente carpetas; conserva evidencia acotada. Un trabajo pesado a la vez, fixtures con loopback explícito y procesos propios. Si falta una capacidad del entorno, separa la preparación fallida del comportamiento de producto.

## A · Búsqueda global: identidad, procedencia y valores completos

Construye un oráculo sencillo a partir de registros inventados con expectativas escritas antes de llamar al buscador. No valides el algoritmo comparando dos llamadas al mismo algoritmo ni copies su ranking como oráculo independiente.

- Incluye las cuatro entidades, IDs iguales en entidades distintas y dos registros homónimos. Variantes con acentos compuestos/descompuestos, mayúsculas, espacios repetidos y puntuación literal. Todos los términos deben cumplirse entre ID/campos declarados.
- Los campos no declarados no participan ni aparecen en previews. Verifica enum por etiqueta/valor y los controles false, cero y null. Conserva inmutables los objetos de entrada.
- Define a mano un conjunto pequeño con ID exacto, nombre exacto, prefijo y coincidencia en otro campo. Comprueba orden estable y desempate por identidad, también con entrada reordenada.
- Distingue recuentos globales, filtro por entidad y página. Explora límites 0/1/20/21 y un conjunto de 10.000 registros; alcanza el último ID sin contar un recorte como total completo. No conviertas el tiempo de esta suite en una garantía comercial.
- Casos GET inválidos: consulta, máximo de términos, filtros repetidos/desconocidos, offset/limit y revisión malformada. Conserva los rechazos actuales; no interpretes un 422 de preparación como hallazgo de búsqueda.
- Una captura candidata no es la activa. Verifica qué revisión/captura devuelve el endpoint, qué ocurre tras cambiar esquema/datos de la activa y qué ocurre al paginar con una revisión antigua. Cambios de captura o revisión deben dar 409 cuando corresponde.
- Abrir un resultado requiere entidad, ID, captureId y revisión exactos. Prueba caracteres reservados en IDs, ficha eliminada, referencia ausente y valores más largos que el preview. La ficha debe devolver valores completos actuales o rechazar una apertura obsoleta; nunca guardar un preview como valor.
- Autenticación, Host/Origin y cache no-store. No etiquetes un fallo del servicio antiguo 404 como un resultado vacío legítimo. Ninguna consulta de búsqueda modifica registros, cambios, plan o autorización de envío.

## B · Exportación revisada y custodia honesta

Contrasta el componente, la API existente y el archivo real, distinguiendo sus contratos: el componente fija revisión; la API conserva compatibilidad con llamadas directas sin revisión. No conviertas esa compatibilidad documentada en un bypass inventado.

- Sin resumen válido, revisión explícita o contraseñas coincidentes de longitud admitida, la UI no debe preparar descarga. Cambiar una contraseña no permite usar una revisión obsoleta sin el control del servidor.
- Retén una respuesta de resumen; cambia pantalla/contexto o solicita actualización. La respuesta tardía no debe reponer contenido, casilla o resultado de otra lectura. Prueba error tardío además de éxito tardío si el transporte lo permite.
- Entre revisión y POST modifica un registro en el fixture. Debe haber 409 y un único intento; mostrar contenido actualizado y exigir revisión nueva, sin descargar automáticamente la revisión posterior.
- Realiza una descarga cifrada y descífrala con su contraseña ficticia. Compara revisión, captura, valores, historial y datos ficticios con un oráculo independiente, no solo nombre del archivo o tamaño positivo. Contraseña errónea/tamper deben fallar sin tocar el origen.
- La UI dice que el archivo se preparó para descargar; no acredita que se guardara fuera, que la contraseña se custodiara o que se restaurara. Contraseñas/casilla se retiran tras éxito. No exijas borrado criptográfico de memoria JavaScript: esa propiedad no se promete.
- Custodia vigente solo para revisión exacta y current:true. Declaración humana, exportación registrada, confirmación histórica, estado ausente y error de consulta son cosas distintas. Una edición invalida la vigencia sin convertir historia en prueba actual.
- Sesión revocada y POST 401 deben bloquear la pantalla. 404/503 no habilitan descargas sin resumen. No se altera el helper global de descarga por esta unidad: puede terminar la preparación tras navegar, límite documentado. Distingue eso de volver a montar contenido antiguo.

## C · Ensayo de recuperación: límites y persistencia entre procesos

Lee RESTORE050 y sus límites antes de ejecutar. Es un ensayo ficticio por API de fuente; INTEGRATION058 añade un recorrido sobre runtime compilado. No los presentes como el mismo producto ni como recuperación acreditada de un ordenador real.

- CLI sin la opción explícita muestra ayuda; solo --run-fixture debe crear un ensayo. No pasas rutas a bases existentes ni copias instaladas. Confirma que no hay escritura fuera de la nueva carpeta fija/UUID.
- Admisión de artefacto: formato, tamaño, clasificación fixture/isTestData, origen coherente y contraseña. Una forma de sobre aceptada no basta si sus datos interiores incumplen el contrato. No generes datos reales para probar un rechazo.
- Worker y orquestador conservan sus límites de ruta/enlaces y fase. Intentos contra una carpeta padre, enlace o base previa deben rechazarse antes de usarla. Si symlink/junction no está disponible, diagnostícalo sin marcar el caso como aprobado.
- Comprueba restauración por API protegida, sesión/Host/Origin, cuatro operaciones y prueba local. Otro proceso debe volver a autenticarse y observar misma revisión, registros, historial y pendientes. Exige PID distintos; dos instancias del mismo objeto no prueban reinicio.
- Fallo de worker, fase fallida o protocolo inválido no deben producir informe successful. No imprimas claves, contraseñas efímeras o contenido completo de los registros en diagnósticos.
- Contrasta el recorrido integrado058: artefactos inventariados por hash antes/después, runtime.mjs compilado, archivo cifrado real, edición por ID y rechazo de escrituras si hay uncertain. Distingue qué has repetido tú y qué solo has inspeccionado del informe de Codex.

## D · Hoy: completitud, ventanas y simulación acotada

- El criterio de negocio es el existente: oportunidad abierta sin tarea pendiente próxima y compromisos vencidos/para hoy. No amplíes este encargo a rediseñar fechas, automatizar correos o habilitar datos de producción.
- Genera más de veinte oportunidades y tareas, con una coincidencia única al final. Los totales y las filas completas deben concordar, también cerca de 10.000 registros totales. Fechas iguales conservan orden estable por ID.
- Comprueba cinco filas de vista inicial, veinte por página, último elemento alcanzable, búsquedas por etiqueta/ID con todos los términos, cero resultados, página antigua tras acortar lista y ausencia de mutación del orden de negocio. Los filtros no realizan peticiones/escrituras.
- Servidor anterior sin listTotals o con metadatos inconsistentes: aviso explícito, recuento recibido y total indicado si existe. No inventar filas o afirmar que veinte representan todas.
- Tandas de 20+20+resto, sin repetir propuestas ya preparadas para la misma revisión. Máximo cien en total; ninguna nueva propuesta se aprueba o ejecuta sola. Conserva aprobación y artefactos simulados separados de registros CRM.
- Runtime independiente y producción no habilitan el motor. Revisa que los cambios en SalesWorkspace no rompen los modos agentes/propuestas/integraciones. No conviertas un test de simulación en evidencia de envío real.
- Teclado y foco al limpiar, controles 44px del nuevo componente, 1440/390/320 sin overflow. Examina capturas legibles. No afirmes lector de pantalla u otro motor sin ejecutarlos.

## E · Carreras y sensibilidad: pruebas capaces de fallar

Tu revisión debe cuestionar los tests existentes. Una respuesta obsoleta con source:{} o un payload inválido puede rechazarse por procedencia/formato y dejar sin probar la guarda de antigüedad. Usa respuestas válidas de la misma captura y controla cuándo llegan. El abort nativo del navegador tampoco demuestra por sí solo que se ignora un transporte que no respeta cancelación.

Para un caso representativo, usa un fetch de ensayo que descarte la señal solo en la petición retenida, manteniendo el resto de la red real contra fixture. Tras cambiar consulta/selección, deja llegar la respuesta válida antigua. El resultado actual debe seguir disponible, sin reapertura, sustitución, error viejo o spinner permanente. No basta buscar la ausencia de un texto que nunca era válido.

Al menos una guarda de identidad/revisión debe perderse en una copia temporal para demostrar que tu prueba falla por la causa correcta. Para Hoy conserva el baseline anterior al recorte: Codex reprodujo veinte en vez de 47 y segunda tanda cero en vez de veinte. Puedes reutilizar esa fuente exacta, pero debes ejecutar tu propia prueba y registrar su hash. Evita repetir builds enormes cuando una mutación causal de fuente y un recorrido focal bastan. Nunca mutar archivos compartidos o el artefacto original.

## Entrega y dictamen

Ejecuta los bancos propios relevantes y typecheck sobre versiones congeladas. Reutiliza las dependencias/Chromium de caché, no navegador del usuario. Los scripts y builds de apoyo van a scratch propio; no npm run build, build/dist raíz o npm test general por rutina. Si necesitas un archivo compartido adicional, plantea el cambio de alcance antes de escribirlo.

Informe nuevo: hashes por unidad/dependencia, comandos reproducibles, pass/fail/skip/TODO reales, tamaños/tiempos medidos, oráculos, sensibilidad causal, capturas inspeccionadas, límites de entorno y recomendación separada por unidad. Si hay hallazgo, reproducción mínima y referencia concreta; no lo arregles en la fuente de otro dueño. Si no hay hallazgos, identifica los caminos comprobados y los que solo revisaste estáticamente.

No aceptes estas fuentes usando actor codex. No resuelvas pendientes de LAB035/REL033 por asociación, no declares toda la aplicación instalada o segura y no sumes repeticiones como casos distintos.

    node tools/coordination/board.mjs submit CLAUDE-QA-060 claude --note "Revisión independiente de búsqueda/exportación/ensayo/Hoy; hashes, oráculos, carreras, sensibilidad y límites; dictamen por unidad, sin aceptar o desplegar"

Tras submit conserva reservas y deja de editar. Codex contrastará resultados, volverá a comprobar hashes y decidirá sobre cada unidad. Un brief preparado no acredita recepción o trabajo permanente de otra sesión.
