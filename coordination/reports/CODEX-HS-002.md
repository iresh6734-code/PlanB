# CODEX-HS-002 · Aislamiento del callbackOAuth

28/10/2026 Europe/Madrid. Unidad iniciada inmediatamente después de la revisiónH1/H6 por petición de trabajo continuo. Claude recibió esa instrucción y respondió con verificaciones conceptuales, sin recibir nuevas fuentes. La implementación y pruebas siguientes son deCodex; no atribuir revisión independiente de este código aClaude.

## Cambio

`TeamOAuth.complete` adquiere primero el bloqueo de `team_spaces` en su transacción final y después comprueba el estado vigente y la conexión previa. Para STANDARD aplica `productionSpace` inmediatamente antes de cifrar/guardar, igual que la vía privada de producción. Evita usar un espacio con historial de ensayo/otro portal y detecta importaciones durante la espera remota. Las comprobaciones y el INSERT quedan en la misma transacción y bajo el bloqueo que también usan importación/desconexión. Se conserva state de un solo uso, actor/empresa, ID/tipo remoto y alcance de solo lectura.

La comprobación remota ocurre antes de esta transacción final. No se ha cambiado el refresh de tokens deH7 ni el contrato de fichas deH3. No se introduce unicidad global de portal entre empresas, ni se confunde un hash de identidad con un state opaco impredecible. No se envía esta nueva fuente aAnthropic sin autorización de archivo.

## Validación

`node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-oauth-isolation.test.ts tests/team.test.ts tests/hubspot-local-production.test.ts`: **19/19 correctas**. Siete pruebas nuevas cubren espacio vacío/cifrado/state, historial de ensayo, captura ajena sin filas locales, importación durante lectura, reconexión al mismo historial real, conservación de otra conexión y retirada de state, empresa ajena/modo de ensayo.

`node node_modules/typescript/bin/tsc --noEmit`: correcto. Sin llamadasHubSpot, credenciales reales, DPAPI, nuevas filas en el piloto, despliegue, reinicio o escriturasCRM. Los datos de prueba son sintéticos enPGlite separado y no se transforman ensayos históricos de la app en producción.

## Límites y siguiente unidad

No hay aceptación remotaOAuth ni sesión de usuario probada. Pruebas de concurrencia se centran en cambios entre fases; no acreditan un test de bloqueo con dos conexionesPostgreSQL gestionadas. H2 tiene implementación/pruebas listas para revisión; H3 procedencia de ficha y H7 refresco/reconexión siguen pendientes. Antes de editar másOAuth, cerrar/revisar esta reserva o registrar un encargo con dependencia sin solapar.

## Hashes finales

- server/team/oauth.ts: 2ee32dc8650240c9138d6ca5e7606a76c68aef5f9c7e4aa161bac91c2fb4c0fa
- tests/hubspot-oauth-isolation.test.ts: 534319e04e03715bf1db3a8d1454a165a1652d3d71bc12a331e5ea89d2bf962f
