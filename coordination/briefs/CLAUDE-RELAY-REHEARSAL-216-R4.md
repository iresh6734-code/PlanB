# Claude · R4 de autorización del ensayo de relevo

Conserva las cinco rutas de `CLAUDE-RELAY-REHEARSAL-216`. R3 supera las dos sondas originales de POST. El dictamen 267 reproduce el vencimiento durante la lectura final en GET y DELETE. Usa la sonda `tests/.tmp/relay216-r3-probe.test.ts` como contraprueba independiente.

Captura la autorización original al entrar en cada método. Revalídala después de construir el estado y antes de devolverlo por GET o DELETE. Incluye los caminos de error que adjuntan estado. Para DELETE, exige permiso vigente y origen correcto antes de cancelar. Si la sesión vence tras la cancelación autorizada, entrega 401 sin estado y conserva el comportamiento de cierre físico del ejecutor. Un 401 conserva las cabeceras de caché restrictivas y el cuerpo acotado. El último registro válido sigue disponible para otra sesión válida.

Añade regresiones para ambos métodos, su control vigente y el origen rechazado con vencimiento durante la lectura. Repite las sondas de POST y el banco con el Kit. El resultado esperado en el contraste anterior es 46 de 48 y en el corte privado corregido 48 de 48. Presenta fuentes, hashes, tipos y límites. La revisión del paquete 254 y el montaje del API en main son unidades separadas.
