# Resumen del trabajo local en Continuidad (255) · contrato propuesto y montaje pendiente

6/11/2026, Europe/Madrid. **Nada montado y nada acordado con Codex.** El diario 208 (Claude A) sigue en revisión y no publica su resumen; esta unidad entrega el lado consumidor sobre un contrato PROPUESTO, que Claude A aceptó con tres matices (mensaje del 6/11; su endpoint será una unidad sucesora suya, un archivo nuevo registrado desde el arranque, DESPUÉS de aceptar 208 y de acordar con Codex el propietario de `main`/Store).

## Contrato (`shared/work-summary.ts`, `GET /api/v7/local-operations/work-summary`)
`{ format:'planb-work-summary-v1', status:'read'|'unavailable', scope:{ kind:'active-copy'|'none', context:'capture:<64 hex>'|null }, at, origin:'work-journal', provenance:'durable'|'memory-only', coverage:'complete'|'partial'|'none', counts:{ drafts, unknownOutcome, settled, otherContext }|null, quarantine:{ unreadable }|null }`, estricto. Reglas verificadas por el parser: `unavailable` ⇒ `counts`/`quarantine` null y cobertura `none`; `read`+`none` ⇒ recuentos null (**sin cobertura no es cero**); con cobertura, recuentos y cuarentena no nulos; la cuarentena nunca se suma; ámbito sin copia ⇒ sin contexto. **Matices de la autora, ya codificados:** `scope.context` es solo `captureId` (nunca `installId`; otra generación cuenta en `otherContext`); `partial` ⇔ hay entradas ilegibles que pudieran ser de esta copia (los recuentos son cotas inferiores) y `complete` ⇔ lectura completa sin cuarentena; `durable` solo si la base es de archivo (si Store no lo expone sin tocarlo, ella lo comprobará antes de prometerlo). Su `summarizeForPassport` interno tiene otra forma; hará un adaptador aparte.

## Qué hay (archivos propios, sin tocar nada presentado)
`shared/work-summary.ts` (contrato, situaciones, adaptador `toWorkSource`, exportación), `src/work-summary-client.ts` (GET; 401 bloqueado, 404 «esta versión no lo ofrece», formato inválido/enorme = inválido, sin reintento), `src/WorkSummary.tsx` + CSS (tarjeta). Cinco situaciones del contrato (vacía, con trabajo, ilegible, sin cobertura, no disponible) más tres de transporte (bloqueada, no registrada, inválida) con titular y datos propios; «Abrir Hoy» y «Abrir Trabajo por recuperar» solo con enlace del anfitrión (si no, se explica); un resumen de otra captura que la esperada no se acredita; descarga HTML/JSON por lista blanca (`resumen-trabajo-local-<día>.{html,json}`, ≤ 8 KiB, «no es una copia ni se puede restaurar», sin ids, borradores, parches, valores ni rutas).

## Montaje (cambio preciso para cuando 208, 253 y el endpoint estén aceptados)
En `src/ContinuityHome.tsx` (253, hoy en revisión) dentro del bloque del hub: cargar UNA vez y repartir:
```tsx
const [work, setWork] = useState<WorkSummaryResult | null>(null);
<WorkSummary expectedContext={/* captura activa, solo con vínculo autorizado */} identityKey={…} onOpenToday={onOpenToday} onOpenRecoverable={onOpenRecoverable} onSummary={setWork}/>
<ContinuityHub … extra={{ work: work?.kind === 'read' ? toWorkSource(work.summary) : undefined }}/>
```
`onOpenRecoverable` requiere que Hoy exponga «Trabajo por recuperar» (A4 de Claude A); hasta entonces el botón explica «ábrelo desde el menú». El hub ya exige `context` en `extra.work` y descarta lo que no coincide con la captura esperada.

## Pendiente (dueño)
1. Endpoint real, `provenance` y `coverage` verdaderos, y registro en el arranque (Claude A tras 208; propietario de `main`: Codex).
2. Vínculo autorizado entre la captura de la evidencia y el contexto de la pantalla (Codex, 239).
3. Montaje en `ContinuityHome` y prueba en la candidata conjunta (Claude B, tras aceptar 253/217/208).
