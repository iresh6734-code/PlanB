# Contrato170 · revisión independiente195

4/11/2026, Europe/Madrid. **Dictamen vigente R2: aceptar 170 en los cinco hashes indicados al final.** F1 está corregido y se han repetido las pruebas. El dictamen inicial de devolución y sus evidencias se conservan como historia a continuación. Codex revisor distinto de la autora; la aceptación del contrato no acepta ni monta 171.

## F1 · P2 · cierre reentrante admite un envío que el resumen omite

`src/task-save-outcome.ts:247` marca disposed y asigna summary después de recorrer operaciones. Dentro del bucle llama abort y settle;este último llama update→emit y ejecuta suscriptores síncronos mientras el gestor sigue aceptando operaciones.

Reproducción propia en `tests/.tmp/review195-reentrant.mjs`,sin red y con una estrategia sintética que cumple onDispatch:

1. Registrar task-2yretener su comprobación.
2. Suscribirse a cambios. Cuando esa operación se asienta como disposed durante el cierre, el suscriptor solicita task-3una sola vez.
3. dispose notifica antes de cerrar;submit(task-3) devuelve started. La estrategia llama onDispatch y registra un envío antes de quedar su acuse retenido.
4. dispose devuelve `{notDispatched:1,dispatched:0}`,pero task-3está in_flight/phase:sent y se ha registrado un envío.

El log `tests/.tmp/review195-reentrant.log` conserva resultado y fallo de aserción started frente refused. Se liberan ambas promesas y se espera whenIdle. Es una reproducción del contrato con un suscriptor reentrante y estrategia controlada, **no un PATCH HTTP real ni una reproducción desde la App**. No demuestra que los suscriptores actuales deReactusenese patrón. Sí muestra que el cierre público no es seguro frente a llamadas síncronas permitidas y que su resumen puede ocultar un intento.

La misma ventana merece prueba con listener deAbortSignal/reentrada a dispose,pues abort también ejecuta callbacks síncronos. La garantía de cierre debe fijarse antes de invocar abort,suscriptores u otros callbacks;el resumen debe ser coherente e idempotente incluso ante reentrada. No basta rechazar submit después de que dispose ya haya retornado.

**Corrección solicitada:**establecer el estado de cierre y un resumen estable antes de ejecutar callbacks;asentar y abortar todas las operaciones que correspondan sin abrir una ventana para nuevas altas. Verificar reentrada desde suscriptor y señal,ausencia deenvíos yrecuentoscorrectos. Mantener lo ya despachado como tal,sin cancelarlo o inventarconfirmación. Añadir regresiones bajo las rutas de170;no modificar el archivo temporal del revisor para hacer verde la entrega.

## Resultados favorables repetidos

**83/83Node**,una pasada:43gestor+7U1+11lógica123+21cliente123+1independienteanterior. `tests/.tmp/review195-node.log`. El plan inicial estimaba76;el recuento real de esas cinco suites es83y prevalece este resultado. Tipos focales de gestor/contrato/ficha ytests:0errores.

Se revisaron la puertaonDispatch,la conservación de resultados despachados,versiones de consumidor y textos cerrados. Las pruebas entregadas cubren muchas fronteras relevantes,pero no la reentrada anterior. No se repitieron DOM después de encontrar F1bloqueante,ni losmutantes/baseline de la autora o npmtest. Sus cifrasDOMsiguen atribuidas a ella.

```powershell
$env:NODE_ENV='test'
node --import tsx --test tests/task-save-outcome.test.ts tests/task-focus-outcomes.test.ts tests/local-task-focus.test.ts tests/local-task-focus-client.test.ts tests/independent-task-outcomes.test.ts
node --import tsx tests/.tmp/review195-reentrant.mjs
```

Cinco hashes presentados coinciden,guardados en `tests/.tmp/review195-submitted.json`. Principal `src/task-save-outcome.ts`: `a23e099a072b774afc7378f32b6ba653aa0edb42c280d112f92e598bb88cba10`;contrato `da79ae6d33777b60aacb876de55a91312eafcc026070adb8ccbc3645115c5956`. No se editaron esas rutas ni171.

## Traspaso y límites

El trabajo170noesun simple cambio visual:resuelve cierre,recargas yatribución importantes. La entrega sigue siendo contrato, no montaje enApp.171espera170aceptada. Un contador dispatched tras bloqueo no conserva seguimiento detallado;no se debe declarar D7cerrado frente aeseescenario. Persistencia,CASyelmontaje posterior tienen encargospropios.

El nuevo encargo197agrupa una misión de producto extensa:corregirF1,completarU2enApp yencadenar trabajo independiente sobre decisiones/conflictos sin tomar reservas ajenas. QA196esdeotroCodex;no duplicarla. Sin proveedores,credencialesreales,datosinstalados,procesosajenos odemos modificadas.

## R2 · comprobación independiente y vigilancia de 170/171

4/11/2026, alrededor de las 23:04 Europe/Madrid. El usuario avisa de un posible conflicto entre 170 y 171. Se comprobaron tanto las reservas como el contrato de integración. No se editaron fuentes ni pruebas de ninguna de las dos unidades.

