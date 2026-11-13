# Revisión Codex de CLAUDE-RESCUE-106 · R1 / devolución R2

Fecha: 2/11/2026, Europe/Madrid. Encargo propio: CODEX-RESCUE-REVIEW-113. **Dictamen: solicitar correcciones; no aceptar ni integrar106.** Las24 reservas siguen perteneciendo a su autora. No se ha editado ninguna de esas rutas.

El recorrido ordinario funciona en el corte ensayado: repetí60/60 pruebas Node del autor y7/7 E2E, incluidos dos cierres forzados y reanudaciones. Sin embargo, diez pruebas independientes dan3 controles favorables y7 fallos de producto; dos pruebas adicionales de navegador reproducen dos de esos fallos. No son fallos ocultados con TODO ni un resultado global verde. Los agrupo en cinco hallazgos para su corrección.

## Hallazgos y cambios solicitados

### F1 · P2 · Un acuse terminado se devuelve antes de validar el contexto

`server/rescue-room-journal.ts:56–65`: la huella incluye ruta/contenido, pero el camino `prior.status === 'done'` retorna antes de `sameContext`. Tras un POST plan válido, repetir su clave y contenido cambiando workspaceId, accountId, captureId o captureRevision devuelve200/saved/replayed en los cuatro casos; esperaba409. Las tablas no cambian. El problema es acreditar una operación bajo un sobre de otro contexto; no he demostrado acceso a otro servidor ni un fallo multiusuario de autorización.

Reproducción: prueba «contexto: un acuse ya guardado…» en `tests/independent-rescue-contracts.test.ts`. Control: repetir exactamente el sobre original devuelve su acuse, sin otra versión, evento o cambio.

R2: validar la identidad completa antes de confirmar cualquier acuse, nuevo o repetido. Mantener el reintento legítimo aunque su expectedVersion ya sea antigua. Conservar una vinculación duradera entre intención, contexto y efecto; no resolverlo cambiando todas las claves o deshabilitando replay. Añadir los negativos de cada campo y el positivo de repetición válida.

### F2 · P2 · Recuperar una creación por contenido puede atribuir a A el registro de B

`server/rescue-room.ts:261–269`: el reintento busca cualquier cambio posterior a baseChangeId con valores coincidentes, sin identidad de intención.

Reproducción por la API real: intercepto únicamente saveRecord de mi fixture para lanzar un error **antes** del efecto de A. A queda started/OUTCOME_UNKNOWN, con cero cambios. Cierro/reabro mi sala; B, con otra clave, crea una tarea de valores idénticos. Reintentar A confirma saved/recovered con el ID de B. Hay un registro creado y dos hechos local-create atribuidos a intenciones distintas. No se produjo una segunda creación: el fallo es la falsa atribución/confirmación, no un duplicado observado en este caso.

Control: un error **después** del efecto de A, sin B, recupera el ID propio tras reabrir, con un solo registro y un solo hecho local-create. Ambas pruebas usan una sala real nueva y persistencia real; la interrupción se instrumenta determinísticamente, no se describe como una caída física de Windows.

R2: establecer una identidad de efecto atribuible a la intención antes de la ventana incierta, y persistir/conciliar esa identidad. No inferir identidad por igualdad de contenido y orden temporal. Si no puede atribuirse, devolver incertidumbre/conflicto sin apropiarse de B. Revisar el patrón análogo de edit (`:249`), aunque esta revisión solo demuestra el caso create. Mantener recuperación después del efecto y no duplicación. Añadir regresiones antes/después del efecto y con una operación idéntica intercalada.

### F3 · P2 · Una escritura normal puede guardar éxito y dejar inválido el diario

`shared/rescue-room.ts` limita JournalSchema a5000 hechos. `server/rescue-room-journal.ts:78–82` valida eventos individuales y estado, pero persiste el diario ampliado sin validar su límite.

