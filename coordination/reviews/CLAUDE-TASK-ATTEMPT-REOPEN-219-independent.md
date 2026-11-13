# Reapertura 219 R2 aceptada

El aviso sigue en Resultados si el 422 llega después de reabrir el intento en curso. Al cerrar y volver a abrir la ficha se recupera «Completada». El control con respuesta mientras la ficha está cerrada también conserva aviso y borrador. En ambas ramas se interceptó una solicitud y se registraron cero PATCH en el servidor y cero cambios CRM. Chromium aislado usó la App compilada de 222 más 219 y createBaseApp con SQLite en memoria, por Fastify inject. El rechazo se inyectó en el transporte.

Pasan nueve pruebas de adopción y los tipos, incluida la sonda. En la primera corrida R2 se leyó el select demasiado pronto y salió «Pendiente» en ambas ramas aunque los avisos estaban. Se añadió una espera por el aviso de restauración y el valor del select. La misma sonda ajustada sigue reproduciendo la pérdida del aviso en R1 y pasa en R2. Corte corregido tests/.tmp/q228r2-717b2c6a. Control R1 tests/.tmp/q228r1-control-8b391011. Se preservó la primera corrida en tests/.tmp/q228r2-6dd94b5e. Los hashes y resultados se registran en cada manifiesto.

La ficha marca el intento adoptado por su ID. Un rechazo tardío de ese intento conserva el aviso en el gestor. La ficha que originó un nuevo guardado mantiene la política anterior. La prueba independiente acredita el 422 tardío. El preflight 503, reintento explícito y el resto de los once E2E y regresiones de la autora se atribuyen a su informe. Las diez huellas presentadas coinciden y se acepta esta versión en el tablón. Quedan los pins 220 y 196 y la actualización de candidata bajo sus propios encargos.

---

# Reapertura 219 devuelta para R2

Con las diez huellas presentadas pasan las nueve pruebas de adopción y los tipos focales. Los ocho recorridos originales de la autora quedan atribuidos a su informe. La revisión repitió por separado un control y una regresión de la App compilada con 222 más la entrega 219. Chromium aislado abre la barra lateral, Hoy, la ficha y Resultados. Sus solicitudes se resuelven con Fastify inject sobre createBaseApp y SQLite en memoria. La única excepción es la respuesta 422 retenida e inyectada en el navegador. No se escucha en un puerto.

1. La persona cambia Estado a completada y guarda. La respuesta 422 queda retenida y la ficha se cierra. El aviso indica que el envío sigue en curso.
2. Si el rechazo llega con la ficha cerrada, abrir desde Resultados restaura el borrador. Tras cerrar esa ficha, el aviso permanece y permite recuperar el mismo valor otra vez.
3. Si la persona reabre el intento mientras sigue en curso y luego llega la misma respuesta, la ficha muestra el error de campo y conserva el valor en pantalla. La transición llama a outcomes.dismiss sin distinguir si la ficha registró el intento o lo adoptó de Resultados. Al cerrar se pierde el aviso y ya no se puede recuperar el borrador.

Ambos casos tuvieron una solicitud de guardado interceptada, cero PATCH enviados al servidor, cero cambios SQLite y la tarea persistida como pendiente. Consola de errores de página y solicitudes externas observadas vacías. La sonda terminó con el fallo esperado en el segundo caso. Browser, contextos y las dos instancias de Fastify se cerraron. Evidencia en tests/.tmp/q228-416f4d17. La primera corrida, en q228-c6604e90, completó el control y agotó la espera al abrir el panel en la variante tardía. El arnés se corrigió leyendo aria-expanded. Chromium también escribió en debug.log que se había copiado del manifiesto de 222. Se excluyó ese log de la nueva proyección y las otras 268 huellas se cotejaron tras probar. Las fuentes presentadas coincidieron en ambos cortes.

El caso viola la garantía de conservar el aviso al restaurar un rechazo. Reabrir para ver el progreso no debe cambiar quién conserva el aviso. La unidad permanece separada de los pins y del montaje del comparador, CAS y diario.
