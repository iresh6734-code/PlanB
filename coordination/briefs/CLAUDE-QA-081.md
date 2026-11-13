# QA081 · Demostrar que el inspector examina el archivo correcto

Trabaja en `D:/AI/Plan-B-CRM-v2.1/source`. Lee AGENTS.md, COORDINACION.md, el contexto vigente y CODEX-COPY-074.md. COPY074 está presentada en review: comprueba ese estado y sus hashes actuales antes de probar. No necesitas que su autor se autoacepte para auditarla. No modifiques sus fuentes.

Este encargo es distinto de QA079. Otra sesión puede estar haciendo QA079: sus diez pruebas/helper y su informe no son tuyos. Dos sesiones llamadas `claude` no son el mismo propietario. Usa una sesión, sin subagentes ni traspasos implícitos.

    node tools/coordination/board.mjs brief CLAUDE-QA-081
    node tools/coordination/board.mjs claim CLAUDE-QA-081 claude

Antes de editar cada archivo usa check-path. Tus cinco rutas exactas son:

- `tests/helpers/independent-copy-inspection-harness.ts`
- `tests/independent-copy-inspection-api.test.ts`
- `tests/independent-copy-inspection-ui.test.ts`
- `tests/e2e/independent-copy-inspection.spec.ts`
- `coordination/reviews/CLAUDE-QA-081.md`

No amplíes la reserva. Si necesitas otra fuente, informa del motivo y sigue las comprobaciones independientes que sí puedas completar. No edites memoria, panel, App, pruebas de otros encargos ni informes históricos. No despliegues, publiques, hagas commit/push, instales dependencias o cambies protecciones.

## Resultado que debe poder creer una persona

Seleccionar un archivo no permite afirmar que sus bytes son válidos. Un archivo íntegro no demuestra que incluya todas las operaciones de la referencia local. Una coincidencia tampoco demuestra custodia externa o restauración en otro ordenador. Busca rutas donde la interfaz o el contrato mezclen esas tres afirmaciones. No aceptes como oráculo el mismo comparador o esquema que estás auditando.

Congela fuentes y hashes en una carpeta nueva bajo tests/.tmp con UUID. Copia solo fuentes/configuración pública necesarias, nunca .env, .ai.local.json, bases, claves, sesiones o datos instalados. Usa fixtures nuevas en el equipo actual. No abras ni consultes el equipo original, cuentas reales, 4331/4334 o perfiles del usuario. Un navegador propio headless y un listener nuevo4414 son suficientes; reuseExistingServer:false y fallo si está ocupado, sin matar procesos ajenos. Mantén el entorno del hijo por allowlist del sistema operativo; no heredes secretos de proveedor.

## 1. Oráculo propio de bytes y transporte

Construye el digest esperado con node:crypto sobre el Buffer original. No lo leas del resultado del endpoint, ni reconstruyas el JSON antes de calcularlo. Prueba whitespace final, caracteres no ASCII, emoji, CRLF, BOM si es admisible, UTF8 inválido y JSON truncado. Un archivo semánticamente igual puede tener hash distinto: distingue integridad semántica del digest de sus bytes exactos. Si el BOM no es compatible, un rechazo honesto es un resultado válido, no un fallo por sí mismo.

El cuerpo admite solo encoded, password y referenceRevision explícita. Prueba base64 no canónico, padding sobrante/ausente, contenido vacío, tipo incorrecto, campos extra, rutas de archivo y referencias no hexadecimales. Comprueba códigos y que ningún error reproduce el contenido de un campo secreto marcado con un valor ficticio único. No escribas ese valor en el informe o logs.

Ejercita una entrada válida por encima de20MiB sin que el bodyLimit antiguo la corte, el máximo admitido de32MiB y una entrada mayor rechazada. Distingue límite de bytes decodificados, base64 y cuerpo HTTP. Hazlo de forma acotada, una entrada grande cada vez, sin bucles de saturación. No presentes un test de esquema aislado como prueba del límite Fastify real. Los casos pesados pueden ser API sin listener; registra tamaño, código y hash, nunca los bytes completos. No hace falta repetir cada caso en navegador.

## 2. Cobertura con historia conocida por construcción

Genera tu propia secuencia explícita de operaciones y calcula los recuentos esperados desde esa secuencia. Incluye una copia inicial, varias ediciones de una ficha, creación de otra, un valor revertido A→B→A y un dato conservado al final de un conjunto de10.000registros. Una copia anterior debe informar el número de operaciones que no contiene, aunque los valores finales se parezcan a los iniciales.

Separa prefijo real de historial, bifurcación con igual longitud, cambio de revisión sin nuevas operaciones, mismo ID de captura con contenido distinto, portales distintos y ensayo frente a producción. Fechas posteriores no deben ordenar por sí solas las revisiones. Evita que un test pase por un identificador o un dato accidental que también coincidía en otro campo.

Para producción ficticia, crea metadatos y bytes cifrados nuevos con contraseña efímera. No uses la cuenta HubSpot. Verifica que el cifrado de la referencia efímera no modifica el estado persistente ni aparece en el resultado. La referencia activa y una candidata pendiente son cosas diferentes. Una comparación imposible o demasiado grande debe ser inconclusa/invalid, no verde.

