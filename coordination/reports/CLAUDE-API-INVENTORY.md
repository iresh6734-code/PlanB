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
