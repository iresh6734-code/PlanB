# CLAUDE-CSV-IMPORT · Importar registros desde CSV

**Autor:** Claude (Opus 5.5) · **Fecha:** 17/11/2026 · **Origen:** mejora C9 del informe, por orden del usuario. `server/main.ts` y `src/App.tsx` son compartidos y se editaron con su autorización.

## Qué hace

Desde la paleta (Ctrl J), la orden **«Importar desde CSV…»** (grupo Crear) abre una ventana con tres pasos:

1. **Elegir.** Se escoge el tipo de registro (por defecto, el de la lista abierta) y un CSV de hasta 1 MB o 1.000 filas.
2. **Revisar.** El servidor devuelve una vista previa sin escribir nada:
   - propone un campo para cada columna por nombre o clave, sin distinguir mayúsculas ni tildes, y la persona puede cambiarlo o elegir «No importar»;
   - cuenta las filas listas y las que tienen errores;
   - muestra las 50 primeras filas con el texto tal como viene en el archivo (nunca un ID interno) y el motivo de cada error.
3. **Importar.** Da de alta solo las filas válidas. Cada alta pasa por `saveRecord`, así que aplica las mismas reglas que la ficha y deja un cambio local que se ve en Cambios. Al terminar aparece un resumen y un aviso, y la lista se refresca.

Lo que acepta el archivo:

- separador `;`, `,` o tabulador, detectado en la cabecera;
- comillas, comillas dobladas, saltos de línea dentro de comillas, CRLF y BOM (lo que exporta Excel en español);
- números con coma decimal («1.234,56»);
- fechas DD/MM/AAAA, rechazando las que no existen;
- sí/no;
- opciones por su etiqueta;
- relaciones por el nombre del registro (por ejemplo, la empresa) o por su ID.

Si hay homónimos, lo indica y pide usar el ID.

Rechaza:

- correos repetidos, tanto contra la copia como dentro del propio archivo;
- campos obligatorios vacíos;
- relaciones que no existen;
- valores que no se pueden convertir.

### Protección contra importar a ciegas

`apply` exige la **marca de la vista previa**. Es un sha256 de cuatro cosas: el tipo, el archivo, el mapeo final y el estado de la copia (último cambio y número de registros). Si la copia cambia entre la vista previa y la importación, o si llega otro archivo u otro mapeo, el servidor responde 409 `STALE_PREVIEW` sin escribir nada. En ese caso la ventana vuelve a pedir la vista previa y lo explica. También responde 413 si la importación superaría `MAX_RECORDS`.

## Archivos

| Archivo | Huella | Notas |
| --- | --- | --- |
| `shared/csv-import.ts` | `e4538c3b5e0c…` | nuevo; lógica pura (parseCsv, suggestMapping, convertValue, planImport) |
| `server/csv-import.ts` | `00707f00cb5b…` | nuevo; `POST /api/v2/import/csv/preview` y `/apply` |
| `src/CsvImport.tsx` | `e9c2ac77a01e…` | nuevo; ventana |
| `tests/csv-import.test.ts` | `7272212f0348…` | nuevo; 5 pruebas de lógica |
| `tests/csv-import-api.test.ts` | `7542b54f8503…` | nuevo; 3 pruebas de rutas sobre almacén cifrado con datos ficticios |
| `server/main.ts` | antes `d2111047…`, después `23c8e19724c5…` | compartido (318); una importación y una llamada `registerCsvImport(app, store)` justo después de `mountSharedModules` |
| `src/App.tsx` | después `7fb6968db4c2…` | compartido; estado de ventana `'csv'`, orden de paleta y montaje de la ventana |

Las rutas se registran solo en `main.ts`, no en `runtime.ts`: la orden tampoco aparece en el espacio de equipo (`!state.runtime`). No se tocaron `modules.ts` ni `app.ts` porque están congelados en entregas mías en revisión (CLAUDE-SERVER-MODULES y CLAUDE-UNDO-LAST). Cuando se acepten, se puede mover la ruta a `SHARED_MODULES` si se quiere también en equipo.

## Verificación

- **Pruebas.** `tests/csv-import.test.ts` 5/5 y `tests/csv-import-api.test.ts` 3/3. Cubren:
  - que la vista previa no escribe;
  - que `apply` crea solo las filas válidas, con un cambio por alta y la empresa resuelta por nombre;
  - que una marca vieja, otro archivo u otro mapeo dan 409 sin escritura;
  - los errores 413 (más de 1.000 filas) y 422 (sin cabecera, tipo desconocido o marca mal formada);
  - que un campo inventado en el mapeo se ignora.
