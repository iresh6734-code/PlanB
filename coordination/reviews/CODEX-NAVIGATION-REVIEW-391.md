# Navegación de cinco lugares y candidata aislada

## Candidata

El comando `scripts/prepare-release-candidate.mjs --prepare` terminó con código 0 para `candidate-ab3b876b-1ee6-4429-aa75-10474e297c38`. Registró 845 fuentes, 51 artefactos, tipos limpios, frontend compilado, los seis bundles Node, 10 recursos públicos verificados y 163/163 pruebas Node del empaquetador. El manifiesto mantiene 138 bloqueos, incluidas las reservas por revisar y las comprobaciones visuales y E2E pendientes. En el cotejo posterior a la compilación, cuatro rutas vivas diferían de sus copias congeladas: `App.tsx`, `ReferenceSelect.tsx`, `faro.css` y `independent-interface-contexts.test.ts`. El candidato conserva sus fuentes y artefactos originales.

## Controles de navegación

Las tres huellas de `CLAUDE-UI-NAV-LAB` coincidieron antes y después de la prueba. Las dos fuentes presentadas coinciden además con la candidata y las seis pruebas de su modelo pasaron en la copia congelada. El informe de la autora se verifica por su huella en el tablón. Las siete rutas de montaje compartidas se cotejaron por separado contra la captura.

| Contexto en Chromium | Resultado |
| --- | --- |
| Generador de ensayo, 1366 px | Los cinco lugares previstos. La paleta ofrece las dos opciones del Laboratorio. Clientes abre los registros y Continuidad abre Exportar. Cero píxeles de desbordamiento horizontal. |
| Generador de ensayo, 390 px | Anclajes Inicio, Hoy, Clientes, Continuidad y Más. El candado accesible en la barra superior está visible. Cero píxeles de desbordamiento horizontal. |
| Datos sintéticos clasificados como producción, 1366 px | El apartado Radar recordado vuelve a Inicio. El menú y la portada carecen de entrada al Laboratorio. G R y G F mantienen Inicio. La paleta abre, con cero opciones de Radar y Comprobar una fecha. Cero solicitudes a las rutas del Laboratorio instrumentadas. |
| Copia portátil vacía de esta candidata y de 385 | El control «Restaurar archivo» es visible. El pasaporte no ofrece «Preparar o activar una copia local» en las dos versiones. |

El modelo devuelve `null` al preguntar por el fallback portátil de `prepare`. En el recorrido comprobado, `storedPage` excluye una preparación guardada y la portada de Continuidad lleva a restaurar. Se conserva como observación de la interfaz del modelo, sin defecto de uso acreditado en ese caso.

## E2E y reservas

El selector exacto «Trabajar» ya no encuentra un botón en el montaje congelado. Se verificó el destino actual, «Clientes», que sí abre el espacio de registros. `tests/e2e/portable-lifecycle.spec.ts` aún usa «Trabajar» en dos pasos. Adaptar los E2E a los nuevos rótulos y al despliegue de Ajustes y Continuidad antes de atribuirles un resultado global.

El dictamen del modelo es favorable con el alcance probado. La entrega combinada queda en revisión hasta completar el cotejo del montaje compartido y de los recorridos afectados. `CLAUDE-UI-NAV-LAB-HOST` sigue sin reserva activa. La reconciliación detectó cambios posteriores a la presentación en TopBar, ReferenceSelect y la prueba de contextos de interfaz. App y HomeOverview tienen reservas activas propias. Las huellas del código congelado no se sustituyen por las del árbol vivo.

## Evidencia y límites

Banco de navegador `planb-nav391-8052Ad` en la carpeta temporal local, con `results.json` y las capturas de los cinco controles. Se usó el Chromium local con Playwright porque el complemento Browser no estaba disponible. Instancias de loopback, bases nuevas y tráfico exterior bloqueado. Se verificó el recibo de arranque de cada proceso y se observó su cierre. Los datos de la prueba de clasificación proceden de una fixture local y carecen de conexión a HubSpot.

Se conserva un primer intento que cargó el nombre de semilla de la copia portátil en el generador. La repetición usa `demo.seed.json` para el generador y verifica por API que la copia está activa y tiene la clasificación esperada. Se repitió también el control de la paleta con el rol real `option` y un control positivo de dos entradas de laboratorio en ensayo. El informe usa los resultados de esta última repetición.
