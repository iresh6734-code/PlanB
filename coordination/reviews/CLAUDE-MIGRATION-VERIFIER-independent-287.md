# Revisión independiente287 · Motor de migraciones R2

8/11/2026, Europe/Madrid. **Favorable para las cinco huellas R2 de este corte.** Los tres hallazgos anteriores quedan corregidos. La evidencia y los hashes deR1se conservan debajo como históricos; no se usan para aceptarR2.

## Comprobación propia de R2

Banco fijo `tests/.tmp/migration287-YlwvcE`, mismo script de revisión y **las siete sondas propias originales sin modificarlas**. Se cotejaron las cinco huellas y fuentes transitivas antes/después.

- **24/24 de Claude**,7,44s, sin omisiones/cancelaciones/reintentos.
- **7/7 propias**,1,92s, sin omisiones/cancelaciones/reintentos.
- Tipos focales de ambos archivos y sus dependencias:0. No se repitió el typecheck global comunicado por Claude.

Lectura de la corrección: los accesos a claves/campos/relaciones pasan por `hasOwnProperty.call`, la detección de campos exportados exige propiedad propia y las traducciones comprueban propiedad antes de leer. No se prohíben nombres legítimos para esconder el defecto. La rama date usa validación de día de calendario, con años completos y bisiestos. El HTML añade el aviso de recorte tanto a dudosos como a relaciones mediante la misma función; los nuevos casos de Claude ejercitan ambas ramas con más de200resultados. Los conteos y límites permanecen separados.

Las sondas propias verifican los tres accesos heredados, las tres fechas imposibles, propiedades propias legítimas, SHA/Unicode/canonización y HTML truncado. El SHA y la canonización no cambiaron por estas correcciones. Las pruebas originales siguen incluyendo cobertura parcial, candidatos sin resolver, relaciones, valores privados ausentes por defecto y escape de HTML.

No se repitieron los32mutantes reportados por Claude. La sensibilidad propiaR1de siete sondas y la corrección experimental anterior permanecen como evidencia histórica, no como una ejecución nueva sobreR2. Ningún archivo de Claude fue editado por este revisor.

## Cinco huellas R2 aceptables

| Archivo | SHA-256 |
| --- | --- |
| shared/migration-verifier.ts | 5219cc23883827452ff5fcde204eb92a0cf4055105ff94faef766cfbd2cfe5cf |
| shared/migration-report.ts | 8a657b83e7bc843869ea96a5d53fba7d1e2fe5d532093a5d4ddd6c8679a8618f |
| shared/migration-demo.ts | f585aa254ad561a2317eb5fa016177b17beeca9d45ce142fc3a538fe92b57095 |
| tests/migration-verifier.test.ts | e2489e362a88dd1bd9ea88fdb01dbfd7a5a25eb44af7ff5e7e62dbfdbfed8f4b |
| coordination/reports/CLAUDE-MIGRATION-VERIFIER-CORE.md | 1a5327015a0d50e5a03495bc721e7601a371bbe962a7eef0502d93d1ddb67178 |

Aceptación de **motor interno**, sin endpoint, navegación, informe medido visualmente o proveedor real. No se abre la Fase4por este dictamen: sigue la puerta de producto del plan. Antes de montar deben definirse límites agregados de bytes/filas y ejecución cancelable de la interfaz, además de los topes por objeto existentes. No se atribuye firma o identidad autenticada al nombre confirmedBy. Demo4601yZIPno cambian.

Siguiente: unidad sucesora de informe visual e interfaz cuando se acuerde la puerta; la fila del inventario sigue abierta para llegar a App. Dictamen propio presentado para revisión cruzada, sin autoaceptación.

---

# Histórico de revisión independiente287 · Motor de migraciones R1

8/11/2026, Europe/Madrid. Codex. **Requiere R2, no aceptada.** Cinco huellas cotejadas; no se editaron fuentes de Claude. Sigue siendo motor interno, sin endpoint o pantalla.

Banco fijo `tests/.tmp/migration287-zAeS28`, script `tests/.tmp/review-migration287.cjs`: **19/19 originales** pasan (3,33s), tipos focales0. Siete sondas propias (`tests/.tmp/migration287-probes.ts`): dos positivas pasan y cinco reproducen los hallazgos siguientes. Sin reintentos, omisiones o cancelaciones. Las fuentes transitivas y cinco huellas de entrega se comprobaron antes/después.

## F1 · Se inventan claves, campos y traducciones por herencia (medio)

`valueOf` usa `row.values[name]`, la comprobación de campos usa `in`, y `compareField` consulta `mapping.valueMap[left]` sin exigir propiedad propia.

