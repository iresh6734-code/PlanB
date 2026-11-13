# CLAUDE-SOURCE-PIPEDRIVE · Adaptador de Pipedrive (informe de entrega · R3)

8/11/2026, Europe/Madrid (R3: 9/11/2026). Claude B. Dependencia aceptada: `CLAUDE-SOURCE-ZENDESK` (R3). Reutiliza `shared/source-reading.ts` y `server/source-read-transport.ts` **sin modificarlos** (huellas aceptadas `5e48…` y `563c…` verificadas antes de empezar) y el contrato `shared/commitments.ts` sin cambios.

## Qué es y qué NO es
Adaptador de **solo lectura** de la API v2 de Pipedrive: oportunidades, personas, organizaciones y actividades. **Código implementado y probado con respuestas sintéticas y un servidor de bucle local.** No hay cuenta, credencial ni llamada real a Pipedrive; no está montado en la App; ninguna pantalla debe mostrar «Pipedrive conectado» por esta entrega. El modo `live` solo se prueba con un `fetch` simulado.

## R3 · instantes dentro del formato público y desempate submilisegundo (brief `CLAUDE-SOURCE-PIPEDRIVE-R2-295.md`, sección R3)
**F3 · instantes fuera del formato público.** Un desfase válido puede sacar el instante del año de cuatro dígitos al pasar a UTC (`9999-12-31T23:45:00-01:00` es el año 10000; `0000-01-01T00:15:00+01:00` es el año -1). `instant()` exige ahora que el resultado cumpla el formato público de `SourceRecord.updatedAt` (`AAAA-MM-DDTHH:MM:SS.mmmZ`); si no, la fecha queda **desconocida (`null`)**: la fila, su condición y las demás filas se conservan y la lectura no se rechaza entera, ni en listado ni en consulta por ID. Se conservan los extremos exactos del rango (`0000-01-01T00:00:00Z`, `9999-12-31T23:59:59Z`) y una fecha con zona dentro del rango sigue normalizándose a UTC.
**F4 · desempate dentro del mismo milisegundo.** El campo público conserva tres dígitos (`.123Z`). Para elegir el duplicado más reciente el lector usa una **clave interna** (`pipedriveUpdateOrder`: instante público + los seis dígitos por debajo del milisegundo, con la fracción rellenada a nueve dígitos) que nunca se publica. `.123900+01:00` gana a `.123100Z` en cualquier orden de página; el milisegundo posterior gana aunque su fracción menor sea menor; con tres duplicados el intermedio no desplaza al más reciente (la clave se actualiza al reemplazar); una fecha ilegible o fuera de rango tiene clave vacía y no desplaza a una válida. **Límite documentado:** dos instantes idénticos hasta el nanosegundo (incluida la misma fracción escrita con distinto número de ceros) no se pueden ordenar por fecha: se conserva el primero leído y el duplicado se cuenta.
**Informe.** Se reconcilia el máximo de personas con la política de R2: **100 es política propia del lector**, no un límite documental desconocido (la referencia oficial actual indica 500 como máximo). Las dos sondas de R3 (`independent-pipedrive295-r2-boundaries.test.ts`) son **del revisor** y se ejecutaron sin modificarlas; los resultados siguientes son del banco de **esta sesión**.
**Resultados (esta sesión).** 19/19 (las 17 de R2 intactas + 2 de R3 con controles positivos), `tsc -p .` limpio. **Sensibilidad:** con las fuentes R2 en copia privada y el mismo archivo de pruebas fallan exactamente las 2 de R3 (y las 2 sondas del revisor); con R3 pasan 21/21 (19 + 2 sondas) y las 7 sondas anteriores del revisor siguen en 7/7. **Control causal:** 9 mutantes de R3 (instante fuera de rango publicado, solo un extremo descartado, orden sin submilisegundo, fracción sin rellenar, empate ganado por el último, clave sin actualizar al reemplazar, comparación solo del campo público, fecha ilegible con clave máxima, clave publicada en el registro) → **9/9 detectados**; fuentes restauradas por hash.

