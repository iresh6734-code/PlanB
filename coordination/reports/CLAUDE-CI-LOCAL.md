# CLAUDE-CI-LOCAL · CI local reproducible

**Autor:** Claude (Opus 5.5) · **Fecha:** 14/11/2026, Europe/Madrid
**Origen:** mejora E1 de `CLAUDE-INFORME-MEJORAS-GEMINI-2026-11-13.md`, y la parte A3 (línea base de pruebas)
**Archivos:** `tools/ci/{run,compare}.mjs`, `tools/ci/known-failures.json`, `tools/ci/README.md`, `tests/ci-compare.test.ts`, este informe. **No toca `package.json`.**

## Qué resuelve

Hasta ahora nadie podía responder con un comando a esta pregunta: «¿he roto algo?». `npm test` daba unos 37 fallos que había que repasar a mano, y casi todos eran ajenos.

```bash
node tools/ci/run.mjs
```

1. Ejecuta `tsc --noEmit`.
2. Ejecuta la batería con `NODE_ENV=test` y el reportero `spec` fijado, sin colores y con un tope de 60 minutos.
3. Compara cada fallo (archivo y nombre exacto) con `known-failures.json`, que da causa y responsable de cada uno.
4. Comprueba que `docs/api.md` está al día.

Termina en **rojo** en estos casos:
- errores de tipos;
- un fallo nuevo;
- un fallo conocido estable que ya pasa (hay que retirarlo de la lista; si no, su regresión posterior pasaría inadvertida);
- una salida que no cuadra: sin resumen, sin pruebas, con fallos o cancelaciones sin listar, o con código de error sin fallos listados;
- `docs/api.md` desactualizado.

Los registros y `report.json` quedan en `tests/.tmp/ci/<fecha>/`.

## Lo que ya ha demostrado

- **Con `NODE_ENV=test`, los fallos pasan de 37 a 22.** Confirma que 13 se debían solo a que `npm test` no define esa variable. La línea de `package.json` sigue propuesta a Codex, porque es un archivo común.
- **Detectó una regresión real de otro agente en su primera ejecución completa con lista.** `src/api.ts` cambió a las 12:54 del 14/11 sin encargo en el tablón (mensaje amable para la falta de respuesta) y rompe `tests/independent-return-integrity-ui.test.ts:187`. Falla también aislada. Se avisó por el chat del tablón. **No** se ha añadido a la lista de conocidos: debe seguir saliendo en rojo hasta que su autor la resuelva.
- Clasificó los 24 fallos conocidos:
  - 15 son sondas de revisores que documentan defectos abiertos;
  - 7 de la cápsula de rescate dependen de 133 carpetas `rescue106-*` que quedan en `tests/.tmp` desde el 02/11 (marcadas como inestables);
  - 1 es la entrada portátil sirviendo una ruta exclusiva de main (decisión de Codex);
  - 1 es un arranque lento bajo carga (inestable).

## Verificación

- `tests/ci-compare.test.ts` **11/11**:
  - lectura de salidas **reales** de `node:test` lanzadas en el momento (fallo con caracteres especiales, subprueba, `todo`, archivo que no llega a cargar);
  - salida sin fallos;
  - barras de Windows;
  - fallos duplicados;
  - un fallo sin «test at» no hereda archivo;
  - comparación de nuevos, conocidos, resueltos e inestables, cada caso aislado;
  - validación de la lista y del archivo real;
  - patrones de `--tests`;
  - salidas que no cuadran.
- **Mutantes 12/12 detectados** sobre `compare.mjs` y `run.mjs`:
  - duración sin quitar;
  - barras sin normalizar;
  - duplicados;
  - inestables contados como resueltos;
  - causa no exigida;
  - `ok` que ignora nuevos;
  - repetidos admitidos;
  - patrón que cruza carpetas;
  - resuelto que no hace fallar;
  - archivo heredado entre fallos;
  - batería vacía aceptada;
  - patrones no admitidos aceptados.
- `tsc --noEmit` 0.
- Ejecuciones completas reales de la CI: ver la sección «Ejecución final».

## Revisión independiente

Subagente revisor de solo lectura. Lo que se hizo con cada observación:

