# QA079 · Cerrar hallazgos QA060 y QA073 con pruebas capaces de fallar

Trabaja en D:/AI/Plan-B-CRM-v2.1/source. Lee AGENTS.md, COORDINACION.md, memoria vigente y las revisiones Codex de QA060/QA073. Ambas auditorías quedaron aceptadas **como informes históricos con hallazgos**, no como aprobación automática de fuentes. No reescribas esos informes para volver verde el pasado.

## Inicio exacto

    node tools/coordination/board.mjs brief CLAUDE-QA-079
    node tools/coordination/board.mjs claim CLAUDE-QA-079 claude

Una sesión, sin subagentes. El tablón declara once rutas exactas: los diez archivos de pruebas/helper de QA060+QA073 y un informe nuevo coordination/reviews/CLAUDE-QA-079.md. Ejecuta check-path antes de editar cada una. Las auditorías anteriores están done y liberadas; eso no te convierte en autor de otras reservas claude. Si QA079 ya está tomada, no la fuerces.

**Espera fuentes finales**: SEARCH053, ACTIVATION066, MANUAL067, HISTORY064, RESTORE050, MANUAL-ID076, REHEARSAL-ISOLATION077 y SEARCH-CONTEXT078 deben estar en review con hashes presentados coincidentes antes de congelar/probar su versión final. No exijas done: necesitas revisar precisamente antes de aceptar. Si siguen working, no conviertas su estado intermedio en dictamen final. Lee el tablón actualizado, no te guíes por este brief para dar por presentada una unidad.

Fuente anterior preservada por Codex antes de corregir: tests/.tmp/qa075-d90acf90-f891-4979-be03-376b0a4f31e4/source (manifest315fuentes/config/tests). Es **baseline histórico inmutable**, no una carpeta para parchear. Copia lo que necesites a una carpeta UUID nueva bajo tests/.tmp/qa079. Tus informes060/073 y los archivos de Codex son solo lectura. COPY074 continúa su desarrollo/revisión por separado: no amplíes esta unidad a ese panel ni a su backend.

## Lo que Codex reprodujo antes de corregir

- QA060:51Node=48pass+3TODO con aserciones fallidas F1/F2/F3. F4:los dos ficherosRESTORE050enparalelo=7pass/2fail, ambosCLIporcarpetasajenas.
- QA073:70Node=66pass+4TODO(H1,M1UI,M1backend,D1). Sus6E2E ymutantes quedaron atribuidos a tu revisión original; Codex no ha fingido repetirlos al aceptar el informe.
- Typecheck del corte075 correcto. Los doce archivos de las auditorías conservaron sus hashes hasta la aceptación.

Debes obtener tus propios resultados de la corrección. No cites estos números como ejecuciones nuevas tuyas ni sumes repeticiones como casos distintos.

## 1 · Búsqueda F1/F2/F3

F1: abrir una ficha sin valor de referencia (`undefined`,null,vacío) no relaciona la ficha cuyo ID sea literalmente undefined/null/vacío. Conserva los positivos: referencia con ID válido, mismo ID en distinta entidad y apertura con revisión exacta. No cambies el parser para ocultar un problema de resolución.

F2: nombre vacío o solo espacios debe tener etiqueta identificable por ID. Los valores0yfalse no deben desaparecer por una solución genérica basada en `||`. Comprueba títulos visibles, ranking estable e inmutabilidad; no confundas falta de nombre con falta de ficha.

F3: estando enpágina2de43,pasa aotra revisión con3resultados. La consulta nueva debe salir conoffset0, mostrar1–3de3 y los tres datos nuevos. No basta que desaparezca21–3 ni que una paginación vacía o spinner se oculte. A→B→A no debe restaurar una página anterior por casualidad. Prueba un handler de página capturado antes del cambio; no debe reactivar un offset de otro contexto.

Tu A18 fue una reproducción por hooks, no por el normalApp. Conserva esa distinción aunque añadas navegador. Si creas un wrapper React para cambiar props, es una prueba de componente en navegador, no evidencia de que el operador pueda disparar ese cambio desde el modal normal. Repite los recorridos existentes de búsqueda para evitar que se rompan identidad/carreras/apertura porID/revisión.

## 2 · Historial H1 y cambio explícito de contrato

El buscador visible anuncia ID,campo y valores. La fecha ISO no anunciada hacía coincidir otros registros al consultar un número. El nuevo contrato debe devolver solo las coincidencias de ID/campo/valores y los metadatos operativos admitidos; la fecha presentada no se indexa silenciosamente.

Tu H3b debe pasar corregida y fallar en el baseline. H9 era una caracterización de que el año devolvía todo: **no la borres para esconder el cambio**. Actualízala con explicación de contrato y conserva el baseline que demuestra el comportamiento anterior. Prueba números presentes legítimamente en valores, no solo IDs; no diseñes un oráculo que excluya todos los números salvo el identificador exacto si la búsqueda sigue siendo por términos.

Conserva122operaciones, rangos/páginas/marca inclusiva, tiposausente/null/vacío/0/false y total_changes() sin escrituras. El cambio de precisión no debe introducir recortes o pérdida de datos.

## 3 · Activación D1 y observación44px

Aprobación A → contextoB → contextoA con la lectura nueva pendiente: no debe aparecer una casilla marcada ni un botón habilitado por la respuesta antigua de A. Después de cargar la nueva A debe exigirse otra revisión humana. Éxito/error tardío deB no repone permisos ni respuesta.

