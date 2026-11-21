# Misión maestra de Plan B · Índice

Encargo de la usuaria del 21/11/2026: terminar, potenciar, perfeccionar y hacer vendible Plan B. Esta carpeta contiene los cinco entregables y el registro de colaboración.

| # | Documento | Para qué |
| --- | --- | --- |
| 1 | [01-auditoria.md](01-auditoria.md) | Qué hay de verdad: pantallas, procesos, medidas, arquitectura y preparación comercial |
| 2 | [02-superplan-a-producto.md](02-superplan-a-producto.md) | Funcionalidad, lógica, arquitectura y diferenciación |
| 3 | [03-superplan-b-experiencia.md](03-superplan-b-experiencia.md) | Composición, jerarquía, sistema visual único y pantalla a pantalla |
| 4 | [04-comercializacion.md](04-comercializacion.md) | Propuesta de valor, cliente, competencia, producto más servicios y versión 1.0 |
| 5 | [05-hoja-de-ruta.md](05-hoja-de-ruta.md) | Evaluación y prioridad, reparto, seis fases y definición de terminado |
| — | [registro-colaboracion.md](registro-colaboracion.md) | Quién hace qué y decisiones comprobables |

## En una línea por documento

1. **Auditoría:** el motor es sólido; la interfaz enseña demasiado a la vez y la sostienen once capas de CSS (19 tamaños de letra y 9 radios medidos).
2. **Superplan A:** todo se ordena en tres preguntas (Copia, Prueba, Vuelta), con un índice de preparación único como pieza central y un paquete de vuelta para producción como diferencial.
3. **Superplan B:** converger en la identidad «Consola», con diez reglas de composición medibles e Inicio y Continuidad rehechos.
4. **Comercialización:** vender continuidad comprobable (operar, demostrar, volver) a través de agencias partner de HubSpot, sin prometer lo que no está probado.
5. **Hoja de ruta:** P0 en la fase 1; la 1.0 termina con un piloto real.

## Relevo: dónde está y cómo seguir (21/11/2026)

**Hecho y verificado** (detalle y evidencias en `registro-colaboracion.md`):

1. Fase 1 · P0:
   - Contraste del menú móvil (`--signal-ink`) y controles móviles de 44 px.
   - «¿HubSpot caído?» neutro en la barra.
   - `tests/commitments.test.ts` reanclado: era una prueba anticuada, no una regresión.
2. Fase 3 · Inicio «puesto de mando» (B4.1) e índice de preparación único (A1, primera parte: `readinessDetailFor`).
   - Objetivo del mes y previsión movidos a Oportunidades › Analítica.
3. Fase 3 · Continuidad › Estado (B4.2, primera parte):
   - Un índice con los cinco pasos y sus acciones, y una sola acción principal.
   - Informes en un menú.
   - Sello y coste de una caída en «Evidencia e impacto».
4. Revisión cruzada de los dos Superplanes por GitHub Copilot, por propuesta, con prioridades contrastadas.
5. B4.3 Cambios: vacío de una línea tras lectura válida, sin Propuestas ni asistente sin pendientes; historial, planes guardados y justificantes conservados. Tipos y 9/9 archivos seguros focales correctos. Medición estructural antes/después; comparación visual pendiente del equipo autorizado.
6. B3.1 Menú: sin Propuestas en Hoy; Copia de equipo solo con servicio configurado; Configurar Plan B en Continuidad, conservando su ruta y pasos; sin Abrir aplicación en el menú. Tipos y 7/7 archivos seguros focales correctos. Medición estructural 19 → 17 entradas sin servicio y con datos de prueba; revisión visual pendiente.
7. B4.4 Hoy y Agenda: una sola regla de vencido (`shared/overdue.ts`) en Hoy, Agenda, despacho y revisión semanal; la cifra global de Agenda cuenta solo tareas y abre Hoy filtrado por Vencidas. Hoy tiene un botón relleno, Despachar junto al filtro, y estado y fecha en una sola celda. Tipos y 23/24 archivos seguros focales correctos; el fallo restante ya existía en `HEAD` (`independent-interface-contexts`, arnés sin `useContinuityState`). Revisión visual pendiente.

**Siguiente, en este orden** (tabla completa en `05-hoja-de-ruta.md`):

1. **B4.5 Listas:** columnas proporcionales con ancho máximo; vistas a 0 atenuadas; acciones globales fuera de la barra inferior.
2. **A0-L:** retirar o montar el código sin montar (`MorningBrief.tsx`, `FirstRunStrip`, `HomeSeal`, sala y cápsula de rescate) y sacar `server/recovery-rehearsal.ts` del instalable.
3. **Decisiones de la usuaria pendientes:** A7 (clave sin DPAPI/PowerShell) y custodia de la clave de licencias (A6).

**Reglas que han funcionado en esta misión:**

- **Un solo botón relleno por vista.** `tests/record-sheet.test.ts` (K8) lo comprueba en Inicio.
- **Cada dato una vez.** Si el índice de preparación ya lo dice, no se repite en avisos ni en el pronóstico (`READINESS_ALERTS`, `READINESS_OUTAGE_LINES`).
- **Al quitar bloques:**
  1. `node tools/css-unused.mjs --write`
  2. `node tools/css-unused.mjs --dedupe --write`
  3. Bajar `tests/color-guard-baseline.json` si hay menos colores fijos.
  4. `node tools/safe-tests.mjs css-unused color-guard design-tokens record-sheet`
- **Comprobar siempre** con `npx tsc --noEmit -p tsconfig.json` y las pruebas seguras del área tocada.
- **Medir antes y después** con el medidor (abajo). Ninguna pantalla se declara mejor solo porque sus piezas sean más pequeñas.
- **Sin Codex** en esta misión (orden de la usuaria). El tablón `coordination/board.json` no gobierna estas tareas.

## Herramientas de esta misión

- **Medidor de composición** (en Git): `npx tsx tools/visual/composition.mts <etiqueta> [anchos] [rutas]`.
  - Resultado: capturas y `metrics.json` en `tests/.tmp/mision/shots/<etiqueta>/`, o en `MISION_OUT`.
  - Mide scroll, desborde, mayor hueco vacío, alturas de controles, tamaños de letra, radios y botones principales.
  - Variables: `MISION_URL` (por defecto `http://127.0.0.1:4572`) y `MISION_CHROME` (ruta de un Chromium si Playwright no tiene el suyo).
  - En Git Bash hay que anteponer `MSYS_NO_PATHCONV=1`, o `/inicio` se convierte en una ruta de Windows.
- **Datos ficticios** para un ensayo nuevo y vacío: `npx tsx tools/visual/composition-seed.mts` (`MISION_API`, por defecto 4571).
- **Hoja de contactos** de capturas: `npx tsx tools/visual/contact-sheet.mts <salida.png> <columnas> <ancho> <capturas…>`.
- **Ensayo aislado** en el ordenador de `D:\AI\Plan-B-CRM-v2.1`: `.claude/launch.json` → `mision-api` (4571) y `mision-ui` (4572). Sus scripts viven en `tests/.tmp/mision/`, que no viaja con Git.
- **En el otro ordenador** sigue vigente su regla: sin servidores de prueba, navegadores ni Playwright. Allí se trabaja con `node tools/safe-tests.mjs` y `tsc`, y la revisión visual la hace la usuaria en su pestaña.