| Observación | Gravedad | Qué se hizo |
| --- | --- | --- |
| Un conocido arreglado y luego roto de nuevo seguiría en verde | Importante | Un conocido estable que ya pasa hace fallar la CI |
| Fallos de la cápsula con la misma causa, marcados de forma desigual como inestables | Menor | Las 7 marcadas, con la causa explicada |
| Descodificar trozo a trozo podía partir un `✖` y perder un fallo | Menor | `setEncoding('utf8')` en los flujos |
| Un `✖` sin «test at» heredaba el archivo anterior | Menor | Se reinicia tras cada fallo, con prueba |
| Batería con 0 pruebas daba verde | Menor | Se trata como rota |
| Reportero y colores sin fijar; sin tiempo límite | Menor | `--test-reporter=spec`, `NO_COLOR`, tope de 60 min |
| `--tests` con `**`, `?`, `{}` filtraba mal los conocidos | Menor | Se rechazan de entrada |
| Nombres repetidos en el mismo archivo se colapsan | Aceptado | Limitación documentada: `node:test` no da forma fiable de distinguirlos |
| Sin prueba de integración de `run.mjs` completo | Aceptado | Se cubre con las ejecuciones reales documentadas abajo; una prueba así tardaría lo mismo que la batería |

## Ejecución final

Tres ejecuciones completas en este equipo el 14/11:

| Ejecución | Pruebas | Correctas | Fallos | Resultado |
| --- | --- | --- | --- | --- |
| Sin lista de conocidos (línea base con `NODE_ENV=test`) | 3.027 | 3.000 | 22 | 22 «nuevos»: con ellos se escribió la lista |
| Con la lista inicial | 3.028 | 3.000 | 23 | 2 nuevos: arranque lento bajo carga (aislado pasa; añadido como inestable) y la regresión de `src/api.ts` |
| **Final, tras la revisión** | **3.037** | **3.009** | **23** | **1 nuevo, la regresión de `src/api.ts`**. 22 conocidos siguen fallando, 2 inestables pasaron, tipos correctos, `docs/api.md` al día |

El rojo final es correcto: es la regresión real descrita arriba, ajena a este encargo. En cuanto su autor la resuelva, la CI saldrá «CORRECTA» sin tocar nada aquí.

## Límites

- Solo pruebas unitarias. Los E2E de Playwright necesitan navegador y arneses propios.
- Una ejecución completa tarda ~19 minutos en este equipo y es sensible a la carga: conviene lanzarla sin otras baterías en marcha.
- `known-failures.json` hay que mantenerlo. La CI obliga a retirar lo que ya pasa, pero añadir una entrada exige criterio humano (causa y responsable).

## R2 · Corrección pedida en CODEX-CI-REVIEW-356 (17/11/2026)

- **F1, verde con todas las pruebas omitidas (confirmado).** Antes, una batería con solo pruebas omitidas o pendientes salía en verde. Ahora:
  - se exige al menos un resultado ejecutado (`pass > 0` o fallos listados);
  - `compare.mjs` lee también las pruebas que **se ejecutaron y pasaron** (líneas `✔` sin `# SKIP` ni `# TODO`).

  Con eso, un fallo conocido se clasifica como:
  - **sigue fallando**;
  - **pasó** (estable: rojo hasta retirarlo; inestable: informativo);
  - **sin resultado** (omitido, renombrado o retirado): rojo, porque su ausencia no acredita nada.

  El nombre de una prueba que pasa no trae archivo en la salida de `node:test`: es un límite documentado.
- **F2, el hijo heredaba el entorno (confirmado).** Ahora recibe una **lista explícita** (`CHILD_ENV_KEEP`): sistema y perfil de Windows, que Node, PowerShell (DPAPI) y los procesos de prueba necesitan. Nada de `PLANB_*`, `HUBSPOT_*`, `GOOGLE_*`, `DATABASE_URL` ni `NODE_OPTIONS`.
- **Además:**
  - la línea de órdenes se valida antes de ejecutar nada (código 2);
  - `--skip-types` y `--known` sirven para ejecuciones focalizadas;
  - el tope de 60 minutos termina el árbol de procesos en Windows (`taskkill /T`).

  Sobre esto último: lo propuse pensando que el tope no cortaba, pero el diagnóstico era erróneo (fue `tsc`, que tardó una hora por la carga). Lo mantengo como medida defensiva y su prueba no lo distingue de un `kill` simple.
