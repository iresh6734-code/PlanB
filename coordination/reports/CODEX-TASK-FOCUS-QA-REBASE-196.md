# Reconciliación de QA130 · unidad196

## R2 · huella de la ficha aceptada en 219

Tras la aceptación de 219 R2, la huella de la ficha cambia a `2faeeb337c84c336014e62a6b1ffa894849dc30c345f40473916ca729e119030`. Se preservó la primera presentación y se congelaron 268 rutas en `tests/.tmp/qa196-r2-AWiA9x`, a partir de 222 y las seis fuentes aceptadas de 219. Las rutas de producto se cotejaron por hash. La estrategia 233 queda fuera de este corte.

Las siete pruebas funcionales de Node pasaron antes de tocar la huella. La octava falló exclusivamente por `LocalTaskFocus.tsx`. El mismo spec de QA130 pasó 19/19 en Chromium con servidor de loopback, SQLite en memoria y tipos focales limpios. Es el arnés de la ficha sin `outcomes`. La cobertura de reapertura en la App corresponde a 219 y su dictamen 228.

Se actualizaron solo el SHA de la ficha y el título de la comprobación de huella. El resultado final fue 8/8 Node. Una modificación de comentario en la ficha congelada hizo fallar únicamente la comprobación de bytes. Se restauró la fuente y se cotejaron de nuevo las 268 rutas. Solo difiere la prueba Node, con SHA-256 `53e4ceb4e8b393fa69d2837293a38c69efd87390b2d6422defc5df9ab6431867`. Se conservan las otras tres huellas, las aserciones funcionales y el spec de navegador. Los 19 casos de navegador se repitieron sobre el producto final antes de modificar esa comprobación de metadatos.

Evidencia en la raíz de la copia con `manifest.json`, `node-old-pin.log`, `dom.log`, `types.log`, `node-final.log`, `pin-negative.log` y `pin-result.json`. El pin del panel sigue el encargo 220 y su coordinación con 233. Se vuelve a presentar esta reserva para revisión independiente.

## Entrega anterior · huella U1 R2

4/11/2026, Europe/Madrid. Presentada para revisión independiente. Cuatro rutasreservadas,tresmodificadas:testNode130,informe yh andoff196;specDOM130reservado pero intacto. No se cambiaLocalTaskFocus,cliente123,gestor136/170,App,U2,APIoestilos.

## Problema ysecuencia

Elpin de130seguía apuntando aLocalTaskFocus123R2aefb63…despuésdeaceptarseU1R2ac480c…. Elpendiente estaba expresamente divulgado en170y190. No se actualizó solo para obtenerverde.

Corte `tests/.tmp/q196-d90596e5/s`:se repitieron las8Nodeoriginales,**7pasan/1fallaexclusivamenteporhuella delcomponente**. Las7comprobacionesdecomportamiento no se editaron. Se repitió después elspecDOMoriginal:**19/19**,sinrelajaraserciones,retry,skip,TODOniflake. Tiposfocales0. Solodespuésdeesa evidencia seactualizaron lahuella delcomponente,comentarios yeltítulo de lapruebaNodeparaidentificarU1R2actual.

Resultadofinal:**8/8Node ytipos0** sobrela pruebaactualizada. EldiffdeltestNode está acotado aatribución/título/1valorSHA;las7aserciones decomportamiento,otras3huellas yspecDOMse conservan. Elmanifestfinalregistra elnuevohash deltest,elmanifestanterior y `task-focus-followup.before196.test.ts` conservanla pruebaantigua.

## Corte de fuentes comprobado

- LocalTaskFocusU1R2aceptadaac480c5f48ca7229276cc7c259157a239275eeeb3db404d1958402684eda2449.
- Cliente123535177583a1defa3cecac416d6bd75fc887c5c16e35b83d06eaff3f8b10bf510,lógica40332326d058dfd5c30e3d45e41e03b32c3a6a59f2e13b79228670ca4032479d yCSScdbe8147c813be8bb57d2332d84ea4a0d4bd161b371aede30bd27391f84c1f26.
- Modelo136aceptado1007ac…delcorte189/185;controller136aceptadoc356d1aa00f4af7d11417acd6f47315b80c26009a5b665b581718dbcb235b050delarchivo `d7baseline153-f425f774-9c1c-489c-ad79-000cb69fa69c/frozen/src/task-save-outcome.ts`.
- Backend/shared185congelados yrestoUIproyección189/158. Origen yhashporarchivoenmanifest. No se tomaelcontroller170enedición,nocambia171ni supropietario.

