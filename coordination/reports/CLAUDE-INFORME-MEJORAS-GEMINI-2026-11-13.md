# Plan B · Informe integral de mejoras e implementaciones

**Para:** Gemini 4 Argon (modelo receptor que continuará el trabajo)
**De:** Claude (Opus 5.5), por petición directa del usuario
**Fecha:** 13/11/2026, Europe/Madrid
**Encargo en el tablón:** `CLAUDE-INFORME-MEJORAS-GEMINI-2026-11-13` (única escritura: este archivo)

---

## 0 · Cómo usar este informe

Este documento es autocontenido. Puedes trabajar con él sin haber leído el historial del proyecto, pero **antes de editar nada** lee estas reglas, porque el repositorio está compartido con otros agentes (Codex y varias sesiones de Claude) y el usuario las exige.

### Reglas que no se negocian

1. **Coordinación por tablón.** Toda edición necesita un encargo en `node tools/coordination/board.mjs` con la lista exacta de archivos que vas a tocar (`add --file <json>`, `claim`, `check-path` por ruta, `submit --note`). No se editan archivos reservados por otro agente. Tras `submit` no se edita: se espera revisión (`revise`) o aceptación. Detalles en `COORDINACION.md` y `AGENTS.md`.
2. **Zonas prohibidas.** No leer ni tocar `data/`, `.env*`, `*.enc`, `.planb-key`, carpetas `planb-local-*`, `planb-hubspot-*`, `planb-ensayo-*`, ni configuraciones personales. No recuperar credenciales, cookies, tokens o claves DPAPI.
3. **Fuera de alcance.** El ordenador de empresa original, IFR, Entra, Copilot Studio corporativo y Gmail. Nada de servicios externos, despliegues, instalaciones, compras ni commits sin autorización expresa del usuario en ese momento.
4. **`npm run build` está prohibido**: sobrescribe `build/` y `dist/`, que sirven al piloto. Compila siempre a una carpeta temporal (hay arneses en `tests/.tmp/`).
5. **Archivos comunes** (`package.json`, lockfile, `CONTEXTO-PROYECTO.md`, `PLAN-1.0.md`, contratos y esquema en `shared/model.ts`) solo con un encargo que los reserve expresamente.
6. **Honestidad de evidencia.** Distingue código, prueba aislada con datos ficticios y operación auténtica. No declares conectado o terminado algo sin evidencia. No crees datos ficticios dentro de la App del usuario.

### Qué he comprobado yo y qué no

| Comprobado en esta sesión | Inferido por lectura (no ejecutado) |
| --- | --- |
| `npx tsc --noEmit` termina con código 0 sobre el árbol actual | Comportamiento en ejecución de cada apartado |
| Recuentos de archivos, tamaños, rutas API y estado de Git | Resultado actual de `npm test` y E2E (cito registros previos de otras sesiones) |
| Estado del tablón (499 encargos) y últimos eventos | Rendimiento real con 10.000 registros |
| Capturas existentes en `tests/.tmp/rd/shots/` (generadas por otra sesión el 11–13/11) | Estado de 4331/4334 en este momento |

No he arrancado servidores, abierto el navegador ni tocado datos.

---

## 1 · Resumen ejecutivo

1. **El producto tiene una idea fuerte y diferencial** —«tu CRM puede caerse y tu negocio sigue»— y una base técnica seria (TypeScript estricto, contratos con zod, pruebas causales, cifrado local, aprobaciones ligadas a revisión). Lo que falla no es la calidad del código individual, sino **la coherencia del conjunto**.
2. **Riesgo nº 1 (crítico): casi todo el trabajo de las dos últimas semanas no está en Git.** Último commit: 29/10/2026. Hay **70 archivos modificados (+20.740/−1.692 líneas) y 1.177 archivos sin seguimiento** (96 en `src/`, 69 en `shared/`, 43 en `server/`, 318 en `tests/`). Un fallo de disco o un `git checkout` equivocado borraría el trabajo de Codex, Fable, Opus y las sesiones A/B.
3. **Riesgo nº 2: el proceso de revisión está atascado.** De 499 encargos, **246 están aceptados y 220 siguen en revisión**; 12 en curso, 10 bloqueados, 11 listos. Varias unidades se cambiaron después de presentarse (por orden del usuario), lo que invalida sus huellas y obliga a re-presentar. El cuello de botella es la aceptación, no la producción.
4. **Riesgo nº 3: el producto se ha dispersado.** La navegación tiene ~18 entradas. Tres apartados de la sección «Operaciones» (Radar, Comprobar una fecha, Ensayar mi semana) **solo funcionan con datos de ensayo** («solo ficción», exigen `isTestData`) y usan un modelo (técnicos, habilidades, materiales, almacenes) que **no existe en el modelo de datos del CRM** (cuatro entidades fijas: clientes, empresas, oportunidades, tareas). Conviven en el mismo menú que el trabajo real.
5. **Diseño:** la identidad «Faro» (petróleo, verde mar, ámbar para «hoy», títulos Sitka) da carácter y el Inicio es bueno. Pero se sostiene sobre **~425 KB de CSS en 10 capas globales**, con `faro.css` de 160 KB, **1.012 selectores `html body`** y 73 `!important`. Cada cambio visual cuesta más que el anterior.
6. **Lo que más valor añadiría ahora**, por orden: (a) asegurar el trabajo en Git y vaciar la cola de revisión; (b) línea base de pruebas en verde; (c) simplificar la navegación separando «Laboratorio» de lo operativo; (d) cerrar el ciclo central del producto —caída → trabajar sin CRM → devolver cambios con conflictos explicados—, que es lo que el usuario vende; (e) consolidar CSS y estado de la App.

---

## 2 · Qué es Plan B

### Propósito
Conservar una copia utilizable del CRM (HubSpot primero) en el ordenador de una pyme, **demostrar con un simulacro** que se puede seguir trabajando si el CRM cae, y **devolver los cambios revisados** cuando vuelva. Encima, un «centro comercial» con seguimiento de oportunidades, borradores de correo y agentes con autonomía gradual.

