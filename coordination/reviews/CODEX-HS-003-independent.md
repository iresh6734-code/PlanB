# Revisión independiente CODEX-HS-003

29/10/2026 Europe/Madrid. Revisor: subagenteCodex review_h2, distinto del autor. **Dictamen final: aceptar H3 y el ajuste CONTRACT tras presentación y cotejo de hashes, como revisor distinto del autor.** Sin acceso a proveedores o nuevas fuentes enviadas aClaude. No se editan fuentes/pruebas del autor; memoria reservada al coordinador.

## Revisión estática

La ruta ya no usa la existencia de un ID numérico local como autorización remota: requiere origenHubSpot, source.kindHubSpot y contacto en la captura seleccionada para el portal conectado. Datos de producción deben identificar STANDARD/environmentproduction; fuente test y producción no se intercambian por el mismo número de contacto. Pasa portal/modo al acceso a credencial y se cotejan antes de renovar o consultar. El modo demo mantiene respuesta señalada como ficticia y no consulta proveedores.

El acceso identifica la fila por empresa, portal, tipo de cuenta y verified_at. Comprueba statusreadonly y tipo permitido antes de abrir credencial. La lectura de ficha coteja esa identidad contra BD antes de cadaGET y al final, sin introducir transacciones adicionales abiertas durante losGET de contexto. Una modificación de token/expiración no altera la identidad del portal: no se rechaza un refresh por cambiar el secreto. La renovaciónOAuth preexistente aún ocurre dentro de su transacción; H7 sigue separado.

Después de obtener contexto, la ruta vuelve a comprobar permiso read, procedencia/presencia del contacto y portal/modo. Datos leídos no se devuelven si esas verificaciones fallan. Los GET usan la misma credencial capturada; no saltan a una conexión nueva silenciosamente. No se inserta identidad/credencial en la respuesta o captura.

El ajuste en commercial.test.ts cambia el supuesto previo de IDsolo local por capturasHubSpot de portal123 con contacto123. Mantiene assertions de diferencias, owner, timeline, lectura acotada, destinosAPI y secreto ausente. Está reservado en una entrega separada.

## Límites

verified_at es una marca temporal, no una generación única: no garantiza detectar cualquier secuenciaABA/reautorización del mismoportal con el mismo timestamp. La comparación de portal impide mezclar portales en cada comprobación observada, pero no se debe presentar como serialización global de la respuestaHTTP o cancelacióninstantánea ante una retirada. Los tests propuestos modifican BD entre fases asíncronas y no prueban dos conexionesPostgreSQL reales. La comprobación de permiso/presencia se realiza al inicio y al final; no afirma autorizar de nuevo la membresía antes de cadaGET. La llamada interna context mantiene source opcional para consumidores de confianza ya existentes; la única rutaHTTP de contexto encontrada siempre proporciona procedencia.

No se identificó problema material dentro del alcance H3. Las versiones presentadas se cotejaron con todos sus hashes actuales antes de aceptar. Este revisor no volvió a ejecutar pruebasH3; la evidencia de45/45 afectadas ytypecheck correcto procede del autor y está documentada en CODEX-HS-003.md. Se mantiene esa atribución. La prueba de renovación de identidad cambia secreto/expiración en BD durante la lectura: acredita que esa rotación no genera falso conflicto, no la ejecución completa del endpointOAuth de refresh, que pertenece aH7.


## Versiones revisadas y decisión

### CODEX-HS-003

- server/team/hubspot-routes.ts: 162409806285d1b8406ef7e36d36dbce2bf046e499d435caace5f69d08b0c182
- server/team/oauth.ts: 19713a6dc57a18e8fe01bd06137beff3cd5492a103e6c173abe88fdd8bc77951
- tests/hubspot-context-isolation.test.ts: 3e63f47738eeb9795442a51aadfeeb8b1d3f9decee913f47633146c572a30d5b
- coordination/reports/CODEX-HS-003.md: 4546c56d6d7fb77a9eb76d8e8312da43a7ea700bd7e5e3add39e7d3928e4d48b

### CODEX-HS-003-CONTRACT

- tests/commercial.test.ts: b5d1991dbead180f005d417a0abeadac3b4e413556c769b8861e7af9c90a4ea0

El informe del autor refleja también el límite de verified_at/ABA. La aceptación no amplía ese compromiso, acredita concurrencia realPostgreSQL o validaciónAPI remota. Ambas entregas se aceptan por un agente diferente al autor; este propio informe se presenta para revisión por el coordinador y no se autoacepta. El coordinador mantiene la actualización de CONTEXTO-PROYECTO.md que tiene reservada.
