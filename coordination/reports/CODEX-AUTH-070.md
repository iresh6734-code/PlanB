# CODEX-AUTH-070 · Protección local con petición única y acuse comprobado

30/10/2026, Europe/Madrid. Cinco archivos propios reservados; backendsecurity,App yfuentesClaude intactos. **Presentación para revisión**, sin autoaceptación o instalación.

## Resultado y alcance real

Setup/login excluyen un segundo submit síncronamente, también antes del render. Los campos y la cancelación quedan congelados durante el vuelo. Validación cliente de longitud/confirmación también ante envío programático; credenciales se retiran tras acuse válido. Setup requiere configured:true; login authenticated:true. Un200 con campo de otro modo, ausencia o false no invoca done. Errores401/429 conservan el formulario, editar limpia el error.

Cambios de modo, cancelación y desmontaje invalidan handlers/respuestas previas, incluidas A→B→A y transporte que ignore abort. No reapertura ni continuación antigua. Se aborta el cliente; no se afirma cancelar una operación ya recibida por el servidor.

Protection admite done asíncrono y conserva acuse si ese callback falla; Reintentar apertura repite solo done, no POST. **Esa capacidad aún no cubre el refresco del padre real**, que conserva setAuth(open);void refresh() en App.tsx. No se presenta como corregido ese recorrido; AUTH_PARENT072 es una nueva unidadreadypendiente de liberar la reservaSEARCH053sobreApp. No se toma esa reserva ni se autoacepta SEARCH053para avanzar.

## Pendiente parental reproducido por esta sesión

Además de revisión estática, se creó un servidor nuevo4409 y copia compilada propia con base/contraseña ficticias. Se importó/activó un fixture, bloqueó la app desde su botón y realizó login real. Solo el GETstate posterior se respondió503. Resultado observado:Protection se desmonta, aparece el estado previo retenido y ocurre pageerror PARENT072_FIXTURE_REFRESH_FAILED por la promesa descartada. La sesión sí está autenticada en backend; **no es un bypass de autenticación demostrado**, es un fallo de secuencia/carga y rechazo no atendido.

Diagnóstico separado:1caso que reproduce el fallo conocido, no garantía de producto ni séptimoE2Everde de cierre. Evidencia C:\Users\iresh\.codex\visualizations\2026\10\29\01a1896e-06ff-7690-9644-4f6de90c2826\auth070\auth070-e805786f-856d-4ba2-bba2-96bcc0b5e500\parent-observation/observation.json; knownUnfixedParent=true,protectionUnmountedBeforeSuccessfulRefresh=true. Prueba conservada enparent-observation.spec.ts yrunnerauth070-parent-observe.cjs bajoelsnapshot;Appintacto. Reproducción concreta alimenta aceptación deAUTH_PARENT072.

## Verificación propia

-11/11unitarias con hooks/transportecontrolados,0fail/skip/TODO. NoequivalenaDOM, se complementanconnavegador.
-4regresionesidénticascontraProtectionanterior:0/4causal. Setup/login envían2vs1;respuesta trasdesmontaje escribeestado5vs4;handlercapturadotrascancelarenviaba1vs0. Sin mutar fuentes compartidas.
-1/1regresión existente v2 sesión local protege datos/revoca cookies/limita intentos. Backend sin cambios.
-Typecheck yVitecorrectos en snapshotfijo; todoslosartefactosbackendidénticosporhashalbaselineTEAM069. No recompilarservidorsinnecesidad.
-6/6E2E,8.2s,Chromiumheadlesscaché propio: setup realconconfirmaciónydoblesubmit,loginincorrectoycorrecto real,ackmalformado,429mock,replyloginválidoretenidonativoignorandoabort trasdesmontaje porrecomprobacióndelpadre,teclado/Entery1440/390/320concontroles44pxysinoverflow. Capturas1440/320inspeccionadas. URLfixtures4408y4409, no perfiles delusuario. Browser plugin not available;Playwrightexistente.

El caso de replytardío usa autenticación localreal:set-cookie ya se recibió;elpadreconsulta/auth/statusyabretraslecturaválidaantesdeliberarcuerpodelPOST. Al liberarlo,no hay unsegundocallbackniGETstateadicional. No se atribuye al abortnativo, que se ignoró solo enesa petición.

## Procedencia y comandos

Snapshot:D:\AI\Plan-B-CRM-v2.1\source\tests\.tmp\auth070-e805786f-856d-4ba2-bba2-96bcc0b5e500

Evidencia:C:\Users\iresh\.codex\visualizations\2026\10\29\01a1896e-06ff-7690-9644-4f6de90c2826\auth070\auth070-e805786f-856d-4ba2-bba2-96bcc0b5e500

BaselineTEAM069finalcon23artefactos;se copian solo fuenteseinventario de artefactos, sinbases/keys/.env/.ai.local.json. Cuatrooverlayspropios.

    node --require ./scripts/block-external.cjs --import tsx --test tests/protection-ui.test.ts
    node tests/.tmp/prepare-auth070.cjs
    node tests/.tmp/auth070-browser.cjs
    node tests/.tmp/auth070-prove.cjs
    node tests/.tmp/auth070-parent-prepare.cjs
    node tests/.tmp/auth070-parent-observe.cjs

Logs unit/auth-regression/typecheck/vite/baseline yJSONPlaywright preservados. El runner usa lista permitida OS ybloqueador de red; no es un sandbox hermético. Las respuestasfalsas429/ack son simulaciones; authsetup/login ycookie del resto ejercitanbackendlocalreal. Toda contraseña es inventada para estefixture; no credenciales deusuario/proveedor.

## Límites

PendienteAUTH_PARENT072descrito; no cambiarbackendAuth,plazos,cifrado,rolesoservicios. No lector de pantalla/Edge/instalación4331-4334,cuentasexternas,dependencia,build/dist raíz,deploy,commitopush. No borrado criptográfico de stringsJavaScript. La continuidad y el envíoCLI aClaude no se amplían;QA073esbrief localpreparado, no ejecuciónacreditada.

## Hashes de cuatro archivos probados

| Ruta | SHA-256 |
|---|---|
| src/Protection.tsx | `5ca43eb27ca20890aa3ad5157f83159cff401aa34111168e0890e1beb190ca91` |
| src/protection.css | `1fba6d899ccad510b6790f189bf4a0a2f54031051e4c705aaa55571a5bd2cbe4` |
| tests/protection-ui.test.ts | `0bc59f172573edac980f8f03ba3ac2aa7d55986c1e3070a9d8e291c350052884` |
| tests/e2e/protection-review.spec.ts | `c710cd6812d6080e50e8da8dc516d343458d9a7c0cdf14bb0dd84e1efcbe5d6a` |

El informe se sella al presentar. Reservas mantenidas durante revisión.
