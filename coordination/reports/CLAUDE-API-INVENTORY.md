# CLAUDE-API-INVENTORY · Inventario de la API desde los servidores reales

**Autor:** Claude (Opus 5.5) · **Fecha:** 14/11/2026, Europe/Madrid
**Origen:** mejora B5 de `CLAUDE-INFORME-MEJORAS-GEMINI-2026-11-13.md`, primer paso: saber qué existe antes de unificar
**Archivos:** `tools/api/{inventory,capture-hooks,capture-register,fastify-capture}.mjs`, `tools/api/README.md`, `docs/api.md` (generado), `tests/api-inventory.test.ts`, este informe. **No toca `server/` ni `package.json`.**

## Qué hay ahora

[`docs/api.md`](../../docs/api.md) lista **170 rutas**, cada una con su método, su grupo de versión, las entradas que la sirven y el archivo que la declara:

| Grupo | Rutas | main | runtime | equipo |
| --- | --- | --- | --- | --- |
| v2 | 38 | 38 | 25 | 0 |
| v3 | 3 | 3 | 2 | 0 |
| v4 | 10 | 10 | 10 | 0 |
| v5 | 5 | 5 | 0 | 0 |
| v6 | 2 | 2 | 0 | 0 |
| v7 | 38 | 38 | 36 | 0 |
| sin versión | 19 | 19 | 13 | 0 |
| team | 54 | 0 | 0 | 54 |
| fuera de /api | 1 | 0 | 0 | 1 |
| **Total** | **170** | **115** | **86** | **55** |

El recuento del informe original («193 rutas») salía de buscar `app.get(...)` con una expresión regular. Mezclaba los servidores de la sala y la cápsula de rescate y no veía las rutas declaradas con constantes. Este inventario lo sustituye.

## Cómo se obtiene

Cada entrada se arranca de verdad en una carpeta temporal nueva:
- con datos vacíos, `NODE_ENV=test`, solo las variables de entorno imprescindibles y la red exterior bloqueada;
- con la carpeta temporal como directorio de trabajo, así que **no lee `.env.local`**.

Un gancho de resolución (`module.registerHooks`, la API vigente de Node 24) sustituye `fastify` por un envoltorio solo para los módulos de `server/`. El envoltorio anota cada ruta con el archivo y la línea de la pila; al llamar a `listen`, escribe la lista y termina. El inventario comprueba que `app.server.listening` es falso y que no se creó `.endpoint.json`.

## Verificación

- `tests/api-inventory.test.ts` **8/8**. Comprueba:
  - agrupación por versión, incluidas las de dos cifras;
  - unión de entradas sin duplicados;
  - documento sin números de línea;
  - `routeDiff`;
  - captura real de `main` con orígenes exactos, cotejando la línea anotada con el código fuente;
  - ausencia de `HEAD`, de puerto abierto y de archivo de descubrimiento;
  - que `runtime` no sirve el generador;
  - captura real del **servicio de equipo** con su base incrustada temporal;
  - que el hijo **no hereda secretos** (`PLANB_HUBSPOT_TOKEN`, `GOOGLE_*`, `DATABASE_URL`, `NODE_OPTIONS`, `USERPROFILE`, el `PLANB_DATA_DIR` real);
  - que `--check` acepta un documento recién generado, rechaza uno al que le falta una ruta (y la nombra) y no toca `docs/api.md`.
- **Mutantes 10/10 detectados:**
  - `HEAD` sin filtrar;
  - línea desplazada;
  - ruta absoluta en el origen;
  - `listen` que abre el puerto real;
  - versión mal agrupada;
  - diff invertido;
  - `--check` siempre correcto;
  - filas sin unir;
  - `--out` que escribe en `docs/api.md`;
  - hijo que hereda todo el entorno.

  Los tres que sobrevivieron a la primera tanda llevaron a reforzar la herramienta (comprobación de `listening`) y la prueba.
- `tsc --noEmit` 0. `node tools/api/inventory.mjs --check` → «docs/api.md al día: 170 rutas».
- La primera versión usaba `module.register`, que está obsoleto. La sustituí por `registerHooks`; el documento generado es idéntico byte a byte.

## Revisión independiente

Subagente revisor de solo lectura. **Sin defectos graves ni de seguridad**: confirma que el hijo no puede leer `.env.local` ni datos reales, que PGlite no deja procesos vivos, que no se abren puertos y que una entrada colgada muere por tiempo límite. Lo que se hizo con cada observación:

