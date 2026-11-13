# Revisión Codex108 · QA091 de persistencia y barreras

1/11/2026, 16:25:19, Europe/Madrid. Dictamen: **aceptar la auditoría con cuatro hallazgos de producto pendientes**. No aceptación de fuentesCodex/R1completa ni instalación. No se presenta243+4TODOcomo247pruebas superadas.

## Versiones contrastadas

Cinco hashes QA091 y45de sus nueve unidades auditadas coinciden con submitted y con inventory.json del autor antes/después. Esas nueve unidades siguen en review, sin aprobarlas mediante esta auditoría. Snapshot propio de202inputs en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/qa091-review108-d3c25e1d-4e89-4723-b83d-796ca3e813d6; hashes del snapshot cotejados de nuevo antes del dictamen. Incluye fuente actual server/shared/src, pruebas yhelpers requeridos; no secretos/configuración de instalación, node_modules no congelado. Cambios vivos fuera del corte durante la ejecución: []. No se atribuye estabilidad de todos los archivos que otras sesiones escriben, solo del snapshot y de los50hashes presentados.

- tests/independent-persisted-plan.test.ts: 6b80942578e6852e0894a2ffcc6a5d2cbafb56bf34a08078256c460e106c48da
- tests/independent-return-barriers.test.ts: 1d632d1465c6804b4cd5ab522330b80507c9bcdba5128b4ac44abcc2186f165b
- tests/independent-return-integrity-ui.test.ts: 71d98f37fb142361ed677eaa97f41bd5610b964b2bf0031077dc47c28fd4a23d
- tests/e2e/independent-return-integrity.spec.ts: ebf19e7b0d8b756c25a229563600e89c48907fb170576c0ad16de3788362882a
- coordination/reviews/CLAUDE-QA-091.md: 9200a887c1de507a9f8a405f7afd5e0d2c99bda4adf25a94d58792fe05e17e18

## Repetición propia

Tres bancos Node sobre copia nueva: **247casos:243pass,0fail,0skip,4TODO**, no suma de repeticiones. Persistencia53+3TODO; barreras164+1TODO; simuladorUI26/26. Typecheck focal estricto de los tres e imports limpio, no tscglobal. Las fixtures son nuevas con clavekind:test/memoria/disco propio; no DPAPI/bases existentes. Se ejecutaron seis arranquesmain/runtime con handles propios y puertos4521–4529, bloqueador de redexterna y entorno de sistema permitido. Los procesos propios terminan por su handle; no se pararon demos/servidores ajenos.

En copias privadas de los dos tests se quitaron únicamente las etiquetasTODOde F1–F4 y se seleccionaron esos cuatro casos: **0pass/4fail/0TODO**, cada uno por AssertionError de su propiedad. No setup/import/timeout confundido con reproducción. SharedtestsClaude no se modificaron. Logs node247/four-findings-required/typecheck y results/final.json preservados. Los tests con contador de aserciones y los controles positivos se revisaron; el contador no sustituye el examen de qué afirma cada caso.

### Hallazgos confirmados

| Hallazgo | Reproducción e impacto | Pendiente |
| --- | --- | --- |
|F1, bajo |Store cifrada nueva con fila recoveryPlanplaintextnoJSON:constructorlanzaSyntaxError; archivo permanece intacto peroAPI no puede abrirse con diagnósticoR1 |Conservar bytes y abrir en estadoinvalid; no normalizar o descartar plan |
|F2, bajo |Plan con estructura válida/localIdausente y revisión correcta:approve lanzaTypeError al leer values, fila intacta |Error controlado y sin efectos; R1estructural no promete semántica válida |
|F3, bajo-medio/latente |Remote de prueba devuelve número después decreate:Recovery persiste planinvalid por su propia escritura |Validar respuesta antes de persistir y conservar incertidumbre; no afirmar queHubSpotrealdevolvió ese tipo |
|F4, bajo-medio |POSTgenerate/demo con plan inválido devuelve409pero catch guarda meta.candidate con captura/error |Rechazar antes del trabajo/configuración y no persistir error cuando integridad se pierde |

