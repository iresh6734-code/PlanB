# El gestor conserva el acuse de A4 sin un registro completo

10 de noviembre de 2026, Europe/Madrid. Unidad `CODEX-A4-COMPACT-ACK-323`.

Una respuesta válida de A4 puede conservar el acuse de una tarea y omitir el registro por tamaño o por retención. El gestor admite ahora `StrategyOutcome.kind = 'compact-ack'` con un `CompactTaskSaveReceipt`. Asienta el mismo intento como `confirmed` y conserva procedencia `server-ack`, metadatos disponibles, motivo de omisión y condición de replay. `record`, `revised` y evidencia de lectura siguen vacíos. La revisión resultante del acuse se conserva dentro del recibo, separada de la revisión utilizable de una lectura de ficha.

La proyección distingue el no-op, el acuse recuperado y la confirmación nueva. En los tres casos invita a reabrir la tarea para leer el registro actual. La confirmación no habilita comprobar un resultado incierto, aceptar una lectura ni reenviar. `onConfirmed` recibe `null` junto con la operación cuando hay acuse compacto. El consumidor actual del host relee estado y cola sin usar ese parámetro. Si la recarga falla, el acuse permanece y el reintento solo vuelve a invocar el consumidor.

**Verificación.** En `tests/.tmp/compact323-VgMUUH`, seis archivos de pruebas ejecutaron **103/103** casos, incluidos los 100 del corte UUID y tres nuevos con estrategia inyectada. Typecheck focal limpio y cero omitidos. Las pruebas nuevas cubren identidad y ausencia de registro, rechazo de acciones inadecuadas, fallo y recuperación de la recarga, no-op y replay sin metadatos. El manifiesto fija las cinco fuentes de esta unidad y las dependencias de los cortes 314 y 319. Las pruebas existentes que consumen el registro comprueban que sigue presente en sus estrategias. Se renovaron exclusivamente las dos huellas del gestor y el contrato que cambiaron. La primera pasada falló por una aserción de texto que buscaba «no se añadió» en la frase «ni se añadió». La pasada final corrige ese patrón.

**Traspaso.** La estrategia de Claude sigue en R2 con sus reservas. Una unidad posterior debe mapear su acuse validado a `compact-ack`, leer la ficha actual al reabrir y presentar el acuse aun cuando falte el registro. Al montar, comprueba que la ficha abierta muestra la confirmación y retira la revisión antigua de sus opciones de guardado, que Hoy recarga solo por lectura y que el replay no aparece como trabajo nuevo. Ese recorrido de navegador, la persistencia A4 y la candidata instalada requieren evidencia propia. 323 ejercita el gestor en memoria y conserva las estrategias vigentes.

## R2 · Revalidación con la huella de la copia · 11/11/2026

Se actualizaron las dos guardias de SHA-256 después de repetir las pruebas con la corrección 334. Los dos archivos de producto del gestor y su prueba de acuse compacto conservan sus huellas R1. El banco pin334-rehash-Jk1KRZ pasó 131/131 y tipos limpios, incluidas las guardias. El navegador aislado de 329 pasó 47/47. Ver CODEX-A4-TASK-CAPTURE-PIN-334.md para el alcance de la validación y el montaje pendiente.

## R3 · Separar el plazo de lectura del de escritura en la prueba · 17/11/2026

La batería 397 observó `not_sent` donde la prueba esperaba `uncertain`. El mismo caso pasó aislado. Al retrasar artificialmente la lectura previa 120 ms, el plazo anterior de 40 ms de lectura venció y se reprodujo exactamente la diferencia. La prueba corregida conserva el plazo normal en la comprobación previa, limita a 40 ms el PATCH que se retiene y aplica un plazo de lectura breve solo a la verificación que deliberadamente nunca responde. Cuenta las dos escrituras que llegan al transporte de ensayo y comprueba que ninguna llega al servidor ni se vuelve a enviar.

El mismo retraso controlado pasó con la separación de plazos. La versión final pasó **65/65** sobre gestor, ficha y acuse compacto, y la comprobación de tipos pasó. No cambió el cliente, el gestor, la API ni un plazo de producción. No se repitió la batería global después de esta corrección. Banco `tests/.tmp/timeout413-8e88212f63204e48a7bf1ca0c8d4a177`, con los registros del fallo provocado, el control corregido y las pruebas finales.
