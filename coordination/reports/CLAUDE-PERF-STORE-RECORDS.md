# CLAUDE-PERF-STORE-RECORDS · Leer registros sin volver a descifrar

**Autor:** Claude (Opus 5.5) · **Fecha:** 14/11/2026, Europe/Madrid
**Origen:** mejoras E3 y B6 de `CLAUDE-INFORME-MEJORAS-GEMINI-2026-11-13.md`, corregidas en `CLAUDE-INFORME-MEJORAS-AVANCE.md` (los datos están cifrados fila a fila, así que no caben índices SQL sobre campos)
**Archivos:** `server/store.ts` (modificado), `tests/store-records-cache.test.ts` (nuevo), este informe

## Problema medido

Cada petición de una página de registros (`GET /api/v2/records/:entity` → `Store.page`) descifraba con AES-256-GCM la tabla `records` entera y analizaba cada fila, aunque nada hubiera cambiado desde la petición anterior. Con 10.000 registros, el máximo del piloto, eso supone ~75 ms por página, de los que unos 52 ms son descifrado.

## Cambio

1. **Caché de texto descifrado dentro de `Store.decode()`**, indexada por el **texto cifrado exacto** (`enc1:…`).
   - Cada escritura sella con un IV aleatorio nuevo, así que cualquier cambio de contenido, venga de esta conexión, de otra conexión o de otro proceso, produce otra clave. **No hace falta invalidar y no se puede servir contenido antiguo.** Una fila manipulada en disco tampoco se sirve desde la caché: su texto cifrado es distinto y se descifra (y falla) igual que antes.
   - LRU con tres topes: 40.000 entradas, 48 M caracteres en total y 16 M por entrada. Una captura de 10.000 registros ocupa ~5 M (cifrado + claro) y cabe; un paquete mucho mayor no se guarda, para no expulsar todo lo demás de golpe.
   - Se vacía con `close()` y cada vez que se vacía la tabla de registros (`importSnapshot` sin copia activa, activación con sustitución y `restoreBundle`). Así el texto en claro de los registros retirados no se queda en memoria, en línea con `PRAGMA secure_delete`.
   - `JSON.parse` se sigue haciendo en cada llamada: **quien llama recibe siempre objetos nuevos**, igual que antes, y modificarlos no afecta a otras lecturas.
   - Cubre también las lecturas de `meta`, incluida la captura completa que `get ready` lee en casi cada petición.
2. **`saveRecord` cuenta con `SELECT COUNT(*)`** en lugar de descifrar la tabla entera para comprobar el límite de 10.000 en las altas.
3. **`page()` busca los relacionados con un `Map` entidad:id** en lugar de `all.find` para cada referencia. Es equivalente: solo coincide un ID de texto idéntico, como antes.

Sin cambios de contrato, rutas, esquema, formato en disco ni comportamiento visible.

**Seguridad:** el texto en claro ya está en memoria mientras se usa, y `server/crypto.ts` mantiene la clave local en `keyCache` mientras el proceso vive. La caché no añade exposición en disco ni amplía lo que obtendría quien pudiera leer la memoria del proceso.

## Medición

Script `measure.mts` (en el scratchpad de la sesión, no forma parte del repositorio): 10.000 registros ficticios en un almacén cifrado real en carpeta temporal, media de 5 repeticiones tras una de calentamiento, sin otras cargas propias. Versión anterior = `HEAD:server/store.ts`, restaurada temporalmente y devuelta verificando la huella.

| Operación (10.000 registros) | Antes | Después | Mejora |
| --- | --- | --- | --- |
| `records()` | 75,4 ms | 27,4 ms | 2,8× |
| `page(contacts, "", 0, 50)` | 84,4 ms | 38,3 ms | 2,2× |
| `page(contacts, "ana", 0, 50)` | 88,5 ms | 42,9 ms | 2,1× |
| `page(deals, "", 0, 50)` | 78,2 ms | 32,8 ms | 2,4× |
| `get ready` | 15,5 ms | 13,2 ms | 1,2× |
| `saveRecord` (edición) | 22,9 ms | 20,8 ms | 1,1× |

Una primera medición daba ~300 ms «antes», pero coincidió con la batería completa de pruebas ejecutándose y está inflada; no se usa.

Repetida con el código definitivo (topes por entrada y olvido), mientras otros agentes trabajaban en el equipo: `records()` 29 ms, páginas 43–56 ms, `ready` 17 ms, edición 26 ms. La variación entre ejecuciones es de ±25 %. La mejora se sostiene en el orden de 2× por página y casi 3× en `records()`.

**Lo que queda por debajo** son el análisis JSON de 10.000 filas (~8–10 ms), el filtrado y normalización de `page()` en memoria y el análisis de la captura completa en `get ready` (~13 ms, que se repite en cada petición). El siguiente paso con más rendimiento sería no reanalizar la captura en cada `ready`, pero toca semántica de copia de objetos y queda fuera de este encargo.

## Verificación

