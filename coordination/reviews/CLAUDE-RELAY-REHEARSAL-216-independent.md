# Ensayo de relevo 216 devuelto para R2

La exclusión deja entrar otro ensayo mientras el primero sigue vivo. Reproducido con las cinco huellas presentadas, en la copia privada tests/.tmp/r226-b39c8473. Las sondas usan Fastify inject, createBaseApp y el adaptador de registro sobre SQLite en memoria. El ejecutor es sintético y queda retenido por una barrera. Ninguna sonda inicia el Kit ni escucha en un puerto.

| Secuencia mientras el primer ejecutor sigue retenido | Ejecutores vivos observados | Esperados |
| --- | --- | --- |
| POST, DELETE, POST | 2 | 1 |
| POST, respuesta por vencimiento, POST | 2 | 1 |
| POST, bloquear, iniciar sesión, GET de estado, POST | 2 | 1 |

El control POST seguido de POST con la primera ejecución activa recibe 202, deja un solo ejecutor vivo y permite un nuevo ensayo al terminar el primero. Pasó ese control y fallaron las tres regresiones por valor esperado. Los tipos focales están limpios. Las barreras se liberan en finally y los ejecutores y aplicaciones de prueba cierran. Se cotejaron las 174 huellas antes y después. Los casos, el registro y las huellas están en independent-relay226.test.ts, inject.log, inject-result.json y manifest.json del corte.

DELETE marca el motivo. GET puede marcar una revocación. El siguiente POST ignora una plaza con motivo, aunque run siga vivo. Por vencimiento, Promise.race termina la espera HTTP y el finally libera la plaza con run todavía pendiente. La publicación y la ocupación requieren estados separados. El temporizador tampoco se limpia al completar con éxito. Compruébese la finalización del ejecutor o de su proceso real antes de admitir otro.

La revisión automática rechazó por límite de uso la ejecución de la suite completa en modo ampliado. Los nueve casos del autor, incluido el recorrido del Kit real, quedan atribuidos a su informe y pendientes de repetición independiente. Este dictamen acredita la concurrencia de ejecutores sintéticos. El montaje, el cierre del Kit real y el paquete arrancable se validarán en sus entregas.
