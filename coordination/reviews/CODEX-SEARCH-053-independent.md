# Revisión independiente de CODEX-SEARCH-053

2/11/2026, Europe/Madrid. Codex revisor distinto del autor. Dictamen: **devolver para corrección**, sin aceptación completa de 053.

## Hallazgo reproducido · la revisión no identifica la instalación ni la cuenta

En `server/workspace-search.ts`, la revisión se calcula con `{ captureId, spec, records }`. No incluye la identidad de instalación, la cuenta de origen ni el contenido completo de la captura. El endpoint `search-record` comprueba solo `captureId` y esa revisión. El consumidor verifica esos mismos campos al abrir; no compara la cuenta devuelta con la de los resultados originales.

`node --import tsx --test tests/independent-workspace-search-143.test.ts`: **1/1 observación del defecto**, no una regresión verde. Dos `createBaseApp` independientes con SQLite en memoria usan capturas ficticias de idénticos ID, fecha, registros y especificación, pero cuentas e `instanceId` distintos. La búsqueda devuelve igual `captureId` y revisión pese a distinta cuenta. Enviar a B la selección preparada en A devuelve 200 y el registro de B. Esto prueba la colisión del contexto y la aceptación por API; no demuestra acceso no autorizado, una conmutación real del navegador ni que dos registros con valores distintos reciban igual revisión.

Si cambia la instalación o la captura mientras el diálogo está abierto, una selección debe quedar ligada al contexto original. Pedir al autor que incluya una identidad de instancia y una revisión de captura/cuenta suficientemente vinculada al origen, y que el consumidor rechace respuestas de contexto distinto; no confiar solo en ID y fecha. Añadir pruebas causales para dos instalaciones, sustitución de captura con mismos ID/fecha y fuente distinta, cambios entre búsqueda y apertura, y respuesta tardía, sin alterar guards de autenticación ni exponer secretos. Si un flujo existente no permite observar el cambio, documentar la precondición y conservar un rechazo seguro.

## Lo revisado

- Las diez rutas y su informe coincidían con el submit al inicio. Se leyeron motor, API, diálogo y el informe de montajes.
- `node --import tsx --test tests/workspace-search.test.ts tests/workspace-search-api.test.ts tests/search-context.test.ts tests/auth-parent.test.ts`: **20/20**, SQLite en memoria y arnés local. Cubren búsquedas, paginación, guardas y cuatro pruebas de autenticación; no cubren la colisión entre instalaciones anterior.
- 117/120 se aceptaron en otra revisión, pero no constituyen por sí solos la aceptación de toda la búsqueda 053. No se repitió aquí el DOM de 053 ni se realizó una revisión exhaustiva del checkout completo. La prueba observacional nueva deberá invertirse o sustituirse tras la corrección, y su versión anterior debe fallar por la causa.
- Sin servicios externos, datos de clientes o cuentas reales. La revisión se centró en el corte actual; la integración posterior 140 es una unidad diferente.

## R2 · Corrección revisada y aceptada

Después de la devolución, el autor presentó 053, 078, 145 y 146 de nuevo. Los **17 hashes de esas cuatro entregas** coincidían con el tablón antes y después de mi revisión. La identidad de búsqueda actual liga instalación, captura completa, generación y sesión; la respuesta que abre un registro comprueba la revisión y la interfaz compara el contexto con el estado de la App, sin adoptar el de una primera respuesta arbitraria. Un servidor antiguo sin esa identidad bloquea la búsqueda con mensaje de actualización. La captura candidata no reemplaza el contexto activo.

Evidencia propia adicional, separada de la del autor:

- Invertí `tests/independent-workspace-search-143.test.ts`: ahora exige revisiones distintas y 409 entre instalaciones. **Pasa en el código actual** y **falla en una copia del baseline anterior**, con AssertionError por revisiones iguales, no por infraestructura. El baseline usado está en `tests/.tmp/search143-baseline-83dd40b6-36ad-440f-93c7-3160b77a5d9d`.
- **64/64 Node** de búsqueda/API, identidad, mi regresión, autenticación y bancos de contratos; y **47/47 Node** de operaciones e integraciones usadas por los montajes. Son 111 pruebas en dos ejecuciones propias, sin sumar las del autor.
- **11/11 DOM** del snapshot aislado de 145, con fixture propia y Chromium headless; incluye las seis pruebas de búsqueda y cinco de identidad en la App, teclado, paginación, respuestas tardías y rechazos de fuente ajena. Resultados y captura inspeccionada a 320 px en `tests/.tmp/search143-r2-15adbf9d-f038-4d52-9e87-2f62acf337fa`. Red externa bloqueada; proceso de fixture propio cerrado. El corte congelado cotejó 234 hashes sin deriva; la única diferencia con checkout fue mi propio test 143 invertido después del corte.
- `npx tsc -p tests/.tmp/search145-2467b143-69ee-46db-89e1-9a21d593abb3/tsconfig.json`: limpio sobre el corte focal, no todo el checkout. Comparé por AST las llamadas de aserción de las fixtures modificadas: 7/7 de 078 y 183/183 de 146 idénticas en texto normalizado.
- Los montajes 117/120 y la conciliación de autenticación ya habían sido revisados en `CODEX-APP-MOUNT-REVIEW-127`; en este corte repetí las pruebas de autenticación, operaciones e integraciones indicadas. La aceptación de búsqueda no acepta automáticamente otros informes pendientes ni demuestra su despliegue.

**Dictamen:** aceptar 053/078/145/146 sobre sus hashes presentados. El cálculo es síncrono dentro del proceso cooperativo, no un bloqueo frente a un escritor SQLite externo. El hash no es autenticación ni firma; un estado idéntico en todos sus componentes conserva identidad. El editor anterior sigue sin CAS/idempotencia, D7 permanece independiente y no se ha conectado HubSpot ni actualizado la demo abierta. El resultado de navegador es Chromium en ficción, no Edge ni lector de pantalla. No se ejecutó la suite global `npm test`.