**F1 corregido.** `dispose()` clasifica las operaciones y fija el resumen y el cierre antes de ejecutar cancelaciones, suscriptores o listeners de aborto. Los suscriptores reciben como máximo un aviso final, con el gestor ya cerrado. El resultado de lo ya despachado sigue registrándose sin llamar a consumidores. Se inspeccionó el código nuevo y se ejecutó **sin modificar** la sonda independiente original: `reentrantSubmission: refused`, `writes: 0`, resumen `{notDispatched: 1, dispatched: 0}`. Evidencia: `tests/.tmp/review195-r2-reentrant.log`. Sigue siendo una estrategia sintética, no una petición HTTP real.

Resultados propios sobre R2:

- **88/88 Node**, una pasada: 48 del gestor, 7 de U1, 11 de lógica de la ficha, 21 del cliente y 1 independiente anterior. Log: `tests/.tmp/review195-r2-node.log`.
- **40/40 Chromium DOM**, una pasada sin reintentos: 27 de U1 y 13 del gestor. Configuración propia `tests/.tmp/review195-r2.playwright.config.ts`; raíces nuevas `review195-r2-dom148` y `review195-r2-dom136`. Log: `tests/.tmp/review195-r2-dom.log`; resultados `tests/.tmp/review195-r2-dom-results`. Incluyen teclado, 1440/390/320 px, acuse perdido, lectura y aceptación humana, doble envío, errores y recarga fallida. Son arneses contra servidor real y datos ficticios, **no la App montada por 171**. El arnés del gestor usa su minificha; el de U1 usa `LocalTaskFocus` real.
- Tipos focales de contrato, gestor, ficha y pruebas: **exit 0**; log `tests/.tmp/review195-r2-types.log`.
- Se abrieron las capturas propias `review195-r2-dom148/shots/aceptado-320.png` y `review195-r2-dom136/shots/superficie-320.png`. No se atribuye inspección visual de todas las demás. No se repitieron mutantes de la autora ni `npm test` completo.

### Reservas y frontera de integración

La auditoría de reservas dio **cero rutas solapadas**. En el corte previo a aceptar 170, sus cinco archivos coincidían con la entrega; 171 seguía `ready`, sin reserva. `TaskOutcomesHost`, su CSS y las pruebas nuevas aún no existían. `App.tsx`, `LocalOperations.tsx` y el baseline existente se registraron con sus hashes en `tests/.tmp/review195-r2-submitted.json`. La tarea independiente 199 trabaja en sus propias siete rutas. El tablón no impide físicamente escribir desde un editor que ignore el protocolo.

Para desarrollar y revisar 171:

1. Reclamar sus nueve rutas **después** de que 170 figure `done`, y repetir `check-path` antes de escribir. Consumir el contrato aceptado; si requiere cambiar el gestor, registrar otra unidad con sus rutas exactas. No modificarlo bajo la reserva de 171.
2. Compartir la misma instancia entre ficha y superficie durante la sesión y navegación. Verificar recarga del estado padre y de Hoy por separado, sin nuevos PATCH al reintentar lecturas ni acreditación de una vista con la respuesta de un consumidor anterior.
3. **Probar desarrollo con `React.StrictMode`, además de producción.** `src/main.tsx:12` lo usa. Una instancia conservada con `useState` y un `dispose()` irreversible en la limpieza de un efecto puede quedar cerrada tras la repetición de efectos. 171 todavía no tiene implementación: esto es un requisito concreto de integración, no un defecto reproducido en su código. No retirar StrictMode para ocultarlo.
4. Probar bloqueo/desbloqueo, navegación con recarga en vuelo, cambio de copia y respuesta tardía. Conservar la distinción entre resumen `dispatched` y seguimiento detallado: el contrato no persiste intentos y el contador tras bloqueo no cierra por sí solo ese escenario de D7.

Estos puntos se comunicaron al otro chat Codex autorizado (`01a1896e-06ff-7690-9644-4f6de90c2826`). El envío fue aceptado por la herramienta; no se afirma comunicación directa con las sesiones Claude. El propietario de `CONTEXTO-PROYECTO.md` sigue siendo CODEX-LAB-035: recibe el resultado para actualizar la memoria bajo su reserva.

### Hashes R2 revisados

| Archivo | SHA-256 |
| --- | --- |
| shared/task-save-outcome.ts | da79ae6d33777b60aacb876de55a91312eafcc026070adb8ccbc3645115c5956 |
| src/task-save-outcome.ts | d2aaed72add5ed8c5dcf5d804009c280010ecb861ad25c5f7e9077bcbf1634ca |
| tests/task-save-outcome.test.ts | 75ac140f3c3d0838f11a542a8b64460b65d41bb04f69d1cced1a7cc4d7e7f60e |
| tests/task-focus-outcomes.test.ts | 41292fd47c68377f3af057f62a4a19651907edeb99a303afe5b84b4e6155da72 |
| coordination/reports/CLAUDE-TASK-OUTCOMES-CONTRACT-170.md | 571d608f9428ded484705b3bf18c17333df3e6d6935fad3451a4ff93518b0244 |

**Dictamen:** aceptar estos cinco hashes de 170 R2. 171 queda habilitada para solicitar su propia reserva; aún no está implementada ni aceptada por esta revisión. Mantener las comprobaciones anteriores al montarla.
