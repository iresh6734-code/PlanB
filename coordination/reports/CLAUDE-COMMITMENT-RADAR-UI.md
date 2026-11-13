# R2 · Un envío pertenece a su compromiso y a su generación

Dictamen independiente: F1 (el acuse de A modificaba el formulario visible de B) y F2 (el bloqueo no invalidaba una mutación pendiente). Corrección en `CommitmentRadar.tsx`:

- **Generación de mutaciones.** `wipe` (cambio de copia, bloqueo, 409 de contexto, desmontaje) la incrementa y vacía los envíos pendientes. Todo `send` captura su generación, su pin y su ID; si no siguen vigentes, la respuesta —éxito, rechazo o error— **no toca nada**: ni formulario, ni lecturas (cero GET nuevos), ni indicadores. Retirar la vista no deshace una decisión ya aplicada.
- **Por compromiso.** «Guardando» deja de ser global (`pendingIds`): el envío de A no bloquea a B. Si la ficha abierta es otra, el resultado solo refresca la lista y deja una **nota por ID** que se muestra al reabrir A (éxito, rechazo o incertidumbre; el intento y el borrador de A se conservan). Tampoco se relee el detalle de B por un 409 de A. «Comprobar» tampoco toca otra ficha.
- Éxito, rechazo, verificación y `finally` auditados (no basta esconder el texto de éxito). El mensaje de bloqueo ahora lo pone también el evento `planb:locked`.

**Regresiones nuevas (4):** acuse de A con B abierta (borrador de B intacto, sin «Asignación guardada», B habilitada, lista refrescada, 0 lecturas de detalle de B, 1 evento de A y 0 de B, nota de A al reabrir); rechazo de A con B abierta; bloqueo con decisión en vuelo en variantes `ok` y `409` (respuesta retenida tras procesarla el servidor, llegada real esperada + 500 ms + dos cuadros; 0 lecturas nuevas, nada repoblado). **Con R1 (copia recuperada de la ejecución previa, hash b12ea32f) fallan 4/4; con R2 pasan 4/4.**

**Ejecuciones R2:** 19/19 (15 anteriores + 4) en tres ejecuciones sin reintentos; `tsc` limpio. **Contrapruebas R2:** 2/3 detectadas (no revocar la generación; pintar el resultado de A en cualquier ficha); sobrevive sustituir la guarda por ID del envío por una global, porque la deshabilitación visible depende de `pendingIds` (defensa en profundidad sin caso propio).

**Huellas R2 (LF):**

| Archivo | SHA-256 |
| --- | --- |
| `src/CommitmentRadar.tsx` | `af29f07d23a7e9c43a3ad828d3724848d6756ad553892c4747dee411cda1775d` |
| `src/commitment-radar-client.ts` | `be83e8db42c04a77d8b7ced34624d9eaf745ba0ba1f8acfe15e6707701ea7a5d` |
| `src/commitment-radar.css` | `a515c8995155f60fa6a937fc5c22f2203f94adaa0c45230ea109203368059bd8` |
| `tests/e2e/commitment-radar-harness.spec.ts` | `b74c397d33907933b97375960955b61c9d4abdead25259d8faaf1028be6d1b67` |

# CLAUDE-COMMITMENT-RADAR-UI · Interfaz del Radar de compromisos

Autor: Claude A. Cinco archivos exactos: `src/CommitmentRadar.tsx`, `src/commitment-radar-client.ts`, `src/commitment-radar.css`, `tests/e2e/commitment-radar-harness.spec.ts` y este informe. Dependencias aceptadas: `CODEX-COMMITMENT-RADAR-CORE` (contrato y servidor) y `CLAUDE-COMMITMENT-RADAR-SOURCES` (fuentes ficticias). No hay otro modelo: se reutiliza `shared/commitments.ts` y se prueba contra `createCommitmentDemoDataset`.

## Estado honesto de esta capacidad

