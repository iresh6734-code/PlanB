# Informe de mejoras · fe de erratas y avance

**Encargo:** `CLAUDE-INFORME-MEJORAS-AVANCE` · **Autor:** Claude (Opus 5.5), sesión del informe
**Informe de origen:** [`CLAUDE-INFORME-MEJORAS-GEMINI-2026-11-13.md`](CLAUDE-INFORME-MEJORAS-GEMINI-2026-11-13.md) (presentado; no se edita)
**Inicio:** 14/11/2026, Europe/Madrid

El usuario pidió el 14/11 empezar a ejecutar el informe «sin lucha de permisos ni sobrescrituras» con los otros dos agentes activos. Este documento es la referencia común: corrige lo que el informe afirmó mal y propone quién toma cada mejora según las reservas reales del tablón. **El reparto es una propuesta**: Codex coordina el tablón y la sesión Faro decide sobre sus archivos.

---

## 1 · Fe de erratas

Al empezar a implementar releí el código con más detalle. Tres afirmaciones del informe eran incorrectas o inexactas:

| Ref. del informe | Lo que decía | Lo que hay de verdad | Consecuencia |
| --- | --- | --- | --- |
| D-Sec1 y F1 | «No hay límite de intentos de contraseña» | Sí lo hay: `server/security.ts:64-66`, 5 intentos por minuto y por IP, responde 429 | **F1 se retira.** Como mucho, queda una mejora menor (espera progresiva en vez de ventana fija), sin prioridad |
| D-Sec2 y F2 | Parámetros de scrypt por defecto como riesgo | Es cierto que usa los parámetros por defecto (`security.ts:57,68`), pero el hash se guarda en `meta`, que está **cifrada fila a fila** con la clave local protegida por DPAPI (`server/store.ts:39-40,73-75`). Para atacarlo hay que tener ya la clave, y con ella se leen los datos directamente | **F2 baja a P3** |
| D-S3 y B6 | `records.value` es «JSON opaco»; proponía índices con `json_extract` o columnas generadas | `records`, `changes`, `archives`, `captures` y `meta` están **cifradas fila a fila** (`enc1:` + AES-256-GCM, `server/crypto.ts:31-40`; migración en `store.ts:41-68`). Un índice SQL sobre los campos los guardaría en claro | **La parte de índices de B6 no se aplica.** El cuello de botella real es otro: cada lectura vuelve a descifrar la tabla entera (ver CLAUDE-PERF-STORE-RECORDS). Las migraciones versionadas de B6 siguen siendo válidas |

Comprobé de nuevo y se mantienen: no hay API de historial en la App (`pushState`/`popstate` solo aparecen en `src/TeamApp.tsx`), no hay versión de esquema SQLite (`user_version` o `schema_migrations`), hay seis generaciones de API y se usa `style-src 'unsafe-inline'` (15 `style={{…}}` en `src/*.tsx`).

---

## 2 · Agentes activos y zonas calientes (14/11, 10:00–11:00)

| Agente | En qué está | Archivos que conviene no tocar |
| --- | --- | --- |
| **Codex** | Automatización y reintento de capturas (350–353), reconciliación de entregas (348–349), revisión de LAB-035, montaje A4 (318) | `src/app-shell/copy-timeline.ts`, `CopyTimeline.tsx`, `continuity-alerts.ts`, `continuity-report.ts`, `server/main.ts`, `server/runtime.ts`, `server/endpoint.ts` |
| **Sesión Claude Faro** (diseño) | Rediseño en curso, con cambios sin presentar en `App.tsx`, `Sidebar.tsx`, `faro.css`, `HomeOverview.tsx`, `ContinuityHome.tsx`, `RecordsPage.tsx`, `LocalOperations.tsx` y otros | Todo `src/` de interfaz, sobre todo el marco (`App.tsx`, `src/app-shell/*`) y `src/faro.css` |
| **Esta sesión** (informe) | Erratas, rendimiento del almacén, línea base de pruebas | Solo los archivos de sus encargos |

Regla práctica: esta sesión **no edita interfaz** mientras la sesión Faro tenga cambios abiertos, ni `main.ts`/`runtime.ts` mientras siga viva la reserva 318.

---

## 3 · Reparto propuesto de las mejoras

Estado: ⬜ pendiente · 🟡 en curso · 🟢 presentado · ✅ aceptado · ⛔ bloqueado/decisión · ➖ retirado

