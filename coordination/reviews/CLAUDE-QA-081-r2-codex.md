# Revisión Codex107 · R2 de QA081

1/11/2026, 16:14:37, Europe/Madrid. Dictamen: **aceptar la auditoría QA081 corregida**. Se cierra Q1 del dictamen098. No se acepta COPY074 u otra fuente propia, no instalación o certificación global.

## Corte y alcance

Cinco hashes QA081 y diez COPY074 iguales a sus respectivas presentaciones antes/después. Los tres archivos sin cambios de QA081(harness, simuladorUI yE2E) coinciden con el corte098; también los diez hashes COPY074. Solo cambiaron APItest e informe del autor. Se inspeccionó el diff completo del test: sustituye la tautología de A2 por captura de digests posterior a exportPlain y anterior a **cada** petición, y comparación posterior. Mantiene las aserciones anteriores para truncado/vacío/BOM/cinco secuenciasUTF8. No relaja respuestas o elimina controles fuera del caso.

La ruta efectiva es tests/independent-copy-inspection-api.test.ts. La referencia readFiles a independent-copy-inspection.test.ts en los metadatos iniciales107es un error de nombre; ese archivo no existe/no se leyó ni ejecutó. El manifiesto final registra las rutas reales exactas. Escritura compartida107limitada a este informe; fuentesClaude intactas.

- tests/helpers/independent-copy-inspection-harness.ts: de2276d316da9f9edd861ae1565c0f6c332d87b89d2ac4f967cb24d21d91de15
- tests/independent-copy-inspection-api.test.ts: 3b0429132e79fcbe3c4b9d56da49f21061259b2756355ac47e854dfc6096ec8c
- tests/independent-copy-inspection-ui.test.ts: 478c18e95f9a0c5efe019fca23576e0f125781711a4428daf096d7585d714df4
- tests/e2e/independent-copy-inspection.spec.ts: 4cb6b39756a692cca4b15182c4775e00649873763488d4d206198b66835aa42a
- coordination/reviews/CLAUDE-QA-081.md: 604deef145c00c67b3fa0782ee27fd166a6cf4c51ab45acd15e540284603d9c2

## Verificación propia sobre esta R2

**16/16 API,0fail/skip/TODO**, más typecheck focal de esas pruebas e imports sin errores. Snapshot privado nuevo de80inputs leídos del checkout actual en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/qa107-c3b303e8-f72b-4073-97d5-8aa0f6341690; hashes antes/después intactos. Dependenciasnode_modulesexistentes no congeladas. B8escanea los archivosTS raíz de server congelados, no la copia privada mutada. Incluye21/32MiB/límites, HTTPreal de21MiB en4472,10.000registros, historia/cobertura/procedencia y no persistencia. Todo con Store:memory:, fixtures/contraseñas inventadas y block-external. Ninguna base/perfil/instalación existente o proveedor.

Reproducción causal propia, no solo lectura de logs del autor:

| Prueba | Resultado |
| --- | --- |
|16API R2+fuente real |16/16 |
|A2R2+mutante que escribe metadata solo si inspection.status=invalid |0/1, AssertionError por tabla meta distinta |
|A2R1anterior+el mismo mutante |1/1, falso verde histórico reproducido |
|Probe independiente+mutante |inspection invalid, metaChanged:true, markerPresent:true |

Mutante fuera del árbol server, imports absolutos a la fuente congelada; no modifica la respuesta o revisión normal. La R2 rechaza su efecto por el motivo correcto, no error de carga, puerto o autenticación. R1solo se usa como control histórico privado; no se devuelve a archivos compartidos. Los cuatro recorridos no se suman como casos nuevos del producto. Logs api16/typecheck/A2-R2-mutant/A2-R1-mutant/probe.log, final.json y hashes del mutante preservados. No se demuestra un defecto de escritura en COPY074 real: el único defecto revisado era un hueco de la prueba.

## Límites mantenidos

No se repiten10simuladorUI/6E2E ni la matriz completa de mutaciones porque sus archivos y producto no cambiaron, de acuerdo con098. Siguen separados:26/26propios del corte098,6E2E/matriz comunicados por el autor,16APIpropios actuales. Simulador de hooks no esReactDOM. Chromium no acreditaEdge/lector de pantalla/contraste. Las observaciones anteriores de códigos/nombres de claves/BOM/contraseña tras error conservan su alcance, no hallazgos nuevos aquí. Node emite SQLiteexperimental. No se ejecutó build/Vite/rootbuild o despliegue.

La aceptación del informe QA081 no incorpora el App cambiado por otra sesión, no cierra072/SEARCH053, no acepta035/036/101/103/104 ni equivale a estado global verde. QA079tiene devoluciónR2por cambios posteriores al submit;091requiere revisión separada. No acceso al equipooriginal/4331/4334 o envío de fuentes aClaude.

## Decisión de coordinación

Se acepta únicamente la versión de cinco hashes indicada mediante la herramienta del tablón. El informe de revisor107se presenta a su vez para revisión, sin autoaceptarlo.

Aceptación registrada: CLAUDE-QA-081 done; CODEX-COPY-074 permanece review.
