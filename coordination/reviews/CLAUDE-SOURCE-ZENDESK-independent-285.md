# Revisión independiente285 · Zendesk R3 favorable

8/11/2026, Europe/Madrid. **Favorable para las seis huellas R3 de este corte.** F1/F2deR1yF3/F4deR2quedan corregidos. Se conservan debajo los dictámenes previos, sin aceptar huellas antiguas.

## Repetición propia de R3

Banco fijo `tests/.tmp/zendesk285-lSj6vV`: **29/29 de Claude**, **9/9 sondas originales** y **3/3 extras** pasan. Los doce casos propios son los mismos archivos usados contraR1/R2, sin alterar sus aserciones. Tipos focales de autor/originales y después también extras:0. Fuentes transitivas y seis huellas cotejadas antes/después; ningún parche experimental se aplicó a este corte.

La revisión estática confirma catch acotado a la invocación de fetch, sin convertir errores de creación/configuración en lecturas válidas. Rechazo síncrono/asíncrono queda clasificado sin mensaje privado. Después de credential se comprueban señal y plazo antes del contador y del fetch, incluyendo el tiempo consumido por ese callback. La puerta propia, limpieza y descartes tardíos deR2se conservan. Esos cambios están en transporte/pruebas/informe; normalización del proveedor y esquema neutro mantienen las huellasR2.

La lectura, paginación, identidad, límites, redirecciones, cobertura y proyección siguen cubiertas por el banco. No se repitieron los33mutantes declarados por Claude. La sensibilidad propia deR1/R2permanece en sus bancos históricos, no se presenta como una ejecución nueva del corteR3.

## Seis huellas R3 aceptables

| Archivo | SHA-256 |
| --- | --- |
| shared/source-reading.ts | 5e487a65916d2f3e7af5afb328235960acb4d51ab58da01f19ce8b241f34192a |
| server/source-read-transport.ts | 563ca82cd69edea1fdad006fbd79d830e8d6f468588e1dcd80f220b6909f5efc |
| shared/zendesk-source.ts | 2c4f88108d72b2a28a4be80b9cc1792032100a6cbc5e197c11c0074644dfc6db |
| server/zendesk-source.ts | 0a61a42d0f339bd2557b466ed6584902cb7b17ae81b3a67afac29a662d37c2fd |
| tests/zendesk-source.test.ts | 3801cdb81914847368006c86d0f897ab71468652cc2dd56fb699e764fbfbd9d2 |
| coordination/reports/CLAUDE-SOURCE-ZENDESK.md | 0f1b03287ffc26804cf04ff3b31e7fc8a4f9e2399a776b48c7c4618ab0d20db1 |

Aceptación de backend interno y ensayos ficticios/locales. No hay cuenta Zendesk, token real, lectura observada en proveedor, conexión mostrada, montajeApp/mainoactualización4601. Pipedrive puede iniciar su unidad reservada sobre esta dependencia aceptada; cualquier cambio al transporte común requiere otra reserva. El contrato de llegada a Integraciones/Radar se acuerda aparte. Este dictamen se presenta para revisión cruzada sin autoaceptación.

---

# Histórico de revisión285 · Zendesk R2 devuelta

8/11/2026, Europe/Madrid. **R2 corrige F1/F2 originales, pero requiere R3 por dos fronteras adicionales del transporte inyectable. No aceptada.** Se conserva debajo la evidencia históricaR1; sus huellas no sirven para aceptar R2.

## Repetición de R2

Banco nuevo `tests/.tmp/zendesk285-c7c2Sb`, creado con el mismo script de fijación: **27/27 de Claude y9/9 sondas propias originales pasan**, tipos focales0. Las seis huellas y las fuentes transitivas se cotejaron antes/después. No se ejecutó la corrección experimentalR1 sobre esta R2 ni se atribuyen30mutantes de Claude a una repetición propia.

