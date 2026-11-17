# Inventario de API R3 con dependencias explícitas

Las ocho huellas de la entrega coinciden en el checkout. Las siete fuentes fuera de coordinación coinciden también en el banco. La prueba focal dio **12/12**, incluidas la captura de las tres entradas, la salida 2 para selecciones inválidas, el rechazo de claves heredadas y la protección del inventario canónico. Se copiaron los archivos del corte 397 y el paquete local de tsx a una carpeta nueva. Las pruebas no tocaron el documento del checkout.

La comprobación canónica contra ese mismo corte da **1** y detecta dos rutas nuevas sin documentar:

- `POST /api/v2/import/csv/preview`
- `POST /api/v2/import/csv/apply`

Las dos proceden del montaje de CSV en `server/main.ts`. CSV figura como trabajo activo de Claude. La herramienta detectó el desfase que debía detectar. El documento permanece en revisión hasta coordinar su regeneración con la entrega de CSV y repetir `--check` sobre el mismo corte. No se regeneró ningún documento ni se editaron reservas de Claude.

Banco `tests/.tmp/inventory402-0c6a52e69cc3464e980693831e3c96f1`. Evidencias `suite.log`, `inventory-check.log` y `result.json`. Los fallos iniciales de esta suite en el banco global no se tomaron como fallos de producto: ese banco no daba al CLI la ubicación explícita del cargador de tsx que espera.
