# Misión maestra · Registro de colaboración entre agentes

Registro breve de decisiones que se pueden comprobar. Cada entrada lleva fecha (Europe/Madrid), autor y cómo comprobarla. **No se anotan conversaciones ni acuerdos que no hayan ocurrido.**

## Quién trabaja en Plan B (comprobado el 21/11/2026)

| Agente | Dónde | Evidencia | Canal real |
| --- | --- | --- | --- |
| Claude, esta sesión | Ordenador con `D:\AI\Plan-B-CRM-v2.1` | Este registro y `docs/mision/` | Archivos del repositorio y Git |
| GitHub Copilot | Otro ordenador, por GitHub | Commits `a0f2fc5`, `56c1c9c`, `d19b6fa` y `59e7a47` (20/11) con «Co-authored-by: Copilot» | Git (`origin`, rama `planb-v0.3-local`) |
| Claude, sesión «planb-rendimiento» | Este ordenador | Chat del tablón del 21/11 y archivos sin commit en `tools/ci/`, `tools/team-audit/` y `tests/` | Chat del tablón |
| Codex | — | Última actividad en el tablón: 19/11 10:56 UTC | **Fuera de esta misión por orden de la usuaria (21/11)** |

No hay comunicación directa en tiempo real con el agente del otro ordenador. La coordinación se hace con este archivo, con los documentos `docs/mision/0*.md` y con commits por tema.

## Decisiones

| Fecha | Autor | Decisión | Cómo comprobarla |
| --- | --- | --- | --- |
| 21/11/2026 | Usuaria | «No quiero que coordines nada con Codex… olvídate de Codex». Esta misión no usa el tablón de Codex (`board.mjs`) | Instrucción en el chat de la sesión |
| 21/11/2026 | Claude | Auditoría con ensayo aislado propio (4571/4572, datos ficticios nuevos, `NODE_ENV=test`, red exterior bloqueada). No se tocaron `data/`, `planb-*` ni el piloto | `.claude/launch.json` (entradas `mision-api` y `mision-ui`); `tests/.tmp/mision/` |
| 21/11/2026 | Claude | Propuesta B0: conservar «Consola de operaciones» como identidad única y retirar capas, sin una sexta identidad | `03-superplan-b-experiencia.md` §B0. **Pendiente de confirmación de la usuaria** |
| 21/11/2026 | Claude | Reparto propuesto: Claude lleva interfaz, sistema visual y composición; el agente del otro ordenador, servidor, datos y pruebas de servidor | `05-hoja-de-ruta.md` §2. **Pendiente de que el otro agente lo lea y lo acepte o lo discuta aquí** |
| 21/11/2026 | Claude | Fase 1, P0 de interfaz (contraste del menú móvil, controles de 44 px y barra sin alarma roja permanente): los hace Claude en este ordenador | Ver la entrada siguiente |
| 21/11/2026 | Claude | **Tanda P0 cerrada.** (1) Token `--signal-ink` en `consola.css` (blanco en claro y `#14171c` en oscuro), usado por el apartado activo del menú móvil en `faro.css:508-509`: 6,48:1 y 9,76:1, antes 2,78:1. (2) `--control-h` móvil a 44 px en `consola.css`: campos y botones a 44. (3) `TopBar.tsx` y `faro.css`: «¿HubSpot caído?» neutro, mismo efecto y nombre accesible «HubSpot no responde: activar el modo contingencia». (4) `tests/commitments.test.ts` reanclado: no era una regresión. (5) Línea base de colores fijos de `faro.css` 126 → 124 | `design-tokens` (contraste nuevo), `color-guard`, `css-unused`, `design-k-block`, `record-sheet`, `ui-copy` y `commitments` en verde; `tsc` sin errores; `tests/.tmp/mision/p0-check.mts` y capturas `shots/p0-*` |

