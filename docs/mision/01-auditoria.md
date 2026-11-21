# Misión maestra · 1. Auditoría completa de Plan B

Hecha el **21/11/2026** sobre la rama `planb-v0.3-local` (commit `59e7a47`, identidad «Consola de operaciones»), por Claude en el ordenador de `D:\AI\Plan-B-CRM-v2.1`.

## Cómo se hizo y qué vale como evidencia

| Fuente | Qué se hizo | Límite |
| --- | --- | --- |
| Código | Lectura de `App.tsx`, navegación, rutas, servidores (`server/*.ts`), contratos (`shared/*.ts`), inventario de API (`docs/api.md`, 171 rutas) | Lectura dirigida: no se han leído uno a uno los ~41.000 líneas de TS |
| App en marcha | Ensayo aislado propio: API `4571` + interfaz `4572`, datos ficticios nuevos («Agencia Norte»: 24 clientes, 8 empresas, 12 oportunidades, 18 tareas), `NODE_ENV=test` (sin DPAPI) y red exterior bloqueada | Datos de prueba pequeños: no representa una copia de 10.000 registros |
| Medición | `tests/.tmp/mision/measure.mts`: las 19 rutas a 1440, 1366 y 390 px con Chromium sin interfaz. Mide scroll, desborde, mayor hueco vacío, alturas de controles, tamaños de letra y radios | El «hueco» es un indicador geométrico, no un juicio de diseño. Las capturas están en `tests/.tmp/mision/shots/antes/` |
| Pruebas | `node tools/safe-tests.mjs` (pruebas sin puertos, procesos ni navegador) | No se lanzaron las E2E ni la CI completa |
| Mercado | Tres búsquedas web genéricas (sin datos del proyecto) | Fuentes en parte comerciales; ver `04-comercializacion.md` |

Leyenda de estados usada en todo el documento:

- **Real**: el código lo hace de extremo a extremo y hay prueba automática o evidencia registrada.
- **Real, sin probar en real**: el código existe, pero nunca se ha ejecutado contra un sistema auténtico.
- **Limitado**: funciona solo con datos de prueba, en simulación o con una condición.
- **Representado**: hay pantalla o texto, pero no hay funcionamiento detrás.
- **Sin montar**: código terminado que la App no muestra.

## 1. Veredicto en cinco líneas

1. **El motor es mucho mejor que la interfaz.** Captura con paginación y reintentos, copia cifrada, registro de cambios, devolución con conflictos campo a campo y simulacro en proceso aislado son reales y están bien pensados.
2. **La interfaz enseña demasiado a la vez.** Inicio tiene 12 bloques y Continuidad 11. La misma acción aparece tres veces en Inicio y la «preparación» se expresa de cuatro maneras distintas en Continuidad.
3. **No hay un sistema visual: hay capas.** 11 hojas globales se pisan en cascada (≈680 KB de CSS, `faro.css` sola 237 KB). En diez días la identidad cambió cinco veces (Operaciones claras → Grafito → Faro → Cuaderno → Consola). Resultado medido: 19 tamaños de letra, 9 radios y 15 alturas de botón distintas.
4. **Para venderlo faltan piezas que no son de interfaz.** No hay clave de licencias, las alertas de Defender por DPAPI asustan en equipos de empresa, la devolución a producción no está habilitada y el proceso de trabajo tiene 353 encargos sin revisar.
5. **La diferencia comercial existe y es defendible.** Los competidores copian HubSpot y restauran dentro de HubSpot; ninguno de los consultados deja **seguir trabajando** mientras HubSpot no está. Plan B sí, y además lo demuestra con un simulacro.

## 2. Inventario de la App

### 2.1 Mapa de navegación real

Menú en cinco lugares más el Laboratorio (`src/app-shell/navigation.ts`). Direcciones de `src/app-shell/routes.ts`.