Preparo un fixture de5000 hechos que pasa JournalSchema e inspect, con versión5000. Un POST note válido devuelve200/saved, escribe5001 y la lectura siguiente queda corrupt; la sala/informe se bloquean. Es una frontera estructural válida preparada por el test para evitar5000 operaciones lentas. No es una prueba de resistencia a manipulación, ni digo que recorrí5000 acciones de UI.

R2: definir una política de capacidad comprobada **antes de producir efectos** y validar el diario nuevo antes de publicarlo. Rechazo controlado o un formato nuevo explícito y comprobable; no truncar hechos, subir una cifra sin política ni bloquear replay ya confirmado. Validar también el caso con efectos CRM/locales para que un error tardío de JournalSchema no deje un efecto sin recibo. Conservar estado/diario y un diagnóstico claro al alcanzar el límite.

### F4 · P2 · El cliente acepta estructuras incompletas y confunde caracteres con bytes

`src/rescue-room-client.ts:16–23,38–54` comprueba unas pocas cabeceras, luego convierte por cast:

- Un estado200 con roomId/blocked/version/stage/context plausibles, pero sin capture/queue/journal, se acepta. En Chromium compilado, una respuesta interceptada así deja body vacío, sin alerta, con `Cannot read properties of undefined (reading 'name')` al renderizar `src/RescueRoom.tsx:95`.
- Un acuse `{ok:true,outcome:'saved',version:2}` sin replayed/result se acepta, igual que una versión negativa. En DOM, interceptar solo la respuesta POST create incompleta produce «Tarea creada en la copia local.» y vacía el asunto, mientras el servidor real conserva0 cambios y versión1. La petición interceptada no llegó al servidor; esta es una prueba de fallo de transporte/protocolo, no evidencia de que el servidor actual produzca ese JSON durante el recorrido normal.
- Sin Content-Length, un cuerpo con700000 caracteres multibyte, más de2000000 bytes UTF8 y menos de2000000 unidades UTF16, se acepta. Además, response.text() acumula todo antes de verificar. No he ensayado un flujo infinito ni medido agotamiento de memoria.

R2: validar contratos completos de estado bloqueado/no bloqueado y acuse, números finitos/enteros/rangos y el resultado requerido por cada acción antes de confirmar o borrar borradores. Dar error visible y conservar intención/borrador cuando no hay confirmación válida. Aplicar la cota al contenido realmente recibido en bytes, con lectura acotada y cancelación, también sin Content-Length. Mantener los positivos de estado/acuse completos y los descartes de lectura tardía existentes; comprobar el build con su CSP, no solo tipos. Revisar las otras respuestas convertidas por cast sin afirmar que aquí se hayan reproducido todos sus posibles fallos.

### F5 · P1 · Un segundo arranque rechazado altera el envío del dueño activo

`scripts/demo-rescue-room.ts:26–27` llama RescueRoom.open **antes** de lockInstance. Abrir Store/Recovery puede recuperar operaciones sending como inciertas; el rechazo del segundo escritor llega después.

Reproducción determinista: sala nueva y bloqueo propio de PID vivo, retorno aprobado con una actualización real del simulador retenida por una promesa. Mientras el dueño sigue en apply, su estado es applying/sending. Llamar startDemo con --resume a esa misma carpeta rechaza «ya está abierto», pero entretanto el plan persistido cambia a partial/uncertain. El hash de meta cambia; las otras seis tablas comparadas permanecen iguales. Después libero y espero el envío del dueño. No se inició un segundo listener ni se inspeccionó/mató un proceso ajeno. El PID del dueño es el del propio test, con apply realmente pendiente; no es solo una etiqueta sending fabricada.

R2: adquirir el bloqueo antes de abrir un almacén existente o ejecutar cualquier recuperación/escritura. Si la apertura o creación del servidor falla, cerrar los recursos ya creados y liberar exclusivamente el bloqueo adquirido. Añadir regresión con dueño vivo y envío retenido, arranque ordinario nuevo, reanudación legítima tras terminar/morir el dueño y fallo de apertura/escucha. No tocar server/instance.ts, que está fuera de106, para evitar la guarda. El fallo puede afectar la coordinación de una devolución simulada; no lo presento como daño ya ocurrido en el piloto instalado.

