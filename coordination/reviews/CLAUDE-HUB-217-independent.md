# Hub 217 devuelto para R2

## Dictamen vigente · R2 favorable para el consumidor

6 de noviembre de 2026, Europe/Madrid. Las siete huellas de R2 coinciden con el corte `tests/.tmp/continuity-ui-review-lhEzps` y el checkout. Pasan cinco pruebas de cliente, 14 recorridos Chromium del Hub con errores inducidos y el recorrido adicional del Kit real. Los tipos focales del conjunto son correctos. Carga parcial, contexto del anfitrión, respuestas tardías, caducidad, bloqueo durante ensayo, pérdida de acuse, cancelación y móvil se probaron con las aserciones de la entrega. Las fuentes de HubSpot y del ensayo se publican independientemente de la evidencia de copia.

El recorrido del Kit usa 224 R2 desplegado en raíz ficticia nueva. El proveedor simulado no recibe peticiones y se muestra la operación única sin duplicación. La primera corrida propia omitía dos scripts de 116/106 al construir la proyección y falló antes del recorrido. Se cotejaron los hashes de esos scripts aceptados, se completó la proyección y se repitió en una raíz nueva. Logs `kit-browser.log`, `kit-browser-rerun.log` y `kit-rerun-result.json`. El caso del Kit no equivale a probar sus errores de autorización al vencer sesión.

El conjunto de navegador tiene 24 casos distintos, cinco del mapa, quince del Hub y cuatro del montaje 253. Se revisaron las capturas de la App en 1440 y 320. La prueba de App usa una proyección con el parche de 253 y main compilado, SQLite de archivo y proveedor ficticio. Las otras pruebas usan arneses de componente.

Se acepta el consumidor del Hub. La API 216 conserva su propia R3 por las dos fronteras de permiso reproducidas en 258 y no se registra en el arranque con esta aceptación. El montaje del vínculo de contexto 242 y de la navegación en App necesita su unidad de integración. 253 ofrece el bloque en ContinuityHome, con las acciones opcionales previstas.

## Dictamen anterior · Primera presentación

Las siete huellas presentadas coinciden. Pasan los cuatro Node del autor y los tipos focales. Cuatro fronteras fallan en Chromium aislado con el componente compilado, createBaseApp, los tres registradores y SQLite en memoria por Fastify inject. Es un arnés del hub. El proveedor y el ejecutor son ficticios y no hay sockets de prueba, tráfico externo ni cambios CRM. Los diez recorridos originales y el Kit real se atribuyen al informe del autor.

| Frontera | Observación reproducida |
| --- | --- |
| Una fuente de tres queda retenida | Copia y lectura ya devolvieron 200. Durante la retención solo aparece «Leyendo la evidencia…». Al soltar Relevo se muestra la copia. Promise.all impide publicar la carga parcial. |
| Bloqueo durante lectura | La sesión se bloquea tras iniciar el GET de identidad. La API devuelve 401 y no persiste evidencia. La UI dice «No se leyó nada». Se observó una lectura del proveedor ficticio y cero consultas de objetos. |
| Pérdida de respuesta del ensayo | El ejecutor sintético termina una vez y el servidor guarda completed con respuesta 200. Se pierde solo esa respuesta. El GET posterior muestra completado en el pasaporte, mientras el aviso dice «No se pudo completar el ensayo. No se cambió nada». |
| Cambio de contexto del anfitrión | Con evidencia de la captura A, el anfitrión pasa B. Siguen apareciendo tres afirmaciones observadas de A en el pasaporte y la antigüedad de A en el mapa. El hub etiqueta esa misma respuesta con B y el mapa pierde la oportunidad de excluirla. |

Los contadores, respuestas y aserciones están en tests/.tmp/hub230-911bcf7b/browser-result.json, browser.log y la sonda. Se preservan 268 huellas. La primera corrida confirmó los dos primeros casos y se detuvo en un selector del arnés con alcance incorrecto. Tras corregirlo y cargar el CSS del componente se repitieron los cuatro. Se cerraron Chromium y las instancias propias de Fastify. La sonda de contexto cambia la prop del anfitrión sin importar una segunda base. Comprueba la frontera del componente que 217 ofrece al montaje.

El handoff de 217 también contiene un registro de HubSpot ya superado por 218. El montaje debe consumir el mismo registro y panel de Integraciones. «Abrir Integraciones» debe navegar a esa superficie, conforme al encargo aceptado 223. Evita duplicar la autorización, el consentimiento y la caducidad. No se ha montado 217 en la candidata.
