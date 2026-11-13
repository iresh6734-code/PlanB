# Registro local de ensayo · contrato PROPUESTO

10/11/2026, Europe/Madrid. Autor: Claude (sesión cuyo arnés declara `claude-fable-5-2`), unidad `CLAUDE-FABLE-OPERATIONAL-CORE-2`.
**Estado: propuesta.** Es un módulo puro (`shared/operational-rehearsal.ts`): no guarda, no tiene rutas, no llama a nadie. La misión pide que el registro tenga «su contrato aprobado»; esa aprobación es de Codex y no existe todavía.

## Qué separa

| Cosa | Dónde vive | Quién la escribe |
| --- | --- | --- |
| Ensayo | registro `planb-operational-rehearsal-v1`, siempre `hypothetical: true`, `kind: 'rehearsal'` | la persona al comparar; nunca es evidencia |
| Decisión | decisión local `assign` de `shared/commitments.ts`, en el sistema de compromisos | la persona al confirmar sobre una revisión vigente |
| Observado | observaciones de fuentes en los compromisos | las fuentes; el ensayo no lo contiene |

El ensayo solo guarda una **referencia** a la decisión aceptada (`operationId`, `commitmentId`, `expectedRevision`). No copia su contenido ni su resultado.

## Forma

`id` (UUID) · `createdAt` · `engineVersion` · `baseRevision` (revisión exacta del modelo ensayado) · `evaluatedAt` (reloj del modelo) · `focus {commitmentId, commitmentRevision}` · `scenario[]` y `options[]` (supuestos del contrato del gemelo) · `objectives` · `compared[] {alternativeId, suppositionIds, missedByTier, penaltyMinutes, optimality}` · `chosen | null` · `decision | null`.

No guarda planes ni trazas: se recalculan con la misma entrada, que es determinista. Si prefieres conservar la traza elegida para auditoría, se añade un campo.

## Reglas (todas con prueba)

1. Un registro sin `hypothetical: true` o con otro `kind` no valida. Exportar y reabrir devuelven el mismo registro.
2. `reopenRehearsal(guardado, modeloVigente)` no recalcula ni ejecuta nada. Devuelve `current` o `historical` con motivos: `base-revision-changed`, `commitment-revision-changed`, `commitment-missing`, `engine-version-changed`.
3. Un ensayo histórico conserva íntegro lo comparado y la elección, y `canConfirm` es falso. `decisionDraft` lo rechaza con `stale-rehearsal`.
4. `decisionDraft` prepara, sin enviarla, **una** `commitmentDecisionRequest` de tipo `assign` para el compromiso foco, con `expectedRevision` igual a la revisión guardada. Responsable, siguiente paso y fecha los escribe la persona. No hay lote.
5. `linkDecision` anota la decisión que el sistema de compromisos aceptó. Repetir la misma anotación devuelve el mismo registro; otra distinta se rechaza. Con decisión anotada no se cambia la elección ni se prepara otra.

## Decisiones que pido a Codex

1. **Dónde se guarda** y con qué autorización; propongo una colección propia, separada de observaciones y de eventos de compromiso, ligada a instancia y contexto como el resto.
2. **Estabilidad de la revisión.** `baseRevision` incluye `clock.now`. Si el modelo se reconstruye con otro reloj, todo ensayo anterior pasa a histórico. Es coherente con «cambiar `now` es otro conjunto» del Radar, pero exige que el montaje fije el reloj del modelo por contexto. Alternativa: excluir el reloj de la revisión y comparar aparte la antigüedad.
3. **Quién llama al sistema de compromisos.** Propongo: la interfaz envía la petición preparada a la ruta existente de decisiones y, con la respuesta aceptada, el servidor anota `linkDecision`. El ensayo nunca escribe una decisión por sí mismo.
4. **Replay y reinicio.** Las propiedades «repetir la decisión aceptada no crea un segundo efecto» y «reiniciar conserva decisiones y no ejecuta ensayos» dependen de tu almacén. Aquí solo queda cubierta la parte pura (regla 5 y regla 2).
5. **Extensión del contrato del gemelo.** Falta un supuesto de duración de trabajo (`job-duration`). `operational-sensitivity.ts` lo aplica internamente sobre la rama con procedencia de supuesto, pero no aparece en `branch.suppositions`. Pido añadirlo en la revisión de CORE-1.
