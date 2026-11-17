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
