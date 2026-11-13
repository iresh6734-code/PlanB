# 296 · Revisión del contrato de estado de fuentes

8/11/2026, Europe/Madrid. **Requiere R2 por dos afirmaciones que la evidencia no sostiene.** Código interno; sin API, persistencia, pantalla o acción de proveedor montadas. No se editaron las tres fuentes de Claude ni los adaptadores comunes.

## F1 · Un intento sin lectura se presenta como observado en proveedor (medio)

`describeSourceStatus` elige provider-observed por tener una SourceReading no-fixture y un registro de autorización, con independencia de que se enviara una petición o llegaran datos. La declaración resultante dice «Lectura realizada en el proveedor…».

Tres reproducciones con createZendeskSource real y transporte R3 aceptado, pero fetch sintético y cuenta ficticia: credential lanza antes de fetch (requests0), señal ya abortada (requests0), fetch rechaza por red (requests1, pages0). Las tres conservan correctamente records:null, causa y connected:false, pero el nivel y el texto afirman una lectura observada que no ocurrió. No se debe arreglar ocultando el fallo o mostrando cero registros: el intento debe permanecer visible con su causa/acción, distinguiéndose de datos observados.

No se afirma que el adaptador consultara una cuenta real: no lo hizo. La sonda demuestra el resultado del contrato puro para recibos generados por los caminos de fallo reales del adaptador. Haber invocado fetch tampoco acredita por sí solo una respuesta del proveedor.

## F2 · Autorización posterior aplicada retrospectivamente (medio, contrato)

Una lectura empieza/termina a las10:00, y una entrada con authorizedAt10:01 se acepta como autorización de esa lectura. Solo se comprueba existencia del objeto de autorización, no su relación temporal con startedAt. El nivel resultante es provider-observed y authorizedAt se publica como si respaldara el recibo anterior.

La autorización debe corresponder a la cuenta/alcance y existir al comenzar la operación que pretende respaldar; una fecha posterior no acredita eso. Aquí se prueba la cronología, no una identidad humana autenticada: ambos valores son metadatos ficticios. Este módulo puro no ejecuta permisos ni llamadas y la corrección no sustituye controles del futuro anfitrión. No hubo lectura real sin permiso.

## Verificación propia

Banco `tests/.tmp/source-status296-lRfgvP`, driver `tests/.tmp/review-source-status296.cjs` y sondas `tests/.tmp/source-status296-probes.ts`.

- **8/8 originales**, 0,93s; tipos focales exit0. Servidores HTTP ficticios locales; cuenta real inexistente. Las fuentes Zendesk/transport/source-reading coinciden con R3 aceptada.
- **2/6 propias pasan,4 fallan**: tres variantes F1 y una F2. Controles positivos: lectura sintética con autorización previa y rechazo de cuenta/proveedor distintos. Las causas, acciones y recuentos null se comprueban antes de la aserción que reproduce F1.
- Aislamiento causal solo privado: cronología sola→3/6, distinción de intento sola→5/6, ambas→**14/14** (8originales+6propias), tipos0. La prueba orientativa añade un nivel de intento fallido y rechaza autorización posterior al inicio. La autora puede escoger un diseño equivalente; no se impone un cuarto nivel por este ejemplo.
- Mismas aserciones; archivo privado restaurado por hash y tres huellas del checkout intactas. causal-result.json y causal-restored.json conservados. CIM posterior limitado al banco: sin procesos vivos. Entorno mínimo y red externa bloqueada, sin navegador, 4601/4331/4334, credenciales reales ni proveedor.

Los quince mutantes comunicados por Claude no se repitieron. Las pruebas «live» con fetch falso o cambio de etiqueta de una fixture no son observaciones de una cuenta. SourceReading y sourceRegistryEntry son contratos de datos confiados por el anfitrión, no firmas ni autenticación de procedencia por sí mismos.

## Huellas revisadas, no aceptadas

| Archivo | SHA-256 |
| --- | --- |
| `shared/source-status.ts` | `cc9f8cf329029aa3c0c9a4ee92dbbc7462a689d38efd2ccce76fd3a8a45e052f` |
| `tests/source-status.test.ts` | `461d8d620191735d412ceda2f8e9e3021647705be819296719e9dfe3480a8b29` |
| `coordination/plans/SOURCE-STATUS-INTEGRATIONS-CONTRACT.md` | `1ecebfadcdb2ceaf451d808d99c54952c7a05f2c08115d5e74411ef8f25e5d8c` |

Tres reservas conservadas para R2. La propuesta de persistencia/API/consumidor sigue pendiente de acuerdo y reservas exactas; esta revisión no concede acceso a cuentas ni montaje de producto.

## R2 · Dictamen del 9/11/2026

R2 atiende F1 y F2 en los casos originales. `source-status296-7FR7rl` conserva la presentación. Pasan 13/13 pruebas de autora con loopback permitido, 6/6 sondas anteriores y tipos. El primer entorno restringido convirtió llamadas al servidor local en fallos de red y dejó 6/13. Se repitió solo ese bloque sobre la misma fuente en `author-loopback-authorized.log`. Los siete fallos iniciales son del entorno de prueba.