| Grupo | Entrada | Dirección | Componente | Cuándo se ve |
| --- | --- | --- | --- | --- |
| Inicio | Inicio | `/inicio` | `HomeOverview.tsx` | Siempre |
| Hoy | Tareas de hoy | `/hoy` | `LocalOperations.tsx` (`view=today`) | Salvo copia independiente |
| | Revisión semanal | `/hoy/semana` | `app-shell/WeeklyReview.tsx` | Con copia lista |
| | Agenda | `/hoy/agenda` | `app-shell/Agenda.tsx` | Con copia lista |
| | Propuestas | `/hoy/propuestas` | `LocalOperations.tsx` (`view=agents`) | Salvo copia independiente |
| Clientes | Clientes, Empresas, Oportunidades, Tareas | `/clientes` … `/tareas` | `app-shell/RecordsPage.tsx` + ficha `RecordDrawer` | Con copia lista |
| Continuidad | Estado | `/continuidad` | `ContinuityHome.tsx` (4 pestañas) | Siempre |
| | Cambios | `/continuidad/cambios` | `ChangesView.tsx` | Con copia lista |
| | Exportar | `/continuidad/exportar` | `PortableExport.tsx` | Con copia lista |
| | Copia de equipo | `/continuidad/equipo` | `TeamSync.tsx` | Salvo copia independiente |
| Ajustes | Integraciones | `/ajustes/integraciones` | `LocalIntegrations.tsx` | Salvo copia independiente |
| | Proveedor de IA | (ventana) | `Settings.tsx` | Solo con datos de prueba |
| | Preparación | `/ajustes/preparacion` | `Preparation.tsx` | Salvo copia independiente |
| | Plan y licencia | `/ajustes/plan` | `LicensePanel.tsx` | Salvo copia independiente |
| Laboratorio | Radar | `/laboratorio/radar` | `RadarHost.tsx` / `OperationalRehearsal.tsx` | Solo con datos de prueba |
| | Comprobar fecha | `/laboratorio/fecha` | `DateCheck.tsx` + `DecisionReview.tsx` | Solo con datos de prueba |
| | ¿Y si cae…? | `/laboratorio/caidas` | `OutageLab.tsx` | Solo con datos de prueba |

Fuera del menú: espacio de equipo `/team` (`TeamApp.tsx`, servidor propio), landing `/plan-b.html`, pantalla de acceso y bloqueo (`Protection.tsx`, `LocalPilotGate.tsx`).

Capas y ventanas: paleta de órdenes (Ctrl J, con «Pregunta a tu copia»), búsqueda global, ficha lateral con resumen, relacionados, actividad, secuencias e historial, importar CSV, fusionar duplicados, reprogramar cierres, despachar vencidas (`FocusRun`), práctica guiada, banda de modo contingencia, novedades, atajos, cobertura de la copia y proveedor de IA.

### 2.2 Código terminado que la App no muestra

| Pieza | Tamaño | Estado |
| --- | --- | --- |
| `RescueRoom.tsx` + `server/rescue-room*.ts` | ~30 KB | Sin montar; su servidor solo arranca desde scripts de demostración |
| `RescueCapsule.tsx` + `server/rescue-capsule*.ts` | ~20 KB | Sin montar |
| `SourceReadingHistory.tsx`, `SourceStatusRow.tsx` | ~15 KB | Sin montar |
| `server/recovery-rehearsal.ts` | — | Solo artefactos sintéticos; escribe en `tests/.tmp` de la carpeta del código: no debe viajar en un instalable |

Decisión propuesta: cada pieza se monta con un propósito claro o se retira del paquete (ver Superplan A, A0).

## 3. Auditoría por pantalla

Columnas: propósito real · lo imprescindible · problemas medidos u observados · veredicto. Las cifras «scroll» son pantallas de alto a 1440×900 y a 390×844. «Hueco» es el mayor rectángulo vacío dentro de la primera pantalla del área principal.

### Inicio `/inicio` · scroll 2,1 / 5,2 · 12 bloques

- **Propósito real:** decir al empezar el día qué urge y si la copia está bien.
- **Imprescindible:** lo vencido, la siguiente acción y el estado de la copia.
- **Problemas:**
  - La misma acción («Revisa ‹Revisar los detalles · Pablo›») aparece **tres veces**: en «Primeros pasos», en «Tu siguiente paso» y en «Prioridades de hoy».
  - «Esta copia no se ha probado» sale dos veces y la preparación otras dos.
  - «Desde ayer: Sin cambios» ocupa un tercio de fila para dos palabras.
  - «Oportunidades abiertas» es un panel completo dentro del panel: cifras, objetivo del mes, previsión y en riesgo. El objetivo solo se guarda en este navegador.
  - Banda de onboarding arriba, parte de la mañana plegable y la semana en una línea compiten por el primer plano.
- **Veredicto: rediseñar.** Pasa a ser un «puesto de mando» de tres zonas: una línea de estado, la columna de trabajo (prioridades y oportunidades en riesgo) y el riel de la copia. La analítica de oportunidades va a Oportunidades, la semana a la Agenda y la calidad de datos a Clientes.

