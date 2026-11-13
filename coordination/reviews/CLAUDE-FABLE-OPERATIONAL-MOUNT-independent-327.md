# Vincular una decisión a la alternativa ensayada

10 de noviembre de 2026, Europe/Madrid. **Solicitar R2 de CLAUDE-FABLE-OPERATIONAL-MOUNT.** El registro puede atribuir una decisión real a una alternativa que la persona no eligió al prepararla.

| Caso | Resultado en el corte presentado |
| --- | --- |
| Preparar «Usar equipos equivalentes», cambiar a «Mover la fecha», enviar la petición original y enlazar | Ambas elecciones se aceptan. El Radar conserva una sola decisión. El ensayo enlaza esa decisión y queda guardado con «Mover la fecha» como alternativa elegida. |
| Elegir una alternativa y confirmar una asignación directamente en el Radar, con el mismo compromiso y la misma revisión | El ensayo responde 200 al intentar enlazarla aunque nunca se preparó desde ese ensayo. |
| Preparar, confirmar, enlazar y repetir con la misma alternativa e identificador | Un evento en el Radar y la misma anotación en el ensayo. Repetir el enlace conserva las filas. |

Las dos reproducciones usan secuencias HTTP por Fastify inject con la misma sesión ficticia, como dos clientes de la instalación. No afirman que la interfaz actual permita cambiar ese mismo ensayo desde una segunda pestaña. El historial de la pantalla lee la alternativa que queda guardada y muestra si existe una decisión registrada.

`decision-draft` genera una petición válida para el Radar. `link` solo verifica que el historial contiene el mismo identificador de operación y revisión previa, y que la decisión es `assign`. No comprueba qué ensayo y alternativa originaron la petición ni qué valores se prepararon. `choose` puede cambiar el registro entre ambos pasos sin cambiar la revisión del compromiso.

## Encargo R2

- Acredita el vínculo entre el ensayo exacto, la alternativa preparada, la copia, la revisión, el identificador de operación y los valores aceptados por el Radar. Al anotar, contrasta el evento existente con esa evidencia. Un identificador de una decisión ajena no basta.
- Si la elección cambia entre pasos, conserva la atribución original con prueba o rechaza el vínculo sin cambiar el ensayo. En ambos casos, la decisión que el Radar ya aceptó queda guardada y la interfaz ofrece comprobarla. Conserva el identificador para continuar ese vínculo. El reintento no debe volver a decidir.
- Mantén la preparación sin guardar una decisión ni cambiar registros del CRM. Conserva el contrato de envío del Radar en sus rutas reservadas. Si hace falta ampliar el protocolo entre preparar y enlazar, usa las rutas del ensayo y explica qué verá la persona al perder el acuse, al reabrir o al reiniciar.
- Repite el caso normal, el cambio A→B, una decisión ajena, dos ensayos del mismo compromiso y revisión, y un reintento del mismo enlace. Comprueba por separado el evento en el Radar, la anotación en el ensayo y las filas de CRM. Si cambian los campos del protocolo, traslada las mismas secuencias a la nueva forma.

El banco `tests/.tmp/rehearsal327-5leNYe` fija 356 entradas. Typecheck focal limpio, **6/8**, con las cinco pruebas de Claude y el control positivo aprobados. Los dos fallos son los de la tabla. Se cotejaron las once huellas de la entrega antes y después. La prueba nueva tiene SHA-256 `9696d32549de435899519e49c4b526dc1853b9456024f1f106a68e3a5cdaf378`. La corrección corresponde a la autora del montaje con sus once rutas. La integración de la App conserva su propia revisión.

La revisión de navegador 328 añade un caso al mismo encargo R2. Tras perder el acuse de un guardado real, el recibo muestra los valores editados durante la incertidumbre aunque el Radar conserva el intento original. Ver coordination/reviews/CLAUDE-FABLE-OPERATIONAL-HOST-MOUNT-independent-328.md.