- `npx tsc --noEmit`: código 0.
- `tests/store-records-cache.test.ts`: **14/14**, todo sobre un almacén cifrado real salvo el caso «en memoria»:
  - Lecturas idénticas a descifrar la tabla directamente, en frío y en caliente, por entidad y completas.
  - Objetos independientes entre llamadas.
  - Cambio hecho por **otra conexión** al mismo archivo visible al momento, en `records` y en la búsqueda de `page`.
  - Ediciones propias, altas y sustitución completa por candidata y activación.
  - Topes de entradas y de caracteres respetados, con contabilidad exacta.
  - Fila manipulada en disco: falla igual que antes y no se sirve desde la caché.
  - Almacén en memoria sin cifrado sin cambios.
  - Relacionados de una página exactos y sin duplicados.
  - Límite de 10.000 conservado (413 en altas, ediciones permitidas).
  - Un acierto renueva la recencia: se desaloja el menos usado, no el más antiguo.
  - Una entrada mayor que el tope por entrada no se guarda ni expulsa a las demás.
  - Los registros retirados se olvidan en los tres sitios que vacían la tabla.
- **Mutantes: 12/12 detectados.** Objeto compartido entre llamadas, clave de caché demasiado amplia al leer, clave demasiado amplia al guardar, sin desalojo, contabilidad sin descontar, `>` en lugar de `>=` en el límite, relacionados de otra entidad, FIFO en lugar de LRU, sin tope por entrada y sin olvido en cada uno de los tres sitios que vacían la tabla. Scripts de mutantes en el scratchpad; `store.ts` restaurado por huella tras cada mutante.
- **Batería completa:** ver «Comparación con la línea base».
- **Revisión independiente:** ver la sección del mismo nombre.

## Comparación con la línea base

Línea base del 14/11 sobre el árbol sin este cambio: 3.000 pruebas, 2.958 correctas, 37 fallos, 1 omitida y 4 pendientes (`todo`). Clasificación en `CLAUDE-INFORME-MEJORAS-AVANCE.md`.

| Ejecución | Pruebas | Correctas | Fallos | Fallos nuevos frente a la línea base |
| --- | --- | --- | --- | --- |
| Línea base (sin el cambio) | 3.000 | 2.958 | 37 | — |
| Primera versión del cambio | 3.009 | 2.968 | 36 | **0** (uno de la cápsula de rescate dejó de fallar) |
| Versión final | 3.014 | 2.972 | 37 | 1, inestable (ver abajo) |

**El fallo «nuevo» de la versión final no lo causa este cambio.** Es `rescue-capsule-integrity` · «la aprobación está ligada al contenido exacto…»: compara el listado de carpetas `rescue106-*` del directorio compartido `tests/.tmp` antes y después, y las pruebas concurrentes de la cápsula crean carpetas ahí. El mismo archivo ya cambiaba de estado entre ejecuciones (otra de sus pruebas falló en la línea base y no en la primera versión). Ejecutado aislado con este cambio: **10/10 en dos pasadas**.

Huellas presentadas (SHA-256): `server/store.ts` `e233cdd52d2a7af6c115985e10530b105a3cf82ee3ae6d36d6156b8d718ca1ad` · `tests/store-records-cache.test.ts` `1745ce1e1c2617c8591e10e838a1930a344e1397f54008eb7c9a5c3c9edeb9cc`.

## Revisión independiente

Subagente revisor de solo lectura, sin shell ni escritura, sobre `server/store.ts` y la prueba. **Sin hallazgos de corrección.** Confirma que no se puede servir contenido antiguo con otra conexión, otro proceso, `migrateEncryption`, `ROLLBACK`, filas heredadas sin `enc1:` o filas manipuladas. También confirma que `page()` y `saveRecord` son equivalentes al original.

Señaló tres observaciones menores y huecos de prueba. Lo que se hizo con cada uno:

| Observación | Qué se hizo |
| --- | --- |
| Un paquete enorme (archivos, copias) podría vaciar la caché de golpe | Tope de 16 M caracteres por entrada, con su prueba y su mutante |
| El texto de registros borrados permanecía en memoria hasta su desalojo | Se olvida al vaciar la tabla en los tres sitios, con pruebas y mutantes |
| La prueba no distinguía LRU de FIFO | Prueba de recencia y mutante FIFO |
| Hasta ~96 MB por instancia en el peor caso; cada `Store` con clave tiene su caché | Se acepta: el peor caso exige datos muy por encima del piloto. Si molestara, basta con bajar `chars` |
| No cubre filas heredadas sin `enc1:` ni `page()` con referencias no textuales | Se cubren por lectura de código, no con pruebas: el camino heredado no se cachea y la comparación `typeof === 'string'` reproduce la de antes |

## Límites

- No es una prueba con datos reales ni en el piloto: almacén temporal con datos ficticios.
- No se ha medido en 4331 o 4334, ni desplegado.
- La mejora es por proceso: la caché empieza vacía en cada arranque, así que la primera página tras arrancar cuesta lo mismo que antes.