Incluye integridad sin espacio activo: referenceRevision:null, ausencia de cobertura y ninguna identidad de destino inventada. Al activarse posteriormente un espacio, aquella revisión null debe quedar obsoleta. No restaures una copia en la instalación para preparar el caso: crea Store nuevo o usa exclusivamente la fixture de tu servidor.

Comprueba sending/uncertain, aprobación antigua y operaciones pendientes. Las restauraciones en memoria pueden normalizarlas, pero la revisión no debe alterar aprobaciones, watermark, registros, historial, custodia o trabajos de la Store real de la fixture. Captura ese estado antes/después de inspeccionar. Si exportas primero para obtener bytes auténticos, toma el estado inicial después de la exportación: esa exportación sí actualiza metadata por diseño.

## 3. Concurrencia de verdad, con un resultado que podría parecer válido

Prueba las guardas con respuestas completas y semánticamente válidas, no con objetos vacíos que ya rechazaría el esquema. Controla promesas mediante puertas explícitas; evita dormir un tiempo fijo y suponer una carrera.

- Elige archivo mientras el GET inicial sigue retenido: la referencia debe terminar de llegar y el envío quedar habilitado con ese contexto.
- Selecciona B mientras se lee A. Resuelve o rechaza después la lectura de A: no puede emitir su POST ni borrar un resultado nuevo de B.
- Retén una inspección válida de A; cambia selección, cierra o desmonta. Haz que el transporte ignore abort y entregue éxito o error tarde. La vista no debe escribir estado antiguo ni conservar la contraseña anterior.
- Contexto A→B→A con lectura pendiente. Una igualdad del texto de la clave no debe revivir el objeto de operación antiguo.
- Cambia el estado real de la referencia entre GET y POST:409, contexto nuevo, contraseña retirada y cero reintento automático de POST. Añade un fallo de la lectura posterior: debe quedar manejado, bloqueando el envío hasta recuperar un contexto válido.
- Dos envíos antes del siguiente render: una lectura de archivo y un POST. Cancelar permite un nuevo intento explícito, sin aceptar la respuesta anterior.
- Adultera en una respuesta el hash y su duplicado interno para que el esquema por sí solo acepte ambos. El hash calculado por el cliente debe impedir el verde. Haz lo mismo con tamaño, revisión, identidad y recuentos compatibles en apariencia pero pertenecientes a otra referencia.

Tu arnés de hooks debe declarar que no es ReactDOM. El navegador debe comprobar al menos una carrera con bytes exportados reales, foco/teclado, cierre y un409real del backend. Si la cancelación del navegador impide entregar la respuesta, no lo presentes como prueba de transporte que ignora abort: esa propiedad pertenece al banco controlado.

## 4. Interfaz honesta y evidencia conservada

Comprueba 1440/390/320, ausencia de overflow horizontal, botones de44px y hashes completos legibles o ajustados. La revisión está plegada por defecto y no debe leer archivos, iniciar peticiones propias o sondear hasta abrirse. No atribuyas al bloque el sondeo de Continuidad que ya existía. El runtime independiente no incluye el consumidor: verifica el límite de registro de rutas y la condición de UI; no es necesario inventar una nueva instalación del runtime.

Una contraseña errónea, servidor404,401,409,422, informe malformado o error de lectura no deben producir un estado verde heredado. Distingue errores simulados y respuestas reales. Inspecciona las capturas que guardas; no digas que probaste lector de pantalla o Edge si no los usaste. No abras navegador del usuario para conseguirlo.

Selecciona mutaciones que desactiven guardas concretas en copias efímeras y demuestra que el test previsto falla mientras el control positivo conserva su resultado. Ejemplos: quitar la comprobación de hash del cliente, aceptar la referencia vieja, no invalidar al cambiar archivo, contar solo valores finales al comparar cobertura, persistir una aprobación en el Store real de la fixture. Una mutación equivalente no aporta sensibilidad: descártala y explica por qué. No persigas una cifra artificial de mutantes ni cubras la falta de oráculo con muchas semillas.

Cada intento usa carpeta y log nuevos con UUID. No borres recursivamente ni sobrescribas un resultado fallido. Conserva separados fallos del arnés y defectos del producto. Las pruebas de sensibilidad con fallos previstos no cuentan como casos aprobados de la suite normal.

## 5. Entrega

El informe nuevo incluye hallazgos priorizados con causa y reproducción mínima, fuente/hash exactos, controles positivos y adversos, comandos, tamaños de archivo, resultados pass/fail/skip/TODO, capturas realmente inspeccionadas y limitaciones. Si un defecto se confirma, deja una regresión que falle en la fuente presentada y explica el dictamen; no alteres el producto o uses TODO silencioso para dar verde. No necesitas arreglarlo para entregar una auditoría útil.

Coteja otra vez los hashes después de probar. Si han cambiado, el resultado no acredita la nueva versión: congela y presenta qué corte sí revisaste. Codex decide aceptación/corrección del producto. Tras submit conserva reservas y no sigas editando.

    node tools/coordination/board.mjs submit CLAUDE-QA-081 claude --note "Auditoría independiente COPY074: oráculos de bytes e historia, concurrencia, límites, no mutación, sensibilidad y hashes; sin autoaceptar fuentes o instalar"