F1filebytes y F2planrow preservados, F3historial mantenido y F4candidato añadido reproducidos con las fuentes actuales exactas. F3viola el contratoTSdelRemote;hubspotRemote actual convierte aString, por lo que no se demuestra incidencia en servicio real. No son cuatro vulnerabilidades de seguridad demostradas ni se amplía severidad desde un fixture manipulado. Se corrigen como robustez/garantías del producto.

O1se mantiene observación: captura despachada antes de corromper plan puede finalizar y actualizar captura/captureLastSuccess; no cambia plan/registros/historial/mapa/marcas de devolución. R1no promete cancelar efectos ya despachados. Se inspeccionó el caso: aunque contiene una comparación planRowconsigomisma redundante, el bucle posterior sí compara la fila recoveryPlanantes/después dentro de meta, además de registros/historial; esa tautología no es su único oráculo. No se reclama nuevo defecto por ella.

## Sensibilidad contrastada por este revisor

Cuatro copias privadas de la fuente actual congelada; mismo caso control pasa1/1y mutante falla0/1 por la aserción pertinente:

- Quitar clones de recoveryState/validatedRecoveryPlan:mutación externa altera estado cacheado, prueba clonesroja.
- Quitar guarda de tickpara planinvalid: inventa lastAttempt, prueba continuidadroja.
- Cambiar razón del inspector invalid→NO_ACTIVE_COPY:la distinción explícita falla.
- Tratar servidor sin metadata como sano enChangesView:su prueba antigua queda roja, no se confunde conReactDOM.

Logs control/mutant en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/qa091-review108-d3c25e1d-4e89-4723-b83d-796ca3e813d6/sensitivity-93e910d8-5dea-453d-acde-8c7ebc25733c. Son cuatro regresiones introducidas para verificar oráculos, no nuevos defectos del producto actual. El resto de13mutantesserver/8UI/2buildsmutados/4sondasequivalentes siguen siendo ejecuciones **del autor**, no repetidas ni sumadas por este revisor. Se revisaron los diffs relevantes; no-clone elimina ambas devoluciones de clones, una sola propiedad aunque haya dos reemplazos. No se reconstruyeHEADincompatible.

## Navegador y límites

Se leyó el specE2Ey la separación de remoto/efectos/fixtures. Sus10/10deChromium y builds son resultados del autor, no ejecución nueva aquí. Se inspeccionaron sus E6-320/E6-1440 suministradas:historial legible y avisoR1, acciones de devolución bloqueadas, sin desbordamiento visual aparente.390no inspeccionada por este revisor; no contraste calculado/lector de pantalla/Edge. Simulador de hooks26/26 no esReactDOM. Inspector en navegador y SQLite dañada a nivel de página no ensayados. AdvertenciaSQLiteexperimentaldeNode visible; sin instalar dependencias o ejecutar rootbuild/Vite/deploy.

## Continuación

CorregirF4en nueva unidad109sobre generator.ts libre y tests propios, sin tocar los cinco archivos deClaude. Después encargar cambiosF1–F3bajo las reservasStore/Recoveryexistentes y hashes nuevos, sin autoaceptar055/087para forzar dependencias. Mantener cuatroTODOcomo evidencia histórica hasta que su autora reciba encargo de revalidación; no editarlos para volver globalgreen. App/SEARCH053divergente y079R2son asuntos separados.036no se integra o regulariza;106tiene su propia reserva.

Sin equipooriginal/4331/4334/4420/4421/proveedores/credenciales reales/commit/push/despliegue.105/106y104no se aceptan por esta revisión. El informe108se presenta para revisión, sin autoaceptarlo.

Aceptación registrada:CLAUDE-QA-091done únicamente como auditoría conF1–F4pendientes.
