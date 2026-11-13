# CLAUDE-HS-READ-CLI-173 · Script de comprobación real de lectura de HubSpot (informe de entrega)

4/11/2026, Europe/Madrid. **No se ha hecho ninguna llamada real a HubSpot; este encargo no la autoriza.** Los archivos de plan e informe llevan «172» porque se reservaron con la primera inscripción (CLAUDE-HS-READ-CLI-172, bloqueada y sustituida por 173: declaré por error 160 en revisión como dependencia dura de arranque, cuando solo se lee su código; la aceptación de 173 debe seguir exigiendo 160 aceptada).

## 1. Estado del tablón verificado (rev. 1056)
- `CODEX-TASK-REVISION-MOUNT-160`: **done** (aceptada). No guarda relación con mi `CLAUDE-HS-READ-160` (comparten número por azar): esta sigue en **review** con los mismos 5 hashes presentados; no se editó.
- `CLAUDE-RESCUE-KIT-116`: **review** (R4 presentada, a la espera de Codex). `CLAUDE-RESCUE-KIT-QA-136`: **review**. `CLAUDE-TASK-UNCERTAINTY-136` (gestor de tareas): **done**, otro flujo. No se tocaron.

## 2. Valor
Cuando el usuario aporte el portal de ensayo y su autorización, podrá comprobar con una orden y sin tocar la App si la credencial guardada **da hoy** acceso de lectura, con un resultado claro por objeto, sin riesgo de escritura, de reintentos ni de filtrar la credencial.

## 3. Qué es real, simulado y sin comprobar
- **Real (código):** `scripts/hubspot-read-check.ts` y `server/hubspot-read-check-transport.ts`; reutilizan `checkHubspotRead` sin duplicarlo.
- **Simulado:** las 12 pruebas usan un servidor HTTP local, fetch simulado y un subproceso con la red externa bloqueada.
- **Sin comprobar:** cualquier respuesta real de HubSpot. Pendiente: ID del portal de ensayo + autorización expresa de las cinco lecturas.

## 4. Auditoría del módulo antes de prometer garantías
`checkHubspotRead` cumple: solo GET (`readonlyFetch`), sin reintentos, sin redirecciones, parada tras identidad/tipo de cuenta, máx. 5 GET, plazo por petición, sin secretos. **Le falta un tope de bytes por respuesta.** No lo edité (160 en revisión): el transporte protegido del script lo impone (64 KiB; el exceso queda como prefijo de JSON ⇒ «respuesta no válida»). Defensa en profundidad: ese mismo transporte vuelve a imponer presupuesto, rutas, método, consulta y cabeceras. Detalle en el runbook.

## 5. Pruebas (`tests/hubspot-read-check-cli.test.ts`, 12) — todas sintéticas
Uso/entrada estándar sin peticiones · éxito con 5 GET exactos y lista blanca de campos · portal distinto y cuenta no admitida (1 petición, sin mostrar el otro portal) · 401/403/500/429 (1 petición, sin reintento) · permisos parciales y 401 a mitad · timeout · respuesta inválida/cortada/fallo de red con la credencial dentro del error · tope de lectura · redirección · transporte (16 bloqueos por motivo, repetición, sexta petición) · subproceso con red bloqueada.
Resultado: **12/12**; las 14 de 160 siguen **14/14**; `tsc --noEmit` de todo el proyecto: exit 0.
Control causal con mutantes: sin `--authorized-reads` (fallan 2) · repetición permitida (falla 1, tras añadir su caso) · sin tope de bytes (falla 1) · argumento repetido en el error (falla 1) · POST permitido (falla 1) · cuerpo de error devuelto (fallan 2). **No detectado:** quitar de «confirmado» las condiciones redundantes (entorno, portal y bloqueos): son salvaguardas que el módulo ya cumple y no se puede forzar un estado que las active sin simular un módulo defectuoso.

## 6. Comandos reproducibles
```
npx tsx --test tests/hubspot-read-check-cli.test.ts tests/hubspot-read-check.test.ts
npx tsc --noEmit -p tsconfig.json
```
Ejecución real (solo el usuario, con su credencial por tubería): ver `coordination/plans/HUBSPOT-LECTURA-REAL-172.md`.

## 7. Límites
Una comprobación puntual no prueba sincronización, escritura, otros objetos/campos ni validez posterior a `freshUntil`. Las cinco lecturas atraviesan un registro real y pueden dejar rastro en la cuenta. La credencial pasa por una variable de PowerShell del usuario durante la orden del runbook. No montado en `App.tsx` ni en archivos ajenos.

## 8. Siguiente paso
(1) Codex revisa 160 y 173. (2) El usuario aporta portal de ensayo + autorización de las 5 lecturas y ejecuta el runbook. (3) Unidades de montaje con reserva (ruta v2, contrato, pantalla).

---

# R2 · corrección de F1 (dictamen 178) — 4/11/2026

