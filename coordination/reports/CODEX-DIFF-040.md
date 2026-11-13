# DIFF040 · Comparación de capturas guardadas

29/10/2026, 22:46 Europe/Madrid. Autor Codex, skill base compliance-autopilot-execution-core. Continuación de desarrollo separada del rediseño del piloto. Siete archivos reservados y cero solapes con reservas Claude comprobados al inicio y cierre.

## Resultado

Motor puro en `shared/capture-comparison.ts` y API de solo lectura del **CRM completo**, registrada mediante dos líneas nuevas de `server/v2.ts`:

`GET /api/v2/captures/compare?from=<ID de captura>&to=<ID de captura>&offset=0&limit=50`

Los IDs se obtienen del historial de capturas y deben codificarse como valores de query. Son las identidades compuestas ya usadas por Store: `snapshot.id:capturedAt`. No son rutas de archivos. La API no está registrada en el backend de equipo del piloto y **no se ha desplegado en 4331/4334**.

- Recuentos por entidad de registros añadidos, ausentes, modificados y sin cambios; página ordenada por entidad e ID con detalles de campos. Ausencia, null, vacío, booleanos, números y texto se comparan sin coerción.
- Ausente solo describe la segunda captura: no afirma un borrado en HubSpot ni propone ejecutarlo.
- Cambios de definición de campos separados de los valores: etiqueta, tipo, opciones, obligatoriedad, referencias, etc. Cambios de presentación, orden de campos, etapas, reglas, pipelines y cobertura declarada identificados por sección. No confunde renombrar una etiqueta con editar un registro.
- Relaciones comparadas con su dirección, extremos, etiqueta y multiplicidad. Dos relaciones idénticas no se colapsan silenciosamente.
- Compara valores completos, devuelve vistas previas de hasta 500 caracteres con señal de recorte y hasta 20 campos por registro. Recuentos completos antes de paginar; muestras independientes de 50 cambios de campos y 25 grupos de relaciones.
- Valida formato y conciliación de ambas capturas; rechaza cruces de portal, clase de datos, origen o metadatos de entorno diferentes. Una captura real debe cumplir además las reglas v3/HubSpot/STANDARD del modelo existente. No relaja esas reglas.
- Identidad guardada cotejada con el contenido; hash SHA-256 de cada captura como identificación de contenido, no firma, autenticidad de proveedor o aprobación. La comparación inversa se permite y se señala con chronological:false.
- No requiere activar una de las capturas ni sustituye la copia activa. Hereda sesión, revocación, Host/Origin y no-store existentes.

## Contrato y errores

| Campo | Regla |
| --- | --- |
| from / to | IDs exactos de capturas guardadas, 1–400 caracteres |
| offset | Entero 0–20.000, defecto 0 |
| limit | Entero 1–200, defecto 50 |
| Otros parámetros / duplicados ambiguos | 422 |
| Captura no encontrada | 404 |
| Captura inválida o identidad/contenido discordantes | 422 |
| Origen/portal/entorno incompatibles | 409 |
| Protección local configurada sin sesión válida | 401 |

`records.truncated` indica que quedan diferencias después de la página solicitada. El offset y totalDifferences permiten distinguir una página vacía del resultado completo sin cambios. `schema.truncated` y `relations.truncated` corresponden a sus propias muestras.

## Verificación propia

```powershell
node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/capture-comparison.test.ts tests/capture-comparison-api.test.ts tests/response-queue-api.test.ts tests/v2.test.ts
```

**53/53, cero fallos:** 17 pruebas nuevas de lógica + 7 nuevas de API + 6 existentes del radar + 23 existentes v2. Typecheck completo correcto con `.\\node_modules\\.bin\\tsc.cmd --noEmit`. Diffcheck correcto y dos líneas añadidas en v2; sin otra edición a código existente. Primer conjunto de 21 pruebas nuevas correcto; después se añadieron las tres regresiones de orden de campos, volumen y separación producción/test, ejecutadas en el conjunto final.

