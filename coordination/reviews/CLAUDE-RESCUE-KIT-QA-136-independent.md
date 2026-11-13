# QA136 R2 · dictamen independiente favorable

4/11/2026, 22:55:31, Europe/Madrid. Se acepta **CLAUDE-RESCUE-KIT-QA-136 R2** sobre sus diez huellas actuales. La aceptación es de esta entrega de QA; no acredita un montaje nuevo en la App ni una recuperación en otro equipo. El dictamen anterior se conserva debajo como historia.

## Contraste propio de la corrección

Corte nuevo `tests/.tmp/q180-05970fa9`: **25/25 pruebas en una pasada serial**, sin omitir casos, y comprobación de tipos focal de las tres suites y su hijo sin errores. La prueba 8 retiene una importación real en un worker del mismo proceso, sin fakePid; exige que la otra instancia tenga owner distinto y rechace con ALREADY_IMPORTED. Comprueba bytes del reclamo, su contenido y huella completa del staging antes y después; luego libera el primer worker y comprueba su destino original, reclamo imported concordante y una única publicación. El cierre está en finally con esperas acotadas.

Se quitó únicamente `info.owner === INSTANCE` de ownStale, en la copia privada de R4. **La regresión 8 falla por AssertionError: «la segunda no debe importar»**, porque vuelve a importar. No fue un fallo de módulos, SQLite, plazo o infraestructura. Se restauró la fuente y se cotejó todo el manifiesto. Es una mutación causal de R4, no un baseline R2 completo. La matriz histórica inversa ya se comprobó en el primer dictamen180 y no se ha repetido aquí.

Las diez huellas de QA136 (incluida la ruta E2E ausente/null) y las 25 aceptadas de116 coincidieron antes y después. Informe QA SHA256 **95e74fd2616b9d5873fde41bc385e7d0054f1542e29c085ffaed7295eb5b87cf**; prueba claims **db898a592049fa4ce3aa9ccd4916551b6e51d0bab7477fd6223f9ee195518e70**; arnés **71397031dc788e6ef80763f3226242787cc4b701f8d370dbafa474566c3aa577**. Ninguna de esas fuentes fue editada por el revisor.

## Evidencia y límites

Informe, checkpoint y handoff ya distinguen R4 vigente de resultados R2 históricos, mismo PID/owner distinto y QA de la propia autora frente a revisión independiente. El checkpoint conserva arriba su corte fechado del 2/11 y añade la resolución R2 al final; su siguiente acción actual es esta revisión, no volver a corregir116. No se pide borrar la historia.

La autora informa dos pasadas simultáneas de25 y25 con señuelos intactos. **No se repitió aquí la orquestación paralela, ni DOM**, ya que esta corrección cambia la regresión y documentación y la interfaz de116 no ha cambiado. Las25 anteriores son repetición independiente de los mismos casos, no25 casos nuevos. Tampoco se repitieron todas las suites de116 ni las pruebas de otros revisores.

Raíces nuevas cortas, datos ficticios y claves kindtest precreadas al escribir el marcador propio del servicio; entorno permitido/test y bloqueo de red externa. El runner terminó0; el worker del caso8 se termina y espera en finally. No se instrumentaron individualmente todos los PID del arnés en esta repetición y no se afirma una auditoría de procesos que no se hizo. No HubSpot real, perfiles, recuperación DPAPI, servicios4331/4334, otra instalación, root build, despliegue o commit. Siguen fuera de cobertura disco lleno, corte de energía, enlaces simbólicos reales y exclusión entre equipos.

Evidencia: manifest.json, r2-serial25.log, r2-case8-owner-omitted.log, r2-typecheck.log y r2-result.json en el corte citado. El antiguo dictamen180 y brief se archivaron antes de revisarlos. Solo se modifican las dos rutas de180;180 queda presentada para revisión ajena, sin autoaceptación. La integración del Kit exige su nueva unidad y reservas exactas.

---

## Dictamen anterior · histórico, resuelto por R2

# QA de rescate136 · revisión independiente180

