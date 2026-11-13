# 283 · Resumen autorizado del cuaderno local

7/11/2026, Europe/Madrid. Autor Codex de este chat. Presentación para revisión independiente; no hay autoaceptación ni montaje en la demo.

Se implementó el adaptador GET del contrato 255 sobre clasificación de 208 R5 y almacenamiento Store. Devuelve exclusivamente procedencia, ámbito, cobertura y recuentos. Distingue copia sin ámbito, cobertura ausente, vacío observado, trabajo pendiente, cuarentena e indisponibilidad. La cobertura es una declaración obligatoria del anfitrión del escritor: no se deduce del número de filas ni de que el módulo exista. Antes de A4 debe ser falsa.

El pin de captura coincide con el de la evidencia de Continuidad. La clasificación interna conserva generación e instalación. La sesión inicial y el origen se revalidan después de leer y preparar la respuesta. Los contadores de cambios de SQLite detectan A→B→A y escrituras desde otra conexión. No hay envío, poda, resolución ni escritura del diario desde esta API.

## Verificación

`tests/.tmp/summary283-orjGOY`: **19/19 Node**, tipos focales limpios. El recibo registra las huellas de todas las fuentes resueltas por el programa TypeScript y las coteja al terminar. Entorno mínimo, red externa bloqueada, datos ficticios nuevos y carpetas de prueba propias. Fastify y Store son reales; se usa inyección HTTP, sin navegador o puerto de app.

Los casos cubren registro con seguridad, ámbito vacío, falta de cobertura, cero observado, compatibilidad del pin con el servicio de evidencia, mezcla de fases y contextos, lista blanca de salida, bytes ilegibles conservados, fallos de almacenamiento/cobertura, quota alterada y duplicados, sesión ausente, bloqueo y sesión nueva durante lectura, vencimiento al preparar cuerpo final, activación de contraseña durante lectura, generación cambiada, A→B→A, otra conexión SQLite y reinicio de archivo. Los digest de tablas comprueban consultas sin modificaciones. En disco sobreviven borrador e incierto; el archivo no contiene el texto canario ficticio en claro.

## Sensibilidad

Copias efímeras en `tests/.tmp/summary283-causal-kOTltt`, sin modificar el checkout:

| Mutación | Resultado de la sonda seleccionada |
| --- | --- |
| Forzar lectura cubierta pese a `covers=false` | Falla 1/1. |
| Quitar los contadores SQLite de la huella | Fallan 2/2: A→B→A y escritura de otra conexión. |
| Retirar las dos comprobaciones finales de autorización | Falla 1/1 al esperar 401 y recibir datos. |

Las mismas pruebas forman parte del banco original 19/19. Al terminar cada mutación se restituyó el módulo y se cotejaron todas las huellas de la proyección. Los recibos y logs guardan los fallos concretos.

## Límites

No se registra en main o runtime ni se integra la tarjeta 255. La app 4601 conserva su composición anterior. No existe todavía el escritor A4 en esta entrega; declarar cobertura verdadera sin él sería un montaje incorrecto. El resumen no recupera texto ni confirma que un PATCH se aplicara.

El rechazo por cambios de SQLite puede ser conservador ante escrituras no relacionadas. No se bloquean escritores externos ni se garantiza una instantánea del sistema después de la última comprobación. El consumidor 255 ya trata 409/503 como fallo de lectura, sin fabricar cifras.

La cobertura verdadera de los fixtures solo verifica el lector. El montaje A4 debe aportar evidencia de cobertura por la clave completa en el soporte del cuaderno, conservando su significado al reiniciar o desmontar Hoy. No está probada esa política por instalar un componente o devolver `true` en una prueba. Esta aclaración documental se añadió tras la lectura del otro coordinador; código y pruebas conservaron sus hashes probados.

No se repitieron las suites globales ni el portátil: no se modificó ninguno de sus puntos de entrada. No hubo proveedores, datos reales, instalación corporativa, cambios de dependencias, root build/dist, commit ni despliegue. El contrato de integración y sus siguientes pasos están en `coordination/plans/WORK-SUMMARY-283-CONTRACT.md`. Los hashes finales de los cuatro archivos los registra `submit` en el tablón.