## Sensibilidad y alcance causal

En una copia privada del mismo corte inserté tres guardas experimentales: contexto antes del replay, rechazo al alcanzar la capacidad antes de work y bloqueo antes de abrir en resume. Sin cambiar las aserciones, los tres casos F1/F3/F5 pasan3/3; antes fallaban3/3 por los valores descritos. F5 conserva applying/sending y F3 conserva5000/integrity ok con409. Los cambios y hashes están en causal.json/changes.json. Son una localización causal, **no una solución de producto completa**: no se probaron todas las rutas/limpiezas o capacidades con esas guardas, no se presentó un parche de106 y no se integraron.

F2 tiene controles contrapuestos antes/después del efecto; F4 contrasta estructuras completas reales con respuestas incompletas/multibyte y confirma dos efectos en DOM. No son11 mutaciones nuevas ni una repetición de los13 mutantes declarados por Claude. No he repetido esa matriz del autor.

## Comprobaciones propias

| Comprobación | Resultado observado |
| --- | --- |
|24 archivos106 y cuatro archivos del corte055 | Hashes de submit actuales coincidentes antes/después; fuente congelada por ruta |
|Seis suites Node106 |60/60 pass,0 fail/skip/TODO |
|Diez regresiones/controles113 |3 pass,7 fail,0 cancel/skip/TODO; fallos de aserción de producto |
|Typecheck final de nueve entradas e imports | Limpio |
|Build Vite aislado | Correcto; tres artefactos con hashes registrados |
|E2E106 sobre ese build |7/7,0 inesperados/skip/flaky; dos muertes y reanudaciones propias |
|Dos E2E negativos propios sobre el mismo build |0 pass,2 fail por las aserciones de protocolo; DOM/JSON/screenshots/trazas guardados |
|Guardas causales privadas F1/F3/F5 |3/3,0 fail/skip/TODO; no código de producto |

El primer typecheck de mi arnés falló por usar InstanceType con el constructor privado de RescueRoom. Lo corregí solo en mi prueba a ReturnType<typeof RescueRoom.create>. No cambió ninguna aserción ni fuente106. El corte inicial de nueve pruebas (3/6) y su error de tipos se conservan; no se cuentan como nueve casos adicionales al corte final de diez.

## Navegador e inspección visual

Flujo: `/` → plan/estimaciones → revisión y guardado local → reinicio → retorno con conflicto → acuse perdido → conciliación sin segunda alta → informe/cierre. Se repitió el spec del autor sin editarlo y se inspeccionaron capturas propias1440,320 y cerrado1440. El E2E también ejercita390, teclado y varios controles de44px. La tabla tiene desplazamiento horizontal interno en320; no se interpreta el recorte visible de sus columnas como que faltan datos. No hice auditoría de contraste, lector de pantalla o todos los controles.

Browser plugin not available; se usó la CLI Playwright del repositorio y Chromium headless ya instalado, con contextos nuevos, sin perfiles del usuario. Servidores positivos propios4521–4526; protocolo negativo4571; el intento rechazado F5 no llega a escuchar4579. No se tocaron4511 del autor,4515,4420/4421 ni4331/4334. Los procesos de los E2E se cerraron mediante sus handles propios; no se acredita disponibilidad actual de las demos antiguas.

| Control UI | Resultado |
| --- | --- |
|Identidad/contenido | Sala de rescate y contenido significativo en el recorrido válido; título comprobado también en la captura negativa |
|Pantalla vacía | No en positivos; sí en F4 con estado incompleto |
|Overlay | No observado en capturas positivas del build de producción |
|Errores JS | Ningún pageerror en los recorridos positivos que lo asertan; TypeError confirmado en F4; respuestas409 intencionales no son una promesa de consola totalmente vacía |
|Interacción | Plan, edición, creación, conflicto, reinicio, conciliación y cierre observados por las aserciones repetidas |
|Visual | Capturas propias desktop/móvil/cerrado inspeccionadas; estado incompleto en blanco y falso acuse inspeccionados |

