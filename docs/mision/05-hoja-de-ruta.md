# Misión maestra · 5. Hoja de ruta integrada

21/11/2026. Une el Superplan A (`02`), el Superplan B (`03`) y la comercialización (`04`) en seis fases con responsables, dependencias y criterios de salida que se pueden comprobar.

## 1. Evaluación crítica y selección

Puntuación de 1 a 3 (3 = más). La prioridad combina impacto con el inverso de esfuerzo y riesgo, más su peso para vender la 1.0.

> **Límite honesto:** esta evaluación la ha hecho una sola sesión de Claude. La revisión cruzada que pide la misión exige que **el agente del otro ordenador** la contraste. Su hueco está en `registro-colaboracion.md` y no se da por hecha.

| ID | Propuesta | Impacto | Esfuerzo | Riesgo | Dependencias | ¿1.0? | Prioridad |
| --- | --- | :---: | :---: | :---: | --- | :---: | :---: |
| A8-auth | Investigar `commitments.test.ts` (401 → 200) — hecho: prueba anticuada | 3 | 1 | 1 | — | Sí | **P0 ✓** |
| B6-a11y | Contraste del menú móvil y controles de 44 px | 2 | 1 | 1 | — | Sí | **P0** |
| B3.2 | Fuera la alarma roja permanente de la barra | 2 | 1 | 1 | — | Sí | **P0** |
| A0-L | Retirar o montar código sin montar; Propuestas fuera del menú | 2 | 1 | 1 | — | Sí | P1 |
| B2 | Sistema visual único y retirada de capas | 3 | 3 | 2 | B0 | Sí | P1 (continuo) |
| A1 | Índice de preparación único | 3 | 2 | 1 | — | Sí | P1 |
| B4.1 | Inicio «puesto de mando» | 3 | 2 | 2 | A1 | Sí | P1 |
| B4.2 | Continuidad: Copia · Prueba · Vuelta | 3 | 2 | 2 | A1 | Sí | P1 |
| A7 | Clave sin PowerShell/DPAPI | 3 | 2 | 2 | Decisión de la usuaria | Sí | P1 |
| A8-vencido | Una definición de «vencido» | 2 | 1 | 1 | — | Sí | P1 |
| B4.3-4.8 | Cambios, Hoy, listas, Exportar y Ajustes | 2 | 2 | 1 | B2 | Sí | P2 |
| A2 | Cuarentena de capturas que encogen | 3 | 2 | 2 | — | Sí | P2 |
| A4 | Paquete de vuelta para producción | 3 | 2 | 2 | Sandbox de HubSpot (usuaria) | Sí | P2 |
| A3 | Simulacro programado con evidencia | 2 | 2 | 1 | A1 | Sí | P2 |
| A10-1 | Parte de incidente unido a la vuelta | 2 | 1 | 1 | A4 | Sí | P3 |
| A10-2 | Cobertura declarada frente a real | 2 | 1 | 1 | — | Sí | P3 |
| A6 | Licencias verificables en el servidor | 3 | 2 | 1 | Clave privada (usuaria) | Sí | P3 |
| A10-3 | Modo agencia (varias carpetas) | 3 | 3 | 2 | A1, A6 | **Después** | — |
| — | Laboratorio, agentes, IA real, nube, Pipedrive y Zendesk | — | — | — | — | **No** | — |

## 2. Reparto entre agentes

Se respeta el reparto inicial de la misión, ajustado a lo que cada sesión puede hacer en su ordenador.

| Responsable | Ámbito | Archivos que «posee» mientras dure su tarea |
| --- | --- | --- |
| **Claude (este ordenador)** | Auditoría, arquitectura de producto, sistema visual, composición de pantallas, revisión de integración y medición antes/después | `src/consola.css`, `src/faro.css` (solo para retirar), `src/ui/**`, `src/app-shell/TopBar.tsx`, `Sidebar.tsx`, `navigation.ts`, `HomeOverview.tsx`, `ContinuityHome.tsx`, `docs/mision/**` |
| **Agente del otro ordenador** (hoy GitHub Copilot, por los commits del 20/11) | Funcionalidad, backend, datos, pruebas y estabilidad | `server/**`, `shared/**` (salvo `shared/readiness.ts`, que se acuerda), pruebas de servidor |
| **Usuaria** | Decisiones de producto, cuentas, credenciales, despliegues y aspectos legales | — |

