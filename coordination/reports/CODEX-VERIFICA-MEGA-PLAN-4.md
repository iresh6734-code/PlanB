# Mega Plan 4 · Lectura, entrega y cierre

24/11/2026 · Europe/Madrid · Implementación sobre `733f23e`.

## Resultado en el servidor

- **Lectura.** El servidor registra el inicio antes de consultar HubSpot. El estado final, la captura, la rotación, el acta y el expediente se escriben en la misma transacción. Así, un fallo de guardado deja intacto el trabajo previo y permite repetir la lectura. Los estados antiguos que quedaron a medias se muestran como interrumpidos con un mensaje que pide revisar la última captura.
- **Entrega.** La ruta de migración guarda la equivalencia y su huella en el expediente. El paquete reutiliza el informe exacto que selecciona el operador después de revisarlo. Cuando incluye también el parte, comprueba que sea el mismo que cita la equivalencia. Si la vigilancia avanzó o la selección quedó desfasada, pide rehacer la comparación. El almacén conserva el último informe publicable del encargo.
- **Comprobación del comprador.** El comprobador distingue una huella interna de una referencia externa y proporciona al visor solo documentos validados. Un paquete mal formado devuelve errores por elemento. Un paquete completo rehecho con una huella nueva sigue siendo detectable cuando el comprador conserva la huella anterior.
- **Cierre.** El expediente ofrece un alcance agregado y su huella. Confirmar con esa huella impide aplicar el cierre a un alcance que cambió. El servidor borra las filas cuyo propietario inmediato es el encargo, coteja el recuento y guarda el acta con el eslabón final. La transacción cubre tanto el borrado como el acta. El comprobador reconoce también las actas anteriores.

## Prueba integrada

El mismo encargo de prueba pasa por captura de firma, lectura semanal retenida, aceptación, migración, inclusión de la equivalencia en el paquete y cierre. Se contrastan las huellas con el script y con una referencia externa. Se provoca un fallo al guardar el eslabón de equivalencia, otro al actualizar el resultado de una lectura y otro al insertar el acta. Se verifica la reversión y se vuelve a abrir SQLite para comprobar la conservación del estado correcto. Otro encargo conserva sus datos, incluido un registro cuyo sufijo contiene el identificador de la operación cerrada.

Batería de Verifica y rutas de cliente, 134 pruebas correctas. Los 16 casos focales volvieron a pasar con la comprobación de reapertura del acta y la validación de sus recuentos. TypeScript y el inventario de 119 rutas pasaron.

## Contrato comunicado a Claude

- `GET /api/verifica/engagements/:id/expediente` aporta `latestEquivalence` y `closureScope`.
- `POST /api/verifica/engagements/:id/package` acepta `equivalence: { fingerprint, reviewed: true }`. Una selección desfasada devuelve `409`.
- `POST /api/verifica/engagements/:id/close` acepta `scopeFingerprint` además del nombre. Un cambio de alcance devuelve `409`. El acta contiene `terminalEntry` y `scopeFingerprint`.
- `verifyPackage` acepta una huella de referencia y devuelve `reference` y `documents`. `verifyClosureRecord` comprueba el acta y su eslabón cuando existe.

La ampliación usa las rutas que ya estaban registradas. Claude tiene el contrato para adaptar el visor, la selección de equivalencia y la confirmación del alcance en las pantallas existentes. El cierre desde la pantalla anterior conserva su confirmación por nombre durante esa integración.
