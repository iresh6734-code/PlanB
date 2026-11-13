# RESCUE-115 · Traspaso (qué corregir, de quién depende y qué impide 116)

02/11/2026. Resume `coordination/reports/CLAUDE-RESCUE-QA-115.md`. **Un pendiente no se da por resuelto porque exista este documento ni un prompt.** Estado de los encargos: 106 `review`, 115 presentada, 116 **no iniciado** (su claim exige 106 y 115 aceptadas por Codex).

## A. Qué debe corregir la autora de 106 (bajo la reserva de 106, solo si Codex la devuelve; luego presentar con hashes nuevos)

Orden sugerido por riesgo:

1. **D1 · replay sin contexto** (`server/rescue-room-journal.ts`): comprobar `sameContext` antes de devolver un acuse guardado. Casos: `rescue-followup-context.test.ts` («DEFECTO ·» ×2). Corrección probada en proyección privada.
2. **D3 · un solo escritor** (`scripts/demo-rescue-room.ts`): validar la raíz y adquirir el bloqueo **antes** de abrir `Store`/`Recovery`. Caso: `rescue-followup-persistence.test.ts` («DEFECTO · abrir una raíz YA abierta…»). Corrección probada en proyección privada. Implica a `server/instance.ts` (ajeno): no se toca.
3. **D2 · intención A vs B** (`server/rescue-room.ts`, rama `resume` de `createTask`/`editTask`): correlacionar el efecto con su intención o rechazar la ambigüedad. Caso: «DEFECTO · una intención A SIN efecto…». **Sin corrección probada.**
4. **D5/D6 · CSS** (`src/rescue-room.css`): `.rr-scroll { position: relative }` y `overflow-wrap: anywhere`. 6 E2E «DEFECTO». Corrección probada en proyección privada.
5. **D4 · marcador `null`** (`server/rescue-room.ts`, `assertOwnRoot`). Caso: «DEFECTO · un marcador cuyo JSON es «null»…». Corrección probada.
6. **M1 · informe**: línea explícita «aprobado, no enviado». Caso: «MEJORA PENDIENTE…». Sin corrección probada.
7. **Informe de 106**: corregir la clasificación de M12 (**no** es equivalente; ver informe 115 §3) y la afirmación de «390/320 sin desbordamiento» (solo medida antes del retorno).

Tras corregir: repetir los 60 Node de 106 y los 31 + 10 casos de 115 en una proyección nueva; los casos «DEFECTO ·» deben pasar sin editar sus oráculos.

## B. Qué depende de Codex

- **Dictamen de 113** (`coordination/reviews/CLAUDE-RESCUE-106-codex.md` no existe): contrastar D1 y D2 con sus reproducciones; si las suyas difieren, prevalecen. No se duplicaron sus oráculos.
- **Aceptar 115** como evidencia (una auditoría con hallazgos no permite aceptar 106 con defectos pendientes) y decidir si devuelve 106 a su autora.
- Decidir la política de `tests/.tmp` (no hay borrado recursivo de salas antiguas) y si `tests/rescue-followup-*` entra en la suite global dado que 6 + 5 casos fallan **a propósito** mientras existan los defectos.
- `server/instance.ts` / `lockInstance` (ajeno): si D3 exige un cambio ahí, es otra unidad.

## C. Qué impide empezar 116

1. 106 y 115 deben estar `done` (`CLAUDE-RESCUE-KIT-116` tiene esas dos dependencias; `claim` rechazará hasta entonces).
2. El kit **reutiliza** `shared/rescue-room.ts`, `server/rescue-room.ts` y `server/rescue-room-journal.ts` de 106: construir la cápsula sobre D1/D2/D3 sin corregir hereda un replay sin contexto, adopción de efectos y escritura sin bloqueo. Conviene que 106 esté corregida y aceptada **antes**.
3. Dos observaciones para 116, sin decidir aquí: la captura coherente exige excluir mutaciones o detectar cambios de revisión (el simulador guarda estado fuera de SQLite); y el límite de 200 tareas (L3) debe constar en la cápsula y en el informe comparativo.

## D. Límites que no son defecto

Ver informe 115 §5 (L1–L3). En particular: **no** hay solape de lecturas posible desde la interfaz (propiedad estructural, probada); y el plan global de más de 200 tareas es una **posible unidad posterior**, no una corrección de 106.