4/11/2026, Europe/Madrid. **DevolverQA136 para reconciliar la caracterización histórica y su documentación con116R4.** No se acepta por el hecho de que116estéaceptada. Las diez rutas deQA136 se mantienen reservadas;el revisor no las editó.

Se cotejaron las diez huellas presentadas (incluida la rutaDOM ausente/null) y las25de116R4aceptada. Esta revisión es independiente de la autora deQA136,que también es autora de116 según su propiohandoff;suQA ampliada no se presenta como revisión independiente del producto.

## Contraste actual

Snapshot `tests/.tmp/q180-662aa982`:**25pruebas originales repetidas sobreR4:24pasan,1falla**. La única roja es8«ARTEFACTO DEL MISMO PID»,que espera que una segunda instancia recupere el reclamo activo y cree otro destino. El producto actual rechaza esa segunda importación conALREADY_IMPORTED. Las24verdes incluyen los20ciclos de la carrera y los controles de captura/aislamiento;no son25verdes y no sustituyen la comprobación causal.

La expectativa del caso8era una caracterización explícita del defecto histórico. Su rojo actual es consistente con la correcciónowner introducida enR3/R4,no demuestra una nueva regresión de116. El informe y handoff todavía describen ese defecto como pendiente y116comoR2;deben conservar la historia y añadir un dictamen vigente.

## Prueba de sensibilidad propia

Únicamente en la copia privada se invirtió el caso8 para exigir rechazoALREADY_IMPORTED,conservar el destino de la primera y no publicar en la segunda. **1/1 pasa sobreR4**. La versión mínima privada no sustituye todos los requisitos de la nueva regresión pedida a la autora:debe además preservar bytes de reclamo/staging y comprobar el final exitoso del primerworker.

Con esa misma regresión privada se quitó solo `info.owner === INSTANCE` de la decisiónownStale,en la copiaR4. **0/1 porAssertionError**,porque la segunda importación vuelve a tener éxito. Al restaurar el caso histórico sin invertir y mantener elowneromitido,**1/1 de caracterización pasa**. Esto demuestra el sentido de ambas aserciones y evita invertir solo para obtener verde. Es una mutación causal deR4,no una reejecución de un binarioR2histórico completo.

Se restauraron las dos fuentes privadas y se cotejó todo el manifiesto al terminar. Las diez rutas deQA y las25deproducto siguieron idénticas a su presentación/aceptación. Typecheck focal de las tres suitesQA limpio. No se ejecutó orquestación de dos suites en paralelo oDOM en esta unidad;las cifras anteriores de la autora siguen atribuidas a sus cortes históricos.

Las pruebas usan raíces nuevas cortas,claveskindtest precreadas solo cuando el servicio escribe su marcador,NODE_ENVtest,redexternabloqueada y las Apps/procesos propios del arnés. No se accedió a otra instalación,proveedor o credencial. No se cambia crypto ni se descifran clavesDPAPI. Los archivos de evidencia no contienen valores de claves o cookies.

## Corrección requerida

El encargo completo está en `coordination/briefs/CLAUDE-RESCUE-QA-136-R2.md`. Dentro de la reservaQA136:

- Convertir8en una regresión vigente de mismoPID/owner distinto,sin fakePid. Conservar los bytes de reclamo/staging;segunda rechazada;al liberarprimera,un destino yclaimimportedpropio. Barreras y terminación enfinally con límites.
- Acreditar sensibilidad con un baseline exacto o la omisión deowner en una copia privada;distinguir ambas procedencias.
- Actualizar informe/checkpoint/handoff al estado116R4aceptado,manteniendo los resultadosR2/R3 y los fallos históricos como tales. No afirmar que faltaowner actualmente o que pruebas de otros revisores siguen rojas sin comprobar sus versiones.
- Repetir las25y tipos con hashes de producto/test actuales;declarar si se repite la orquestación paralela. No crear una pruebaDOMvacía ni ampliar a una integración sin otra reserva.

No se liberan archivos por lentitud,no se borran pruebas o evidencias para conseguirverde yno se aceptan garantías sobre escritores no cooperantes,otros equipos oautenticidad solo por unhash. QA136 debe volver a presentar y conservar susreservas hasta dictamen.180 se presenta para revisión ajena,sin autoaceptación.
