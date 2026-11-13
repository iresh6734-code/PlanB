# CLAUDE-COMMITMENT-RADAR-SOURCES · Fuentes ficticias del Radar (informe de entrega)

6/11/2026, Europe/Madrid. Claude B (fuentes, evidencia y portabilidad). CORE (contrato y API del Radar, de Codex) estaba aceptada; se consume `commitmentDemoDataset`, `projectCommitmentEvidence` y `registerCommitments` tal cual, sin tocar sus archivos.

## Qué entrega
`shared/commitment-demo.ts`: `createCommitmentDemoDataset(now: number): CommitmentDataset`, determinista, validada con el esquema compartido antes de devolverse (lanza si `now` no es un entero positivo o si el conjunto incumpliera el contrato), y `commitmentDemoExpectations` (lo que el Radar debe derivar de cada compromiso, para documentación y para las pruebas de la API y de interfaz de quien lo consuma). Recorrido **ventas → entrega → soporte** de una distribuidora/instaladora, 6 compromisos y 18 observaciones, todo con proveedores `*-fixture` y cuentas `fixture-*`:

| Compromiso | Qué representa | El Radar deriva (verificado en la API real) |
| --- | --- | --- |
| `installation-north` | Instalación bloqueada: venta con fecha comprometida, pedido retenido (bloqueo reciente y completo) y ticket relacionado | en riesgo · `source-blocked` · rol afectado: entrega |
| `delivery-healthy` | Entrega sana con prueba de cumplimiento y las tres fuentes recientes y completas | sin riesgo detectado · `canCloseObserved: true` |
| `support-source-down` | Fuente de soporte caída (indisponible, condición `null`) | sin confirmar · `coverage-incomplete` · soporte `unavailable` |
| `project-partial` | Lectura parcial de pedidos (primera página) | sin confirmar · `coverage-incomplete` · entrega `partial` |
| `installation-lookalike` | Mismo título que el primero; el MISMO ID remoto de pedido en dos cuentas distintas; sin vínculo confirmado de entrega | sin confirmar · entrega `ambiguous`, sin observación ni vínculo, dos candidatos |
| `stale-evidence` | Tres observaciones de hace 30 h | sin confirmar · las tres `stale` |

Las fechas salen de `now` con desplazamientos fijos (observaciones recientes: −20 min; antiguas: −30 h; vencimientos: +6 h a +3 días): el mismo `now` da el mismo conjunto y todo se desplaza con él.

## Uso (el de la candidata)
```ts
import { createCommitmentDemoDataset } from '../shared/commitment-demo.js';
const now = Date.now();
registerCommitments(app, store, createCommitmentDemoDataset(now), () => now);   // el registro lo hace Codex (CODEX-COMMITMENT-RADAR-MOUNT); esta unidad no toca main ni App
```
La candidata debe fijar `now` una vez por arranque (el dataset es parte del ámbito de las decisiones: cambiarlo es otra demo) y mantener las fechas coherentes con su reloj.

## Pruebas
`tests/commitment-demo.test.ts` **6/6**: esquema y topes; determinismo y desplazamiento con `now`; alcance ficticio (proveedores `-fixture`, cuentas `fixture-`, sin URLs, correos, claves ni identificadores numéricos largos, ni el portal propio de ensayo ni el de pruebas); las seis situaciones presentes y distintas; proyección pura (un candidato nunca aporta observación aunque su ID remoto coincida con una observación de otra cuenta; la misma evidencia caduca con el reloj); **API real** (createBaseApp + Store + `registerCommitments`): lista y detalle distinguen riesgo, cobertura y candidatos, una fuente caída es «sin confirmar», una entrega sana no cierra por inferencia, pasadas 25 h ninguna queda «sin riesgo» y leer no escribe; ejemplo de uso. **Control causal:** 6 mutantes de los datos (vínculo ambiguo → explícito, fuente caída → sana, antiguas → recientes, bloqueo → parcial, entrega sin prueba, proveedor real) detectados todos; fuente restaurada por hash. `tsc` sin errores en los archivos de la unidad (ajenos: `tests/task-intent-journal.test.ts`, 208).

## Límites
- Son datos de ensayo del Radar: no acreditan ningún proveedor, ni HubSpot, ni Zendesk, ni pedidos reales; la integración con proveedores es de la fase 3.
- El conjunto no se monta en `main`/Hoy (unidad de Codex). `affectedRole` solo se informa con bloqueo observado (comportamiento del contrato).
- Los títulos y etiquetas son texto de demostración en español; si la interfaz los traduce o los recorta, depende de Claude A.

## Hashes finales (sha256)
| Ruta | sha256 |
| --- | --- |
| shared/commitment-demo.ts | 8f5b1d3e8befd8dd04236ceff956b086aff362f5e758cde234c97c64ce3fe782 |
| tests/commitment-demo.test.ts | b6dbae12b00229191da9d7e5959a98e35c42ba1730548758eaba176e0119dd5a |
| coordination/reports/CLAUDE-COMMITMENT-RADAR-SOURCES.md | (este informe) |
