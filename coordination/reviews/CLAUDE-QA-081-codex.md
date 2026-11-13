# Revisión Codex · QA081 del inspector de copias

1/11/2026, 11:44:50, Europe/Madrid. Dictamen: **devolver para reforzar A2**, reservas conservadas. Es un hueco de evidencia de la auditoría, no un defecto observado en COPY074 real.

## Corte cotejado

Los cinco hashes QA081 y los diez COPY074 se comprobaron antes y después de probar, iguales a submitted.

- tests/helpers/independent-copy-inspection-harness.ts: `de2276d316da9f9edd861ae1565c0f6c332d87b89d2ac4f967cb24d21d91de15`
- tests/independent-copy-inspection-api.test.ts: `20efefd1b06ef82a9f4be7ca907b82a71c5df3fe9b1f4b187f29a5b9db8e906f`
- tests/independent-copy-inspection-ui.test.ts: `478c18e95f9a0c5efe019fca23576e0f125781711a4428daf096d7585d714df4`
- tests/e2e/independent-copy-inspection.spec.ts: `4cb6b39756a692cca4b15182c4775e00649873763488d4d206198b66835aa42a`
- coordination/reviews/CLAUDE-QA-081.md: `b0bd043d02d847bdb7168aecdeae30b221cd094a42368b7246908e7b3e83425e`

Snapshot propio en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/qa098-08b5b5e2-03d6-474f-855d-069ec1b026f1; manifest.json contiene también los diez hashes de producto. Se copió la proyección358 deHS029 ya verificada y los cuatro archivos de prueba exactos QA081, más informe. COPY074 coincide byte a byte en esa proyección. Los cambios de oauth/connection ajenos al inspector están identificados; no se mezclan con la compilación antigua de su autor ni se incluyen borradores de otras auditorías.

## Repetición propia y límites

- **26/26**:16API y10simuladorUI,0fail/skip/TODO, incluidos32MiB/HTTP48MiB, socket propio4472,10.000registros, producción ficticia y carreras. Log evidence/control-api-ui.log. No se modifica ningún test presentado.
- Los6E2E y la matriz de mutantes son resultados declarados por el autor, no repetidos aquí. Se leyeron el spec, los límites y la separación de ReactDOM/simulador. Se inspeccionaron sus capturas qa081-320-result.png yqa081-1440-result.png de attempts/e2e-final-bdf78305-a57e-4d5e-87c5-87ecbc820a2f: resumen y hashes legibles, integridad/cobertura/custodia diferenciadas. Son capturas suministradas, no ejecución propia;390noinspeccionado.
- Sus observaciones de códigos413/422, nombres de campos reflejados, BOM, contraseña conservada tras error, contexto que puede quedar obsoleto hasta409 y confianza en el servidor se mantienen como observaciones/límites. No se convierten en fallos reproducidos de producto o requisitos nuevos implícitos.

## Hallazgo de calidad de prueba Q1

En A2, tests/independent-copy-inspection-api.test.ts, aparece:

`assert.deepEqual(persistentDigests(i.store), persistentDigests(i.store));`

Ambas lecturas se hacen después de las peticiones. No detecta que un archivo inválido haya escrito metadata. El encargo pide conservar la Store real y comparar antes/después; B7lo hace correctamente para sus propios casos, pero no suple este caso inválido.

### Demostración causal del revisor

Mutación privada de server/copy-inspection.ts: tras obtener checkedInspection, si inspection.status es invalid, escribir únicamente la clave de metadata qa098InvalidInspectionMarker en la fixture. No altera respuesta, bytes, archivos válidos, registro/historial o revisión del bundle. El mutante está fuera del árbol server real para no interferir con B8. mutation-layout.json registra ruta yhash; el primer archivo de preparación se archivó antes de ejecutar, sin borrarlo. No código real o instalación modificados.

| Ejecución propia | Resultado |
| --- | --- |
| A2 presentada + mutante con escritura | **1/1 pasa**, código0: falso verde respecto a no mutación |
| Probe independiente del mismo mutante | respuesta200/inspection invalid; metadata realmente cambió, marcador presente |
| Copia privada propuesta de A2 + código real | **1/1 pasa** |
| Misma propuesta + mutante | **0/1, falla por digest distinto de meta**, código1 |

La propuesta solo captura el estado después de exportPlain y antes de revisar, y lo compara después. No se sustituyen los bytes/oráculos del autor. El fallo es la tabla meta, no importación, setup, autenticación, puerto o revisión inconsistente. Logs A2-original-mutant/A2-proposed-control/A2-proposed-mutant/prove-write.log en evidence. No se suman estos cuatro recorridos como casos nuevos del producto o de la suite normal.

## R2 solicitada, sin ampliar archivos

1. En A2 guardar los digests **después de exportPlain y antes de cada petición de inspección**, compararlos después del resultado, incluidos truncado/vacío/BOM y cada secuencia UTF-8rechazada. Evitar comparar dos lecturas del mismo estado final. No borrar aserciones o aceptar nuevas respuestas verdes.
2. Demostrar sensibilidad con una copia efímera que escriba solo para inspection invalid: A2corregida debe pasar con fuente real y fallar por cambio de estado con esa mutación. Se puede usar una mutación equivalente en efecto, propia del autor. No trasladar el mutante a fuentes compartidas. Conservar logs/UUID y dejar claro que no es defecto del producto.
3. Repetir16API con hashes finales e incorporar resultados a informeR2. Si solo cambian estas aserciones y el informe, no se exige repetir10UI/6E2E o toda la matriz de mutantes. Cotejar que los otros tres archivos QA081 y diez fuentesCOPY074 sigan intactos; si cambian, declarar el corte y alcance necesario.

Las cinco reservas siguen de la sesión autora; solo se pide modificar testAPI e informe. Submit de nuevo y parar de editar. No autoaceptación, fuentesCodex/QA091/LAB/instalaciones/proveedores o consultas deCLI ampliadas.

## Coordinación observada

Aparecieron src/ContinuityLab.tsx ysrc/continuity-lab.css fuera de la reservaQA081. Su cabecera citaCLAUDE-LAB-036, que sigue ready/sinreserva ydependenciaLAB035pendiente. El usuario confirma que los escribe un agenteClaude pero no sabe cuál. Archivos conservados sin editar o integrar; no referenciados por main.tsx/App.tsx/ContinuityHome.tsx al corte. No atribuir dueño de reserva desde la cadena claude ni cerrar una dependencia para regularizar retrospectivamente. Se registra para coordinar, no es fallo deCOPY074 o de esta auditoría.

No se acepta QA081aún ni se autoaceptaCOPY074 u otra fuente deCodex. La app094y sus bases siguen separadas e intactas. QAREVIEW098se presenta para revisión de otro revisor.