El esquema ahora exige mismo objectType y objetivo/ID/rol coherentes. La puerta propia de parada resuelve cabeceras/cuerpo aunque fetch ignore signal, descarta respuestas tardías, clasifica aborto/timeout y limpia timer/listener. El informe distingue alcance documentado de permiso real, subdominio configurado de identidad observada y páginas completas de captura atómica. `tickets:read` está documentado, OAuth-only conserva su alcance.

## F3 · Excepción síncrona del fetch no se clasifica (bajo-medio, latente)

EnR2, la llamada `real(...)` está dentro de try/finally sin catch. Un fetch inyectado que **lanza antes de devolver una Promise** hace rechazar readTicket/readTickets con el error original. La prueba de rechazo asíncrono idéntico sí devuelve unavailable/network y no expone su mensaje.

Reproducción propia: `fetch: (()=>{throw Error('synthetic-private-message')}) as typeof fetch`. readTicket(7) rechaza con ese mensaje, en lugar de devolver SourceReading no disponible. Es una regresión respecto del catch que rodeaba awaitreal enR1. No demuestra una excepción síncrona de fetch nativo ni una filtración HTTP: el adaptador no está montado. Sí rompe su frontera inyectable y permite que la excepción privada llegue al llamador.

## F4 · Aborto durante credential pierde la puerta previa al despacho (bajo-medio, latente)

La señal se comprueba antes del callback credential. Si este callback cancela la señal y después devuelve una credencial sintética, R2 añade el listener **a una señal ya abortada**, que no vuelve a emitir el evento, e invoca fetch. La sonda registra calls1frente a0 esperado. El transporte simulado devuelve un ticket y puede terminar complete, aunque la cancelación ya había ocurrido antes de invocar fetch.

No es una llamada real a Zendesk ni una carrera concurrente durante un bloque síncrono: el callback local es el que aborta. La frontera debe revalidarse después de él y antes del despacho/contador de peticiones; no depende de conceder herramientas o permisos nuevos. Revisar también el presupuesto total tras ese callback. No se exige preemptar JavaScript síncrono arbitrario que no devuelve.

## Calibración adicional

`tests/.tmp/zendesk285-r2-extra.ts` y `extra-zendesk285.cjs`: tres sondas con fetch simulado, sin sockets. Control asíncrono pasa; síncrono y aborto en credential fallan conR2. Una corrección mínima privada (recomprobar señal/plazo antes de despacho y contener excepciones) hace pasar3/3. Se restauraron bytes y se cotejaron fuentes privadas/checkout; `extra-restored.json`. No se declara repetición de27+9sobre ese parche ni se entrega como código de producto.

El banco27+9no cambia por esos fallos adicionales; se registra cada resultado separado. No se modificaron las nueve sondas originales ni los seis archivos Claude. Se pide R3 bajo la misma reserva, con dos regresiones y sus controles, manteniendo27+9verdes. Pipedrive sigue condicionado a la aceptación del transporte. Ninguna prueba o revisión aquí acredita proveedor, cuenta, conexión real, montaje o demo nueva.

## Seis huellas de R2 revisadas

| Archivo | SHA-256 |
| --- | --- |
| shared/source-reading.ts | 5e487a65916d2f3e7af5afb328235960acb4d51ab58da01f19ce8b241f34192a |
| server/source-read-transport.ts | efffaf1bce94a9f105fe65a03a11ffb8292799a365ea137008dcde58b0031b97 |
| shared/zendesk-source.ts | 2c4f88108d72b2a28a4be80b9cc1792032100a6cbc5e197c11c0074644dfc6db |
| server/zendesk-source.ts | 0a61a42d0f339bd2557b466ed6584902cb7b17ae81b3a67afac29a662d37c2fd |
| tests/zendesk-source.test.ts | 8c9a1940ccbda3f010be51a27604b4e016eab8348d5024885743bb80d378e05c |
| coordination/reports/CLAUDE-SOURCE-ZENDESK.md | 08f3a5a7763682fa79c0096e1e8d46f9166713b53d49a2c5de69ceb996f75819 |

---

# Histórico de revisión independiente285 · Zendesk R1

