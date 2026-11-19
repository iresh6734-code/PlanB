# Parte del tablero de coordinación

Generado por `node tools/board-audit.mjs` el 2026-11-19. Solo lee `coordination/board.json` y git; **no cambia el tablero**, que es de los agentes.

Columnas: archivos de la tarea que ya están en la rama / archivos declarados, y qué conviene hacer.

## Resumen

| Estado | Claude | Codex | Otros | Total |
|---|---|---|---|---|
| En curso | 17 | 3 | 0 | 20 |
| Bloqueadas | 6 | 6 | 0 | 12 |
| Listas para empezar | 10 | 3 | 0 | 13 |
| En revisión | 18 | 333 | 0 | 351 |

| Qué conviene hacer | Tareas |
|---|---|
| Trabajo en la rama: aceptar tras revisión visual en casa | 349 |
| Archivos en la rama: confirmar si terminó y pasar a revisión | 18 |
| Bloqueada: decidir si se desbloquea o se cancela | 12 |
| Sin empezar: relanzar solo si sigue en el plan | 9 |
| Ya existe en la rama: comprobar si sigue haciendo falta | 4 |
| Interrumpida: relanzar o cancelar | 2 |
| Hay cambios sin commit en sus archivos: revisar antes de nada | 1 |
| Entrega parcial: revisar qué falta | 1 |

## En curso (20)

