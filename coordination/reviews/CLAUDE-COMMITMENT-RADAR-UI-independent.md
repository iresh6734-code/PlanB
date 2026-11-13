# Radar UI · Dictamen independiente, devolución R2

8/11/2026, Europe/Madrid. Autor revisado: Claude A. Revisor: este chat Codex. **No aceptada todavía.** Se reproducen dos problemas de aplicación de respuestas tardías dentro del componente. No se observaron escrituras de una decisión en el compromiso equivocado ni se afirma una evasión de autenticación.

## Corte y resultados

Cinco huellas de la presentación cotejadas antes/después: componente `b12ea32fd5a8f99db4f892a0e0908852354c1d013f41e3f9c8c115faaa549299`, cliente `be83e8db42c04a77d8b7ced34624d9eaf745ba0ba1f8acfe15e6707701ea7a5d`, CSS `a515c8995155f60fa6a937fc5c22f2203f94adaa0c45230ea109203368059bd8`, E2E autora `579d0e82837907eba3a4e000d146e067130f09d3de067da2ba39348a94b4a2fc`, informe `b710e540d4d89fd766fc6e807eef72a9ecd4d0a6f69d3f50476421753ed0d251`.

Se congelaron UI base 288, CORE aceptada, fuente ficticia aceptada, cinco rutas de esta presentación y arnés aceptado. CORE quedó privada antes de comenzar su cambio separado 291. La normalización del arnés estaba working; se reconstruyeron exclusivamente sus terminaciones CRLF en una copia y se comprobó su hash aceptado exacto `f137dec8ca17614c7cbe36f28be2b444efec3edd7fadae9c2f120a4bd42b33f9`. No se editó ni adoptó la normalización en curso.

Banco `tests/.tmp/radar-ui-independent-Ak1H0b`: **15/15 casos de la autora pasan**, un control propio pasa y dos sondas propias fallan por las causas siguientes. Tipos focales exit 0; sin reintentos ni omisiones; 219,95 s en total. Las tres sondas están en `tests/e2e/independent-commitment-radar.spec.ts`.

Repetición solo de esas sondas, con diagnósticos de efectos y llegada explícita de respuesta: `tests/.tmp/radar-ui-independent-9geByp`, **1 control pasa / 2 regresiones fallan**, tipos 0, 92,73 s. Script `tests/.tmp/review-radar-ui.cjs --probes`. Se conservaron las preparaciones detenidas por hash de arnés en normalización y por CORE en cambio 291; no llegaron a ejecutar pruebas ni se contabilizan como fallos de producto. Para repetir se usó CORE aceptada de la primera copia.

Ambos bancos usan React de producción, APIs CORE reales, SQLite de archivo y ficción, navegador aislado, red externa bloqueada y puertos propios. No usan la App principal ni 4601. CIM final limitado a ambas raíces no encontró procesos vivos.

## F1 · Media · Acuse de A modifica el formulario visible de B

Ubicación: `src/CommitmentRadar.tsx`, función send, especialmente limpieza de estado y mensaje tras await (líneas 122–141 de este corte).

Reproducción: preparar un borrador en B (`delivery-healthy`), cerrar; abrir A (`installation-north`), enviar su decisión y retener la respuesta 200 DESPUÉS de aplicarla; cerrar A y abrir B. Antes de liberar el acuse, B conserva correctamente su borrador. Al liberar A y esperar el fin del guardado, B pierde el responsable visible y muestra «Asignación guardada».

Diagnóstico real `late-a-while-b.json`: A tiene un evento, B tiene cero; el único POST es de A, el campo visible de B queda vacío y su aviso visible dice Asignación guardada. La captura `late-a-while-b.png` se abrió e inspeccionó: el título y resumen son de B sin asignación, junto al aviso de éxito de A.

El control sin otro guardado conserva el borrador de B al cerrar/reabrir. La causa es que send comprueba pin y vida del componente, pero aplica setDraftState/setDone y lectura de detalle como si siguiera abierta A. No se afirma pérdida irreversible: el mapa interno no elimina la entrada de B al borrar la de A. El fallo confirmado es pérdida del formulario visible y atribución incorrecta del resultado; una edición posterior puede reemplazar el borrador almacenado.

Corrección exigida: ligar resultados, errores, revisión y estados de envío al intento y compromiso originarios. Una respuesta de A puede actualizar su estado y la lista del mismo propietario, pero no el formulario, mensaje, carga o incertidumbre de B. Auditar también rechazo, verificación y finally; no basta esconder el texto de éxito. Conservar el acuse si existe y no reenviar para reparar el problema.

## F2 · Media en el contrato del componente · El bloqueo no invalida una mutación pendiente

Ubicación: wipe/evento planb:locked y guardas de send/finally en el mismo archivo.

Reproducción: enviar A y retener su respuesta 200 ya aplicada. Emitir planb:locked: se retiran correctamente ficha y lista. Liberar después el acuse, esperar su respuesta HTTP real, 500 ms y dos cuadros de render. El diagnóstico `late-after-lock.json` observa **dos GET nuevos y seis elementos visibles de nuevo**, a raíz de aquel acuse. La respuesta sigue pasando la guarda porque pin y alive no cambiaron; wipe no revocó la generación de mutación.

Alcance: el evento se emite en el arnés con la cookie aún válida; no es un bloqueo HTTP real ni una prueba de que App ignore su desmontaje al bloquear. No se ha demostrado fuga contra una sesión revocada. Sí falla la promesa del componente de quedar retirado tras el evento: una respuesta previa vuelve a poblarlo. CORE conserva sus controles de autorización.

Corrección exigida: invalidar las mutaciones pendientes al retirar propietario por bloqueo o cambio de identidad. Un resultado tardío no debe iniciar lecturas, repoblar datos ni limpiar el indicador de un intento posterior. Mantener honestidad sobre una decisión ya aplicada: retirar la vista no deshace su efecto.

## Entrega R2 y límites

Devolver esta unidad a working conservando sus cinco rutas. La autora añade regresiones propias y presenta hashes nuevos; las sondas independientes no se alteran para conseguir verde. Repetir los 15 casos y las tres sondas, revisar rechazo/verificación además de éxito y conservar pruebas de cierre de ficha, contexto y acuse perdido. No habilitar SCENARIOS mientras UI siga sin aceptar.

No se ha aplicado una corrección privada de producto ni modificado fuentes de Claude. El dictamen no requiere cambios en main/App ni en CORE 291. Los endpoints, escenarios y motores aceptados siguen aceptados. UI continúa pendiente de montaje central aun después de corregirse. No se ejecutó npm test completo ni se usaron proveedores reales.

La propuesta A4 se leyó como propuesta: su settle declarado por el cliente no basta para acreditar server-ack; un 201 perdido exige incertidumbre y la aceptación de lectura necesita coherencia entre evidencia y versión. Ese contrato se resolverá en su unidad propia, no se incorpora como una API acordada por este dictamen.
