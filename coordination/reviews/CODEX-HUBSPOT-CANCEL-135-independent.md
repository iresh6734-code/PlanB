# Revisión independiente de CODEX-HUBSPOT-CANCEL-135

2/11/2026,Europe/Madrid. Codex de este chat,revisor distinto del otrochat autor135. Unidad CODEX-CAPTURE-REVIEW-141. Dictamen favorable para135;141requiere revisión ajena.

Se cotejaron los tres hashes135 antes/después del freeze y de las pruebas. Se leyeron importador,readonlyFetch,integración con Continuity/Jobs y las pruebas autoras. No se modificaron fuentes135/140/Claude ni la demo.

## Evidencia propia

Snapshot `tests/.tmp/capture141-9ca6f8f8-6d11-47e1-ad08-69f61200856b`,manifest.json,author37.log,independent6.log,typecheck.log,cinco mutant-*.log y result.json. Entorno mínimo y bloqueo de red externa;cada fetch inyectado es ficticio. Las suites con Store usan memoria;los seis casos nuevos no abren bases ni servicios. Ninguna llamadaHubSpot/cuenta/credencialreal.

-37/37autoras relacionadas repetidas,0omitidas.
-6/6propias nuevas,0omitidas.
-Typecheck focal sobre las cinco suites y dependencias limpio.
-5mutantes privados detectados,cada uno con un falloAssertionError en el oráculo seleccionado,0fallos de importación/compilación/timeout. Se restauró la copia y se recotejaron inputs.

Oráculos propios:cancelar mientras response.json está retenido rechaza antes de anunciar cuenta válida;fallo fetch posterior a abort conserva la razón explícita;espera503 de cinco segundos se cancela dentro de350ms,sin leer el cuerpo ni reintentar,aunque body.cancel rechace;abortar en callback de progreso impide la petición siguiente;respuesta200 tardía se descarta/cancela sin leerJSON;control no cancelado429 sí espera/reintenta y conserva un posterior403 de permisos,tres lecturasGET.

Mutaciones:retirar guarda trasJSON;retirar preservación de razón en catchfetch;retirar rama de descarte/cancelación de respuesta tardía;hacer no cancelable la espera;retirar guarda antes de cada petición. No se añaden al recuento de seis casos de producto. El mutante de espera mantiene su temporizador de cinco segundos hasta agotarlo;su fallo es la aserción temporal de350ms,no un timeout del proceso de prueba.

Las37autoras incluyen el caso real de Continuity/Jobs/SQLite en memoria que conserva snapshot/registros/capturas al cancelar durante429. Su repetición aquí aporta evidencia propia para ese caso;no se atribuye una pruebaUI inexistente. No se ejecuta suite global niVite/DOM porque el cambio es del importador y esta revisión no cambia runtime.

## Semántica y límites

La espera cancelada de node:timers/promises rechaza con AbortError y conserva la razón del AbortController en cause;no se afirma identidad del error en ese camino. Los caminos fetch/json comprobados sí propagan la razón exacta mediante throwIfAborted. La guarda después deJSON evita transformar datos recibidos tras cancelar en éxito. ReadonlyFetch sigue limitando métodos/rutas;esta unidad no modifica permisos del proveedor ni autoriza escrituras.

Un fetch que ignore AbortSignal y nunca resuelva puede seguir reteniendo la promesa.135 no promete interrupción forzosa de cualquier transporte;cuando llega una respuesta tardía,ya no produce fallback ni éxito. Cancelar no acredita que la petición previa no haya llegado al proveedor. El control429 demuestra que la corrección conserva un reintento no cancelado,no garantiza tiempo de respuesta de HubSpot.

Sin fallo nuevo reproducido en135. Aceptación permitida tras cotejo final de los tres hashes vigentes. La demo4591usa otrobuild:no se actualiza por aceptar esta fuente. El montaje140 y el seguimiento136 mantienen revisión/reservas propias y no se aceptan aquí.
