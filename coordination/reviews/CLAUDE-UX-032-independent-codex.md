# Revisión independiente de CLAUDE-UX-032

29/10/2026, Europe/Madrid. Revisor Codex distinto del autor Claude. Solo este informe reservado; fuente/tests del autor leídos sin editar. Sin nuevas fuentes a Claude, cuentas, ventanas o navegador. Skills compliance base y React ya leídas en esta conversación.

## Resultado propio

Ejecutadas **72/72 Node correctas** sobre el árbol vigente:12 customer-combobox y60 ui-journeys, con `node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/customer-combobox.test.ts tests/ui-journeys.test.ts`. Incluyen cuatro casos de integración de selección por ID, ausente, compartida y lector. Los resultados620/620 y32E2E del informe de Claude siguen atribuidos a su autor; no se repitieron aquí. Su build E2E usó cinco fuentes Codex en HEAD: no prueba la integración con la UI actual de Empresa.

Se cotejaron archivos actuales contra hashes presentados antes de devolver; no se edita ni acepta una versión antigua. Se leyó integración: el ID efectivo solo existe si figura en la fuente, prepare vuelve a comprobarlo y no se envía selección ausente a HubSpot/Documentos. La selección permanece compartida entre pestañas.

## P2 · La lista abierta sigue seleccionando cuando disabled cambia a true

`CustomerCombobox` aplica disabled al input y retira clear, pero no lo aplica al popup existente o al callback choose. Secuencia reproducida en el componente real mediante el mismo arnés, añadiendo solo en memoria:

1. Montar contacts base, value c1 y callback espía; abrir con click.
2. Renderizar con disabled:true. El input tiene disabled, pero las opciones siguen en el árbol.
3. Invocar click de la opción data-contact-id c2. Resultado real: onChange recibe c2; esperado: ninguna selección mientras esté deshabilitado.

Las doce pruebas existentes pasan y esta decimotercera falla por aserción concreta `[c2] != []`. Primer intento del proceso auxiliar falló al cargar importdefault por configuración de transpile; corregido esModuleInterop, las doce pasan y el fallo es exclusivamente la regresión descrita. No se presenta aquel error de arnés como evidencia del defecto.

El consumidor actual CommercialWorkspace no pasa disabled; no se afirma bypass de permisos o cambio de cliente durante busy en la app actual. Es un incumplimiento del contrato reutilizable y de su criterio «deshabilitado no elige», que hoy solo prueba el montaje inicialmente disabled. No se ha comprobado el gesto en navegador; el li onClick visible no depende del input disabled y el arnés ejecuta ese callback real.

Corrección pedida mediante board.revise: cerrar/ocultar popup al deshabilitar y asegurar bloqueo efectivo de selección; comprobar transición con lista abierta y que habilitar de nuevo no resucite un popup antiguo. Añadir regresión persistida en archivos propios y presentar hashes nuevos. Conservar teclado, homónimos, borradores y guardas de ID. El autor mantiene sus reservas, no se altera su fuente desde esta revisión.

## Dictamen

Devolver para corregir, sin aceptación final todavía. Repetir focales tras nueva presentación y cotejar hashes; no requiere repetir una batería global o todos los E2E solo por rutina si no hay otra preocupación. Sin ReactDOM/StrictMode, QA visual, lector de pantalla real o prueba de foco de este revisor. Este propio informe no se autoacepta; queda presentado para revisión separada.