| Observación | Qué se hizo |
| --- | --- |
| Los límites no decían que faltan los servidores de rescate ni las rutas del piloto y del modo gestionado de `/team` | Añadido al documento generado y al README |
| Un fallo al borrar la carpeta temporal enmascaraba el error original | Limpieza en `try/catch` con aviso |
| 180 s por entrada podían agotarse con el equipo cargado | 300 s |
| La entrada de equipo y la herencia del entorno no tenían prueba | Dos pruebas nuevas y un mutante |
| Un auxiliar de `server/` que registre rutas para otros se llevaría la atribución | Se acepta: hoy no existe. Si apareciera, la ruta seguiría inventariada, solo con otro origen |

## Límites

- Solo las rutas de la configuración por defecto. `/team` se inventaría en modo demo, así que faltan:
  - las rutas del piloto local;
  - las del modo gestionado (por ejemplo `/internal/dispatch`);
  - las que exigen credenciales: OAuth de HubSpot, Google, Copilot e identidad gestionada.
- No incluye los servidores propios de la sala y la cápsula de rescate, que solo arrancan desde sus scripts de demostración.
- Sin la ruta estática `/*`, porque la carpeta temporal no tiene `dist/`.
- No documenta permisos ni formas de petición y respuesta.
- `docs/api.md` caduca cuando alguien añade o retira una ruta. `--check` lo detecta (y la CI local lo ejecuta), pero **no se ha añadido a `npm test`**, para no romper las pruebas de otros agentes cada vez que montan una ruta.

## Siguiente paso propuesto (para Codex, que coordina `server/`)

Con el mapa delante, B4 (registro de módulos en lugar de montajes repetidos en `main.ts` y `runtime.ts`) y B5 (fachada `/api/v8` documentada) se pueden plantear sobre datos: hoy `runtime` sirve 86 de las 115 rutas de `main`, y v2 y v7 concentran el 45 % de la API.

## R2 · Corrección pedida en CODEX-API-REVIEW-358 (17/11/2026)

- **F1, selección vacía destructiva (confirmado).** Con `--entries ","`, el CLI generaba un documento de 0 rutas y podía sustituir `docs/api.md`. Ahora `parseArgs()` valida toda la línea de órdenes **antes** de capturar, leer o escribir, y sale con código 2 y la sintaxis de uso. Rechaza:
  - opciones desconocidas o repetidas;
  - valores ausentes o que empiezan por `--`;
  - piezas vacías y entradas desconocidas o repetidas;
  - las combinaciones `--json` con `--check`, `--out` o `--doc`, `--check` con `--out` y `--doc` sin `--check`.

  Una selección parcial solo se acepta con destino explícito (`--out`, o `--check --doc`) o hacia la salida estándar (`--json`): `docs/api.md` siempre recoge las tres entradas.
- **F2, atribución por entrada (confirmado).** Si todas las entradas declaran la ruta en el mismo archivo, se muestra ese archivo. Si difieren, cada archivo va con su entrada (`main: \`a.ts\` · runtime: \`b.ts\``), así que cambiar la atribución cambia el documento. El documento actual no tiene ninguna fila así y queda idéntico.
- **Pruebas 11/11.** Son tres nuevas:
  - 15 combinaciones inválidas rechazadas por `parseArgs`, y las válidas aceptadas;
  - el CLI real con un archivo marcador previo y cuatro órdenes inválidas: código 2, uso impreso y marcador intacto;
  - la atribución con archivos iguales, distintos e intercambiados.
- `node tools/api/inventory.mjs --check` → al día, 170 rutas. `tsc` 0.

## R3 · Corrección pedida en CODEX-API-R2-386 (17/11/2026)

- **Selección parcial hacia el documento canónico (confirmado).** `--entries runtime --out docs/api.md` sustituía las 170 rutas por 86. Ahora `parseArgs` compara la ruta de destino **normalizada** (y en Windows sin distinguir mayúsculas) con `docs/api.md`, y rechaza con código 2 cualquier selección parcial que lo escriba (`--out`) o lo compruebe (`--doc`), aunque la ruta esté escrita de otra forma (`./docs/../docs/api.md`, ruta absoluta, `DOCS/API.MD`). Una selección parcial hacia otro archivo sigue permitida.
- **Entradas heredadas (confirmado).** `constructor`, `toString`, `__proto__` y `hasOwnProperty` ya no pasan: la validación usa `Object.hasOwn`. `captureEntry` y `childEnvironment`, que pueden llamarse directamente, hacen la misma comprobación.
- **Pruebas 12/12.** La nueva cubre las cuatro formas de apuntar al canónico, las mayúsculas en Windows, las cuatro claves heredadas en los tres puntos de entrada, la salida separada permitida y el CLI real (código 2 y `docs/api.md` intacto).
- `docs/api.md` regenerado: **171 rutas**, una más por `POST /api/v2/changes/undo-last` de `CLAUDE-UNDO-LAST`. `--check` al día y `tsc` 0.