## R2 · normalización sin condición ni fecha inventadas (dictamen `CLAUDE-SOURCE-PIPEDRIVE-independent-295.md`, brief `...-R2-295.md`)
**F1 · indicadores ilegibles.** `is_deleted` e `is_archived` se leen solo como booleanos reales; **ausente = no marcado** (comportamiento documentado de los campos que no llegan); cualquier otro tipo (cadena «true»/«false», vacío, número, `null`, objeto, lista) **no se coacciona**: la oportunidad se **omite** con la categoría `unknown-value` y su contador, la lectura queda parcial y nunca aparece como clear/completed con cobertura completa; en una consulta por ID da `unsupported-value` con observación sin condición. Solo se validan los indicadores que se consumen (oportunidades).
**F2 · calendario real y hora válida.** `updatedAt` exige día de calendario real (bisiestos incluidos), hora 00–23, minutos y segundos 00–59 y desfase ±hh:mm con hh ≤ 23 y mm ≤ 59; si no, `null` (nunca otro día: ni 30 de febrero → marzo, ni 31 de abril → mayo, ni hora 24 → día siguiente). Así una fecha imposible no puede desplazar a un duplicado válido: lost de las 08:00 del 2 de marzo seguida del mismo ID won con 30 de febrero conserva **lost/blocked con su fecha**, en ambos órdenes, y la lectura sigue parcial por el duplicado. Con ambas fechas válidas la más reciente sigue ganando.
**Tamaño de página.** Personas se pide con `limit` ≤ 100 por **política propia** del lector (la referencia oficial actual indica máximo 500 y 100 por defecto): no es un límite documental desconocido. El host `{dominio}.pipedrive.com` y `x-api-token` están documentados; **ninguna prueba sintética demuestra autorización ni lectura real**.
**Pruebas y sensibilidad.** 17/17 (las 14 anteriores intactas + 3 de R2 con controles positivos), `tsc -p .` limpio. Con las fuentes R1 en copia privada y el MISMO archivo de pruebas: pasan las 14 y fallan las 3 de R2. Las **7 sondas independientes de Codex** (`pipedrive295-probes.ts`, sin modificarlas) dan 4/7 con R1 y **7/7** con R2 (junto a las 17: 24/24). **Control causal: 24 mutantes, 22 detectados** y 2 equivalentes documentados: los comprobantes explícitos de «minutos/segundos 60» y de desfase fuera de rango son redundantes con `Date.parse`, que ya rechaza esos valores; se mantienen para que la regla no dependa del motor de fechas. Fuentes restauradas por hash.

## Documentación oficial consultada (8/11/2026, developers.pipedrive.com / pipedrive.readme.io)
API v2 y guía de migración v1→v2, paginación, límites, autenticación y OpenAPI v2. Usado: `GET /api/v2/{deals,persons,organizations,activities}` con `cursor`/`limit` y respuesta `success`, `data[]`, `additional_data.next_cursor` (null = fin); límite máximo 500 en oportunidades, actividades y organizaciones; estados de oportunidad `open/won/lost/deleted`, `is_deleted`, `is_archived`; marcas de tiempo RFC 3339; autenticación por cabecera `x-api-token` u OAuth Bearer; límite diario compartido (429).
**No confirmado** (`PIPEDRIVE_UNCONFIRMED`, pendiente de ensayo real): esquema de personas y organizaciones (solo se leen `id`, `update_time` y `org_id` si llegan con el tipo esperado); tamaño de página de personas (se pide ≤ 100 por política propia; la referencia oficial indica 500); alfabeto de los cursores; si `x-api-token` y `{dominio}.pipedrive.com` equivalen a `api.pipedrive.com` y a OAuth (solo se admite `{dominio}.pipedrive.com`); alcances OAuth más allá de `deals:read` y `activities:read`; cuerpos de 401/403/404; `Retry-After` (no documentado: si llega se respeta, si no no se supone ninguno y no se reintenta).

## Política de datos
- **Oportunidad → rol `sale`**: `won` completado; `open` sin bloqueo observado; `lost` **bloqueado** (política `lostIs`, configurable); `deleted`/`is_deleted` bloqueado con etiqueta propia; estado desconocido o ausente → **omitido con contador** (lectura parcial: nunca sano). Archivada se rotula.
- **Personas, organizaciones y actividades → objetos de contexto sin rol** (`kind: null`): conservan identidad y relaciones (`person_id`, `org_id`, `deal_id`) pero **nunca se proyectan al Radar ni crean vínculos**. Una actividad sin `done` booleano se omite.
- Etiquetas: tipo, ID y estado; **sin títulos, nombres ni asuntos**.
- `observedAt` = fin de la lectura; `updatedAt` aparte. Ningún vínculo por igualdad de ID ni de nombre entre cuentas o proveedores.
- Credencial: función que devuelve `{scheme: 'api-token'|'bearer', token}`; viaja **solo en cabecera** (nunca en la URL), con el transporte común (R2/R3: parada propia, descarte de lo tardío, sin reintentos).
- `live` construye `https://{dominio}.pipedrive.com` (dominio validado) con proveedor `pipedrive` y `accountId` = dominio **configurado**, no identidad observada; `local-test` = bucle local, cuenta `fixture-*`, proveedor `pipedrive-fixture`.
- Tamaño de página: `pageSize` acotado por objeto (personas ≤ 100; el resto ≤ 500).

## Regla de cobertura
`complete` solo con `next_cursor: null` explícito, sin omitidos ni parada. Sin `success: true`, sin `additional_data.next_cursor` (cadena o null), con cursor de forma no válida, repetido, presupuesto de páginas o registros, 403 tardío, 429, plazo, aborto, truncado o exceso de bytes → parcial o no disponible. Una página vacía con cursor no cierra.

