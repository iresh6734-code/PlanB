# CODEX-HS-024 · Fechas de la muestra de actividad

29/10/2026, Europe/Madrid. Autor Codex. Corrección local posterior al diseño HS023; no se enviaron estas fuentes a Claude. Revisión independiente requerida antes de aceptar.

## Fallo reproducido y cambio

La ordenación textual invertía instantes con offsets distintos y un timestamp Unix numérico podía lanzar `localeCompare is not a function`, impidiendo devolver toda la ficha. Se normaliza `hs_timestamp` al construir cada actividad y se ordena por milisegundos del instante. La forma de respuesta sigue siendo `at: string | null`; valores válidos se devuelven en ISO UTC canónico.

El helper acepta enteros Unix en milisegundos (número seguro o texto decimal) y fechas ISO de año de cuatro dígitos, segundos, fracción opcional de uno a tres dígitos y zona explícita Z/offset. Comprueba calendario, bisiestos, componentes y rango de Date. No interpreta horas locales, fechas sin hora, segundos Unix inferidos, expresiones relativas, notación exponencial o tipos inesperados. Fechas inválidas pasan a null, que la interfaz ya muestra como Sin fecha. Desconocidos van al final; empates y desconocidos conservan el orden de selección.

El rango no impone una política comercial de antigüedad o futuro. Epoch cero y fechas anteriores son válidos; la fracción se conserva en milisegundos. No es un parser de todas las variantes ISO8601. El comparador interno solo recibe fechas ya normalizadas por el helper.

## Verificación

Se añadieron seis pruebas de integración contra TeamOAuth.context, con PGlite separado y transporte ficticio de solo lectura. **Antes del cambio fallaron cinco y pasó un control positivo**: offsets invertidos, Unix que rompía localeCompare, fecha imposible, empate/fecha inválida y normalización de precisión. Tras el cambio **75/75 afectadas correctas**, las 69 anteriores más seis nuevas. Typecheck correcto.

Las nuevas cubren offsets; equivalencia ISO/Unix numérico/texto; 16 entradas inválidas o ambiguas; orden estable por tipo; bisiesto, fracciones, epoch/negativos; vencimiento futuro que conserva kind tasks; actividad más reciente fuera del cupo que sigue sin seleccionarse; número de GET intacto y aviso parcial vigente. Las anteriores vuelven a verificar aislamiento/refresh, errores opcionales, deadlines y máximo20GET con retry429. No son pruebas de API remota ni de navegador.

Comandos:

    node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-context-dates.test.ts tests/hubspot-context-retry.test.ts tests/hubspot-context-budget.test.ts tests/hubspot-context-partial.test.ts tests/hubspot-context-sampling.test.ts tests/hubspot-context-isolation.test.ts tests/hubspot-oauth-refresh.test.ts tests/commercial.test.ts
    node node_modules/typescript/bin/tsc --noEmit

## Límites y siguiente entrega

No cambia selección de IDs, ocho detalles/dos por tipo, rutas, scopes, presupuestos, retries, identidad de portal o presencia en captura. No prueba recencia global y no cambia el significado de hs_timestamp de tareas: sigue siendo vencimiento y puede estar en el futuro. Su etiqueta visible y zona horaria deben explicarse en una entrega UI posterior (R18), sin dar por resuelta la semántica con esta normalización.

El plan aceptado de HS023 deja la búsqueda reciente condicionada a corroborar filtros/scopes por endpoint y nuevo presupuesto explícito. No se amplía la allowlist o los permisos por inferencia. Sin API autenticada, credenciales, clientes reales, cuentas Google/Gmail, cambios en piloto, build publicado, reinicio o commit. No nueva llamada a Claude para repetir recomendaciones anteriores.
