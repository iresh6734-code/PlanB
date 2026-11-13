# HubSpot160 y CLI173 · revisión independiente178

4/11/2026, Europe/Madrid. Codex revisor independiente del autor. **Dictamen vigente R2: favorable para173sobre los cinco hashes nuevos indicados al final; F1 resuelto.** Módulo CLAUDE-HS-READ-160ya aceptado dentro de su alcance aislado. Se conserva a continuación la primera devolución como historia. No confundir ese módulo con CODEX-TASK-REVISION-MOUNT-160, otro flujo.

No se ha llamado a HubSpot ni leído una credencial real, fichero de entorno, base instalada o perfil. No se conoce aquí el portal de ensayo autorizado y no se ha recibido autorización para las cinco lecturas. Publicar un script o aceptar su código no concede esa autorización.

## F1 · P2 · el transporte confirma una representación que él mismo truncó

`server/hubspot-read-check-transport.ts:30` corta el cuerpo al superar64KiB y devuelve ese prefijo como respuesta200. El comentario presupone que un prefijo estricto de un JSON nunca es JSON válido; no es cierto si contiene un valor completo seguido de espacios. Además `scripts/hubspot-read-check.ts:70` no excluye respuestas truncadas al decidir confirmado.

Dos regresiones independientes, sin red y con fetch totalmente sustituido:

- **Identidad:** respuesta sintética `JSON.stringify({portalId:12345,accountType:'DEVELOPER_TEST'}).padEnd(65536,' ') + 'INVALID_TRAILING_BYTES'`. El documento recibido completo es inválido. El transporte descarta el sufijo, el módulo valida el prefijo y hace las cuatro lecturas de objetos. CLI devuelve exit0/resultado confirmado y respuestasTruncadas1.
- **Objeto:** misma construcción con `{results:[]}` en contacts. La identidad y otros objetos son normales. Se confirma el acceso a los cuatro objetos aunque contacts se truncó: nuevamente exit0, confirmado, respuestasTruncadas1.

El control de cinco documentos completos pasa. Las dos regresiones fallan por0frente1 en el código de salida, no por infraestructura: `tests/.tmp/review178-independent.log`. No se afirma que HubSpot produzca este cuerpo en la práctica; se demuestra un defecto del contrato local de respuesta inválida/truncada, prometido y probado incompletamente en173.

**Corrección solicitada dentro de las cinco rutas reservadas por173:** al superar el límite, cancelar/descartar y rechazar la representación completa; no entregar un prefijo al parser como documento completo. La identidad incompleta debe detener la secuencia antes de leer objetos. Un objeto incompleto no cuenta como readable; los demás estados deben seguir siendo honestos. Añadir regresiones con prefijo completo+espacios y controlar el límite exacto. Solo añadir `stats.truncated===0` al titular final no resuelve las cuatro lecturas posteriores a una identidad truncada. Conservar ausencia de reintentos/escrituras y máximo5GET. Actualizar el comentario y el runbook para describir el comportamiento real.

Los tres casos persistidos propios están en `tests/independent-hubspot-read.test.ts`; no son caracterizaciones que se deban invertir para dar por buena la entrega actual. Expresan el comportamiento requerido y deberán pasar con la corrección. No editar ese archivo del revisor desde Claude: puede ejecutar sus pruebas y añadir las propias bajo173.

## Dictamen del módulo160 y límite de montaje

La revisión estática y14pruebas repetidas acreditan su alcance: petición de identidad, comparación de portal y entorno, parada por identidad/tipo incompatibles, cuatro lecturas mínimas, estados parciales/rechazo/red/timeout, cancelación, caducidad y ausencia de secretos en resultados. Reutiliza readonlyFetch y no monta rutas ni UI. La doc pública respalda las rutas utilizadas y los valores accountType.

El módulo **no tiene límite de bytes propio**: usa `response.json()`. Es una limitación ya declarada, no una garantía cumplida por160. Se acepta como unidad aislada con esa limitación explícita; su incorporación a una ruta/App debe usar un transporte con límite validado o una unidad nueva que incorpore ese límite al módulo. Esta aceptación no avala usarlo directamente con fetch sin límite en un flujo de producto. El transporte173 aún no satisface ese requisito por F1, de modo que no queda validado el ciclo de ejecución real.

## Comprobaciones del revisor

- **26/26** en una pasada del autor repetida:14módulo160+12CLI173. Servidores ficticios loopback y fetch sintético; subprocess con red externa bloqueada. `tests/.tmp/review178-author.log`.
- **1/3** propios: un control correcto y dos regresiones F1 reproducidas. No se suma como29verdes.
- **Typecheck focal:0 errores**, sobre shared/módulo/transporte/script y test independiente, ES2023/DOM/Bundler/strict.
- **10/10 hashes presentados coinciden**, cinco por unidad, antes del dictamen. Listado íntegro `tests/.tmp/review178-submitted.json`. No se editaron esas diez rutas.

```powershell
$env:NODE_ENV='test'
node --import tsx --test tests/hubspot-read-check.test.ts tests/hubspot-read-check-cli.test.ts
node --import tsx --test tests/independent-hubspot-read.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2023 --lib ES2023,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node shared/hubspot-read-check.ts server/hubspot-read-check.ts server/hubspot-read-check-transport.ts scripts/hubspot-read-check.ts tests/independent-hubspot-read.test.ts
```