## Evidencia, ejecución y procedencia

Raíz preservada: `tests/.tmp/rescue113-536d6e57-9aae-4ecc-8f3f-6ed14e18745a`. El manifiesto inicial guarda los24 hashes completos106 y el corte055. Punteros dentro de esa carpeta:

- `author60.log`: repetición propia de las seis suites del autor.
- `final-node.json`: `final-node-5fd358e3-6e7d-4658-9eca-835fd0fef21e`, prueba final de diez y tsc.
- `browser.json`: `browser-40cd7a41-8d65-4f64-86b9-d0cec870e4fc`, build, artefactos,7 E2E y capturas.
- `negative-ui.json`: `negative-ui-8d560fb7-2ed3-4542-86fb-e5eb4ec2ecdd` dentro de browser, dos regresiones, JSON de estado/acuse, screenshots y trazas.
- `causal.json`: `causal-86e7696a-5d1a-4cc6-8749-e8a309102599`, tres guardas experimentales y log.

Se ejecutaron los helpers locales `rescue113-verify.cjs`, `rescue113-final-node.cjs`, `rescue113-browser.cjs`, `rescue113-negative-ui.cjs` y `rescue113-causal.cjs`. Comandos internos principales: Node con --require scripts/block-external.cjs, --import tsx y --test; tsc --noEmit con proyecto focal; Vite configFile:false y outDir nuevo; CLI Playwright con workers1/retries0. Sus archivos conservan argumentos/allowlist de entorno. No ejecutar a ciegas un helper que crea otro snapshot para consultar un log existente.

Datos exclusivamente ficticios en carpetas UUID nuevas; red externa bloqueada. Store puede proteger claves recién creadas mediante DPAPI del usuario **actual** de Windows incluso con NODE_ENV=test; no se afirma ausencia de DPAPI, ni se recuperaron claves/perfiles/datos del equipo original. Los guardas de limpieza de las suites se limitaron al scratch propio. Los fixtures independientes se conservan. No hubo npm run build, dist raíz, dependencia nueva, proveedor, commit, instalación o despliegue.

Fuentes clave del corte: store055 `9d08d9cc06f8c4cf…`, recovery055 `b56e5d7255d93d3e…`; journal106 `ab565398ade234ba…`, room106 `cc599f11fea8b0a0…`, CLI106 `ea725bf2357cd9cf…`, client106 `f2a009222d1035c7…`, UI106 `9b96d43e9ac5bd67…`. Los hashes completos son los del manifiesto/tablón, no solo estos prefijos.

## Coordinación y siguiente entrega

Devuelvo106 a working mediante revise, sin liberar sus24 rutas ni modificar las fuentes. La autora corrige dentro de esa reserva, presenta hashes nuevos y se repiten los controles pertinentes. No debe editar las pruebas/informe113. Si una corrección necesita otra ruta, se registra un encargo nuevo antes de ampliar.

Durante esta revisión apareció el plan documental114 de otro chat y115 pasó a working con nueve rutas nuevas sin solaparse con113/106. Es una ampliación de QA según su encargo, no una respuesta automática a estos hallazgos.116 sigue ready sin reserva y exige106/115 done: no se debe anticipar su cápsula mientras estas garantías están abiertas. QA112 permanece ready al último corte consultado. No se ha enviado este nuevo contenido mediante Claude CLI, ni se acredita comunicación con una sesión de la appClaude por escribir el tablón.

LAB036 conserva sus archivos sin que Codex se apropie de ellos; sigue sin submit/reserva activa. El usuario no identifica su sesión autora. Cero solapes de reservas registrados al consultar, con la discrepancia histórica App/SEARCH053 aún pendiente. No significa ausencia de ediciones físicas fuera del protocolo.

Para retomar, leer este dictamen y sus reproducciones, consultar el estado/hash actual de106 y separar R2 de la QA115. No aceptar106 por el recorrido60/7 favorable mientras F1–F5 permanezcan abiertos. No declarar terminado el producto, garantizado RTO o recuperación HubSpot real por este ensayo sintético.