- **`tsc`:** 0.
- **Ensayo aislado** (API 4421 con carpeta propia y red exterior bloqueada, UI 5199, datos de prueba):
  - Paleta → «Importar desde CSV…» → CSV con 4 filas y una columna sobrante. Resultado:
    - propone Nombre, Apellidos, Correo y Empresa, y deja «Color» en «No importar»;
    - cuenta 2 filas listas y 2 con errores: «Nombre: Completa este campo» y «Empresa: No existe en la copia: Empresa Fantasma».
  - «Importar 2 registros» → aviso. Clientes pasa de 24 a 26 y los cambios locales de 4 a 6.
  - Una segunda vista previa con la misma persona marca «Correo: Ya existe en la copia o en otra fila».
- **Dos defectos encontrados en el recorrido y corregidos antes de entregar:**
  - la tabla enseñaba el ID interno `company-1`; ahora la vista previa devuelve `cells` con el texto original;
  - la columna Resultado quedaba alineada a la derecha y cortada por el estilo genérico `td:last-child`.

## Pendiente

- **`docs/api.md`.** Hay que regenerarlo con `node tools/api/inventory.mjs` (+2 rutas). Mientras CLAUDE-API-INVENTORY siga en revisión, `--check` marcará la diferencia. Se deja para cuando se acepte, para no tocar una entrega congelada.
- **Fuera de alcance:**
  - actualizar registros existentes (solo da de alta);
  - deshacer una importación entera de una vez (cada alta se puede revisar en Cambios);
  - leer `.xlsx`, que exigiría una dependencia, y el usuario la descartó.
- **Observado, pero no es de este encargo.** Al abrir la paleta con Ctrl J, el foco no queda en su buscador en el ensayo: hay que hacer clic antes de escribir. Conviene revisarlo en CommandPalette.

## R2 · Revisiones 416 y 418 de Codex

**Hallazgo (correcto).** La marca solo incluía el archivo, el mapeo, el último cambio y el número de registros. Si se restauraba otra copia con el mismo número de registros e historial vacío, la marca no cambiaba. La aplicación respondía 200 y creaba el contacto asociado a otra empresa (`company-2`) de la que la persona había visto (`company-1`).

**Corrección** (`server/csv-import.ts`, `previewToken`). La marca liga ahora también:

- **la identidad de la copia**: id y fecha de la captura, y sesión;
- **el resultado revisado**: los valores y errores de cada fila, con las relaciones ya resueltas a su ID.

Cualquier restauración que cambie la copia, o que haga que el mismo nombre apunte a otro registro, responde 409 `STALE_PREVIEW` antes de crear registros o historial.

**Regresión** (`tests/csv-import-api.test.ts`). Una vista previa en A asocia «Estudio Arce» a `company-1`. Después se restaura con `restoreBundle` una copia B:

- con el mismo número de registros, otra captura y otra sesión;
- sin historial;
- donde «Estudio Arce» es `company-2`.

Aplicar la marca de A responde 409 y no cambian ni los contactos ni el historial. Una vista previa nueva sobre B muestra `company-2` e importa con 200. Se mantienen los controles anteriores: misma copia estable da 200 y edición local da 409.

**La prueba reproduce el fallo.** Con la versión anterior de `server/csv-import.ts` (la del commit `6cdff8b`), la regresión falla: 1 fallo. Con la corrección, `csv-import-api` da 4/4, `csv-import` 5/5 y `tsc` 0.

**Huellas R2:** `server/csv-import.ts` `733a4fdb600b…` · `tests/csv-import-api.test.ts` `b7e187eec33b…`. El resto, sin cambios.

## R3 · Revisión 425 de Codex

**Hallazgo (correcto).** Quedaban dos casos con una restauración válida que conserva el ID de captura, la fecha, la sesión, el número de registros y el historial, y en los que el resultado revisado sale igual:

1. cambia el contenido de otro registro;
2. cambia la cuenta de origen en una carpeta sin vinculación.

En los dos casos la marca no cambiaba y la importación respondía 200.

**Corrección** (`server/csv-import.ts`). La marca incluye también la **época de la copia**: el `copyEpoch` que `restoreBundle` renueva al completar cada restauración (CLAUDE-UNDO-LAST R3). Esa época se **lee** con `store.get('copyEpoch', '')`, no con `copyEpoch()`, que la crearía. Así la vista previa sigue siendo de solo lectura incluso en una instalación anterior que aún no la tiene. Se mantiene la ligadura al resultado revisado.

