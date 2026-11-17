# El temporizador de capturas respeta el plazo, la pausa y el trabajo en curso

Banco verify353-roR9I8. Fastify y SQLite nuevos, importador ficticio, reloj e intervalos controlados por Node. La prueba habilita y pausa mediante las rutas reales de programación y observa el estado de la API. Avanza el temporizador registrado por v2 sin llamar manualmente a tick ni a la ruta de captura.

- En el primer minuto el temporizador inicia un trabajo. El fallo conserva la captura inicial y genera el aviso. Los siguientes 59 minutos no generan otro intento.
- Al minuto del vencimiento la programación está pausada y no inicia trabajo. Al reanudar, el siguiente disparo crea una captura. Otro intervalo vencido mientras el importador sigue pendiente no duplica el trabajo ni mueve la hora del último intento.
- El éxito añade la captura, conserva el espacio activo y retira el aviso. Una hora simulada después de cerrar Fastify no inicia actividad.
- La prueba falla al quitar solo la llamada al servicio del callback del temporizador en una copia temporal. El código real se restaura por SHA. 18/18 focales y typecheck completo con la versión final. El primer typecheck señaló Promise.withResolvers en el arnés porque tsconfig usa ES2023. Se cambió a una promesa compatible y se repitieron las comprobaciones.

El temporizador se acelera en el ensayo. El simulacro técnico se prepara con evidencia ficticia vigente para evitar que compita por el mismo trabajo. Se usan conexiones y datos inventados y se bloquea la red externa. Quedan fuera un proveedor real, una espera de reloj real y el paquete instalado.

Prueba SHA-256 ed9ef4e9e1c91d231dcb4f4b6a404d1ec36925d488ab4eb2e525215ef91bc343. Servidor y fuentes de avisos cotejados en final.json.