El servidor ya neutralizaba una revisión obsoleta con409; no presentes esta corrección de intención como cierre de un bypass de permisos. Conserva todos los tests de hash/atomicidad/strict/runtime y la distinción del endpoint legado. Retirar la respuesta anterior no debe convertir un fallo de red en pantalla definitivamente vacía sin reintento.

Comprueba el botón principal de activación a1440/390/320 con CSS global real. Tu O-D2 observó32/40px: la nueva regla debe medir≥44px sin bajar aserciones, esconder texto o provocar overflow.

## 4 · Identidad manual M1: alcance demostrado y precisión

Tu reproducción fue un **remoto simulado de lectura que normaliza ceros iniciales**, no una llamada a HubSpot. No se ha encontrado fuente primaria que garantice que laAPIreal resuelva0501y501igual. El informe Codex califica esa afirmación: conserva la reproducción como modelo adverso y describe la corrección como una política explícita de IDs numéricos canónicos.

-501válido;0501/000inválidos como entrada nueva, antes de leer/verificar el remoto. No los conviertas a otro ID silenciosamente.
- La forma0es canónica si el contrato vigente la permite; no inventes una garantía de que exista un registro0enHubSpot.
-9007199254740992y9007199254740993son distintos; se deben conservar exactamente como strings. Nada deNumber,parseInt ni aritmética que pierda precisión.
- Mismo ID en entidades distintas puede ser válido; duplicado en la misma entidad no confirma dos altas.
- Un mapeo heredado con ceros iniciales no se reasigna a otro registro mediante una comparación de cadenas distinta. Comprueba colisiones contra IDs guardados y registros de captura. No migres datos ni reescribas un mapeo histórico para producir verde.
- Al rechazar, watermark/report/mapping permanecen intactos y el remoto no recibe lecturas/escrituras de ese intento. Después de entradas canónicas válidas, el caso positivo sigue verificando valores/relaciones por lectura.

Retira los TODO E2b/E7b solo tras comprobar la causa correcta en los dos lados. Conserva los tests de resultado completo, mapeo/revisión y reintento tras acuse; el endurecimiento no debe romper el mismo ID permitido entre entidades.

## 5 · F4: ensayos realmente aislados, no serializados para aparentar solución

Codex mantiene los contratos de producto y mueve sus tests a workspaces de fuentes privados mediante tests/helpers/rehearsal-workspace.ts. Lee el helper: no debe copiar bases, claves,.env,.ai.local.json o dependencias; solo fuentes necesarias, con UUID nuevo. No puede borrar carpetas para vaciar el contador. El código de recuperación no debe aceptar destinos arbitrarios por esta corrección.

Ejecuta en paralelo los dos ficherosCodex y tu banco independiente. Deben pasar sin que uno lea carpetas creadas por otro. **No uses --test-concurrency=1 para demostrar que se arregló F4**; solo sirve para el control del diagnóstico antiguo. Mantén las comprobaciones de runId y los archivos propios del ensayo, no sustituyas una garantía por «hay al menos alguna carpeta».

Añade una comprobación adversa que cree otra carpeta legítima de ensayo en la raíz antigua mientras corre elhelp/ensayoCLI: no puede interferir con el workspace privado. Si el arnés necesita copia de fuentes, documenta procedencia/hashes. Conserva la evidencia y la clave ficticia de cada fixture en su carpeta nueva; no uses ni recuperes una base instalada.

El baseline075debe reproducir la interferencia con las dos suites antiguas; ya se observó, pero ejecuta tu contraste acotado propio para que tu nuevo test sea sensible. Un éxito aislado casual no refuta una carrera demostrada. Informa cuántos intentos hiciste y qué coincidencia temporal se controló.

## 6 · Entrega, límites y protocolo de conservación

Repite bancos relevantes después de congelar hashes finales; conserva oráculos positivos deEXPORT054/TODAY059/RESTORE050 y las interfaces sin cambios. No ejecutas todo el producto solo para sumar consumo. Las otras unidades favorables conservan su alcance y no se «aceptan otra vez» por asociación.

Retira cadaTODO solo con evidencia de corrección+baselinefallido. Cuenta pass/fail/skip/TODO con precisión; una caracterización no es garantía, ceroSKIP no significa que probaste todas las subrutas. Presenta antes/después por hallazgo, causa, fuente y hash.

AUTH_PARENT072 sigue pendiente mientrasAppestéreservado: no lo arregla esta unidad ni se oculta porqueProtectionsoporte un callback asíncrono. No editarApp,fuentesCodex,memoria,panel,QA056oCOPY074. No autoaceptación de fuentes ni despliegue/commit/push, nueva dependencia, proveedor, navegador/perfil del usuario, puertos4331/4334 o equipo corporativo original.

**Conservación obligatoria:** tu informe073declaró cinco borrados recursivos propios y logs sobrescritos, contrarios a su brief. En079 no hagas borrados recursivos ni reutilices la misma carpeta/log de un mutante. Usa UUID por ejecución y nombres nuevos; deja fallos de arnés separados, no los borres ni los atribuyas al producto. No se pueden reconstruir como evidencia actual los logs anteriores perdidos.

Tu nuevo informe debe contener hashes completos de fuentes/dependencias/pruebas, comandos/rutas, resultados propios, capturas inspeccionadas, sensibilidad causal y limitaciones reales. Una sola sesión y solo las once rutas exactas. Tras submit conserva reservas y deja de editar.

    node tools/coordination/board.mjs submit CLAUDE-QA-079 claude --note "Revalidación independiente F1-F4/H1/M1/D1 y44px: hashes, controles positivos, baseline causal, ensayos paralelos aislados y límites; sin aceptar fuentes ni instalar"
