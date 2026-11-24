# Verifica · Mega Plan 3 · Corte 0 de integridad

24/11/2026 · Europe/Madrid. Encargo `CODEX-VERIFICA-INTEGRIDAD-0` sobre `effc450`, en `planb-v0.3-local`.

## Cambios

- **Lectura.** La rotación de capturas, la captura recién leída, el acta, su índice y la fecha del encargo se guardan en una transacción SQLite. Si falla la escritura, se revierten los cambios y la lectura pasa a fallida con un mensaje que permite reintentar.
- **Emisión.** Tras el cifrado, el servidor comprueba las huellas actuales y valida que las fuentes sigan listas, dentro de la transacción que guarda la emisión. Si cambiaron, devuelve `409`, conserva la emisión anterior y no entrega la llave generada por el intento rechazado. La actualización de la fecha se guarda junto a la emisión.

## Evidencia

- Las dos regresiones fallaron con `effc450` y pasan con el arreglo. La emisión anterior devolvía `200` después de cambiar una fuente durante el cifrado. Un fallo al actualizar la fecha del encargo dejaba escapar un rechazo después de las escrituras de captura y acta.
- Con el arreglo, una escritura fallida conserva todas las filas anteriores del expediente, incluidas capturas, actas e índice. El siguiente intento rota la captura y guarda el acta. La emisión rechazada conserva el informe y la copia anteriores byte a byte. Al repetir con las fuentes nuevas se emite un informe vigente con otra huella.
- 90/90 pruebas de Verifica e inventario API, con `NODE_ENV=test`, HubSpot simulado y red externa bloqueada. La batería incluye la paridad de la captura, el acta y el informe con los scripts, y la reproducción del informe con copia y llave. `tsc --noEmit` correcto. Inventario documental al día con 108 rutas y `git diff --check` correcto.

## Continuidad

- Corte presentado para revisión local. El ensayo de guardado usa SQLite en memoria e inyección de fallo. Queda fuera la simulación de un apagado del equipo y la validación con un portal auténtico.
- El [Mega Plan 3](https://claude.ai/artifact/JoivHHdAHkwVuWMu9LDAan) se contrastó en la sesión «Plan B diferenciación y pivote estratégico» (`local_a9b1f3a9-fc1a-403f-9c83-fe586b9f067c`) y con la respuesta de Claude en el canal compartido (`c687a837-0094-40b7-968d-56afd9af5713`). El corte 0 precede al resto. El siguiente trabajo de Codex es medir con datos ficticios el comportamiento con una pyme y cerca de los límites del lector mientras se cierra el Mega Plan 2. El expediente de la fase 1 espera al cierre de ese plan y a la validación de las fuentes de la fase B.
- Se deja esta evidencia en el informe del encargo porque `CONTEXTO-PROYECTO.md` sigue reservado por `CODEX-LAB-035`, en revisión.
