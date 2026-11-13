# CLAUDE-LAB-036 · Demo visual aislada del laboratorio de caídas

Estado: **trabajo hecho sin reserva y sin presentar.** `board.mjs claim CLAUDE-LAB-036 claude` respondió «Esperando la aceptación de una dependencia» (CODEX-LAB-035 sigue en review); `check-path` respondió «Primero reserva la tarea con el agente correcto». El usuario autorizó expresamente llevar a cabo el encargo aunque Codex lo retuviera. Se escribieron únicamente las siete rutas declaradas (ninguna existía antes). No se tocaron `shared/continuity-lab.ts`, `scripts/demo-continuity-lab.ts`, el tablón, el contexto, `package.json`, el lockfile ni reservas ajenas. No se ha usado `submit`; Codex debe decidir cómo integrar.

## Entrega

| Archivo | SHA-256 |
| --- | --- |
| src/ContinuityLab.tsx | d50b462a5c846e65f4b0402525e6657a6087c0fb959aa3d9d900c467816802cb |
| src/continuity-lab.css | d37ee256d32619a5a921821b5589bb0ece559298bc732b592d9eea29a8f56363 |
| design/continuity-lab/index.html | 5ecd11a7b948068f67f6140c3b8a4619dfa76473a98f64a450f2e761e4c2f348 |
| design/continuity-lab/main.tsx | 60f67aba5ec530ac0b5b532fcd497fd7bd5d68083409c9791d4ed946aaab2685 |
| tests/continuity-lab-ui.test.ts | 90a936179e1fdfe082038ce654d185a0e729fa3cd875c655fca2025f8516d845 |
| tests/e2e/continuity-lab.spec.ts | 139715b90576000888a8e57e37f5f23a77dc4feb525c94af7192f1f28260f8d6 |

(El hash de este informe no puede incluirse en sí mismo.)

## Qué hace

- `ContinuityLab` es un componente controlado: `input` + `onInputChange`, casos opcionales (`cases`, `activeCaseId`, `onSelectCase`). Todo el cálculo viene de `evaluateContinuityScenario`; JSX solo formatea y explica. Sin red, `localStorage`, cuentas, enlaces ni datos de instalaciones. La hoja `continuity-lab.css` la importa quien monta el componente (la demo lo hace en `main.tsx`; el componente no importa CSS para poder probarse con `tsx`).
- Banner fijo «Simulación · datos ficticios · no ejecuta recuperación», también en el estado vacío y ante error del motor.
- Escenarios CRM/equipo, duración y objetivos editables en minutos con equivalencia legible («= 8 h»). Veredicto con icono y texto (Preparado según estas entradas / Fuera de objetivo / Sin demostrar / Bloqueado), «Por qué» y «Siguiente paso», mediciones frente a objetivos, tareas vencidas/durante la caída/sin fecha con la ventana exacta, comprobaciones, comparación entre escenarios (qué pruebas añade el otro) y límites del cálculo.
- `null` se muestra como «No medido» / «Sin inventario utilizable», nunca como cero; un cero medido o un inventario vacío declarado sí se muestran como 0.
- Disponibilidad declarada, simulacro local y restauración en otro equipo son grupos separados, con la marca «Cuenta / No cuenta en este escenario».
- Editar la captura crea otra generación (`demo-capture-r2`); copia, ensayos y tareas conservan su ID anterior, el motor los deja de contar, la interfaz los marca como «de otra captura» y solo permite descartarlos (no reetiquetarlos). Los datos nuevos se registran como registros nuevos.
- Entradas inválidas: el borrador queda visible, `aria-invalid`, mensaje `role="alert"`, y se oculta el resultado (no se muestra el anterior). Si el motor lanza, se muestra su mensaje en un `role="alert"` y ningún veredicto.
- Ningún botón ejecuta ni simula recuperación (Vaciar, Descartar, Quitar, Añadir tarea ficticia; un test lo comprueba).

## Verificación ejecutada

- `npx tsx --test tests/continuity-lab-ui.test.ts tests/continuity-lab.test.ts`: 33/33 (16 nuevas sobre el motor real con render de servidor + 17 del motor de Codex).
- `tsc --noEmit -p tsconfig.json`: sin errores en estos archivos; `main.tsx` (fuera de `include`) comprobado aparte con tsc: sin errores.
- E2E Playwright (config propia `tests/.tmp/lab036-821a4409-.../pw.config.ts`, chrome-headless-shell 1228, 1 trabajador, puerto 4491, build con `vite build` programático en `tests/.tmp/lab036-<uuid>/dist`, sin `build/` ni `dist/` de la raíz): 13/13 en dos ejecuciones, una de ellas sin `PLANB_LAB_DIST` (la propia prueba compila la demo). Cubren: aislamiento (solo peticiones a 127.0.0.1:4491, 0 enlaces, 0 almacenamiento/cookies/IndexedDB), equipo sin restauración, comparación, null vs cero, límites de duración 59/60/61 min, invalidez por captura, objetivos/fallo, entradas inválidas, vacío, teclado (flechas, Tab con foco ≥2 px, nombres accesibles, Enter/Espacio) y 1440/390/320 sin desbordamiento con controles ≥44 px en móvil y ≥32 px en escritorio.
- Mutaciones comprobadas manualmente: `snapshotAgeMs ?? 0` y reetiquetar scopes en `replaceSyntheticCapture` hacen fallar los tests correspondientes; revertidas (hash final arriba).
- Revisión visual de capturas en `tests/.tmp/lab036-821a4409-.../shots/` (1440 y 320 revisadas a ojo; 390 solo por prueba automática). Se corrigieron radios mal alineados, unidad «min» partida y columna de etiquetas.

## Límites y propuestas

- El motor escribe milisegundos en dos `detail`; la UI los convierte con una expresión regular (`N ms` → duración legible). Convendría que el motor devolviera valores estructurados.
- `scripts/demo-continuity-lab.ts` no exporta su fixture; los casos se reconstruyen en `buildSyntheticCases()` con los mismos números base. Pueden divergir si Codex cambia el script.
- El instante evaluado es fijo (29/10/2026 12:00 UTC) para que la demo sea determinista; no es la hora real.
- Los registros son texto escrito en pantalla: el motor y la UI no pueden verificar su procedencia (se dice en «Límites»).
- Sin contraste calculado por herramienta; se reutilizan los pares de `planb-ui.css` (verificados por `design-tokens.test.ts`, no ejecutado aquí). No se probó en Edge ni en un navegador distinto de chrome-headless-shell.
- No se ejecutó `npm test` completo ni `npm run build`.
- Pendiente: reserva/`submit` y revisión de Codex.