| Mejora | Carril propuesto | Motivo | Estado |
| --- | --- | --- | --- |
| A1 Commits por tema | Esta sesión | Hecho el 13/11 por orden del usuario (`4035cfc`..`914f22a`) | ✅ |
| A2 Vaciar la cola de revisión | Codex + usuario | Solo Codex puede aceptar | ⛔ decisión |
| A3 Línea base de pruebas | Esta sesión | Diagnóstico en archivos libres; las pruebas reservadas por otros se señalan a su responsable | 🟡 |
| A4 Compilación candidata oficial | Codex | Ya tiene `tools/releases/*` y necesita `package.json` | ⬜ |
| B1 Rutas con URL | Sesión Faro | Toca `App.tsx` y `src/app-shell/session.ts` | ⬜ |
| B2 Estado de registros fuera de `App.tsx` | Sesión Faro | Mismo archivo | ⬜ |
| B3 Un solo sistema de estilos | Sesión Faro | Es la dueña de `faro.css` y de la red visual | ⬜ |
| B4 Registro de módulos del servidor | Codex | `main.ts` y `runtime.ts` están reservados (318) | ⬜ |
| B5 Inventario de API | Esta sesión | Archivos nuevos (`tools/`, `docs/`) | ⬜ |
| B6 Migraciones versionadas (sin índices en claro) | Codex, o esta sesión con su visto bueno | `store.ts` es el núcleo de persistencia | ⬜ |
| B7 Partir componentes gigantes | Dueño de cada componente | Muchos están reservados por sus autores | ⬜ |
| C1 Separar «Laboratorio» | Sesión Faro, con decisión del usuario | Toca Sidebar, Inicio y App | ⛔ decisión |
| C2 Futuro del gemelo operativo | Usuario | Decisión de producto | ⛔ decisión |
| C3 Mesa de respuesta | Codex (contrato) + Claude (pantalla) | Ola 2 del plan de Codex | ⬜ |
| C4 Devolución con conflictos | Codex (contrato) + Claude (pantalla) | Ola 3 | ⬜ |
| C5 Simulacro guiado | Codex (LAB-035) + Claude (LAB-036) | Ya planificado | ⬜ |
| C6 Avisos | Codex | Ya trabaja en avisos de continuidad (350) | 🟡 (Codex) |
| C7 Vistas guardadas | Sesión Faro | Página de registros | ⬜ |
| C8 Deshacer | Esta sesión (servidor) + sesión Faro (botón) | `changes.before_json` ya existe | ⬜ |
| C9 Importar CSV | Esta sesión: núcleo en archivos nuevos; el montaje, a quien tenga App/main | Lógica pura sin choque | ⬜ |
| C10 Copiloto | Codex + usuario | Necesita proveedor autorizado | ⛔ decisión |
| C11 Profundidad HubSpot | Codex + usuario | Cuenta real | ⛔ decisión |
| C12 Primer uso | Sesión Faro | Interfaz | ⬜ |
| D1–D8 Diseño | Sesión Faro | Es su carril | ⬜ |
| E1 CI local | Esta sesión | `tools/ci.mjs` nuevo | ⬜ |
| E2 Pruebas por contrato | Cada autor | Las huellas son de cada encargo | ⬜ |
| E3 Presupuestos de rendimiento | Esta sesión | Primer paso: CLAUDE-PERF-STORE-RECORDS (almacén). Falta fijar los presupuestos como prueba | 🟢 (parcial) |
| F1 Límite de intentos | — | Ya existe (fe de erratas) | ➖ |
| F2 scrypt versionado | Esta sesión, P3 | Bajo impacto (fe de erratas) | ⬜ |
| F3 DPAPI sin PowerShell | Codex + usuario | Dependencia nativa | ⬜ |
| F4 Privacidad de IA | Codex | Antes de C10 | ⬜ |
| G1 `ESTADO.md` | Esta sesión, con datos de Codex | Archivo nuevo | ⬜ |
| G2–G4 Documentación y protocolo | Codex | Coordina el tablón | ⬜ |

---

## 4 · Registro de avance

### 14/11 · CLAUDE-PERF-STORE-RECORDS (🟢 presentado)
Caché de texto descifrado indexada por el texto cifrado, recuento sin descifrar y relacionados por índice. Con 10.000 registros: `records()` pasa de 75 a 27–29 ms y una página de 78–88 a 33–56 ms (≈2×). Una primera medición de ~300 ms coincidió con la batería en marcha y está inflada; no se usa.

Evidencia: pruebas 14/14, mutantes 12/12, `tsc` 0, batería completa sin fallos nuevos atribuibles y revisión independiente sin hallazgos de corrección (sus tres mejoras menores, aplicadas). Detalle en [`CLAUDE-PERF-STORE-RECORDS.md`](CLAUDE-PERF-STORE-RECORDS.md).

### 14/11 · A3, línea base (🟡)
`npm test` sobre el árbol del 14/11 (con cambios de otros agentes sin presentar): **3.000 pruebas, 2.958 correctas, 37 fallos, 1 omitida y 4 pendientes (`todo`), 11,4 min.**

| Causa | Fallos | Archivos | Quién puede arreglarlo |
| --- | --- | --- | --- |
| `npm test` no define `NODE_ENV=test`; las pruebas que escriben una clave `kind: 'test'` chocan con `server/crypto.ts:23` | 13 | `task-intents-entrypoints` (8), `bound-endpoint-343` (3), `date-check-binary-restart-342` (1), `independent-task-revision` (1) | Codex: una línea en `package.json` (archivo común), p. ej. `tsx --env-file=tests/test.env --test …` con `NODE_ENV=test`. **No** relajar `crypto.ts`: rechazar claves de prueba fuera de pruebas es una defensa |
| Sondas de revisores que documentan defectos abiertos (rojas a propósito hasta que el autor corrija) | 15 | `operational-date-check-independent-337` (3), `date-check-decision-independent-339` (4), `independent-continuity-lab` (2, 099), `independent-task-focus-123` (2), `task-intent-consumer-independent-322` (3), `independent-interface-contexts` (1, G6) | Los autores de cada unidad (Opus, Codex LAB, Claude A) |
| Cápsula de rescate: interrupciones y exclusión con procesos reales | 6 | `rescue-capsule-rehearsal` (4), `rescue-capsule-integrity` (2) | Sin diagnosticar; pruebas con procesos reales, posiblemente sensibles a carga concurrente |
| La entrada portátil registra la ruta de evidencia exclusiva de main | 1 | `continuity-evidence-mount` | Sin diagnosticar; ya aparecía en registros anteriores |

Suman 35. Los otros 2 del recuento son las pruebas padre «A4 mounts on main/runtime…», que fallan porque fallan sus 8 subpruebas de la primera fila.
