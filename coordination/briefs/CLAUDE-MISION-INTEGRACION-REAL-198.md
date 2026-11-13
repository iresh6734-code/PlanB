# Misión extensa · de comprobaciones aisladas a Integraciones y Continuidad utilizables

Continúa el frente de conexiones y relevo con trabajo de producto sostenido. Quiero una experiencia usable dentro de la App: comprobar explícitamente el acceso,entender evidencia por objeto,conservar su procedencia yconsultar un pasaporte de continuidad. La misión no acaba al presentar otra función aislada o su informe.

Lee este encargo completo,AGENTS.md,CLAUDE.md,COORDINACION.md,CONTEXTO-PROYECTO.md yel tablón. Revisa el estado vivo antes de decidir qué dependencia falta;no te quedes esperando una aceptación que ya existe.

## Estado y fronteras actuales

- CLAUDE-HS-READ-160está done,como módulo que necesita transporte acotado.
- **CLAUDE-HS-READ-CLI-173R2ya está done por178**. Codex repitió33pruebas/tipos yverificó los cinco hashes. La fase3puede empezar con nuevas reservas;no esperes otra aceptación de173.
- CLAUDE-RESCUE-KIT-116R4está done. QA136R2está presentada enreview yla revisa el otroCodex. No la modifiques después desubmit ni dupliques esa revisión.
- El otroClaude lleva170/171yel trabajo de197sobre guardado/conflictos. App.tsx,LocalOperations,LocalTaskFocus ygestor están fuera de tu frente.
- Codex196reconcilia QA130.193/4596es copia nueva de ensayo conbúsqueda189ybackend185,sin esos montajes futuros.
- server/v2.ts yshared/operations.ts siguen reservados087;Store/Recoverypor055. Coordina su registro central conCodex;no lo edites ni creesotroStore/Continuityparalelo para evitar esa reserva.

Retoma solo reservas propias o contraspaso explícito. Cada paquete nuevo necesita tarea conIDlibre,archivos exactos,claim/check-path ydependencias que reflejen su código. No sustituyas tareas bloqueadas por otra que robe sus rutas. Lasrutasnuevas propuestas abajo estaban libres alpreparar198:recompruébalas antes de reclamar.

## Paquete1 · servicioAPI preparado para el montaje central

Registra una unidad propia para:
- server/hubspot-read-check-api.ts
- tests/hubspot-read-check-api.test.ts
- contrato específico nuevo si hace falta yse reserva expresamente
- informe yhandoff propios.

Reutiliza checkHubspotRead yguardedReadFetchaceptados. Diseña un instalador de rutas condependencias inyectadas:lectura de configuración/versión,fetch de proveedor yalmacenamiento de resultados según el contrato acordado. No copiescredenciales alestado público,logs,errores oevidencias. No vuelvas a implementar el transporte oelcifrado.

Usa el recorrido de connection/read-checkacordado,sin inventar otra familia de APIoatajo porlegacy. Un GETconsultará solamente evidencia ya guardada yjamás hará llamadas alproveedor. Una acción POSTexplícita podrá iniciar la comprobaciónconlos controles de sesión/origen existentes yel portal autorizado. El montaje en la factoría principal se entrega aCodex en una unidadexacta separada.

Garantías:
1. Configuración ausente:resultado útil,sin peticiones externas.
2. Una comprobación encurso por configuración;doble clic/segunda pestaña no duplican las cinco lecturas.
3. Evidencia ligada a versión de configuración yportal. Cambiarcredencial oportal invalida laanterior. Un resultado tardío no confirma la configuración nueva.
4. Señal/cancelación/tiempos/límite de memoria,identidad primero,objetos después;se mantiene máximo5GETsin reintentos/paginación/redirecciones/escrituras.
5. Sesión bloqueada,credencial rechazada,permisos insuficientes yred caída mantienen significados distintos.
6. Errores yrespuestas públicas por lista blanca;sin secretos,URLs internas,headers ocuerpos de fichas.

Prueba el módulo registrado contra createBaseApp/Store reales yun proveedor ficticio loopback. Captura peticiones reales delproveedor ficticio,estado ycontrol de duplicación. Prueba cambio de configuración durante respuesta retenida,bloqueo,timeout,límite exacto/exceso,identidad distinta,403parcial ycaducidad. Un arnés conel módulo registrado no acredita aún el montaje principal:decláralo yprepara elhandoff concreto.

Presenta elpaquete para revisión. Mientras se revisa oCodexmonta elregistro,implementa el paquete3independiente;no detengas todo el frente.

## Paquete2 · lectura comprobable en Integraciones

Tras contratoAPIaceptado,montaje central disponible yreserva exacta,trabaja en LocalIntegrationsysuproyección/cliente específico/CSSypruebas. Conserva las cargas independientes actuales:un endpoint caído no borra lo que saben losotros.

La persona ve portal/configuración actual,última comprobación yestados porclientes,empresas,oportunidades ytareas. Una acción explícita explica lascincolecturas propuestas yque no escribe. Abrir/recargar pantalla no consulta alproveedor. Los estados cargando/fallo/sinconfiguración son útiles ypermiten la accióncorrecta.