8/11/2026, Europe/Madrid. Codex. **Dictamen: requiere R2; no aceptada.** No se han editado los seis archivos de Claude. Pipedrive conserva su dependencia sin satisfacer.

## Resultado comprobado

Se cotejaron las seis huellas presentadas y se fijaron las fuentes transitivas de TypeScript en una carpeta privada. En `tests/.tmp/zendesk285-ZDUllU`: 19/19 pruebas originales, tipos focales sin errores, y nueve sondas independientes: una pasa y ocho reproducen los dos problemas siguientes. Sin omisiones ni reintentos dentro de esos bancos.

Una corrección mínima aplicada **solo a la copia privada** hace pasar 19/19 originales y 9/9 propias, con tipos limpios. Después se restituyeron las fuentes de esa copia y se comprobaron sus hashes y los del checkout. `causal-restored.json` deja constancia. Esa corrección no es una entrega del producto ni sustituye la implementación y pruebas de Claude.

## F1 · El esquema neutro admite identidades incompatibles (medio, latente)

`shared/source-reading.ts:60` valida proveedor/cuenta, unicidad y cardinalidad, pero no la igualdad entre el objetivo del lookup y su registro ni el tipo de objeto de la lectura.

Reproducción: una lectura `lookup`, objetivo `support/7`, completa y con un registro `support/8` pasa `sourceReading.safeParse`. `readingObservations` publica entonces una observación completa y bloqueada del ticket 8. También se admiten un registro con rol `sale` para un objetivo `support`, y un registro `organization` dentro de una lectura `ticket`.

**Alcance:** `readTicket(7)` de Zendesk sí rechaza correctamente una respuesta que contiene ticket 8; su prueba original y la sonda positiva propia pasan. El defecto está en la frontera común reutilizable por el siguiente adaptador, no se ha demostrado una atribución errónea desde el lector actual ni desde una cuenta real. La proyección omite `objectType`, de modo que la incoherencia debe rechazarse antes de proyectar.

Se solicitan invariantes explícitas: cada registro tiene el tipo de la lectura y, en modo lookup, su ID y rol coinciden con el objetivo. Mantener los casos sin registro para consultas no disponibles y los registros de contexto sin rol en listados. No relajar el contrato aceptado de compromisos.

## F2 · Cancelación y tiempo dependen de la cooperación de fetch/cuerpo (medio, latente)

`server/source-read-transport.ts:63` y `:79` esperan directamente a `fetch` y a `reader.read`. La señal se envía al transporte, pero no se revalida después ni hay una espera propia que venza aunque el transporte inyectado no coopere.

Cinco sondas reproducen variantes del mismo defecto:

- Fetch ignora la cancelación y entrega después un ticket válido: se publica `complete`, en lugar de `unavailable/aborted`.
- Fetch entrega después del timeout de petición: se publica `complete`, en lugar de `unavailable/timeout`.
- Un cuerpo sintético cancela la señal antes de entregar los bytes: también se publica `complete`.
- Fetch queda retenido: transcurridos 150 ms la lectura sigue pendiente pese al límite de petición de 30 ms. Solo termina al liberar manualmente el transporte.
- `reader.read` queda retenido: ocurre lo mismo, hasta liberar el cuerpo.

Las dos sondas retenidas liberan sus recursos y esperan el resultado antes de afirmar, para no dejar promesas pendientes en el banco. **No se ha demostrado que fetch nativo de Node ignore señales:** sus pruebas originales con HTTP local sí pasan. El problema afecta al contrato inyectable y a la garantía anunciada de límites propios; no hay montaje en App ni conexión Zendesk acreditada.

R2 debe acotar la espera completa, descartar respuestas tardías y preservar la clasificación aborto/timeout. Debe retirar listeners y gestionar/cancelar cuerpos sin convertir la limpieza en otra espera ilimitada. Probar también timeout total y errores tardíos; no copiar cuerpos o credenciales en errores ni introducir reintentos.

## Contraste con documentación primaria

