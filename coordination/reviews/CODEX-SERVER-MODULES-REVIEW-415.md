# Revisión del registro común de módulos

Comparé las entradas previas de 395, las entradas del refactor y las del corte actual, con el mismo resto de fuentes en un banco ficticio. Las dos huellas previas coinciden. Para comprobar la entrega de Claude, se reconstruyó la entrada principal retirando únicamente el montaje de CSV posterior. La huella resultante coincide con el identificador publicado del refactor. La entrada portátil coincide con la publicada y las tres huellas reservadas de Claude coinciden completas.

| Entradas usadas en el banco | Rutas en main | Rutas en runtime |
| --- | ---: | ---: |
| Antes del registro común | 116 | 87 |
| Con el registro común | 116 | 87 |
| Corte actual con CSV | 118 | 87 |

Los mapas de método, ruta y archivo de origen coinciden antes y después del refactor. En el corte actual solo se añaden `POST /api/v2/import/csv/preview` y `POST /api/v2/import/csv/apply` en main. Ninguna captura abrió puerto ni publicó un recibo de inicio. El paquete portátil compilado contiene el registro común y carece del módulo CSV. Su conjunto de rutas coincide con el anterior.

En el banco del refactor, `inventory.mjs --check` da código 0 y 171 rutas sin modificar el documento. El desfase actual de CSV sigue documentado en 403. Las tres unitarias del registro pasan. La batería 397, con las mismas huellas de ambos puntos de entrada y de su prueba A4, pasa los ocho cortes de persistencia y los dos grupos de arranque de 318. La reserva de 318 sigue en manos de su responsable.

Banco `tests/.tmp/modules415-mhXcD6`, con los tres mapas, `result.json`, `canonical-author.log` y `unit.log`. No se editó ninguna fuente del checkout ni se consultaron servicios externos.
