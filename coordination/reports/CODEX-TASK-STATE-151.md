# CODEX-TASK-STATE-151 · Estado global tras guardar desde Hoy

3/11/2026,Europe/Madrid. Codex. Presentada para revisión independiente,sin autoaceptación. Cuatro archivos exactos reservados después de053/140done. No se modifica el gestor136,la ficha123 o fuentes del rescate.

## Problema reproducido y cambio

Con App anterior,guardar una tarea desde Hoy recargaba su cola,pero no el estado padre. Al pasar aTrabajar,el pie mostraba **0cambioslocales**,aunque GETv2/state devolvía changes:1. Se reprodujo en App real construida desde fuentes,servidorcreateBaseApp real y SQLite en memoria. Baseline `tests/.tmp/task151-baseline-cb5e8842-a81c-40cb-afc0-4643c859352a`:0/1,AssertionError del contador0frente1;servidor propioPID1708cerrado/ausente. No fue fallo de arranque ni selector vacío.

LocalOperations recibe onRecordSaved deApp. Tras unPATCHconfirmado,primero espera la lectura del estado padre y después actualiza la cola. Un fallo de cualquiera conserva el acuse y permite reintentar solo las lecturas:elPATCH no se repite. Si la vista de Hoy ya se desmontó,no arranca una nueva lectura de cola después de actualizar el padre. El callback es opcional para sus consumidores aislados existentes.

App.refresh usa una referenciaReact de secuencia. Una respuesta anterior que llega tras iniciarse otra lectura rechaza sin aplicar su estado;el consumidor sabe que su actualización quedó sustituida. No se afirma que se cancele el transporte. Se corrige también la etiqueta singular «1cambiolocal».

## Evidencia final propia

Snapshot `tests/.tmp/task151-ab82dc5e-b177-41f0-9e69-929ccb87026a`. manifest.json registra fuentes congeladas y los tres specs añadidos de tareas;node-focal.log,typecheck.log,tasks-typecheck.log,browser-results.json,tasks13/results.json ytask151-result.json conservan resultados. Env mínimo,redexternabloqueada,fixtures nuevas/SQLite en memoria,Chromium1228 yservidoresloopback propios. No lectura de claves/bases previas ni cuentas.

-**150/150Node**,0fallos/omitidas/TODO:misma batería focal de búsqueda/API,contratos,auth-parent,operaciones,ficha123/QA130 e integraciones,ahora sobre App/LocalOperations151.
-Typecheckfocal App/main/suites/imports ylos specsdetareas limpio;no typecheckglobaldelcheckout.
-**11/11DOMdebúsqueda**(seis existentes más cincoidentidad145),0skip/flaky.
-**13/13DOMdetareas**:seis140 existentes,cuatro142 independientes y tres nuevos151.0skip/flaky. Son **24casosDOM distintos** en dos ejecuciones del mismo árbol congelado,no suma de reintentos. Vite compila App en carpetas aisladas de cada arnés.

Los tres nuevos151 verifican:

1.Guardar enHoy,confirmarAPIchanges1,cerrar yabrirTrabajar sinreload:pie1cambiolocal.
2.PATCHreal confirmado,503 solo en la lectura padre **después** del acuse,acuse conservado ycola marcada pendiente;reintentar lee estado+cola,un únicoPATCHdetarea ypie1. El fallo no se arma durante la comprobación previa,para no confundir no_enviado con guardado confirmado.
3.Se retiene la respuesta de estado posterior al guardado con changes1. Otra edición explícita decontacto en el backendproduce changes2;el evento existente deestadoauth provoca una lectura nueva deApp. Se espera su respuesta antes de soltar la antigua. La respuesta vieja se rechaza,elacuse permanece yelpie muestra2 con la fila decontacto actualizada. Hay unPATCHdetarea yotroPATCHdecontacto decontrol,no un reenvío de la tarea. La sesiónficticia sigue abierta:no se prueba caducidad de sesión.

PIDsdelos tres nuevos casos20476,24816,8224cerrados y observadosausentes. Searchfixtureycuatro142tienen sus registros de cierre propios;los seis140conservan su afterEach declose,sin atribuirles la comprobación extra dePID. Se cierran documentos propios antes de apagar donde el arnés lo prevé. No se reinician demos.

## Sensibilidad y compatibilidad del arnés

Dos mutaciones únicamente privadas,con reconstrucción del frontend ydatos nuevos para cada una:

-Retirar awaitonRecordSaved vuelve a dar contador0frente1;el caso nuevo falla por expect del pie.
-Retirar la guarda de secuencia hace que la actualización vieja se acepte yla ficha anuncie colaactualizada en lugar de rechazar su actualización sustituida;falla la aserción del caso de orden. No se afirma haber ejecutado después de ese fallo la aserción posterior del pie2.

Ambos son fallos de aserción esperados,0infraestructura/importación/timeouts del proceso. Las fuentes privadas se restauran yrecotejan;no se suman al24DOMverde ni son fallos pendientes del producto.

El arnésauth-parent solo simulaba useState/useEffect/useCallback. La nueva referenciaReact produjo4fallospreaserción por useRefausente en elmock. Se reservó152para añadir exclusivamente ese hook,con sus23asserts textualmente idénticos;su banco pasa4/4 dentrodel150. No se cambia el producto para acomodar elmock. Detalles en CODEX-AUTH-HARNESS-152.md. La versión antigua delmock ysu error se conservan.

Se corrigió antes del pase final el patrón de texto del caso nuevo para admitir singular/plural,ya que «locales?» no admite «local». El nuevo oráculo sigue exigiendo exactamente1;el mutante sincallback prueba de nuevo el fallo0frente1 con ese patrón final. No se relaja el número ni se ignora un error real.

## Límites y siguiente paso

LosDOMusan App real como interfaz ybackenddepruebascreateBaseApp,no main.ts comercial ni una instalación actualizada. Son datos ficticios en la máquina actual. El150/24no acredita npmtestglobal,otrosnavegadores,lector de pantalla,CAS,multiproceso,persistencia del gestor136 o accesoHubSpot. Los404/401/503 se inducen en escenarios concretos,no se afirma consola universal vacía.

El control de orden protege la aplicación del estado leído por App.refresh;no versiona las escrituraslegacy ni resuelve D7. Una lectura sustituida se informa como actualización no completada para su consumidor,con reintento de lectura. No se deshace unPATCH confirmado.

151/152requieren revisión ajena antes de actualizar la preview. El corte previo145/053aceptado se conserva como historia;el hash actual deApp está gobernado por151. No se reacepta un hash antiguo. Sinrootbuild/dist,dependencias nuevas,worktree,commit/push,proveedores,credenciales odespliegue. Preview144aún no creada;4591no reiniciada por esta unidad.
