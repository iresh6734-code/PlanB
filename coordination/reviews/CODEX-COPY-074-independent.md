# Revisión independiente · inspector de copias 074

4/11/2026, Europe/Madrid. Dictamen: **aceptar 074 en el alcance revisado**. Los diez archivos presentados coincidían con sus hashes al iniciar y al decidir. No se modificaron los archivos del autor.

## Revisión

Se leyeron los contratos de referencia y resultado, las rutas de inspección, el cliente y su montaje. La ruta valida base64 canónico/UTF-8/tamaño, liga la operación a una revisión explícita y compara mediante almacenes temporales en memoria. El resultado está ligado a los bytes, hash y referencia revisados; no restaura la instalación ni acredita custodia. El cliente descarta resultados al cambiar contexto, cerrar o cancelar y no reenvía automáticamente un 409. El principal registra la ruta y contiene la guarda de semilla cuya causalidad se contrastó por separado en 163. No se acepta 090 por aceptar este main.

## Comprobaciones propias

- **25/25 Node**: repetición de las 12 pruebas API y 13 del simulador de hooks del autor, sobre el checkout. El simulador de hooks no es DOM. Log `tests/.tmp/review164-node.log`.
- **8/8 DOM Chromium**: repetición de los ocho casos del autor con generador principal compilado y frontend Vite, contraseña ficticia, clave test nueva, SQLite persistente en una carpeta propia y red externa bloqueada. Incluyen archivo cifrado genuino, cobertura ABA, contraseña incorrecta/reintento/tamper, 409, cierre con respuesta pendiente, hash falso, selección temprana y teclado/geometría a 1440/390/320 px. Los casos comprueban que registros, historial y custodia no cambien al inspeccionar. No son ocho pruebas nuevas escritas por este revisor.
- Se usó la proyección congelada aceptada de 158 para evitar los archivos de la ficha que Claude está editando. Las siete fuentes de producto de 074 se cotejaron con los hashes presentados; el spec se tomó del checkout cotejado. La copia del spec cambia únicamente el origen fijo 4410 por el puerto efímero propio; la sustitución inversa reproduce el original. No se abrió 4410 ni las previews existentes.
- Evidencia `tests/.tmp/copy-review164-5c485fca-0fc7-4943-9538-7ea6b1a0073d`: informe JSON de navegador, capturas y log/cierre del servidor. PID propio 27592 observado ausente después de cerrar. Se inspeccionó visualmente la captura de 320 px, legible y sin desbordamiento visible; las otras dos quedan comprobadas por las aserciones de geometría, no por inspección visual propia.

El primer intento del runner privado terminó antes de compilar o abrir servidor por exigir un test Node que la proyección no contenía. Se corrigió el inventario del runner para cotejar las fuentes de producto en la proyección y los tests presentados en el checkout. Ese fallo es del arnés de revisión y no se cuenta como una prueba funcional.

No se repitieron aquí las suites amplias históricas de empaquetado o sus mutantes ni se probó una distribución instalada. Los resultados históricos de 329/357 fuentes y bundles quedan atribuidos al autor; esta revisión no certifica esos paquetes completos. Sin HubSpot, datos reales, lector de pantalla, otros navegadores o otro equipo. Aceptar la entrega no instala el inspector o las revisiones160 en una preview actual.
