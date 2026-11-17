# 384 · El ZIP exige su iniciador antes de registrar la descarga

16/11/2026, Europe/Madrid. La exportación generaba «ABRIR PLAN B.cmd» aun cuando el ZIP no llevaba `launch.cjs`. El control sobre la API con el exportador anterior devuelve 200 en una instalación ficticia incompleta. El otro control detecta que un iniciador vacío en la raíz impedía usar el de desarrollo.

El exportador lee los bytes de un archivo regular y no vacío antes de crear el ZIP. Prefiere `launch.cjs` de la distribución y prueba `scripts/launch.cjs` cuando el anterior falta o está vacío. Incluye esos mismos bytes en el ZIP. Si ninguno está disponible, la API devuelve 503 sin adjunto y conserva la custodia confirmada anterior. Esta comprobación se aplica a la API legada y a la exportación cifrada que verifica revisión.

- Control anterior: fallan los dos casos. El actual incluye los bytes exactos que referencia el lanzador .cmd.
- Banco ZIP y custodia: 7/7. La fixture reservada de 373 incluye ahora un iniciador ficticio regular y mantiene intactas sus aserciones de concurrencia y custodia.
- Banco final: 199 correctas de 200, cero fallos, un TODO preexistente de QA091 sobre la generación con un plan inválido. Typecheck limpio. El primer banco ampliado, con loopback restringido, agotó el plazo al probar los arranques de QA091. Se repitió en otro banco con loopback y red exterior bloqueada.
- El test positivo abre el ZIP generado y compara las entradas; usa una cabecera PE ficticia y no ejecuta ese Node. El recorrido completo de navegador y recuperación corresponde a los informes anteriores. Queda por repetirlo sobre una candidata que incluya 382 y 384.

Evidencia en `tests/.tmp/portable384-38d713e7`. Las huellas registradas para las tres rutas coinciden con las fuentes probadas. Datos ficticios y temporales nuevos.