### Usuario
Responsable local de una pyme que usa HubSpot. Agencias de HubSpot preparan, prueban y supervisan la continuidad. Un operador por instalación, un portal por carpeta, Windows.

### Principios declarados (`PRODUCT.md`)
Continuidad comprobable · Independencia del proveedor · Procedencia explícita · Configuración progresiva · No inventar evidencia comercial.

### Límites vigentes
Cuatro entidades; hasta 10.000 registros; sin campañas, borrados remotos automáticos ni multiusuario en la App local; producción de HubSpot **solo en lectura**; IA deshabilitada para datos reales; envíos de correo del piloto limitados a la propia cuenta Google conectada.

### Hoja de ruta aceptada (`PLAN-1.0.md`)
0.4 fiabilidad y primer agente simulado · 0.5 cuentas/roles/aislamiento por empresa en nube (núcleo hecho, aceptación en nube pendiente) · 0.6 profundidad HubSpot + Google Workspace con acciones revisadas (en curso) · 0.7 agentes con autonomía programada · 1.0 piloto con un equipo externo (objetivo: −30 % de tiempo de preparación, **por medir**).

---

## 3 · Arquitectura actual

### Stack
React 19 + Vite 6 (cliente), Fastify 5 + Node 24 (servidor), SQLite nativo (`node:sqlite`, `DatabaseSync`) en local, PostgreSQL (`pg`, con `pglite` en demo) para el servicio de equipo, zod 4 para contratos, Playwright para E2E, `tsx --test` para unitarias. Sin framework de estado ni router en el cliente.

### Tamaño (bytes de `.ts/.tsx/.css`, sin `tests/.tmp`)
| Carpeta | Archivos | Bytes |
| --- | --- | --- |
| `src/` | 161 | 1,52 MB (de ellos ~425 KB de CSS) |
| `server/` | 100 | 0,89 MB |
| `shared/` | 85 | 0,93 MB |
| `tests/` | 385 (256 unitarias, 99 E2E) | 5,18 MB |

Archivos más grandes: `src/faro.css` (160 KB), `shared/operational-date-check.ts` (71 KB), `src/LocalTaskFocus.tsx` (57 KB), `server/rescue-room.ts` (47 KB), `src/CommitmentRadar.tsx` (42 KB), `shared/impact-map.ts` (40 KB).

### Procesos y puertos
| Puerto | Qué es | Notas |
| --- | --- | --- |
| 4317–4327 | `server/main.ts` en desarrollo (busca puerto libre) | `PLANB_PORT` lo fija |
| 4331 | «CRM completo» del usuario | Tiene desplegado Faro y Operaciones (solo `dist`) |
| 4334 | Piloto protegido | **No** tiene los cambios del 11–13/11 |
| 4346 / 4347 | Tablón de coordinación / panel «duet» (solo lectura) | Herramientas de desarrollo |
| 4421 / 4441 | Arneses de ensayo de la App y de `/team` | `tests/.tmp/rd/` |

### Servidor local (`server/main.ts`)
`createBaseApp` (`server/app.ts`) + módulos montados uno a uno: lectura HubSpot, relevo, generador, inspección de copia, evidencia de continuidad, intentos de tareas (A4), Radar, ensayo operativo, comprobar fecha, revisión de decisión, resumen de trabajo, sincronización de equipo. **193 rutas** registradas con `app.get/post/...`, repartidas en prefijos `/api/v2` … `/api/v7`, `/api/team`, `/api/rescue`, `/api/import`, `/api/settings`.

### Persistencia local (`server/store.ts`)
Tablas `meta`, `records(entity,id,value JSON)`, `changes`, `archives`, `usage`, `captures`. Clave local por carpeta protegida con DPAPI de Windows (`server/crypto.ts`, vía PowerShell). Los módulos nuevos guardan su estado en claves de `meta` con prefijos propios (`date-check:<pin>:*`, `date-check-review:<pin>:*`, registros de ensayo…).

### Cliente (`src/`)
`main.tsx` importa 9 hojas globales en cascada (`styles` → `refinements` → `sales` → `team` → `integrations` → `design-system` → `planb-ui` → `operaciones-claras` → `faro`) y decide entre `App` y `TeamApp` por `location.pathname`. `App.tsx` (27 KB) concentra estado de página, registros, selección, modales y la cadena de `page===…?…:…` que renderiza cada apartado. Ya se extrajeron `src/app-shell/` (Sidebar, TopBar, MobileNav, CommandPalette, RelatedPanel, RecordTimeline, FocusRun, QualityPanel, lazy-pages…) y `src/ui/index.tsx` (piezas base).

### Servicio de equipo (`server/team/`, `src/TeamApp.tsx`)
Empresas aisladas (RLS), roles, trabajos persistentes, OAuth HubSpot de lectura, adaptadores Google (Gmail, Calendar, Drive, Docs, Sheets), biblioteca de archivos, Picker, agente comercial, borrador IA local (Ollama, apagado por defecto). Demo con dos empresas ficticias. **No desplegado en nube.**

### Proveedores de IA (`server/provider.ts`)
Presets `openrouter`, `gemini`, `deepseek`, `ollama`, `custom`; HTTPS obligatorio salvo Ollama local; dominio verificado por preset. Solo para datos de ensayo.

---

## 4 · Inventario funcional por apartado

Leyenda de estado: **Real** = funciona sobre la copia del usuario · **Ensayo** = funciona con datos ficticios o proveedores simulados · **Ficción** = exige copia de ensayo; no admite datos reales · **Parcial** = existe pero le falta un tramo.