| 21/11/2026 | Usuaria | «¿Quieres empezar a hacer el plan?»: arranca la ejecución sobre la identidad «Consola» (sin sexta identidad) | Instrucción en el chat de la sesión |
| 21/11/2026 | Claude | **Inicio «puesto de mando» (B4.1) y primera parte de A1.** Inicio pasa a tres zonas: siguiente paso de trabajo, columna de trabajo (prioridades con recuento, oportunidades en riesgo y clientes que se enfrían) y riel de la copia con el índice de preparación nombrado y un botón que hace el siguiente paso (p. ej. abre «Protege tu copia»). Salen de Inicio el parte de la mañana, la semana en una línea, las tres tarjetas de cifras, el sello, la tira de primeros pasos y la tarjeta del Radar (el Radar se sigue leyendo para el aviso del menú). El objetivo del mes y la previsión pasan a Oportunidades › Analítica (`PipelineCard variant="plan"`). CSS muerto podado: 154 selectores, 14,5 KB; colores fijos 124 → 107 (`faro.css`) y 6 → 3 (`operaciones-claras.css`) | Archivos: `src/HomeOverview.tsx`, `src/app-shell/continuity-insights.ts`, `src/app-shell/PipelineCard.tsx`, `src/app-shell/RecordsPage.tsx`, `src/consola.css`, `src/faro.css`, `src/operaciones-claras.css` y las pruebas `continuity-insights`, `record-sheet` (K8: un solo botón relleno) y `color-guard-baseline.json`. Guardias en verde, `tsc` sin errores; medidas en `tests/.tmp/mision/shots/inicio-pm/` |
| 21/11/2026 | Claude | **Continuidad › Estado (B4.2, primera parte).** El índice de preparación lleva los cinco pasos con su acción («Elegir contraseña», «Conectar HubSpot», «Crear copia cifrada», confirmar copia) y el siguiente paso como única acción principal. Sale la lista lateral «Preparación de tu Plan B». «Activar modo contingencia» y «Continuar trabajando» pasan a secundarios (el segundo vuelve a principal si no hay nada pendiente). Parte, informe del mes y marca van en el menú «Informes». El sello y «¿Cuánto costaría parar sin copia?» pasan a «Evidencia e impacto». «Si HubSpot cae ahora» deja de repetir la prueba y la copia externa (`READINESS_OUTAGE_LINES`) | `src/ContinuityHome.tsx`, `src/app-shell/continuity-insights.ts`, `src/consola.css` y CSS podado (19 selectores); `continuity-home-hub`, `independent-copy-inspection-api` (16/16) y guardias en verde; `tsc` sin errores; medidas en `tests/.tmp/mision/shots/continuidad-b42/` |
| 21/11/2026 | Usuaria | «Si ves que se va a acabar el consumo, haz commits para que desde el otro ordenador haga pull y traiga todos los cambios». Autoriza commit y push de todo, incluido el trabajo presentado sin commit de «planb-rendimiento» (en commit aparte) | Instrucción en el chat de la sesión |
| 21/11/2026 | Claude | Piezas que quedan sin montar tras el cambio (para A0-L, no borradas): `MorningBrief.tsx`, `FirstRunStrip` (en `FirstRun.tsx`) y `HomeSeal` (en `ContinuitySeal.tsx`) | `grep` de usos en `src/` |

## Ejecución del relevo · GitHub Copilot

| Fecha | Tarea | Estado y alcance anotado antes de editar interfaz | Comprobación |
| --- | --- | --- | --- |
| 21/11/2026, Europe/Madrid | Revisión cruzada | Publicada en `b95b5a1`; tabla por propuesta y prioridades contrastadas | `npx.cmd tsc --noEmit -p tsconfig.json` y 9/9 archivos seguros focales de Cambios y guardias. Se usa el lanzador Windows `.cmd`, sin cambiar la política de ejecución de PowerShell |
| 21/11/2026, Europe/Madrid | B4.3 Cambios | Hecho y comprobado sin navegador. Alcance registrado antes de editar: `src/ChangesView.tsx` y pruebas de integridad; se quitó Propuestas, el recuento duplicado de cabecera y el asistente sin pendientes. Vacío de una línea solo con lectura válida; historial, exportaciones con contenido, planes guardados y último justificante manual conservados | Antes/después, mismo arnés y respuesta vacía: asistente 1 → 0, línea de vacío 0 → 1, botones de exportación 2 → 0; historial ya marcado sin plan: asistente 1 → 0. Las tres regresiones fallaron antes y pasan después. Estados review/approved/applying/complete/partial: ≤ 1 botón relleno. `npx.cmd tsc --noEmit -p tsconfig.json`; 9/9 archivos con `node tools/safe-tests.mjs recovery-integrity-ui independent-return-integrity-ui return-steps change-history return-explain-ui css-unused color-guard design-tokens record-sheet`. Poda normal y dedupe: 0 reglas, 0 B; detector mecánico sin hallazgos. Sin medidas geométricas ni aceptación visual |