### Hoy · Tareas de hoy `/hoy` · scroll 1,0 / 2,3

- **Propósito:** decidir qué atender ahora. Es la mejor pantalla de la App: tabla densa y legible.
- **Problemas:**
  - Cuatro acciones en la cabecera (Actualizar, Organizar mi jornada, Despachar vencidas, Abrir tareas).
  - Un aviso del Laboratorio encima del trabajo.
  - La columna «Estado» repite lo que dice «Vence» («Vencida · 19 d» y «2 nov»).
  - Hay un enlace «Abrir» por fila en vez de fila pulsable, y «Abrir oportunidades» abajo es navegación sin contexto.
- **Veredicto: conservar y simplificar.** Una acción principal, «Despachar» solo si hay vencidas y el estado fundido con la fecha.

### Hoy · Revisión semanal `/hoy/semana` · scroll 1,2 / 2,4

- **Propósito:** cerrar la semana con decisiones.
- **Problemas:** cinco cifras en fila, de las que tres son 0 (decorativas). Las vencidas se repiten con Hoy y con «Despachar vencidas».
- **Veredicto: simplificar.** Cifras solo si son distintas de cero. La lista de vencidas reutiliza el mismo componente que Hoy.

### Hoy · Agenda `/hoy/agenda` · scroll 1,0 / 1,9

- **Propósito:** ver la carga por días y mover cierres.
- **Problemas:**
  - **Cifras contradictorias:** «Vencidas aquí 2» en la regla y «Vencido sin resolver 23» en el panel.
  - El panel lateral es la tercera lista de vencidas de la App.
  - Fines de semana vacíos a ancho completo.
- **Veredicto: ajustar.** Una sola definición de «vencido» y un panel del día que muestre el día, no las vencidas globales.

### Hoy · Propuestas `/hoy/propuestas` · scroll 1,0 / 1,9

- **Propósito declarado:** propuestas de seguimiento de los agentes.
- **Realidad:** es la **misma tabla que Hoy** (mismas pestañas y filas) más una tarjeta «Revisión de prioridades». Las propuestas de agentes también salen en Cambios. Motor en simulación: reglas y destinos simulados.
- **Veredicto: fusionar.** Fuera del menú. Las propuestas pasan a ser una acción dentro de Hoy, solo con datos de prueba mientras sigan simuladas.

### Clientes, Empresas y Tareas · scroll 1,1 / 4,6 (Clientes)

- **Propósito:** trabajar registros: buscar, filtrar, editar.
- **Bien resuelto:** búsqueda, vistas rápidas, CSV, copiar, alta, edición en línea y paginación.
- **Problemas:**
  - En Empresas, una tabla de tres columnas estirada a 1.190 px: el teléfono queda a 550 px del nombre (hueco medido del 43 % de la primera pantalla).
  - Vistas rápidas con recuento 0 con el mismo peso que las útiles.
  - La barra inferior mezcla acciones **globales** («Ver cobertura», «Desconectar servicios») con la paginación de la lista.
  - En móvil, Clientes y Tareas ocupan 4,6 y 4,8 pantallas.
- **Veredicto: ajustar composición.** Columnas proporcionales con ancho máximo de tabla cuando hay pocas columnas. Vistas a 0 atenuadas. Acciones globales a Continuidad. Más densidad en las tarjetas móviles.

### Oportunidades `/oportunidades` · scroll 1,0 / 2,1

- **Bien resuelto:** el tablero por etapas con importes y cierre vencido.
- **Problemas:** ocho vistas rápidas, cinco de ellas a 0. Botón «Analítica PRO» en la cabecera. Misma barra inferior global.
- **Veredicto: conservar.** Recibe aquí la analítica que hoy vive en Inicio.

### Ficha de registro (cajón lateral)

- **Propósito:** ver y editar un registro con su contexto.
- **Contenido:** resumen, relacionados, registrar actividad, secuencias, historial («máquina del tiempo») y anclar.
- **Riesgo:** acumula seis bloques en una columna estrecha. Con más datos reales necesitará jerarquía: resumen y acciones arriba, historial y secuencias plegados.
- **Veredicto: revisar con datos densos** (pendiente de captura con una copia grande).

### Continuidad · Estado `/continuidad` · scroll 1,7 / 4,0 · 11 bloques y 4 pestañas