| Grupo | Apartado | Qué hace | Estado |
| --- | --- | --- | --- |
| Trabajo | Inicio | Saludo, «La semana en una línea» (puntos por día), «Tu siguiente paso», «Qué atender primero», antigüedad de la copia, Radar resumido, calidad de datos | Real (Radar: ficción) |
| | Hoy | Tareas por urgencia con filtros, «Organizar mi jornada» (modo enfoque), revisión local guardada, entrada a «Ensayar mi semana» | Real; entrada al ensayo: ficción |
| | Trabajar › Clientes/Empresas/Oportunidades/Tareas | Tabla con orden, filtros, edición en línea, vista recordada, CSV, ficha lateral con «Relacionado» e historial, tablero arrastrable de oportunidades con sumas por etapa | Real |
| | Cambios | Historial local «campo: antes → después», propuestas pendientes | Real |
| | Agentes | Propuestas de seguimiento por reglas, destinos simulados | Ensayo |
| Operaciones | Radar | Compromisos en riesgo, «Ensayar mi semana» con alternativas | Ficción |
| | Comprobar una fecha | ¿Puedo comprometer esta fecha? Técnicos, habilidades, material, reservas ATP; registra la decisión y luego su desenlace | Ficción |
| Tu copia | Continuidad | Pestañas Estado · Evidencia e impacto · Copias y archivo · Operaciones; preparación en 5 pasos; capturas programadas; «Probar mi Plan B» (simulacro aislado) | Real (simulacro aislado) |
| | Copia de equipo | Réplica cifrada con conflictos frente al servicio de equipo | Ensayo |
| | Exportar | ZIP portátil cifrado con resumen protegido | Real |
| | Proteger / bloquear | Contraseña local (scrypt), sesión de 30 min | Real |
| Ajustes | Integraciones | HubSpot (lectura), Zendesk/Pipedrive (lectores con contrato), historial de lecturas, estado por fuente | Parcial (HubSpot de ensayo leído de verdad; resto sin llamadas reales) |
| | Proveedor de IA | Configuración de preset | Solo con datos de ensayo |
| | Preparación | Asistente: proteger → conectar → capturar → probar → recuperar | Real |
| `/team` | Empresa, Contactos, Trabajos, Dispositivos, Equipo, Integraciones, Agente, Comercial | Seguimientos con aprobación ligada a revisión, Google Workspace, archivos, importar Sheets | Ensayo (nube sin desplegar) |

**Hecho y sin montar en la App** (presentado, esperando revisión o montaje): `src/ContinuityLab.tsx` (laboratorio de caídas), `src/RescueRoom.tsx` / `RescueCapsule.tsx`, `src/SourceReadingHistory.tsx` / `SourceStatusRow.tsx` (parcialmente), verificador de migraciones, `src/WorkSummary.tsx` (montado pero declarado «sin demostrar» con `covers: () => false`).

---

## 5 · Qué están haciendo los agentes

### Codex (coordinador y revisor)
Últimos eventos (13/11, 13:49–14:14): revisiones independientes del paquete «Comprobar una fecha» de Opus (`CODEX-OPUS-DATE-CHECK-CORE-REVIEW-337`, `-FLOW-REVIEW-338`, `CODEX-OPUS-DECISION-REVIEW-339`), verificación de una candidata compilada (`CODEX-QA052-CURRENT-CANDIDATE-340`, `-CANDIDATE-E2E-341`), reinicio real del binario con decisión y desenlace (`-BINARY-RESTART-342`), laboratorio de continuidad (`CODEX-LAB-035`, re-presentado varias veces) y ahora `CODEX-BOUND-ENDPOINT-343` (publicar el puerto real en el archivo de descubrimiento, `server/endpoint.ts`). Mantiene vivo `CODEX-A4-SERVER-MOUNT-318` (montaje A4 en `server/main.ts` y `server/runtime.ts`).

**Patrón observado:** Codex es extremadamente riguroso (reinicios reales, réplicas idempotentes, cero escrituras en SQLite comprobadas), pero dedica casi todo su tiempo a **verificar** y casi nada a **aceptar**: sus propias revisiones también quedan en `review`. Su plan de producto (`coordination/plans/PLAN-POTENCIA-035.md`) propone cuatro olas: laboratorio de caídas → mesa de respuesta durante la caída → devolución con conflictos explicados → copiloto con planes comprobables.

### Sesiones Claude
| Sesión | Línea de trabajo | Estado |
| --- | --- | --- |
| Claude A | Hoy recuperable, intentos de guardado A4 (cliente y estrategia), entrada al Radar | Presentado; varias unidades en `working` porque Codex devolvió o porque esperan montaje |
| Claude B | Fuentes (Zendesk, Pipedrive), estado e historial de lecturas, verificador de migraciones | Mucho aceptado; montaje en Integraciones pendiente de Codex (`CLAUDE-SOURCE-REGISTRY`, `CLAUDE-SOURCE-HISTORY-MOUNT-QA` listos) |
| Fable | Gemelo operativo: simulación, planificador, escenarios, «Ensayar mi semana», montaje en App | Montado por orden del usuario; CORE-1/2 y MOUNT en `working` tras devoluciones |
| Opus | «Comprobar una fecha» + «Revisar una decisión»; rediseño «Operaciones claras» | Montado y desplegado en 4331 por orden del usuario; CORE/FLOW/REVIEW devueltos por Codex el 13/11 |
| Fable/Faro | Rediseño integral: identidad Faro, fase 0 (partir App, piezas `src/ui/`, red visual `tools/visual/`), fase 2 (tablero, ficha 360, paleta Ctrl J, edición en línea, CSV, historial, modo oscuro, carga diferida, a11y) | Desplegado en 4331 por tandas con copia de seguridad; el encargo `CLAUDE-FABLE-UI-GRAFITO` cambió muchas veces tras presentarse |

### Diagnóstico del proceso
- **Producción > aceptación.** 220 entregas en `review`. Con este ritmo la cola no se vacía nunca.
- **Huellas rotas por órdenes directas.** Cuando el usuario ordena «móntalo/despliégalo», una sesión edita archivos reservados por otra, y todas las entregas afectadas deben re-presentarse. Es correcto obedecer al usuario, pero hay que absorber el coste con un paso de reconciliación explícito.
- **El despliegue va por delante del control de versiones.** 4331 sirve código que no está en ningún commit.
- **Dos verdades sobre la App.** 4331 (Faro, operaciones) y 4334 (piloto sin esos cambios) divergen; los documentos `LEEME-*` describen versiones anteriores.
- **Documentación inflada.** 30 archivos `.md` en la raíz; `CONTEXTO-PROYECTO.md` tiene 2.161 líneas; el informe `CODEX-LAB-035.md` pesa 400 KB. La compactación (`CLAUDE-CTX-022`) está bloqueada.