La [API de tickets](https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/) respalda cursor, hasta 100 registros, `sort=id`, consulta por ID y las limitaciones de visibilidad y archivado. `complete` describe el recorrido de lo visible; no acredita todo el portal.

La [guía de cursor](https://developer.zendesk.com/documentation/api-basics/pagination/paginating-through-lists-using-cursor-pagination/) confirma `meta.has_more`, `after_cursor` y el uso de `page[after]`. También advierte cambios durante la paginación: completar páginas no acredita una captura atómica.

[Security and authentication](https://developer.zendesk.com/api-reference/introduction/security-and-auth/) sí marca API tokens como obsoletos y documenta Bearer. La decisión de admitir solo OAuth es compatible con esa fuente; no es correcto deducir que todos los tokens antiguos ya dejaron de funcionar.

La [guía de migración OAuth](https://developer.zendesk.com/documentation/authentication/oauth-migration/) documenta `tickets:read` y distingue obsolescencia de desactivación final. Actualizar el punto «nombres exactos no confirmados»: su existencia documental está comprobada, la concesión y permisos de una cuenta concreta siguen sin ensayar. No se creó cliente OAuth ni se llamó a endpoints de cuenta.

`accountId` del lector live es el subdominio **configurado**, no una identidad de cuenta comprobada mediante una respuesta del proveedor. Conservar esa distinción al montar posteriormente Integraciones/Radar.

## Evidencia y límites

- Script de fijación/repetición: `tests/.tmp/review-zendesk285.cjs`; sondas: `tests/.tmp/zendesk285-probes.ts`.
- Banco final: `tests/.tmp/zendesk285-ZDUllU`, `manifest.json`, `result.json`, `author.log`, `independent.log`, `types.log`.
- Control de sensibilidad: `tests/.tmp/causal-zendesk285.cjs`, `causal-fixed-author.log`, `causal-fixed-independent.log`, `causal-fixed-types.log`, `causal-private.patch.json`, `causal-restored.json` en ese banco. La versión privada solo demuestra sensibilidad; no se recomienda copiarla sin completar limpieza y casos límite.
- Primer intento restringido `zendesk285-jXHzWw`: 5/19 originales por fallos de HTTP local; no se atribuyen al producto. Repetición con bucle local permitido `zendesk285-th9eFM`: 19/19, siete sondas iniciales con seis fallos esperados, tipos0. El banco final incorpora dos sondas de espera retenida, con ocho fallos esperados entre nueve propias.
- Entorno hijo mínimo, bloqueo de salida externa; servidores de bucle local y fetch simulado. Sin navegador, cuenta, token real, instalación4601,4331/4334, build raíz, publicación ni cambios en fuentes de Claude.
- Tipos **focales**, no un typecheck global nuevo. No se repitieron los 21 mutantes comunicados por Claude. La documentación web no acredita compatibilidad con una cuenta real ni despliegue.

## Seis huellas revisadas

| Archivo | SHA-256 |
| --- | --- |
| shared/source-reading.ts | 71b05509359903b29c94868ee431ade7324f2d0d1610217f448f0ea3e00d4b11 |
| server/source-read-transport.ts | e96e2b226e333c12fd3de1eeafc5bc79f32d9e461d7d219d1ebbe6651feacee1 |
| shared/zendesk-source.ts | ade5315d6c5bd5f6a839c9f09ee74cca42edf838c3d5dd8f94496cf3a17e2dda |
| server/zendesk-source.ts | 0a61a42d0f339bd2557b466ed6584902cb7b17ae81b3a67afac29a662d37c2fd |
| tests/zendesk-source.test.ts | 0675d039342780138126e16a0b5080dd4472e0b2f8114c33cea5c33964f6ce99 |
| coordination/reports/CLAUDE-SOURCE-ZENDESK.md | 10c0a0bbfbb6a4175a411978aa71e3a657204f8f92d71cf340a76b148114cd78 |

Siguiente paso: devolución formal de `CLAUDE-SOURCE-ZENDESK` con el brief R2-285 y nueva presentación por su autor. La reserva continúa; no aceptar huellas de R1 después de cambios.
