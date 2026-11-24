# D4 · Vigilancia desde el encargo

24/11/2026, Europe/Madrid.

«Vigilancia» usa el mismo encargo que «Fuentes» y «Capturas». Solo ofrece como firma una captura de HubSpot cuyo acta coincide con los bytes guardados en ese encargo. La confirmación fija la huella de la captura. El calendario muestra la firma, la última captura, la próxima lectura y los retrasos. El documento firmado y la confirmación recurrente permiten activar las lecturas mientras el servidor está abierto. Una pausa corta la lectura pendiente. Reiniciar conserva las capturas y el parte y deja la agenda en pausa hasta que se configure de nuevo la credencial.

El parte reutiliza las reglas y la barrera de salida de la CLI. La aceptación de una retenida exige confirmar su huella. «Descargar sal privada» es una acción separada con la misma sesión local. El visor independiente sigue mostrando su ejemplo.

## Verificación

- En Chrome, la distribuidora ficticia mostró el aviso de semana sin captura. Tras activar con el documento ficticio, se guardó una captura semanal, se marcó como retenida y se aceptó con confirmación. Se pausó la agenda y se abrió el parte. La consola quedó limpia. La demo usó transporte HubSpot simulado, reloj controlado, datos nuevos y red externa bloqueada.
- La prueba HTTP montó el registro normal de Verifica. Pasó el rechazo de una captura sin acta en otro encargo, una huella desfasada, un origen ajeno y una autorización sin confirmación o de otro contrato. Verificó el acta guardada, la huella del parte, la pausa y la protección de la descarga de sal.
- La prueba del temporizador conserva la paridad byte a byte con el script y comprueba fallo de escritura, reapertura, caducidad y cancelación.

## Inventario pendiente de regenerar

El servidor completo montó tres rutas nuevas. `node tools/api/inventory.mjs --check` señala exactamente estas tres incorporaciones. El inventario canónico `docs/api.md` sigue reservado por `CLAUDE-API-INVENTORY`. Sus huellas difieren de la entrega en revisión, por lo que se requiere actualizar esa entrega y regenerar el inventario.

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/verifica/engagements/:id/watch` | Candidatas a captura de firma o agenda del encargo. |
| POST | `/api/verifica/engagements/:id/watch` | Fijar la firma, activar, pausar o aceptar una captura retenida. |
| GET | `/api/verifica/engagements/:id/watch/artifacts/:file` | `report` obtiene el parte verificable. `salt` descarga la sal privada. |

La migración usa la última captura de la vigilancia desde el encargo y se para mientras esté retenida ([D5](CODEX-VERIFICA-D5-MIGRACION.md)). Queda validar las fuentes de la fase B.
