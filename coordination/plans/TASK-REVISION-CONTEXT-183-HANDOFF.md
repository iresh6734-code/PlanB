# Contexto completo sobre cliente166 · traspaso183

4/11/2026, Europe/Madrid. Fuente presentada para revisión independiente; no montada en App. Unidad183 añade solo un módulo y su prueba, sin cambiar136,170,U1,U2,166,123 o el servidor.

## Uso previsto

`createContextualTaskRevisionClient({base?,fetch?,timeoutMs?,contextTimeoutMs?,maxResponseBytes?})` compone los clientes aceptados123/166. No guarda estado entre llamadas, no persiste datos, no es otro gestor de operaciones y no reemplaza la estrategia de136. Es la preparación del acceso a datos que el handoff166 pedía: conservar el contexto más amplio123 junto con la revisión166.

`read(taskId,expectedContext?,signal?)`:

- Lee contexto123 antes; lee revisión166 ligada a instalación/ID/fecha; vuelve a leer contexto123 después. Compara `contextKey` exacta: instancia,IDcaptura,fecha,iniciocaptura,cuenta,generación. No normaliza esas identidades.
- Devuelve `read/opened`, donde opened contiene `{context,schema,current}`. current es la vista166 completa, incluida revisión y registro. Conservarlos juntos para el intento explícito de la persona.
- `unavailable` si no hay contexto activo utilizable y no se proporcionó uno esperado; `context-changed` si ya no corresponde al esperado o cambió durante la lectura; `failed/status/message` en fallo. Incluso un404 exige comprobar después el contexto antes de poder presentarlo como desaparición en esa copia.
- `schema` viene de la segunda lectura123. Puede sernull; el consumidor no debe usarlo como autorización para editar. El servidor mantiene la validación de campos.

`save(opened,values,signal?)`:

- Clona la intención y la vista al entrar; valida contrato166 y correspondencia de instalación/ID/fecha con su contexto. Si son inválidos o la señal ya está cancelada → `not-sent`, sin red.
- Relee el contexto123 antes de enviar. Diferencia → `context-changed`, sinPATCH. Fallo de lectura → `preflight-failed/status/message`, sinPATCH;401antesdeenvío sigue siendo este caso.
- Delega un único intento a166 usando el token ORIGINAL de opened.current. No haceGETpara renovar esa revisión. Devuelve `changed/current`, `unchanged/current`, `conflict`, `rejected`, `not-sent` o `uncertain` sin borrar sus diferencias. Un401/409/422 DESPUÉS de despachar esrejected;un error sin acuse utilizable después esuncertain. La lectura de comprobación nunca reenvía.
- Un token obsoleto no se convierte en nueva intención por actualizar silenciosamente el registro. Para un intento posterior tras un acuse confirmado, conservar `current` devuelto;si hace falta otra lectura de contexto, hacerla de forma explícita. No asumir que `current` confirma por sí mismo todos los metadatos123.

`verify(opened,values,signal?)`:

- Solo llama a read con contexto completo original. Devuelve `read/evidence/opened` o `context-changed/locked/missing/unknown`.
- `evidence` reutiliza123:applied/unchanged/diverged. Aquí applied significa coincidencia observada, **no autoría del envío ni acuse recuperado**. La comparación de valores123 trata vacío/null como equivalentes;la comparación de identidades de contexto es exacta.
- Incluye la revisión observada en opened;no adopta esa revisión ni llama a save automáticamente. Si la persona decide un nuevo intento, el consumidor debe conservar su intención y explicar la revisión/base que usará.

## Límites del protocolo

Las lecturas de contexto antes/después son observaciones, no una transacciónHTTP ni una garantía contra A→B→A entre muestras. CAS128 compara bajo un único escritor cooperativo su fingerprint de instalación,snapshot completo,spec,sesión,registro y último cambio. No añade idempotencia por intención ni cubre rutaslegacy u otros escritores no cooperantes.

Una prueba de límite183 cambia SOLO generation.generatedAt después del preflight y antes delPATCH:el token128 no incluye ese metadato por separado y el guardado puede devolverchanged;verificar después contra el contexto original devuelvecontext-changed. Cambiar la cuenta dentro del snapshot en la misma ventana sí provoca conflict por el fingerprint. No prometer unCASatómico sobre todoTaskContext. Para exigirlo habrá que acordar otro contrato de servidor, no añadir lecturas y afirmar que resolvieron la ventana.

Contexto utiliza límites123:lecturas15s por defecto, salud/registro1MiB yestado8MiB. `contextTimeoutMs` ajusta el plazo de esas peticiones;`timeoutMs`/`maxResponseBytes` configuran166,20s/2MiB por defecto. No es un plazo total único de toda la operación. Las peticiones de contexto fuerzan no-store/same-origin/redirect:error;166 mantiene sus mismas opciones y no hay fallbacklegacy. Los mensajes de fallo de preflight son controlados,no copian el mensaje arbitrario del transporte.

## Siguiente integración acordada

Esperar170aceptada yU2aceptada. Preparar entonces una unidad exacta de contrato136/estrategia/ficha/consumidores,con pruebas de la App real. No editar las rutas de esas unidades por tener183aceptada.

Ese contrato debe conservar no-op,nueva revisión y procedencia,además de observar la frontera de despacho para el lifecycle de170. **No mapearunchanged a savedlegacy sin información adicional**:la superficie no debe inventar otra fila de historial ni presentar «se añadió un cambio». No perder token nuevo al resolver/reabrir,ni actualizarlo al verificar sin decisión de la persona. Mantener D7,dispose,actualizaciónpadre/cola,rechazoscontrolados y ordenauth158.

183 no implementa ese adaptador ni monta una ruta alternativa en la app. No disparaonConfirmed,contadores,notificaciones de bloqueo o callbacksReact por su cuenta;los consumidores actuales123/136mantienen esos efectos. El contrato de salidas permite al adaptador futuro conservar el momento conocido del fallo.