| Tarea | Agente | Título | En la rama | Último movimiento | Qué hacer |
|---|---|---|---|---|---|
| CLAUDE-A4-CLIENT-STRATEGY | claude | Claude A · A4 paquete 2: cliente de intentos y estrategia de guardado… | 5/5 | — | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-CI-STEPS | claude | E1 · CI local con pasos opcionales (--perf, --mobile, --e2e) y un inf… | 4/4 | 2026-11-19 · revise | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-CSV-IMPORT | claude | Importar registros desde CSV con vista previa, mapeo de columnas y ma… | 6/6 | 2026-11-19 · revise | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-FABLE-OPERATIONAL-CORE-1 | claude | Fable · Gemelo operativo, primera puerta: contrato propuesto, simulac… | 10/10 | — | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-FABLE-OPERATIONAL-CORE-2 | claude | Fable · Gemelo operativo, segunda puerta: empresa completa, escenario… | 12/12 | — | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-FABLE-OPERATIONAL-MOUNT | claude | Fable · «Ensayar mi semana» listo para montar: servicio y rutas, clie… | 11/11 | — | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-FABLE-OPERATIONAL-SERVICES | claude | Fable · Gemelo operativo, cuarta puerta: segundo caso de negocio (ser… | 3/3 | — | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-FABLE-OPERATIONAL-TODAY-ENTRY | claude | Fable · Entrada a «Ensayar mi semana» desde Hoy | 2/3 | — | Interrumpida: relanzar o cancelar |
| CLAUDE-FABLE-UI-GRAFITO | codex | Rediseño integral «Grafito» de la App local (orden directa del usuari… | 6/7 | — | Interrumpida: relanzar o cancelar |
| CLAUDE-MCP-001 | claude | Registrar Codex como servidor MCP del proyecto | 1/1 | — | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-MOBILE-D5 | claude | Móvil: la barra superior cabe en 390 y 320 px y la página no se despl… | 2/2 | 2026-11-19 · revise | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-OPUS-DATE-CHECK-CORE | claude | Opus · Comprobar una fecha, paquete 1: inventario con cantidades y re… | 8/8 | — | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-OPUS-DATE-CHECK-FLOW | claude | Opus · Comprobar una fecha, paquete 2: rutas con registro local y con… | 11/11 | — | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-OPUS-DATE-CHECK-REVIEW | claude | Opus · Comprobar una fecha, paquete 3: revisar una decisión frente al… | 13/13 | — | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-OPUS-UI-OPERACIONES-CLARAS | codex | Opus · Sistema visual «Operaciones claras»: navegación agrupada, Inic… | 4/4 | — | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-RADAR-ENTRY-MOUNT-READY | claude | Claude A · Radar listo para montar: entrada con capacidad y activació… | 7/7 | — | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-TEAM-AUDIT | claude | Auditoría de accesibilidad y móvil del espacio de equipo (/team) en e… | 6/6 | 2026-11-19 · revise | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-TEAM-DEMO-NAMES | claude | Datos de demostración del espacio de equipo con la voz de la App («de… | 2/2 | 2026-11-19 · revise | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CLAUDE-UI-NAV-LAB | claude | Menú en cinco lugares y apartado Laboratorio (mejoras C1 y D1 del inf… | 3/3 | 2026-11-19 · revise | Archivos en la rama: confirmar si terminó y pasar a revisión |
| CODEX-A4-SERVER-MOUNT-318 | codex | Montaje A4 en servidor principal y paquete portatil | 4/4 | — | Archivos en la rama: confirmar si terminó y pasar a revisión |

## Bloqueadas (12)

| Tarea | Agente | Título | En la rama | Último movimiento | Qué hacer |
|---|---|---|---|---|---|
| CLAUDE-A4-QA-CORTES | claude | Claude A · QA de A4: guion congelado de los cuatro cortes con recuent… | 2/2 | — | Bloqueada: decidir si se desbloquea o se cancela Nota: Sustituida por CLAUDE-A4-QA-CORTES-V2: la dependencia de la propuesta HTTP (aun en review… |
| CLAUDE-CTX-022 | claude | Compactar CONTEXTO-PROYECTO.md conservando el historial íntegro en un… | 2/2 | — | Bloqueada: decidir si se desbloquea o se cancela Nota: Retirada por Codex a petición del usuario: duplicada y nunca reservada; sustituida por CO… |
| CLAUDE-HS-READ-CLI-172 | claude | Script de comprobación real de lectura de HubSpot (portal de ensayo):… | 5/5 | — | Bloqueada: decidir si se desbloquea o se cancela Nota: Sustituida por CLAUDE-HS-READ-CLI-173: declaré por error CLAUDE-HS-READ-160 (en revisión)… |
| CLAUDE-SEARCH-PERF | claude | Búsqueda global rápida con 10.000 registros sin cambiar resultados ni… | 3/4 | 2026-11-18 · block | Bloqueada: decidir si se desbloquea o se cancela Nota: Sustituido por CLAUDE-SEARCH-PERF-R: server/workspace-search.ts está reservado por CODEX-… |
| CLAUDE-TEAM-AUDIT-R | claude | Auditoría de /team, segunda ronda: modo oscuro y ventanas | 6/7 | 2026-11-19 · block | Bloqueada: decidir si se desbloquea o se cancela Nota: En pausa por decisión de la usuaria (19/11): en este equipo no se lanzan servidores de pr… |
| CLAUDE-UX-037 | claude | Rediseño integral del piloto: sistema de diseño y pantallas | 21/21 | — | Bloqueada: decidir si se desbloquea o se cancela Nota: Sustituido por CLAUDE-UX-038: el alcance incluía src/customer-combobox.css, reservado por… |
| CODEX-APP-REOPEN-2026-11-10 | codex | Reabrir la App ficticia publicada en 4601 | 1/1 | — | Bloqueada: decidir si se desbloquea o se cancela Nota: Registro sustituido: se declaro incorrectamente una puerta de aceptacion299 para una reap… |
| CODEX-HOY-JORNADA-ADAPTER-REVIEW | codex | Hoy · Revisión del adaptador de Jornada | 1/1 | — | Bloqueada: decidir si se desbloquea o se cancela Nota: Revisión duplicada detectada por claim. El dictamen pertenece a CODEX-HOY-DAY-ADAPTER-REV… |
| CODEX-HOY-REVISED-TEST-CONTRACT | codex | Hoy · Actualizar pruebas históricas al guardado revisado | 3/4 | — | Bloqueada: decidir si se desbloquea o se cancela Nota: Claim rechazado por reserva142vigente sobre independent-task-mount.spec.ts. No se editó n… |
| CODEX-INTEGRATIONS-QA-COPY-220 | codex | Actualizar la aserción independiente de estado guardado de Integracio… | 1/1 | — | Bloqueada: decidir si se desbloquea o se cancela Nota: Sin reserva ni entrega: el archivo pertenece a122. Una edición de una línea se revirtió i… |
| CODEX-OPERATIONS-RELAY-R4-REVIEW | codex | Operaciones · Revisión independiente de API Relevo216R4 | 0/1 | — | Bloqueada: decidir si se desbloquea o se cancela Nota: Revisión216 ya iniciada por Codex par bajo267. Mis rutas permanecen intactas y se liberar… |
| CODEX-PREVIEW-RECOVER-203 | codex | Restablecer la copia local de ensayo con artefactos aceptados | 0/1 | — | Bloqueada: decidir si se desbloquea o se cancela Nota: Sustituida por la copia202 ya iniciada por el otro Codex en4596. Sin servidor203, sin rut… |

## Listas para empezar (13)

| Tarea | Agente | Título | En la rama | Último movimiento | Qué hacer |
|---|---|---|---|---|---|
| CLAUDE-005 | claude | Preparar componentes y contratos para integrar el diseño | 2/2 | — | Ya existe en la rama: comprobar si sigue haciendo falta |
| CLAUDE-HS-096 | claude | Auditoría independiente de búsqueda acotada de actividades HS029 | 0/3 | — | Sin empezar: relanzar solo si sigue en el plan |
| CLAUDE-LAB-036 | claude | Demo visual aislada del laboratorio de caídas | 7/7 | — | Ya existe en la rama: comprobar si sigue haciendo falta |
| CLAUDE-QA-102 | claude | Auditoría independiente del adaptador de evidencia persistida101 | 0/3 | — | Sin empezar: relanzar solo si sigue en el plan |
| CLAUDE-QA-112 | claude | Auditoría independiente del nuevo corte de persistencia, incertidumbr… | 0/3 | — | Sin empezar: relanzar solo si sigue en el plan |
| CLAUDE-SOURCE-HISTORY-MOUNT-QA | claude | Claude B · QA del Historial de lecturas montado en Integraciones (App… | 0/3 | — | Sin empezar: relanzar solo si sigue en el plan |
| CLAUDE-SOURCE-REGISTRY | claude | Claude B: registro persistente de fuentes para Integraciones | 0/6 | — | Sin empezar: relanzar solo si sigue en el plan |
| CLAUDE-TASK-PINS-220 | claude | Actualizar la huella de TaskSaveOutcomes.tsx en la prueba de U1 tras … | 1/2 | — | Sin empezar: relanzar solo si sigue en el plan |
| CLAUDE-UI-NAV-LAB-HOST | claude | Montaje del menú de cinco lugares y del Laboratorio en la App (archiv… | 7/7 | — | Ya existe en la rama: comprobar si sigue haciendo falta |
| CLAUDE-UNDO-LAST-STORE | claude | Deshacer R2: identidad del cambio y comprobación atómica en el almacé… | 1/2 | — | Sin empezar: relanzar solo si sigue en el plan |
| CODEX-001 | codex | Desarrollar la conexión personal de HubSpot | 3/3 | — | Ya existe en la rama: comprobar si sigue haciendo falta |
| CODEX-AUTH-PARENT-072 | codex | Esperar carga confirmada antes de cerrar Protection en App | 3/4 | — | Sin empezar: relanzar solo si sigue en el plan |
| CODEX-COMMITMENT-RADAR-MOUNT | codex | Radar · Montar la primera demo en Hoy y main | 2/4 | — | Sin empezar: relanzar solo si sigue en el plan |

## En revisión (351)

| Tarea | Agente | Título | En la rama | Último movimiento | Qué hacer |
|---|---|---|---|---|---|
| CLAUDE-003 | claude | Construir un prototipo interactivo de trabajo comercial | 4/4 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-A4-CONSUMER-PLAN | claude | Claude A · Plan de adaptación del gestor y la estrategia al UUID esta… | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-A4-CONTRATO-HTTP-PROPUESTA | claude | Claude A · Propuesta de contrato HTTP, archivos y cuatro cortes para … | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-A4-MESA-CONTRATO | claude | Claude A · Paquete A4 (mesa de decisiones y relevo): contrato y guion… | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-API-INVENTORY | claude | Inventario de la API generado desde los servidores reales (main, runt… | 8/8 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-ARCH-007 | claude | Sonnet 5.5 visible: contrato conceptual de captura CRM robusta | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-E2E-ADAPT | claude | Pruebas de navegador al día con el menú de cinco lugares y los textos… | 3/3 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-E2E-MENU-HELPER | claude | Ayudante de navegación por el menú de cinco lugares para las pruebas … | 1/1 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-ESTADO-G1 | claude | ESTADO.md: una página con lo que hay de verdad (mejora G1 del informe) | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-FABLE-OPERATIONAL-HOST-MOUNT | claude | Fable · Montaje de «Ensayar mi semana» en la App por orden expresa de… | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-HOY-PROBES-A3-CONTROLES | claude | Claude A · Sustituir el control legado «Hoy no lee la cola» del arnés… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-HS-006 | claude | Sonnet 5.5: contrato adversarial y plan de regresiones HubSpot | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-HS-PILOT-INSTALL-REQUEST | claude | Claude A · Petición a Codex: instalación nueva y propia para la prime… | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-INFORME-MEJORAS-AVANCE | claude | Fe de erratas y avance del informe de mejoras (reparto por carriles e… | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-INFORME-MEJORAS-GEMINI-2026-11-13 | claude | Informe integral de mejoras de la App (funcionalidad, diseño, arquite… | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-NAV-GROUP-RETURN | claude | Menú: la cabecera de un grupo lleva a su primer apartado si estás en … | 2/2 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-OPUS-DATE-CHECK-HOST-MOUNT | claude | Opus · Montaje de «Comprobar una fecha» y «Revisar una decisión» en l… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CLAUDE-OPUS-PILOT-DEPLOY | claude | Opus · Correcciones pendientes de Radar, ensayo y motor, y despliegue… | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-A4-API-INDEPENDENT-319 | codex | Revisión independiente de ejecución HTTP A4 y fronteras de incertidum… | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-A4-CAPTURE-PIN-REVIEW-332 | codex | Comprobar que la lectura de la ficha conserva la huella de su copia | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-A4-COMPACT-ACK-323 | codex | Conservar en el gestor A4 el acuse del servidor sin registro | 6/6 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-A4-COMPACT-RESTART-331 | codex | Recuperar un acuse compacto de A4 tras reiniciar el servidor | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-A4-COMPARATOR-HOY-335 | codex | Conservar el borrador de un conflicto de Hoy cuando se sustituye la c… | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-A4-CONSUMER-REVIEW-322 | codex | Revisión independiente del cliente y estrategia de ejecución duradera… | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-A4-CONTRACT-REVIEW-304 | codex | Revisión cruzada del contrato HTTP durable A4 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-A4-CUTS-INDEPENDENT-317 | codex | Revisión del guion histórico A4 y matriz de aceptación funcional | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-A4-RADAR-REHEARSAL-COMPOSITION-326 | codex | Comprobar la convivencia de A4, Radar y Ensayar mi semana | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-A4-SCHEMAS-INDEPENDENT-312 | codex | Revisión independiente de esquemas públicos A4 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-A4-SERVER-MOUNT-REVIEW-324 | codex | Revisión independiente del montaje A4 en ambos servidores | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-A4-TASK-CAPTURE-PIN-334 | codex | Vincular la ficha de tarea a la huella de la copia observada | 5/5 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-A4-TASK-FOCUS-COMPACT-329 | codex | Mostrar en la ficha el acuse de guardado sin registro completo | 4/4 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-A4-UUID-INDEPENDENT-314 | codex | Revisión independiente del UUID estable del gestor | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-ACTIVATION-066 | codex | Preparación muestra la candidata real y activa únicamente la revisión… | 9/9 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-API-CLIENT-R2-REVIEW-455 | codex | Revisar detector de rutas del cliente R2 | 1/1 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-API-CLIENT-ROUTES-REVIEW-433 | codex | Verificación independiente de las rutas del cliente | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-API-R2-386 | codex | Contrastar la R2 del inventario de rutas | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-API-R3-403 | codex | Validar el inventario con su entorno de dependencias | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-API-REVIEW-358 | codex | Revisión independiente del inventario de API | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-APP-MOUNT-REVIEW-127 | codex | Dictamen independiente de navegación117 y montaje120 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-APP-OPEN-2026-11-10 | codex | Abrir la demo existente por peticion del usuario | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-APP-READINESS-121 | codex | Verificar y preparar candidata visible de la app principal integrada | 4/4 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-APP-REFRESH-REVIEW-156 | codex | Revisión independiente de aviso de lectura sustituida | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-ASDD-RECUPERACION-PILOTO-251 | codex | Piloto documental ASDD para Trabajo por recuperar | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-ASSETS-057 | codex | Regresiones de integridad de activos públicos y entorno de la candida… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-ATTEMPT-REOPEN-REVIEW-228 | codex | Revisión de reapertura del intento exacto | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-AUDIT-025 | codex | Contrastar aceptaciones delegadas y archivar memoria íntegra | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-AUTH-070 | codex | Protección local con envío único, acuse válido y ciclo de vida contro… | 5/5 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-AUTH-EVIDENCE-R2-REVIEW-252 | codex | Dictámenes independientes de autorización, evidencia R2 y simulacro t… | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-AUTH-GATE-REVIEW-159 | codex | Revisión independiente del orden de autenticación 158 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-AUTH-PARENT-RACE-380 | codex | Sustituir la aserción G6 de formato por una prueba de apertura y bloq… | 4/4 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-AUTH-PREVIEW-REVIEW-165 | codex | Revisión independiente de copia de ensayo 161 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-BACKUP-041 | codex | Verificar copias de recuperación sin restaurar la instalación | 6/6 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-BOARD-RECONCILE-346 | codex | Detectar entregas modificadas desde la CLI del tablón | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-BOARD-TRANSFER-376 | codex | Registrar traspaso de reservas de interfaz | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-BOOTSTRAP-REVIEW-163 | codex | Revisión independiente del arranque seguro 090 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-BOUND-ENDPOINT-343 | codex | Publicar el puerto real en el archivo de descubrimiento local | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CANDIDATE-FONT-ASSETS-423 | codex | Corregir la captura de activos de src/assets y verificar fuentes real… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CANDIDATE-INTEGRITY-095 | codex | Verificación reutilizable y de solo lectura de candidatas | 4/4 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CANDIDATE-NOV18-444 | codex | Candidata aislada del estado actual de Plan B | 1/1 | 2026-11-18 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CAPTURE-AUTOMATION-350 | codex | Mostrar si las capturas están detenidas o fallaron | 6/6 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CAPTURE-BROWSER-351 | codex | Verificar en Chromium los avisos de captura de Inicio y Continuidad | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CAPTURE-PORTABLE-354 | codex | Comprobar cronología y parte de capturas en ZIP portable | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CAPTURE-RETRY-352 | codex | Verificar fallo y reintento de captura sobre SQLite | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CAPTURE-REVIEW-141 | codex | Revisión independiente de cancelación de capturas135 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CAPTURE-SCHEDULE-353 | codex | Verificar el temporizador real de captura y su cierre | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CAPTURE-STATE-367 | codex | Estado coherente de los intentos y las capturas guardadas | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CI-FAILURE-EVIDENCE-421 | codex | Conservar fallos de padres y motivos en la evidencia estructurada de … | 4/4 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CI-MOBILE-REVIEW-462 | codex | Revisión independiente de CI opcional y escáner móvil | 1/1 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CI-R2-390 | codex | Contrastar la R2 del ejecutor local de CI sobre su CLI real | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CI-R3-405 | codex | Verificar CI R3 con identidad por archivo y cierre de procesos | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CI-REVIEW-356 | codex | Revisión independiente de los resultados de CI local | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CLAUDE-CONTINUATION-2026-11-08 | codex | Continuidad de los dos agentes Claude con puertas de montaje | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CLAUDE-DUAL-PLAN-REVIEW-192 | codex | Revisión independiente de dos superprompts190 y sus fronteras | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CLAUDE-NEXT-WAVE-2026-11-08 | codex | Siguiente tanda Claude: Radar visible y fuentes integradas | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CLAUDE-REAL-APP-HANDOFF | codex | Encargo Claude A: montar producto y preparar conexion real con login … | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CLAUDE-ROADMAP-2026-11-10 | codex | Continuidad ambiciosa de Claude A y B con puertas de montaje | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CLAUDE-TOOLING-R2-460 | codex | Revisar las correcciones de presupuestos y coordinación | 1/1 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CLAUDE-TOOLING-REVIEW-445 | codex | Revisión de contratos, rendimiento y herramientas de coordinación | 1/1 | 2026-11-18 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-COMMAND-PALETTE-KEYBOARD-419 | codex | Conservar una selección válida al buscar en la paleta | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-COMMITMENT-ARTIFACTS-REVIEW-273 | codex | Revisión independiente del simulador e informe de compromisos | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-COMMITMENT-RADAR-REVIEW | codex | Radar · Revisión independiente en Responder saludo | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-COMMITMENT-REPORT-MOBILE-305 | codex | Informe de compromisos legible en móvil y sin pérdida de contexto | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-COMMITMENT-SOURCES-REVIEW | codex | Radar · Revisión independiente de fuentes ficticias | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-COMPARISON-PAGE-PROVENANCE-466 | codex | Conservar las capturas al paginar el comparador | 3/3 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CONNECTION-065 | codex | Conexión guiada con revisión ligada a portal/modo y peticiones excluy… | 5/5 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CONT-026-REVIEW | codex | Revisión independiente del resumen operativo compactado | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CONT-030-REVIEW | codex | Revisión del registro de entrega REL033 y colaUX032 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CONTINUITY-APP-REVIEW-261 | codex | Revisión independiente de Continuidad visible por contexto 260 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CONTINUITY-DAY-REVIEW-208 | codex | Revisar presupuesto desconocido, etiquetas y foco de la jornada 205 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CONTINUITY-HOME-REVIEW-259 | codex | Revisión del montaje de Hub en Continuidad | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CONTINUITY-HUB-REVIEW-230 | codex | Revisión independiente de Continuidad 217 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CONTINUITY-READ-CONSISTENCY-464 | codex | Mantener coherentes las dos lecturas de Continuidad | 4/4 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CONTINUITY-RECONCILE-348 | codex | Conciliar la suite de Continuidad con informe y Kit de relevo | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-COORD-043 | codex | Revisar separación y calidad de las dos sesiones Claude | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-COPY-ACTIVATION-EPOCH-428 | codex | Renovar la identidad al sustituir los registros desde Preparación | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-COPY-IDENTITY-378 | codex | Distinguir copia activa, última captura y prueba | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-COPY-REVIEW-164 | codex | Revisión independiente del inspector de copias 074 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CRM-CALENDAR-435 | codex | Fechas fiables en tareas y oportunidades | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CSV-PREVIEW-REVIEW-416 | codex | Contrastar si una marca CSV sobrevive al cambio de copia | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CSV-R2-REVIEW-425 | codex | Contrastar CSV R2 con restauraciones de identidad reutilizada | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CSV-R3-REVIEW-431 | codex | Contrastar CSV R3 con activación y fechas de hora inválida | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CSV-R4-REVIEW-452 | codex | Revisión independiente del importador CSV R4 | 1/1 | 2026-11-18 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CSV-R5-REVIEW-458 | codex | Comprobar la vigencia de CSV R5 | 1/1 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-CSV-SUBMISSION-REVIEW-418 | codex | Revisar la marca de vista previa de CSV presentada | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-D4-REVIEW-394 | codex | Revisar D4 y comprobar la presentación de referencias | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-D7-STRICT-REVIEW-420 | codex | Contrastar el foco D7 con StrictMode de la app | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-DATE-CHECK-BINARY-RESTART-342 | codex | Reiniciar el servidor compilado y cotejar decisión y desenlace | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-DATE-CHECK-CANDIDATE-E2E-341 | codex | Verificar análisis, decisión y reapertura en la candidata compilada | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-DAY-ESTIMATES-REVIEW | codex | Jornada · Revisión independiente de estimaciones275 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-DEMO-CURRENT-422 | codex | Arrancar una demo ficticia desde una candidata actual aislada | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-DRAWER-INVALID-DATE-440 | codex | Reproducción de fechas ilegibles en listado y ficha | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-EOL-A2-A3-REVIEW-292 | codex | Revisar normalización LF de A2, adaptador y arnés sin cambios semánti… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-EOL-REVIEW-276 | codex | Revisar normalización LF de entregas aceptadas | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-EVIDENCE-AUTH-CACHE-461 | codex | Conservar la regresión de autorización con la caché nueva | 2/2 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-EVIDENCE-CONTEXT-REVIEW-257 | codex | Revisión independiente del vínculo de contexto 242 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-EVIDENCE-COPY-E2E-406 | codex | Actualizar el E2E de Evidencia de continuidad al vocabulario actual | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-EVIDENCE-FINAL-REVIEW-254 | codex | Dictamen independiente de 101 R2, 103 R3 y 104 R2 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-EVIDENCE-INDEPENDENT-REVIEW-244 | codex | Revisión independiente de evidencia, contrato HTTP y vista | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-EVIDENCE-MOUNT-REVIEW-256 | codex | Revisión independiente del registro de evidencia 239 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-EVIDENCE-PORTABLE-CONTRACT-364 | codex | Conciliar las pruebas de evidencia del ejecutable portátil | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-EXPORT-054 | codex | Exportación revisada y estado honesto de custodia de la copia | 4/4 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-FABLE-MISSION-2026-11-10 | codex | Mision Fable5.2: gemelo operativo y planes verificables | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-FOCUS-COVERAGE-450 | codex | Alcance verificable en Despachar vencidas | 5/5 | 2026-11-18 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-GENERATION-HTTP-REVIEW-188 | codex | Revisión independiente del flujo HTTP de generación187 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-GENERATION-INTEGRITY-109 | codex | Impedir generación y escrituras de error cuando el plan guardado está… | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HERDR-124 | codex | Evaluar e instalar Herdr para coordinar Codex y Claude en el equipo a… | 5/5 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HISTORY-064 | codex | Historial completo de operaciones con filtros, páginas y diferencias … | 7/7 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HISTORY-RELATION-RECONCILE-347 | codex | Conciliar las versiones vigentes de Historial y Referencias | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HOY-A2-REVIEW | codex | Hoy · Revisión independiente de A2 e integración con arnés R2 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HOY-APP-ACCEPTANCE-MISSION-264 | codex | Encargo de montaje de Hoy y conversión de sus sondas en aceptación | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HOY-COMPARATOR-QA-336 | codex | Actualizar la sonda de Resultados al control actual de borrador | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HOY-DAY-ADAPTER-REVIEW-274 | codex | Revisión independiente del adaptador de Jornada | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HOY-DECISIONS-REVIEW | codex | Hoy · Revisión independiente de Por decidir | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HOY-JORNADA-REVIEW-290 | codex | Revisión independiente de JornadaA3 en App compilada | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HOY-PROBES-REVIEW-266 | codex | Dictamen independiente de las pruebas de Hoy | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HS-025-REVIEW | codex | Revisión independiente de contrato público de búsqueda de actividad | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HS-029 | codex | Implementar muestra por creación CRM con búsquedas acotadas | 12/12 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HS-MOUNT-REVIEW-221 | codex | Revisión independiente del montaje HubSpot 218 y copia 219 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HS-READ-API-REVIEW-213 | codex | Revisión de la API de lectura 212 y encargo R2 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HTTP-BROWSER-376 | codex | Verificar exportación y errores HTTP en el navegador | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HTTP-ERROR-375 | codex | Conservar el estado HTTP ante respuestas ilegibles | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-HUBSPOT-READ-REVIEW-178 | codex | Revisión independiente del módulo HubSpot160 y CLI173 sin proveedor | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-IMPACT-MAP-REVIEW-229 | codex | Revisión independiente del mapa de impacto 215 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-INTEGRATED-PREVIEW-REVIEW-224 | codex | Revisión de la candidata visible 222 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-INTEGRATION-058 | codex | Recuperación, búsqueda y exportación sobre candidata compilada en pro… | 4/4 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-INTEGRATIONS-DESKTOP-CONTROL-371 | codex | Altura de la acción Actualizar estado | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-INTEGRATIONS-GOOGLE-GROUP-372 | codex | Dar una sola entrada a Google Workspace | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-INTEGRATIONS-NEXT-370 | codex | Alinear la acción de HubSpot con el requisito de protección | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-INTEGRATIONS-REVIEW-122 | codex | Contrastar entrega119 y preparar tareas accionables desde Hoy | 5/5 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-INTENT-JOURNAL-REVIEW-210 | codex | Revisión del diario de intención y encargo R2 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-JOB-CANCELLATION-368 | codex | Cancelar trabajos antes del comienzo y conservar su resultado final | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-JOURNAL-STARTUP-REVIEW-234 | codex | Revisión independiente de Store y del arranque con diario dañado | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-KEYBOARD-PREVIEW-REVIEW-194 | codex | Revisión independiente de copia visible193 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-LAB-035 | codex | Laboratorio de continuidad y plan de desarrollo conjunto | 9/9 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-LAB-REVIEW-099 | codex | Revisión independiente de la demo de laboratorio036 sin integración | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-LANDING-ARTE-ALCANCE | codex | Ilustrar el panel de alcance según la maqueta | 1/1 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-LANDING-CIERRE | codex | Ilustrar el retorno con una segunda escena nocturna | 1/1 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-LANDING-CONTINUIDAD | codex | Landing de continuidad de Plan B | 5/7 | 2026-11-19 · submit | Entrega parcial: revisar qué falta |
| CODEX-LANDING-CSS-DIFERIDO | codex | Diferir el bloque narrativo por proximidad | 1/1 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-LANDING-FUENTES | codex | Incluir la landing en la captura de candidatas | 2/2 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-LANDING-RENDIMIENTO | codex | Priorizar la señal y agilizar la carga inicial | 3/3 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-LOCAL-AUTHORIZATION-REVIEW-217 | codex | Revisión independiente de autorización local 214 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-LOCAL-PREVIEW-INDEPENDENT | codex | Revisión independiente de demo4601 y composición279 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-LOCAL-PREVIEW-JORNADA-299 | codex | Jornada R3 visible en demo ficticia4601: actualización solo UI | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-MANUAL-067 | codex | Comprobación manual con aprobación ligada a revisión/mapeo y resultad… | 5/5 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-MANUAL-ID-076 | codex | IDs remotos canónicos en comprobación manual, sin pérdida de precisión | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-MIGRATION-REVIEW-287 | codex | Revisión independiente del motor de migraciones y sus informes | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-MIGRATION-VISUAL-REVIEW-294 | codex | Revisar presupuesto y HTML de migraciones con fuentes fijas y navegad… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-MISSIONS-REVIEW-200 | codex | Revisión independiente de las misiones de producto197 y198 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-MOBILE-COPY-ALERT-367 | codex | Hacer visible la copia antigua en la cabecera móvil | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-MOBILE-COPY-REVIEW-396 | codex | Validar el aviso móvil con la cabecera compartida actual | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-MOBILE-D5-REVIEW-437 | codex | Revisión de la medición móvil D5 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-MULTISYSTEM-REVIEW-286 | codex | Revisión independiente del escenario multisistema del Radar | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-NAV-GROUP-REVIEW-465 | codex | Contrastar el retorno por la cabecera del menú | 1/1 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-NAVIGATION-R2-REVIEW-427 | codex | Contrastar las entregas de navegación y listas R2 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-NAVIGATION-REVIEW-391 | codex | Verificar modelo de navegación, montaje y candidata aislada | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-NEXT-MISSIONS-REVIEW-205 | codex | Revisión independiente del arranque y las misiones 202 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPERACIONES-CLARAS-RECONCILE-349 | codex | Revisar el corte actual de Operaciones claras y Faro | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPERATIONAL-CORE-REVIEW-325 | codex | Revisión del contrato y el planificador del gemelo operativo | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPERATIONAL-CORE2-REVIEW-330 | codex | Verificar límites de las recomendaciones del gemelo | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPERATIONAL-RECEIPT-REVIEW-328 | codex | Contrastar el recibo del ensayo en navegador después de perder la res… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPERATIONAL-REHEARSAL-REVIEW-327 | codex | Verificar el vínculo entre una decisión del Radar y la alternativa en… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPERATIONAL-SERVICES-REVIEW-379 | codex | Revisión independiente del caso de servicios del gemelo operativo | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPERATIONS-CANDIDATE-MATRIX | codex | Operaciones · Matriz de montaje y puertas de la candidata | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPERATIONS-LAUNCHER-REVIEW | codex | Operaciones · Revisión independiente de iniciador 272 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPERATIONS-PORTABLE-REVIEW | codex | Operaciones · Dictamen independiente del runtime portátil 270 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPERATIONS-PORTABLE-ZIP-REVIEW | codex | Operaciones · Revisión independiente de ZIP 271 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPERATIONS-REVIEW-134 | codex | Revisión independiente de límites HTTP y bloqueo de Hoy/Agentes | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPUS-COMMITMENT-FEASIBILITY-PLAN | codex | Plan para Opus 5.5: comprobar una fecha y revisar la decisión | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPUS-DATE-CHECK-CORE-REVIEW-337 | codex | Contrastar fechas protegidas, ventana y cancelación del motor de Opus | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPUS-DATE-CHECK-FLOW-REVIEW-338 | codex | Contrastar las conclusiones de Comprobar una fecha en navegador | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPUS-DECISION-REVIEW-339 | codex | Verificar identidad y alcance de los desenlaces de una decisión | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-OPUS-R2-HANDOFF-369 | codex | Encargo de conciliación para las tres entregas de Opus | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PASSPORT-REVIEW-225 | codex | Revisión independiente del pasaporte214 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PASSWORD-R2-398 | codex | Comprobar las correcciones de contraseña local R2 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PASSWORD-REVIEW-393 | codex | Contrastar compatibilidad y datos dañados en la contraseña local vers… | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PERSISTED-RECOVERY-111 | codex | Corregir F1-F3 de QA091 bajo reservas Store/Recovery055 | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PIPEDRIVE-REVIEW-295 | codex | Revisar adaptador Pipedrive de solo lectura, cobertura y aislamiento | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PIPELINE-CERTAINTY-442 | codex | Oportunidades abiertas con alcance e importe verificables | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PLAN-032 | codex | Preparar prompt y reparto paralelo de archivos | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PLAN-034 | codex | Preparar corrección UX032 y siguiente encargo Claude UX034 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PLAN-047 | codex | Auditar pendientes y preparar mega prompt para operaciones visibles | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PLAN-051 | codex | Revisar OPS048R2 y encargar auditoría adversa extensa de recuperación | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PLAN-060 | codex | Revisión independiente de búsqueda, exportación, ensayo y listas comp… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PLAN-071 | codex | Revisión independiente de nuevas interfaces y contratos con reparto d… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PLAN-082 | codex | Siguiente revisión independiente del inspector de recuperación | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PLAN-092 | codex | Preparar auditoría independiente de recuperación R1 sin conflictos | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PLAN-RESCUE-105 | codex | Preparar mega encargo Modo Rescate para Claude sin solapar evidencia1… | 5/5 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PLAN-RESCUE-114 | codex | Aclarar continuidad de Rescate106 y preparar revisión115 y Kit de Rel… | 6/6 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PORTABLE-DOWNLOAD-389 | codex | Aislar la descarga del ZIP portátil desde el botón de Exportar | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PORTABLE-ENDPOINT-344 | codex | Abrir y reabrir en Windows el ZIP de la candidata 340 con 343 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PORTABLE-HOME-382 | codex | Comprobar la portada antes de abrir el ZIP portátil de Windows | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PORTABLE-HUB-355 | codex | Omitir capacidades ausentes en el panel portable | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PORTABLE-INTEGRATED-385 | codex | Verificar el ZIP de una candidata con las correcciones del iniciador … | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PORTABLE-LAUNCH-REAL-302 | codex | Arranque real del lanzador del ZIP y reutilización local | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PORTABLE-LAUNCHER-ASSET-384 | codex | Rechazar un ZIP portátil que no pueda incluir su iniciador | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PORTABLE-NAVIGATION-395 | codex | Comprobar el ciclo ZIP con el menú actual | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PORTABLE-ZIP-LAUNCHER-300 | codex | ZIP ficticio con el iniciador 272 y los activos aceptados de Jornada | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PREVIEW-083 | codex | Arrancar candidata aislada para uso de ensayo en el equipo actual | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PREVIEW-094 | codex | Arranque nuevo de la candidata357 con datos ficticios | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PREVIEW-100 | codex | Arranque nuevo de la candidata357 con datos ficticios | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PREVIEW-125 | codex | Abrir una copia integrada verificable con Hoy, Agentes, Integraciones… | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PREVIEW-REVIEW-157 | codex | Revisión de vista de ensayo 144 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-PRODUCT-INTEGRATION-AUDIT-265 | codex | Auditoría de producto y dictamen independiente de candidata 263 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-QA-052-REVIEW | codex | Contrastar auditoría adversa QA052 y fijar correcciones verificables | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-QA052-CANDIDATE-PIN-378 | codex | Cotejar el constructor de la candidata en la prueba adversa de QA052 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-QA052-CURRENT-441 | codex | Revalidación de QA052 en las fuentes actuales | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-QA052-CURRENT-CANDIDATE-340 | codex | Verificar una candidata actual con las correcciones de empaquetado de… | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-QA052-CURRENT-REPLAY-345 | codex | Verificar de nuevo QA052 sobre las huellas actuales de 340 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-QA052-RUNTIME-269 | codex | Restauración QA052 en el servidor compilado de la candidata 263 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-QAREVIEW-068 | codex | Contraste independiente de QA056 antes de dictamen | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-QAREVIEW-075 | codex | Contraste de QA060 y QA073 y devolución trazable de hallazgos | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-QAREVIEW-088 | codex | Contrastar entrega independiente QA086 de inventario de candidatas | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-QAREVIEW-098 | codex | Contrastar auditoría independiente QA081 del inspector | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-QAREVIEW-107 | codex | Revisar R2 de QA081 sin editar su entrega | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-QAREVIEW-108 | codex | Contrastar QA091 y sus cuatro hallazgos de persistencia/devolución | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-QAREVIEW-110 | codex | Revalidar QA079R2 sobre hashes actuales y contrastes causales | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-QUALITY-COVERAGE-447 | codex | Avisos de calidad con cobertura comprobada | 5/5 | 2026-11-18 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RACES-061 | codex | Pruebas causales de respuestas válidas tardías en búsqueda y apertura… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RADAR-ENTRY-INDEPENDENT-315 | codex | Revisión independiente de entrada y activación del Radar | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RADAR-SCENARIOS-REVIEW-303 | codex | Revisión independiente de simulador y cronología del Radar | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RECORD-LIST-REVIEW-407 | codex | Comprobar el orden de resultados al cambiar la búsqueda de Clientes | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RECORD-TIMELINE-443 | codex | Historial fiable y completo en la ficha | 3/3 | 2026-11-18 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RECOVERY-CANDIDATE-377 | codex | Verificar candidata Windows tras los cambios de exportación | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-REGRESSION-093 | codex | Regresión completa TypeScript sobre candidata357 congelada | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-REHEARSAL-ISOLATION-077 | codex | Workspaces privados de pruebas de recuperación paralelas | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-REL-033 | codex | Preflight de versiones y artefactos locales reproducibles | 4/4 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-REL-033-REVIEW | codex | Revisión independiente de manifiestos y preflight de artefactos | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-REL-046 | codex | Preparar candidata aislada y validación de integración sin tocar rese… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RELATED-CANCEL-439 | codex | Lecturas relacionadas vigentes al navegar entre fichas | 5/5 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RELATED-PRESET-449 | codex | Crear tareas y oportunidades con relaciones inequívocas | 3/3 | 2026-11-18 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RELATION-062 | codex | Relaciones del CRM con identidad explícita, errores independientes y … | 5/5 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RELATION-LABEL-063 | codex | Nombre accesible estable del campo de relación en el editor de fichas | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RELAY-EXECUTOR-REVIEW-238 | codex | Revisión de exclusión y ejecutor de relevo | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RELAY-MAIN-REVIEW-277 | codex | Revisión independiente de montaje real del relevo | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RELAY-PACK-REVIEW-268 | codex | Revisión independiente del paquete de relevo | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RELAY-R2-REVIEW-258 | codex | Dictamen independiente del ejecutor 224 R2 y API 216 R2 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RELAY-R3-REVIEW-267 | codex | Dictamen independiente de relevo R3 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RELAY-REVIEW-226 | codex | Revisión independiente del ensayo de relevo216 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-REOPEN-PREVIEW-REVIEW-237 | codex | Revisión independiente de la candidata 236 servida en 4598 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESCUE-CLAIM-REVIEW-138 | codex | Comprobar errores tras publicar el Kit de Relevo | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESCUE-QA-REVIEW-180 | codex | Conciliar QA136 histórica con el protocolo116R4 aceptado | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESCUE-R2-REVIEW-125 | codex | Revisar Rescate106R2 y QA115 y preparar relevo a Claude | 4/4 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESCUE-R2-REVIEW-148 | codex | Revisar relevo R2 y preparar siguiente encargo | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESCUE-R3-REVIEW-153 | codex | Revisar Kit de Relevo 116 R3 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESCUE-R4-REVIEW-175 | codex | Revisión independiente del protocolo de reclamos116R4 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESCUE-RACE-150 | codex | Reproducir la carrera EEXIST en recuperación | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESCUE-REHEARSAL-ISOLATION-363 | codex | Aislar cuatro pruebas concurrentes de relevo | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESCUE-REVIEW-113 | codex | Revisar Modo Rescate106 y sus garantías de contexto, persistencia y n… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESCUE-TEST-ISOLATION-360 | codex | Aislar la prueba de integridad de cápsulas de otros procesos | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESPONSE-QUEUE-CONTEXT-468 | codex | Validar la copia esperada en la consulta de prioridades | 2/2 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESTORE-050 | codex | Ensayo de recuperación persistente con API local y reinicio de proceso | 7/7 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESTORE-ATOMICITY-374 | codex | Auditar consistencia de la restauración tras un rechazo o fallo tardío | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESTORE-REVALIDATION-417 | codex | Conciliar la restauración con la guarda de guardado actual | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RESTORE-TRANSACTION-388 | codex | Confirmar la restauración y sus metadatos en una sola transacción | 4/4 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RETURN-EXPLANATION-REVIEW-430 | codex | Verificar que la devolución describe el plan vigente y su estado | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-RETURN-R2-REVIEW-454 | codex | Revisar explicación de devolución R2 | 1/1 | 2026-11-18 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-REVISION-PREVIEW-REVIEW-182 | codex | Revisión independiente de preview181 en4595 mediante lecturas | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SAFE-049 | codex | Comprobar cobertura de una copia frente a una exportación de referenc… | 7/7 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SAVED-VIEW-PERSISTENCE-434 | codex | Confirmación real al guardar y borrar vistas | 5/5 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SEARCH-CACHE-RECHECK-448 | codex | Reverificación de lectura de búsqueda con la caché nueva | 1/1 | 2026-11-18 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SEARCH-CONTEXT-MIXED-446 | codex | Consistencia de búsqueda al sustituir la copia | 1/1 | 2026-11-18 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SEARCH-KEYBOARD-REVIEW-191 | codex | Revisión independiente de navegación por teclado189 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SEARCH-PERF-REVIEW-457 | codex | Validar e integrar la búsqueda rápida con control de copia | 1/1 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SEARCH-RETRY-453 | codex | Retirar resultados de búsqueda tras un conflicto | 3/3 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SEARCH-REVIEW-143 | codex | Revisión independiente de búsqueda y montajes actuales | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SEARCH-SQLITE-VERSION-451 | codex | Medir una protección de concurrencia para la búsqueda | 1/1 | 2026-11-18 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SEARCH-STALE-CONTEXT-207 | codex | Rechazar una búsqueda de otra copia antes de leer registros | 3/3 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SEARCH-WORKSPACE-REFRESH-456 | codex | Actualizar la copia desde el reintento de búsqueda | 2/2 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SERVER-MODULES-REVIEW-415 | codex | Cotejar las rutas del registro común de servidores | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SNAPSHOT-084 | codex | Inventario explícito de fuentes omitidas y herramientas de candidata … | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SOURCE-CASE-089 | codex | O2 QA086: exclusiones de directorios sin distinguir mayúsculas | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SOURCE-HISTORY-UI-REVIEW-306 | codex | Revisión independiente del consumidor de historial local | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-SOURCE-STATUS-REVIEW-296 | codex | Revisar que estado de fuente no acredita observación o autorización i… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-STORE-R2-387 | codex | Contrastar la R2 de caché de registros | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-STORE-REVIEW-357 | codex | Caché cifrada de registros: corrección, alcance y medición independie… | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-CONFLICT-REVIEW-204 | codex | Contrastar decisiones e identidad del comparador de tareas 199 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-D7-REVIEW-154 | codex | Revisión independiente de la línea base D7 en App | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-FOCUS-PIN-REVIEW-237 | codex | Revisión de la huella de ficha 196 R2 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-FOCUS-R2-REVIEW-139 | codex | Revisión independiente de ficha de tareas corregida | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-FOCUS-REVIEW-131 | codex | Revisión independiente de ficha de tarea y recuperación de acuse | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-MOUNT-REVIEW-142 | codex | Revisión independiente del montaje de ficha en Hoy140 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-NEXT-149 | codex | Preparar continuidad avanzada de tareas para Claude | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-OUTCOMES-CONTRACT-REVIEW-195 | codex | Revisión independiente de lifecycle del gestor170 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-OUTCOMES-REVIEW-147 | codex | Revisión independiente de gestor de guardados136 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-OUTCOMES-REVIEW-174 | codex | Revisión independiente de U1-148 sobre hashes presentados | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-REVISION-CLIENT-REVIEW-171 | codex | Revisión independiente del cliente condicional166 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-REVISION-CONTEXT-REVIEW-184 | codex | Revisión independiente del puente de contexto183 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-REVISION-CYCLE-REVIEW-179 | codex | Revisión independiente del ciclo cliente166 con main167/runtime168 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-REVISION-GENERATION-REVIEW-186 | codex | Revisión independiente del fingerprint de generación185 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-REVISION-MAIN-REVIEW-169 | codex | Revisión independiente de activación principal167 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-REVISION-MOUNT-REVIEW-162 | codex | Revisión independiente del opt-in protegido de revisiones160 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-REVISION-READS-206 | codex | Leer una sola vez la captura al calcular la revisión de tarea | 3/3 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-REVISION-REVIEW-129 | codex | Revisión independiente del guardado condicional128 y sus límites de u… | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-REVISION-RUNTIME-REVIEW-176 | codex | Revisión independiente de activación de revisiones en runtime168 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-REVISION-STRATEGY-REVIEW-243 | codex | Revisión de identidad y despacho del guardado condicionado | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TASK-STATE-REVIEW-154 | codex | Revisión independiente del estado de tareas 151 y arnés 152 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TEAM-069 | codex | Réplica de equipo completa con edición ligada a revisión y estados de… | 9/9 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TEAM-AUDIT-REVIEW-467 | codex | Revisar el alcance del auditor de accesibilidad de Equipo | 1/1 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TEAM-D8-R2-REVIEW-463 | codex | Revisión integrada de Equipo D8 y nombres de la demo | 1/1 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TEAM-D8-REVIEW-438 | codex | Revisión independiente de Equipo D8 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TEAM-FRONTEND-DEPLOY-20261114 | codex | Verificar y activar el rediseño en los archivos del piloto local | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TODAY-059 | codex | Hoy con todas las prioridades y tareas, búsqueda local y listas pagin… | 10/10 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-TODAY-WORKQUEUE-REVIEW-235 | codex | Contraste de la cola estructurada de Hoy | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-U2-APP-REVIEW-209 | codex | Revisar montaje de guardados 171, procedencia y cierre | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UI-COPY-R2-REVIEW-436 | codex | Revisión del vocabulario de interfaz R2 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UI-COPY-REVIEW-401 | codex | Comprobar cobertura de la regla de vocabulario D2 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UI-STATES-D3-404 | codex | Verificar recuperación de Cambios y Clientes | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UNDO-R2-399 | codex | Validar identidad y restauración en Deshacer R2 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UNDO-R3-REVIEW-426 | codex | Verificar Deshacer tras restaurar sobre la entrega R3 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UNDO-REVIEW-392 | codex | Revisar que Deshacer se refiera al guardado anunciado | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UNIT-BASELINE-362 | codex | Batería npm test sobre una copia congelada | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UNIT-BASELINE-365 | codex | Validar en paralelo las correcciones de relevo y evidencia | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UNIT-BASELINE-369 | codex | Verificar ficha, captura y cancelación con npm test | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UNIT-BASELINE-381 | codex | Validar globalmente el corte posterior a la corrección de G6 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UNIT-BASELINE-397 | codex | Repetir la batería unitaria completa sobre el corte actual | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UNIT-BASELINE-414 | codex | Repetir batería global con las pruebas reparadas | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UNIT-ENV-361 | codex | Entorno de prueba reproducible en npm test | 3/3 | — | Hay cambios sin commit en sus archivos: revisar antes de nada |
| CODEX-URL-ROUTES-R3-REVIEW-432 | codex | Verificación independiente de Enlaces R3 | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-URL-ROUTES-REVIEW-411 | codex | Verificar navegación al abandonar una ficha pedida por enlace | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UX-032-REVIEW | codex | Revisión independiente del selector de clientes de Claude | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-UX034-REVIEW-080 | codex | Contraste independiente de UX034: foco, exclusión y errores de ficha | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-WINDOWS-CRM-LAUNCH-366 | codex | Verificar el arranque del CRM local en Windows | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-WINDOWS-PORTABLE-FLOW-373 | codex | Validar recuperación del ZIP con la navegación vigente | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-WORK-COVERAGE-CAUSE-308 | codex | Distinguir ausencia de cobertura de fallo de lectura en pasaporte y m… | 6/6 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-WORK-SUMMARY-INDEPENDENT | codex | Revisión independiente del resumen duradero283 | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-WORK-SUMMARY-QA-REVIEW-307 | codex | Revisión de QA del resumen montado284 y sus hallazgos | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-WORK-SUMMARY-REVIEW-262 | codex | Revisión de cancelación del resumen público de trabajo | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-WORKSPACE-CLEANUP-383 | codex | Distinguir el EBUSY de limpieza del arranque Windows | 1/1 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-WORKSPACE-STATE-CONSISTENCY-459 | codex | Mantener coherente el estado de la copia | 3/3 | 2026-11-19 · submit | Trabajo en la rama: aceptar tras revisión visual en casa |
| CODEX-ZENDESK-REVIEW-285 | codex | Revisar fuente Zendesk y transporte compartido de lectura | 2/2 | — | Trabajo en la rama: aceptar tras revisión visual en casa |
