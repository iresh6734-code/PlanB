# CLAUDE-MIGRATION-VERIFIER-CORE · Verificador de migraciones: contrato, fixtures y motor local (informe de entrega · R2)

8/11/2026, Europe/Madrid. Claude B. Sin dependencias. **Motor interno de Fase 4 adelantado bajo nuevas reservas**: no es una pantalla, no está en la navegación, no tiene endpoint, no toca el comparador de capturas (`shared/capture-comparison.ts`) ni App/main. Su activación como línea de producto sigue la puerta de fase del plan y la decide Codex coordinador.

## Qué existe
| Archivo | Contenido |
| --- | --- |
| `shared/migration-verifier.ts` | Esquemas estrictos de **exportación** (proveedor, cuenta, instante, zona horaria, objetos con cobertura `complete/partial/sample`, total declarado y filas) y de **mapa** confirmado por la persona (claves de correspondencia, campos con tipo/normalización/obligatorio/relevante/traducción de valores/tolerancia, relaciones). Motor puro `compareMigration(origen, destino, mapa, { includeValues? })`, SHA-256 y JSON canónico propios (mismo motor en servidor y navegador), `parseInstant`, `countersAddUp`. |
| `shared/migration-report.ts` | `buildMigrationReport(comparison, { generatedAt })`, `renderMigrationJson` (canónico, bytes reproducibles) y `renderMigrationHtml` (autocontenido, sin scripts ni recursos externos, CSP restrictiva, todo escapado, modo oscuro, tablas con desplazamiento, columna única bajo 480 px). |
| `shared/migration-demo.ts` | Dos exportaciones **ficticias** HubSpot (UTC) y Pipedrive (hora local de Madrid), el mapa y `migrationDemoExpectations` (oráculo escrito a mano). |
| `tests/migration-verifier.test.ts` | 24 pruebas (19 originales intactas + 5 de R2). |

## R2 · qué se corrigió (dictamen `coordination/reviews/CLAUDE-MIGRATION-VERIFIER-independent-287.md`, brief `CLAUDE-MIGRATION-VERIFIER-R2-287.md`)
**F1 · datos propios del objeto.** Claves, campos, relaciones y traducciones se leen SOLO de propiedades propias (`Object.prototype.hasOwnProperty`): `constructor`, `toString`, `hasOwnProperty`, `valueOf`… heredados ya no crean correspondencias, campos presentes ni traducciones. Una clave `constructor` ausente queda «sin clave, sin emparejar»; un campo `toString` ausente avisa en ambos lados y el veredicto es «no se puede concluir»; con `valueMap: {}`, un valor `constructor`/`toString`/`__proto__` queda «sin traducción, sin concluir». Se conservan las propiedades PROPIAS legítimas con esos nombres (como clave, como campo y como traducción propia). Las pruebas usan objetos obtenidos con `JSON.parse`, comprueban candidatos, avisos y que no hay un falso «sin diferencias»; una relación cuyo campo no es propio no cuenta, y una clave `__proto__` en los datos no rompe el motor ni contamina `Object.prototype` (no basta con esto último: es la comprobación de propiedad propia lo que cubre la frontera).
**F2 · días de calendario reales.** `isCalendarDay` valida mes, día y años bisiestos (también años de cuatro cifras): `2026-02-30`, `2025-02-29`, `2026-04-31`, `2100-02-29`… son «sin concluir» (razón `unparseable`) aunque ambos lados coincidan, y en un solo lado tampoco se convierten en una diferencia confirmada ni en otra fecha. `2024-02-29`, `2000-02-29`, `0400-02-29`, límites de mes y dos días válidos distintos siguen como antes. `parseInstant` (fechas con hora, zonas y DST) no cambia.
**F3 · recortes declarados.** El HTML añade «Se muestran los primeros 200 de N; el recuento es exacto.» también a los **dudosos** y a las **relaciones** (como las demás listas). Probado con 250 elementos en ambas ramas: JSON con total 250 / 200 elementos / `truncated: true`, contadores que suman, y sin mostrar detalle de un elemento recortado.
SHA-256 y canonización no se cambiaron (pasaron los controles de Codex y los propios).

