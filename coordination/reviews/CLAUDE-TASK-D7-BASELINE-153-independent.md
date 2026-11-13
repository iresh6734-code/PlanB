# Revisión independiente154 · línea base D7 de Claude153

## Dictamen vigente R2 · 4/11/2026, Europe/Madrid

**Aceptar153 con su corrección documental.** El informe ahora identifica0613 como App con151 incluida,yB315 como la versión previa que no se ensayó. Declara que la aceptación151 fue posterior a la congelación y que no ha repetido esta línea base sobre155/158. Los dos hashes nuevos coinciden con los archivos actuales. El test conserva exactamente su hash original `10e077c2be5e10c0788873d4fc833f574bacaec035ca68646ef52f3fe1c7010c`;solo cambió el informe.

No se repiten los seis recorridos porque no cambian código o aserciones. La prueba propia anterior6/6 y su control de sensibilidad siguen atribuidos al corte congelado151/backend del revisor;no al App actual158 o al U1 que Claude está adaptando. El apartado siguiente conserva el hallazgo documental ya corregido como historia. Esta aceptación no cierraD7 ni acepta U1/U2;cuando exista el montaje,las observaciones deben invertirse bajo una reserva nueva y contrastarse con la implementación real.

## Historial R1 · dictamen sustituido

3/11/2026, Europe/Madrid. **Observaciones funcionales confirmadas; devolver para una corrección documental acotada antes de aceptar153.** No se editaron sus dos archivos ni App/LocalOperations/LocalTaskFocus durante esta revisión. La corrección pedida no requiere repetir los seis recorridos si no cambian sus fuentes o aserciones.

Se cotejaron los dos hashes presentados. Se congeló la prueba153 y el corte probado151 (cliente y backend,207 archivos) en `tests/.tmp/d7review154-0074e878-9ec3-4551-ba8f-965cd6048e40`. **6/6 observaciones repetidas**,0fail/skip/flaky; typecheck focal limpio. Se confirmó la pérdida de seguimiento fuera de la ficha con acuse perdido, tras navegación, acuse posterior al cierre y fallo de recarga de cola; además390/320 sin desbordamiento documental. No son seis regresiones de una solución: pasan cuando D7 sigue abierto.

Se repitió un control de sensibilidad del autor en otra carpeta nueva: añadir únicamente un aviso simulado a Hoy hace fallar la primera observación por `mentions` no vacío (1 caso ejecutado,1 fallo esperado), sin error de infraestructura. No se repitieron las otras cinco mutaciones ni se probó el montaje U2, todavía inexistente. Captura320 inspeccionada: las tareas conservan su fila sin aviso visible en ese recorte. No es auditoría completa de accesibilidad.

El banco usa App real compilada con Vite y createBaseApp real,SQLite en memoria,datos ficticios,loopback efímero y red externa bloqueada. A diferencia de la ejecución declarada por Claude,se congeló también el backend. Se registraron siete procesos propios de servidor:15340,29660,28036,30560,1392,14888,5824; todos emitieron close y se comprobaron ausentes. Fuentes congeladas sin deriva al terminar. Browser plugin not available; Playwright CLI/Chromium propio,sin perfil del usuario,cuentas ni equipo original.

## Ajuste documental requerido

El informe153 identifica App con prefijo `0613d3a87f65c19f` y afirma que «151 aún no había modificado esos archivos». Ese hash es precisamente el App corregido y presentado por151. El App anterior conservado antes de151 tiene SHA-256 `b3152438de3e580feed1342022aa37a6881ac1843031fbec6fc99ef104ac2782`; el corregido es `0613d3a87f65c19fd63ac045668f6f94c0a61c540ada789979a7b4226d403aa1`. La repetición de este revisor utiliza el segundo y confirma D7 incluso con151. Corregir la atribución temporal: corte con cambios151 incluidos,con la aceptación de151 posterior al momento de congelación según corresponda. No presentar ese corte como anterior a la corrección del contador.

No hay otro defecto de producto validado en esta revisión. La observación usa una regex de términos de aviso y esperas temporales,de modo que no prueba la ausencia universal de cualquier mensaje o una garantía bajo toda latencia. Su uso es caracterizar este corte y luego invertir las aserciones cuando se monte el seguimiento real. La aceptación futura de153 no aceptará U1/U2 ni cerrará D7,persistencia,multipestaña,CAS o idempotencia.