**Continuidad de la reserva:** la unidad seguía `working` bajo `claude` con las mismas cinco rutas; esta sesión la retoma por instrucción expresa del usuario (encargo «Prompt B · Fase 1»), con `check-path` permitido en las cinco. No se tocó ninguna otra ruta, `tests/independent-hubspot-read.test.ts` (hash `8ea84027…` antes y después) ni 160.

## Defecto (F1) y causa
El transporte cortaba el cuerpo en 64 KiB y entregaba el prefijo como respuesta 200. Un prefijo con un objeto JSON completo + espacios es JSON válido aunque el documento recibido no lo fuera; el CLI daba `confirmado` con `respuestasTruncadas = 1`. El comentario original («un prefijo estricto nunca es JSON válido») era falso.

## Corrección
- `server/hubspot-read-check-transport.ts`: al superar el tope se cancela la lectura y se **rechaza la respuesta entera**: se devuelve un cuerpo que falla al leerse (`response.json()` rechaza) y no se entrega ningún byte. Rechazo anticipado si `content-length` > tope. Un cuerpo de exactamente 64 KiB se acepta. Comentarios actualizados.
- Efecto aguas abajo sin editar 160: identidad ilegible ⇒ `unavailable` tras **1 GET**; objeto ilegible ⇒ `malformed` (nunca `readable`) y los demás objetos se comprueban solos.
- `scripts/hubspot-read-check.ts`: «confirmado» exige además `respuestasTruncadas = 0`. Esta condición **no se puede demostrar causalmente** (con el transporte corregido es redundante); la corrección real está en el transporte, no solo en el titular.
- Runbook: BSTR liberado con `ZeroFreeBSTR` en `finally`, entrada sin eco y por stdin, sin prometer borrar toda copia de un string gestionado.

## Pruebas (todas sintéticas; sin red externa; sin llamada real)
Nuevas en `tests/hubspot-read-check-cli.test.ts` (+4): identidad con prefijo válido+espacios+sufijo inválido (1 GET, `unavailable`, `respuestasTruncadas=1`); el mismo caso en cada uno de los cuatro objetos (5 GET, `partial`, ese objeto `malformed`, otros 3 legibles); controles (límite exacto ⇒ `confirmado`; +1 byte ⇒ rechazado aunque sea JSON válido; JSON incompleto dentro del tope ⇒ no cuenta como truncado por tope; respuestas normales); transporte (límite justo entre bloques, límite a mitad de bloque, `content-length` declarado mayor, tope exacto en varios bloques; el cuerpo entregado no se puede leer y se cancela la lectura del origen).

| Comando | Resultado |
| --- | --- |
| `node --import tsx --test tests/hubspot-read-check.test.ts tests/hubspot-read-check-cli.test.ts tests/independent-hubspot-read.test.ts` (×3) | **33/33** las tres veces (14 módulo 160 + 16 CLI/transporte + 3 independientes del revisor) |
| Antes de corregir, solo las independientes | 1/3 (dos rojas por F1), reproducidas |
| `tsc --noEmit` focal (comando del dictamen + mi test) | exit 0 |
| `tsc --noEmit -p tsconfig.json` (proyecto) | exit 0 |

**Mutantes sobre el transporte (restaurado con hash idéntico `b4dfbf40…` tras cada uno):** M1 volver al prefijo ⇒ fallan 6 (las 4 mías + 2 del revisor); M2 quitar la guarda `content-length` ⇒ falla 1; M3 `>=` en el tope ⇒ fallan 2 (límite exacto y bloques); M4 no cancelar el origen ⇒ falla 1. Un primer M2 pasaba sin detectarse (la prueba no discriminaba); se afiló con un cuerpo pequeño y válido con cabecera mayor.

## Sin cambios
Máximo 5 GET, cada ruta una vez, dominio/rutas/consulta previstos, sin escrituras, paginación, reintentos ni redirecciones; errores sin secretos (las 12 pruebas originales siguen verdes).

## Hashes finales (sha256)
| Ruta | sha256 |
| --- | --- |
| scripts/hubspot-read-check.ts | c5531d8ecd95b2c14a61bc05c551fe1eef94b0555a9d445e5e04c09db26063df |
| server/hubspot-read-check-transport.ts | b4dfbf40c7b441061d474d91990f60d72e7a424d6f8120bf60ed09b601bb86ee |
| tests/hubspot-read-check-cli.test.ts | e918360f1a603c5057427f56e2db6da27a780bb201487a881c59cced377134c9 |
| coordination/plans/HUBSPOT-LECTURA-REAL-172.md | 3ef3653c389edf534609b8e987df0d9436f62bcd0123e116b4a6d78ff29a6bec |
| coordination/reports/CLAUDE-HS-READ-CLI-172.md | (calculado al presentar; es el propio informe) |

## Límites
Sigue **sin llamada real a HubSpot**: faltan el ID numérico del portal de ensayo propio y la autorización humana expresa de esas cinco lecturas. Tras la aceptación de R2 se presentará la orden concreta para revisión y se esperarán esos datos. Procesos propios: ninguno abierto (solo ejecuciones de prueba terminadas; sin servidores).
