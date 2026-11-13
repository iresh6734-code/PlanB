# QA130 aplicable a U1R2 · traspaso196

## Corte vigente · ficha 219 R2

La comprobación de QA130 fija ahora `LocalTaskFocus.tsx` en `2faeeb337c84c336014e62a6b1ffa894849dc30c345f40473916ca729e119030`. La prueba anterior se conserva en la proyección `tests/.tmp/qa196-r2-AWiA9x`. Sobre 222 más 219 R2 aceptada se repitieron siete controles funcionales, 19 DOM y tipos focales. Después se actualizó la comprobación de identidad y pasaron los ocho casos Node. El control negativo altera un comentario en la copia y falla por la huella.

El arnés comprueba la ficha sin gestor. Para una actualización posterior del componente, repite ese alcance y sus garantías de comportamiento sobre una proyección de las fuentes que se vayan a servir. El pin de `TaskSaveOutcomes.tsx` pertenece a 220, que espera la reserva activa de 233. La entrega 196 no cambia el binario de la candidata 236.

## Traspaso histórico · ficha U1 R2

4/11/2026, Europe/Madrid. Reconciliación de un pendiente explícito de190/170;no cambio de producto. QA130 fijaba LocalTaskFocus123R2 `aefb63…`. La ficha U1R2aceptada es `ac480c…`,porloque elpin fallaba aunque sus pruebas funcionales siguieran correctas.

196repitió primero las8Nodeoriginales:7comportamiento verdes y1huellaroja,exclusivamente elcomponente. Después repitió19DOMoriginales sobreU1R2concliente/lógica123aceptados,gestor136aceptado ybackend185congelado.19/19sinmodificaraserciones. Soloentonces actualizó elhash delcomponente,título ycomentarios deatribución deltestNode;lasotras3huellas ylas7aserciones se conservan. Resultado final8/8Node/tipos0. ElspecDOM no cambió byte a byte.

Elgestor antiguo136c356… se tomó delarchivo congelado153que coincideconelhashaceptado,no deuna carpeta llamada«baseline»sinvalidarla. La carpeta u170-base actual ya no coincide conesehash;la guarda196larechazóantesdeejecutar. Modelo136compartido1007…tambiéncotejado. No se incluye170enreviewni la corrección nueva delcierre reentrante.

Esta QA prueba elarnésmínimodeHoy,sinpropoutcomes,enlaversiónfallbacklegacydeU1. Sus19verdes **no cierranD7enApp** ni adoptan166/183/185enelformulario. La observaciónD7y las contrapruebas deCAS/noidempotencia siguen pasando precisamente porque esos límites persisten enesafallback. La App171 ygestor170tienenbancos/revisionesseparados.

Para U2/contrato170,conservar losroles:estaunidad no certifica susnuevasgarantías. Si cambian alguna de las4fuentesfijadas,elpin deberá fallarhastaque se repita la QA pertinente bajo otra reserva. No cambiar hashes,retirar pruebas,añadirTODO o aflojaraserciones para silenciarlo.

ArchivoNode actual:pinfijoU1R2ac480c5f…;cliente53517758…;lógica40332326…;CSScdbe8147…. La prueba negativa196añade un comentario SOLOalcomponenteprivado ydemuestra que elpin vuelveafallar por bytesdistintos;se restaura. Eso es sensibilidaddeidentidad,no unamutacióndel comportamiento delproducto.

Evidenciaen `tests/.tmp/q196-d90596e5`:manifestanterior/final,baseline7/1,node-final8/0,dom-original19/0,tipos,pin-altered-source1rojo,process-audit19closed/ausentes. No se repitenDOM trasun cambio soloenmetadatos deltestNode;lasfuentesdeproducto yelspecDOM sonidénticos. La autoríaQA130 originaldeClaude123y sus informes antiguos se conservan,no se reescriben como si ya hubieranensayadoU1.
