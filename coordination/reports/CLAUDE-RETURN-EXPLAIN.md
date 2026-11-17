# CLAUDE-RETURN-EXPLAIN · Explicar en palabras la devolución al CRM

**Autor:** Claude (Opus 5.5) · **Fecha:** 17/11/2026 · **Origen:** mejora C4 del informe, por orden del usuario.

## Lo que ya existía, y corrige el informe

El informe daba C4 como pendiente, pero su núcleo ya está en `server/recovery.ts`:

- compara tres valores por campo: el capturado, el local y el actual del CRM;
- marca conflicto cuando cambiaron el local y el del CRM;
- exige una decisión antes de aprobar;
- invalida el plan si el CRM cambia después de revisarlo;
- marca como «incierto» lo que no puede confirmar y nunca lo reintenta a ciegas.

Lo que faltaba es que una persona lo entienda. La pantalla actual (`ChangesView`) enseña los valores en crudo, por ejemplo `String(field.base)`. Así salen identificadores de opción, fechas ISO e IDs de empresa, con las opciones «Usar local» y «Conservar remoto».

## Qué añade

`shared/return-explain.ts` es un módulo puro: no toca el plan ni decide nada.

- **`formatValue`** muestra cada valor como lo ve la persona en la App:
  - opciones por su etiqueta;
  - fechas en DD/MM/AAAA, y fecha y hora en la zona de Madrid;
  - números con formato español;
  - sí/no;
  - relaciones por el nombre del registro;
  - «vacío».
- **`explainField`** escribe una frase por campo según su caso:

| Caso | Frase |
| --- | --- |
| Se envía | «En HubSpot pasará de «A» a «B».» |
| Ya coincide | «HubSpot ya tiene «B». No se envía nada.» |
| Conflicto sin decidir | «Conflicto: al capturar era «A»; tú lo cambiaste a «B» y en HubSpot alguien lo cambió a «C». Elige cuál se queda.» |
| Gana lo local | «Se sustituirá lo que alguien puso en HubSpot («C») por tu valor, «B».» |
| Gana el CRM | «Se queda lo de HubSpot («C»). Tu cambio a «B» solo seguirá en tu copia local.» |
| Alta | «Se creará en HubSpot con «B».» |

- **`explainReturnPlan`** agrupa las operaciones por cliente:
  - la empresa del propio registro;
  - si no tiene, la empresa de su persona;
  - si tampoco, la persona;
  - y si no hay nada de eso, el propio registro.

  Pone primero los grupos con conflictos sin decidir. Añade las relaciones que se crearán («Se enlazará con Estudio Arce (empresa).») y un resumen con lo que se envía, lo que ya coincide, los conflictos, lo que se sobrescribe, lo que se queda en local y las altas. Con el CRM simulado dice «el CRM de prueba», no «HubSpot».

## Verificación

`tests/return-explain.test.ts` pasa **4/4**:

1. Formato de cada tipo de valor.
2. Cada frase, una por caso.
3. **Plan real**, con `Recovery.preview` y su CRM simulado sobre un almacén cifrado con datos ficticios:
   - se cambian una oportunidad, una tarea y el teléfono de Lucía, y se da de alta a una persona;
   - mientras tanto, «alguien» cambia el teléfono de Lucía en el CRM.

   Comprueba:
   - que hay un conflicto;
   - que su grupo, «Estudio Arce», sale primero aunque no fuera el primero en guardarse;
   - que el alta va en el mismo grupo con su enlace;
   - que la etapa se muestra por su nombre;
   - que no aparece ningún ID interno ni fecha ISO en las frases;
   - que al decidir «se queda lo del CRM» el conflicto pasa a «se queda en local».
4. Agrupación con un plan construido a mano: una oportunidad va con su empresa aunque su cliente sea de otra, y una tarea de alguien sin empresa va con esa persona. Los datos de prueba no tienen estos casos y la devolución no admite cambiar relaciones existentes.

Sobre la fuerza de las pruebas:

- **Mutaciones.** Se probaron cuatro: quitar el caso de conflicto, el orden, el grupo por empresa propia, el grupo por persona y las etiquetas de opción. Todas hacen fallar alguna prueba. Las dos primeras versiones de la prueba dejaban vivas dos mutaciones; se endureció hasta que fallaran.
- **`tsc`:** 0.

## Archivos

| Archivo | Huella |
| --- | --- |
| `shared/return-explain.ts` | `91827adabf0c…` (nuevo) |
| `tests/return-explain.test.ts` | `1d3e6123cc3f…` (nuevo) |

No se tocaron `server/recovery.ts` ni ninguna pantalla.

## Siguiente paso

Conectarlo a `ChangesView` (la sección «Devolver cambios»):

- tarjetas por cliente, con conflictos primero;
- cada campo con su frase;
- botones «Quedarme con lo mío» y «Quedarme con lo de HubSpot» en lugar de «Usar local» y «Conservar remoto»;
- el resumen arriba.

Es un encargo de interfaz aparte, y `ChangesView.tsx` es un archivo compartido.
