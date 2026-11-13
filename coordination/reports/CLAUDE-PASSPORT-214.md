# CLAUDE-PASSPORT-214 · Pasaporte de continuidad (informe de entrega)

5/11/2026, Europe/Madrid. Modelo, componente, exportación y pruebas; **sin consumidor montado todavía** (ver `coordination/plans/PASSPORT-214-HANDOFF.md`). Sin llamadas externas: la evidencia de copia procede del servicio REAL de continuidad (`createBaseApp` + `registerContinuityEvidenceApi`, datos ficticios); las otras entradas son contratos construidos a mano.

## Qué entrega
Una hoja corta que contesta: ¿de qué copia dispongo?, ¿qué lectura del CRM se comprobó y cuándo?, ¿qué trabajo local queda pendiente?, ¿qué se ensayó al exportar y recuperar? y ¿qué no se ha demostrado? Cada afirmación lleva **base** (observado / declarado / sin comprobar / no aplica), **vigencia** (vigente / caducado / desconocida), **alcance**, **origen**, **instante** y **contexto**. Primer dato visible por pregunta y el resto plegado; «próximo paso» = primera carencia con acción disponible; procedencia y exportación manual (HTML/JSON) plegadas.

## Garantías y pruebas
| Garantía | Prueba |
| --- | --- |
| Datos ausentes ⇒ «sin comprobar» (desconocido ≠ cero); trabajo no legible ≠ ninguno | Node: sin fuentes; `unavailable`; `counts: null`; ceros leídos = «Ningún … en el momento de la lectura» |
| Lectura guardada ≠ comprobada; fresca observada por objeto; parcial dice qué no se leyó; caducada conserva fecha y alcance; otra configuración = historia; producción no autorizada no ofrece acción | Node con la forma del contrato 212 |
| Registro de exportación e informes técnicos = **declarados**, con «no se examinaron los bytes» y «su duración no mide recuperación» | Node con registro presente y no coincidente |
| Ensayo de relevo observado con su alcance; **otra captura** se separa (`mixedContexts`), se marca caducada y no acredita la actual | Node + DOM |
| Próximo paso: orden estable de carencias | Node |
| Exportación JSON por lista blanca (claves exactas, versión, procedencia, determinista); texto hostil con rutas y claves no sale | Node + descarga real en el navegador |
| Exportación HTML: escapada, sin scripts, sin recursos externos, CSP restrictiva | Node + descarga real |
| Fechas no válidas/reloj no finito no rompen ni se inventan; IDs de afirmación estables | Node |
| Presentación: preguntas, botón solo si hay acción, chip «caducado», textos largos y hostiles como texto, 1440/390/320 sin desbordamiento, controles ≥ 44 px en móvil, teclado (Tab/Enter en plegables y en el próximo paso) | render de servidor + DOM |

## Resultados
- `node --import tsx --test tests/continuity-passport.test.ts`: **11/11**.
- DOM Chromium (`tests/e2e/continuity-passport.spec.ts`): **7/7** (hoja completa, datos ausentes, contenido hostil, móvil 390 y 320, exportación con descarga real, copias distintas).
- `tsc --noEmit -p tsconfig.json`: exit 0.
- **Control causal con 7 mutantes** sobre el modelo (restaurado con el mismo hash tras cada uno): trabajo no legible leído como cero ⇒ falla; caducada como vigente ⇒ fallan 2; sin `safeText` ⇒ falla la exportación JSON; HTML sin escapar ⇒ falla; próximo paso que ignora el consentimiento ⇒ falla; ensayo de otra captura como vigente ⇒ falla; registro de exportación como «observado» ⇒ falla (un primer intento **no** lo detectaba porque la evidencia real no traía registro de exportación; se añadió una prueba con registro presente).
- Capturas abiertas e inspeccionadas: `passport-1440`, `passport-390`, `passport-320` (`tests/.tmp/pp214-final2/`).

Incidencias propias durante la unidad: dos secuencias de escape del shell dejaron una expresión regular dañada (`\b` convertido en carácter de control y una clase de caracteres mal escrita) y la prueba de exportación lo detectó; se corrigió y quedó cubierto por la prueba de rutas/claves. La primera versión ponía la credencial guardada como primer dato de la pregunta de lectura, ocultando la comprobación caducada: se reordenó para que lo comprobado vaya primero.

## Límites
- Sin consumidor montado; la entrada `work` usa una interfaz mínima acordada con la otra sesión (provisional hasta que se acepte 208) y `relay` un contrato propio para la unidad del Kit.
- Entradas de contratos aceptados se probaron con la forma real de la evidencia de continuidad; la forma de 212 está sujeta a su revisión (R2 pendiente).
- No acredita recuperación, otro equipo, tiempos ni autoría; el texto de producto puede cambiar.

