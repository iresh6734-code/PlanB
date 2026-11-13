# CONNECTION065 · Revisión de conexión ligada al portal y sin repetición accidental

30/10/2026, Europe/Madrid. Codex. **11/11 unitarias, 5/5 E2E finales, typecheck y Vite correctos. Tres casos seleccionados fallan causalmente con el componente anterior.** Cambio de interfaz probado con respuestas ficticias; ninguna conexión real o instalación modificada.

## Problema y cambio

ConnectionDialog permitía editar datos mientras una inspección seguía en vuelo, no descartaba las respuestas después de cerrar y tenía únicamente estado React para evitar repetir el submit. Además, si el POST de guardado tenía éxito pero la actualización de pantalla fallaba, el formulario seguía ofreciendo guardar sin distinguir los dos resultados. El servidor ya vuelve a comprobar el portal al guardar: **no se ha demostrado un bypass de esa comprobación**, ni se modifica ese control.

La interfaz ahora limita a una petición activa mediante referencia síncrona, bloquea entradas durante inspección/guardado y liga la inspección a una versión del contexto. Se descartan éxito/error tardíos al cerrar/desmontar, aun si el transporte ignora abort. Volver a revisar conexión invalida inspección y campos seleccionados; no se conserva una lista de campos revisada para otra configuración.

La respuesta de inspección se valida: ID, modo y tipo de cuenta deben coincidir; deben existir los cuatro esquemas, sin claves duplicadas, con campos de formato admisible. Una respuesta incompleta/incoherente no habilita guardar. Los campos personalizados se limitan a sesenta por entidad, como el contrato del backend; también un handler antiguo no puede superar el límite. La confirmación se reinicia al cambiar el modo. No se cambia la política de autorización del servidor o la clasificación real de datos.

El guardado requiere confirmación explícita saved:true. Tras esa confirmación se retiran token/selecciones del formulario y se pasa a estado guardado. Si falla done/actualización, se informa que el guardado ya ocurrió y se ofrece reintentar **solo la actualización**, sin repetir el POST. Una referencia de guardado también rechaza un submit antiguo retenido del formulario anterior. No se afirma borrado criptográfico de memoria JavaScript: se retira el valor del estado/formulario y no se persiste por el cliente.

Una respuesta de guardado ambigua o fallida no se declara éxito y permite una decisión posterior del usuario. Cerrar/abortar el navegador no garantiza que una inspección o guardado ya recibido por el servidor deje de procesarse: la protección nueva evita efectos tardíos en este diálogo, no es un rollback remoto. El servidor conserva su comprobación al guardar y la captura sigue siendo un paso separado.

## Pruebas unitarias y sensibilidad

tests/connection-dialog.test.ts transpila el componente real con ranuras de hooks controladas y transporte diferido que ignora cancelación. No es React DOM ni un lector de pantalla. **11/11**, sin skipped/TODO, sobre el componente congelado mediante PLANB_CONNECTION_SRC. Casos: doble submit y edición bloqueada; respuesta de otro portal/modo/tipo o esquema incompleto; cierre y error tardío; reexaminar contexto; payload revisado; guardado correcto con refresh fallido; acknowledgment inválido; límite sesenta incluso con handler antiguo; claves duplicadas; confirmación por modo y validación local.

Baseline anterior exacto guardado antes de editar en tests/.tmp/connection065-original.tsx. Tres casos propios seleccionados contra esa fuente: **0/3**, aserciones causales, sin skipped/TODO. Inicia dos peticiones en vez de una; escribe estado después de cerrar; y vuelve a mostrar «Guardar conexión» con el error de refresh en vez de distinguir el guardado correcto. Logs tests/.tmp/connection065-baseline.log y connection065-unit.log. No se mutan fuentes compartidas ni se cuentan esos fallos esperados como tests verdes del producto.

## Cinco recorridos de navegador

Main/server.mjs compilado idéntico al baseline HISTORY064, frontend nuevo con estos cambios. Fixture nueva y contraseña local sintética, origen127.0.0.1:4403. **Todos los POST /api/v2/connection e /inspect se interceptan**, con ID/token inventados y respuestas declaradas. Cada caso comprueba por GET real de continuity que no existe conexión guardada en el backend; cero pageerror y cero tráfico fuera del origen. No se utilizan claves, sesiones o cuentas del usuario, ni se comprueba HubSpot real.

