# CLAUDE-QA-052 · Auditoría adversa de recuperación, cobertura y candidata portátil

30/10/2026. Una sesión Claude, sin subagentes. Revisión independiente por hashes de BACKUP041, SAFE049 y REL046. **No es una aceptación del tablón, ni de las fuentes, ni un despliegue.** Ningún archivo de Codex ni de RESTORE050 se leyó como entrega ni se editó.

## 1. Resultado ejecutivo

| Unidad | Dictamen | Resumen |
|---|---|---|
| **BACKUP041** (verificador de copia portátil) | **Favorable con un hallazgo** (F1, bajo-medio) | Ninguna de ~90 mutaciones de historial, sobre, contraseña, tamaño, destino y devolución llegó a «válida» ni lanzó excepción. Hallazgo: una operación `sending` fuera de un plan `applying` sobrevive a la restauración y el verificador informa 0 inciertas. |
| **SAFE049** (cobertura frente a una referencia) | **Favorable, sin hallazgos de producto** | 6 semillas × 6 operaciones + casos concretos: el estado `missing-local-changes` y su recuento coinciden con mi secuencia; ramas, reversión A→B→A, contexto, identidad, fechas y 10.000 registros no producen una cobertura falsa. Límites declarados abajo. |
| **REL046** (candidata portátil) | **Con hallazgos** (F2 medio latente, F3 bajo) | Carpeta nueva por ejecución, hashes, exclusiones, enlaces, límites, cambios durante la captura y fallos de typecheck/pruebas se comportan con honestidad. Hallazgo: los activos públicos de extensión o mayúsculas no listadas desaparecen sin aviso y el check `public-assets` sale «ok». |

Resultado propio de las suites: **35 pruebas, 33 pasan, 2 fallan a propósito** (`HALLAZGO F1`, `HALLAZGO F2`: reproducen defectos; no son skip ni TODO y no se cuentan como aprobadas). `npx tsc --noEmit` sin errores.

## 2. Qué se revisó (hashes SHA-256, iguales al inicio y al final)

| Fuente | SHA-256 |
|---|---|
| server/recovery-preflight.ts | `5cbcd229a9b7e5ba08ac7b785542819e937412f9ae9def176d0f5b6776636a3b` |
| server/backup-coverage.ts | `be819d0ab21cae9501fac5f15c19190f6a94becd02c62936f93873641a3a6940` |
| server/recovery-copy.ts | `d1507b0bcc64345c8630a723b7040db4bf22a9b7582f6653736dbd6903f6c6f0` |
| scripts/check-recovery-copy.ts | `b30b4489f572cd1d62da35e14cf2c4bf54778c83ec0bf065a46f54757b1a3b70` |
| scripts/check-backup-coverage.ts | `2f97d79e172e4c9955ed49c22b53e4376bd270c7e39d0b0da2859967ae7ebd98` |
| scripts/prepare-release-candidate.mjs | `bd3d83880bb20d2356b3beab528db0f0685879266c6232673f7450f0dceb8d88` |
| Leídas (contrato, no revisadas): server/store.ts `837d54fa…`, server/crypto.ts `fe126b84…`, shared/model.ts `1276b6ac…`, server/recovery.ts `ec23cf90…`, shared/fixtures.ts `d21145d0…`, tools/coordination/core.mjs `6d8a9b7e…`, scripts/block-external.cjs `5a52e4ca…` | (prefijos de 8 hex) |

Cotejo final: los hashes de las nueve primeras filas y de las leídas coinciden con los iniciales. Las pruebas se ejecutan contra el checkout o contra una copia efímera de `server/`, `shared/` y `scripts/` seleccionada con `QA052_ROOT` / `QA052_SCRIPT`; se verificó que la copia tiene el mismo hash que el original antes de mutarla.

## 3. Pruebas propias (hashes)