## R2 (5/11/2026) · respuesta al dictamen independiente
Se reprodujeron primero las dos sondas de `tests/.tmp/p223-e7fa8be5/s/tests/independent-passport223.test.ts` (fallan con la fuente presentada) y se corrigió:
- **F1 · vigencia efectiva.** `readWindow(hs, now)` (exportada) deriva la vigencia de `evidence.checkedAt`/`freshUntil` y del reloj `now` al generar la hoja, con la misma regla que 212 (`now <= freshUntil`). Ya no se reutiliza el `view.fresh` calculado al recibir la respuesta. Reloj no finito, `freshUntil` inválido o ventana invertida = `unknown` (nunca «vigente»); una caducidad ya observada no se revierte con un reloj retrasado. Conserva fecha y alcance al caducar; afirmación, próximo paso, lo no demostrado, JSON y HTML son coherentes.
- **`checking` aparte.** Una comprobación en curso (`running` o `view.state === 'checking'`) añade una afirmación propia («No es una caducidad», vigencia desconocida), no altera la vigencia de la observación anterior y el próximo paso pasa a «Ver la comprobación en curso» (no ofrece iniciar otra).
- **F2 · ensayo sin captura.** Tres casos distintos: mismo contexto (vigente), otro contexto (caducado para esta copia) y contexto desconocido (`unknown`, con la frase «No identifica con qué copia se ensayó: no acredita la copia actual»). Solo un ensayo completado con la captura exacta de la copia cierra el paso «Ensayar un relevo»; la razón del paso explica que el último ensayo no está ligado a esta copia. Un contexto desconocido no inventa una segunda copia (`mixedContexts` sigue en false).
- La aserción que terminaba en `|| true` es ahora `assert.equal(..., 'open-export', ...)`.

Pruebas: Node **14/14** (11 previas + 3 de R2), DOM **7/7**, `tsc --noEmit` global sin errores. **Control causal:** 6 mutantes de la fuente (vigencia tomada del booleano, reloj inválido vigente, caducidad que se revierte, `checking` ignorado, ensayo sin captura que cierra la carencia, contexto desconocido vigente) fallan todos; restauración verificada por hash. La reproducción independiente de F1/F2 queda cubierta por `R2·F1` y `R2·F2` del archivo de pruebas.

**Criterio de montaje:** el consumidor debe volver a llamar a `buildPassport` con un `now` actualizado (temporizador local o al recuperar visibilidad) sin repetir peticiones al proveedor; la vigencia mostrada ya no depende del instante de recepción.

## R3 (5/11/2026) · completar el ensayo ficticio ≠ acreditar la copia activa
Reproducida la sonda `passport-relay-real-contract.test.ts` (fallaba: el paso «Ensayar un relevo» no podía resolverse nunca con el adaptador de 216, que da `captureId: null` por diseño).
- **Discriminante de procedencia acordado con 216:** `RelayRehearsalRecord.scope?: 'fiction'`. `toPassportRecord` (216) lo fija; ausente = alcance desconocido y **no se deduce de ningún texto** (`included` que diga «ficticios» sin `scope` no cierra nada). La captura activa nunca se asigna a la ficción.
- **Cierre del paso:** «Ensayar un relevo con datos ficticios» se satisface con un ensayo **completado** de procedencia ficticia o con uno completado de la **captura exacta** de la copia. Sin resultado, fallido/interrumpido, alcance desconocido o de otra captura siguen pidiéndolo, cada uno con su razón.
- **La falta de prueba sobre la copia activa sigue visible** en afirmaciones («Se practicó con datos ficticios: demuestra que el recorrido funciona, pero no acredita la copia actual ni que tu copia activa se recupere»), en «¿Qué no se ha demostrado?» («Que ESTA copia activa se recupere completa en un destino nuevo…») y en el JSON/HTML.
- Pruebas: Node **15/15** (R3 cubre sin resultado, fallido, interrumpido, fiction completada con el adaptador real, alcance desconocido, texto engañoso, misma captura, otra captura y carencia previa de exportación), DOM **7/7**, `tsc` limpio; las sondas independientes R2 (2) y R3 (1) pasan sin modificar sus aserciones. Mutantes R3: 4 detectados (ficción que no cierra, alcance desconocido que cierra, sin carencia de copia activa, sin aviso de ficción); restauración por hash.
- Criterio de montaje: el consumidor usa `toPassportRecord` (no inventa `scope`) y no asigna el contexto de la captura activa al registro ficticio al construir el mapa de impacto (**el hub 217 lo hacía; se corrige al devolverse 217**).

## Hashes finales (sha256)
| Ruta | sha256 |
| --- | --- |
| shared/continuity-passport.ts | 9b22877f0c1589ebfc071f35dd0c3e8963e1d44848575e5dbc9caf8898c50870 |
| src/ContinuityPassport.tsx | b1598329030f38aca302ff362e7e70791360bed2ac160163a5ae729c53622b41 |
| src/continuity-passport.css | 33b5f1bfbef99fba814759ede239fdda22a5cc5e7827ce14668048c6a93c9bfc |
| tests/continuity-passport.test.ts | 2ac2ffb0130c8efddd8dac041671d81af01dddea9314562bf9376ceb6e119965 |
| tests/e2e/continuity-passport.spec.ts | 92272096bfd6c6b5eaa30804ea91a9ba2d53ea6ca719a2b9f263de20aec7dbbd |
| coordination/plans/PASSPORT-214-HANDOFF.md | (traspaso; hash al presentar) |
| coordination/reports/CLAUDE-PASSPORT-214.md | (este informe; hash al presentar) |
Procesos propios: servidores de prueba, el servidor estático del arnés y los navegadores se cerraron con cada ejecución.