La primeraubicacióncandidata `u170-base`se rechazó porhashantesdecongelar/ejecutar:src16df…ysharedda79…noeran136aceptados. Se localizó un archivoc356exacto,tambiénconfirmadoenelbaseline151. Elinforme170decíaquehabíareconstruidooriginales,peronoseasumióqueesacarpeta siguierasiendoinmutable. Noreconstrucciónaproximada,stubsocódigo noaceptadoparaqueelQAarrancara.

## Qué prueban los resultados

Node:lecturaporflujo1MiB,truncamientos/formatosilegibles,estado3500campos,401realfrenteacookietardía,concurrencialegacycon2PATCH/2historiales,envíosidénticos ycancelar≠deshacer. Ademásdeelpindefuentes.

DOM:19casosdelarnésHoyoriginal130,servidorFastify/Storeenmemoriareales eHTTPloopback conbarreras de petición/respuesta. Cubren bloqueo real ycookieSet-Cookietardía,sucancelaciónaldeshabilitar,401carga/lecturaauxiliar/PATCH/cola,respuestastardías,cierre/cambiodeID,avisodesalida enenvío,timeoutvirtual31s,seguir editando,relecturacola,observaciónD7,dospestañaslegacy,mismaIDenotracaptura,datetimeAuckland/LosÁngeles ycuerposinválidos/grandes.

**Alcance:**esunarnésmínimodeHoy,sin gestorpropoutcomes,no laApp171. Lascontrapruebaslegacyconfirmanqueambosguardadosconcurrentespuedenconfirmar ycrear2filas;D7sigueobservacionalabiertoenese fallback.19verdesno se reinterpretancomoseguimientopersistente,CAS,idempotenciaoterminarD7enApp. La garantía185deotroendpointnofueadoptadaporesa ficha.

## Sensibilidad e integridad

Tras8Nodeverdes,se añadióuncomentario únicamenteaLocalTaskFocus delacopia privada yse ejecutóelpincaso:**0/1porAssertionError**contralahuellaac480c…. Semánticamenteno cambia elcomponente:estademostración solo acredita que elcontrolfija bytesexactos,no sensibilidadfuncional aundefecto. Fuente restaurada ytodoelmanifestfinal cotejado.

ElspecDOMesidénticoantes/despuésylasfuentesdeproductonocambian;no se repiten19DOMtrasactualizarsoloelpindeltestNode. Losresultados19siguenperteneciendoalpasoconeltestNodeaúnantiguo,pero sobre exactamenteesemismoproducto/spec;se declaranasí,nonuevapasadafinalinventada.

## Entorno yprocesos

Chromiumheadlessshell1228propio,sinperfil. Entornolistapermitida/NODE_ENVtest;elhelper130heredaúnicamenteeseentornodelrunner. RedexternabloqueadaenNode y rutasChromium,puertosefímeros,semillasnuevas ySQLiteenmemoria. No se necesitanclavesDPAPIodiscointegrado,nosecargancredenciales/cuentas/configuraciónajena. Lascontraseñasycookiesdepruebas401sonficticias,novaloresdeusuario,nose guardaneninformes.

Preload deauditoría propio registra spawn/close de los19server.mtsdelbanco,sinmodificarelspec.38eventos,19hijosconclose/19PIDausentesalcierre enprocess-audit.json. Elarrestillotrascada caso elimina routesretenidasantesdepararservidores;no se tocaronprocesos193/181oajenos. BrowserCLItermina0;no se atribuyemonitorizaciónpermanente.

Scripts `qa196-verify.cjs`(snapshot/tipos/Nodebaseline/19DOM),`qa196-finalize.cjs`(precondición19verdes,Node8/tipos/pinnegativo/restore/audit),`qa196-audit-preload.cjs` en tests/.tmp. `result.json`,`final-result.json`,logs,manifests ypruebaoriginalpreservados. Loopback/procesosconpermisodeentorno;sininstalar dependencias,npmtest,rootbuild/disto nuevaUI.

## Pendientes ycoordinación

170working devueltapor195F1reentrante;no se aceptapor estarepetición y196excluye ese código.171espera170done.197nuevoencargoproductodelotroCodexrespeta196. QA136rescate/HubSpotdeClaudeBsiguenbajosusrutas,193/4596aceptada sepreserva. Noreescrituralosinformes130históricos,nopush/commit/worktree/despliegue,proveedorrealoequipocorporativo4331/4334.196conservareservasdurante reviewynoseautoacepta.