| Archivo | SHA-256 | Resultado |
|---|---|---|
| tests/independent-recovery-integrity.test.ts | `12bb554cb14f7c2c87d4add95b4416b052127b5c12e6ac790089e6c10d0057c0` | 13 pruebas: 12 pasan, 1 falla (HALLAZGO F1) |
| tests/independent-backup-coverage.test.ts | `808e4fb301a0fb5f280a19423cc21ee1d1fcb7331d2a8aece6dcaee5fc6da214` | 11/11 |
| tests/release-candidate-adversarial.test.mjs | `ab3f937348922f84b341d269eacd30b394ec99cf2c1d60a035abd4db58e6fba9` | 11 pruebas: 10 pasan, 1 falla (HALLAZGO F2) |

Comandos: `node --import tsx --test tests/independent-recovery-integrity.test.ts` · `node --import tsx --test tests/independent-backup-coverage.test.ts` · `node --test tests/release-candidate-adversarial.test.mjs` (≈15 s, ≈50 s, ≈70 s). Sin dependencias nuevas ni `npm run build`. Ningún `skip`/`todo`; los límites de entorno se declaran con `diagnostic`.

Todo lo demás es mío y está en `tests/.tmp/qa052/` (scratch permitido): `mutate.mjs` (aplica una mutación a una copia efímera y ejecuta el banco contra ella) y `probe1.ts` (matriz estado-del-plan × estado-de-operación del hallazgo F1).

## 4. Matriz de familias y resultados

### BACKUP041 (13 pruebas, `independent-recovery-integrity`)
Antes de cada rechazo se exige que el original sea válido y que la mutación siga siendo esquema-válida, para que el código esperado no lo enmascare otro error.

- **Historial (20 casos)** → todos `INTEGRITY_FAILED`: registro activo alterado sin operación, `before`/`after` que no corresponden, update↔create invertidos, create con `before`, IDs duplicados / fuera de orden / no positivos, entidad o `recordId` incoherentes, registros activos añadidos / omitidos / duplicados, registro de captura omitido, cambios borrados, generación no aprobada, captura con registro duplicado, referencia rota y campo obligatorio vacío con historial coherente.
- **Forma y límites (7 casos + 6 JSON de otro tipo)** → `INVALID_BUNDLE` / `INVALID_JSON`: 10.001 registros activos y de captura, clave extra, formato desconocido, fecha inválida, watermark negativo, BOM, anidamiento de 2 M de corchetes (sin desbordar la pila).
- **Formatos y clase:** v1 de ensayo se admite; producción en claro → `PRODUCTION_REQUIRES_ENCRYPTION`; producción v2 cifrada → `INVALID_BUNDLE`; producción v3 cifrada válida con `REAL_DATA_POLICY`. Destino: portal/clase/mayúsculas/espacios → `incompatible` (sin normalizar); 5 destinos mal formados → `INVALID_TARGET`.
- **Sobre cifrado (20 alteraciones):** sal de 15/17 bytes, sin relleno, con salto de línea, numérica; `kdf` distinto, clave extra, `kdf` ausente; prefijo de datos, base64 no canónico/URL-safe, 29 bytes; bit del IV, de la etiqueta y del cuerpo, último byte, un byte menos/más, sal intercambiada. Resultado: el rechazo previsto (`INVALID_ENVELOPE` o `DECRYPT_FAILED`), nunca excepción, ni contraseña ni `enc1:` en el resultado. Reordenar claves o dar formato al JSON sigue siendo válido y cambia el hash de los bytes.
- **Contraseña:** ausente, vacía, con espacio, mayúsculas, truncada, con salto final, 200 caracteres (incorrecta) y 201 / tipo erróneo (`INVALID_PASSWORD_INPUT`); la contraseña intentada no se refleja; en copias sin cifrar se ignora.
- **Independencia del formato:** un sobre construido por mí desde la especificación (scrypt + AES-256-GCM, `iv|tag|cuerpo`) se abre en producción; carga no JSON → `DECRYPT_FAILED` (límite documentado: comparte código con contraseña errónea); cargas `[]`, `"x"`, `null` → `INVALID_BUNDLE`; dos cifrados del mismo contenido: bytes distintos, mismo resumen.
- **Entradas y tamaño:** `undefined`, `null`, número, objeto, array y `Buffer` → `SIZE_LIMIT` sin excepción; exactamente 32 MiB se examina, +1 byte se rechaza; el límite cuenta bytes UTF-8, no caracteres.
- **Devolución:** aprobación → `approvalWouldBeReset` y, en una restauración independiente, el plan queda en `review` sin `approvedAt`; `applying` + `sending` → 1 incierta; watermark en tres posiciones (0, último−1, último) con historial total ≠ pendientes; watermark un paso por delante → rechazo; comprobación manual válida y tres desvíos (watermark, sesión, captura) → rechazo; mapa de IDs válido solo para un alta local; cuenta de devolución, cuenta/origen del plan y operación sobre registro inexistente → rechazo.
- **Resumen, determinismo y efectos:** recuento propio (activos, de captura, por entidad, historial, pendientes) coincide; dos inspecciones iguales; hash = SHA-256 de los bytes; directorio de trabajo sin ficheros nuevos; el Store del llamante queda idéntico.
- **CLI `check-recovery-copy` (3 pruebas, procesos reales con `block-external.cjs`):** ayuda por defecto sin leer archivos ni stdin; 9 usos incorrectos → 2 sin eco del canario de argv; contraseña por argv rechazada; stdin de 201 caracteres y de >802 bytes → 2; salto de línea final admitido; válida 0, inválida/incompatible 1; archivo inexistente, directorio, UTF-8 inválido y 32 MiB + 1 → 2; bytes de entrada intactos y sin ficheros nuevos; **canarios** en nombre, correo, campo libre, texto de origen y valor sin historia, además de la contraseña, ausentes en stdout/stderr (el ID del portal sí aparece: metadato permitido).

