# CODEX-HS-007 · Muestra de actividad repartida entre tipos

29/10/2026, Europe/Madrid. Codex continúa el hallazgo H4 del informe anterior de Claude, contrastado con el código actual. No se envían fuentes nuevas ni se repiten consultas de modelo para una política acotada.

Antes se leían hasta dos notas, tareas, reuniones y llamadas antes de llegar a correos. Con ocho detalles disponibles y todos los tipos saturados, los correos quedaban sistemáticamente fuera. Ahora se selecciona primero una asociación de cada tipo disponible y después una segunda por tipo hasta completar ocho.

Se conservan los límites de dos por tipo y ocho detalles en total. El contacto y el propietario autorizado son lecturas separadas del presupuesto. No se amplía readonlyFetch, rutas POST, permisos, alcance de la captura o credenciales. Cada GET mantiene la comprobación de identidad vigente y la comprobación final H3. El texto aclara que la selección de asociaciones no garantiza incluir las actividades más recientes; el orden por fecha se aplica solo a la muestra elegida.

## Evidencia

Antes de editar OAuth: cinco pruebas nuevas, cuatro controles correctos y una regresión fallida por ausencia de emails entre los tipos recibidos. Después: cinco pruebas correctas y **41/41 pruebas afectadas correctas**, con fetch sintético, PGlite separado y red externa bloqueada. Typecheck correcto.

Casos: cinco tipos saturados, tipos vacíos que permiten completar segundos detalles, un solo tipo y ausencia de actividad, propietario fuera del presupuesto y orden de la muestra, y desconexión durante la primera vuelta. Los tests comprueban GET/destino/redirect, asociaciones válidas, máximo de ocho y máximo dos por tipo.

Comandos:

    node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-context-sampling.test.ts tests/hubspot-context-isolation.test.ts tests/hubspot-oauth-refresh.test.ts tests/commercial.test.ts
    node node_modules/typescript/bin/tsc --noEmit

## Límites

No se resuelve la búsqueda de recencia real, paginación de asociaciones, prioridad temporal entre tipos, fecha de vencimiento de tareas o tolerancia a errores individuales H5. El reparto prioriza diversidad de tipos dentro del límite; los segundos cupos siguen el orden declarado. No hay OAuth/CRM real, UI, despliegue, reinicio del piloto o datos añadidos a la app. Las fuentes de captura/runner reservadas por otros encargos no se modifican. No se atribuyen estas pruebas a Claude.

## Hashes

- server/team/oauth.ts: 5f67cf22ea391d32c9a53d5f9a7995a057474ed282af737fa009e31ace338af3

- tests/hubspot-context-sampling.test.ts: 6ecd0ee448e970dfb249f6c37ffa45d2fe41b57bed6b475996b6d02272e2054a
