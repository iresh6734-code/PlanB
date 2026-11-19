# Devolución explicada · Revisión independiente 430

Requiere R2 en el modelo y en la pantalla. Cotejadas las seis huellas presentadas, ChangesView fca4fc708094 y el motor de devolución del mismo corte. Las 34 pruebas existentes de explicación, interfaz y barreras pasan. El typecheck de ese corte termina con un error ajeno a la devolución en la inicialización de RecordDrawer de components.tsx 9c8e5e5bcd28. La corrección posterior de esa ficha se verifica por separado.

## F1 · Una operación verificada sigue anunciando un envío futuro

El motor real prepara un cambio de teléfono sobre una copia ficticia y lo aplica a su destino simulado. El destino devuelve el teléfono esperado y se verifica el estado complete/applied. La explicación sigue contando 1 campo por enviar y dice «En el CRM de prueba pasará de …». El estado de la operación figura como verificado en la pantalla al mismo tiempo. El motor omite operaciones applied y skipped al ejecutar.

La explicación debe separar trabajo por hacer de lo ya verificado, omitido o incierto. Contar altas por registro, sin volver a prometer un alta si ya tiene ID remoto y solo faltan relaciones. El informe de Claude ya identifica el artículo incorrecto del destino simulado y las frases innecesarias para campos vacíos de altas. Conviene cubrirlo junto al cambio del modelo y mantener el significado del plan y las reglas del motor.

## F2 · El plan nuevo puede renderizar identificadores del anterior

Se monta ChangesView real con el arnés de hooks y un plan A válido. Al resolver la lectura de su empresa, aparece su explicación. El sondeo entrega un plan B válido con otro ID de operación y deja pendiente la lectura de la empresa de B. En ese render el hook todavía devuelve los grupos de A. ChangesView busca su operación en B y se produce TypeError al leer label. El arnés no termina el render del plan B y todavía muestra A.

La pantalla debe devolver el respaldo de B en cuanto cambie el plan o la especificación, incluso antes de que termine un efecto. La explicación que se muestra necesita corresponder a la identidad y contenido que se están renderizando. Incluir una prueba de reemplazo con lectura pendiente, decisión dentro de la misma operación y entrega tardía fuera de orden. Puede mantenerse una guarda en la vista para una operación ausente. Una copia temporal que guarda la explicación junto a su clave y especificación hace pasar el caso de reemplazo. Esa copia comprueba el mecanismo y deja a R2 definir qué campos de la clave afectan a la explicación.

## Evidencia

Banco tests/.tmp/return430-A87oUt. related.log conserva 34/34. engine.mjs ejecuta Recovery con destino simulado. engine-observations.json contiene complete/applied y el contador incorrecto. ui-transition-details.log recoge el error del componente. ui-causal.log pasa el mismo control con identidad ligada en una copia. Se usaron API simulada, motor local y datos ficticios. La prueba independiente de transición usa el arnés de hooks y no un recorrido de Chromium.
