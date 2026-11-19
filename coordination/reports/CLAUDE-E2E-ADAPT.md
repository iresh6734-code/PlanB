# CLAUDE-E2E-ADAPT · Pruebas de navegador al día y un arnés que no toca el piloto

**Autor:** Claude (Opus 5.5) · **Fecha:** 18/11/2026 · **Origen:** pendiente de CLAUDE-UI-NAV-LAB, CLAUDE-UI-COPY-D2 y CLAUDE-UI-FIXES-D4, por orden del usuario. Complemento: CLAUDE-E2E-MENU-HELPER (`tests/e2e/menu.ts`).

## El arnés: E2E sin compilar sobre el piloto

`npm run build` está prohibido porque escribe `dist/` y `build/`, que usa el piloto, así que las E2E no se podían ejecutar. Ahora sí:

- **`tools/e2e/isolated.mjs`** compila exactamente lo mismo que `npm run build`, pero en `tests/.tmp/e2e-build/`:
  - `vite build --outDir …/dist`;
  - los seis `esbuild` de servidores en `…/build`.

  Comprueba antes y después que `dist/index.html` y `build/server.mjs` del repositorio no cambian; si cambiaran, se detiene. Después ejecuta Playwright. Con `--no-build` reutiliza la compilación.
- **`tools/e2e/playwright.isolated.config.ts`** es igual que `playwright.config.ts`: mismos puertos (4337/4341), variables y servidores. La diferencia es que los servidores arrancan **desde la carpeta aislada**, que es su raíz: sirven su `dist/` y no leen `.env.local` ni `.ai.local.json` del repositorio. Usan red exterior bloqueada y carpetas de datos nuevas por ejecución.

Uso:

- `node tools/e2e/isolated.mjs` compila y ejecuta todas;
- `node tools/e2e/isolated.mjs --no-build v6 ux` ejecuta solo esas.

Comprobado: tras compilar, `dist/` y `build/` del piloto siguen con fecha 28/10.

## Qué cambió en el menú y los textos, y cómo se adaptó cada prueba

| Antes | Ahora | Adaptación |
| --- | --- | --- |
| Grupo «Trabajar» | Grupo «Clientes» | `openSection(page, 'Clientes')`; `menuGroup(page, 'Clientes')` donde se prueba el despliegue |
| «Agentes» | «Hoy › Propuestas» | `openSection(page, 'Propuestas')`. El título de la página sigue siendo «Agentes y revisiones» |
| «Proteger / bloquear» (menú) | «Bloquear Plan B» (barra superior) | `lockButton(page)` |
| Enlace «Espacio comercial» → `/team?view=company` | «Espacio de equipo» (barra superior) → `/team?view=commercial` | Nombre, destino y título esperado |
| Navegación «Secciones de trabajo» | Navegación «Clientes» (subnavegación del grupo) | Nombre del landmark |
| «Sin demostrar» | «Sin comprobar» | Texto (D2) |
| Sello «Ensayo · ficción» | «Datos de prueba» | Texto (D2) |
| «Nombre · ID x» en un nombre único | «Nombre» (el ID solo con homónimos) | Se comprueba el valor elegido y el nombre sin ID (D4) |

**`tests/e2e/menu.ts`:** `openSection` despliega el grupo si hace falta y pulsa el apartado; `menuGroup` y `menuItem` distinguen el grupo «Clientes» de su apartado homónimo; `sectionPath` da las direcciones para recorrer vistas en el móvil.

**Pruebas reescritas a mano** porque probaban el comportamiento del menú anterior. Siguen probando lo mismo sobre el nuevo:

- **`v6`:** el grupo despliega sus apartados debajo, el Tab entra en el primer apartado, el apartado elegido queda `aria-current`, plegar devuelve el Tab al siguiente grupo y los logos de Integraciones se cargan localmente. A 390 y 320 se va por dirección, porque en el móvil el menú es la barra inferior.
- **`ux`:** el recorrido de vistas a 1024, 390 y 320 sin desbordamiento va por dirección, e incluye «Propuestas» en lugar de «Agentes».
- **`full-workspace`:** el despliegue de «Clientes», los cuatro lugares visibles y el enlace al espacio de equipo.
- **`preparation-navigation`:** el control de solapamiento usa el grupo «Continuidad» en lugar de «Exportar», que ahora está plegado dentro de él.

Las demás son sustituciones directas en 21 archivos. La importación del ayudante se colocó arriba en todos. En dos archivos, el guion la había metido dentro de una plantilla de código que la prueba usa para arrancar su servidor; se detectó y se corrigió antes de ejecutar.

## Resultados

Se ejecutaron los 32 archivos con el arnés aislado, sobre la App compilada el 19/11: 171 pruebas.

| | Pasan | Fallan | No se ejecutan |
| --- | --- | --- | --- |
| Línea base, antes de adaptar | 62 | 79 | 30 |
| Final, tras adaptar | **98** | 56 | 19 |

Comparando prueba a prueba: **36 arregladas y 0 rotas** por la adaptación.

**Causas de las 56 que siguen fallando.** Ninguna es del menú ni de los textos retirados:

