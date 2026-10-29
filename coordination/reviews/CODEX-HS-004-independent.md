# Revisión independiente CODEX-HS-004

29/10/2026 Europe/Madrid. RevisorCodex review_h2, distinto del autor. **Dictamen final: aceptar H7 corregida, tras revisión independiente, reproducción del hallazgo, retest de su corrección y cotejo de hashes presentados.** Solo este informe reservado; memoria corresponde al coordinador. No fuentes nuevas aClaude, cuentas o proveedores.

## Hallazgo confirmado antes de presentar

P2: dosinstancias renuevan el mismo baseline; respuesta invalid_grant del perdedor llega antes del éxito del ganador. La primera pone needs_reconnect; elCAS de éxito requería statusreadonly, por lo que descartaba también la credencial válida. Ambas lecturas fallaban409 y persistía secreto antiguo/needs_reconnect. Reproducido por este revisor con arnés porstdin, PGlite aislado y red externa bloqueada, sin editar fuentes o pruebas del autor: attempts2, gets0, firstokfalse/status409, secondokfalse/status409, statusneeds_reconnect, savedAccessIsOldtrue. Este orden no estaba cubierto por el caso de dosinstancias con éxito antes de respuesta vieja.

Corrección acordada para revisar: permitir que el éxito ya validado del mismo baseline actualice en readonly o needs_reconnect y establezca readonly. Debe conservar condiciones secret/portal/tipo/verified_at; no debe reinsertar fila eliminada o sustituir otra autorización. No incluir un futuro estado administrativo disabled. La lectura que ya recibió el error puede fallar, pero la respuesta válida posterior no debe perderse por ese estado conservador del mismo baseline.

## Inspección restante

Lectura de credencial en transacción corta, llamadaOAuth separada y persistenciaCAS. El mapa de promesas deduplica por empresa y hash del secreto cifrado dentro de una instancia; no es exclusión multiproceso. Invalid_grant/BAD_REFRESH_TOKEN solo marcan baseline vigente y no exponen contenido remoto. Errores transitorios/malformados conservan conexión. Metadatos refresh_token/hub_id/scopes omitidos se heredan; acceso y duración nuevos son obligatorios. Scopes explícitos sustituyen y se contrastan con lista de lectura; portal inesperado requiere reconexión.

Después del refresh se vuelve a leerBD y no se reutiliza una respuesta antigua como credencial directa. afterRefresh evita recursión infinita con duración positiva menor60s, pero exige que siga vigente. Una respuesta perdida por CAS no reinstala fila ni sobrescribe otra credencial. Corrección cotejada con su nueva regresión, informe y hashes presentados, que permanecen vigentes.

No se atribuyen a este revisor las9pruebas focales/typecheck que el autor ha comunicado; su arnés independiente anterior reproduce únicamente el hallazgo. No acredita rotación del proveedor real, dos procesosPostgreSQL o disponibilidad de un lease distribuido.


## Retest independiente de la corrección

CAS observado tras corrección: éxito validado puede escribir sobre readonly o needs_reconnect del mismo secreto/portal/tipo/verified_at, y establece readonly. No incluye estados administrativos futuros ni reinserta filas. Arnés porstdin repetido por este revisor con el mismo orden determinista: dosinstancias, errorinvalid_grant antes de éxito; resultado attempts2, gets1, primeraoktrue, segundaokfalse/status409, statusreadonly, savedAccessIsSuccesstrue. Así la lectura ya fallida sigue fallando, pero el grant válido posterior queda guardado y utilizable. Datos sintéticos, redexterna bloqueada y PGlite aislado. El autor añade décima regresión con reconexiónintermedia; aún no se atribuye como ejecución de este revisor.

La exclusión sigue siendo local a cada instancia. CAS protege la escritura frente a respuestas viejas, pero no es lease distribuido ni garantiza que otro proceso no invoque al proveedor con el mismo refresh token. La semántica de rotación del proveedor real no fue probada. La generación por verified_at conserva límitesABA ya registrados enH3; CAS además compara el secreto cifrado.


## Cierre y versiones aceptadas

El autor documenta55/55 pruebas afectadas ytypecheck correctos sobre código final. Esta batería y el typecheck no fueron repetidos por este revisor; su evidencia independiente es la reproducción determinista porstdin antes y después de la corrección. El informe del autor conserva esos límites y atribuye el hallazgo a revisión independiente. El primer intento de cierre fue impedido correctamente porque el autor había reabierto la entrega para mejorar la legibilidad del informe. Se revisó el nuevo informe y se cotejaron todos los hashes después de su nueva presentación; fuentes ypruebas permanecieron iguales.

- server/team/oauth.ts: 2d323d3d0b7017caf12202771f4b92f97a285c6e333b6ee18dbaaeeb9ccc4830
- tests/hubspot-oauth-refresh.test.ts: 295c7f7042798eb9045f7be1a1a8d2715e1bd10778dfe2b7b1e0018584cee459
- coordination/reports/CODEX-HS-004.md: 9089f58d5081fa70c4c90114d056dd1f4b706cf94b5bc97d2d7cbc8daa990afb

La comparación de metadatos y secret mantiene exclusión de desconexión/reautorización intermedia. El caso nuevo cubre también reconexión del mismoportal entre error yéxito; el token previo no la sobreescribe. Sin problemas materiales restantes dentro deH7; dedup multiproceso/rotación real quedan límites explícitos, no funcionalidades acreditadas. CODEX-HS-004 aceptada por el revisor distinto del autor. Este propio informe se presenta sin autoaceptar; actualización de memoria corresponde al coordinador que la reserva.
