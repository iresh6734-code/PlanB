# Búsqueda por teclado189

4/11/2026, Europe/Madrid. Presentada para revisión independiente. Seis reservas exactas; producto acotado a `src/WorkspaceSearch.tsx` y `src/workspace-search.css`,más helper,pruebaE2E,informe yh andoff propios. No se edita el montaje deClaude,App oAPI.

## Cambio visible

Buscar conCtrl+K,escribir y pulsar↓enfoca el primer resultado.↑desde elcampo llevaalúltimo;entre filas↑/↓recorren la página,Inicio/Fin sus extremos y↑desde la primera permite volver a editar. Enter usa el botón nativo yla selección existente porID/revisión;Escape/Tabseconservan. Se añade una indicación breve y foco contrastado con los tokens deltema.

Elhandlerusa los resultados de la clave actual,respeta carga/apertura,teclas modificadas y composición. No guarda un índice niun registroseleccionado que pueda sobrevivir aotra búsqueda. CampoInicio/Fin no se secuestra. No se añadeestadoReact,peticiones,escrituras,dependencias o API de aperturaalternativa.

## Entorno y evidencia

Flujo de prueba:Appreal→Ctrl+Kdesdecontrolenfocado→búsqueda→navegarfilas→Enter→fichadelIDpedido;otroscasos cambianpágina/filtro/consulta oretienenrespuesta. Proyección congeladaUI158aceptada conbackend/shared185aceptados yoverlay de189. Manifiesto de cada archivo conserva origen yhash;App/LocalOperations/LocalTaskFocusde158permanecen intactos. Fuentesactuales170,U2,173,QA136yLAB036no se editaron/integraron. No se usó eldist delcheckout o rootbuild.

CorteFINAL `tests/.tmp/k189-final-689dc83e`,fuente `s`,puntero `tests/.tmp/keyboard189-final-latest.json`. `typecheck.log`, `vite-build.log`, `dom.log`, `dom.json`,evidence yprocess-audit. Chromiumpropio de caché1228,sinperfil delusuario;Browser plugin not available y elnamespacePlaywrightdelconector ya no estaba disponible en esta sesión. Se usó elCLIdePlaywright existente para elbanco repetible,sin instalar dependencias.

Servidorpropio PID19240,puerto60505,instancia `97de1e4b-05c6-49c5-aedc-6260ead8e540`,endpoint/healthcoincidentes. Carpeta/base/clavekindtest/semilla nuevas:24contactosmarcados Teclado189 yuna empresa,entre62registrosficticios/18tareas. Entornolistapermitida/NODE_ENVtest/preloadredexternabloqueada. Estasidentidades son de una prueba terminada,no una appque siga disponible. Helper cierra su hijo enfinally yelcaso afterAll;no utiliza sesiones delusuario.

## Resultados

**6/6E2E finales**,sinretry,skipoflaky,tiposfocales0yVitebuildcorrecto:

| Recorrido | Evidencia |
| --- | --- |
| Flechas,Inicio/Fin yretornoalcampo | FocoDOMreal en losbotones/campo esperados;Homeeninputdeja caret0 |
| Enterentrehomónimos | Abrecontact-2con GETsearch-record porID/revisión,correoficticiocoincidente |
| Paginación/filtro |20→5de25,IDsdepáginasseparados,empresas1resultadoactual |
| Respuestaretenida/edición | Durantecarga no hayfilaactivable,Enter0aperturas;IMEsynthetic/Control+↓no consumidos |
| Fuenteajena alabrir | Respuestaconotra cuenta rechazada,diálogopermanece/sinficha falsa |
| Teclado/móvil |1440/390/320sinoverflow,filas≥44px,focovisible,Tab/ShiftTab/Escape conservados |

Todosloscasoscomprueban0pageerror/0consolewarning-error/0externas/0escriturasdelnavegador e historialCRM0. APIdeconsulta yselección sigue soloGET. No se editóningún registroalfinal deEnter:abrirlafichanoesguardar.

