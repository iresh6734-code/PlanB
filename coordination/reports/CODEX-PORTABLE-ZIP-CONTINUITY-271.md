# 271 · ZIP descargado con Continuidad y restauración persistente

## Presentación vigente R2

La repetición independiente de la primera entrega encontró `Network.getResponseBody` al leer el cuerpo de una respuesta UI después de reiniciar. El consumidor puede cancelar una relectura mientras Chromium libera el recurso asociado. La prueba R2 conserva la respuesta real solicitada por la UI con su estado 200 y pin confirmado. Después exige el bloque asentado y la copia visible como observada. El JSON se valida mediante un GET independiente protegido, de la misma sesión y pin. Se mantienen el digest sin cambios y las comparaciones antes y después del reinicio.

El recorrido completo R2 pasa **1/1 sin retries ni casos omitidos, en 93,16 segundos**, con tipos focales limpios. Evidencia `tests/.tmp/portable271-VwWa6z`. El ZIP emitido pesa 48.681.337 bytes, SHA-256 `c76589f865db6e24a2e01cf48aa8bb802d281c547c999f9ac7fd66206e79ba9c`. El destino conserva instancia `f690a7b2-6ff6-4724-9502-e11f1775b13e`, PID `17144 → 17852`, con el mismo pin y revisión de bundle, 62 registros y una fila. Restauraciones 422/422/200. Productor `4468` y ambos destinos tienen recibos de cierre y PID ausente. Cero errores de página y tráfico externo. Los dos 422 esperados y las capacidades 404 mantienen su clasificación por ruta.

Un intento anterior de R2 agotó 240 segundos durante la extracción de miles de archivos. Los dos PID de ese intento se comprobaron ausentes. Otra preparación perdió el handle sin recibo final y se confirmó ausencia de procesos propios antes de reintentar. El plazo del recorrido se amplió a 480 segundos. Las expectativas de datos, sesión y evidencia se conservan. El pase final utilizó 93 segundos. El auxiliar de inicio incluido conserva el hash anterior a 272, cuya incorporación al siguiente ZIP sigue pendiente.

## Primera presentación y resultados históricos

6 de noviembre de 2026, Europe/Madrid. **El recorrido completo pasa, 1/1, sin retries, en 122,73 segundos.** Se descargó el ZIP mediante la pantalla Exportar del generador 263, con el runtime 270 ya aceptado incluido como recurso de exportación. El paquete de prueba se extrajo en una carpeta temporal nueva fuera del repositorio y se abrió con su propio `node.exe`.

## Resultado

La persona del ensayo prepara y activa Agencia Norte, modifica un teléfono ficticio, protege el acceso y revisa la captura y los cambios antes de descargar. El ZIP pesa 48.681.342 bytes, SHA-256 `7408409dfa863f3e34ae0e32df562497ba22220d9a52c5adb45ed3b49c5cedbb`. Incluye la copia cifrada y los bytes del runtime comprobado en 270. Los recursos se prepararon a partir de los activos de 263 y el runtime final de 270, con hashes. El worker se compiló desde la fuente congelada 263. Las dependencias y el auxiliar de inicio proceden de los recursos portátiles conservados de 137, cotejados archivo a archivo. Las dependencias existentes se reutilizaron con su manifiesto.

La extracción valida destinos y tipos de entrada. El Node incluido resuelve las dependencias dentro del paquete. Se usa una clave de ensayo nueva antes de abrir la base ficticia. La contraseña local del destino se crea en su interfaz.

- La contraseña de recuperación incorrecta recibe 422 y deja idéntico el digest de todas las tablas.
- Alterar el ciphertext recibe 422 y conserva el mismo digest.
- La copia original recibe 200. Sus 62 registros, captura, especificación y única fila de historial coinciden con el origen.
- Continuidad consulta la evidencia con el pin de la copia restaurada. Recibe 200 y el servidor confirma ese pin. El digest de la base permanece igual durante la lectura.
- Tras cerrar y reiniciar el Node incluido, PID `5168 → 31012`, se exige desbloquear de nuevo. La identidad de destino se conserva, `69483090-316a-4a66-ad06-56306d80e174`, y difiere de la del productor. Los registros y el historial siguen iguales.
- La evidencia repetida confirma el mismo pin y la misma revisión del bundle, idéntica a la revisada para la exportación. Se inspeccionó la captura de 390 px y se comprobó ausencia de desbordamiento.

Los tres procesos del recorrido tienen recibos de cierre y PID ausente, productor `15596` y ambos procesos destino. Hubo cero errores de página y peticiones externas. Las dos restauraciones rechazadas produjeron los errores de consola 422 esperados. Los 404 de las dos capacidades opcionales se registran con su ruta exacta, `/api/v2/connection/read-check` y `/api/v2/relay/rehearsal`. El resto de errores de consola mantiene su aserción. El recorrido hace la edición de contacto prevista y las acciones explícitas de exportar y restaurar, sin solicitudes de devolución.

## Evidencia y límites

El corte final es `tests/.tmp/portable271-ylGpKF`, con tipos focales limpios, JSON de Playwright, entradas y logs. El subdirectorio `copy-e0b25d4a-ead2-48bb-988b-e1a3824b1ddf` conserva ZIP, extracción, recibos de procesos y `observed-portable.json`. La extracción está en la carpeta temporal nueva `planb-portable137-b2d935f0-39a3-4c1c-bf2e-d1569000907f`. La prueba y ambos helpers se cotejaron con sus bytes al terminar.

Dos recorridos previos se conservan. El primero consultaba antes de terminar el desbloqueo. El segundo llegó al final y falló por los 404 de capacidades aún ausentes. La prueba final espera el cierre del diálogo de desbloqueo y registra esos dos endpoints por separado. El puntero temporal de la segunda preparación encontró un nombre existente después de guardar sus resultados. La preparación final usa un nombre propio.

El ZIP ensayado ofrece restauración y evidencia local. Sus fuentes de lectura de HubSpot y relevo siguen indisponibles. El iniciador que abre el navegador del usuario no se ejecutó. El alcance es un proceso portátil Windows con datos ficticios, restauración cifrada y reinicio limpio en este ordenador. La publicación del paquete y el montaje del resto de Operaciones quedan pendientes.
