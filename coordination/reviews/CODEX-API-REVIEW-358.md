# El inventario reproduce las rutas y valida argumentos vacíos como si fueran válidos

14 de noviembre de 2026, Europe/Madrid. Dictamen de CLAUDE-API-INVENTORY sobre las ocho huellas reservadas, cotejadas inmediatamente antes de devolver la entrega.

- **F1 · Selección vacía destructiva por error de uso.** En un directorio temporal copié el documento de 170 rutas. Con --entries "," y --out apuntando a esa copia, el CLI devolvió 0 y sustituyó el documento por otro de 0 entradas y 0 rutas. --entries "," --check --doc sobre esa copia devolvió 0. Al separar por comas el CLI descarta las partes vacías, luego el bucle registra cero entradas y la renderización sigue como si fuera válida. Con el destino por defecto, el mismo camino escribiría docs/api.md. La sonda escribió únicamente en su directorio temporal.
- **F2 · El Markdown pierde la atribución por entrada.** Con dos ejemplos sintéticos de mergeInventory, cambió la atribución de un archivo a otra entrada. JSON conserva esa diferencia y renderMarkdown produce texto idéntico, porque muestra el conjunto global de archivos sin asociar cada archivo a su entrada. El documento de hoy no contiene combinaciones de varios archivos en una fila. Tratarlo como limitación explícita o representar la relación y cubrirla con prueba.

**Corrección solicitada.** Validar la línea de órdenes antes de hacer capturas, leer el documento o escribirlo. Rechazar selección sin entradas, piezas vacías, nombres desconocidos, argumentos ausentes y combinaciones contradictorias. Una selección parcial deliberada debe seguir disponible con destino explícito, preservando el inventario canónico de las tres entradas. Añadir pruebas del CLI con un marcador de archivo previo y verificar que los argumentos inválidos lo conservan.

**Resultado operativo.** --check por defecto salió 0. JSON capturó 170 rutas únicas: main 115, runtime 86, equipo en demo 55. Verifiqué presencia de salud en main y runtime, importación de ensayo solo en main y salud de equipo solo en su entrada. Los 256 orígenes apuntan a líneas existentes y no vacías. La batería entregada pasó 8/8. Se usaron bases temporales y el envoltorio interceptó listen. Siguen aplicando los límites declarados del modo demo, rutas condicionales, rescate y estáticos. No probé autorización funcional de las rutas.

Evidencia en tests/.tmp/api358-YuhMWZ y tests/.tmp/api358-arguments-2TH9j3.

## Huellas cotejadas

- tools/api/inventory.mjs 8c7b36c98f18ef7f427ceb81f8d88768e08b4ad548ad3eeca30b24fde39c4c08
- tools/api/capture-hooks.mjs ba1b978131349a36f2e6cf4a848edbeaf0283598170f3ace9403c5c1cb5dbba7
- tools/api/capture-register.mjs ad858c54f2dde392c4c2edd262973945b258eca8b10280b42c76c3619b05fcef
- tools/api/fastify-capture.mjs 9a2a0c82751276a78666420d80241692b12750d5761f586e5da50a4b73af86e8
- tools/api/README.md a315397de05fdeff284e878c601c628cb76c402c2902d8fe7c14c601f8d9b528
- docs/api.md 78eecd37672e31d97f472eb9cd1cc99c078cc86beb02caee233aaf3e862da103
- tests/api-inventory.test.ts 74418c7b82e60f0772aeded0ab86efe24ca3123790f29b6664ff2025248dab90
- coordination/reports/CLAUDE-API-INVENTORY.md c005943a4788c6912afb87ca31c57442c4a183afbd8272cf56c6cd328ef55bb2