## Reglas que impone el motor
- **Correspondencia solo por las claves del mapa.** Un ID igual en dos proveedores no corresponde: usar `$id` como clave exige `acknowledgeIdEquivalence: true`, y declararlo sin usarlo también se rechaza. En el escenario, el contacto `501` del origen (Inés) no se empareja con la persona `501` del destino (José): ella se encuentra por correo con la `777` y José queda como sobrante.
- **Lo ambiguo no se resuelve:** varios candidatos, clave repetida en el origen o clave vacía quedan como *dudosos / sin clave*, con sus candidatos, y no cuentan como iguales ni como cambiados.
- **«No encontrado» ≠ «ausente».** Solo es *ausente* si el destino se exportó completo; con destino parcial o muestra es *no encontrado, sin concluir*. Lo mismo para *sobrante* con un origen parcial. Un `declaredTotal` que no coincide con las filas degrada la cobertura a parcial y lo avisa.
- **Fechas.** Con zona (`Z`, `±hh:mm`) es un instante exacto; sin zona exige la del volcado; sin ella, o con una hora local inexistente o ambigua (cambio de hora: p. ej. 25/10/2026 02:30 en Madrid), el campo queda *sin concluir*. Fechas imposibles (30 de febrero, hora 24) no se interpretan.
- **Valores.** Un valor no interpretable o un estado sin traducción en el mapa queda *sin concluir*, nunca igual. Campos opcionales ausentes no cuentan; los obligatorios sí; los irrelevantes se ignoran.
- **Relaciones.** Rota por falta, por apuntar a otro registro o a uno inexistente; *sin concluir* si depende de un registro sin emparejar o si la exportación del objeto relacionado es parcial.
- **Veredicto.** Solo *«Sin diferencias en el alcance confirmado»* con ambas exportaciones completas y nada dudoso o sin concluir. Nunca dice «migración íntegra»: el informe lleva siempre «no acredita que la migración sea íntegra ni que el proveedor de destino contenga todos los datos».
- **Privacidad.** Por defecto no hay valores de campos en JSON ni HTML, solo IDs de fila, nombres de campo y causas. `includeValues` los muestra recortados a 80 y escapados.
- **Contadores.** Cada registro del origen cae en exactamente una de siete partidas y cada registro del destino en una de cinco; el informe lleva `countersAddUp` y avisa si no suman. Las listas del informe se acotan a 200 por categoría con el recuento exacto y la nota.

## Escenario ficticio (oráculo escrito a mano)
| Objeto | Iguales | Con diferencias | Sin concluir | Ausentes | Dudosos | Sin clave | Destino: sobrantes / dudosos / sin clave |
| --- | --- | --- | --- | --- | --- | --- | --- |
| contactos → personas (13 / 14 filas) | 4 | 3 (teléfono; apellido y hora; fecha obligatoria que falta) | 1 (hora local ambigua) | 1 | 3 (dos candidatos; clave repetida ×2) | 1 | 2 / 3 / 1 |
| empresas → organizaciones (4 / 4) | 2 | 1 (empleados) | 0 | 1 | 0 | 0 | 1 / 0 / 0 |
| oportunidades (8 / 8) | 5 | 1 (importe) | 1 (etapa sin traducir) | 1 | 0 | 0 | 1 / 0 / 0 |
Relaciones de oportunidades: 3 correctas, 3 rotas (falta, otra empresa, empresa inexistente) y 1 sin concluir; de contactos: 7 correctas y 1 sin concluir.