---

## 6 · Diagnóstico por área (con evidencia)

### 6.1 Producto y coherencia
- **D-P1. Ficción mezclada con operación.** `server/date-check-mount.ts:56`, `server/operational-rehearsal-mount.ts:52` y `server/commitment-radar-mount.ts:66` rechazan cualquier copia que no sea de ensayo. Sin embargo aparecen en el menú principal, con contador de riesgo, y en Inicio («Radar de compromisos»). Para un usuario con datos reales son pantallas muertas.
- **D-P2. Modelo de dominio desconectado.** El gemelo operativo modela técnicos, habilidades, material y almacenes; `shared/model.ts` fija `entities: z.array(EntitySchema).length(4)`. No hay camino de datos desde HubSpot a esas pantallas.
- **D-P3. El ciclo que se vende no está cerrado.** Hay captura, copia, simulacro y trabajo local, pero la **devolución al CRM con conflictos explicados** (ola 3 de Codex) y la **mesa de respuesta durante la caída** (ola 2) no existen como flujo de usuario. Es exactamente la promesa de la portada: «Tu negocio puede seguir».
- **D-P4. Jerga interna en la interfaz.** «Pin», «captura», «revisión de contexto», «A4», «sin demostrar», «cobertura», «Ficción: simular un cambio posterior en la cartera»… Correctos técnicamente, opacos para el responsable de una pyme.