- **32 necesitan su banco privado o no llegan a ejecutarse.** Lo dicen en su primera línea, por ejemplo «Requires the private117 fixture», «Only new fixture4408», «candidata121 congelada propia», «servidor ficticio en loopback para el banco 328» o «manifiesto propio126». Se lanzan aparte con sus variables y fallan igual en la línea base.
- **5 de `continuity-operations`.** El rediseño de Continuidad metió el diagnóstico dentro de un `<details>` cerrado («Consultar diagnóstico de tareas y cambios»). La prueba ahora lo abre, pero el componente se monta y lee antes de abrirse, así que la prueba cuenta otras llamadas (espera 4 y recibe 1). Debe decidirlo su autor.
- **1 de `continuity`.** Supera todos los pasos de menú y falla al final por un error de consola: un 404 de `/api/v2/relay/rehearsal`, porque la compilación aislada no tiene el paquete del Kit de relevo. Es del entorno; la revisión 437 ya lo anotó.
- **2 de `continuity` («Simulacro superado»).** El simulacro en proceso aislado tarda más de 45 s en esta máquina cargada. Fallan igual en la línea base.
- **2 de `hoy-cola-jornada`** (FASES y MISMA COPIA). Son **intermitentes y previas** a mis cambios. Se comprobó exportando el commit `00261a1` (anterior al 17/11) con `git archive` y repitiendo ×4 con el mismo arnés: con el código actual, 12/12; con el anterior, 1 fallo de 12. Con una traza en la lectura, la cola se lee una sola vez al montar Hoy.
- **3 de `independent-date-check-flow-338`.** Esperan textos de «Comprobar una fecha» que su autor cambió («No cabe dentro de la semana de ensayo» frente a «No se puede prometer esa fecha…»).
- **6 de `task-d7-real-app-baseline`.** Son la «línea base 153 invertida»: están hechas para fallar contra el código actual y demostrar el defecto antiguo.
- **5 de `ux`, `v3`, `v4` (2) y `v6`.** Comprueban pantallas que ya no existen: las vistas «Hoy» e «Integraciones» de `SalesWorkspace` («Seguimientos que conviene preparar», «Tu día, con un siguiente paso.», los seis logos de `.integration-grid`), sustituidas hace tiempo por `LocalOperations` y `LocalIntegrations`. También buscan «Preparación de tu Plan B» como enlace. Rehacerlas es decidir qué deben probar ahora, y eso corresponde a sus autores.

**Ajustes del arnés durante el trabajo:**

- la espera de servidores sube de 60 a 180 s, porque la máquina está cargada;
- `openSection` espera a que se pinte alguno de los dos menús antes de decidir entre escritorio y móvil;
- en el móvil, `openSection` usa «Más» y la paleta, como una persona;
- `place()` da el lugar visible en el menú lateral o en la barra inferior.

**Propuesta de producto.** En el menú de cinco lugares, pulsar la cabecera de un grupo **cuando ya estás dentro** solo lo pliega. Por ejemplo, desde Propuestas pulsar «Hoy» no vuelve a la cola de Hoy; desde Exportar pulsar «Continuidad» no vuelve a su inicio. Las pruebas lo tropezaron tres veces. Conviene que, si no estás en el primer apartado del grupo, la cabecera lleve a él, y que solo pliegue cuando ya estás ahí.

## Huellas

Las huellas de antes de los 32 archivos de prueba están en el scratchpad (`hashes-before-e2e.txt`). 17 tenían reservas antiguas y se editaron con autorización del usuario.

**Huellas después** (las de antes están en el scratchpad, en `hashes-before-e2e.txt`):

| Archivo | Huella |
| --- | --- |
| `tests/e2e/app-lifecycle.spec.ts` | `fc392a60a69f` |
| `tests/e2e/app-refresh-notice.spec.ts` | `1d4520aabe4f` |
| `tests/e2e/auth-gate-order.spec.ts` | `6f4999937750` |
| `tests/e2e/continuity-lab.spec.ts` | `0b4cf70e8bb9` |
| `tests/e2e/continuity-operations.spec.ts` | `8046693e98cd` |
| `tests/e2e/continuity.spec.ts` | `39450efa494d` |
| `tests/e2e/date-check-app.spec.ts` | `b49321a6f919` |
| `tests/e2e/full-workspace.spec.ts` | `241cf6eeb99d` |
| `tests/e2e/hoy-cola-jornada.spec.ts` | `f20b3731a098` |
| `tests/e2e/hoy-recuperable-harness.ts` | `367b4ff678ad` |
| `tests/e2e/hubspot-read-check-integration.spec.ts` | `94dbeac1c2f8` |
| `tests/e2e/independent-interface-flows.spec.ts` | `6394a4a23707` |
| `tests/e2e/independent-task-mount.spec.ts` | `5470f45a6620` |
| `tests/e2e/main-app-readiness.spec.ts` | `19b1f9b61ba3` |
| `tests/e2e/operational-rehearsal-today.spec.ts` | `662637d5609a` |
| `tests/e2e/operational-rehearsal.spec.ts` | `b4a8528bba1c` |
| `tests/e2e/preparation-navigation.spec.ts` | `171ee07d8704` |
| `tests/e2e/protection-review.spec.ts` | `8a0e766f2d53` |
| `tests/e2e/task-d7-real-app-baseline.spec.ts` | `8e57c6110323` |
| `tests/e2e/task-d7-real-app.spec.ts` | `6be55601584b` |
| `tests/e2e/task-parent-state.spec.ts` | `33127fea913e` |
| `tests/e2e/ux.spec.ts` | `135585bc912b` |
| `tests/e2e/v3.spec.ts` | `c2bc3610aec0` |
| `tests/e2e/v4.spec.ts` | `78e67027b037` |
| `tests/e2e/v6.spec.ts` | `323d7d5070b0` |
| `tests/e2e/menu.ts` | `30481e0c0652` |
| `tools/e2e/isolated.mjs` | `1f810e644aec` |
| `tools/e2e/playwright.isolated.config.ts` | `4ccdbd7d98bc` |
