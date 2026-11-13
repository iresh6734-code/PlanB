# CLAUDE-OPUS-UI-OPERACIONES-CLARAS · Sistema visual «Operaciones claras» en la App real

**Fecha:** 11/11/2026 · **Agente:** Claude (Opus 5.5)
**Origen:** el usuario pidió «INICIA la app con estos cambios, aplícalos» tras aprobar el prototipo. Antes había dado permiso general para el piloto: «te doy permiso para lo que sea».

## Qué cambia para la persona

- **Navegación agrupada.** La barra lateral se ordena en Trabajo, Operaciones, Tu copia y Ajustes. El buscador global pasa arriba. Las etiquetas, los botones y sus nombres accesibles no cambian, salvo dos añadidos:
  - **Inicio** es nuevo.
  - **Comprobar una fecha** usa otro icono.
- **Inicio es la página por defecto.** Antes era Continuidad. Inicio solo lee y no escribe nada:
  - Estado de la copia: antigüedad, registros, cambios locales y un acceso a Continuidad.
  - Recuentos de vencidas y de las próximas 24 h, que salen de `/api/v7/local-operations`.
  - Compromisos en riesgo, que salen del Radar solo si su capacidad está `available`.
  - Las 5 tareas más urgentes, que se abren en Hoy con la misma petición `openTaskFromOutcomes`.
  - Una tarjeta del Radar con «Ensayar mi semana» y «Comprobar una fecha».
  - El estado de la prueba de Plan B.
  - Lo que no se puede leer aparece como «—» con su motivo. Nunca aparece como 0.
- **Hoy compacto.**
  - Los cuatro recuentos grandes se sustituyen por filtros con su recuento: Todas, Vencidas, Próximas 24 h, Por revisar y Más adelante. Los filtros solo afectan a la vista.
  - La lista se agrupa por urgencia en filas de unos 44 px. Cada fila lleva una etiqueta de estado («Vencida · 9 d»), el título, la fecha legible en Madrid y el botón «Abrir».
  - Los motivos repetidos quedan solo para lectores de pantalla (`.oc-sr`).
- **Tokens.** `operaciones-claras.css` se carga después de `planb-ui.css` y redefine:
  - el texto, que pasa a 14 px de base;
  - los colores de estado: rojo para vencido, ámbar para riesgo, verde para correcto y azul para acción;
  - los radios y la barra oscura.
  
  Los contrastes AA de los tokens nuevos se comprueban en `tests/design-tokens.test.ts`.

## Archivos

Archivos nuevos de este encargo:
- `src/operaciones-claras.css`
- `src/HomeOverview.tsx`
- `src/task-display.ts`: formato compartido de fecha y estado.
- este informe.

Ediciones en archivos ajenos, hechas por orden expresa del usuario y recogidas en `readFiles`:

| Archivo | Cambio | Huella (sha256, 16) |
|---|---|---|
| `src/main.tsx` | Un import: `./operaciones-claras.css` después de `./planb-ui.css` | `fd641cd7a415ba2f` |
| `src/App.tsx` | Página `'home'` por defecto, rama de render de `HomeOverview` e imports `Home`, `Lock`, `CalendarCheck` y `HomeOverview`. Barra lateral reorganizada en 4 grupos (`.oc-nav-group` con `role="group"`) con los mismos botones y manejadores. Se retira el `sidebar-caption`. «Buscar en toda la copia» pasa arriba como `.oc-search`. (+23 −12) | `f5d945cf489f542f` |
| `src/LocalOperations.tsx` | Estado `filter`; `dl.lop-counts` sustituido por `.oc-filters`, que conserva el texto «Tareas en la copia»; lista agrupada en varios `ul.lop-tasks`. Se conservan `.lop-open-task`, su `aria-label`, el buscador y los textos vacíos. El texto visible del botón pasa de «Abrir tarea» a «Abrir». (+12 −4) | `3c573ca8109f0ee3` |
| `tests/e2e/continuity.spec.ts` | Clic en «Continuidad» tras 4 `goto('/')` que daban por hecho la portada antigua | `1bc61d5347293777` |
| `tests/e2e/independent-workspace-flows.spec.ts` | Ídem, en 1 punto | `74c2be798e0b9973` |
| `tests/e2e/workspace-search.spec.ts` | Ídem, en 1 punto | `376948e7edbb3055` |
| `tests/design-tokens.test.ts` | El orden de carga acepta `operaciones-claras.css` como última hoja y verifica el contraste AA de sus tokens | `cd3b2b8d76b1bc11` |

Las copias previas a cada edición están en la carpeta temporal de la sesión. Los dueños de esos archivos deben volver a presentar sus encargos sobre estas huellas.

## Verificación

- `tsc --noEmit`: limpio.
- Unitarias relacionadas, 12 archivos: 198 de 200. Fallan dos:
  - `design-tokens` fallaba por el orden de carga. Ya está corregido: 9 de 9.
  - `independent-interface-contexts` («G6 AUTH_PARENT072») falla igual sin estos cambios. Espera un `done` antiguo de Protection que este encargo no toca.
- e2e contra la App compilada (resultado en la nota de entrega): date-check-app, operational-rehearsal-app, operational-rehearsal-today, app-lifecycle, task-d7-real-app, main-app-readiness, hoy-recuperable-240, work-summary-main, continuity-home-hub y auth-gate-order.
- Revisión visual en la demo aislada (4612) a 1440 px: Inicio con datos de ficción y Hoy agrupado (14 tareas, 8 vencidas). Se corrigió el ajuste de la navegación secundaria en móvil.

## Límites

- Inicio no captura ni lanza pruebas. Sus botones llevan a la página que ya hace cada cosa.
- El filtro de Hoy no se guarda: al salir de Hoy vuelve a «Todas».
- `TeamApp` hereda los tokens nuevos porque son globales. Su maquetación no se ha revisado en este encargo.
