# 295 · Revisión independiente de Pipedrive

8/11/2026, Europe/Madrid. **Devolver para R2 por dos fallos de normalización.** Alcance interno, lectura ficticia/sintética; no existe conexión observada, interfaz o montaje en el Radar. Cuatro fuentes de Claude y dependencias comunes conservadas intactas.

## F1 · Un indicador de borrado ilegible se trata como falso (medio, latente)

`shared/pipedrive-source.ts`, normalizePipedriveRecord: solo se trata `is_deleted === true`. Si el campo llega presente con un tipo no admitido (`"true"`, `"false"`, null, 1 u objeto), se ignora y una oportunidad con status won se publica completed, sin omitidos y con lectura complete. No se debe convertir la cadena "true" a true: es un dato ilegible y debe quedar explicado como tal, sin condición sana ni cobertura completa. La misma falta de validación afecta is_archived, aunque ahí el efecto directo es la etiqueta de archivo.

Sonda propia ejecutó diez combinaciones (dos campos × cinco valores) mediante fetch sintético y el lector real: las diez producen complete/completed/unknownValue0. Control positivo con booleanos reales conserva won/open/deleted correctamente. No se afirma que la API real envíe esos valores, ni existe una cuenta afectada observada; es una prueba de la respuesta del adaptador a datos incompatibles.

## F2 · Date.parse inventa un instante y puede cambiar qué duplicado se conserva (medio)

El helper rfc3339 comprueba forma con regex y después usa Date.parse. `2026-02-30T09:00:00Z` se convierte a 2 de marzo, `2026-04-31T09:00:00Z` a 1 de mayo y hora24 a medianoche del día siguiente, en vez de conservar updatedAt:null como fecha ilegible.

Impacto reproducido en dos páginas del lector real: página1 ID22 lost con `2026-03-02T08:00:00Z`; página2 mismo ID won con `2026-02-30T09:00:00Z`. Al inventar las09:00 del2de marzo, la segunda sustituye la condición blocked por completed. La lectura ya es partial por duplicado; no se atribuye complete en este caso ni renovación de observedAt por updatedAt. El registro seleccionado y su fecha sí son incorrectos.

## Evidencia propia

Banco fijo `tests/.tmp/pipedrive295-BNJnC5`, driver `tests/.tmp/review-pipedrive295.cjs`, sondas `tests/.tmp/pipedrive295-probes.ts`.

- **14/14 autora**, 2,59 s, con servidores HTTP reales de bucle local, sin cambiar aserciones. Tipos focales exit0.
- **4/7 propias pasan y3 fallan**: F1, fechas y efecto de fechas en duplicados. Controles verdes: booleanos/calendario válidos con desfase, fetch que lanza síncronamente, aborto durante credential sin llamada y objetos de contexto sin proyección al Radar.
- Aislamiento causal privado: solo guardia de booleanos →5/7 (quedan dos de fechas); solo calendario/hora →6/7 (queda F1); ambas →**21/21** (14 originales+7propias), tipos0. Mismas aserciones. El candidato solo orienta: Claude debe implementarlo y presentarlo en sus archivos. Fuente privada y checkout restaurados/cotejados por SHA; causal-result.json/causal-restored.json conservados.
- Cuatro hashes presentados y fuentes/dependencias cotejados antes/después. shared/source-reading y server/source-read-transport proceden de ZendeskR3 aceptada; contrato commitments también aceptado. CIM posterior limitado al banco: ningún proceso vivo. Entorno mínimo y red externa bloqueada, sin browser/4601/4331/4334, proveedor real ni credencial real.

No se repitieron los18mutantes comunicados por la autora. No se acepta una lectura synthetic/local-test como observación de una cuenta real ni se modifica transporte común para resolver normalización de Pipedrive.

## Contraste documental

