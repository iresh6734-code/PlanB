# Piloto ASDD · Trabajo por recuperar

Aplica la plantilla 250 únicamente al tramo A4 del encargo de Hoy 240. El frente de Hoy conserva la implementación. Este brief concreta el criterio de aceptación. No abre reservas de código ni modifica el protocolo general. El montaje depende de la aceptación de `CLAUDE-INTENT-JOURNAL-208` y de que los responsables acuerden y reserven las rutas exactas de la API protegida y su consumidor.

## Objetivo y permiso

Tras reiniciar Plan B, una persona autorizada puede entrar en Hoy, abrir «Trabajo por recuperar», retomar el intento exacto de su copia y comprobar su estado leyendo. Prueba el arranque normal con `main` compilado, una base SQLite ficticia de archivo y una raíz de prueba propia. Para fallos de proceso, usa barreras explícitas y detén únicamente los procesos de ese ensayo.

## Aceptación observable

| Acción y condición | Qué debe observar la persona o el revisor | Efecto que debe descartarse |
| --- | --- | --- |
| Se pierde el acuse después de aplicar un PATCH. Arrancar un proceso nuevo con la misma base y abrir Trabajo por recuperar. | Aparece el intento exacto, ligado a la copia y tarea correctas, como incierto. Verificar muestra evidencia leída y mantiene su procedencia. | Cero PATCH adicionales durante arranque, navegación, recarga o verificación. El historial conserva la única escritura original. |
| Fallar la persistencia previa al despacho con el formulario abierto. | La ficha conserva lo escrito e informa de que el intento quedó sin enviar. | Cero PATCH y cero filas nuevas de historial. |
| Cortar después de persistir y antes de despachar. Arrancar con la misma base. | Se recupera el intento exacto y se muestra el estado que el contrato del diario permita afirmar a partir de lo persistido. | Arrancar o abrir el intento no lo despacha ni lo liquida como confirmado. |
| Bloquear la sesión y abrir una copia distinta con una tarea homónima o el mismo ID. | El intento anterior no se adopta en la copia nueva. La sesión bloqueada deja de mostrar contenido protegido. | Cero borradores o parches visibles fuera de su ámbito autorizado. |
| Probar diario vacío, lectura indisponible y un registro en cuarentena. | Se distinguen los tres estados. En lectura indisponible el recuento queda desconocido. | La interfaz no interpreta un fallo como «sin pendientes» ni elimina el registro aislado. |

## Decisiones reservadas y alcance

- Mantén la identidad y autorización del contrato aceptado. Cambios en el contrato del diario, los mecanismos de sesión o la proyección pública a Continuidad requieren acuerdo con sus propietarios. La proyección pública queda fuera de este piloto.
- Aprovecha el punto de entrada previsto junto a Resultados. Deja cualquier flujo nuevo de reenvío para el alcance acordado de A4 y conserva la confirmación explícita contra la revisión vigente. El piloto se verifica por lectura.
- Antes de editar, el titular registra y reclama los archivos exactos de su unidad, incluidas las pruebas. App, registradores y Store siguen con un único propietario por archivo. Este brief no sustituye el resto de A4 ni adelanta su dependencia.

## Evidencia y evaluación del piloto

- Adjunta el comando real, el manifiesto del corte, el registro de peticiones y el recuento de filas antes y después de cada caso. Comprueba el tramo principal con teclado y la App a 1440, 390 y 320 px. Distingue pruebas de arnés del recorrido servido. Un criterio obligatorio sin ejecutar sigue pendiente de aceptación.
- En `submit`, declara en cuatro líneas los supuestos, requisitos pendientes, añadidos fuera del encargo y decisiones abiertas. Anota qué criterio evitó una interpretación errónea o un retrabajo, si se observa, y qué coste adicional tuvo usar la plantilla.
- Si hay un revisor adicional disponible, puede revisar el encargo y el cambio antes de presentar. Si no, deja constancia y continúa con las comprobaciones autorizadas y la revisión independiente habitual de Codex. La indisponibilidad del revisor adicional no detiene el trabajo.
- Después de revisar la evidencia, registra si conviene repetir la plantilla, simplificarla o dejarla como ejemplo. Una sola prueba sirve para valorar su utilidad en este tramo, sin atribuirle por sí sola una mejora general.