1. Inspección retenida: entradas44px deshabilitadas y dos submits programáticos adicionales no duplican la petición. Se elige un campo y el cuerpo de guardado conserva ID/modo/confirmación/selección revisados. Guardado simulado, conexión real del fixture aún null.
2. Respuesta válida retenida con fetch que ignora señal: cerrar, volver a abrir diálogo vacío y liberar/consumir la respuesta antigua no sustituye o reabre la revisión.
3. POST guardado exitoso simulado y GET refresh503: muestra «Conexión guardada», no queda input de contraseña, reintentar solo repite lecturas y el contador de POST sigue en uno.
4. Respuesta de otro portal se rechaza; cambio a modo producción retira confirmación y deshabilita comprobar hasta nueva confirmación. No se conecta un portal de producción.
5. Sesenta campos seleccionados de61; el siguiente queda deshabilitado, Space desmarca uno y vuelve a habilitarlo. Revisión visible y sin overflow a1440/390/320; portal y encabezado de alcance dentro del viewport al volver al inicio. Volver a credenciales retira la inspección.

**5/5 finales,8.2s, sin skipped/flaky.** Snapshot tests/.tmp/connection065-ce45b535-2c43-4aae-b863-7810905c8098: unit.log, typecheck.log, vite.log, browser.log y manifest.json con hashes de cuatro overlays y23 artefactos. Los bundles backend son idénticos al baseline; no se recompila o repite Node162 por una vista frontend.

Evidencias visuales/JSON: C:/Users/iresh/.codex/visualizations/2026/10/29/01a1896e-06ff-7690-9644-4f6de90c2826/connection065/connection065-ce45b535-2c43-4aae-b863-7810905c8098/. results.json y connection065-1440.png/390/320. Capturas desktop y320 inspeccionadas: portal/tipo/alcance visibles; listas de campos con desplazamiento propio y contenedor exterior utilizable, sin recorte artificial a200px.

Preparación reproducible conservada en tests/.tmp/prepare-connection065.cjs y ejecutor connection065-browser.cjs. Node y navegador con entorno permitido del SO, block-external, perfil temporal propio de Chromium de caché y un trabajador. Browser plugin no disponible: flujo Playwright del repositorio. Los límites del arnés no equivalen a un sandbox hermético del sistema operativo.

## Incidencias propias y corrección visual

Primera corrida f09b641d dio3/5: dos localizadores getByLabel exactos incluían el texto envolvente del select. Se usan sus nombres accesibles nativos vía getByRole y se agregan aserciones44px/teclado. La segunda,21c12ef6, dio5/5; inspección visual posterior detectó que la regla global de fieldset aplicaba max-height200px también al contenedor exterior, dificultando ver la identidad revisada. Se corrige solo CSS propio: exterior sin ese límite, listas internas260px con scroll. Se añaden aserciones de viewport para portal y encabezado. La corrida final ce45b535 es posterior a esa corrección, con nueva revisión de capturas. Logs y resultados anteriores separados, sin relajar las expectativas.

## Alcance y pendientes

Cinco archivos exactos de CONNECTION065; solo ConnectionDialog, CSS propio, dos tests e informe. No backend/ConnectionSchema, permisos, API, Modal, fuentes Claude o tareas en review modificadas. El guardado real del servidor continúa verificando credencial/portal/mode/esquema; los E2E interceptados no constituyen evidencia de ese conector o de una cuenta externa.

El esquema cliente admite hasta5000 campos por entidad, etiquetas hasta1000 caracteres y claves compatibles con el contrato de selección. Una respuesta fuera de esos límites se rechaza como incompatible, sin habilitar guardar. No se afirma rendimiento de miles de checkboxes, auditoría completa de permisos, lector de pantalla real u otro motor.

Sin dependencia nueva, build/dist raíz, proveedor, cuenta real, instalación, publicación, commit/push o autoaceptación. Fuentes para revisión independiente. QA056 sigue su auditoría acotada; esta unidad no extiende sus reservas o acepta sus resultados parciales.

## Hashes de fuentes/pruebas cotejados

- src/ConnectionDialog.tsx: 20bf47c334a9b58a86fe9e8dab46708848fd46c67e1ccc4ec56cf3049e5422ed
- src/connection-dialog.css: 1cb9b9b798338fba641d28f7d885b14ed533db4e3ba1c61f7d6a912c05a56a1c
- tests/connection-dialog.test.ts: 3da082286a8e7ed1651d96b461cf820703ed104ecd7db2720f0423e44093ec93
- tests/e2e/connection-dialog.spec.ts: 7d1a98fb48ced1b5a8a83af246b6312a7522218d71bd056ca717050b9e2f64b5

Hash del informe registrado por submit.
