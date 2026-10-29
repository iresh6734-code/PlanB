# CODEX-HS-003 · Procedencia de fichasHubSpot

29/10/2026 Europe/Madrid. H2 aceptada previamente por subagenteCodex distinto del autor; reservaOAuth liberada antes declaimH3. Implementación y pruebas deCodex. Claude aportó una consulta conceptual nueva, sin estas fuentes, y no ejecutó pruebas ni editó código.

## Resultado

La ruta exige contacto presente en capturaHubSpot del portal conectado; un ID numérico local, capturafixture o portal ajeno no conceden lectura remota. Captura de producción debe identificar entorno ytipoSTANDARD. Portal/modo esperados pasan aaccess antes de renovar o leer. La identidadBD (portal,tipo,verified_at,estado) se comprueba antes de cadaGET yantes de devolver. La ruta vuelve a comprobar permiso por empresa y presencia de contacto/fuente al terminar. Una renovación del mismoportal conserva identidad; una desconexión, sustitución o reautorización con nueva marca temporal descarta el contenido. Demo conserva su respuesta ficticia explícita sin red. No se mantiene transacción durante losGETdecontexto.

El contrato previo de commercial.test.ts se adaptó mediante encargo separadoCODEX-HS-003-CONTRACT: antes usaba IDlocal123 con captura deotroportal. Ahora ambas capturas de diff identifican portal123 y contacto123 capturado, manteniendo las expectativas de diferencias, responsable, texto y ausencia de secretos. No se debilita la prueba para aceptar falta de procedencia.

## Evidencia

- Ocho regresiones nuevas correctas: local/fixture/portal ajeno sin red; positivos ensayo/producción; portal/modo esperado e IDno numérico; desconexión/cambio/reautorización durante lectura; cambio en último detalle; renovación mismaidentidad; revocación de membresía o captura; usuario ajeno ydemo sinred.
- node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-context-isolation.test.ts tests/hubspot-oauth-isolation.test.ts tests/hubspot-local-production.test.ts tests/commercial.test.ts tests/team.test.ts: **45/45 correctas**.
- node node_modules/typescript/bin/tsc --noEmit: correcto.

Claude: respuesta conceptual real de1781caracteres y métricaCLI0,0258615USD, no factura. Se conserva su propuesta de cotejar portal al inicio/final y permitir renovación; se rechaza su suposición de identidad solo en memoria de sesión. Estado yrespuesta registrados enpanel.

## Límites

verified_at es una marca temporal, no una generación única: no se acredita protecciónABA para dos reautorizaciones del mismoportal conidéntica marca. Las comprobaciones tienen un punto de validación final; no son revocación atómica de una respuestaHTTP ya enviada. No sustituyen validaciónAPI del portal personal ni prueban UI/sesión real, concurrenciaPostgreSQL completa odespliegue. H7 (refresh dentro de transacción, erroresinvalid_grant ymetadatos) queda para siguiente unidad después de revisiónH3. Sin CRM/Google/Gmail/IFR, credenciales reales, datos añadidos al piloto, reinicios, commits o publicación.

## Hashes

- server/team/oauth.ts: 19713a6dc57a18e8fe01bd06137beff3cd5492a103e6c173abe88fdd8bc77951
- server/team/hubspot-routes.ts: 162409806285d1b8406ef7e36d36dbce2bf046e499d435caace5f69d08b0c182
- tests/hubspot-context-isolation.test.ts: 3e63f47738eeb9795442a51aadfeeb8b1d3f9decee913f47633146c572a30d5b
- tests/commercial.test.ts: b5d1991dbead180f005d417a0abeadac3b4e413556c769b8861e7af9c90a4ea0
