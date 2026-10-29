# CLAUDE-FIX-020 · Conservar los borradores cuando caduca la sesión del piloto (401)

29/10/2026, Europe/Madrid. Autor: Claude (Sonnet 5.5), por petición del usuario. Cierra el hueco que `CLAUDE-FIX-014` dejó declarado en R-01.

## Problema

En el piloto local, cualquier respuesta 401 ponía `ready=false` y vaciaba espacios, resumen y registros (`TeamApp.tsx`): la pantalla se desmontaba entera y los borradores con cambios sin guardar se perdían sin aviso.

## Cambio

- **`src/TeamApp.tsx`:** un 401 del piloto pone `locked=true` en lugar de vaciar datos. La aplicación sigue montada pero con `hidden`, `inert` y `display:none` en línea, y encima se muestra la puerta de desbloqueo («Sesión bloqueada.», con el mensaje de que los borradores se conservan si los hay). Tras desbloquear, `unlockAgain` recarga espacios (`loadSpaces`, que prueba que la sesión vuelve a ser válida), quita el bloqueo y refresca después; un fallo del refresco se muestra y un segundo 401 vuelve a bloquear sin que nada lo pise. El sondeo de «Trabajos» se detiene mientras está bloqueada. El foco pasa al título de la puerta al bloquearse. `locked` también se reinicia en `loadSpaces` y en el bloqueo deliberado.
- **El bloqueo deliberado «Bloquear piloto» no cambia:** sigue vaciando datos tras la confirmación de R-01.
- **`src/components.tsx` (`Modal`):** un modal dentro de una pantalla oculta o inerte no atrapa Tab ni se cierra con Escape (sin esto, un Escape sobre la ficha oculta mostraría un `confirm()` o la cerraría, y Tab quedaría atrapado en un panel invisible).
- Sin cambios de servidor, permisos ni contratos.

## Verificación

- `tsc --noEmit` sin errores. `npm test` **551/551**. `tests/ui-journeys.test.ts` 48/48 (una prueba nueva del `Modal` oculto).
- **Navegador real** (Chromium propio de Playwright, build aislado, mismo arnés que `FIX-014`): `tests/e2e/session-lock.spec.ts`, 5 recorridos que simulan la parte del piloto que ve el navegador sobre el servidor de demo: (1) un 401 al guardar con texto sin guardar muestra la puerta, la aplicación está montada pero oculta e inerte, y tras desbloquear el texto sigue ahí y se puede guardar; (2) sin borradores el mensaje no promete conservar nada; (3) «Bloquear piloto» sigue vaciando la pantalla y pide confirmación; (4) el sondeo de Trabajos no hace ninguna petición más con la sesión caducada y el foco está en la puerta; (5) una ficha abierta con texto sin guardar no pide confirmación con Escape ni atrapa Tab mientras la sesión está bloqueada.
- **Línea base:** con los `TeamApp.tsx` y `components.tsx` de `HEAD` fallan (1) y (2) y pasa (3), que es una guarda de regresión.
- **Mutaciones sobre los archivos reales** (restaurados después): dejar el sondeo activo durante el bloqueo falla (4); quitar la guarda de Tab del `Modal` falla (5).
- 30 recorridos E2E aislados en total (28 del conjunto principal + 2 del agente local) correctos con el cambio.
- **Revisión independiente** (subagente distinto del autor, solo lectura): *aprobable con reservas menores*; sin fuga de privacidad ni forma de eludir el bloqueo. Aplicado: no tragar el fallo del refresco ni pisar un 401 posterior (B1), reiniciar `locked` en la entrada normal y en el bloqueo deliberado (B3), foco en la puerta (B4), y pruebas para el sondeo y para el Tab/Escape de un modal oculto (el hueco principal que señaló). No ejecutó los E2E.
- Hashes SHA-256 (16 primeros): `TeamApp.tsx` 549d107a4e4b2a1b · `components.tsx` 507b7bf3e99b51d1 · `tests/ui-journeys.test.ts` 78ca5858cedfd4c8 · `tests/e2e/session-lock.spec.ts` d90369a46a6ed398.

## Límites

- **«Oculto» no es «borrado»:** los datos siguen en el DOM y en el estado de React mientras está bloqueada; quien abra las herramientas del navegador los ve. Es el compromiso para no perder borradores; el bloqueo deliberado sí vacía.
- El servidor de demo no tiene piloto local: los E2E simulan `localPilot`, el estado y el desbloqueo con respuestas de prueba. **No se ha probado contra el piloto real con su protección DPAPI.**
- **B2 no aplicado (casi inalcanzable):** si tras desbloquear cambiara el espacio activo, `unlockAgain` refrescaría el espacio anterior hasta que el efecto de `[spaceId,profile]` cargue el nuevo. El piloto es de un operador.
- Tras desbloquear no se devuelve el foco al punto anterior. El mensaje de error («La sesión del piloto caducó.») se limpia al desbloquear.
- Sin lector de pantalla probado; sin despliegue: el piloto sigue con el build anterior.
- Se detectó y evitó un error mío: un comando de compilación de prueba mal formado habría vaciado el `dist/` real del piloto; el control de permisos lo bloqueó y no se ejecutó nada.
