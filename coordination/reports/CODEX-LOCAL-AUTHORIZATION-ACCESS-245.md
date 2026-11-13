# 245 · Captura de autorización por instancia de la app

6 de noviembre de 2026, Europe/Madrid. Codex. La app ya capturaba la autorización original para recorridos de HubSpot desde 214. `registerSecurity` ofrece ahora esa misma función como decoración privada en la instancia Fastify que instala el guard. `getLocalAuthorizationCapture` recupera esa función. Un registrador puede usarla conservando la firma de sus llamadores. Registrar una ruta que la necesita en una instancia sin el guard falla con `FST_ERR_DEC_UNDECLARED`.

El estado de sesiones, sus reglas, las rutas de contraseña, los resultados de `registerSecurity` y su consumidor de HubSpot conservan su comportamiento. La decoración no comparte sesiones, añade cookies, consulta proveedores ni crea otro cálculo de caducidad. 103 R2 la usa para volver a comprobar el permiso original después de calcular y antes de responder. Los montajes 239 y 242 siguen pendientes.

## Pruebas

- Las seis pruebas de 214 pasan con los mismos oráculos. Las dos nuevas confirman fallo sin guard y aislamiento de dos instancias con contraseña ficticia, caducidad durante una ruta local, ausencia de renovación y 401 sin el resultado protegido.
- Corte `tests/.tmp/evidence103-r2-sdxmFA`, 73/73 de autenticación, API, servicio, motor y cola, más 2/2 sondas del dictamen 244. Typecheck focal correcto, sin skips ni TODO. Con la ruta 103 anterior y la infraestructura corregida la nueva regresión de caducidad falla por `200 !== 401`.
- El primer corte del arnés conservaba un `app.ts` anterior a 214 que no retornaba `security` a su fixture. Se repitió usando la proyección backend de 236 y los archivos exactos de 103 y 245. Los logs anteriores quedan separados. Fastify en memoria con datos ficticios, sin listener, navegador ni paquete de instalación.

## Huellas

- `server/security.ts` · `17beae89aa6cf10afc2aa0fec52e2b808bcec8e86545e287052f31063434535a`
- `tests/local-authorization.test.ts` · `a464d3cb9e60aac7f0359f79c573325cc0e24e8c36e52a4dc8c5137574905327`

Presentada para revisión independiente. La demo 236 conserva sus binarios.
