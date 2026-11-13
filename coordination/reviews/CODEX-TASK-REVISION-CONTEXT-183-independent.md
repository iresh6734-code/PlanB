# Puente183 · revisión independiente184

4/11/2026, Europe/Madrid. **Dictamen favorable sobre los cuatro hashes presentados.** Alcance:composición de clientes123/166, todavía sin estrategia136 o montajeReact. Revisor distinto del autor.

## Contrato y código contrastados

`read` compara el contexto completo observado antes/después de obtener la vista de revisión; congela el contexto esperado al entrar. Una respuesta404 de revisión no se transforma en ausencia de la tarea sin comprobar después que el contexto sigue siendo el esperado. Se comparan las identidades con contextKey123 y la instalación/ID/fecha con la vista166.

`save` captura contexto/vista/patch al entrar, valida y comprueba contexto antes del intento. Reutiliza la revisión original; no la renueva mediante otro GET. Conserva changed/unchanged/current/conflict y los rechazos del cliente166. Los fallos previos al intento no se convierten en resultado incierto; perder el acuse tras intentar el envío sigue siendo uncertain. Señal cancelada en la comprobación previa impidePATCH; cancelarla después de despacho no deshace un efecto.

`verify` compara mediante lecturas contra el contexto original. Reutiliza judgeAfterUncertain123 y no llama a save. Valores coincidentes no prueban autoría ni recuperan el acuse; devuelve también la vista observada para que un consumidor posterior pueda tomar una decisión explícita.

El handoff conserva revisión nueva/no-op y exige una futura unidad de contrato después de170/U2aceptadas. Esta aprobación no autoriza editar las reservas de Claude ni convertir unchanged en un savedlegacy que invente otra escritura.

## Evidencia repetida por este revisor

- **57/57 Node en una pasada**,14nuevas de183 +21cliente123 +11lógica123 +11cliente166. `tests/.tmp/review184-node.log`. Nuevas con createBaseApp/Store reales por inject y barreras; las relacionadas incluyen HTTPloopback nativo. No se presenta inject como prueba de navegador o proveedor.
- **Tipos focales:0errores** sobre módulo y prueba183, ES2023/DOM/Bundler/strict.
- Cuatro hashes coinciden inmediatamente antes del dictamen, guardados en `tests/.tmp/review184-submitted.json`.
- No se repitieron los cuatro mutantes del autor, su primer corte con errores de tipos, npmtest ni interfaz. No se editaron las cuatro rutas183.

```powershell
$env:NODE_ENV='test'
node --import tsx --test tests/task-revision-context-client.test.ts tests/local-task-focus-client.test.ts tests/local-task-focus.test.ts tests/task-revision-client.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2023 --lib ES2023,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node src/task-revision-context-client.ts tests/task-revision-context-client.test.ts
```

Las pruebas HTTP se ejecutaron con permiso de loopback, sin proveedores, perfiles, credenciales reales o datos instalados.

## Límite de concurrencia, confirmado y declarado

Se repitió la contraprueba del autor: cambiar solo generation.generatedAt después de comprobar contexto y antes delPATCH puede devolver changed, mientras cambiar la cuenta en el snapshot produce conflict. Verificar después contra el contexto original devuelve context-changed en ambos casos. No son observaciones antes/después equivalentes a una condición atómica sobre todo TaskContext; tampoco detectan necesariamente A→B→A entre muestras. El token128 conserva su propio fingerprint de este corte y solo un escritor cooperativo.

No se oculta este límite ni se acepta183 como solución del CAS sobre todos los metadatos. Una ampliación del fingerprint será otra unidad, con baseline causal y cambios de pruebas/documentación bajo reserva; las fuentes183presentadas no se cambian mientras se revisan. La preview181 compilada tampoco cambia automáticamente por aceptar una fuente.

## Aclaración para la integración: efecto heredado de401

El módulo no añade dispatchers propios, pero **readContext123 sí emite `planb:locked` al recibir401 en navegador** (`src/local-task-focus-client.ts:66`). Por tanto, que el puente no dispare notificaciones «por su cuenta» no significa que sea una operación sin efectos de sesión cuando se ejecuta en la App.

Sonda propia completamente sintética:window.dispatchEvent instrumentado, health200 y estado401, `client.read` devuelve failed/status401 y se observa exactamente un evento planb:locked. Script `tests/.tmp/review184-effects.mjs`, log `review184-effects.log`. No se usó DOM real y el objeto window original se restaura en finally. Se documenta un efecto de su dependencia aceptada, no un nuevo defecto bloqueante de183. El adaptador debe contemplarlo junto al dueño de sesión y al orden de autenticación158.

## Huellas aceptadas

| Archivo | SHA-256 |
| --- | --- |
| src/task-revision-context-client.ts | c0535a77afcbe17af938970f00dcc0385f8c6033e1a4eef769e0fa90580c70ec |
| tests/task-revision-context-client.test.ts | d094ad8b403b62bbfecb54564f9dbb349651b9ce986922673fdd08aac6c102be |
| coordination/reports/CODEX-TASK-REVISION-CONTEXT-183.md | d804911aab289eeba2bb3c8ea2d965b03fd7ccba0ecd57f61e65b8dbbe37d5f8 |
| coordination/plans/TASK-REVISION-CONTEXT-183-HANDOFF.md | a495ff29d838bb352aa3cb5df9bf67a25a2edc316de70b7e0ba36ead2b4ae84e |

Sin montajesUI, estrategia136, cambios de170/U2, proveedores o demo181. Próximo:mantener revisiones de Claude separadas y, si se amplía el token, exigir la nueva reserva y su verificación independiente.
