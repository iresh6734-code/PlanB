# «Fila de fuente» · traspaso para Integraciones (CLAUDE-SOURCE-STATUS-ROW)

9/11/2026, Europe/Madrid. Claude B. **Estado real:** `SourceStatusRow` es un componente probado con DOM real y con vistas derivadas por `describeSourceStatus` aceptado. **No está montado**: ni Integraciones ni ninguna pantalla lo muestran, no existe el GET de estado ni el registro de fuentes ni ninguna acción de lectura, y el componente no hace `fetch`. Que exista no conecta ningún proveedor.

**R2 (10/11/2026, devolución 312 F1):** la identidad del estado de la fila pasó de una lista parcial de campos a la **representación normalizada completa** de la vista validada; ver «Identidad del estado y clave de la fila» más abajo. El anfitrión **debe** dar a la fila una `key` de ámbito (nueva sección): la fila no puede conocer lo que la vista no lleva.

## Dependencias y huellas
| Dependencia | Uso | Estado / huella probada |
| --- | --- | --- |
| `shared/source-status.ts` (SourceStatus R3) | `sourceStatusView` (validación), `describeSourceHeadline`, `ACTION_LABEL`, tipos | **Aceptada**, `fddfda1bd5b73d4b5a32e0eca96e6b58a9188d6b7b50be911421c37cf2a08da1`; el banco falla si cambia |
| `shared/source-reading.ts` y adaptador Zendesk (aceptados) | Solo en las pruebas, para derivar vistas reales | Aceptados |
| `shared/continuity-passport.ts` (308) | **No se usa**: la hora se formatea con `Intl` de Madrid dentro del componente | — |
| `SourceReadingHistory` (HISTORY-UI, en revisión) | Solo como `children` en el montaje; el componente no lo importa | En revisión 306 |

## Props acordadas con Codex
```tsx
<SourceStatusRow
  view={status}                                  // SourceStatusView derivada EN EL SERVIDOR por describeSourceStatus (el futuro GET de estado); se vuelve a validar
  actions={{ 'run-explicit-read': readNow }}     // Partial<Record<Exclude<NextAction,'none'>, () => void | Promise<void>>>; solo lo que el anfitrión puede ejecutar de verdad
>
  <SourceReadingHistory source={…} contextRevision={…} label={…} environment="ensayo" identityKey={historyIdentityKey({…})} />   // opcional: detalle secundario
</SourceStatusRow>
```
- El botón aparece **solo** si hay un manejador para `view.nextAction`. Sin manejador se explica la condición que falta («esta pantalla todavía no tiene esa acción»); con `none` se dice «Sin acción pendiente» y nunca hay botón.
- El componente no ejecuta nada por sí mismo, no consulta red y no conoce el registro de fuentes. El GET de estado devuelve la `SourceStatusView` ya derivada (decisión de Codex): no se transporta la `SourceReading` completa ni textos de registros.
- Una acción: **una sola llamada** mientras espera («En curso…», botón deshabilitado); al terminar dice «La acción terminó. Este estado solo cambia cuando se vuelve a consultar» (no se inventa un éxito ni un cambio de estado); si el manejador rechaza o lanza, «La acción no se pudo completar» y se puede reintentar. Si cambia el estado (cualquier campo de la vista validada: otra lectura, otra autorización, otra cuenta, otro acceso, otra acción…) mientras espera, el resultado de la acción anterior **no se aplica** al estado nuevo, «En curso…» desaparece y los detalles se cierran.
- Tras una acción el anfitrión debe **volver a consultar** el estado y pasar la `view` nueva.

## Qué muestra (orden de lectura)
1. **Herramienta y cuenta:** `label`, etiqueta «Ensayo · datos ficticios» si el proveedor es `*-fixture`, y «Cuenta comprobada X» / «Cuenta configurada X (identidad sin comprobar)» / «Sin cuenta configurada».
2. **Qué se intentó y qué se observó:** el titular de `describeSourceHeadline` (p. ej. «Intento interrumpido · recuento desconocido»), una línea con la **hora observada** (Madrid), cobertura, recuento (null = «recuento desconocido (no es cero)», nunca 0), causa y «antigua» si lo es, y, en un intento sin datos, «Qué se intentó:» con la frase de evidencia de SourceStatus (no salió ninguna petición / falló la red antes de recibir respuesta / se interrumpió sin saber si llegó respuesta / error de la fuente / respuesta inutilizable).
3. **Siguiente paso:** botón o explicación, como arriba.
4. **«Detalles y recibos» (cerrado por defecto):** botón con `aria-expanded`; al abrir muestra el detalle de SourceStatus (frase de cada afirmación) y `children`. **`children` no se monta hasta abrirlo**, así que el historial no consulta nada mientras esté cerrado. Un estado nuevo vuelve a cerrar los detalles.
5. Pie permanente: «No conectado: este estado no prueba una conexión ni se actualiza solo.»

