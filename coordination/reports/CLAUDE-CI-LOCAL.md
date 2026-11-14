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
