# CLAUDE-MULTISYSTEM-SCENARIO · Escenario multisistema del Radar (informe de entrega)

8/11/2026, Europe/Madrid. Claude B. Dependencia aceptada: `CLAUDE-COMMITMENT-RADAR-SOURCES`. **No se modifica** `shared/commitment-demo.ts` ni su prueba (hashes intactos): es una unidad nueva y paralela.

## Qué entrega
`shared/commitment-multisystem-demo.ts`: `createMultisystemScenario(now)` (determinista, validado con el esquema compartido), `multisystemScenarioExpectations` (oráculo escrito a mano: estado, causa, rol afectado, evidencia por rol, **origen visible** de cada rol, cierre observable y la frase que la ficha debe poder explicar), `multisystemProviderLabels` (todos «datos de ensayo», `connected: false`) y `multisystemDisclosures`. Ocho compromisos y 22 observaciones; proveedores `hubspot-fixture`, `pipedrive-fixture`, `orders-fixture`, `zendesk-fixture`; cuentas `fixture-*`; **pedidos ficticios declarados** en cada etiqueta; Shopify no aparece.

| Compromiso | Qué representa | Radar (API real) | Ficha debe mostrar |
| --- | --- | --- | --- |
| `ms-installation-hubspot` | Instalación comprometida (HubSpot), pedido 9001 retenido, ticket 8001 unido por referencia **explícita** | en riesgo · `source-blocked` · entrega | origen de cada rol (HubSpot / Pedidos ficticios cuenta A / Zendesk) y que el bloqueo viene del pedido |
| `ms-installation-pipedrive` | MISMO tipo de compromiso nacido en Pipedrive; la oportunidad tiene el **mismo ID remoto** (`deal-2001`) que la de HubSpot | en riesgo · `source-blocked` · entrega | otra cuenta y otro proveedor: no es el mismo registro |
| `ms-delivery-healthy` | Entrega sana con prueba de cumplimiento | sin riesgo detectado · cierre observable | «sin riesgo detectado» no es garantía |
| `ms-delivery-unconfirmed` | El pedido enlazado **no tiene lectura** | sin confirmar · entrega «sin lectura» | falta información; no hay ausencia de riesgo |
| `ms-orders-partial` | Solo la primera página de pedidos | sin confirmar · entrega «parcial» | lo no leído no se da por sano |
| `ms-same-id-two-accounts` | `order-9001` en dos cuentas como **candidatos**; mismo título que el primero | sin confirmar · entrega «ambigua», sin observación | no hereda el bloqueo de A ni el cumplimiento de B |
| `ms-orders-account-b` | El `order-9001` de la cuenta B, enlazado explícitamente | sin riesgo detectado | su resultado no se mezcla con el de A |
| `ms-support-source-down` | Soporte caído (permisos insuficientes), sin condición | sin confirmar · soporte «no disponible» | un fallo de fuente no es «sin tickets» |

## Pruebas (`tests/commitment-multisystem-demo.test.ts`, 8)
Esquema/determinismo/topes; alcance ficticio (sin URLs, correos, claves, identificadores largos ni «shopify»; cada pedido declarado ficticio; ningún proveedor conectado); HubSpot y Pipedrive con el mismo ID y referencias distintas, un solo proveedor de venta por compromiso y resultado equivalente; proyección pura contra el oráculo incluido el **origen visible**; **API real** (`createBaseApp` + `Store` + `registerCommitments`): lista y detalle por caso, nada «sin riesgo» salvo los dos sanos y ninguno tras 25 h; aislamiento A/B con control (confirmar el candidato A hace que herede el bloqueo: el vínculo es la única puerta); **reinicio con base en fichero**: la decisión sobrevive con el mismo `now` y desaparece con otro (otro conjunto); alteraciones que deben cambiar el resultado. Resultado **8/8** (junto con Zendesk, 27/27 en una sola ejecución).
**Control causal:** 9 mutantes de los datos (fuente caída sana, candidato confirmado, proveedor real, ID de Pipedrive distinto, pedido sin lectura recibe lectura, parcial→completa, bloqueo desaparece, aparece Shopify, pedido no declarado ficticio) → **9/9 detectados**; fuente restaurada por hash.

## Para Codex (montaje) y Claude A (ficha)
- **Instante estable.** El Radar liga las decisiones a la revisión del conjunto (`ledgerKey` incluye el hash de comisiones+observaciones): `createMultisystemScenario(now)` con otro `now` es otro conjunto y las decisiones previas **no aparecen** (lo demuestra la prueba de reinicio). El montaje debe fijar `now` una vez (p. ej. al crear la copia de ensayo) y conservarlo entre reinicios. Esta unidad no lo decide.
- **Ficha.** Consumid `multisystemScenarioExpectations[i].origins` y `explain` como oráculo de pruebas de interfaz. No edito `CommitmentRadar*`.
- **Elección de conjunto.** Si el Radar monta el multisistema en lugar de (o además de) la demo original es decisión de Codex; ambos pueden coexistir como ficheros.

## Qué llegó a la App y qué no
| Qué | Estado | Tarea / dueño |
| --- | --- | --- |
| Datos y oráculo del escenario | Entregados, internos | Esta unidad · Claude B |
| Radar montado con este conjunto | **No** | `CODEX-COMMITMENT-RADAR-MOUNT` (Codex) |
| Ficha con origen y causa | **No** | `CLAUDE-COMMITMENT-RADAR-UI` (Claude A) |
| Recorrido en App detectar → revisar fuente → decidir → reiniciar → historial | **No ejecutado**: exige el Radar montado y aceptado; una captura de arnés no lo sustituye | Unidad sucesora de Claude B, a registrar cuando se acepte el montaje |
| Proveedores reales | No | Ensayos reales pendientes de cuenta y autorización |

## Hashes finales (sha256)
| Ruta | sha256 |
| --- | --- |
| shared/commitment-multisystem-demo.ts | 7e6f4e2a5dfe5fcbfd443dabd9581f569f883db291201a9fb967959258980fbd |
| tests/commitment-multisystem-demo.test.ts | 089fcbe632e4eb41533762d23f8edf4f3c639796a6a38d60b0f988ec6a31d6f0 |
| coordination/reports/CLAUDE-MULTISYSTEM-SCENARIO.md | (este informe) |
