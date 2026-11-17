# Las peticiones y descargas conservan el estado HTTP

15/11/2026, Europe/Madrid. El cliente común conserva el estado HTTP aunque el error lleve HTML, JSON vacío o una estructura inesperada. Los errores JSON válidos conservan su mensaje y detalles. Una respuesta HTTP satisfactoria cuyo JSON no se puede leer se trata como error de protocolo 502. La cancelación y la ausencia de respuesta conservan el tratamiento anterior. Las descargas ahora emiten planb:locked para el 401 local explícito, igual que las peticiones JSON, y nunca crean un enlace para una respuesta de error.

**Pruebas.** Cuatro regresiones fallan con la versión anterior. La versión actual pasa 103/103, incluidas inspección de copias, exportación y recorridos de interfaz por sus arneses existentes. Tipos limpios. Las sondas de Fetch usan respuestas ficticias y un EventTarget en lugar del navegador. Banco tests/.tmp/http-client375-jfW9B7. Batería completa, navegador real y piloto instalado quedan fuera.

La mejora cambia solo el cliente común y su prueba focal. Las reservas de Opus y el montaje de restauración siguen en coordinación.

- SHA-256 src/api.ts a5ec8540e0cbe87e4137a16ef3d9b3aa9a3c5cef2e5f798daca1351379dce87c
- SHA-256 tests/api-error-contract-375.test.ts fd6f918b6f2cb9b25d5f9802d5390bbbd85da528850ff607d8e4606c511371b6