### 6.2 Diseño y UX (sobre las capturas del 11–13/11)
- **Inicio (1366 px): el mejor apartado.** Jerarquía clara, una pieza de firma («La semana en una línea»), siguiente paso único. Mejorable: la columna derecha apila cinco tarjetas de peso parecido; la de copia de seguridad compite con «Tu siguiente paso».
- **Navegación:** ~18 entradas en cuatro grupos más el submenú Trabajar y el desplegable Preparación. «Proteger / bloquear» y «Espacio comercial» son acciones, no lugares. «Proveedor de IA» y «Preparación» son configuración y ocupan espacio fijo.
- **Continuidad:** el estado está bien resuelto, pero la tarjeta «Preparación de tu Plan B» corta los textos de acción contra el borde («Elegir contraseña», «Conectar HubSpot»), y la mitad inferior izquierda queda vacía.
- **Comprobar una fecha:** formulario técnico denso, la etiqueta «Ensayo» y el texto «Ficción: …» repetidos; el select de habilidad se corta («Sistemas VRF (habilit…»).
- **Ficha lateral:** buen patrón (relacionado + reglas aplicadas). El campo Empresa duplica control (buscador + select con «ID company-1»): expone el identificador interno.
- **Móvil (390 px):** existe barra inferior y la lista de Hoy es usable, pero la banda «Ensayo · ficción … Ensayar mi semana» se trunca y el botón de refresco suelto sin etiqueta ocupa una fila entera.
- **`/team`:** coherente con Faro, pero con mucho espacio vacío y un botón primario deshabilitado como única llamada a la acción.

### 6.3 Arquitectura del cliente
- **D-A1. CSS en capas.** 9 hojas globales importadas en orden + ~45 hojas por componente. `faro.css` gana por especificidad (`html body …`, 1.012 apariciones) y 73 `!important`. La memoria de otra sesión documenta una regla con especificidad (0,4,1) que obliga a usar ≥5 clases para estilar un control.
- **D-A2. Estado de App monolítico.** `App.tsx` mantiene página, entidad, filtros, paginación, selección, modales, peticiones de tarea, origen de integraciones… y navega con `setPage` + `sessionStorage`. No hay URL por apartado ni por ficha: no se puede enlazar «esta oportunidad», el botón Atrás del navegador no funciona dentro de la App.
- **D-A3. Componentes gigantes con líneas de >300 caracteres** (≥15 líneas así en `TeamApp`, `ContinuityHome`, `CommitmentRadar`, `CommercialWorkspace`, `LocalOperations`, `RescueRoom`, `SalesWorkspace`, `Preparation`). Difíciles de revisar en diff, que es justo lo que hace Codex.
- **D-A4. Dos aplicaciones en un paquete** (`App` y `TeamApp`) que comparten CSS global: un cambio en Faro rompió Contactos de `/team` (documentado en memoria).

### 6.4 Arquitectura del servidor
- **D-S1. Seis generaciones de API vivas** (`/api/v2` a `/api/v7`) más rutas sin versión. Sin inventario ni política de retirada.
- **D-S2. Persistencia por acumulación en `meta`.** Cada módulo nuevo guarda su estado en claves con prefijo dentro de `meta` en lugar de tablas con esquema e índices. No hay sistema de migraciones versionadas para SQLite.
- **D-S3. `records.value` es JSON opaco.** La búsqueda y los filtros se resuelven fuera de SQL. Con el techo de 10.000 registros funciona, pero el propio `PLAN-1.0.md` pide medir antes de ampliar.
- **D-S4. Montaje manual repetido** en `server/main.ts` y `server/runtime.ts`: cada función nueva añade imports y llamadas en los dos, y esos dos archivos son el punto de colisión nº 1 del tablón (reservas 318/324 frente a montajes de Fable y Opus).

### 6.5 Calidad y pruebas
- **D-Q1. Sin línea base en verde.** Otras sesiones registran ~27 fallos en la batería completa (19 previos al rediseño reproducidos, 6 por paralelismo). `tests/.tmp/rd/unit-all.log` muestra fallos por `La clave local requiere Windows o el entorno de pruebas original` (`server/crypto.ts:23`) y una prueba de temporización en `tests/zendesk-source.test.ts:381`.
- **D-Q2. E2E desalineados con el rediseño.** `tests/.tmp/rd/e2e-errors.txt` recoge fallos por objetivos táctiles de 30 px (<44), botón «Conectar HubSpot» que ya no está donde la prueba lo busca, encabezado «Operaciones de la copia» ahora dentro de una pestaña oculta.
- **D-Q3. Pruebas atadas a Windows/DPAPI**: impiden CI en Linux y hacen que la batería dependa de la máquina.
- **D-Q4. Muchas pruebas cotejan huellas SHA de archivos fuente.** Garantizan que se prueba lo presentado, pero cualquier cambio legítimo rompe pruebas ajenas y genera trabajo de re-presentación.
- **Positivo:** oráculos independientes, mutantes, pruebas causales y arneses aislados con red externa bloqueada (`block-external.cjs`). Es un nivel de rigor poco habitual y conviene conservarlo.

### 6.6 Seguridad y privacidad
- **Bien:** CSP estricta (`server/app.ts:56`), comprobación de `Origin`, cookie `HttpOnly; SameSite=Strict`, `timingSafeEqual`, scrypt con sal, clave por carpeta con DPAPI, red externa bloqueada en pruebas, envíos limitados a la propia cuenta.
- **D-Sec1.** Sesiones en memoria (`server/security.ts:18–20`): un reinicio obliga a desbloquear (aceptable) pero no hay límite de intentos de contraseña ni retardo progresivo.
- **D-Sec2.** `scryptSync(password, salt, 32)` usa los parámetros por defecto (N=16384); sin `N/r/p` explícitos ni versión del hash para migrarlos.
- **D-Sec3.** `style-src 'unsafe-inline'` en la CSP; revisable si se eliminan estilos en línea.
- **D-Sec4.** `crypto.ts` invoca PowerShell por proceso para DPAPI; funciona, pero cada apertura de clave lanza `powershell.exe` (lento y sensible a políticas corporativas).

### 6.7 Entrega y operación
- **D-O1.** `npm run build` escribe en las carpetas que sirve el piloto; por eso cada sesión tiene su propio script de compilación en `tests/.tmp/`. Falta un `build:candidate` oficial con salida aislada y manifiesto de hashes.
- **D-O2.** Versión fija `0.6.0` en `package.json` mientras 4331 ha recibido una decena de despliegues distintos. No hay forma de saber, desde la App, qué tanda está viendo el usuario.
- **D-O3.** Copias de seguridad de `dist` por despliegue (`runtime/backup-dist-*`) sin rotación.

---

## 7 · Mejoras propuestas

Cada mejora indica **prioridad** (P0 urgente · P1 alta · P2 media · P3 deseable), **esfuerzo** (S < 1 día · M 1–3 días · L > 3 días de agente), archivos orientativos y criterio de aceptación. Las marcadas **[S]** tocan servidor/persistencia y necesitan acuerdo con Codex; las marcadas **[U]** necesitan una decisión del usuario.

### A · Estabilizar la base (hacer primero)

**A1 · Asegurar el trabajo en Git — P0, S, [U]**
Proponer al usuario una serie de commits locales por tema (no un único commit gigante): coordinación, gemelo operativo, comprobar fecha, A4, fuentes, rediseño Faro, pruebas. Excluir `tests/outputs`, `tests/.tmp`, `test-results`, `debug.log`. Revisar `.gitignore`. Normalizar finales de línea con un `.gitattributes` (`* text=auto eol=lf` para fuentes) porque Git avisa de conversión LF→CRLF en 60+ archivos y varias sesiones documentan fallos de parches por finales mezclados.
*Aceptación:* `git status` limpio salvo artefactos ignorados; ningún archivo de `data/`, `.env*`, claves o instalaciones en el índice; sin push.

**A2 · Vaciar la cola de revisión — P0, M, [U]**
Proponer al usuario y a Codex una «jornada de aceptación»: clasificar las 220 entregas en (a) aceptables tal cual, (b) superadas por trabajo posterior → cerrar como sustituidas, (c) con huella rota por montaje → un único encargo de reconciliación que re-presente el estado actual. Añadir al tablón un estado `superseded` si no existe.
*Aceptación:* `review` < 30; cada cierre con motivo.

**A3 · Línea base de pruebas en verde — P0, M**
1. Permitir un proveedor de clave de pruebas explícito en `server/crypto.ts` (inyección, no variable de entorno silenciosa) para que las pruebas no dependan de DPAPI ni de `NODE_ENV`.
2. Etiquetar las pruebas temporales frágiles (`zendesk-source.test.ts:381`) y darles reloj falso.
3. Adaptar los E2E al rediseño (pestañas de Continuidad, pie `footer.gx-statusbar`, objetivos táctiles ≥44 px).
4. Separar `npm test` en `test:unit` (rápido, sin red ni procesos) y `test:integration`.
*Aceptación:* `npm test` y E2E en verde en Windows; lista de excepciones documentada con causa y propietario.

**A4 · Compilación candidata oficial — P1, S [S]**
Script `build:candidate` que compile a `outputs/candidates/<fecha-hash>/` con manifiesto SHA-256 de cada artefacto y número de versión `0.6.0+<n>`. Mostrar esa versión en el pie de la barra lateral. Retirar los scripts de compilación duplicados de `tests/.tmp/`.
*Aceptación:* nadie necesita `npm run build`; la App muestra qué tanda está sirviendo.

### B · Arquitectura

**B1 · Router con URL por apartado y por ficha — P1, M**
Sustituir `page` + `sessionStorage` por rutas (`/inicio`, `/hoy`, `/clientes/:id`, `/oportunidades?vista=tablero`…). Puede hacerse sin dependencias nuevas con `history.pushState` y un hook propio; si se añade una librería, necesita encargo sobre `package.json`. Beneficios: enlaces compartibles, Atrás del navegador, restaurar estado tras recargar, E2E más simples.
*Aceptación:* cada apartado y cada ficha tienen URL; Atrás/Adelante funcionan; los atajos `G`+letra siguen funcionando.

**B2 · Sacar el estado de registros de `App.tsx` — P1, M**
Crear `src/app-shell/useRecords.ts` (entidad, consulta, filtros, paginación, carga, revisión de datos) y `useSelection.ts`. `App.tsx` queda como composición de marco + rutas.
*Aceptación:* `App.tsx` < 8 KB; tipos limpios; pruebas de App en verde.

**B3 · Un solo sistema de estilos — P1, L**
Plan por fases ya esbozado en `coordination/briefs/CLAUDE-PLAN-FARO-SIGUIENTE.md` (fase 0). Concretar:
1. Tokens en `src/ui/tokens.css` (color, tipo, espacio, radio, sombra, alturas de control, modo oscuro).
2. Componentes de `src/ui/` con CSS propio de baja especificidad (una clase por componente, `@layer`).
3. Usar `@layer reset, tokens, base, components, pages, overrides` para ordenar capas sin depender de `html body` ni `!important`.
4. Migrar apartado por apartado comparando capturas con `tools/visual/check.mts` y retirar las hojas heredadas (`styles`, `refinements`, `sales`, `planb-ui`, `operaciones-claras`) cuando queden vacías.
*Aceptación:* 0 selectores `html body`, < 10 `!important`, CSS total < 200 KB, capturas idénticas en las 18 vistas × 4 resoluciones (con tolerancia documentada).

**B4 · Registro de módulos del servidor — P1, S [S]**
Un `server/modules.ts` con la lista de montajes (`{ id, mount(app, store, security), entrypoints: ['main','runtime'] }`) que `main.ts` y `runtime.ts` recorren. Añadir un apartado ya no exige tocar los dos archivos más disputados del tablón.
*Aceptación:* `main.ts`/`runtime.ts` sin imports de funciones concretas; prueba que verifica que cada módulo declarado se monta donde dice.

**B5 · API unificada y documentada — P2, M [S]**
Inventario automático de rutas (script que las extrae de Fastify con `printRoutes`) → tabla en `docs/api.md`. Definir `/api/v8` como fachada estable para el cliente nuevo y marcar las anteriores como internas. Esquemas zod de respuesta compartidos en `shared/` (muchos ya existen).
*Aceptación:* el cliente solo llama a rutas documentadas; prueba que falla si aparece una ruta sin documentar.

**B6 · Esquema y migraciones SQLite — P2, M [S]**
Tabla `schema_migrations`, migraciones numeradas, y tablas propias para los módulos que hoy viven en `meta` (decisiones, desenlaces, intentos A4, ensayos, historial de lecturas). Índices por `entity` y por campos frecuentes extraídos (`json_extract` o columnas generadas).
*Aceptación:* abrir una base antigua migra sin pérdida (prueba con fixture de cada versión); consultas de lista y búsqueda medidas con 10.000 registros.

**B7 · Partir los componentes gigantes — P2, M**
`LocalTaskFocus.tsx`, `CommitmentRadar.tsx`, `ContinuityLab.tsx`, `OperationalRehearsal.tsx`, `DateCheck.tsx`, `LocalOperations.tsx`, `TeamApp.tsx`: separar lógica pura (testeable sin DOM) de presentación, y formatear (Prettier o similar si el usuario autoriza la dependencia; si no, regla de longitud de línea).
*Aceptación:* ningún archivo de `src/` > 25 KB; ninguna línea > 160 caracteres en archivos tocados.

### C · Funcionalidad (lo que el usuario ganaría)

**C1 · Separar «Laboratorio» de la operación — P0, S, [U]**
Mover Radar, Comprobar una fecha, Ensayar mi semana y el futuro Laboratorio de caídas a un apartado **«Laboratorio»** (o «Ensayos») visible solo cuando la copia activa es de ensayo, o bajo un interruptor explícito. Quitar el contador de riesgo del menú y la tarjeta del Radar de Inicio cuando la copia sea real.
*Aceptación:* con datos reales ningún apartado visible devuelve «Activa una copia de datos de ensayo».

**C2 · Decidir el futuro del gemelo operativo — P1, [U]**
Dos caminos: (a) **producto vertical** para empresas de instalación/servicio técnico, lo que exige ampliar el modelo (técnicos, habilidades, material) con una fuente real (HubSpot custom objects, hoja de cálculo o formulario propio); (b) **demostrador** de capacidad para agencias, sin ampliarlo. Mientras no se decida, no seguir invirtiendo en él.

**C3 · Mesa de respuesta durante una caída — P1, L [S]** (ola 2 de Codex)
Un modo «El CRM no responde» que se activa a mano o al fallar la captura: cola determinista de lo que vence hoy y durante la caída, con cliente, motivo del orden y acciones locales (llamar, anotar, crear tarea), todo con trazabilidad para devolverlo después. Reutilizar `shared/work-queue.ts`, `shared/response-queue.ts` y Hoy; no crear otra lista.
*Aceptación:* recorrido completo con fixture: activar → resolver 3 tareas → salir; cada acción queda en Cambios con su motivo.

**C4 · Devolución al CRM con conflictos explicados — P1, L [S]** (ola 3)
Pantalla «Devolver cambios»: agrupar por cliente, mostrar valor capturado / local / remoto actual, explicar la consecuencia de cada decisión, generar un lote revisable con IDs estables, ejecutar con un único ejecutor idempotente y marcar como «incierto» lo que no se pueda confirmar (nunca reintentar a ciegas). Escritura real en HubSpot solo con autorización específica del usuario y portal de ensayo.
*Aceptación:* con transportes ficticios: un cambio remoto posterior no se pisa; repetir no duplica; propuesta obsoleta invalida la aprobación.

**C5 · Simulacro guiado de caída — P2, M**
Convertir «Probar mi Plan B» en un recorrido paso a paso (abrir la copia, encontrar un cliente, cerrar una tarea, exportar) con cronómetro y parte final compartible («qué está demostrado y qué no»). Conecta con el laboratorio (`shared/continuity-lab.ts`) para comparar objetivo de recuperación con lo medido.

**C6 · Avisos que llegan a tiempo — P2, S**
Notificaciones del sistema (Notification API, con permiso) y aviso en el icono de la pestaña cuando la copia supera su antigüedad objetivo, una prueba caduca o hay tareas vencidas nuevas.

**C7 · Vistas guardadas y filtros compuestos — P2, M**
«Mis vencidas», «Oportunidades > 3.000 € en Propuesta», «Clientes sin tarea en 30 días». Guardadas por instalación, accesibles desde la paleta Ctrl J y la barra lateral.

**C8 · Deshacer el último cambio local — P2, S [S]**
`changes` ya guarda `before_json`; exponer «Deshacer» durante unos segundos tras guardar y desde Cambios, con la misma validación que al editar.

**C9 · Importación desde CSV/Excel — P2, M [S]**
Para pymes sin HubSpot o como plan C: asistente de mapeo de columnas a las cuatro entidades, vista previa, validación con las reglas importadas y procedencia («importado de clientes.csv, 13/11»). Reutilizar el verificador de migraciones de Claude B.

**C10 · Copiloto en modo propuesta — P3, L [S] [U]** (ola 4)
Sobre la superficie de propuestas existente: el usuario selecciona tareas, la IA (proveedor configurable, incluido Gemini vía `server/provider.ts`) propone el plan con referencias a registros, y nada se ejecuta sin aprobación ligada a la revisión. Evaluación previa con fixtures adversos (`AGENTE-IA-LOCAL.md`). Requiere aprobación expresa para usar datos reales con un proveedor externo.

**C11 · Profundidad HubSpot — P2, L [S] [U]**
Propietarios, notas, actividades, asociaciones y paginación completa; webhooks o lectura incremental. Pendiente en `PLAN-1.0.md` 0.6. Solo con el portal de ensayo y autorización del usuario.

**C12 · Primer uso — P3, S**
Recorrido de tres pasos para quien abre Plan B por primera vez, con datos de ejemplo claramente marcados y un botón para borrarlos.

### D · Diseño y experiencia

**D1 · Navegación en cinco lugares — P1, M, [U]**
Propuesta: **Inicio · Hoy · Clientes (con Empresas, Oportunidades y Tareas como pestañas o vistas) · Continuidad (con Cambios, Exportar, Copia de equipo) · Ajustes (Integraciones, IA, Preparación, Proteger)**. «Laboratorio» aparte según C1. Acciones como «Bloquear» pasan al menú de usuario de la barra superior. Agentes se integra en Hoy como propuestas.
*Aceptación:* ≤ 7 entradas de primer nivel; prueba con 5 tareas habituales que no aumente el número de clics.

**D2 · Lenguaje del usuario — P1, S**
Revisión de textos con la skill de UX copy: sustituir «pin», «captura», «revisión», «cobertura», «sin demostrar», «ficción» por términos del negocio («copia del lunes 14:16», «comprobado», «no comprobado todavía», «datos de prueba»). Glosario único en `docs/voz.md`.

**D3 · Estados diseñados una vez — P1, M**
Componentes `Vacío`, `Cargando` (esqueletos en lugar de «Leyendo…»), `Error` (con qué hacer), `Sin permiso` y `Datos de prueba` en `src/ui/`, usados por todos los apartados.

**D4 · Arreglos concretos vistos en capturas — P1, S**
- Continuidad › «Preparación de tu Plan B»: textos de acción cortados contra el borde; rellenar la mitad izquierda vacía con la cronología de copias.
- Ficha: no mostrar «ID company-1»; un solo control buscable para Empresa.
- Comprobar una fecha: select de habilidad cortado; una sola marca de «ensayo».
- Móvil: banda del ensayo truncada; botón de refresco sin texto en fila propia.
- Inicio: reducir a tres tarjetas en la columna derecha y dar jerarquía clara a «Tu siguiente paso».

**D5 · Móvil como diseño propio — P2, M**
Hoy, ficha y Continuidad pensadas para 390 px (no solo apiladas): acciones al pulgar, ficha a pantalla completa con gesto de cierre, tablas convertidas en listas.

**D6 · Tipografía empaquetada — P2, S, [U]**
Faro depende de Sitka (solo Windows). Empaquetar una familia libre (p. ej. una serif de titulares y una sans de interfaz con licencia OFL) servida desde la App. Requiere permiso para descargarla.

**D7 · Accesibilidad sostenida — P2, S**
`tools/visual/a11y.mts` ya da 0 avisos en 18 vistas: llevarlo a la batería, añadir comprobación de objetivos táctiles ≥ 44 px y navegación completa por teclado en la paleta, el tablero y la ficha.

**D8 · `/team` al nivel de la App — P3, M**
Mismos componentes, estados y voz; quitar el botón primario deshabilitado como única acción de una pantalla vacía.

### E · Calidad y pruebas

**E1 · CI local reproducible — P1, M**
Un `tools/ci.mjs` que ejecute tipos, unitarias, E2E en carpeta temporal, a11y y comparación visual, y produzca un informe único. Sin servicios externos.

**E2 · Pruebas por contrato en lugar de huellas de archivo — P2, M**
Mantener las huellas solo para la evidencia de revisión del tablón; en las pruebas, comprobar comportamiento y contratos (esquemas zod, respuestas HTTP), para que un cambio legítimo no rompa pruebas ajenas.

**E3 · Presupuestos de rendimiento — P2, S**
Medir y fijar: paquete inicial (hoy ~613 kB tras carga diferida), tiempo hasta lista de clientes con 10.000 registros, apertura de ficha, búsqueda global. Fallar si se superan.

### F · Seguridad y privacidad

**F1 · Límite de intentos de desbloqueo — P1, S [S]** Retardo progresivo y bloqueo temporal tras N fallos en `/api/v2/auth/login`.
**F2 · Parámetros scrypt explícitos y versionados — P2, S [S]** `N=2^17, r=8, p=1` (o el máximo aceptable en el equipo), con campo `v` para migrar al siguiente desbloqueo.
**F3 · DPAPI sin PowerShell por proceso — P3, M [S]** Cachear ya se hace; valorar un pequeño ejecutable nativo o `node-dpapi` si el usuario autoriza la dependencia.
**F4 · Revisión de privacidad de IA — P2, S** Antes de C10: lista de campos que nunca salen del equipo, registro local de cada petición a un proveedor y botón «ver lo que se envió».

### G · Coordinación y documentación

**G1 · Una sola fuente de verdad del estado — P1, S, [U]** `ESTADO.md` de una página (qué hay desplegado en 4331 y 4334, qué funciona de verdad, qué es ensayo, qué falta), regenerado al cerrar cada tanda. `CONTEXTO-PROYECTO.md` pasa a ser historial.
**G2 · Mover los `LEEME-*` y guías históricas a `docs/historial/`** — P2, S (con encargo).
**G3 · Límite de tamaño para informes del tablón** (p. ej. 30 KB; anexos aparte) — P3, S.
**G4 · Protocolo para órdenes directas del usuario** — P1, S: cuando el usuario ordena montar o desplegar sobre reservas ajenas, abrir automáticamente un encargo de reconciliación y avisar en el chat del tablón con la lista de huellas afectadas (lo que ya se hace a mano).

---

## 8 · Hoja de ruta propuesta

| Ola | Contenido | Resultado visible |
| --- | --- | --- |
| **1 · Suelo firme** (P0) | A1, A2, A3, C1 | Trabajo a salvo, cola de revisión manejable, pruebas en verde, menú sin pantallas muertas con datos reales |
| **2 · Esqueleto sano** | A4, B1, B2, B4, D2, D4, G1, G4 | URLs, versión visible, textos claros, arreglos visuales, menos colisiones entre agentes |
| **3 · El ciclo que se vende** | C3, C4, C5, D1, D3 | «Cae HubSpot → sigo trabajando → devuelvo con conflictos explicados», demostrable de principio a fin |
| **4 · Consolidación** | B3, B5, B6, B7, E1, E2, F1, F2 | CSS y API ordenados, migraciones, CI local |
| **5 · Ahorro diario** | C6, C7, C8, C9, D5, D6, D7, E3 | Funciones de productividad, móvil propio, rendimiento medido |
| **6 · Autonomía** | C10, C11, F4, D8 | Copiloto en modo propuesta y profundidad HubSpot, con autorización del usuario |

C2 (futuro del gemelo operativo) debe decidirse antes de la ola 3.

---

## 9 · Decisiones que necesita el usuario

1. ¿Autoriza los commits locales por tema de A1 (sin push)?
2. ¿Organiza una jornada de aceptación con Codex (A2), o delega en un agente la clasificación de las 220 entregas?
3. Radar / Comprobar una fecha / Ensayar mi semana: ¿producto vertical (ampliar modelo) o demostrador en «Laboratorio»? (C1, C2)
4. ¿Aprueba la navegación en cinco lugares (D1)?
5. ¿Autoriza dependencias nuevas (router, formateador, tipografía) o se mantiene «sin dependencias»?
6. ¿Prioridad: ciclo de devolución (C3/C4) o productividad diaria (C6–C9)?
7. Para C10/C11: ¿qué proveedor de IA y qué portal HubSpot de ensayo se autorizan?

---

## 10 · Anexos

### Mapa rápido de archivos
- Entrada cliente: `src/main.tsx` → `src/App.tsx` / `src/TeamApp.tsx`
- Marco: `src/app-shell/` (Sidebar, TopBar, MobileNav, CommandPalette, session, useShortcuts, lazy-pages, theme)
- Piezas base: `src/ui/index.tsx`; identidad: `src/faro.css`
- Servidor local: `server/main.ts`, `server/runtime.ts`, `server/app.ts`, `server/store.ts`, `server/security.ts`, `server/crypto.ts`
- Servicio de equipo: `server/team/`
- Contratos: `shared/model.ts` y `shared/*-api.ts`
- Gemelo operativo: `shared/operational-*.ts`, `server/operational-rehearsal-mount.ts`, `src/OperationalRehearsal.tsx`
- Comprobar una fecha: `shared/operational-date-check.ts`, `server/date-check-mount.ts`, `src/DateCheck.tsx`, `src/DecisionReview.tsx`
- Continuidad: `src/ContinuityHome.tsx`, `ContinuityHub.tsx`, `ContinuityEvidence.tsx`, `ContinuityPassport.tsx`, `ImpactMap.tsx`; laboratorio `shared/continuity-lab.ts`
- Coordinación: `tools/coordination/board.mjs`, `coordination/{tasks,briefs,reports,reviews,plans}/`, chat `tools/chat/chat.mjs`
- Red visual: `tools/visual/` (check, diff, css-audit, a11y, dark-scan)

### Comandos útiles (solo lectura o aislados)
```bash
node tools/coordination/board.mjs list
npx tsc --noEmit
npm test
node tools/chat/chat.mjs read --as claude
```
Para E2E, usar las configuraciones aisladas de `tests/.tmp/*/pw.config.ts` con `PLANB_PLAYWRIGHT_EXECUTABLE` apuntando a `chrome-headless-shell` y nunca contra 4331/4334.

### Glosario
- **Captura:** foto de los registros del CRM en un instante. **Copia activa:** la captura con la que se trabaja.
- **Pin / revisión de contexto:** huella de la copia activa; las rutas la exigen para no mezclar copias.
- **Simulacro / prueba:** recuperación de la copia en un entorno aparte para demostrar que se puede trabajar.
- **A4:** contrato de guardado duradero de tareas con estados honestos (confirmado, incierto, conflicto).
- **Ficción / ensayo:** datos inventados; las funciones de «Operaciones» solo admiten estos.
- **4331 / 4334:** CRM completo del usuario / piloto protegido.