**Normas de convivencia:**

- La sincronización va por Git (`git pull --ff-only` antes de empezar, commit por tema y sin pisar archivos del otro).
- Cada decisión importante se anota en `registro-colaboracion.md` con fecha y autor.
- Una tarea que necesite un archivo del otro ámbito se anota allí **antes** de tocarlo.

## 3. Fases

### Fase 1 · Radiografía y estabilización

| Tarea | Responsable | Criterio de salida |
| --- | --- | --- |
| Auditoría, medidor y capturas «antes» | Claude | `docs/mision/01` y `tests/.tmp/mision/shots/antes/` (**hecho el 21/11**) |
| P0 · Contraste del menú móvil ≥ 4,5:1 y controles móviles de 44 px | Claude | **Hecho el 21/11:** 6,48:1 en claro y 9,76:1 en oscuro; campos de 44 px como los botones; prueba en `design-tokens` |
| P0 · Barra superior sin alarma roja permanente | Claude | **Hecho el 21/11:** «¿HubSpot caído?» en gris neutro (claro y oscuro), con el mismo efecto y el nombre accesible «HubSpot no responde: activar el modo contingencia» |
| P0 · Explicar o corregir `commitments.test.ts` | Claude | **Hecho el 21/11:** prueba anticuada, no regresión; reanclada y comprobada con mutación |
| Línea base de pruebas seguras registrada | Claude | **Hecho el 21/11:** 292/298, con los 6 fallos y su causa en `01-auditoria.md` §6 (5 tras corregir `commitments`) |
| A0-L · Limpieza de código sin montar | Agente del otro ordenador | Instalable sin `recovery-rehearsal.ts`; piezas montadas o retiradas |

### Fase 2 · Arquitectura del producto y diseño definitivo

| Tarea | Responsable | Criterio de salida |
| --- | --- | --- |
| Decisión B0 (Consola como identidad única) y tokens cerrados (B2.1) | Usuaria + Claude | Anotada en el registro; `DESIGN.md` con la escala única |
| Biblioteca `src/ui/` completa (B2.2) | Claude | Piezas con prueba de render y de tokens |
| Medidor como herramienta del repositorio (`tools/visual/composition.mts`) | Claude | Se ejecuta contra el ensayo y deja un `metrics.json` comparable |
| Decisión A7 (clave sin DPAPI) | Usuaria | Opción elegida y registrada |
| Contrato `shared/readiness.ts` (A1) | Claude (contrato) + agente del otro ordenador (fuentes de datos) | Tipos y pruebas por criterio |
| Una definición de vencido (`shared/overdue.ts`) | Agente del otro ordenador | Misma cifra en Hoy, Agenda, Revisión e Inicio |

### Fase 3 · Experiencia y funcionamiento esenciales

