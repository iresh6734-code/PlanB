# Jornada 205 R2 · dictamen independiente favorable

Se acepta el modelo y el componente independiente sobre las siete huellas registradas. La Jornada conserva decisiones en memoria, explica el presupuesto y prepara una lista de trabajo. El montaje en Hoy queda para una entrega posterior.

Las tres sondas independientes de la primera revisión pasan en Chromium. Con 30 minutos, una tarea de 25 y otra sin estimación conservan su selección y el resumen indica que el saldo es indeterminado. Cada etiqueta enlaza con el campo de su fila para `segment/1` y `segment:1`. Al fijar `record"1` con Enter, el foco permanece en esa fila aunque también exista `record1`. Las tres sondas registran cero peticiones y cero errores.

La suite del autor pasa 22/22 en Node y 16/16 en el arnés de Chromium, incluidos el restablecimiento del saldo al estimar, la impresión emulada y las vistas de 1440, 390 y 320. El análisis focal de tipos del componente y las dos suites sale limpio. Las capturas se generaron como evidencia de las pruebas y el dictamen se basa en sus aserciones. Las mutaciones se mantienen como evidencia de la autora.

El corte privado `tests/.tmp/day208-2a3223ff` conserva el manifiesto, las huellas adicionales de estilos, los resultados y el JSON de las tres sondas. Se utilizaron datos ficticios y Chromium aislado. Antes de montar en Hoy, debe probarse el cambio de copia con el mismo ID de tarea y el filtrado de pistas de guardado por contexto completo.

---

## Primer dictamen · histórico

# Jornada 205 · revisión independiente 208

5/11/2026, 17:34:41, Europe/Madrid. **Devolver 205 para corrección.** Se conservan sus siete reservas y las fuentes presentadas. Los 17 casos Node originales pasan y el typecheck focal del componente y la suite está limpio. Tres recorridos independientes en Chromium reproducen problemas de la interfaz.

## F1 · El saldo de tiempo se muestra como conocido con duración pendiente

En un presupuesto de 30 minutos, se estima una tarea en 25 y se elige a mano otra sin duración. El resumen dice «En 30 min: 2 tareas (25 min, 5 min libres). 1 tarea pide una decisión.». La tarea automática explica que cabe en el tiempo restante. La advertencia de duración desconocida aparece en la fila y en «Por decidir», pero el saldo del resumen y la afirmación de cabida suponen que lo desconocido ocupa cero. En el modelo, los minutos y posiciones se calculan sobre el subtotal conocido.

Mantener la tarea manual y el subtotal de 25 minutos. Mientras una tarea elegida tenga duración desconocida, mostrar el saldo como indeterminado y evitar afirmar que las propuestas caben o que pueden empezar en un minuto exacto después de esa tarea. Si se muestran propuestas provisionales, que se entiendan como tales. Cuando se declare la duración, se recuperan el saldo y la planificación correspondientes.

## F2 · Etiquetas duplicadas vinculan la estimación a otra ficha

Las tareas `segment/1` y `segment:1` generan el mismo ID HTML `cd-est-segment_1-d`. El navegador resuelve `label.control` de la segunda tarea a la primera. El nombre accesible y el foco deben corresponder a la tarea que se está estimando. Usar una identidad única de cada campo en lugar de sustituir caracteres del ID de CRM.

## F3 · La restauración de foco pierde la identidad al retirar comillas

Con dos tareas de diez minutos e IDs `record"1` y `record1`, se pulsa Enter en «Fijar» de la primera. La acción fija la primera, pero el foco termina en el botón de la segunda. El selector elimina las comillas antes de buscar el control. La restauración debe conservar el ID exacto y limitarse a la instancia del componente.

## Evidencia y montaje

Corte `tests/.tmp/day208-9b8e0dab` con siete huellas cotejadas. `author-node.log` contiene la repetición 17/17. `dom-review.json` contiene los tres resultados. Se abrió la captura `unknown-390.png`, donde se ve el saldo junto a la advertencia. El arnés propio monta el componente con React en Chromium, CSS del componente y datos ficticios. No carga Hoy ni usa red. Los 12 casos DOM y las ocho mutaciones del informe original corresponden a la autora.

El montaje futuro necesita identificar la jornada por contexto completo. Los estados locales del componente están ligados a IDs de tarea. El ejemplo del handoff debe indicar que cambiar de instalación, captura o generación cambia la identidad del componente. Así se conservan decisiones al ajustar tiempo o filtro dentro de la copia y se evita atribuirlas a una tarea homónima de otra copia. Es un criterio de montaje pendiente, no un fallo observado en Hoy.

La corrección queda en [el encargo R2](../briefs/CLAUDE-CONTINUITY-DAY-205-R2.md).