## Pendiente para el agente del otro ordenador

Al hacer `git pull`, leer `docs/mision/00-LEEME.md` y, en este orden:

1. **Revisar críticamente** los Superplanes A y B y la tabla de evaluación de `05-hoja-de-ruta.md` §1. La misión exige revisión cruzada. Anotar aquí, por propuesta, si se está de acuerdo, qué cambiaría y por qué.
2. **Fase 1:** A0-L (limpieza de código sin montar y `recovery-rehearsal.ts` fuera del instalable) y decidir qué hacer con la huella SHA-256 de `src/task-save-outcomes.css` en `tests/task-focus-outcomes.test.ts`: sustituirla por una aserción de comportamiento.
3. **Antes de tocar** archivos del ámbito de interfaz (`src/consola.css`, `src/faro.css`, `src/ui/**`, `TopBar.tsx`, `Sidebar.tsx`, `navigation.ts`, `HomeOverview.tsx`, `ContinuityHome.tsx`), anotar aquí la tarea para no editar a la vez.

## Revisión cruzada · GitHub Copilot · 21/11/2026 (Europe/Madrid)

Leídos íntegros `00`, `02`, `03`, `04` y `05`, y la auditoría `01`. Contraste documental con el código de Cambios y los contratos de integridad; no es una nueva auditoría de todas las funciones ni una aceptación visual. La orden actual de la usuaria sustituye el reparto anterior: Copilot sigue el relevo, registra cada tarea de interfaz antes de editar y publica por tema. Sin Codex ni tablón.