- **Propósito real:** responder a la frase central del producto: qué conservo, si puedo seguir y cómo volveré.
- **Problemas:**
  - La preparación se dice **cuatro veces** con números distintos: «Casi listo 1 de 5», «Sello: 3 de 5 criterios», «Preparación de tu Plan B 1 de 5» y «Prueba pendiente / no se ha probado» (dos veces).
  - Dos botones principales («Activar modo contingencia», «Continuar trabajando»).
  - Tres acciones de informe en la cabecera (Parte, Informe del mes, Tu marca).
  - Seis cifras en fila, bloques de explicación largos y «¿Cuánto costaría parar sin copia?», que es material de venta, en la pantalla operativa.
- **Veredicto: rediseñar alrededor de un único modelo de preparación** con cinco criterios verificables y un siguiente paso. Las pestañas se reordenan como Copia · Prueba · Vuelta. Los informes van a un único menú «Informes».

### Continuidad · Cambios `/continuidad/cambios` · hueco 34 %

- **Propósito:** ver lo cambiado durante la contingencia y devolverlo con control.
- **Problemas:**
  - Con cero cambios enseña tres paneles: historial vacío, «Propuestas de agentes» (duplicado de Hoy) y el asistente de devolución de cinco pasos, deshabilitado.
  - El paso 1 dice «no hay cambios», pero el asistente entero sigue a la vista.
- **Veredicto: estado vacío de una línea.** El asistente solo aparece cuando hay algo que devolver. Fuera las propuestas.

### Continuidad · Exportar `/continuidad/exportar` · hueco 46 %

- **Propósito:** sacar una copia cifrada y una App independiente fuera del equipo.
- **Problemas:** tres párrafos de advertencias y dos columnas de alturas distintas. El botón principal está deshabilitado sin decir qué falta (casilla y contraseña).
- **Veredicto: una columna de 720 px** con pasos numerados (revisar, contraseña, descargar) y el motivo del bloqueo junto al botón.

### Continuidad · Copia de equipo `/continuidad/equipo` · hueco 44 %

- **Propósito:** vincular la copia local con un servicio de equipo.
- **Realidad:** un formulario de tres campos para un servicio que no está desplegado. La persona no puede hacer nada útil aquí.
- **Veredicto: ocultar** salvo que exista un servicio de equipo configurado. Mientras tanto, una fila «no configurado» en Integraciones.

### Ajustes · Integraciones `/ajustes/integraciones`

- **Problemas:** mezcla el resumen del espacio local, HubSpot, la comprobación de lectura y una rejilla de cinco tarjetas de Google Workspace que solo funcionan con un espacio de equipo que no existe.
- **Veredicto: lista de conexiones con estado en filas** (HubSpot, comprobación de lectura y, solo si hay equipo, Google).

### Ajustes · Preparación `/ajustes/preparacion`

- **Propósito real:** el alta del producto: origen, procesos, generar y exportar.
- **Problemas:**
  - Es el flujo más importante para un cliente nuevo y vive escondido en Ajustes.
  - Botones de 44 px junto a otros de 28 px.
  - Una subentrada de menú «Abrir aplicación» que no es un lugar.
- **Veredicto: mover** a «Configurar Plan B», lanzado desde Continuidad y desde el primer uso.

### Ajustes · Plan y licencia `/ajustes/plan`

- **Realidad:** el verificador de licencias Ed25519 existe, pero `LICENSE_PUBLIC_KEY` está vacía (`shared/license.ts:12`), así que ninguna licencia puede validarse. La prueba de 14 días se guarda en el navegador y las puertas «Pro» se comprueban solo en el cliente.
- **Veredicto: Representado** a efectos comerciales (ver Superplan A, A6).

### Laboratorio: Radar, Comprobar fecha y ¿Y si cae…?

- **Realidad:** solo funcionan con datos de prueba; el servidor rechaza los reales. Radar arranca vacío (hueco del 66 %) hasta activar el escenario. «¿Y si cae…?» ocupa 3,4 pantallas en escritorio y 7,7 en móvil.
- **Veredicto: fuera de la versión comercial 1.0** salvo como modo demostración. Lo útil de «¿Y si cae…?» pasa a la landing y al guion de venta.

### Barra superior y menú

