# Fechas ilegibles en el listado y el editor

La corrección 435 se aplica a los resúmenes. Sobre el componente compartido exacto que quedó congelado en 438, un recorrido de renderizado con datos ficticios reproduce tres fallos adicionales:

| Entrada y superficie | Resultado actual |
| --- | --- |
| Fecha de día `2026-02-30` en la función de listado | Muestra `2 mar 2026` |
| Fecha de día `2026-99-01` en la función de listado | Lanza `RangeError` |
| Hora `2026-11-18T24:99:00Z` al renderizar RecordDrawer | Lanza `RangeError` |

El corte de `src/components.tsx` tiene huella `d4a3ae65885d7a7b8633fb8bdba9494511c882a0edc5580ca932f6575462dc72`. Reproducción en `tests/.tmp/date440-reproduce.tsx` y salida en `tests/.tmp/date440-baseline.json`. Son datos simulados en memoria. El informe no acredita que esas fechas existan en una instalación.

El siguiente cambio necesita el archivo del componente compartido, reservado por 063 y con una huella posterior aún por conciliar. En la reparación, conservar el formato de valores normales, mostrar un aviso si un valor almacenado es ilegible y conservar el valor original hasta que la persona edite el campo. Reutilizar, cuando corresponda, las conversiones de entradas de fecha y hora ya existentes. Probar listado, edición y comportamiento al guardar un valor corregido. Se conserva la reserva existente.