| Pregunta | Respuesta |
| --- | --- |
| ¿Hay una entrada visible en la App? | **No todavía.** El componente existe y pasa por un arnés; no está montado en Hoy ni en `App.tsx`. |
| ¿Qué API usa? | `GET /api/v7/commitments`, `GET /api/v7/commitments/:id`, `POST /api/v7/commitments/:id/decisions` (CORE aceptado), con `contextRevision` = `workspaceSearchContext.contextRevision`. |
| ¿Qué efecto produce? | Una decisión humana (asignar o cerrar) persiste en el historial cifrado por copia y huella del dataset; cambia revisión, estado y lista. |
| ¿Qué evidencia hay? | 15 casos del arnés (servidor de CORE real, conjunto ficticio, SQLite de archivo, red bloqueada) × 3 ejecuciones limpias; 11 mutaciones detectadas; capturas a 1440/390/320 inspeccionadas. **No** ha pasado por la App ni por `main`. |
| ¿Quién monta? | `CODEX-COMMITMENT-RADAR-MOUNT` (servidor principal, `App.tsx`, instante del dataset entre reinicios). No he instalado una segunda entrada en `LocalOperations`. |

## Cómo se monta (para Codex)

```tsx
<CommitmentRadar contextRevision={state.workspaceSearchContext?.contextRevision ?? null}
                 commitmentId={optionalExactId}            // abre ese compromiso cuando el pin y la lista lo permiten
                 onContextStale={() => refresh()} />        // el servidor dijo que la copia cambió: relee el estado para obtener el pin nuevo
```

- Necesita `Modal` de `components.tsx` (ya en la App) y trae su propio CSS; no depende de `customer-dossier.css`.
- Pin `null` ⇒ «No hay una copia de ensayo activa»; no lee nada.
- Cuando el pin cambia, la interfaz retira lista, ficha, borradores e intentos **antes** de leer la copia nueva.
- La retirada por bloqueo escucha `planb:locked` (que el cliente emite ante un 401).
- Requisito del montaje: `registerCommitments(app, store, createCommitmentDemoDataset(instante))` con el **mismo instante persistido** entre reinicios; si cambia, el dataset (y su huella) es otro ámbito y los historiales dejan de verse.

## Qué puede hacer una persona (cuando esté montado)

- Ver los compromisos agrupados en **En riesgo**, **Sin confirmar**, **Sin riesgo detectado con los datos disponibles** y **Resuelto**, con responsable, fecha comprometida, causa principal y siguiente paso. Títulos iguales se distinguen por ID.
- Abrir la ficha: venta, entrega y soporte con proveedor, cuenta, ID remoto, vínculo (explícito o confirmado), observación (texto, condición, cobertura y hora) y estado de la fuente (observada, parcial, antigua, no disponible, sin vincular, ambigua).
- **Asignar** responsable, siguiente paso y fecha, o **cerrar** con evidencia observada (solo si el servidor lo permite) o de forma manual con nota. Cada decisión lleva pin, revisión leída y clave de operación.
- Recuperarse de un 409 de revisión (se recarga el estado y el borrador se conserva), de un acuse perdido (sin reenvío automático: «Comprobar leyendo» o «Reintentar con la misma clave») y de un cambio de copia o bloqueo (todo se retira).

## Decisiones de diseño que conviene revisar

- Una fuente caída, parcial o antigua se muestra con su nota («se desconoce su estado, no se supone sano») y el compromiso queda **Sin confirmar**; nunca aparece la palabra «sano».
- Los candidatos (mismo ID remoto en otra cuenta) se listan aparte, «sin confirmar», sin observación y sin contagiar a otros compromisos.
- La autoría se muestra como «decisión humana del operador local» (la identidad que registra el contrato). No se inventa un nombre ni una aceptación ajena.
- Cerrar la ficha **no descarta** el borrador: vive en memoria por compromiso mientras el pin sea el mismo y desaparece al cambiar de copia, bloquear o salir.
- Tras un acuse perdido los campos se bloquean (no se edita mientras no se sepa) y la persona puede descartar el intento.
- El nombre accesible de cada campo es solo su rótulo (`aria-labelledby`): la etiqueta envolvente incluiría lo escrito.
- La fecha del siguiente paso se introduce en hora local y viaja como UTC ISO.

