# CODEX-SEARCH-IDENTITY-145 · Contexto de búsqueda ligado a su instalación

2/11/2026,Europe/Madrid. Codex autor. Presentación para revisión independiente de143;no autoaceptación053/078/145/146. Fuentes modificadas exclusivamente bajo053working;fixtures078/146 en reservas propias y pruebas nuevas en145. No preview144 creada ni demo actualizada.

## Defecto y corrección

143 reprodujo dos instalaciones y cuentas ficticias distintas con igual captura ID/fecha/especificación/registros:el fingerprint anterior `{captureId,spec,records}` coincidía y B aceptaba la selección preparada enA. Era una colisión de contexto;no una prueba de acceso no autorizado ni una conmutación real de navegador.

Ahora `workspaceSearchIdentity` calcula sinawait una identidad de la instalación activa y un contextRevisionSHA256 de **instanceId,snapshotcompleto,generaciónactiva ysessionIdlógico**. No utiliza claves ni cookies. Devuelve solo campos públicos de procedencia y el hash,no el contenido completo de esa entrada. Captura pendiente/candidata no participa. Si falta una instanciaUUIDválida,no se fabrica unID durante una lectura:el estado sigue legible con identidadnull y la búsqueda rechaza409.

`server/app.ts` añade workspaceSearchContext al mismo estado que lee la captura activa,antes de compactar sus registros. App recibe así la identidad junto a sus datos,sin una segunda consultahealth que pudiera pertenecer a otro servidor. Las propiedades de AppState existentes siguen intactas;el consumidor local usa una intersección de tipos,no se modifica shared/model.ts.

La revisión del conjunto buscable incorpora contextRevision,especificación y registros activos. GETsearch puede recibir el contexto esperado y rechaza409 si cambió,desde la primera página;la paginación mantiene además la revisión del conjunto. GETsearch-record compara captura/revisión contra elStoreactual,por lo que una selección de otra instalación o de una captura sustituida ya no abre un registro allí. Parámetros siguen siendo estrictos,GET/no-store,sin escrituras ni bypass deauth/Host/Origin.

WorkspaceSearch recibe la identidad esperada deApp. Comprueba instancia,cuenta,captura,fecha,clase de datos ycontextRevision tanto en resultados como al abrir,además de revisión/entidad/ID. La identidad entra en la clave de peticiones y paginación:su cambio cancela/descarta lecturas y aperturas antiguas incluso con igual capturaID/fecha ylocalRevision. No adopta implícitamente el contexto de la primera respuesta. Un servidor/estado antiguo sin identidad comprobable bloquea esta búsqueda con mensaje de actualización;no activa un modo inseguro de compatibilidad.

## Validación final propia

Snapshot `tests/.tmp/search145-2467b143-69ee-46db-89e1-9a21d593abb3` conmanifest.json,fuentes congeladas,logs,result.json,fixtures yartefactos. Se excluyeron rutas Claude enworking;las fuentes ensayadas están copiadas y se cotejan al terminar. Env mínimo/red externa bloqueada,sin proveedores,cuentas,datos declientes oclaves anteriores.

-**150/150Node**,0omitidas/TODO/fallos:quincebúsqueda/API,078,cuatroauth-parent,32bancoQA060migrado146,11nuevas145,29operacioneslocales,40ficha/seguimiento123/130,18integraciones. Son casos de este corte,nuevos y repetidos distinguidos porarchivo;no se suman a otros150 históricos.
-**Typecheck focal limpio** sobre esas suites,ambos specsdebúsqueda,App ymain con sus dependencias;no es typecheck global delcheckout.
-**Vite completo** de App en la carpeta aislada;sin npmrunbuild ni dist/build raíz.
-**11/11DOM**,0skip/flaky,en19,55s:seis casos053 existentes sin cambiar sus aserciones,más cinco nuevos145. BackendcreateBaseApp real,SQLiteenmemoria,fixturelocal efímera yChromium1228 nuevo. PID30504cerrado y ausente. Browser plugin not available.

Los once casos nuevos deNode incluyen identidad igual entre estado compacto/API y ninguna escritura;instalaciones distintas con el mismo portal/datos;cuenta sustituida dentro de la misma instalación;captureStartedAt diferente conigualID/fecha;baseline de captura distinto seguido de ediciónlocal que deja todos los registros activos iguales;generación activa nueva frente a candidata pendiente;instanciaausente/corrupta sin mutación;respuestas de búsqueda con instancia/cuenta/contexto ajenos;apertura con fuente falsificada pero revisión/entidad/IDcoincidentes;apertura tardía con transporte que ignoraabort tras cambiarpropscontexto;estadoAppsinidentidad bloqueado y nueva identidad explícita que permite continuar. Cuatro son arnés dehooks,noDOM ni prueba de foco/layout.

