# La restauración puede cambiar la copia activa pese a devolver un error

15/11/2026, Europe/Madrid. Tres fallos verificados mediante POST /api/v2/restore, Fastify.inject y SQLite con copias ficticias.

| Caso | HTTP | Estado comprobado |
| --- | --- | --- |
| La copia es válida, pero el destino está ligado a otro portal | 409 | La copia activa se conserva y lastRestoreArchive anterior se sobrescribe |
| SQLite rechaza insertar la captura en el historial | 500 | La copia activa, su contacto y sus cambios ya son los nuevos, mientras el historial y recoveryCopy conservan los valores anteriores |
| SQLite rechaza guardar el recibo de restauración | 500 | La copia nueva y su captura quedan guardadas, con el recibo anterior |
| Restauración sin fallo | 200 | Copia, historial, archivo anterior y recibo coherentes |

La ruta escribe lastRestoreArchive antes de pasar por las comprobaciones del destino real. Store.restoreBundle confirma las tablas activas antes de añadir la captura. La ruta escribe recoveryCopy en un tercer paso. Los dos fallos de persistencia se forzaron con triggers TEMP en la base destino. El preflight de la copia siguió ejecutándose en su Store independiente.

**Prototipo aislado.** Una transacción reúne los controles de destino, la lectura del archivo anterior y la escritura de copia, historial, archivo y recibo. El cálculo de espacio al añadir la captura incluye el archivo y el recibo. El oráculo exige que los tres rechazos conserven la revisión y los metadatos anteriores. Con la fuente vigente falla en tres casos y pasa el control. Con el prototipo pasan los cuatro y la batería focal de 82/82, incluidas comprobaciones de QA052. Tipos focales limpios. El primer ensayo focal del prototipo omitió tests/.tmp en su propia copia y la CLI de QA052 falló por ENOENT. Se creó el directorio y se repitió la batería. La comprobación de symlink de archivo sigue sin verificar porque el equipo no concede capacidad para crearlo.

**Coordinación.** El prototipo y las sondas quedan en tests/.tmp/restore374-0JDgL8. server/store.ts conserva la reserva de Opus y server/v2.ts la entrega 373. El cambio de producto requiere coordinar ambos archivos en el tablón. Integrar tras revisar la caché, con comprobación de restauración, límite de almacenamiento y comparación del ZIP vigente. La auditoría no modifica el producto ni comprueba instalaciones o datos reales.

## Huellas de las fuentes contrastadas

- server/store.ts e233cdd52d2a7af6c115985e10530b105a3cf82ee3ae6d36d6156b8d718ca1ad
- server/v2.ts fcad1e697279e85881ef209994ef77887e2e8f4a8b6c55b1c36f63843416237e
- server/recovery-preflight.ts 5cbcd229a9b7e5ba08ac7b785542819e937412f9ae9def176d0f5b6776636a3b
