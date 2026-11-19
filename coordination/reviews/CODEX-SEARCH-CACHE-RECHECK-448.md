# Cambio de copia con la clave de caché actualizada

Se repitió el control 446 sobre la combinación exacta del servidor `d48978d14a9fec77706f41aeb0f4a4c3d2d34e5dc3e677e77811f2ab0c6104b3` y la búsqueda compartida `20795632d5fa14d910c67fd1be44695e27dbc962393608a15d1742fcb22b7b9a`. El resto del banco procede de la candidata 444.

- Las 29 pruebas existentes pasan. El cambio de clave de caché conserva el fallo 446. La solicitud iniciada en la primera copia recibe 200 y un registro de la segunda con la identidad de la primera.
- En una segunda copia temporal, con la comprobación al terminar de leer las filas, la misma solicitud devuelve 409 y ningún resultado. La siguiente consulta devuelve el registro correcto de la copia activa. Pasan las mismas 29 pruebas.

Bancos `tests/.tmp/search446-8TnMkW` y `tests/.tmp/search446-uzl7yN`, respectivamente. Son controles de consistencia con dos conexiones y datos ficticios. No atribuyen atomicidad universal ni revisan toda la optimización. Se conservan las reservas de 207 y SEARCH-PERF-R. La comprobación de la copia temporal está pendiente de integrar con la entrega de rendimiento.

## Segundo corte con caché caliente y apertura de ficha

El servidor `4cebb7cb36d486366d35ee3fdc33c0a9be5315d7698dd8653264445d60cd5bed` conserva la huella compartida `20795632d5fa14d910c67fd1be44695e27dbc962393608a15d1742fcb22b7b9a`. La nueva revisión usa `octet_length` y deja de releer la clave de los datos después de leer los registros. La prueba repite el cambio de copia con dos conexiones contra tres bases nuevas.

| Operación al activar la segunda copia | Servidor cotejado | Banco con comprobación |
| --- | --- | --- |
| Buscar con resultados previamente cargados | 200 y un resultado de la copia anterior | 409 sin resultados |
| Buscar sin resultados previamente cargados | 200 e identidad anterior con un resultado nuevo | 409 sin resultados |
| Abrir una ficha con la revisión anterior | 200 y la ficha anterior | 409 sin ficha |

La comprobación temporal relee la clave de los datos y contrasta la identidad tras leer los registros, antes de devolver resultados o reutilizar la caché. Las consultas nuevas devuelven el registro de la copia activa en los tres casos. Las 29 pruebas anteriores pasan en ambos bancos. El control dirige el cambio de copia durante la lectura y cubre esa secuencia. Sigue por evaluar una lectura atómica y el coste de la comprobación.

Bancos `tests/.tmp/search446-7TLkWq` y `tests/.tmp/search446-DKA0Bp`. SHA-256 del servidor del segundo banco `bc1875976b24055ad9b15eb19ae76a23d104c42a5a462ed723c89266e3ed7a4e`. Las fuentes compartidas conservan sus reservas y la guarda sigue fuera de la aplicación.