- **El botón rojo permanente «HubSpot no responde»** (`TopBar.tsx:34`) parece una alarma de estado, pero es la orden para activar el modo contingencia. Con HubSpot funcionando, la App enseña siempre un aviso rojo: **falso positivo de estado**, malo para la confianza.
- Siete controles en la barra (copia, datos de prueba, contingencia, novedades, tema, órdenes, bloquear) más la ayuda.
- Hallazgos de la auditoría de `/team` del 21/11, sesión «planb-rendimiento», que afectan a toda la barra lateral móvil:
  - El apartado activo del menú móvil tiene un contraste de 2,78:1 (`faro.css:508-509` fija `#1b1608` sobre el cobalto nuevo).
  - Los controles móviles miden 40 px (`consola.css:53`), cuando la decisión D7 los fijó en 44.

### Espacio de equipo `/team`

App aparte: 8 secciones y 4 perfiles, PostgreSQL con RLS y OAuth HubSpot de lectura. **Limitado:** demo con dos empresas ficticias y PostgreSQL embebido, sin despliegue ni identidad gestionada. La auditoría automática del 19-21/11 no dio hallazgos en claro, salvo los dos de la barra móvil.

## 4. Medidas de composición y coherencia (antes)

Fuente: `tests/.tmp/mision/shots/antes/metrics.json`.

| Medida (1440 px, 19 rutas) | Valor | Sistema declarado en `DESIGN.md` |
| --- | --- | --- |
| Tamaños de letra distintos | **19** (de 7,5 a 24 px; incluye 10,5, 11,5 y 12,5) | 5 (11, 12, 13, 15-20, 20) |
| Radios de borde distintos | **9** (1, 2, 3, 4, 5, 6, 8, 999 px y 50 %) | 2-4 px y 6 px en capas |
| Alturas de botón distintas | **15** (las más usadas: 28 y 24; también 26, 32, 36, 38 y 44) | 28 px (32 en cómoda) |
| Alturas de campo | 28 y 24 | 28 |
| Pantallas con hueco > 25 % en la primera vista | Empresas 43, Oportunidades 37, Cambios 34, Exportar 46, Copia de equipo 44, Radar 66, Fecha 29 | — |
| Scroll medio | 1,24 pantallas en escritorio y **2,64 en móvil** (Inicio 5,2; Tareas 4,8; ¿Y si cae? 7,7) | — |
| Desborde horizontal | 0 en todas | — |
| Móvil (390 px) | Botones 44 px; **campos de 40 y 44 px mezclados** | 44 px |

Interpretación:

- Los huecos de Empresas, Oportunidades y Radar se deben a **pocos datos** y a componentes que se estiran. Con datos reales una parte desaparece; la composición tiene que resolver los dos casos.
- Los de Cambios, Exportar y Copia de equipo son de **composición**: formularios o paneles anchos con poco contenido.
- La dispersión de tamaños viene de la cascada de capas, no de decisiones.

## 5. Funcionalidad de extremo a extremo

| Proceso | Estado | Evidencia y límites |
| --- | --- | --- |
| Captura de HubSpot (lectura) | **Real** | `server/hubspot.ts`: paginación por cursor con guarda de bucle (l. 129-158), reintento 429/5xx con `Retry-After` limitado a 5 s (l. 56-57) y transporte de solo lectura con lista blanca (`connection.ts:20`). Leído de verdad el portal DEVELOPER_TEST 149623339 (histórico, no repetido hoy). Ningún portal de producción conectado |
| Capturas programadas | **Real** | `server/v2.ts:188`, cada 60 s, mientras el PC está encendido. Sin servicio en segundo plano del sistema |
| Copia cifrada local | **Real** | SQLite cifrada. Clave por DPAPI (usuario Windows) o clave de pruebas con `NODE_ENV=test`. Un portal por carpeta |
| Edición local y registro de cambios | **Real** | `/api/v2/changes` y deshacer el último cambio (`undo.ts`) |
| Devolución a HubSpot | **Real, sin probar en real** | `server/recovery.ts`: vista previa, decisiones, aprobación, envío, inciertos y comprobación, con conflicto a tres bandas por campo (l. 57-58, 104) y bloqueo si quedan conflictos o inciertos (l. 86). **Solo habilitada para DEVELOPER_TEST/SANDBOX** (`hubspot-remote.ts`, `verify`). En producción la vuelta es manual (exportar o lista imprimible). No hay prueba auténtica de devolución |
| Simulacro («Probar mi Plan B») | **Real** | `server/drill-worker.ts`: proceso aparte, carpeta temporal nueva, restaura la copia en otra SQLite, edita, busca y reinicia. Aislado de los datos operativos |
| Exportar copia y App independiente | **Real** | `server/exporter.ts`: paquete cifrado con contraseña y runtime portátil |
| Acceso local con contraseña y bloqueo | **Real** | `security.ts` y `password-hash.ts` (v2) |
| Comprobación de origen en peticiones | **Real** | `server/app.ts:44-48` |
| Modo contingencia | **Real (local)** | Cronometra el incidente, centra Hoy y genera el expediente. No detecta caídas de HubSpot: la activa la persona |
| Propuestas de agentes | **Limitado** | Reglas y destinos simulados |
| IA | **Limitado** | Desactivada con datos reales. Borradores con Ollama local solo en el espacio de equipo |
| Laboratorio (Radar, Fecha, Ensayar) | **Limitado** | Solo datos de prueba |
| Licencias y plan Pro | **Representado** | Sin clave pública de firma; las puertas solo están en el cliente |
| Espacio de equipo | **Limitado** | Demo; nube e identidad sin desplegar |
| Sala y cápsula de rescate | **Sin montar** | Ver 2.2 |

