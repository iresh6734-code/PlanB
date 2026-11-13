# CODEX-UX-005 · Descartar sondeos tardíos del agente

29/10/2026, Europe/Madrid. Autor Codex. A partir del riesgo pendiente que Claude declaró en CLAUDE-FIX-023; se reproducen y corrigen las respuestas fuera de orden, sin repetir su entrega de sondeo/R18. Estas fuentes nuevas no se envían a Claude. Revisión independiente requerida antes de aceptar.

## Problema comprobado

Con un sondeo pendiente, Actualizar podía traer una lista reciente y, después, el sondeo antiguo sustituirla por una lista anterior. También podía escribir durante una acción, tras pausar la pantalla o después de desmontar el componente. El arnés real con transporte diferido produjo **cinco fallos y un control positivo** antes de tocar el componente: datos recientes sustituidos, sondeo visible durante acción/pausa y escrituras de sondeo/recarga tras desmontar.

TeamApp remonta el agente con key spaceId al cambiar de empresa. No se presenta esta carrera como una mezcla de empresas demostrada en ese consumidor.

## Cambio

- Cada lectura de overview lleva revisión monotónica y vida del montaje; solo la vigente puede actualizar data o propagar su error. Limpieza inicial invalida las lecturas anteriores. La carga inicial usa la misma guarda.
- Iniciar una acción invalida inmediatamente los sondeos anteriores, antes de esperar la acción o su recarga. busyRef se activa sin esperar otro render y evita reentrada mientras hay una operación. Errores, estado stale y finally propios de run también comprueban la vida del montaje.
- Cada ciclo de sondeo tiene una guarda alive que se retira al pausar, cambiar dependencias o desmontar. Una respuesta del ciclo viejo se descarta incluso tras volver a reanudar. Se conserva una única petición de sondeo pendiente: reanudar espera a que termine el transporte viejo antes de abrir otro sondeo.
- Se conserva el intervalo3000ms por defecto, pausa, busy, ausencia de sondeo sin runs running, tratamiento silencioso de errores de sondeo y recarga manual. Sin nuevo estado React, dependencias, rutas, sondeo adicional, servidor o permisos.

## Verificación

**60/60 afectadas correctas**: seis nuevas en team-agent-poll-race y54 existentes de ui-journeys, incluidas las de R16/R18 de Claude. Las nuevas comprueban recarga manual anterior al sondeo tardío; invalidación al iniciar acción; respuesta/error de sondeo tras desmontar; pausa con respuesta antes o después de reanudar y sin solapes; éxito/error de recarga manual tras desmontar; error de sondeo seguido de recuperación vigente.

Timers virtuales y promesas diferidas hacen determinista la secuencia nueva. Las pruebas ejecutan el componente real transpiliado, hooks/JSX controlados y transporte ficticio; no ReactDOM/StrictMode/navegador. No se envían solicitudes a proveedores, cuentas o modelos.

Typecheck correcto. Build Vite aislado correcto en tests/.tmp/ux005-build, sin copiar al build/dist del piloto. Detector Impeccable devuelve[] sin hallazgos; no es QA visual o contraste computado. Mantiene el marco compliance y reglas React leídos en esta conversación.

El revisor encontró una laguna causal: el caso manual devolvía succeeded, detenía el ciclo y su guarda alive ocultaba la retirada de la revisión monotónica. Se corrigió únicamente el test para que la actualización manual siga running. El revisor comprobó en memoria que así el código real pasa y retirar la revisión produce el fallo STALE_POLL; también detectó retirar alive con el caso de pausa. Se repiten60/60 y typecheck después de reforzar la prueba. No se atribuyen las mutaciones al autor ni se cambia la fuente para resolver este hallazgo de cobertura.

Comandos:

    node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/team-agent-poll-race.test.ts tests/ui-journeys.test.ts
    node node_modules/typescript/bin/tsc --noEmit
    node node_modules/vite/bin/vite.js build --outDir tests/.tmp/ux005-build
    node C:\Users\iresh\.codex\skills\impeccable\scripts\detect.mjs --json src/TeamAgentWorkspace.tsx

## Límites

Se descartan resultados locales: no se cancela físicamente una llamada ya iniciada. Un transporte de sondeo que nunca termine conserva el bloqueo de sondeo pendiente; no se añade timeout o contador de fallos en esta unidad. Las guardas abarcan overview y gestión de run, no cada setter propio de todos los callbacks de acciones (por ejemplo preview o notice después de un await interno). No se afirma corregir toda asincronía del componente.

No se cambia el servidor, el resultado guardado de un análisis o la autorización de IA. No hay QA visual, foco real o lector de pantalla. Sin API real, credenciales, datos de clientes, navegador/ventanas, piloto reiniciado, commit, publicación o nuevas fuentes enviadas a proveedores. La aceptación sintética no acredita actividad de modelos o conexión HubSpot real.
