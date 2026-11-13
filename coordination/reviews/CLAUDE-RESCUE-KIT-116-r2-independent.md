# Revisión independiente · Kit de Relevo 116 R2

3/11/2026, Europe/Madrid. Codex. Dictamen: **devolver 116 para corregir la propiedad del reclamo**. No se acepta ni integra R2. La QA 136 se mantiene en revisión; el hecho de que identifique el defecto no la convierte automáticamente en una aceptación completa.

## Hallazgo reproducido · dos instancias con el mismo PID

En `server/rescue-capsule.ts`, `activeClaims` es un conjunto propio de cada instancia del módulo. Un reclamo con `pid === process.pid` ausente de ese conjunto se considera obsoleto. Una segunda instancia del módulo dentro del mismo proceso, como un worker thread, tiene su propio conjunto y puede confundir el reclamo activo de la primera con uno huérfano.

Repetición independiente: `node --import tsx --test --test-concurrency=1 --test-name-pattern 'ARTEFACTO DEL MISMO PID' tests/rescue-capsule-followup-claims.test.ts`. Resultado **1/1 caracterización**: con la primera importación retenida en `components-written`, la segunda instancia compartiendo PID obtuvo éxito e importó otro destino. La prueba usa la raíz ficticia aislada de QA136. El caso pasa porque reproduce el defecto; no es una regresión verde. El autor ya lo había declarado y reproducido. No he demostrado que el servidor normal cargue dos instancias ni que el defecto ocurra entre procesos con PIDs distintos; su aplicabilidad concreta se limita a esta configuración reproducida.

Se rompe la exclusión del reclamo activo en esa configuración; antes de aceptar la garantía general de un destino, corregir el reconocimiento del propietario y el tratamiento conservador de la ambigüedad. Añadir una regresión determinista que bloquee a la segunda instancia mientras la primera está activa y confirme que no se publica otro destino; probar procesos realmente distintos y caída de propietario por separado. Rehacer la prueba `CARRERA` que usa hilos con igual PID o justificar su modelo, sin relajar el oráculo. No eliminar reclamos o destinos a ciegas. Invertir la caracterización 8 solo bajo la reserva formal de QA136; mi observación histórica en 138 debe ajustarse por su propietario.

## Revisión de la corrección anterior

Los 25 hashes de 116 y los de QA136 coincidían con sus submit al inicio. Se leyó la clasificación de publicación y el nuevo `catch`, que conserva reclamos para destinos publicados o dudosos; no he repetido todavía los 54 Node ni los 26 DOM declarados por el autor. Mi anterior `tests/independent-rescue-claim.test.ts` expresa el comportamiento defectuoso original y requiere convertirse en regresión cuando corresponda. Esta revisión no afirma una validación completa de todos los cambios R2.

El autor aclaró el resultado histórico de 48: 47 casos en una pasada más un caso añadido y probado aparte. Aclaró también que la captura de inspección a 1440 px no se abrió en R1 y sí se inspeccionó después en R2. No se ha verificado otro equipo, HubSpot, relaciones, datos reales, disco lleno ni enlaces simbólicos reales.

## Repetición posterior de QA136 y regresión 138

- Invertí mi test `tests/independent-rescue-claim.test.ts`; **1/1 pasa** en R2 exigiendo conservar el reclamo y rechazar otro intento después de la excepción inyectada tras publicar. No cubre el defecto distinto de PID compartido.
- Repetí las 25 pruebas de QA136 en serie, a partir de la proyección congelada `tests/.tmp/rescue136-ev-16c77246-14b8-4bb9-8eac-4bcb61537d78/pqa`, con base temporal propia `tests/.tmp/rescue-review148-9670138d-3d95-4123-a2fa-e36ecc6bc7d0`. Antes del ensayo, los dos módulos de 116, las tres pruebas y dos helpers de QA cotejados coincidían con el árbol. **24/25 pasaron**; la prueba 8 pasa porque reproduce el defecto del PID compartido.
- El fallo fue en `5 · CARRERA`, ronda 16: un hilo informó éxito y el otro devolvió un `EEXIST` crudo; la aserción rechazó esa combinación como resultado inesperado. Esta ejecución **no demuestra que se publicaran dos destinos** ni establece todavía si el error crudo es un defecto de contrato, un intercalado seguro o un problema de arnés. El resultado difiere del 25/25 declarado en la ejecución del autor y debe investigarse con logs y barreras sin relajar el oráculo para ocultarlo.
- Las otras 24 pruebas de esta ejecución pasaron; no se suman a los 25 casos históricos ni sustituyen una prueba de navegador. 116 permanece `working` y la QA en `review` a la espera de la corrección y revisión correspondiente.
