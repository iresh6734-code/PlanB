# Autorización local 214 · revisión independiente 217

5/11/2026, 21:43 Europe/Madrid. Dictamen favorable sobre las cuatro huellas presentadas. La captura reutiliza la sesión original y verifica su vigencia después de una espera, sin extenderla por comprobarla. La factoría devuelve el controlador existente a sus consumidores.

## Código y contrato revisados

Se compararon `server/app.ts` y `server/security.ts` con los baselines preservados por 214. La factoría cambia la firma, conserva el retorno de `registerSecurity` y lo devuelve junto a App y Store. En seguridad se añade una captura con cierre permanente tras observar invalidez. Las rutas y la política de renovación existentes conservan sus cuerpos anteriores.

La captura rechaza una sesión inválida al crearse. Su comprobación posterior consulta el modo de protección y la sesión original. Si detecta revocación, caducidad, activación de protección o fallo de lectura, queda inválida para futuras llamadas. Otra sesión válida conserva su autorización. Una petición normal que renueva legítimamente la misma sesión también mantiene válida su captura. La comprobación por sí misma no renueva el plazo.

La frontera de autorización depende del consumidor. Este debe comprobar la función antes de cada efecto y publicación tras una espera. El controlador observa la revocación del servidor. El sellado inmediato al pulsar bloquear en la interfaz pertenece al montaje 171 y a su revisión 209. La entrega 214 no instala la API de HubSpot en los lanzadores.

## Repeticiones propias

Se cotejaron las 137 entradas de `tests/.tmp/a214-6b7b7b0c/manifest.json`. Todas coinciden con la copia congelada. Las fuentes de 214 usadas en esa copia coinciden con las presentadas actualmente.

- **40/40 Node en una pasada final**, seis de autorización y 34 de evidencia, inspección y comparación de copias. Log `tests/.tmp/review217-related-final.log`. Se fijaron `PLANB_COPY_SERVER_SRC` y `EVIDENCE_API103_MODULE` a los módulos de la copia congelada.
- **3/3 sondas independientes**, en `tests/.tmp/review217-authorization.test.ts`, contra App real con SQLite en memoria y Fastify inject. Una petición queda retenida tras capturar autorización. Se revoca su sesión, otra sesión ejecuta su propio efecto y al liberar la primera devuelve 401. Se observa un solo efecto sintético y cero cambios CRM. Las otras sondas comprueban renovación legítima y aislamiento entre dos factorías. Log `tests/.tmp/review217-independent.log`.
- Tipos focales del corte, incluidos consumidores y lanzadores, **exit 0**. Tipos de la sonda independiente, **exit 0**. Logs `review217-types.log` y `review217-probe-types.log`.

Las sondas son locales con inyección HTTP de Fastify. El efecto retenido es un contador sintético, no una petición a proveedor ni un PATCH CRM. Las 58 pruebas de 212 R2 y los dos mutantes del autor quedan atribuidos a su informe. La revisión del consumidor 212 R2 la mantiene el otro Codex en 213. No se repitió el análisis global del checkout mientras el diario 208 está en desarrollo.

## Incidencia del arnés del revisor

La primera pasada dio 37/40. El test de inspección importa su módulo desde el directorio actual por defecto. Se había combinado la App de la copia congelada con ese módulo del checkout, produciendo dos identidades distintas de `AppError` y respuestas 500 en tres rutas de error. El log se conserva en `review217-related.log`.

Al fijar la importación de inspección a la copia congelada pasaron 40/40, log `review217-related-corrected.log`. Después se fijó también la importación dinámica de evidencia y se repitieron las cuatro suites juntas. Esa es la pasada final de 40/40 indicada arriba. Las fuentes y las aserciones permanecieron intactas.

## Huellas aceptables

| Archivo | SHA-256 |
| --- | --- |
| server/security.ts | 890b05cad3552f8fc57959e8ad20541f3442693cf1a457c7cdb1e655a6d5a596 |
| server/app.ts | b26845d21518e7371c04a80e08f26def455e0c80d81e258b5c1f8b89f28d919b |
| tests/local-authorization.test.ts | 6140d4a8f48a4c138e546f6ad19a61ac87c5417f5583a71e67f09313017b1d83 |
| coordination/reports/CODEX-LOCAL-AUTHORIZATION-214.md | 921320ae803158bd77f319592bfd384213484d4e366332f8d2afc8421400715e |

Cotejo actual guardado en `tests/.tmp/review217-hashes.json`. El dictamen acepta el contrato para sus consumidores de servidor. La integración de 212 necesita una unidad propia, su registro y una prueba desde el punto de entrada principal. La copia visible 4596 conserva el corte 193 hasta que se publique una candidata revisada.