### SAFE049 (11 pruebas, `independent-backup-coverage`)
Oráculo: una cadena de operaciones generada con `Store` (semilla `mulberry32`, 6 semillas × 6 operaciones, exports intermedios) y un índice por operación; **no** se usa `canonical`/prefijo de producción. El orden de claves se invierte con una función propia.

1. Reflexividad (también entre dos cifrados con sal distinta, `byteIdentical=false`).
2. Cambiar `exportedAt` (incluso a 2099) o invertir el orden de claves → `matches-reference`.
3. Prefijo: `missing-local-changes` y `missingLocalChanges = j − i` (contado de mi secuencia) en plano y cifrado; fechas invertidas (la más reciente es la más corta) no cambian nada.
4. Reversión A→B→A: valores finales idénticos, `missingLocalChanges = 2`, 0 registros distintos.
5. Dirección inversa y bifurcación (mismo número de entradas, rama más larga, más corta): `different-revision`, `missingLocalChanges = null`; control con prefijo real = 1.
6. Mismos registros con sesión / generación / nombre de captura / configuración / watermark / mapping distintos: no es la misma revisión, marca la diferencia correcta y **tampoco** cuenta como prefijo cuando la copia es más corta.
7. Mismo ID de captura con contenido alterado → `snapshotChanged`, `changedRecords = 1`, sin cobertura.
8. Portal, origen, entorno declarado frente a ausente, tipo de cuenta, fecha e ID de captura distintos, y clase de datos (producción v3 cifrada frente a ensayo) → `incompatible`, `differences = null`, sin identidad inventada; con prefijo también.
9. (cubierto en 3) fechas invertidas, iguales o futuras no ordenan historia.
10. 10.000 registros: cambio, ausencia y añadido del último registro se cuentan (1/0/0, 0/1, 1 y 0); ambos paquetes son válidos de antemano.
11. El orden de los arrays sí es significativo: reordenar `records` no es `matches-reference` (límite documentado, 0 registros distintos).
- **CLI `check-backup-coverage` (3 pruebas):** ayuda por defecto; 7 usos incorrectos y 7 stdin inválidos (vacío, no JSON, array, clave extra, no cadena, 201, >4096 bytes) → 2; contraseñas distintas para referencia y copia, intercambiarlas → `invalid`; sin contraseñas → `invalid` (no error de uso); dos cifrados del mismo contenido → exit 0, `byteIdentical=false`, `sameInputFile=false`; misma ruta dos veces → `sameInputFile=true`; mismos bytes en otra ruta → `byteIdentical=true`, `sameInputFile=false`; canarios y ambas contraseñas ausentes de la salida; entradas intactas y sin salidas nuevas; inexistente, directorio, >32 MiB → 2.

