# Deshacer puede revertir un guardado distinto del anunciado

## Resultado

El aviso de guardado de App asocia «Deshacer» a `{entity, id}`. El servidor verifica que el último cambio pertenezca a ese registro. Dos actualizaciones del mismo registro comparten ambos campos, aunque correspondan a guardados distintos.

Se ejecutaron cinco escenarios con la ruta real de `createBaseApp`, SQLite cifrado y bases ficticias nuevas. Los guardados se hicieron mediante el PATCH real de registros. La petición de Deshacer se conservó tal como la construye el aviso.

| Escenario | Respuesta observada | Efecto |
| --- | --- | --- |
| Deshacer el guardado vigente | 200 | Restaura el valor original y añade el cambio inverso |
| Otro registro fue guardado después | 409 `NOT_LATEST` | Conserva ambos cambios |
| Se guarda el mismo registro después de mostrar el aviso | 200, `undone:2` | El aviso del cambio 1 revierte el cambio 2 y sustituye su valor |
| Se repite la misma petición tras un primer éxito | 200 y 200 | La segunda petición revierte el cambio inverso y reaplica el valor editado |
| Una segunda conexión guarda antes de la escritura de Deshacer | 200, `undone:1` | La respuesta acredita el cambio 1 y la escritura sobrescribe el valor del cambio 2 |

En el último caso se insertó una escritura real desde otra conexión SQLite justo después del cálculo y antes de entrar en `saveRecord`. Es una prueba de concurrencia instrumentada de la frontera de escritura. Los dos escenarios anteriores se reprodujeron con peticiones sucesivas y sin instrumentar el servidor. En los tres casos se conserva el historial, pero cambia el valor activo.

## Corrección pedida

- Entregar al cliente la identidad del cambio producido por el guardado y asociarla al aviso y a la misma orden de la paleta. La identidad debe distinguir la copia o sesión si los IDs pueden reutilizarse tras restaurar.
- Comprobar esa identidad, el estado vigente del registro y la escritura del inverso bajo la misma exclusión de escritura. Una repetición de la misma acción debe devolver su resultado o rechazarla sin crear un segundo inverso. Un gesto explícito de rehacer puede seguir siendo una acción distinta.
- Añadir pruebas con actualizaciones sucesivas del mismo registro, reintento y otra conexión entre la lectura y la escritura. Conservar los controles de otro registro, alta bloqueada, validación y nuevo historial. Coordinar cualquier cambio en el almacén porque `server/store.ts` tiene su propia reserva.

## Evidencia y alcance

Se cotejaron las cuatro huellas de la entrega. `server/undo.ts`, `server/app.ts` y `tests/undo-last.test.ts` coincidieron también con la candidata congelada de 391. La suite de la autora pasó 4/4 en esa copia. El contrato enviado por el aviso se cotejó en el `App.tsx` compartido con SHA-256 `81c9ef8aa662a296827727366520b54440ccc10d7ffb712585c4ce375a431c80`. El recorte de navegador de 391 precede a ese montaje compartido. La sonda de peticiones acredita el servidor y el contrato visible en código, con el click entre dos pestañas pendiente de repetición sobre el montaje actualizado.

Banco `tests/.tmp/undo-r2-392-g8Q2LB`. `results.json` conserva las huellas y los IDs observados. Cada caso usa datos ficticios diferentes y un almacén aislado. El dictamen devuelve la entrega a Claude para corregir la atribución del guardado.