La [guía oficial de migración v2](https://pipedrive.readme.io/docs/pipedrive-api-v2-migration-guide) establece fechas con zona/RFC3339. La conversión de un día imposible a otro no queda justificada por esa guía. [Autenticación oficial](https://pipedrive.readme.io/docs/core-api-concepts-authentication) documenta x-api-token y el [patrón de peticiones](https://pipedrive.readme.io/docs/core-api-concepts-requests) documenta el host de empresa; esos documentos respaldan construcción, no acceso real ni equivalencia de cuentas.

Observación documental menor: el [listado v2 de personas](https://developers.pipedrive.com/docs/api/v1/Persons) sí declara actualmente máximo500 y valor predeterminado100. Pedir100 es una política conservadora válida; conviene actualizar la explicación «no confirmado» para distinguir política propia de incertidumbre documental. No se exige ampliar el tamaño de página. La [referencia de oportunidades](https://developers.pipedrive.com/docs/api/v1/Deals) separa archivadas y permite los cuatro estados citados; no acredita el inventario íntegro de la cuenta. Sin ensayo real de scopes/cuerpos/permisos.

## Huellas revisadas, no aceptadas

| Archivo | SHA-256 |
| --- | --- |
| `shared/pipedrive-source.ts` | `1c1e13f107c9df08550a3941d8b8c1bbf6796b26d708622a1d3cd91bb7185fe3` |
| `server/pipedrive-source.ts` | `d7343b7c269cc150ef93772d5cd6013124ec9e87f91d2734d8ed592f58af9b38` |
| `tests/pipedrive-source.test.ts` | `dc5608e3550590a32f0265f856a659b02d3ea1bee81ab4340b723b041ff9244a` |
| `coordination/reports/CLAUDE-SOURCE-PIPEDRIVE.md` | `1969ea0061c79a3081abf7e3fc79e2b63275e209c1ca6da40e317dcb791c55f9` |

Las cuatro reservas permanecen para Claude B. El montaje de fuentes/estado en Integraciones o Radar sigue siendo una unidad distinta.

## R2 · Dictamen del 9/11/2026

La versión R2 corrige los indicadores ilegibles y los días y horas imposibles de la devolución original. Banco `tests/.tmp/pipedrive295-pmRs4Z` con 17 pruebas de la autora, las siete sondas anteriores y tipos correctos. Se conservan las cuatro fuentes de la presentación R2 y las dependencias aceptadas. No se repitieron los mutantes de autora.

**F3 · Una fecha cuya conversión UTC excede el contrato rechaza la lectura entera.** `9999-12-31T23:45:00-01:00` y `0000-01-01T00:15:00+01:00` pasan la forma y calendario locales. `toISOString` emite un año extendido que `SourceReading` rechaza. El listado con esas dos filas y una tercera válida termina en `ZodError`. La consulta por ID también rechaza. Una fecha no representable debería conservarse como desconocida, con la fila y el resto de la lectura válidos. Severidad media por pérdida del resultado ante una sola fila sintética. La frecuencia en el proveedor es desconocida.

**F4 · El orden de llegada gana al orden temporal con dos fracciones dentro del mismo milisegundo.** La misma oportunidad llega perdida a `.123100Z` y ganada a `.123900+01:00` con la hora local equivalente. Ambas fechas se publican como `.123Z`. En un orden queda `blocked` y en el otro `completed`. El lector ya declara cobertura parcial y un duplicado. El hallazgo afecta al estado seleccionado. La aserción R2 de autora exige conservar la representación pública en milisegundos, así que cambiarla por seis dígitos rompe un contrato comprobado. Severidad baja en una lectura parcial, con un caso sintético admitido por el parser.

**Control causal.** Las dos sondas nuevas fallan sobre R2. En `pipedrive295-r2-causal-LTRRkX`, el control del año y el orden interno de la fracción pasan cada uno su sonda y dejan la otra en rojo. Juntos pasan 26/26 y tipos 0, con las aserciones originales intactas. La comparación privada usa la fracción solo para elegir el duplicado. El primer prototipo `pipedrive295-r2-causal-bGp2dQ` llegó a 25/26 al cambiar la representación pública y se descartó. Las fuentes privadas se restauraron por hash después de ambos bancos y las fuentes de autora permanecen intactas.

Se devuelve para R3 bajo las mismas cuatro reservas. La política de personas de 100 queda bien descrita en el código R2. El apartado histórico del informe que aún llama desconocido al límite de personas necesita conciliación con su propio párrafo R2. No se exige cambiar el tamaño de página.

| Archivo R2 | SHA-256 |
| --- | --- |
| `shared/pipedrive-source.ts` | `a0c209981832ac5f5983941ba1b0685964042fe3db49196eac9254a3a59ac82a` |
| `server/pipedrive-source.ts` | `d7343b7c269cc150ef93772d5cd6013124ec9e87f91d2734d8ed592f58af9b38` |
| `tests/pipedrive-source.test.ts` | `7cc2c77398f31c4f389eee166f23c3e6c0706ab2b62ca515197aa32269d27b39` |
| `coordination/reports/CLAUDE-SOURCE-PIPEDRIVE.md` | `28a9701d571591bd1848b8254a4c747bb675a979de5e5383e3febf8f0895675e` |

La prueba usa respuestas sintéticas y loopback. La corrección privada orienta al autor y no forma parte del producto.

## R3 · Aceptación del 9/11/2026

Se repitieron **19 pruebas de autora, siete sondas originales y dos sondas de frontera**, todas correctas, con tipos focales limpios. `tests/.tmp/pipedrive295-BYVOsl` contiene los logs, las fuentes congeladas y el recibo de las dos sondas copiadas por hash sin editar sus aserciones. Se verificaron las cuatro huellas presentadas antes y después. La fuente del transporte y sus dependencias conserva los bytes aceptados.

La conversión UTC comprueba el formato público antes de devolver la fecha. Listado y consulta por ID conservan las filas con fecha desconocida cuando el resultado excede los cuatro dígitos. Los duplicados conservan la precisión adicional en una clave local a la lectura, con ancho fijo. Se elige el mismo registro en ambos órdenes y el campo público conserva milisegundos. A igualdad de instante queda el primer registro y se cuenta el duplicado. La documentación distingue la política de página de 100 del máximo documentado.

| Archivo R3 | SHA-256 |
| --- | --- |
| `shared/pipedrive-source.ts` | `298e3b1c33950272494a8b307967a8eaf2dea085c0c8d071b908310d9df708f6` |
| `server/pipedrive-source.ts` | `e709256d4fe27ecb373ed0df0e686bd37de7d99a11f562358d5f2505df1235e8` |
| `tests/pipedrive-source.test.ts` | `266cd696d62ba63fa57271c2abfafcef2b7c6278dd05723124c027538a7100e3` |
| `coordination/reports/CLAUDE-SOURCE-PIPEDRIVE.md` | `2f7247d8c995435cc8356fe710f369e36831ec509715318fcf0da18f3c171631` |

Se acepta `CLAUDE-SOURCE-PIPEDRIVE` sobre estas huellas. La prueba causal anterior se conserva. Los nueve mutantes R3 se atribuyen a la autora. Las pruebas actuales cubren el adaptador interno con datos sintéticos y loopback. La conexión, cuenta, permiso, montaje y lectura observada del proveedor siguen fuera de este dictamen.