Las pruebas HTTP se ejecutaron con permiso de loopback; los casos independientes no necesitan red. No se repitieron mutantes del autor ni tsc global/npmtest; no hay navegador o proveedores en esta unidad.

## Documentación contrastada

- [HubSpot: detalles de cuenta](https://developers.hubspot.com/docs/api-reference/latest/account/account-information/get-account-details): GET account-info/2026-09/details, portalId y accountType STANDARD/DEVELOPER_TEST/SANDBOX/APP_DEVELOPER.
- [HubSpot: contactos](https://developers.hubspot.com/docs/api-reference/latest/crm/objects/contacts/guide): GET crm/objects/2026-09/contacts y limit.
- [HubSpot: tareas](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/tasks/guide): GET crm/objects/2026-09/tasks, limit y properties.

Se consultaron páginas públicas, sin ejecutar sus ejemplos ni hacer solicitudes a api.hubapi.com. La consulta inicial de una ruta antigua de cuenta falló; las URLlatest que cita el autor sí se abrieron y contrastaron. Documentación no equivale a respuesta real de una cuenta.

## Observación del runbook y siguientes pasos

El ejemplo PowerShell de173 crea un BSTR mediante SecureStringToBSTR sin conservar/liberar su puntero. Al corregir el runbook conviene conservarlo y liberarlo con ZeroFreeBSTR en finally, y limpiar referencias aun si falla el comando. Eso no permite prometer borrado de todas las copias de un string gestionado. No se ejecutó ese ejemplo ni se solicitó un secreto al usuario.

Codex devuelve173 bajo su reserva para F1 y conserva los hashes de160 aceptados. Antes de una primera comprobación real faltan:173corregida/aceptada, ID numérico del portal de ensayo propio y autorización humana expresa para esa cuenta y esas cinco lecturas. La credencial la introduce el usuario en su terminal, nunca en el chat. No ejecutar llamadas para descubrir qué portal tiene una credencial desconocida.

Las revisiones de rescate116R4/175 y ciclo177 siguen a cargo del otro Codex, sin edición compartida. U1tareas está working por174 y no se mezcla con este flujo HubSpot.

## R2 · Corrección comprobada y aceptación

La autora presentó cinco hashes nuevos. El transporte ya no devuelve el prefijo: tanto un Content-Length declarado superior como superar el límite durante el flujo cancelan la lectura del origen y entregan un cuerpo ilegible, que el módulo clasifica como malformed. La identidad detiene la secuencia y un objeto incompleto no cuenta como readable. El CLI añade la guarda redundante truncated===0. Exactamente64KiB continúa siendo admisible.

Se revisaron el código y el runbook corregidos. Este último libera el BSTR en finally y explica las copias gestionadas que no puede prometer borrar; no se ejecutó ese ejemplo con credencial. El módulo160mantiene su limitación propia de bytes: debe consumirse con el transporte protegido validado o con otra unidad que añada ese límite.

**Repetición de este revisor sobre R2:33/33 en una pasada**,14módulo+16CLI/transporte+3independientes178. Las dos regresiones antes rojas pasan sin cambiar una sola aserción ni archivo independiente. Log `tests/.tmp/review178-r2.log`. Tipo focal del módulo/transporte/script/testautor/testindependiente, junto al foco189revisado en paralelo:0errores. No se repitieron las tres pasadas ni los cuatro mutantes declarados por la autora, ni tsc global/npmtest.

Las pruebas fueron sintéticas con fetch sustituido o servidor loopback propio y subproceso con red externa bloqueada. No hubo acceso a HubSpot ni lectura de secretos reales. El formulario de autorización/portal continúa pendiente: esta aceptación solo valida el código y el runbook, no autoriza cincoGETreales ni los ejecuta.

Cinco hashes cotejados antes de la decisión:

| Ruta | SHA-256 |
| --- | --- |
| scripts/hubspot-read-check.ts | c5531d8ecd95b2c14a61bc05c551fe1eef94b0555a9d445e5e04c09db26063df |
| server/hubspot-read-check-transport.ts | b4dfbf40c7b441061d474d91990f60d72e7a424d6f8120bf60ed09b601bb86ee |
| tests/hubspot-read-check-cli.test.ts | e918360f1a603c5057427f56e2db6da27a780bb201487a881c59cced377134c9 |
| coordination/plans/HUBSPOT-LECTURA-REAL-172.md | 3ef3653c389edf534609b8e987df0d9436f62bcd0123e116b4a6d78ff29a6bec |
| coordination/reports/CLAUDE-HS-READ-CLI-172.md | 41e2ca46c4e7c9a624c9111ab45a68a8926d912cc67635e62648c024994e7f47 |

**Decisión:aceptar173R2.** La fase de servicio/API/pantalla del plan190puede registrarse en rutas nuevas/libres;no autoriza tomar087/055oAppdelotroClaude. Al cerrar este corte,U1ya estádone,170working,116done yQA136working;las menciones diferentes del primer dictamen describen aquel corte. No se cambiaron las rutas del autor,190aceptada ni demos.