Conserva «configuración guardada» frente a«lectura comprobada». Un éxito parcial no se anuncia como conexión completa;el periodo15minespolítica de actualidad,no garantía futura. Al caducar,se conserva laobservación fechada yse vuelve a acceso actual sincomprobar. Ningúnestado antiguo reaparece como éxito tras cambiarcuenta/credencial osesión.

Google conserva suestado realmente conocido. Un enlace alespacio de equipo no es pruebaOAuth;no fabriquesconectores por añadircinco filas verdes.

Demuestra el recorrido conlaAppreal yproveedor simulado:botón→consentimiento explícito→resultado porobjeto→fallo parcial→caducidad→nueva configuración→respuesta antigua descartada. Servidor,DOM1440/390/320,teclado ycapturas finales abiertas. Mantén fuera Appyotrosarchivosreservados;si elmontaje exige uno,pasa elcambio preciso aCodexycontinúa un bloque independiente.

## Paquete3 · pasaporte de continuidad codificable en paralelo

Puedes implementarlo mientrasAPIoQA136están enreview,porque será un modelo/componente conentradas explícitas,sin modificar susfuentes. Registra una unidadnueva conestasrutas propuestas:
- shared/continuity-passport.ts
- src/ContinuityPassport.tsx
- src/continuity-passport.css
- tests/continuity-passport.test.ts
- tests/e2e/continuity-passport.spec.ts
- informe yhandoff propios.

Elpasaporte contesta:qué copia hay,dequé fuente/cuenta procede,cuándo se capturó,qué lectura se comprobó,qué trabajo queda pendiente yqué recuperación se ensayó. Cada dato lleva origen/identidad/instante;ausencia esdesconocido,no cero. Consume contratos aceptados. Si elresumen deguardados delotroClaudeaúnnoexiste,muéstralo pendiente yacuerda su interfaz;no leas suestado privado oinventes contadores.

Presentación compacta dentrodelrecorrido existente,condetalleplegado ypróximo paso concreto. Sinotro menúprincipal,scoreglobal artificial ocontroles técnicosinnecesarios. ExportaciónHTML/JSONporlista blanca,sin fichascompletas,secretos oatribuciones inventadas. Separa observado,declarado ysincomprobar;ni cifrado ni lectura coincidente prueban autoría.

Pruebas:datos ausentes,caducados,fuentes de copias distintas,configuración modificada,revisión humana frente aacuse,recuentosdesconocidos,render seguro,textoslargos ymóvil. Elcomponente produce un resumen fiel;no inicia llamadas externas,capturas,reenvíos oexportaciones por montarse. Después demonta suuso real,conreservapropia;no dejes la misión enun componente sinconsumidor.

## Paquete4 · Kit de Relevo accesible desde el recorrido existente

EsperaQA136R2aceptada yregistra integración concreta. Reutiliza116;no reescribas cifrado,restoreBundleoelprotocolo de reclamos. Coordina montaje central sin pisarAppdelotroClaude.

Primer recorrido alcanzable:desde elpasaporte,ensayar relevo conficción enuna raíznueva. Exportar→inspeccionar sin escribir→aprobar elcontenido exacto→importar en destino nuevo→abrirlo→conciliar una operación incierta sin duplicar. Enseña qué datos se incluyeron yqué no:los intentos de tarea todavía solo enmemoria no pueden anunciarse incluidos por tenerun contador. No presentes elensayo como exportación automática de la copiaactual ocomo recuperación enotroordenador.

Prueba destino ya publicado,segundo propietario,cambio delcontenido inspeccionado,contraseña/formato inválidos,reinicio e incertidumbre conservada. No borrar elorigen ni destinosajenos,rehabilitarfallos niaprobaciones heredadas. Fallos traspublicación no producenéxitofalso niotro destino.

## Llamada real y forma de avanzar

Este encargo NO autoriza todavía HubSpotreal. Faltan elIDnumérico delportal de ensayo propio yautorización humana deesas cincoGET. La credencial la introduce elusuario en suterminal,nunca enchat.12345esfixture. No busques claves/instalaciones/cuentas corporativas. Un proveedor nuevo oproducción requiere sualcance específico.

Esa espera solo afecta laprimerallamada externa:API,contratos,pantallas,pasaporte ypruebas ficticias pueden avanzar. Tras revisar elcódigo,presenta unaúnica ordenconcreta para la comprobación autorizada. No repitas la solicituddeportalcomo sustituto deldesarrollo pendiente.

Entrega paquetes completos conhashes,comandos,evidenciafinal,regresionescausalesútiles,capturasinspeccionadas yprocesos propioscerrados. Presenta sinautoaceptar;siempre conserva review. Continúa bloquesindependientesconreserva mientrasesperas;si todosdependen realmente deun dictamen,explica exactamentecuál,sin fabricarejecuciónpermanente.

Elguion deproducto objetivo es:Integraciones→configuración visible→comprobación explícita→resultadohonesto→pasaporte→ensayo de relevo inspeccionado. Todo desdeinterfaz,sin editarJSON. Solo se anunciarállamadaHubSpotrealcuando se ejecuteautorizada;solose anunciará copiarecuperable cuando se hayaprobado esecaso. No nuevosproveedores,dependencias,worktrees,commits,deploysoreinicios dedemosajenas.
