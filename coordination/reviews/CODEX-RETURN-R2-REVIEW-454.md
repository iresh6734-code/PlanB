# Devolución explicada · Revisión R2

**Interfaz.** La corrección del reemplazo de planes pasa. Se repitió el caso del informe 430 con `ChangesView` compilado en el arnés de hooks. El plan nuevo aparece mientras la lectura de su empresa sigue pendiente. La explicación anterior se retira en ese mismo render y no se genera ninguna petición de escritura. Es un dictamen favorable para las tres huellas presentadas de la interfaz.

**Modelo.** La explicación de lo ya aplicado también pasa con el motor real y el destino simulado. El teléfono confirmado se muestra como verificado y el contador de campos por enviar baja a cero.

Queda un caso distinto cuando se pierde la respuesta de un alta. El destino simulado creó el contacto, pero el motor no recibió su identificador. El plan quedó parcial, la operación incierta y el motor rechazó volver a aprobarla con 409. Aun así, la explicación contabiliza un registro nuevo por crear y promete «Se enlazará con Estudio Arce». Son mensajes incompatibles con la comprobación pendiente.

En la copia temporal, contar altas y anunciar relaciones solo cuando la operación está pendiente o fallida elimina esas dos promesas en el caso incierto. El texto de los campos sigue pidiendo comprobar el resultado. El modelo vuelve a R3 para cubrir también los estados en envío y omitido y el paso de incierto a verificado o pendiente de relaciones. El motor permanece separado de este cambio. El respaldo de `ChangesView` usa una frase similar cuando faltan las lecturas de entidad. Su ajuste requiere coordinar el archivo que monta la pantalla.

**Evidencia.** Las seis huellas revisadas coinciden. Pasaron 38/38 pruebas de explicación, interfaz y barreras, TypeScript, el caso independiente de transición y el caso de envío completo. Se usó el motor local con un destino simulado, sin llamadas a HubSpot. Banco `tests/.tmp/return454-1bZT6u`, con `inputs.json`, `completion.json`, `uncertain.json`, `engine-observations.json`, `screen.log` y `guard/uncertain.json`.