## Pruebas y control causal
`tests/migration-verifier.test.ts` **24/24** (≈3 s; las 19 originales pasan sin cambios y se añaden 5 de R2): SHA-256 contra `node:crypto` en los límites de bloque; fechas (zonas, DST ambiguo/inexistente, imposibles); validación de esquemas; entradas incoherentes con código; cifras contra el oráculo; clasificación fila a fila; IDs iguales entre proveedores; cobertura parcial/muestra/total mentiroso; relaciones; campos; ambiguos; veredicto; informe reproducible (mismos bytes, huellas contra `node:crypto`); HTML hostil (IDs con `<script>`, valores con `<img onerror>`), sin valores por defecto; listas acotadas con 250 filas y 20 000 filas en tiempo razonable; entradas hostiles; no muta sus argumentos; solo lo dudoso ya impide «sin diferencias»; un informe cuyos contadores no suman lo declara.
**Sensibilidad (R1 → R2):** con las fuentes R1 originales en una copia privada (hashes verificados; solo se añade a esa copia un `isCalendarDay` equivalente al criterio R1 para que el archivo cargue) y el MISMO archivo de pruebas R2, pasan las 19 anteriores y **fallan 4 de las 5 nuevas** (la quinta, el control positivo de propiedades propias, pasa porque R1 ya las respetaba); con R2, 24/24. Las **7 sondas independientes de Codex** (`tests/.tmp/migration287-probes.ts`, sin modificarlas) pasan **7/7** contra las fuentes R2 en una copia privada. **Control causal (R1):** 24 mutantes (ausente con destino parcial, sobrante con origen parcial, candidatos resueltos con el primero, clave repetida ignorada, fecha local sin zona tomada por UTC, hora ambigua e inexistente aceptadas, valor sin traducción tomado por igual, relación ausente dada por correcta, referencia inexistente afirmada rota con destino parcial, total declarado incoherente ignorado, obligatorio ausente que no cuenta, parcial que da «sin diferencias», correo sin normalizar, huella del destino sobre el origen, valores incluidos por defecto, destinos sin clave sin contar, tolerancia ignorada, `$id` sin declarar, irrelevante comparado, dudosos fuera del veredicto, HTML sin escapar, titular «migración íntegra», listas sin acotar, contadores sin comprobar) → **24/24 detectados** (dos sobrevivieron la primera vez —dudosos fuera del veredicto y contadores sin comprobar—; se añadieron sus pruebas y se detectaron); fuentes restauradas por hash. **Control causal (R2):** ocho mutantes más (datos leídos por herencia, campo heredado como presente en origen y en destino, traducción por herencia, día de calendario sin validar, y los avisos de recorte de dudosos y de relaciones quitados) → todos detectados: **32/32** en total. `tsc` del repositorio sin errores en los archivos de la unidad.

## Estado de llegada
| Qué | Estado | Tarea / dueño |
| --- | --- | --- |
| Contrato, motor, informe JSON/HTML, fixtures y pruebas | Implementado, interno | Esta unidad · Claude B |
| Endpoint de carga y comparación | **No existe** | Unidad sucesora a registrar con Codex (propuesta abajo) |
| Interfaz «Verificar una migración» en la navegación habitual | **No existe** | Idem. Fila del inventario abierta hasta que sea accesible y produzca el informe comprobado |
| Verificación visual del HTML a 1440/390/320 | **No hecha** (el HTML se diseñó para esos anchos pero no se midió con navegador) | Sucesora |
| Exportaciones reales de HubSpot/Pipedrive | **No hay**; ningún proveedor consultado | Fase 3/4, con cuenta y autorización |

## Propuesta de unidad sucesora (para acordar con Codex)
`CLAUDE-MIGRATION-VERIFIER-MOUNT` (nombre provisional): endpoint local `POST` con exportaciones y mapa que se **envían desde el navegador** (nunca se leen rutas del disco; límite de bytes y de filas; sin proveedor), respuesta con el informe, y vista «Verificar una migración» en la navegación con el paso de confirmación del mapa por la persona (la confirmación se registra con su nombre e instante, no la sintetiza el motor). Rutas probables: servidor (archivo nuevo + registro en `main`, de Codex), `src/MigrationVerifier.tsx` (Claude A o B según reparto) y entrada de navegación en `App` (Codex). Antes de montar: puerta de Fase 4 del plan y decisión sobre cómo se presentan los resultados «sin concluir».

## Hashes finales (sha256)
| Ruta | sha256 |
| --- | --- |
| shared/migration-verifier.ts | 5219cc23883827452ff5fcde204eb92a0cf4055105ff94faef766cfbd2cfe5cf |
| shared/migration-report.ts | 8a657b83e7bc843869ea96a5d53fba7d1e2fe5d532093a5d4ddd6c8679a8618f |
| shared/migration-demo.ts | f585aa254ad561a2317eb5fa016177b17beeca9d45ce142fc3a538fe92b57095 |
| tests/migration-verifier.test.ts | e2489e362a88dd1bd9ea88fdb01dbfd7a5a25eb44af7ff5e7e62dbfdbfed8f4b |
| coordination/reports/CLAUDE-MIGRATION-VERIFIER-CORE.md | (este informe) |


R1 presentado (revisado por Codex): verifier 521a…, report 48cc…, demo f585… (sin cambios en R2), tests 68e5…. La confirmación del mapa (`confirmedBy`) sigue siendo un NOMBRE DECLARADO mientras no exista identidad autenticada: no es una firma, autoría verificada ni aprobación de otro usuario. La unidad sigue interna: sin endpoint, navegación ni archivos reales; sin validación visual nueva (no se ejecutó navegador).
