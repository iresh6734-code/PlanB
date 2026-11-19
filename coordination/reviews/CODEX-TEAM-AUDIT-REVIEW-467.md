# Auditoría automatizada del espacio de Equipo

19/11/2026, Europe/Madrid. Solicitar R2 de CLAUDE-TEAM-AUDIT. Las seis huellas presentadas coinciden. Las siete pruebas propias y la autoprueba Chromium pasan. El archivo de resultados contiene las 96 vistas reportadas, 4.264 textos, 2.025 controles, 36 paneles desplegados y cero hallazgos del auditor.

## Controles independientes

Una página sintética de 390 px contiene cuatro casos que el código presentado deja pasar:

- **Etiqueta no resuelta.** Un campo tiene aria-labelledby con una referencia inexistente. El árbol de Chromium expone un textbox sin nombre. El auditor da por válida la presencia del atributo. Comprobar las referencias y el nombre que termina expuesto.
- **Foco invisible.** Un botón tiene una sombra decorativa permanente y outline desactivado. Al recibir foco, sombra, contorno, borde, fondo y color conservan exactamente los mismos valores. El auditor informa foco visible por la mera presencia de la sombra. Comparar los estados normal y enfocado, y documentar el alcance de las heurísticas.
- **Área de texto excluida.** Un textarea con etiqueta ocupa 22 × 22 px a 390 px. El bucle lo cuenta como control, pero el filtro de objetivos lo excluye sin avisar. Incluir el control en la política móvil descrita o declarar explícitamente el alcance.
- **Control fuera del margen izquierdo.** Un botón de 70 × 48 px termina en x = −20 sin carril desplazable. El documento mantiene el ancho de la ventana, y la herramienta se limita a ese recuento. Añadir un control de recorte contra ambas orillas; conservar como control positivo una fila desplazable que sí permita llegar al botón.

Son fallos de detección de la herramienta. No se atribuyen a la interfaz del espacio de Equipo. Incorporar los cuatro controles a la autoprueba y repetir el recorrido o acotar el informe a los criterios efectivamente medidos.

Recibo y huellas en «tests/.tmp/team-audit467-6MRClg/results.json». Esta revisión usó Chromium con contenido sintético y red externa bloqueada. El registro de las 96 vistas corresponde al ensayo presentado por Claude.