### REL046 (11 pruebas, `release-candidate-adversarial`)
Se copia la herramienta **exacta** (hash fijado) a un workspace mecánico `tests/.tmp/qa052/ws-*` con un enlace de solo lectura (junction) a `node_modules`. Ese workspace **no es Plan B** y sus «pruebas de negocio» están vacías: solo prueban rutas, activos, límites y manifiesto. Cero compilaciones reales de Plan B.

- Sin `--prepare` exacto: ayuda y salida 0; 7 variantes (`--prepare --help`, `prepare`, `--PREPARE`, `-p`, …) → 2 y ninguna carpeta (ni siquiera `release-candidates`).
- Candidata completa: `compiled-and-node-verified`, `approved/deployed/releaseEligible = false`, carpeta `candidate-<uuid>` nueva en cada ejecución, la anterior idéntica byte a byte tras una segunda; ficheros capturados = lista construida a mano; exclusiones (`.oculto`, `outputs`, `.tmp`, `test-results`, dotfiles, `dist`) respetadas; hash y bytes de cada fichero = origen; activos cubiertos byte a byte hasta `dist`; `manifest.artifacts` = contenido real de `runtime`; reservas `review`/`working` → bloqueos `SOURCE_NOT_ACCEPTED`; el origen queda intacto.
- Fallos: `vite` con `publicDir:false` → «Activo público ausente» (la guarda funciona cuando falta un activo cubierto); typecheck → `incomplete`, `exitCode≠0`, log, `artifacts=[]`; pruebas Node fallidas → `incomplete`, pasos previos conservados, sin artefactos aprobados.
- Enlaces: junction en `src/` y en `public/` → rechazo sin recorrer el destino sintético. **Enlace de archivo: sin verificar** (el equipo no permite symlinks sin privilegios).
- Límites: 2 000 001 bytes, 2 001 entradas y 26 × 1,99 MB (> 50 MB) se detienen con `incomplete`; la captura parcial queda como evidencia.
- Cambios durante la captura (barrera determinista: un `--require` que modifica el árbol en el momento de leer `src/a-first.ts`): modificar un archivo ya copiado, añadir un archivo y borrar uno pendiente → `incomplete`, sin `snapshotStable`, sin compilar; modificar uno pendiente → el hash registrado es el de los bytes realmente copiados.
- Entorno (canarios inventados solo para el hijo): los nombres que cubre la lista negra (`API_KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `HUBSPOT_`, `OPENAI_`, …) y `NODE_OPTIONS` no llegan al hijo; ningún valor aparece en logs.

## 5. Sensibilidad (mutación sobre copias efímeras; la fuente exacta pasa en los controles)

| # | Mutación (solo copia efímera) | Aserción que falla | Control sin mutar |
|---|---|---|---|
| M1 | preflight sin `restoreBundle` de prueba | 1 (historial), 8 (devolución) | pasa |
| M2 | `canonicalBase64` siempre cierto | 4 (sobre cifrado) | pasa |
| M11 | mensaje `DECRYPT_FAILED` que refleja la contraseña | 5 (contraseña) | pasa |
| M3 | prefijo sin igualdad de contexto | 6 (contexto) | pasa |
| M4 | prefijo sin comparar las entradas | 5 (bifurcación) | pasa |
| M5 | `bundleRevision` ignora `returnState` | 6 (contexto) | pasa |
| M6 | `sameCapture` siempre cierto | 8 (límites) | pasa |
| M7 | cobertura decidida por recuentos | 7 (misma captura) y 10 (10.000) | pasa |
| M12 | recuento de pendientes por registros, no por cambios | generativa y 4 (A→B→A) | pasa |
| M9 | guarda de activos públicos sin efecto | 3 (activos) | pasa |
| M10 | `snapshotStillMatches` siempre cierto | 8 (cambios durante la captura) | pasa |

Mutación **descartada**: M8 («aceptar la dirección inversa como prefijo» cambiando `<` por `!==`) es un mutante equivalente, porque `copy.changes.every(...)` ya rechaza una copia más larga; no se cuenta como sensibilidad. M1 también hace fallar `HALLAZGO F1`, pero por otro motivo (sin restauración no hay plan); no se cuenta para F1.

## 6. Hallazgos (por impacto)

### F2 · REL046 · medio, latente · bug
`scripts/prepare-release-candidate.mjs` (hash `bd3d8388…`). **Precondición:** `public/` contiene un activo con extensión fuera de `.html .json .png .jpg .jpeg .webp .ico .woff .woff2` (más `.ts .tsx .mjs .cjs .js .css .svg` de la lista general) o con mayúsculas en la extensión (`.PNG`; `path.extname` distingue mayúsculas y Windows no). **Entrada mínima:** workspace mecánico con `public/anim.gif`, `public/LOGO-GRANDE.PNG`, `site.webmanifest`, `robots.txt`, `doc.pdf`, `lib/app.wasm`. **Pasos:** `node scripts/prepare-release-candidate.mjs --prepare`; `node --test --test-name-pattern=HALLAZGO tests/release-candidate-adversarial.test.mjs`. **Observado:** los 6 archivos no entran en el snapshot, no están en `runtime/dist`, `checks` incluye `public-assets` con `ok:true`, el estado es `compiled-and-node-verified` y `blockers` no menciona nada. **Esperado (brief §5, «detectar recursos ausentes»):** copiarlos byte a byte o marcar la candidata. **Impacto:** una candidata sin imágenes/manifiestos de la app instalada declara «activos públicos verificados». **Latente hoy:** el `public/` real solo contiene extensiones cubiertas, así que la candidata real no está afectada ahora. **Corrección:** listar `public/` sin lista blanca de extensiones (comparación sin distinguir mayúsculas) o registrar en el manifiesto cada fichero omitido y añadir un bloqueo `PUBLIC_ASSET_NOT_CAPTURED:<ruta>`; verificar que `dist` contiene cada fichero de `public/` del origen vivo.

### F1 · BACKUP041 / restauración · bajo-medio · bug de robustez
`server/recovery-preflight.ts` `5cbcd229…` sobre `Store.restoreBundle` (`server/store.ts` `837d54fa…`, fuente base, no entrega de Codex). **Precondición:** paquete válido con un plan de devolución cuya operación está en `sending` y el plan no está en `applying` (`review`, `approved`, `partial`, `complete`). **Pasos:** `node --import tsx tests/.tmp/qa052/probe1.ts` (matriz) o `node --import tsx --test --test-name-pattern=HALLAZGO tests/independent-recovery-integrity.test.ts`. **Observado:** el verificador devuelve `valid` con `uncertainOperationsAfterRestore = 0`, y la restauración deja la operación en `sending` (solo `applying` → `partial` convierte `sending` en `uncertain`). **Esperado:** tras restaurar no existe ningún proceso que siga enviando, así que todo `sending` restante es un resultado remoto desconocido; debe contarse como incierta o rechazarse el paquete. **Impacto:** la app no ofrece ese estado por sus caminos normales (la construcción de `Recovery` normaliza `applying`), de modo que solo afecta a archivos manipulados o heredados; el aviso «hay operaciones con resultado incierto» no se emitiría. **Corrección:** en `restoreBundle`, convertir cualquier `sending` a `uncertain` con `error` explicativo (y exigir plan `partial`), y contar inciertas sobre el plan ya restaurado.

### F3 · REL046 · bajo · mejora (riesgo residual, no vulnerabilidad)
La saneación de entorno es una lista negra. Con canarios inventados, llegan al hijo `…PASSPHRASE`, `…PRIVATE_KEY`, `…CREDENTIALS`, `…COOKIE`, `…AUTH_HEADER`, `…ACCESS_KEY`, `…PASSWD`, `…BEARER`. Los hijos son los comandos del propio repositorio bajo `block-external.cjs`, que no es un aislamiento hermético del sistema operativo. **Propuesta:** lista blanca (`PATH`, `SystemRoot`, `TEMP`, `TMP`, …) o ampliar el patrón. La prueba 2b lo documenta como caracterización; si se endurece, hay que actualizarla.

### Observaciones (límite documentado o mejora menor, sin prueba fallida)
- **O1 (REL046):** la exclusión por nombre se aplica a cualquier profundidad: `src/build/…` o `src/dist/…` quedan fuera sin aviso (solo falla el typecheck si algo los importa). Caracterizado en la prueba 2.
- **O2 (REL046):** `SOURCE_NOT_ACCEPTED` solo lista tareas con reserva; una tarea `done` (sin reserva) o un archivo sin dueño aparecen como «aceptados» por ausencia. Coherente con el tablón, pero no es una prueba de aceptación.
- **O3 (BACKUP041):** un fallo de descifrado no distingue contraseña incorrecta de carga corrupta; una BOM inicial se informa como `INVALID_JSON`; ambas CLIs cargan el `Store` (aviso experimental de SQLite en stderr al mostrar la ayuda).
- **O4 (SAFE049):** reordenar `records` produce `different-revision` aunque el contenido sea el mismo (0 registros distintos); es conservador y coherente con «los arrays conservan el orden».
- **O5 (CLI):** `check-recovery-copy` abre la ruta tal cual (sigue enlaces) y `check-backup-coverage` rechaza enlaces con `lstat`. Inconsistencia por lectura del código; **no verificada** aquí por falta de symlinks.
- **O6 (SAFE049, teórico, sin verificar):** `sameInputFile` compara `dev:ino` como `Number`; con identificadores de 64 bits podría colapsar dos ficheros distintos. En 400 ficheros de prueba ningún `ino` superó 2^53 ni colisionó, así que no se reproduce.

## 7. Límites y lo que no se comprobó
- **No comprobado:** rechazo de enlaces de archivo (symlink) en ambas CLIs y en la candidata (el equipo no concede el privilegio); la junction sí se probó. Colisión de `ino` (O6). Enlaces dentro de nombres excluidos.
- **Separación de ámbitos:** (a) CLI/fuentes: procesos reales con red bloqueada por `block-external.cjs` (no es aislamiento hermético); (b) empaquetado: workspace mecánico, no Plan B; (c) candidata real de Plan B: **no construida** ni probada aquí (ninguna compilación pesada); (d) runtime instalado (4331/4334): **no verificado**.
- Una restauración en memoria no prueba recuperación en otro equipo; iguales hashes no prueban custodia externa; una fecha no prueba precedencia; una suite verde no prueba que lo instalado sea esa fuente. Ninguna cuenta, base, perfil ni instalación real se abrió; los datos son ficticios (`demo-agency`, `example.invalid`).
- Los metadatos «producción» de los fixtures son del test, no de ninguna cuenta real.

## 8. Inventario y estado final
- Procesos: todos concluidos (sin servidores ni puertos). Ningún navegador.
- Ficheros temporales: `tests/.tmp/qa052/mutate.mjs` y `tests/.tmp/qa052/probe1.ts` (scratch propio, conservados para reproducir). Los workspaces `ws-*`, copias `snap-*` y carpetas `qa052-cli-*` se borran al terminar cada ejecución (solo se borró scratch propio).
- Fuentes e inputs: hashes de las nueve fuentes revisadas y de las siete leídas idénticos al inicio y al final; los ficheros de entrada de las CLIs se comparan por hash antes y después en las pruebas.
- Contenido seguro: este informe no contiene contraseñas, ciphertext, ni valores de canarios de contraseña; los canarios de contenido se citan solo por categoría.
- Sin despliegue, sin `npm run build`, sin commit, sin proveedores ni MCP, sin aceptación de fuentes ajenas ni edición de archivos de Codex. Estado: se presenta con `submit`; la revisión queda para Codex.
