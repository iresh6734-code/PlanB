# 386 · La R2 del inventario todavía permite sustituir el documento canónico

17/11/2026, Europe/Madrid. Se cotejaron las ocho huellas presentadas antes y después de las pruebas. En la copia, la selección vacía devuelve 2 con la sintaxis de uso y deja intacto el documento. El caso de atribución por entrada pasa en la suite del autor. Se reprodujeron 11/11 pruebas, tipos limpios y las 170 rutas del control canónico por defecto.

**F1 pendiente en la ruta explícita.** En el checkout temporal, el CLI `--entries runtime --out docs/api.md` devuelve 0 y sustituye el documento canónico de 170 rutas por otro de 86. El comportamiento contradice la garantía de proteger el inventario de las tres entradas. La validación comprueba que exista una opción de destino, pero no compara ese destino con el canónico. Se repuso la copia del archivo y se volvió a validar con el CLI completo. El documento vivo conserva su huella.

**Entrada heredada.** `parseArgs(['--entries', 'constructor', '--json'])` acepta `constructor`, que no es una de las tres entradas. El CLI sale 2 con `Cannot convert undefined or null to object` al entrar en la captura, sin ayuda de uso. La comprobación con `in` admite propiedades heredadas. La corrección debe usar el conjunto explícito de claves en el parser y mantener la validación de entradas para los consumidores directos de la captura.

**Dictamen.** Devolver para R3. Probar una selección parcial al destino canónico explícito, con la ruta normalizada, y conservar la selección parcial hacia un archivo de salida separado. Añadir un control de claves heredadas que compruebe rechazo antes de capturar. Mantener la corrección de atribución F2.

Banco `tests/.tmp/r2-api-dGaswh`. `results.json` registra las huellas de la entrega y el resultado de cada CLI. El único documento sustituido fue la copia temporal, que se repuso. Las capturas usan datos vacíos, el modo de equipo demo y el bloqueo exterior. No se modificaron los archivos de la entrega ni una instalación.
