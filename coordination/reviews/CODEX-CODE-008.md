# CODEX-CODE-008 · Desarrollo real delegado a Sonnet

29/10/2026, Europe/Madrid. Autor: Codex. Estado final de revisión: entrega de código recibida, 86/86 pruebas y typecheck correctos; apta para aceptar como módulo puro, aún sin integración en el importador.

## Encargo y coordinación

Petición expresa del usuario: enviar tareas potentes de código, mejoras y desarrollo a Sonnet 5.5 en la terminal integrada visible; operar esa terminal desde este ordenador cuando haga falta escribirle. Esta autorización se refiere a esta instalación actual y no incluye el ordenador original de empresa, cuentas ajenas o controles de protección. Una interrupción física del usuario detiene el control; la nueva petición reanuda el trabajo autorizado.

CLAUDE-CODE-008 quedó registrado y reservado antes del envío. Sonnet puede crear únicamente:

- shared/crm-capture-contract.ts
- tests/crm-capture-contract.test.ts
- coordination/reports/CLAUDE-CODE-008.md

Codex tiene su reserva separada para tests/crm-capture-contract.acceptance.test.ts y este informe. No se editan archivos de Sonnet durante su trabajo. El contrato se incluye íntegro en el mensaje; no necesita leer fuentes existentes ni los seis archivos cuyo envío se rechazó previamente. Tampoco puede leer las pruebas independientes de Codex. Se permite escribir y releer exclusivamente sus tres archivos nuevos y ejecutar `node --import tsx --test --test-concurrency=1 tests/crm-capture-contract.test.ts`, sin dependencias, red, cuentas, agentes, cambios de permisos o ejecución del runner general. Codex gestiona presentación y revisión.

## Evidencia de envío

El control de Windows falló al activar la ventana dos veces. Se informó del error y el usuario hizo clic en la entrada y respondió «listo». Tras refrescar el estado y enfocar la terminal se pegó el encargo; la captura mostró Pasted text #3. Codex pulsó Enter. La lectura posterior de la terminal confirmó el texto del contrato y el estado de elaboración de respuesta. No se confunde el fallo de enfoque con ausencia de permiso del usuario.

## Contrato proporcionado

Módulo puro TypeScript sin dependencias. API: CrmCaptureContract(binding, entities, limits), addPage(binding, entity, cursor, page) y finalize(binding). Tipos exportados CaptureBinding, Entity, CapturePage, CaptureLimits, CaptureSummary y error tipado CaptureContractError con code.

Binding por tenantId, portalId y generation. Paginación por entidad, rechazo de cursores inesperados/repetidos y páginas vacías no terminales; IDs únicos dentro de cada entidad, permitiendo el mismo ID en tipos distintos. Recuentos declarados consistentes, límites globales, validación runtime, invalidación permanente al fallar durante recolección, finalización completa e idempotente y resumen profundamente congelado. Entradas no retenidas por referencia mutable. No se integra todavía en el importador real ni se afirma protección activa del producto por crear el módulo.

## Trabajo paralelo de Codex

Pruebas de aceptación escritas antes de leer la implementación de Sonnet. Cubren intercalado multientidad, mismo cursor/ID en tipos distintos, límites globales y frontera exacta, cambios de cada parte del binding, generación al finalizar, fallo cerrado, mutación de entradas, freeze profundo, bucle de tres páginas, salto de cursor, total omitido después de declararlo, recuento insuficiente, duplicado pese a total coincidente, páginas inválidas y límite predeterminado ante recorrido infinito. **37/37 correctas** en la comprobación independiente inicial.

## Entrega recibida y revisión

La terminal confirma escrituras reales de shared/crm-capture-contract.ts (277 líneas), tests/crm-capture-contract.test.ts y coordination/reports/CLAUDE-CODE-008.md. Sonnet informa 49 pruebas correctas y queda esperando revisión. Codex lee el módulo y su informe; no toma su afirmación como sustituto de una ejecución propia.

El módulo copia y congela el binding, separa estado e IDs por entidad, valida una página antes de aplicar contadores, conserva totales declarados entre páginas y libera los conjuntos al invalidar/finalizar. Cada error durante collecting descarta permanentemente la publicación. Los cursores terminales repetidos se rechazan sin mutación publicable. Finalizar repetidamente devuelve el mismo resumen congelado.

Decisiones revisadas: un cursor entrante ya consumido usa CURSOR_LOOP; un cursor null repetido o página tras terminar una entidad usa CURSOR_MISMATCH. Un binding mal formado usa INVALID_INPUT, uno válido pero distinto usa BINDING_MISMATCH. La comprobación de total se realiza al terminar; si el proveedor anuncia más/menos registros antes de esa página, aún no existe resumen publicable. Encajan con el contrato; no se fuerza otra semántica para acomodar una prueba.

Validación final propia de Codex:

```text
node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/crm-capture-contract.test.ts tests/crm-capture-contract.acceptance.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Resultado: **86 pruebas, 86 correctas, 0 fallos** (49 de Sonnet + 37 de Codex). Typecheck finaliza con código 0. Red externa bloqueada en las pruebas de Codex. Sin instalación, cambio de dependencias, permisos o fuentes preexistentes. La revisión es independiente del autor Claude; las pruebas de aceptación no se le enviaron ni fueron editadas por él.

Entrega presentada en el tablón antes de la validación final, con hashes:

- shared/crm-capture-contract.ts: defe0ab7dcf4290f499941aecef7d21f7ed80612a222c1be866365e51ea461b9
- tests/crm-capture-contract.test.ts: 40435f25b9577f6149df34d2963c78e5ccdc5b56b38f68303d8025cc8afda593
- coordination/reports/CLAUDE-CODE-008.md: 59333ed163fd1c00e6d628ffee9e6294501d36aef01ec9e3591628bb9629fc62

El comando de aceptación vuelve a cotejar esos hashes. La aceptación corresponde al módulo y su contrato aislado; complete:true acredita recorrido terminado según ese contrato, no exhaustividad garantizada del proveedor ni snapshot remoto consistente. La conexión con importHubspot y una generación persistida real requiere otra unidad reservada; no se sustituye tenantId por portalId ni se inventa una generación para forzarla. No hay despliegue o uso activo en el piloto por esta entrega.

## Continuidad pendiente para el responsable de memoria

CONTEXTO-PROYECTO.md sigue reservado por CODEX-DUET-MEM-001; no se sobrescribe. Nota para integrar: «29/10/2026 Europe/Madrid: usuario autoriza operación directa de terminal integrada para delegar desarrollo a Sonnet 5.5. CLAUDE-CODE-008 enviado y completado de forma visible; tres archivos nuevos exclusivos para módulo de contrato de captura y pruebas, sin leer fuentes privadas anteriores. Codex revisa su código y escribe 37 pruebas independientes; batería conjunta 86/86 y typecheck correctos. Aceptación del módulo aislado con hashes; integración con importador y generación persistida siguen pendientes. Sin cambios de permisos, cuentas, despliegue o equipo original.»