Un estado que no cumple el esquema no se dibuja: «El estado de esta fuente no es válido y no se muestra… se desconoce (no es cero)», sin acciones.

## Texto por situación (derivado de SourceStatus; verificado en DOM real)
Configuración preparada (sin cuenta / sin autorización / con cuenta) · Lectura de ensayo (ficticia) · Lectura observada (reciente / antigua / vacía / parcial con «al menos N» y causa) · Intento sin petición · Intento sin respuesta (red) · **Intento interrumpido** (plazo o cancelación) · El proveedor respondió con un error. Todos con «recuento desconocido (no es cero)» cuando no hay lectura. Ninguno afirma ni ofrece «conectar».

## Identidad del estado y clave de la fila (R2)
La fila guarda dos cosas propias: si los detalles están abiertos y la fase de la acción (`En curso…`, terminó, falló). Ambas pertenecen a **una identidad**; cuando esta cambia se descartan **antes de pintar** y el resultado tardío de una acción anterior no se aplica. Hay dos niveles y el anfitrión es responsable del segundo:

1. **Lo que la fila ve por sí misma:** `JSON.stringify` de la vista validada y normalizada (esquema estricto). Cualquier cambio semántico de la vista —autorización renovada, cuenta comprobada, recuento, listado vacío, cobertura, «ya no antigua», acceso, afirmaciones— es otro estado, aunque la hora de la lectura y el número de peticiones coincidan. Un **objeto nuevo con el mismo contenido** (un sondeo que devuelve lo mismo) **no** reinicia nada; volver a una vista anterior (A → B → A) tampoco recupera la actividad ni los detalles de la primera A.
2. **Lo que la vista NO lleva:** instalación, captura, generación del contexto, pin y fuente exacta (ID local del registro). Dos fuentes distintas pueden producir vistas idénticas y textos idénticos. **El anfitrión debe pasar `key={…}` a `<SourceStatusRow>`**, formada por la identidad completa del ámbito (p. ej. la `historyIdentityKey` de 9 campos del historial + instalación + captura + generación + pin + ID local de la fuente + revisión del registro). Una `key` de título o de proveedor **no basta**. Al cambiar la clave React desmonta la fila: cierra detalles, retira «En curso…», desmonta `children` (el historial) y la terminación tardía de la acción anterior no se aplica (el componente lo comprueba al desmontar).
   - Contrapartida: una clave que cambia sin necesidad (p. ej. un reloj) descarta trabajo en curso; no uses en ella datos volátiles.
   - Bloquear o cambiar de copia: el anfitrión **desmonta** la fila (no la deja con la vista anterior); la fila no decide ocultar datos de otro ámbito.
   - Tras una acción el anfitrión vuelve a consultar y pasa la vista nueva; si es idéntica, «La acción terminó…» se conserva; si cambió, se reinicia.

Qué verifican las pruebas: `tests/e2e/source-status-row.spec.ts` (Chromium, DOM real; las cuatro pruebas R2 cubren renovación de autorización, variantes que conservan hora y peticiones, vista idéntica / A→B→A / respuesta tardía y cambio de `key`). Las pruebas SSR (`tests/source-status-row.test.ts`) solo comprueban textos, no estado ni foco.

## Puntos de inserción (propuestos; Codex monta)
| Paso | Archivo | Dueño | Depende de |
| --- | --- | --- | --- |
| 1. Registro local de fuentes, ámbito y `SourceRegistryEntry` por sesión | Módulo de servidor nuevo | Codex coordinador | Contrato de estado aceptado |
| 2. GET local de estado (sin red) que devuelva la `SourceStatusView` derivada | API nueva + `server/main.ts` | Codex coordinador | Paso 1 |
| 3. Acción explícita de lectura de ensayo contra un origen ficticio y su contrato | API nueva | Codex coordinador | Paso 1; revisión propia |
| 4. Montar `<SourceStatusRow>` bajo la fila de cada fuente en `LocalIntegrations` (estados `loading/locked/error` ya existentes del hub se conservan) con `children` = historial y `key` de ámbito completa (sección anterior) | `src/LocalIntegrations.tsx` (+ `App.tsx` para pin y captura) | Codex coordinador | Pasos 1–3; HISTORY-UI aceptada |
| 5. QA del producto montado | `CLAUDE-SOURCE-HISTORY-MOUNT-QA` | Claude B | Pasos 1–4 |

## Lo que NO existe
Registro de fuentes, GET de estado, acción de lectura (de ensayo o real), montaje en Integraciones, ensayo con cuenta real. La lectura real posterior necesita cuenta y alcance propios y su resultado se presentaría con el proveedor observado y la fecha acreditada; la presencia de una credencial o de un recibo guardado no prueba una conexión actual.
