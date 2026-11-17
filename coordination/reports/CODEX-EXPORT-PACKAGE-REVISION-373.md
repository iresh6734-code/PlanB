# El ZIP comprueba de nuevo la revisión antes de descargar

15/11/2026, Europe/Madrid. La solicitud de un ZIP lee la revisión antes de empezar y la comprueba de nuevo tras la compresión. La segunda comprobación y el registro de custodia quedan en una única transacción SQLite. Si la copia activa cambió, la ruta devuelve 409 sin adjunto y conserva el registro existente. La ruta acepta a los clientes que omiten la revisión y usa la revisión leída al empezar la solicitud.

**Prueba causal.** Fastify recibe la petición original y el empaquetador real comienza el ZIP. Mientras el empaquetador cede el turno, se modifica un contacto ficticio, se guarda una copia cifrada de la nueva revisión y se confirma su custodia. El código anterior devuelve 200 en la solicitud vieja. El nuevo devuelve 409 sin adjunto, mantiene la revisión y la confirmación posteriores, y un nuevo intento devuelve un ZIP cuyo SHA-256 coincide con su registro de custodia.

68/68 pruebas focales, incluidos exportación, recuperación, rutas v2 y controles de producción. tsc --noEmit limpio. Banco tests/.tmp/export373-oWSwzX. Se usaron activos ficticios para empaquetar y no se ejecutó el ZIP resultante. No cubre el piloto, la batería global tras el cambio o dos exportaciones de bytes distintos sobre la misma revisión.

- SHA-256 server/v2.ts fcad1e697279e85881ef209994ef77887e2e8f4a8b6c55b1c36f63843416237e
- SHA-256 tests/recovery-copy.test.ts 44f5e49e5a7f10b3c47129dc6f36449908a95d8475e49f463367d2d9d32c52cc

## Adaptación de la fixture al iniciador requerido

16/11/2026, Europe/Madrid. La fixture de la carrera aporta ahora un iniciador ficticio regular, como exige 384 para entregar un ZIP. Se conservan la secuencia concurrente, sus aserciones y toda la ruta del servidor. 7/7 en el banco conjunto de ZIP y custodia, incluida la carrera de 373, en tests/.tmp/portable384-38d713e7.
SHA-256 de la prueba actual 77389f9e8b3c97761a4dad5299db24622b7815334f15eaa8ff3ce8f16ad50d00.