| Tarea | Responsable | Criterio de salida |
| --- | --- | --- |
| Inicio «puesto de mando» (B4.1) | Claude | ≤ 6 bloques; cada dato una vez; scroll ≤ 1,2 en escritorio y ≤ 3 en móvil. **Hecho el 21/11:** 5 bloques; 1,2 pantallas a 1440 (antes 2,14), 1,41 a 1366 (antes 2,51) y 3,19 en móvil (antes 5,2; falta 0,2 para la meta); 6 tamaños de letra (antes 13); un solo botón relleno |
| Continuidad Copia · Prueba · Vuelta (B4.2) | Claude | Un modelo de preparación; una acción principal; ≤ 6 bloques. **Primera parte hecha el 21/11:** el índice con sus cinco pasos y la acción de cada uno sustituye a la lista lateral; una sola acción principal (el siguiente paso); contingencia en secundario; informes en un menú; sello y coste de una caída a «Evidencia e impacto»; «Si HubSpot cae ahora» sin repetir el índice. 1,3 pantallas a 1440 (antes 1,67), 1,55 a 1366 (antes 1,98) y 2,96 en móvil (antes 4,03); 6 tamaños de letra (antes 11). **Falta:** reordenar las pestañas como Copia · Prueba · Vuelta (hoy siguen Estado · Evidencia · Copias · Operaciones) |
| Cambios, Hoy, listas, Exportar y Ajustes (B4.3-B4.8) | Claude | Criterios C1-C10 en cada ruta |
| Índice de preparación (A1) | Agente del otro ordenador (datos) + Claude (interfaz) | Pruebas por criterio en verde; visible en Inicio y Continuidad. **Primera parte hecha el 21/11:** `readinessDetailFor` en `continuity-insights.ts` reutiliza los cinco pasos que ya usaban Continuidad y el menú (no se crea un tercer modelo); Inicio los muestra con nombre. Falta: sustituir «Conectar» por «Copia íntegra» (A1 propuesto) y llevarlo a Continuidad (B4.2) |
| Cuarentena de capturas (A2) | Agente del otro ordenador | Prueba de captura que encoge el 20 % |
| Clave sin PowerShell (A7) | Agente del otro ordenador | Arranque sin `powershell.exe`; migración probada |

### Fase 4 · Potenciación diferenciadora

| Tarea | Responsable | Criterio de salida |
| --- | --- | --- |
| Paquete de vuelta para producción (A4) | Agente del otro ordenador (motor) + Claude (asistente) | CSV de importación probado; **recorrido auténtico en sandbox o DEVELOPER_TEST** con evidencia |
| Simulacro programado (A3) | Agente del otro ordenador | Reloj inyectado: una ejecución por mes e idempotente |
| Parte de incidente unido a la vuelta (A10-1) | Claude | Documento con duración, cambios, conflictos y decisiones |
| Cobertura declarada (A10-2) | Claude | Lista de lo no copiado junto a la cobertura |

### Fase 5 · Integración y calidad integral

- Medición después de las 19 rutas a 1440, 1366 y 390 px, en claro y oscuro, con la comparación antes/después.
- a11y sin avisos; auditoría de `/team` sin hallazgos.
- Pruebas seguras en verde salvo fallos conocidos documentados; E2E adaptadas a la nueva estructura.
- Rendimiento con 10.000 registros dentro del presupuesto.
- Retención y borrado de capturas; copia de la base antes de migrar.
- Riesgos restantes documentados en `ESTADO.md`.

### Fase 6 · Preparación para comercialización

- Licencias verificables (A6), instalador firmado y actualización.
- Documentación de cliente: instalar, simulacro, contingencia, vuelta y límites.
- Validación legal: condiciones, encargo de tratamiento y términos de la API de HubSpot.
- Kit de venta alineado con lo demostrable (ver `04`, §6).
- Piloto con una agencia y un cliente reales: **primera evidencia de producción.**

## 4. Definición de producto terminado (Plan B 1.0)

Se cumple **todo**:

1. Los procesos de copia, prueba y vuelta funcionan de extremo a extremo, con pruebas automáticas, y la vuelta tiene **una** evidencia auténtica en un portal de prueba.
2. Ninguna acción principal de la versión comercial es simulada. Lo simulado solo aparece en el modo demostración y marcado como tal.
3. Índice de preparación único, verificable y coherente en Inicio, Continuidad e informes.
4. Criterios B7 del Superplan B cumplidos y medidos.
5. Arranque sin alertas de antivirus en un Windows con Defender por defecto.
6. Licencia verificable; sin licencia, los datos nunca se bloquean.
7. Documentación de cliente y límites publicados; validación legal hecha.
8. Un piloto real completado (implantación, simulacro y, si ocurre, contingencia).
