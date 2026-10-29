# CLAUDE-HANDOFF-017 · Traspaso a Codex

29/10/2026, Europe/Madrid. Autor: Claude (Sonnet 5.5). Por petición del usuario: dejar claro qué revisar para aceptar mis entregas y qué se desbloquea. Solo documentación.

## Contexto en dos líneas

El usuario delegó en Claude la ejecución (29/10/2026) tras más de una hora sin actividad tuya en el tablón. Claude no puede ejecutar `accept` ni `revise` (solo `codex`), así que **cuatro encargos esperan tu aceptación** y no se han tocado tus encargos reservados. Los commits están en local, sin push, en `planb-v0.3-local`: `8dd7a3c…7c7fe6e` (respaldo v0.4–v0.6 sin los archivos reservados), `55fc20a` (FIX-014/015 y CLAUDE-004), `45217a1` (FIX-016).

## Orden de revisión recomendado

| # | Encargo | Estado | Qué es | Informe |
| --- | --- | --- | --- | --- |
| 1 | `CLAUDE-004` | review | Informe estático R-01…R-19 de recorridos (sin código) | `coordination/reports/CLAUDE-004-recorridos.md` |
| 2 | `CLAUDE-FIX-014` | review | Correcciones de interfaz (13 archivos de `src/`, `tests/ui-journeys.test.ts`) | `coordination/reports/CLAUDE-FIX-014.md` |
| 3 | `CLAUDE-FIX-015` | review | Actualiza 3 recorridos E2E a dos comportamientos nuevos y añade uno | (en el informe de FIX-014) |
| 4 | `CLAUDE-FIX-016` | review | Servidor: `id` opcional idempotente al preparar un seguimiento | `coordination/reports/CLAUDE-FIX-016.md` |

FIX-014 y FIX-015 son interdependientes (acéptalos juntos o devuelve ambos). FIX-016 es independiente.

## Cómo reproducir las comprobaciones (ninguna toca el piloto ni `build/`/`dist/`)

```bash
npx tsc --noEmit
npm test                                                   # esperado 539/539
npx tsx --test tests/ui-journeys.test.ts                   # 39/39 con el código nuevo
node --require ./scripts/block-external.cjs --import tsx --test tests/proposal-idempotency.test.ts   # 9/9
```

Línea base de FIX-014 (debe fallar sin las correcciones): copia `src/` y `shared/` a una carpeta temporal, restaura de `HEAD` los 8 componentes tocados (`git show HEAD:src/<archivo>`) y ejecuta `PLANB_UI_SRC=<carpeta>/src npx tsx --test tests/ui-journeys.test.ts`. Resultado obtenido: 6/39.

E2E en navegador aislado (25 recorridos): receta completa en mi memoria de proyecto `tests-aislados-e2e-plan-b` y resumida en `CLAUDE-FIX-014.md`. Puntos clave: build en `tests/.tmp/e2e-run` (ignorado por Git), `webServer.cwd` allí, Chromium propio de Playwright (`chrome-headless-shell` 1228), puertos 4337/4341, copiar `scripts/block-external.cjs` a esa carpeta, y compilar también `drill.mjs` y `runtime.mjs`.

## Dónde mirar con más atención (no solo lo que pasa)

1. **`src/CommercialEditor.tsx` + `src/commercial-drafts.ts` (`decisionBlockers`)**: es la zona de seguridad. Comparar con `git show HEAD:src/CommercialEditor.tsx`: las cinco condiciones que deshabilitaban Aprobar/Ejecutar siguen (`busy`, `!canWrite`, `dirty`, `!reviewed`, `blockedRecipient`) y se añaden dos (Google conectado para ejecutar; revisión nueva tras aprobar). Un revisor independiente ya lo comprobó; mutaciones sobre el código fueron detectadas.
2. **`CommercialWorkspace.tsx` `load()`/`run()`**: reconciliación de borradores con `dataRef`/`dirtyRef` (R-02) y separación de «acción hecha» y «recarga fallida» (R-13). Revisar que no queden ediciones obsoletas.
3. **`components.tsx` `Modal`**: el efecto ya no depende de `close` (lee `closing.current`) y cierra con la guarda `confirmClose`. Lo usan todos los modales de la app.
4. **`TeamApp.tsx`**: guarda `discardOk()` en sección, empresa, perfil de ensayo y bloqueo del piloto, más `beforeunload`. Sin prueba de hooks propia: solo la cubre el recorrido de navegador de v6.
5. **`server/team/commercial.ts` `prepare()`**: clave de idempotencia, reserva de ids de `team_copilot_runs`, relectura tras `INSERT` sin fila. La rama de carrera real solo se ejerce con Postgres y varias conexiones (PGlite serializa).
6. Comportamientos deliberados que cambian lo visible: confirmar antes de ejecutar (R-03) y `confirm()` si ya hay un borrador abierto del mismo cliente (R-05).

## Lo que NO está verificado (no lo asumas)

- Foco real, lector de pantalla, contraste y diseño de los textos nuevos a 320/390 px más allá del desbordamiento horizontal que ya comprueba v6.
- La caducidad de sesión (401) del piloto sigue desmontando la pantalla sin avisar de borradores.
- Rendimiento de la búsqueda de contactos con miles de filas.
- Sin despliegue: el piloto sigue ejecutando el build anterior.

## Qué se desbloquea al aceptar FIX-014

Quedan libres `CommercialWorkspace.tsx`, `CustomerDossier.tsx`, `TeamAgentWorkspace.tsx` y los demás de su lista. Entonces Claude (o tú) puede:

1. **Cablear el cliente de FIX-016**: generar el `id` al elegir cliente (Comercial), al abrir la ficha y al abrir la vista previa del agente; reutilizarlo en el reintento y renovarlo tras un éxito o al confirmar «preparar otro».
2. Parciales de R-07 (motivos en «Preparar autorización Google» y «Revisar importación»), R-08 (`aria-disabled` en lugar de `disabled` mientras hay operación), R-12 (combobox), R-14 (nota de solo lectura en el agente), R-16 (progreso/cancelación del agente) y R-18 (zona horaria de la ficha).

Si devuelves FIX-014 con `revise`, Claude puede corregir sobre los mismos archivos y volver a presentar.

## Tus reservas pendientes (no tocadas)

`CODEX-HS-011` (+ su revisión independiente ya escrita, `coordination/reviews/CODEX-HS-011-independent.md`; falta el informe del autor `CODEX-HS-011.md` y presentar), `CODEX-CODE-009`, `CODEX-IMPL-012`, `CODEX-UI-012`, `CODEX-DUET-MEM-001` (reserva `CONTEXTO-PROYECTO.md`, que conviene compactar) y las demás en `working`/`review`. Claude no puede cerrarlas con las herramientas del tablón.

## Fuera del alcance de Claude (decisión del usuario)

Credencial HubSpot del portal personal 149623262, consentimiento del Picker, nube/identidad 0.5, y cualquier despliegue o push.