## 6. Arquitectura y calidad técnica

**Lo sólido**

- Separación `shared/` (lógica pura y contratos zod), `server/` (Fastify) y `src/` (React).
- Transporte de HubSpot de solo lectura por lista blanca.
- Idempotencia y resultados «inciertos» que no se repiten solos.
- Guardado condicional por revisión y simulacro en proceso aislado.
- 361 archivos de prueba unitaria y 110 E2E.

**Deuda que frena el producto**

1. **CSS en 11 capas globales** importadas en cascada (`src/main.tsx:4-14`), con prefijos `html body` para ganar especificidad. Cada rediseño añadió una capa en lugar de sustituir. Es la causa directa de la incoherencia medida en el §4.
2. **Componentes gigantes:** `App.tsx` 48 KB, `ContinuityHome.tsx` 40 KB, `RecordsPage.tsx` 39 KB y `CommitmentRadar.tsx` 38 KB.
3. **Pruebas que fijan textos y huellas SHA-256** de archivos de interfaz: cualquier mejora de copia o de estructura rompe pruebas que no hablan de comportamiento.
4. **Proceso de coordinación saturado:** 353 encargos «en revisión» en el tablón, `CONTEXTO-PROYECTO.md` de 831 KB e informes por encargo. El historial pesa más que el producto.
5. **DPAPI vía PowerShell** (`server/crypto.ts`): Defender lo marca como «Suspicious DPAPI Activity» en cada arranque y en cada carpeta nueva. **Bloqueante para vender a empresas con EDR.**
6. **Pruebas seguras de hoy:** 292 de 298 archivos correctos.
   - **`commitments.test.ts` (resuelto el mismo día): no era una regresión de autorización.** Las rutas revalidan la sesión antes y después de leer el contexto (`server/commitments.ts:49-51`). La prueba caducaba la sesión en la segunda lectura de `store.get('sessionId')`, pero desde el cambio de rendimiento de la búsqueda esa identidad se lee con una consulta propia y en caché, y la caducidad nunca se disparaba. La prueba se ha reanclado a esa lectura. Comprobado con una mutación: si la autorización capturada no se revalida, las cuatro fronteras fallan.
   - Los demás fallos son anteriores:
     - `independent-continuity-lab` y `task-intent-consumer-independent-322` están en `tools/ci/known-failures.json`.
     - `auth-parent` e `independent-interface-contexts` son el G6 documentado.
     - `task-focus-outcomes` es una **huella SHA-256** de `src/task-save-outcomes.css`, cambiado por otro agente: un ejemplo del punto 3.

## 7. Preparación comercial (resumen; detalle en `04-comercializacion.md`)

| Requisito | Estado |
| --- | --- |
| Instalación | `ABRIR PLAN B.cmd` + Node empaquetado. Sin instalador firmado ni actualización automática |
| Conexión HubSpot | App privada con token y OAuth en el servicio de equipo. Producción solo lectura |
| Multiempresa | Una carpeta por portal en local. RLS en el servicio de equipo (demo) |
| Usuarios y permisos | Un operador en local. Roles en `/team` (demo) |
| Cifrado y credenciales | Copia cifrada. DPAPI problemática en equipos gestionados |
| Retención y borrado | Sin política declarada en la App |
| Diagnóstico | «Descargar diagnóstico sin fichas ni claves». Sin telemetría |
| Licencias | Representado (sin clave) |
| Documentación | Abundante pero dispersa (más de 40 `.md` en la raíz) |
| Evidencia comercial | Ningún cliente, piloto ni devolución auténtica |
