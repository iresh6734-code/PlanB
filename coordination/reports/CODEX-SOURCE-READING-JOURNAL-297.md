# 297 · Diario local cifrado de lecturas de fuentes

8/11/2026, Europe/Madrid. Presentado para revisión independiente. Cuatro rutas propias; no autoaceptación. Se reutilizan SourceReading y Store aceptados, sin consumir SourceStatus en corrección ni modificar adaptadores.

## Resultado

`server/source-reading-journal.ts` conserva lecturas completas, parciales y no disponibles con su cuenta, objetivo y fechas originales. Un recibo de persistencia local lleva secuencia, hash de la lectura normalizada, fecha de guardado y enlace al anterior. No se llama acuse de proveedor, observación autenticada, autorización o conexión. Ninguna lectura externa se inicia y no se monta una ruta API o pantalla.

La consulta no crea datos, repara corrupción o actualiza fechas. Un alta usa BEGIN IMMEDIATE y la revisión esperada para evitar sobrescribir a otro escritor. Repetir exactamente el contenido devuelve el recibo original sin escribir, incluso tras avanzar el head. El historial distingue orden de persistencia y fechas del proveedor, sin elegir automáticamente una lectura «más reciente».

El estado usa una sola clave meta y el cifrado existente de Store en archivo. Memoria se identifica como memory-only. Máximos:32recibos,512KiB por lectura y2MiB en claro por diario. Se rechaza un alta fuera del límite completa; nunca se purga evidencia ni se reduce su cobertura para que quepa. Una escritura con acuse incierto pide conciliación por relectura/replay, no afirma «no guardado».

## Pruebas propias

Banco nuevo `tests/.tmp/source-journal297-5Riu4S`, driver `tests/.tmp/verify-source-journal297.cjs`. Fuentes congeladas y cotejadas antes/después, entorno mínimo, claves ficticias nuevas, red exterior bloqueada. **18/18 pruebas nuevas**,4,34s, y **29/29 regresiones Zendesk R3**,2,72s. Tipos focales exit0. Sin reintentos, omisiones o cancelaciones en los pases completos.

Se comprueba:

- lectura de ausencia sin escrituras, identidad ausente distinta de historial vacío;
- alta, replay inmutable y objetos devueltos independientes del estado guardado;
- cobertura/cause/objetivo exactos de lecturas parciales y fallidas;
- aislamiento de cuentas/proveedores y lookup frente a listing;
- conservación de registros, capturas, cambios y metadatos CRM ajenos a la clave;
- dos conexiones SQLite con head antiguo: conflicto explícito y posterior conciliación;
- cifrado de archivo y lectura desde otro proceso Node, con mismo recibo y fechas después del reinicio;
- corrupción de formato, identidad, secuencia, enlace, contenido, hash y fecha sin reparación;
- fila cifrada ilegible o plaintext sobre conexión abierta no adoptadas;
- rollback tras set, acuse perdido después de COMMIT y ausencia de relectura verificable;
- reloj inválido/regresivo, lectura futura y cambio reentrante de instalación;
- límites de entradas/bytes sin pruning ni truncado, y lectura antigua guardada después de una nueva.

Cinco controles causales sobre copias privadas, con una sonda seleccionada cada vez: eliminar CAS, replay, digest de lectura, verificación tras set o distinción de acuse incierto hace fallar la aserción prevista. **5/5 detectados**; los demás casos no se ejecutan en esos pases focales, no se presentan como una batería completa. Fuente privada restaurada y hash del checkout intacto. Script `tests/.tmp/causal-source-journal297.cjs`, causal-result.json con restauración. CIM posterior limitado al banco: ningún proceso vivo.

## Límites de la entrega

Es persistencia interna, no función visible de la app. El futuro anfitrión debe autorizar el acceso al diario y autenticar la procedencia; un SourceReading válido no lo hace. Puede conservar etiquetas sensibles que ya existan en una lectura normalizada, dentro del almacenamiento cifrado, sin publicarlas por HTTP. Rechaza campos extra de credencial; no se presenta como detector universal de secretos dentro de texto libre.

El hash encadenado comprueba coherencia, no firma autoría ni protege contra un proceso que tenga permiso para reescribir un estado coherente. No detecta una copia antigua válida o la retirada coherente de un sufijo sin ancla externa. No hay recuperación/backup completos ni covers A4. Los límites requieren una futura decisión explícita de retención; hoy no se ofrece borrar para continuar.

El rechazo de plaintext se aplica a lo que encuentra la conexión ya abierta. La migración general anterior de Store al abrir la base no cambia aquí; no se atribuye protección histórica de un archivo antes de abrirlo. Dos conexiones acreditan CAS de un escritor obsoleto; no se afirma una carrera multiproceso simultánea. El proceso independiente comprueba reinicio/lectura, no una instalación comercial ni otro navegador.

No SourceStatus working, cuenta configurada, autorización, credencial real, proveedor, App/main, demo4601, piloto original, build/dist raíz, dependencia instalada, commit o despliegue. Contrato en `coordination/plans/SOURCE-READING-JOURNAL-297-CONTRACT.md`.

## Huellas

| Archivo | SHA-256 |
| --- | --- |
| `server/source-reading-journal.ts` | `85b9a7d106646c1e045c6904bf07682ace356d088db0d9536cc75d5e91354d01` |
| `tests/source-reading-journal.test.ts` | `7c05bfe7272b6dfc3257966a1543a9ed018a5e6beffb90e6d849dac3df8b9e7d` |

Las huellas del contrato actualizado y este informe las registra submit. Siguiente: revisión independiente y, solo después de SourceStatus aceptada y reservas nuevas, registro de fuentes y consulta local de estado con ficción identificada.
