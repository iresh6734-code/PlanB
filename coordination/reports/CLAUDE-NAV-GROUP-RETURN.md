# CLAUDE-NAV-GROUP-RETURN · La cabecera de un grupo lleva a su primer apartado

**Autor:** Claude (Opus 5.5) · **Fecha:** 19/11/2026 · **Origen:** propuesta del informe CLAUDE-E2E-ADAPT, aprobada por el usuario. `Sidebar.tsx` y `navigation.ts` están en CLAUDE-UI-NAV-LAB (revisión) y `v6.spec.ts` en CLAUDE-E2E-ADAPT (revisión). Se editaron como compartidos, con huellas.

## El problema

En el menú de cinco lugares, pulsar la cabecera de un grupo **estando ya dentro** solo lo plegaba:

- desde Propuestas, «Hoy» no volvía a la cola de Hoy;
- desde Exportar, «Continuidad» no volvía a su inicio;
- desde Oportunidades, «Clientes» no volvía a Clientes.

Las pruebas de navegador lo tropezaron tres veces, y a una persona le pasaría lo mismo.

## Qué cambió

- **`navigation.ts`.** Nueva regla pura `headerPress(grupo, página, entidad)` que devuelve `'go'` o `'toggle'`:
  - **ir al primer apartado** si estás fuera del grupo, o dentro pero en otro apartado;
  - **plegar o desplegar** solo si ya estás en ese primer apartado;
  - un grupo sin apartados (Inicio) siempre lleva a él.
- **`Sidebar.tsx`** usa la regla. Al ir al primer apartado, deja el grupo desplegado.
- **`v6.spec.ts`.** Desde Oportunidades, la primera pulsación vuelve a Clientes (con `aria-current` en Clientes y el grupo desplegado) y la segunda pliega. El resto de la prueba no cambia.

## Verificación

- **`tests/navigation-group-header.test.ts`, 4/4:**
  - desde otro apartado vuelve al primero, en Hoy, Continuidad y Clientes;
  - en el primero pliega;
  - fuera del grupo, o en un grupo sin apartados, va;
  - el menú usa la regla y deja el grupo desplegado.

  Con `navigation-model`, 10/10.
- **Recorrido real** en Chromium sin interfaz sobre el ensayo aislado:

| Paso | Dirección | Título | Grupo «Hoy» |
| --- | --- | --- | --- |
| En Propuestas | `/hoy/propuestas` | Agentes y revisiones | desplegado |
| 1.ª pulsación en «Hoy» | `/hoy` | Hoy | desplegado |
| 2.ª pulsación | `/hoy` | Hoy | plegado |
| 3.ª pulsación | `/hoy` | Hoy | desplegado |

- `tsc` 0.
- E2E `v6` con el arnés aislado recompilado: ver el resultado al final.

## Nota

Las pruebas adaptadas en CLAUDE-E2E-ADAPT que usan `openSection(page, 'Tareas de hoy')` o `'Estado'` siguen siendo válidas. Ahora la cabecera también serviría para lo mismo.

## Huellas

| Archivo | Antes | Después |
| --- | --- | --- |
| `src/app-shell/Sidebar.tsx` | `334b0b58b90b` | `2b0b2e81c460` |
| `src/app-shell/navigation.ts` | `2cff289e3642` | `71f3981f1563` |
| `tests/e2e/v6.spec.ts` | `323d7d5070b0` | `5a602df55452` |
| `tests/navigation-group-header.test.ts` | — | `057d73a55dcb` (nuevo) |

**Resultado de `v6`** (arnés aislado, recompilado el 19/11): 2/3. El caso del menú supera todos los pasos de navegación: vuelta a Clientes con `aria-current`, plegado en la segunda pulsación y orden del Tab. Se detiene después, en los seis logos de `.integration-grid`, una vista de `SalesWorkspace` que ya no se monta. Es la misma causa previa documentada en CLAUDE-E2E-ADAPT.