Cobertura: diferencias reales y ausencia histórica, valores tipados y propiedad ausente, IDs por entidad, reordenación de entradas sin cambios ficticios, páginas y recuentos, texto distinto después de la vista previa, recortes explícitos, esquema sin cambios de datos, relaciones repetidas, orígenes incompatibles, captura no conciliada/duplicados/tipos inválidos, inmutabilidad, máximo de 10.000 registros y exceso rechazado. Las 10.000 modificaciones se cuentan aunque solo se muestren tres filas en ese caso.

API probada mediante Fastify inject y SQLite en memoria: consulta antes de activar, protección/revocación, Host/Origin, errores 422/404/409, identidad de contenido, comparación offline en runtime y comparación inversa. Se comparan todas las filas de meta/records/changes/captures/archives/usage antes y después del GET: idénticas. Una edición local ajena a las capturas sigue intacta y no contamina el antes/después histórico.

Las 23 v2 existentes incluyen candidata, cifrado, persistencia, paginación, retención, devolución y resultados inciertos. Todos sus datos son ficticios y los transportes están bloqueados o inyectados; que el nombre de una prueba diga «devolución real controlada» no acredita una llamada actual a HubSpot. Parte de esas pruebas usa directorios temporales propios del checkout, nunca las bases de instalaciones del usuario.

Demo ejecutada:

```powershell
node --require ./scripts/block-external.cjs --import tsx scripts/demo-capture-comparison.ts
```

Resultado sintético: un contacto con teléfono distinto y una tarea añadida; dos diferencias, cero cambios de relaciones. Evidencia temporal `tests/.tmp/diff040/demo.json`; log del conjunto final `tests/.tmp/diff040/tests.log`.

## Hashes SHA-256

| Archivo | Hash |
| --- | --- |
| shared/capture-comparison.ts | 594a167d345649b81428888f8cfe208ef8f55af403585f772fd050038361af92 |
| server/capture-comparison.ts | 356fe7ec48d2bb5b070084888b0409dbe2b102f5860842489fbc28106900e46d |
| server/v2.ts | d4b9bf58f27c5d497ec6b3ce4b3428f08d55b0afcd4031fe7598baef76ea5021 |
| tests/capture-comparison.test.ts | 2723d1348b93d15766fb1f6e4ee7077aefdfa165e088e4efd69f5b9934e5959b |
| tests/capture-comparison-api.test.ts | adf46f240df7279d05267e7d2564e87abf7767837fe4fda04fed544d253a64d2 |
| scripts/demo-capture-comparison.ts | 88230cf952e03b974dbd57de4540733623335b609edeac774dd238259f562d90 |

## Límites y siguiente paso

Implementación en fuente, sin UI nueva, QA visual, Vite/E2E, listeners, cambios de servicios, copia de activos, commit/push o despliegue. No depende de IA ni de red. Un diff local no prueba la situación actual del portal y sus vistas previas no son una propuesta ejecutable de devolución. La comparación no analiza el historial de cambios locales: usa únicamente las dos capturas guardadas explícitas. No mezcla CRM completo y piloto.

Al último cotejo UX038 figuraba review, con reservas conservadas; UX032 working. Estados del tablón no prueban presencia permanente de Claude. Su entrega no se revisó ni aceptó en DIFF040. No se enviaron fuentes o mensajes nuevos al proveedor.

Contexto/panel actualizados bajo reserva propia LAB035, devuelta exclusivamente para continuidad documental; código/contratos/pruebas LAB035 y OPS039 sin editar. DIFF040 y la actualización documental se presentan para revisión separada, sin autoaceptación. Siguiente: revisión del comparador, después encargo exacto de consumo visual en Historial o adaptación al piloto coordinado con su rediseño. No desplegar por cerrar esta tarea.

## Corrección posterior · 30/10/2026, 08:51 Europe/Madrid

Comparador: recortes180/500 sin partir pares UTF16. Hallazgo de QA042 contrastado por Codex; fuente reabierta y corregida dentro del alcance original. Nuevos hashes y pruebas en coordination/reports/CODEX-TEXT-044.md, que sustituyen los hashes de los archivos corregidos de la entrega anterior.63/63 focales y typecheck completo;33/33 de QA en copia temporal sinTODO con precondición de tamaño máximo (archivo Claude histórico intacto). Nueva presentación pendiente de revisión, sin autoaceptación o despliegue.