**Pruebas** (`tests/csv-import-api.test.ts`), dos nuevas:

- **Restaurar la misma copia con otro contenido.** Se restaura con la misma captura, fecha y sesión, el mismo conteo y sin historial; solo cambia el teléfono de otro contacto, en los registros y en la captura, para que el paquete sea válido. La marca anterior da 409 sin crear registro ni historial, y una revisión nueva importa con 200. El caso de la cuenta de origen queda cubierto por la misma época, porque toda restauración completada la renueva.
- **Sin época.** En una instalación sin `copyEpoch`, la vista previa responde 200 y la época sigue sin existir.

Resultados:

- `csv-import-api` 6/6 y `csv-import` 5/5, **11/11**.
- **Reproducción:** sin la época en la marca, la nueva regresión falla.

**Huellas R3:** `server/csv-import.ts` `1750aadd2185…` · `tests/csv-import-api.test.ts` `b1edf21e20bb…`.

## R4 · Revisión 431 de Codex

**Hallazgo (correcto).** Un CSV con una cita válida (09:30) y otra imposible (99:00) devolvía **500** en la vista previa. El conversor llamaba a `toISOString` sobre una fecha inválida (`RangeError: Invalid time value`) y se perdía el diagnóstico por fila.

**Corrección** (`shared/csv-import.ts`, `convertValue` para `datetime`):

- **Formatos aceptados:** `DD/MM/AAAA`, `DD/MM/AAAA HH:MM` y `AAAA-MM-DD[ T]HH:MM[:SS]`.
- **Rango válido:** de 00:00 a 23:59, con segundos de 0 a 59.
- **Valores rechazados en su fila**, sin normalizarlos ni tumbar la vista previa: una fecha imposible (31/02), una hora imposible (24:00, 9:60, 99:00) o un formato desconocido («9h30», «mañana»). El mensaje es, por ejemplo, «Hora imposible: 99:00 (de 00:00 a 23:59)».

**Pruebas:**

- `csv-import` 5/5. Comprueba los formatos aceptados y los seis valores rechazados.
- `csv-import-api` 7/7. Añade el archivo mixto: la vista previa responde 200 con 1 fila válida y 1 con error explicado, y aplicar da de alta solo la válida. Se mantienen las regresiones de época R2 y R3.
- **12/12** en total.

**Reproducción:** con la conversión anterior, el archivo mixto da `500 RangeError: Invalid time value` (2 fallos).

**Huellas R4:**

| Archivo | Huella |
| --- | --- |
| `shared/csv-import.ts` | `326701e92517…` |
| `tests/csv-import.test.ts` | `b506da9e51f6…` |
| `tests/csv-import-api.test.ts` | `3da64e97f288…` |

## R5 · Revisión 452 de Codex

**Hallazgo (correcto).** Quedaba una carrera. Si otra conexión restauraba una copia en el hueco entre comprobar la marca y guardar la primera alta, la respuesta era 200 y el contacto quedaba enlazado a `company-1`, que en la copia nueva es otra empresa.

**Corrección** (`server/csv-import.ts`). Cada `saveRecord` de la importación lleva una guarda que corre **dentro de su transacción**. Comprueba dos cosas:

- que la copia es la misma: época (`copyEpoch`), captura y sesión;
- que nadie más ha escrito desde la última alta propia, siguiendo el último cambio con `onChange`.

Qué pasa si algo cambió:

- **Antes de la primera alta:** el mismo 409 `STALE_PREVIEW` que una marca vieja, sin escribir nada.
- **A mitad:** se detiene con 409, que dice cuántas altas se hicieron (`details.created` e `ids`) para revisarlas en Cambios.

La época se crea, si aún no existe, antes de comparar. Si no, la primera alta la crearía y parecería otra copia; lo destapó la prueba de importación normal.

**Pruebas** (`csv-import-api` 9/9 y `csv-import` 5/5, **14/14**):

- **Restauración en el hueco exacto.** Se instrumenta `saveRecord` para restaurar una copia válida donde «Estudio Arce» es `company-2` justo antes de la transacción. Resultado: 409, ningún contacto nuevo y el historial de la copia restaurada vacío.
- **Otra escritura entre la primera y la segunda alta.** Resultado: 409 con `created: 1`.
- Se mantienen las regresiones de época, fecha y hora, archivo mixto y límites.

**Reproducción:** con R4 sin la guarda, las dos pruebas nuevas fallan.

**Huellas R5:** `server/csv-import.ts` `cc4878197ec3…` · `tests/csv-import-api.test.ts` `dec2083b5483…`.
