# Pasaporte 214 R3 aceptado

Pasan los quince casos de la autora y las tres reproducciones independientes anteriores sin cambiar sus aserciones. Los tipos focales están limpios. Se cotejaron las siete huellas presentadas. La misma sonda de contrato usa toPassportRecord de 216 R2. Un ensayo ficticio completado con alcance explícito cierra la práctica ficticia y conserva visible que la copia activa no se ha probado. Los dos controles anteriores verifican caducidad y que un alcance desconocido no cierre el paso.

La evidencia está en tests/.tmp/relay238-28b20bf5. La prueba combina los servicios de copia y lectura en memoria y un resultado sintético que pasa por el adaptador de relevo. Las siete pruebas DOM de la autora quedan atribuidas a su informe. La aceptación corresponde al modelo y a su componente. La disponibilidad del ejecutor y el montaje en la App siguen pendientes. 216 R2 conserva su revisión mientras se corrige 224.

---

# Pasaporte 214 R2 devuelto para R3

R2 corrige las dos regresiones anteriores. Se repitieron 14 pruebas del autor y las dos sondas R1 sin modificaciones. Los tipos focales están limpios. Las siete huellas del pasaporte coinciden con la entrega. Se conserva la repetición en tests/.tmp/p214r2-06800563. Los siete casos DOM de R2 quedan atribuidos a la autora.

El recorrido propuesto para Continuidad se queda en un paso que nunca puede resolver. Tras exportar, el pasaporte pide «Ensayar un relevo con datos ficticios» porque carece de un ensayo ligado a la captura. El adaptador que va a montar el recorrido produce captureId null por diseño. Completar correctamente el ensayo deja «Ensayar un relevo con datos ficticios» como el mismo siguiente paso. Cualquier repetición del mismo recorrido conserva ese estado.

La prueba combinada usa la copia y la observación de las APIs reales en memoria con proveedor ficticio. Utiliza recordFromRehearsal y toPassportRecord de la entrega 216 preservada, con un resultado sintético de Kit completado. El pasaporte sí reconoce que el ensayo no acredita la copia activa. La aserción sobre el paso pendiente falla con start-rehearsal antes y después. No se arrancó un Kit ni se montó la App para esta sonda. El resultado de contrato explica qué ocurriría al combinar los dos módulos conforme a sus handoffs.

Conserva la incertidumbre sobre la recuperación de la copia activa. Distingue esa carencia de haber practicado el recorrido ficticio. La recomendación principal de ensayo ficticio debe poder satisfacerse con un resultado de ese alcance. Un ensayo importado de alcance desconocido o uno fallido requiere su propia evaluación. Este ajuste de coordinación afecta al producto de R3 y al montaje de 223. No se solicita ejecutar el Kit sobre la copia activa.

**Pasaporte 214 devuelto para R2**

Se cotejaron las siete huellas presentadas. Pasan los 11 casos Node del autor y los siete recorridos de Chromium. Los tipos focales del componente, suites y sondas propias están limpios. Dos reproducciones adicionales fallan por las aserciones descritas.

**F1 · La vigencia se conserva después del vencimiento de la observación**

La sonda obtiene la copia desde registerContinuityEvidenceApi y una comprobación positiva desde la API212 aceptada. El proveedor es un callback ficticio, sin red. La respuesta cumple su parser y es vigente en el instante inicial. Se genera el pasaporte con esa observación y después se vuelve a generar 16 minutos más tarde, pasado freshUntil. La afirmación sigue con currency current. La fecha observada se conserva, pero la actualidad procede solo del booleano view.fresh de la respuesta anterior. El reloj now del pasaporte se utiliza para generatedAt y no revalida esa ventana.

El consumidor puede conservar una respuesta leída antes del vencimiento. La hoja generada después debe distinguir esa observación histórica del acceso actual. La acción siguiente también debe responder a su vigencia efectiva. Una comprobación en curso y una comprobación caducada son estados diferentes.

**F2 · Un ensayo sin captura identificada satisface la carencia de la copia actual**

La sonda toma una copia real del servicio, una lectura positiva válida y un registro de exportación declarado con la misma forma que usa la prueba del autor. El control positivo asocia el ensayo completado a la captura exacta y nextStep queda vacío. Se cambia solo relay.captureId a null. nextStep sigue vacío, aunque la condición que justifica omitir el ensayo dice que existe uno completado para esta copia. No hay identificación que permita establecer ese vínculo.

Un ensayo sin captura puede describirse con su alcance y procedencia conocidos. Su falta de vínculo debe permanecer visible y no puede cerrar por sí sola una carencia definida para la copia actual.

Las sondas se conservan en tests/.tmp/p223-e7fa8be5/s/tests/independent-passport223.test.ts. El origen de copia y lectura se obtiene mediante Fastify inject sobre módulos concretos, SQLite en memoria y proveedor ficticio. Solo el registro de exportación se construye como entrada declarada. Ambos fallos son de valor esperado, sin errores de módulos ni de tipos. Constan en independent.log e independent-result.json.

La primera pasada Node dio 10/11 por React no definido al renderizar en servidor. Al corte de pruebas le faltaba tsconfig.json y tsx usó otra transformación de JSX. Se conservó node-initial.log, se copió el tsconfig real y la suite pasó 11/11. El DOM ya había pasado con JSX automático explícito. La configuración adicional se registra por huella en runtime-tsconfig.json. Ninguna de las siete fuentes del autor fue modificada.

La revisión del pasaporte sigue limitada a su modelo y componente. Su consumidor en la App continúa pendiente. Los mutantes que comunica el autor quedan atribuidos a su informe. El encargo R2 reserva las mismas siete rutas y mantiene los demás montajes bajo sus respectivos propietarios.
