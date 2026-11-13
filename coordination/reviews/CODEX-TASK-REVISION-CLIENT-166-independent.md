# Revisión171 · cliente condicional166

4/11/2026, Europe/Madrid. **Aceptar166 como cliente independiente sin montaje en UI o gestor136.** Revisor Codex de otra sesión. Se leyeron cliente,contratos,pruebas y handoff;los cuatro hashes presentados coinciden antes y después de las comprobaciones. No se editaron sus archivos.

## Evidencia propia

Snapshot `tests/.tmp/client171-6cf6a3ab-4984-445b-925a-ae1b46368532`. **8/8 pruebas independientes +11/11 del autor repetidas**,typecheck focal limpio,0skip/TODO. No se repitieron las25focales completas del informe166;esa cifra pertenece a su autor.

Los casos propios verifican con Fastify/Store en memoria reales y transportes controlados:

- Mutar los objetos de la vista y valores del llamante después de despachar no cambia el PATCH enviado ni la identidad usada para validar el acuse.
- La identidad esperada de una lectura queda capturada antes de su respuesta;una mutación posterior del objeto no reinterpreta lo recibido.
- Valores distintos,una transición changed:true con revisión intacta o changed:false con revisión nueva no confirman. En casos de escritura aplicada se preserva el historial real aunque el cliente informe incertidumbre.
- Abortar después de que el servidor aplique un cambio impide aceptar un acuse tardío;la comprobación solo lee y el token antiguo se rechaza al pedir explícitamente otra escritura. No hay reenvío automático.
- Un4xx con cuerpoHTML inválido sigue siendo rechazo HTTP,sin convertir cualquier409 en conflicto de revisión. Un500no confirma y queda incierto.
- Un cuerpo detenido tras recibir headers vence el plazo y cancela el lector;UTF8inválido yContent-Lengthsuperior al límite no producen lectura válida. Se cancela el stream y no se consume completo.
- cache:no-store,credentials:same-origin,redirect:error y codificación exacta deID;404no activa fallback a otra ruta.

Los11casos del autor incluyen además un fetchnativo sobre HTTPloopback real;los demás usan injectreal convertido enResponse o transportes sintéticos declarados. El bloqueode red externa y entorno mínimo se mantienen. No se guardan cookies,claves o datos de clientes. Los procesos de prueba terminan;las Apps se cierran en finally. No fue necesario navegador porque no hay UI nueva.

## Sensibilidad

Tres mutaciones únicamente en la copia privada:dejar de clonar la vista revisada;suprimir la comprobación de valores del acuse;tratar cualquier409como conflicto de revisión. Cada una hace fallar porAssertionError la prueba propia seleccionada,sin fallo de imports,compilación o timeout. Se restauró el cliente de la copia y se cotejaron todos sus hashes y los cuatro presentados. No se aplicaron mutaciones al checkout.

## Dictamen y límites

No se halló un defecto bloqueante en el alcance revisado. changed:false conserva su distinción y el resultado entrega la revisión actual. El guardado mantiene una clasificación conservadora de incertidumbre cuando no hay un acuse válido;no prueba autoría leyendo valores iguales. No sustituye a TaskContext completo123 ni al control de la selección que debe hacer el consumidor de una respuesta tardía.

166 **no es SaveStrategy136 ni se monta en la ficha**. La adaptación debe preservar no-op y revisión nueva,comparar contexto y mantener borrador;requiere otra reserva coordinada con ClaudeU1/U2. No se acepta por esta revisión una garantía multiproceso,idempotencia por intención,persistencia tras recarga,HubSpot o un runtime actualizado. Las rutaslegacy siguen sin comparación de revisión. La demo161 continúa con su backend anterior160 hasta otra unidad compilada.

Se acepta166 sobre sus cuatro hashes actuales.171 se presenta para revisión ajena y mantiene sus dos reservas,sin autoaceptación.