**F3 · La vista niega una respuesta que ya entregó cabeceras.** El transporte aceptado puede abortar después de que llegue HTTP 200 y antes de terminar de leer el cuerpo. La sonda cancela dentro del primer `pull` del cuerpo y observa `requests:1`, `pages:0`, `aborted`. El detalle mantiene el recuento desconocido y la categoría de intento. La frase «Se envió la petición y no llegó respuesta» contradice el transporte observado. El recibo no distingue cancelación o plazo antes y después de cabeceras. Hace falta una categoría o texto que preserve esa incertidumbre. El error HTTP confirmado, la falta de petición y el fallo de red siguen teniendo sus propias evidencias.

**F4 · Una autorización posterior aceptada por el esquema puede parecer simultánea.** En una lectura de listado vacía y completa, `startedAt` acaba en `.000Z`. Una autorización a `.000001Z` pasa el esquema y recibe el mismo valor en `Date.parse`. La derivación la acepta como previa o igual. La comparación necesita cubrir la precisión admitida o rechazar de forma explícita la precisión que no se puede ordenar. Este caso prueba la atribución de la vista y no una autorización efectiva del anfitrión.

Dos sondas nuevas reproducen ambos fallos en `tests/.tmp/source-status296-7FR7rl/s/tests/independent-source-status296-r2-boundaries.test.ts`. En `source-status296-r2-causal-GUoPSq`, cada guardia privada pasa su sonda y deja la otra en rojo. Juntas pasan las ocho sondas y tipos. Las 13 pruebas de autora intactas dan 11/13 con el candidato, porque dos aserciones de R2 fijan `no-response` para un plazo y el conjunto anterior de evidencias. Ese candidato demuestra la causa. La autora deberá acordar la semántica corregida y actualizar de forma explícita esos dos oráculos si cambia la categoría. Se conservan la causa, el recuento nulo, la acción y el rechazo de lecturas de otro ámbito. Copia privada y fuentes compartidas cotejadas por hash.

| Archivo R2 | SHA-256 |
| --- | --- |
| `shared/source-status.ts` | `050b3d55ebe8b7b7e987ef4b5cb8f7c03e25f1d5533de0a116d17599698be2ae` |
| `tests/source-status.test.ts` | `df0046807af9a9203c90198240685a180296a28bdc30fd4ee7fce88494382e51` |
| `coordination/plans/SOURCE-STATUS-INTEGRATIONS-CONTRACT.md` | `5d9dd50c2e150e78c685276b0bf3917d104712c380d1aff35261c9c30858fda3` |

Se devuelve a R3 con las mismas tres reservas. El montaje del registro y del consumidor espera el contrato corregido.

## R3 · Favorable y aceptada

9 de noviembre de 2026, Europe/Madrid. Tres huellas revisadas:

- `shared/source-status.ts`: `fddfda1bd5b73d4b5a32e0eca96e6b58a9188d6b7b50be911421c37cf2a08da1`
- `tests/source-status.test.ts`: `d3d1325dd50b48cc1d6bf261cf8effb38c7567e6836c37a8f5f3827734398839`
- `coordination/plans/SOURCE-STATUS-INTEGRATIONS-CONTRACT.md`: `6f457a07815bff84b2e64eef187f2577cb7fe1efe5b58b8a1c2a81eddc3ad1ae`

Banco source-status296-4kqH8u:15/15autora,6/6sondas originales y2/2fronteraR2 copiadas sin cambios, tipos focales0 incluidos los tres archivos de pruebas. Las dependencias Zendesk/SourceReading/transporte se cotejaron contra versiones aceptadas; no se modificaron. El banco de autora usa su loopback de ensayo autorizado y las sondas usan transportes inyectados; no hay petición a proveedor real. Fuentes privadas y de presentación estables por hash.

F3 queda corregida con evidencia interrupted para timeout/aborted con petición enviada. La vista conserva causa, acción, acceso desconocido y recuento null. No niega cabeceras que pudieron llegar. Cancelación previa sigue not-sent; network conserva su rama sin respuesta y errores HTTP/respuesta inutilizable conservan las suyas. La sonda original que aborta dentro del cuerpo200pasa sin cambiar aserciones.

F4 queda corregida dentro de la precisión documentada y ejercida (hasta nueve decimales): el orden compara el instante de milisegundos y la fracción adicional. Pasan el microsegundo posterior original, casos de nanosegundo, igualdad con distinto número de decimales y orden entre segundos. No se atribuye a esta revisión una garantía de precisión arbitraria más allá del rango documentado. La autorización sigue siendo dato confiado del anfitrión; esto comprueba coherencia, no autentica procedencia.

La suite autora evoluciona explícitamente la lista de EvidenceKind con interrupted y sus casos; no se debilitaron las dos regresiones originales de Codex. Se acepta el módulo interno y contrato, no una conexión ni pantalla/API montada. connected sigue false. Mutantes reportados por autora no se repitieron aquí.

La puerta306 pasa a tener una dependencia aceptada: HISTORY-UI debe fijar esta huella, añadir el texto interrupted y repetir su combinación; no queda automáticamente aceptada por este dictamen. Mantiene sus propias siete reservas.