- **Pruebas 18/18.** Además de las unitarias, ejecutan el **CLI real** sobre pruebas sintéticas y comprueban su código de salida:
  - éxito y fallo nuevo;
  - conocido que sigue fallando (verde) y conocido omitido («SIN RESULTADO», rojo);
  - solo omitidas, solo pendientes y mezcla con resultado;
  - una variable canaria del padre que no llega al hijo;
  - argumentos inválidos (código 2 sin ejecutar nada).
- **Mutantes 6/6 detectados:**
  - sin resultado no hace fallar;
  - omitidas contadas como pasadas;
  - ausencia de fallo contada como pasada;
  - solo omitidas en verde;
  - hijo que hereda todo el entorno;
  - opción desconocida aceptada.

**Ejecución completa del 17/11, con el equipo al 100 % de CPU por otras sesiones** (`tsc` tardó una hora; la batería, 40 minutos frente a 18):
- 3.068 pruebas, 3.035 correctas, 24 fallos, 4 canceladas.
- La CI marcó **4 conocidos «sin resultado»**: Codex los había arreglado o sustituido (G6, la entrada portátil y las dos observaciones de la ficha de tarea). Se retiraron de la lista (24 → 20).
- Marcó también **13 fallos «nuevos» y 4 cancelaciones**. Los 7 archivos afectados, ejecutados aislados **con el entorno acotado y con el entorno completo**, pasan todos en los dos modos:

| Archivo | Acotado | Completo |
| --- | --- | --- |
| recovery-rehearsal | 7/7 | 7/7 |
| task-intents-entrypoints | 10/10 | 10/10 |
| task-save-outcome | 55/55 | 55/55 |
| independent-rehearsal-contracts | 11/11 | 11/11 |
| recovery-rehearsal-cli | 2/2 | 2/2 |
| migration-verifier | 24/24 | 24/24 |
| relay-rehearsal | 24/24 | 24/24 |

Esos fallos los causó la carga, no el entorno acotado. Lección práctica: **la CI completa solo es concluyente con el equipo tranquilo**. Bajo carga sirve para encontrar candidatos, que luego se confirman aislados.

## R3 · Corrección pedida en CODEX-CI-R2-390 (17/11/2026)

- **Homónimas en otro archivo (confirmado).** Una conocida omitida en `a.test.mjs` contaba como pasada si pasaba una homónima de `b.test.mjs`. Ahora las pasadas salen de un **reportero estructurado** (`compare.mjs`, exportación por defecto), que `run.mjs` carga junto a «spec» con `--test-reporter`. Escribe un `results.jsonl` con el archivo, el nombre y las marcas de omitida y pendiente de cada evento `test:pass` y `test:fail`.
- `parseResults` excluye omitidas y pendientes **antes** de clasificar, y `compareFailures` compara las pasadas por **archivo::nombre**, como ya hacía con los fallos. `parseTestOutput` deja de devolver pasadas solo por nombre, para que nadie las vuelva a usar por error.
- `eventFile` reduce la ruta del evento (ruta o URL `file:` de Windows) a la ruta relativa del repositorio.
- **Pruebas 20/20.** Las nuevas son:
  - la homónima de otro archivo deja la conocida «sin resultado»;
  - `eventFile` con ruta, URL codificada, mayúsculas y rutas fuera del repositorio;
  - **CLI real** con `a.test.mjs` (A omitida) y `b.test.mjs` (homónima que pasa): código 1 y A en `noResult` tanto si es inestable como si es estable;
  - control: A ejecutada y aprobada en su archivo da código 0 y «inestable que pasó».

  Se conservan el mínimo de una prueba ejecutada y el entorno acotado de la R2.
- **Mutantes 2/2 detectados:** atribuir las pasadas solo por nombre y contar las omitidas como pasadas. `tsc` 0.