## Pruebas (`tests/pipedrive-source.test.ts`, **19/19** con R3; `tsc -p .` limpio)
Lectura completa de tres páginas (URLs, cabecera `x-api-token`, sin `authorization`, credencial ausente de URL y salidas; cursor opaco codificado); Bearer; condición de oportunidades y política; objetos de contexto sin proyección y con relaciones; página vacía, fin sin indicador y paginación incompleta (nueve formas ilegibles, presupuestos, cursor repetido, cuatro cursores inválidos); permisos y acceso por objeto con página HTML de error sin copiar y 403 tardío; 429 sin `Retry-After`; plazo, truncado, tope de bytes exacto y redirección; modos, hosts y límites (incluido el máximo de personas); consulta por ID; valores ilegibles; aislamiento de cuentas y frente a un ticket de otro proveedor con proyección al Radar; credencial; y límites propios del transporte (un `fetch` que ignora la señal no publica nada tardío).
**Control causal: 18 mutantes → 18/18 detectados** (cierre por página corta, `success` falso aceptado, cursor inválido aceptado, perdida sin bloqueo, estado desconocido como sano, persona proyectada como venta, actividad sin `done`, `is_deleted` ignorado, título en la etiqueta, personas con página de 500, cursor sin codificar, omitidos sin degradar la cobertura, proveedor real en modo local, dominio sin validar, consulta por ID con otro registro, token en `Authorization`, presupuesto de páginas ignorado, cursor repetido). Un mutante equivalente (comprobación redundante de la clave `next_cursor`) se eliminó del código en vez de aceptarlo.

## Matriz de capacidades conjunta (Zendesk + Pipedrive)
| Capacidad | Zendesk | Pipedrive | Probada con sintético/local | Pendiente de ensayo real |
| --- | --- | --- | --- | --- |
| Listado por cursor | tickets | oportunidades, personas, organizaciones, actividades | Sí (completa e incompleta) | Cuentas propias, alcances realmente concedidos, visibilidad |
| Consulta por ID | ticket | oportunidad | Sí | Borrados y archivados |
| Rol del Radar | `support` | `sale` (solo oportunidades) | Sí (contra `projectCommitmentEvidence`) | Montaje en la App |
| Objetos de contexto sin rol | — | personas, organizaciones, actividades | Sí (nunca se proyectan) | Decisión de contrato si debieran aportar evidencia |
| Cobertura honesta, permisos, pérdida de acceso, 429, plazos, truncado, bytes, redirección | Sí | Sí | Sí | Cuerpos y cabeceras reales |
| Autenticación | OAuth Bearer | `x-api-token` u OAuth Bearer | Cabecera comprobada; nunca en la URL | Credenciales y alcances reales |
| Modo `live` | `https://{subdominio}.zendesk.com` | `https://{dominio}.pipedrive.com` | Solo URL con fetch simulado | **Todo** |
| Escritura de cualquier tipo | **No existe** | **No existe** | La API no la ofrece | — |
| Shopify / pedidos reales | No | No | — | Cuenta y contrato propios, fase posterior |

## Estado de llegada
| Qué | Estado | Tarea / dueño |
| --- | --- | --- |
| Adaptador, pruebas y matriz | Implementado, interno | Esta unidad · Claude B |
| Estado de fuente para Integraciones (contrato mínimo) | Pendiente de registrar/reclamar: ya en el tablón | `CLAUDE-SOURCE-INTEGRATIONS-CONTRACT` · Claude B |
| Llegada a la App (Integraciones o Radar) | **No existe** | Montaje central de Codex tras ese contrato |
| Ensayo con una cuenta Pipedrive propia | **No hecho** | Requiere cuenta de pruebas y autorización expresa; credencial introducida por la persona, nunca en chat |

## Límites
Solo Windows y Node de este equipo. El servidor local no es Pipedrive: no acredita su formato real ni sus límites. La lista solo trae lo que ve la credencial y no incluye archivadas ni eliminadas; el presupuesto diario de la API se comparte con toda la empresa.

## Hashes finales (sha256)
| Ruta | sha256 |
| --- | --- |
| shared/pipedrive-source.ts | 298e3b1c33950272494a8b307967a8eaf2dea085c0c8d071b908310d9df708f6 |
| server/pipedrive-source.ts | e709256d4fe27ecb373ed0df0e686bd37de7d99a11f562358d5f2505df1235e8 |
| tests/pipedrive-source.test.ts | 266cd696d62ba63fa57271c2abfafcef2b7c6278dd05723124c027538a7100e3 |
| coordination/reports/CLAUDE-SOURCE-PIPEDRIVE.md | (este informe) |
R1 presentado (revisado por Codex): shared 1c1e…, server d734…, tests dc56…. R2 presentado: shared a0c2…, server d734… (sin cambios en R2), tests 7cc2…. Verificado sin cambios en R3: `shared/source-reading.ts` 5e48… y `server/source-read-transport.ts` 563c… (Zendesk R3 aceptada).