Los cincoDOM nuevos prueban enApp:fuente de otra instancia rechazada;apertura con portalajeno/revisióncopiada rechazada;sustitución mediante bundle ficticio de fuente conigualID/fecha y rechazo del resultado/refresco con contexto anterior hasta recargarApp;respuesta de apertura retenida mientras el estado real deApp cambia;servidor de estado sin identidad sin emitir ninguna consulta de búsqueda. El refresco del cuarto se provoca mediante el evento existente planb:locked yconsulta realauth/status,que declara abierta la ficción:no demuestra una notificación espontánea de otro proceso. El arnéshook sí entrega una respuesta pese aabort para verificar el descarte sin depender de que Chromium la cancele.

Los seisDOM anteriores cubren cuatro entidades/recuentos/filtros,homónimas conIDexacto/valorescompletos,paginación/vacío,respuestaobsoleta,409tras cambio yrefresh,404servidorviejo y401quebloqueaApp,teclado y1440/390/320. Se inspeccionó search053-320.png de este pase:panel contenido,campos/resultados legibles yscrollinterior. SinEdge/lector de pantalla. Los errores404/401/409se inducen en casos específicos;no se afirma consola global vacía. Los cinco nuevos registran0pageerror/0externas/0métodos de búsqueda distintosdeGET.

## Contrapruebas

Cinco mutaciones únicamente privadas,restauradas antes delDOM:retirarinstanceId delhash;reducir snapshot aID/fecha/fuente;comprobar solo captura en respuesta de búsqueda;comprobar solo captura en apertura;retirar identidad esperada de la clave delcliente. Cada oráculo seleccionado falla conAssertionError,0fallos de infraestructura/importación/compilación/timeouts. Las mismas pruebas pasan con fuentes originales del corte.

La observación143se conserva intacta:en una copia con las tres fuentesAPI/sharedpre145 archivadas **pasa1/1 reproduciendo la colisión**;en el corte corregido **falla1/1 en su aserción de revisiones iguales**,pues ahora son distintas. No se cuenta el rojo observacional como fallo de corrección ni como prueba verde. Su propietario143debe decidir cómo convertirla/retirarla antes de afirmar una suiteglobalverde;estechat no editó esearchivoreservado.

Con WorkspaceSearchdelbaseline075,las tres regresionesF3(078,A18,A18b) fallan por offset20/rango21–3. Con el código actual pasan dentrodel150. No se retiraron sus oráculos para adaptarlas al contrato:verificaciónAST conserva exactamente7llamadasassert de078 y183delbancoQA060(archivo fixture-assertions.json). Su migración está documentada en146.

## Incidencias y límites

Primer corte `tests/.tmp/search145-68632f34-fbd2-4750-9f2b-1932458ddbcb`:150Node/typecheck ycincomutantes correctos;DOM8/11. Tres casos propios asumían que qcontact-1 solo devolvería una fila;la búsqueda por subcadena también encuentra IDs más largos yreferencias. Se cambió solo su selección a la tarjeta cuyo ID es exactamentecontact-1;no se cambió producto,datos ni alcance de búsqueda. Cortenuevo repite150/typecheck/contrapruebas/11DOM. Ambos resultados se conservan,no se suman como22casos.

El fingerprint describe contenido/identidad serializados;no es autenticación,autenticidaddeunarchivo,cifrado,un nonce porintento o un relojmonotónico. Estados idénticos en todos esos campos comparten contexto. Cambios de orden serializado pueden invalidarlo conservadoramente. Su cálculo es lineal sobre snapshot/records;el banco de10000registros se ensayó,sin garantía universal de latencia o memoria.

Las lecturas/comparaciones son síncronas dentro del escritor cooperativo de esteproceso;no se añade transacción de lectura contra un escritorSQLiteexterno. Una copia puede cambiar después de servir la respuesta:no se convierten los guardadoslegacy del editor en CAS ni se integra128. El seguimientoD7de136 yrescate116 siguen separados. La corrección protege la búsqueda/apertura ensayada,no elimina todas las carreras de edición delproducto.

API/client/Appcorregidos aquí permanecen en revisión. No se acepta053completa por este informe ni por140done. No se reinicia4591,no se crea144,despliega,publica,commitea,envía código aClaude ocontrata servicios. Siguiente:dictamen independiente143sobre hashes nuevos yalcance completo053;solo después preparar previewactualizada con datosficticios ybuild sellado.
