# Causa de cobertura del trabajo local308

9 de noviembre de 2026, Europe/Madrid. Entrega Codex para revisión independiente. Responde a F1 de CLAUDE-WORK-SUMMARY-QA, revisada y aceptada en307. No modifica el destino pendiente de recuperaciónA4.

## Resultado de producto

Una lectura correcta sin cobertura conserva status:read, cobertura:none y recuentosnull. Pasaporte y mapa explican «El cuaderno no cubre esta copia: se desconoce…(no es cero)» en vez de atribuir un fallo de lectura. Una lectura realmente indisponible conserva unavailable y su explicación de fallo. Los estados de fuente externos prevalecen sobre metadatos antiguos.

PassportWorkSummary incorpora coverage opcional: los productores anteriores sin ese campo mantienen su comportamiento. No se deduce cobertura a partir de null ni cero. El contexto sigue procediendo del ámbito de la respuesta; el mapa no usa una lectura de otra copia. El carrier interno aporta la cobertura, no modifica el esquema HTTP WorkSummary ni activa covers. Las exportaciones del pasaporte y mapa usan la misma causa que su presentación. Se conservan recuentos y cuarentena con cobertura parcial/completa.

## Seis rutas reservadas

- `shared/work-summary.ts`: `c9c7d44e5c1d65ab6b8d49fbe33beec487fd1fe083562bee3d68b49d97c9ba98`
- `shared/continuity-passport.ts`: `66d645f3a684bd79b9648459c0bbd90eb7579bd17afb11d2098d2369d0d4676b`
- `shared/impact-map.ts`: `e1bedac43bb1203cb390fccb1be57a0805c3e90dce18096281716db7bb8d99f7`
- `tests/work-summary.test.ts`: `cc69679af6c68ef0c319654e1df9994fd8a0ecff4f686efa4507787158427405`
- `tests/work-summary-coverage-context.test.ts`: `b1bc5380f55617ef7be6751801ceba9fc70f69bc4e6528b976adf2b11b68da9c`
- Este informe; hash registrado al presentar.

La prueba existente work-summary.test.ts cambia una expectativa del adaptador: uncovered ahora es read/none/null. Mantiene los casos unavailable/noScope y todos los checks de esquema, ámbito, exportación y cancelación. Es un cambio deliberado de la proyección interna que eliminaba la causa, no una relajación del contrato público. Los otros tests de pasaporte y mapa y los diez E2E de Claude se mantienen byte a byte.

## Evidencia técnica y funcional

Archivo previo: coverage308-before-ZyGhBq con cuatro fuentes y manifiesto. Primer banco coverage308-HYCM0q congela fuentes de307y solo sustituye las rutas308. Pasan las43pruebas existentes de resumen/pasaporte/mapa y los10E2E originales de QA con App compilada; no retries/skips. Del total50Node falló un caso nuevo por mayúscula en la expectativa del mensaje. La sonda privada de App falló al consultar Watch.writes inexistente y tipos lo detectó. Son errores del banco propio; resultados originales conservados.

Se corrigieron únicamente esas comprobaciones: regex de fallo sin sensibilidad a mayúsculas y conteo de métodos desde Watch.requests. No se cambió producto para corregir el banco. coverage308-replay-OvV0Ua repite las7pruebas nuevas y la sonda de App;7/7Node,1/1navegador y tipos focales0. No se repitieron las43previas y10E2E ya verdes porque sus fuentes y el producto son idénticos entre bancos.

Las mismas7aserciones corregidas contra las fuentes anteriores pasan3yfallan4: proyección de cobertura, identidad de otra copia, metadato de cobertura y exportación de causa. Contra la corrección pasan7. La sonda de App también falla con el código anterior, mostrando literalmente «No se pudo leer el cuaderno…», y pasa con el nuevo. La sonda privada deriva del prefijo de arnés de la QA existente y no cambia sus diez casos.

Recorrido probado: App normal de ensayo → Continuidad → una lectura GET de resumen con pin igual a evidencia → tarjeta/pasaporte/mapa con recuentos desconocidos y causa sin cobertura → apertura del grupo del mapa → capturas390. Cero métodos distintos deGET durante la observación, sin solicitudes externas ni errores de página; la QA filtra el mensaje genérico Failed to load resource de fallos HTTP esperados, por lo que no se promete consola sin ningún mensaje. Se abrieron cause-map390.png y cause-passport390.png. Los diez casos existentes cubren1440/390/320, teclado, errores, exportaciones,401, reinicio/copia y transportes que ignoran cancelación.

El binario normal del servidor conserva d0330c98… de307; la interfaz compilada cambia de hash por la presentación. Main/App/lector283 y el callback covers:false permanecen idénticos al corte. La variante lectora de QA solo comprueba el consumidor con fixtures208 y no acredita cobertura de escrituraA4. Browser plugin not available: Playwright y Chromium de caché existentes, perfiles propios, SQLite ficticia y puertos efímeros. No npm run build ni dist raíz.

## Límites y siguiente paso

No lector de pantalla, Edge/Firefox/Safari ni piloto de proveedor. No se actualizó la demo4601: sigue Jornada299 según la última comprobación. No hay despliegue ni autoaceptación. El coordinador debe revisar estas seis huellas; después puede incorporar los módulos aceptados a una candidata junto al resto de puertas. HISTORY-UI debe fijar el pasaporte214 aceptado mientras esta ruta esté en revisión, o esperar la aceptación308; se avisó al coordinador.