Tres reproducciones con entradas válidas:

1. Clave de correspondencia `constructor`, sin tal propiedad exportada en ninguno de los lados. El motor lee las funciones heredadas, empareja s1→t1 y devuelve idéntico/sin diferencias. Debe quedar sin clave, sin emparejar.
2. Campo relevante `toString` ausente en ambos lados. Se considera presente, sin avisos; puede devolver sin diferencias. Debe distinguir ausencia propia y avisar conforme al contrato de campo.
3. `valueMap: {}` y estado de origen `constructor` o `toString`. La propiedad heredada se toma como traducción; un destino con su representación textual llega a contarse igual. Debe ser valor sin traducción, sin concluir.

No es una afirmación de ejecución de código ni de contaminación global del prototipo: es una atribución de datos inexistentes. El control positivo propio exige que **propiedades propias** llamadas constructor/toString sigan funcionando. Prohibir nombres sin más no cubre la frontera ni sustituye la comprobación de propiedad propia. Revisar accesos de claves, campos, relaciones y traducciones.

## F2 · Fechas sin hora imposibles acreditan igualdad (medio)

La rama `type:date` solo comprueba patrón y que Date.parse no sea NaN. Node normaliza `2026-02-30`, `2025-02-29` y `2026-04-31` a días de otro mes. Si ambos lados contienen la misma fecha imposible, se devuelve `no-differences-in-scope`, con una fila idéntica y cero inciertas. Debe quedar sin concluir como dato no interpretable. El control `2024-02-29` válido debe seguir siendo igual.

`parseInstant` sí rechaza el caso con hora cubierto por las pruebas originales; este hallazgo corresponde a la rama de **fecha de calendario**. No es una prueba de diferencias entre zonas de una cuenta real.

## F3 · El HTML omite el aviso de recorte en algunas listas (bajo)

Con250dudosos el JSON indica total250/items200/truncatedtrue. El HTML muestra el total pero enumera solo200sin el aviso de recorte que sí tienen las listas de ausentes/cambios. La rama de relaciones presenta la misma omisión en la lectura estática; la reproducción propia ejecutada es la de dudosos. Aplicar el aviso coherentemente y probar ambas. No se afirma pérdida de los contadores JSON.

## Calibración y positivos

`tests/.tmp/causal-migration287.cjs` aplica una corrección mínima **solo en copia privada**: acceso por propiedades propias, validación de día y aviso de dudosos. Con ella pasan19/19originales y7/7propias, tipos0. Se restauraron los bytes y se cotejaron fuentes privadas/checkout; `causal-restored.json`. No es una entrega de producto ni completa la revisión de relaciones solicitada.

SHA-256 se contrastó contra node:crypto con Unicode, controles, sustituto aislado y bordes55/56/64; también canonización con clave propia `__proto__`. Las sondas pasan. No se ha demostrado un defecto de hash ni contaminación de prototipo; la R2 no necesita sustituir SHA por intuición. Los19casos de Claude cubren escenarios útiles de cobertura, relaciones, ambigüedad, privacidad y determinismo; no se repitieron sus24mutantes comunicados.

Solo Node, ficción y entorno mínimo con red externa bloqueada. Tipos focales, no nuevos tipos globales. Sin navegador, medición1440/390/320, proveedor, tokens, main, App, comparador vigente,4601o ZIP. No se autoriza montaje por esta revisión.

## Cinco huellas revisadas

| Archivo | SHA-256 |
| --- | --- |
| shared/migration-verifier.ts | 521ad1567dd167321e51763d1f6d806283c49e27a2fe159fdb13f0dd0470f97c |
| shared/migration-report.ts | 48cce433c45ec98669cdf6bdebd4d40dee46b391d476c3def80723939867ad07 |
| shared/migration-demo.ts | f585aa254ad561a2317eb5fa016177b17beeca9d45ce142fc3a538fe92b57095 |
| tests/migration-verifier.test.ts | 68e565f613d7dba5fdbe9ad27b2d831e7c6a845d410f48af5b0d906c7d6b118b |
| coordination/reports/CLAUDE-MIGRATION-VERIFIER-CORE.md | 2b884804a84a918f84f246cb2ae758ac5532564fe75758f79f1ffc081b693cfa |

Siguiente: devolución formal con `coordination/briefs/CLAUDE-MIGRATION-VERIFIER-R2-287.md`; reserva5 intacta, nueva presentación y revisión de hashes. ConfirmedBy continúa siendo nombre declarado, no autoría autenticada.