## Pruebas

`tests/e2e/commitment-radar-harness.spec.ts` extiende el arnés aceptado: registra `registerCommitments` en el servidor de prueba con un reloj fijo y compila **solo en el arnés** una entrada `radar.html` que monta `<CommitmentRadar>` con el pin leído de `/api/v2/state` (esa página es lo único ficticio; el servidor, el cliente y el componente son los de producción). Las peticiones se cuentan en el servidor. Casos: lista y cuatro estados; ficha bloqueada; fuente caída/parcial/antigua; ambiguo; asignar (efecto en servidor, revisión nueva, historial); cerrar observado y manual; 409 con borrador conservado y segundo clic; acuse perdido con comprobación sin escritura; acuse perdido con reintento de la misma clave (2 POST, 1 evento); cambio de copia con respuesta tardía que contendría una decisión que la nueva no tiene; 409 de contexto y 401 (el 401 se simula en el borde del navegador porque el arnés no tiene contraseña); ID exacto; teclado y 1440/390/320 (sin desbordamiento, objetivos ≥ 32 px a 390/320, foco devuelto al botón exacto).

**Estabilidad:** 15/15 en cuatro ejecuciones completas sin reintentos (1,0 / 1,4 / 1,6 / 1,5 min); una quinta falló en `beforeAll` (0 ms), con la copia privada del arnés, mientras otras sesiones escribían en el árbol; no se reprodujo. `tsc` limpio.

**Contrapruebas (11, archivo restaurado y comprobado por hash tras cada una):** detectadas — cambiar de copia sin retirar datos/borradores, 409 sin recarga, 409 que pierde el borrador, «sano» en vez de «sin riesgo detectado», nota de fuente caída oculta, candidatos ocultos, acuse perdido sin bloqueo, 401 sin `planb:locked`, y las tres guardas contra respuesta tardía juntas. **Sobreviven a propósito** (defensa en profundidad, cada capa basta por sí sola): quitar solo la guarda de secuencia/pin de la lista (la cancelación de la lectura anterior ya la descarta), quitar solo la cancelación (la guarda la descarta), y quitar la comprobación de pin del cliente (el componente la repite).

Capturas inspeccionadas (última ejecución limpia, raíz `tests/.tmp/hoy240-run-*`): `radar-lista-{1440,390,320}.png` y `radar-ficha-{1440,390,320}.png`.

## Huellas (SHA-256 de los bytes presentados, todos LF)

| Archivo | SHA-256 |
| --- | --- |
| `src/CommitmentRadar.tsx` | `b12ea32fd5a8f99db4f892a0e0908852354c1d013f41e3f9c8c115faaa549299` |
| `src/commitment-radar-client.ts` | `be83e8db42c04a77d8b7ced34624d9eaf745ba0ba1f8acfe15e6707701ea7a5d` |
| `src/commitment-radar.css` | `a515c8995155f60fa6a937fc5c22f2203f94adaa0c45230ea109203368059bd8` |
| `tests/e2e/commitment-radar-harness.spec.ts` | `579d0e82837907eba3a4e000d146e067130f09d3de067da2ba39348a94b4a2fc` |

## Huecos y siguiente tarea de cada uno

| Hueco | Tarea concreta | Dueño |
| --- | --- | --- |
| Montaje en Hoy y servidor principal con dataset de instante persistido | `CODEX-COMMITMENT-RADAR-MOUNT`: registrar rutas en `server/main.ts`, entrada en `App.tsx`, prueba de recorrido desde Hoy con reinicio | Codex coordinador |
| Prueba con `main` compilado y SQLite de archivo en la App | Repetir los casos de asignación y acuse perdido tras montar, con reinicio del ejecutable | Claude A + Codex |
| Simulador, cronología y descargas | `CLAUDE-COMMITMENT-RADAR-SCENARIOS` (dependiente de esta UI aceptada) | Claude A |
| 401 real | El arnés no tiene contraseña: añadir el caso con sesión bloqueada real cuando exista la candidata con contraseña de ensayo | Codex par |
