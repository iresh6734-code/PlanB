# Las pruebas de cápsulas observan su propia importación

14/11/2026, Europe/Madrid. Una prueba de integridad comparaba el listado de destinos y staging de todo tests/.tmp. Otra ejecución podía crear una carpeta durante el await y provocar un fallo espurio.

Las comprobaciones usan ahora el reclamo de la cápsula, los eventos de importación y el identificador de su staging y destino. Los rechazos por SHA distinto, revisión distinta y sustitución tras inspección liberan ese reclamo y no alcanzan staging. Un paquete que falla en restoreBundle alcanza staging y retira su carpeta, sin publicar su destino. La importación válida confirma el destino propio y el siguiente intento sigue bloqueado como duplicado. Se conserva la comprobación del origen.

En una copia temporal del test viejo creé una carpeta ajena entre las dos observaciones de la prueba. Falló con la nueva carpeta como única diferencia. El test nuevo crea su propia carpeta canario al empezar la importación y pasa en presencia de ella. La misma prueba cubre de forma explícita la sustitución que mencionaba su título, usando otra codificación cifrada del mismo contenido lógico.

23/23 en las suites de integridad y contexto, sin omitidos ni TODO. tsc --noEmit limpio. Banco tests/.tmp/rescue360-4EWsQ9. El banco usa SQLite con cifrado real y una clave de prueba para evitar depender de DPAPI. Solo en el snapshot adapto la selección de clave de server/crypto.ts bajo NODE_ENV=test. La copia causante anterior conserva el fallo y la carpeta canario dentro del banco. La batería completa y los demás fallos intermitentes de rescate quedan fuera de este resultado.

- SHA-256 tests/rescue-capsule-integrity.test.ts bd445dd61cb69a181c491b62755bacee431c0a3c10004b5ab90cd684319a1b4d