Capturas `evidence/keyboard189-1440.png`,390y320;1440y320abiertaseinspeccionadas. Modal yfilas legibles,IDshomónimos separados,outline/fondo visibles,sin recorteosolapes observados. Nosignificaauditoríadecontrastecertificada,lectordepantalla,zoom200%,navegadoresmóvilesfísicos oIMEreal.

**28/28Node relacionados verdes** enelcorte `k189-final-eebbe1ae`:búsqueda/API/identidad/independientes143/contexto. No se repitieron después de corregirúnicamentelasprecondiciones de la pruebaE2E:elrunnercotejó todosloshashesexcepto ese specE2E ydocumentó `node-search-focal-prior/notRepeated`. Producto,helpersyfuentesdelas28sonidénticosalcortefinal. No afirmar28ejecutadasotra vezen689dc83e. No se repitiósuiteglobalonpmtest.

Buildemiteadvertenciasconocidas de tamaño dechunk ydosanotacionesdeZod retiradasporRollup;buildtermina0. No se confunden con consola de navegador,queestá limpia. No se cambió lainfraestructura de empaquetado para ocultarlas.

## Baseline e incidencias preservadas

Contrapruebacomponenteanterior: `k189-baseline-17ac3114`,con el specfinal deprecondicionescorregidas yWorkspaceSearch/CSSanteriores preservados. **0/1**,por `toBeFocused` tras↓:20botones ya renderizados,primero inactivo. Tipos/builddeesecorteverdes,sinfallodeinfraestructura. No se aflojó la expectativa paraobtenerverde. Baselineanterior `k189-baseline-d5cce07f`tambiénfallóporlamismacausa yquedapreservado.

Primerfinal `k189-final-eebbe1ae`:4/6E2E,peseaque28Node/tipos/buildpasaban. Dosprecondiciones deltestincorrectas:Ctrl+Kseabriódesdebodyperoseesperabarestaurarbotónnoenfocado;ybuscarcompany-1sinfiltrar también encuentrareferenciasenotrosregistros(6resultadosreales). Se corrigió eltestenfocando explícitamente elcontrolprevioyfiltrandoempresas antesdelaretención. Nocambiosdeproductoparaesosdosfallos;contrapruebarepetidaconprecondicionesfinalessiguerroja en↓.

Primerapreparacióndelarnés:no arrancóViteporque susubrutaCLI noestáexportada pararequire.resolve. Se corrigió a larutadelCLIyainstalado;unintento deeseajusteencomandoshelltuvoerror decomillas sinmodificararchivo. Usadoarchivo paraajuste final. Noatribuirningunadeesasincidenciasalcódigo delbuscador.

`process-audit.json`cotejó6hijospropios conclose/SIGTERMyPIDausente:6332/14080(baselines),15280/2544/14572(primerfinalconreiniciodeworkertrasfallos),19240(finalverde). No se mató otroproceso,181o161. Hashesdelasfuentescongeladas y4rutasdecódigo/test189coincidenalcierre.

## Entrega y siguientes pasos

Scripts `keyboard189-verify.cjs baseline` preservacódigoanterior ycorreelcasocausal;`final --skip-node`corre6DOM/tipos/buildy reutiliza28Node solotrascotejarsuidentidad;`keyboard189-audit.cjs` verifica fuentes yprocesos. No se sobrescriben resultados anteriores.

189nomodifica181en4595(UI158legacy/backendanterior185),niseinstalaporelsubmit. Espera revisiónindependiente yuna unidadnueva para copia visible. ClaudeA170→U2 yClaudeB173/QA136delplan190 conservansusrutas. Handoffdetalla la integración delbuscador existente,sin menú omontajealternativo. Sinproveedores,credencialesreales,originalcorporativo4331/4334,worktrees,commit,push,despliegueoautoaceptación.