| Propuesta | De acuerdo | Cambios propuestos | Motivo |
| --- | --- | --- | --- |
| A0 Tres preguntas | Sí | Mantener Copia, Prueba y Vuelta como modelo mental; no obligar a que todo sean pestañas | Ordena la promesa sin añadir navegación artificial |
| A0-L Código sin montar | Sí, con inventario | Retirar solo piezas sin consumidores; excluir el ensayo sintético del paquete, no borrar pruebas útiles | «Sin montar» no equivale a «sin uso»; un módulo de servidor puede tener consumidores indirectos |
| A1 Índice de preparación | Sí, con cambios | Unificar primero las fuentes; distinguir desconocido, caducado y fallido. Un simulacro debe probar la copia activa o una antecesora compatible, no cualquier copia posterior. Conservar evidencia de la exportación como declaración, no como ubicación comprobada | Evita dar preparación por una prueba ajena o por una afirmación no verificable. La conciliación puede requerir cambios de servidor: complejidad media, no baja |
| A1 Sello mensual | Parcial | No afirmar «todos los días 5/5» sin instantáneas diarias persistidas; mostrar cobertura del periodo y días sin evidencia | El estado actual no demuestra cómo estuvo el mes entero |
| A2 Cuarentena | Sí | No activar automáticamente si falta la conciliación; umbral por objeto y tratamiento explícito de primera captura, cero registros y pérdidas legítimas. Confirmación ligada a la candidata exacta | Un total agregado puede ocultar la desaparición de un objeto; confirmar una candidata no debe aprobar otra |
| A3 Simulacro programado | Sí | Aclarar «con la aplicación abierta», no solo PC encendido; persistir intento y resultado, evitar solapes y decidir recuperación tras interrupción. Escenario de PC perdido solo con paquete y contraseña disponibles | El temporizador del proceso no es un servicio de Windows; la idempotencia debe sobrevivir al reinicio |
| A4 Paquete de vuelta | Sí, con cambios | Elevarlo a P1 comercial antes de prometer la vuelta. Congelar revisión, portal, IDs y decisiones; proteger CSV frente a fórmulas y probar valores vacíos, propiedades de solo lectura y relaciones. No marcar devuelto hasta releer y comprobar | Exportar no equivale a importar; una importación manual conserva riesgos de destino, automatizaciones y mapeo. Complejidad y riesgo al menos medios |
| A5 Trabajo sobre la copia | Sí | Compartir la regla de vencido, pero conservar etiquetas de ámbito («en este periodo» frente a total). El filtro urgente en contingencia debe poder quitarse | Una misma definición no obliga a cifras iguales sobre subconjuntos distintos ni debe ocultar trabajo necesario |
| A6 Licencias | Sí, con límites | Elevar riesgo a 2; decidir puertas y periodo de gracia antes de aplicarlas. Nunca bloquear lectura, exportación, acceso a datos ya creados ni la salida de una contingencia. No generar claves hasta decidir custodia | Cobrar no puede inutilizar el plan de continuidad. La hora local y la migración de licencias también requieren pruebas |
| A7 Clave sin DPAPI | Favorable a estudiar (b), no aprobado | Decisión de la usuaria antes de implementar. Diseñar envoltura cifrada de la clave, parámetros/versionado de scrypt, migración atómica con vuelta atrás y recuperación por exportación. No prometer cero alertas | Cambia apertura, recuperación y custodia; quitar PowerShell elimina un disparador conocido, no garantiza la reacción de todo EDR |
| A8 Prueba de sesión | Sí, ya resuelta | Mantener la regresión causal; no reabrir el 401/200 como fallo vigente | El relevo distingue correctamente un anclaje obsoleto de una regresión |
| A8 Vencidos | Sí | Día civil de Europe/Madrid para fechas sin hora; tarea no completada y oportunidad abierta, con pruebas de medianoche y cambio de hora | Evita diferencias entre reloj UTC, navegador y vistas |
| A8 Preparación compartida | Sí | Un contrato puro con reloj inyectado; no introducir otro modelo paralelo mientras se migra | Reducir discrepancias importa más que mover un archivo |
| A8 Componentes de 25 KB | Parcial | Tratar 25 KB como señal, no criterio de aceptación; extraer por responsabilidad con cobertura previa | Dividir por tamaño puede multiplicar indirecciones sin reducir riesgo |
| A8 Huellas de interfaz | Sí | Sustituir solo las huellas del área tocada por comportamiento, antes de cambiarla; conservar las que verifican artefactos inmutables | No todas las huellas son deuda y actualizar el hash a ciegas no prueba nada |
| A8 Rendimiento | Sí | Presupuesto con datos, hardware y métricas repetibles; ejecutar el banco pesado en CI/equipo autorizado, no aquí | 10.000 registros sin escenario ni presupuesto no es un criterio verificable |
| A8 Copia antes de migrar | Sí | Probar restauración y disco lleno, fijar retención y no duplicar datos fuera del cifrado | Crear un archivo no acredita una copia recuperable |
| A9 Exclusiones 1.0 | Sí | Propuestas, IA, conectores nuevos y nube fuera del flujo comercial. El Laboratorio se conserva solo con datos de prueba y rotulado; no moverlo a Hoy | Evita prometer funciones simuladas y dispersar el foco |
| A9 Coste de caída | Sí, con matiz | No ampliar su presencia operativa. La sección plegada actual es un avance, no el traslado final a venta | El objetivo es retirar ruido, no añadir otra cifra al trabajo diario |
| A10-1 Parte de incidente | Sí | Unirlo con la vuelta, separando enviado, importado, comprobado, incierto y pendiente | Un informe no debe convertir aceptación de una acción en resultado verificado |
| A10-2 Cobertura explícita | Sí | Subir a P1 y derivar incluidos/excluidos de la especificación y captura, no de texto fijo | Es necesaria para interpretar la integridad y vender sin falsa cobertura |
| A10-3 Modo agencia | Sí, después | No crear nuevas carpetas ni selector hasta definir aislamiento, claves y permisos | Un selector local no sustituye un modelo multiempresa seguro |
| B0 Identidad única | Sí | Conservar Consola y retirar capas gradualmente; no introducir otra identidad ni cambiar el orden de carga sin prueba | La cascada acumulada es la deuda, no una falta de estética nueva |
| B1 C1 Anchura y hueco | Sí, con matiz | Anchura máxima por contenido; usar hueco como indicador, no obligación de rellenar el lienzo | Una pantalla vacía de trabajo no mejora por estirar o añadir bloques |
| B1 C2 Acción principal | Sí | Como máximo un botón relleno por vista, también si está deshabilitado. Cero es válido en consulta o vacío; diálogos se comprueban aparte | Una acción innecesaria no se añade para llegar a uno |
| B1 C3 Cifra grande | Sí | Una cifra dominante como máximo; no agrandar un cero ni una métrica sin acción | La jerarquía debe responder a lo urgente, no a decoración |
| B1 C4 Ceros | Sí, con excepción | Atenuar, no esconder el cero que confirma «sin pendientes» o completa un total necesario | Quitar ceros indiscriminadamente puede ocultar un estado tranquilizador o romper la comparación |
| B1 C5 Vacíos | Sí | Una línea sin asistente inútil; carga, error y plan inválido nunca se presentan como «sin cambios». Mantener accesible un plan en curso o justificante existente | La reducción visual no puede esconder un fallo ni evidencia |
| B1 C6 Acciones próximas | Sí | Mantener accesibles las globales en Continuidad/paleta antes de quitarlas de la lista | Reubicar no debe eliminar una capacidad |
| B1 C7 Dato único | Sí | Mostrar cada dato una vez por vista; un resumen enlazado desde otra ruta no es duplicación prohibida | Evita repetir paneles sin impedir orientación entre pantallas |
| B1 C8 Profundidad | Sí | Contar bloques funcionales visibles y preservar alertas críticas aunque superen seis | Un límite geométrico no debe ocultar riesgos |
| B1 C9 Móvil | Sí | Misma copia, alto, filtros y paginación; registrar ambos estados y no reducir legibilidad o controles para llegar a tres pantallas | Medir scroll sin condiciones comparables permite falsos avances |
| B1 C10 Desborde | Sí | Añadir foco/teclado y zoom; tablas anchas con desplazamiento local identificado, no desborde del documento | Cero desborde no basta si el contenido queda cortado |
| B2.1 Tokens | Sí, con matiz | Escala única; documentar excepciones semánticas y tamaño mínimo legible. 44 px táctiles aunque el control visual sea compacto | La coherencia no justifica texto ilegible ni objetivos pequeños |
| B2.2 Biblioteca | Parcial | Reutilizar piezas existentes; extraer Bay, Strip o DataTable solo cuando eliminen duplicación real | Crear toda una biblioteca antes de simplificar pantallas retrasa valor y añade API innecesaria |
| B2.3 Retirada de capas | Sí | Por pantalla, preservando cascada y estados; medir CSS inicial como bytes generados, no solo fuentes. Renombrar al final si aporta claridad | El orden de hojas afecta toda la app; el objetivo de 200 KB necesita evidencia de build |
| B2.4 Profundidad y movimiento | Sí | Mantener foco y contraste; nada de movimiento nuevo para estas tareas | Las transiciones no arreglan composición ni deben dificultar el uso bajo presión |
| B3.1 Menú | Sí | Propuestas fuera; servicio de equipo según configuración efectiva, no solo tipo de copia; ruta antigua de Preparación compatible | Una entrada oculta no debe romper enlaces guardados ni inventar disponibilidad |
| B3.2 Barra | Sí, hecho | Mantener nombre accesible y efecto; señal solo con contingencia activa o error real | Una orden neutra no debe parecer una alarma permanente |
| B4.1 Inicio «puesto de mando» | Sí, avance válido | No repetir vencidos/preparación en línea, bloque y riel. Mantener el avance como parcial: 1366 y móvil aún superan metas | Las medidas del relevo no permiten declarar cerrado B7 |
| B4.2 Continuidad Copia · Prueba · Vuelta | Sí, parcial | Mantener un índice y una acción; decidir bahías o pestañas por tarea sin mezclar ambos. Separar evidencia de simulación y cobertura no copiada | Los informes agrupados son avance; siguen pendientes las tres áreas y la fuente única de A1 |
| B4.3 Cambios | Sí, con salvaguarda | Vacío compacto solo tras lectura válida; quitar Propuestas. Asistente con cambios pendientes o plan guardado que necesite seguimiento; conservar historial y justificantes aunque no haya nada nuevo | Evita asistentes deshabilitados sin ocultar planes parciales, inválidos o ya enviados |
| B4.4 Hoy y Agenda | Sí | Una acción principal en Hoy; «Despachar» secundario junto a Vencidas. Panel del día seleccionado y un enlace al total vencido, con ámbito explícito | Corrige la contradicción sin mezclar carga del periodo con trabajo pendiente global |
| B4.5 Listas | Sí | Proporciones según columnas realmente visibles; vistas vacías atenuadas conservando orden estable entre renders; mantener datos esenciales accesibles en móvil | Un máximo rígido no sirve para muchas columnas ni debe ocultar correo/fecha necesarios |
| B4.6 Ficha | Sí, condicionado | No cerrarla sin ensayo denso en el otro equipo; no cambiar el guardado ni la recuperación de foco al plegar | No hay evidencia actual con 1.000+ registros |
| B4.7 Exportar | Sí | Motivo de bloqueo visible y asociado al botón; no debilitar contraseña, confirmaciones ni avisos sobre datos | Una columna simplifica sin modificar las garantías de exportación |
| B4.8 Ajustes | Sí | Integraciones según capacidades reales; Configurar Plan B conserva enlaces anteriores y la licencia espera A6 | Cambiar navegación no convierte en real un servicio o licencia |
| B5 Estados | Sí | Reutilizar carga/error existentes y distinguir «no leído» de vacío; simulación rotulada también en resultados y exportaciones | Evita éxito aparente y conclusiones falsas |
| B6 Accesibilidad | Sí | P0 ya hecho no se vuelve a contar. Añadir comprobación de foco, teclado y zoom; auditoría visual solo en el equipo autorizado | Tokens AA y controles de 44 px no prueban por sí solos accesibilidad completa |
| B7 Cierre | Sí, con condiciones | Medir mismos datos, rutas, tamaños y temas; distinguir métricas estructurales de geometría real. No aprobar B7 aquí sin capturas. No ejecutar auditorías de navegador en este ordenador | Las restricciones actuales impiden esa validación; una prueba estática no la sustituye |

### Contraste de prioridades de `05` §1

- Se mantiene el orden de ejecución que acaba de fijar la usuaria en el relevo, empezando por B4.3.
- A1: esfuerzo 2 y riesgo 2 por caducidades, conciliación y migración de consumidores; no es solo una fórmula.
- A4: prioridad comercial P1, riesgo 2 como mínimo; la prueba en sandbox requiere autorización específica y no se ejecuta en este equipo.
- A6: riesgo 2 por puertas, caducidad y acceso durante contingencia; la custodia sigue pendiente de la usuaria.
- A7: esfuerzo/riesgo al menos 2; no se implementa ni se generan/migran claves sin decisión.
- A10-2: P1 por honestidad de cobertura, antes de cualquier promesa de preparación completa.
- B2 se hace incremental, no como prerrequisito de toda B4.3-B4.8. A0-L no se da por esfuerzo 1 hasta inventariar dependencias.
- Esta revisión no ejecuta las tareas propuestas ni certifica una nueva preparación comercial.
