# Mega prompt · Cerrar Modo Rescate y construir el Kit de Relevo

Trabaja en `D:/AI/Plan-B-CRM-v2.1/source`. El informe anterior corresponde a **CLAUDE-RESCUE-106**: Modo Rescate construido y presentado, pendiente de aceptación. No vuelvas a empezar106 ni digas que está integrado en la app.

Este encargo tiene dos etapas: **115 completa la evidencia;116 construye una cápsula cifrada para trasladar y reanudar el ensayo en una carpeta nueva**. Entre ambas hay revisión de Codex. La integración en la app principal queda fuera.

## 0. Sitúate antes de escribir

Lee AGENTS.md, CLAUDE.md, COORDINACION.md, CONTEXTO-PROYECTO.md, DESIGN.md, el informe106, su propuesta de integración y `coordination/plans/RESCATE-CONTINUIDAD-114.md`. Aplica compliance-autopilot-execution-core y las skills pertinentes disponibles. No instales herramientas.

```powershell
node tools/coordination/board.mjs list
node tools/coordination/board.mjs brief CLAUDE-RESCUE-QA-115
node tools/coordination/board.mjs brief CLAUDE-RESCUE-KIT-116
```

Al preparar este prompt:106 está en review con sus24 hashes coincidentes;113 figura working, sin dictamen final visible. No infieras ejecución continua por ese estado. QA112 es otra unidad y no se asigna aquí.

Si existe `coordination/reviews/CLAUDE-RESCUE-106-codex.md`, léelo y cita su versión. Si falta, dilo. No escribas ese archivo ni afirmes que113 ha terminado. Sus últimas hipótesis comunicadas fueron un replay que podría saltarse el contexto y una creación interrumpida que podría confundirse con otra idéntica. Son hipótesis hasta contar con reproducción y dictamen. No dupliques los oráculos que113 ya aporte salvo una variante necesaria.

Identifica tu sesión: ser otra sesión llamada claude no te da la reserva106. Si eres su autora, review significa conservar y esperar dictamen. Puedes trabajar en115, que tiene rutas propias. Si Codex devuelve106 y eres su autora, corrige solo bajo esa reserva y presenta nuevos hashes. No te autoaceptes, no uses el actor codex y no cambies board.json.

## A. Encargo115 · Completar la evidencia de Modo Rescate

Reserva primero:

```powershell
node tools/coordination/board.mjs claim CLAUDE-RESCUE-QA-115 claude
```

Antes de editar cada ruta usa `check-path CLAUDE-RESCUE-QA-115 claude RUTA`. Solo puedes escribir estos archivos persistentes:

```text
tests/rescue-followup-context.test.ts
tests/rescue-followup-persistence.test.ts
tests/rescue-followup-paths.test.ts
tests/rescue-followup-scale.test.ts
tests/e2e/rescue-followup.spec.ts
tests/helpers/rescue-followup-harness.ts
coordination/reports/CLAUDE-RESCUE-QA-115.md
coordination/reports/CLAUDE-RESCUE-QA-115-CHECKPOINT.md
coordination/plans/RESCUE-115-HANDOFF.md
```

Temporales propios en una raíz nueva `tests/.tmp/rescue115-<UUID>`, con límites de rutas comprobados. No uses como fixture la demo4511 del usuario ni la reinicies. Cada ejecución crea y limpia exclusivamente sus propios recursos; no hagas otra limpieza de salas antiguas o enlaces ajenos.

### A1. Congelar y atribuir

Registra hashes106 y de Store/Recovery/imports efectivos. Repite las suites Node106 en una proyección propia coherente; comunica el número real, sin presuponer que seguirán siendo60. Separa resultados del autor, repetición actual y casos nuevos. Un typecheck no sustituye una regresión funcional.

Si cambia una dependencia, termina sobre el snapshot o crea otro corte identificado. No mezcles resultados ni edites las pruebas originales para acomodarlos. Si eres la autora106, esto es ampliación de QA propia; la revisión independiente corresponde a Codex.

### A2. DOM real: las pruebas pendientes de mayor valor

1. **Guardado confirmado y recarga fallida.** Deja pasar el POST real y su acuse; haz fallar solo el GET posterior. La UI distingue el guardado del fallo de actualización. Reintentar no repite el POST. Comprueba un único cambio en Store y el número de solicitudes. Un borrador nuevo pendiente tampoco se pierde.
2. **Respuesta válida tardía dentro del componente.** Retén una respuesta antigua, cambia selección o contexto y entrega la nueva primero. Al soltar la antigua, ficha, versión, preview y acciones siguen siendo las actuales. Incluye transporte que ignora AbortSignal. Una prueba aislada del cliente no demuestra la coordinación de React.
3. **Teclado completo.** Sin ratón: elegir plan, seleccionar, editar una fecha inválida, corregir, previsualizar, guardar, resolver conflicto, conciliar y descargar. Comprueba foco y nombres accesibles tras paneles y errores.
4. **Inspección visual1440/390/320.** Captura e inspecciona los tres anchos, especialmente390 pendiente en106. Comprueba errores largos, controles de retorno y desbordamiento. No digas inspeccionado si solo mediste scrollWidth. Si falta herramienta para ver una imagen, declara el límite.

No afirmes pruebas de Edge, lector de pantalla o usuarios humanos si no se ejecutaron. Chromium limpio de Playwright sirve para esta unidad si queda identificado.

### A3. Integridad y límites que debes contrastar

- Reanudación en un proceso nuevo. Un fallo entre intención, efecto y acuse no puede convertir otra tarea de contenido idéntico en prueba de la operación original. Si113 ya lo reproduce, enlaza su evidencia y añade solo lo necesario.
- Un replay desde otro contexto no debe obtener éxito de otra sala. Un acuse antiguo no se presenta como el estado actual. Diferencia idempotencia de autorización de contexto.
- Mismo ID/fecha de captura con contenido distinto debe invalidar su revisión. Entidades o salas con IDs iguales no comparten decisiones.
- Marcadores: prueba JSON malformado, roomId incorrecto y enlace. El mutante que elimina existsSync puede ser equivalente porque falla la lectura posterior: contrasta salida y efectos antes de clasificarlo. No inventes un defecto por eliminar una guarda redundante.
- Un solo escritor: intentar abrir una raíz ya abierta no debe sembrar, normalizar un plan o cambiar bytes antes de adquirir el bloqueo. Si falla, entrega reproducción y dueño exactos; no corrijas fuente ajena desde115.
- El plan solo considera200 tareas. Crea un caso donde la primera tarea con estimación viable esté después de200. Comprueba que UI e informe explican el alcance. Los recuentos de10.000 registros no demuestran planificación global. Documenta la limitación y una posible unidad posterior; no edites la cola existente.
- Informe: separa creadas/completadas, estimaciones/hechos, inciertas/verificadas y aprobado/enviado. Cerrar el ensayo no acredita recuperación del negocio ni borra pendientes.

### A4. Entrega115

Usa SQLite real y Fastify.inject para contrato/persistencia; DOM real para React. Red externa bloqueada y datos ficticios nuevos. Los oráculos deben comprobar comportamiento, no buscar un string en el código. No uses TODO/skip para ocultar un fallo. Un error de compilación o timeout no cuenta como sensibilidad causal de un mutante.

El informe incluye matriz, comandos y salidas, hashes, snapshot, cambios concurrentes, capturas inspeccionadas y procesos propios cerrados. Distingue defecto confirmado, limitación y propuesta.

En `RESCUE-115-HANDOFF.md`, ordena qué debe corregir la autora106, qué depende de Codex y qué impide116. No marques un pendiente resuelto porque exista un prompt.

```powershell
node tools/coordination/board.mjs submit CLAUDE-RESCUE-QA-115 claude --note "Evidencia complementaria de Rescate106: DOM, persistencia, contexto y límites; resultados y hashes en informe"
```

Presenta y deja de editar. No aceptes tu propia entrega.

## Puerta entre A y B

Solo Codex acepta106 y115 tras revisar sus versiones actuales. Aceptar una auditoría con hallazgos no permite aceptar106 con defectos pendientes. No cambies dependencias ni uses otro encargo para saltarte reservas.

Si106 o115 no están done, no escribas116. Entrega el checkpoint y un resumen claro. No mantengas un bucle de espera ni repitas pruebas por consumir cuota. Que el kit esté definido no significa que esté construido.

## B. Encargo116 · Kit de Relevo

### B1. Resultado que debe poder enseñarse

**Trabajo durante una caída → el CRM simulado aplica un create pero pierde su acuse → exporto una cápsula cifrada → la inspecciono → la abro en una carpeta nueva → recupero tareas, plan, diario e incertidumbre → reviso explícitamente → concilio el create original sin duplicarlo → informe comparativo.**

Esto demuestra un entorno local y proceso nuevos en este equipo. No acredita otro ordenador, HubSpot real, RTO o portabilidad de una instalación corporativa. Solo ficción.

### B2. Reserva y alcance

```powershell
node tools/coordination/board.mjs claim CLAUDE-RESCUE-KIT-116 claude
```

El claim exige aceptación106/115. Las25 rutas exactas están en `coordination/tasks/CLAUDE-RESCUE-KIT-116.json`. Comprueba cada una con check-path.

Se reutilizan tres rutas106 después de su liberación: `shared/rescue-room.ts`, `server/rescue-room.ts` y `server/rescue-room-journal.ts`. Permiten exportación/importación controlada sin reconstruir clases a escondidas o fingir marcadores. El resto son archivos nuevos del kit. Preserva el recorrido106; un cambio incompatible exige contrato y alcance revisados.

No edites Store, Recovery, crypto, App/TeamApp, arranque principal, paquetes, lockfile, estilos globales, memoria o panel. Crea una demo propia que reutilice la sala y añada el kit. No cambies ninguna otra ruta106.

### B3. Contrato de cápsula y captura coherente

Contrato versionado y validado con estos componentes mínimos:

- Bundle estándar de Store, sin reinterpretar su historial.
- Estado, diario e idempotencia de Rescue mediante API explícita y allowlist de claves. No volcar toda la tabla meta.
- Estado persistido del CRM simulado para observar efectos y conteos de create.
- Procedencia de captura, portal y espacio; revisión del conjunto; fecha, esquema, recuentos y límites.

La exportación actual de Store no incluye todo Rescue y el simulador guarda estado fuera de SQLite. Coordina la captura de esos componentes usando la exclusión de las mutaciones o detectando cambios de revisión y rechazando/reintentando de forma acotada. Hashear archivos leídos en instantes diferentes no demuestra coherencia. No exportes una mezcla anterior y posterior a un efecto.

No incluyas contraseñas, claves DPAPI, .planb-key, credenciales, conexiones, perfiles o rutas privadas. Reusa `encodePortable`/`decodePortable` de `server/crypto.ts`; no inventes cifrado ni cambies su implementación. La contraseña del ensayo nunca aparece en argumentos CLI, logs, URL, manifiesto, localStorage o checkpoint. Elige un canal que no la exponga; si no puedes, limita el canal y documenta el motivo.

Limita bytes antes de parsear o descifrar y valida después. Contraseña incorrecta o archivo dañado se rechazan sin revelar contenido. Un hash acredita igualdad según el contexto; no autoría, anonimización o autenticidad comercial.

### B4. Inspección e importación segura

Primero inspección sin escritura: procedencia ficticia, registros, cambios, diario, operaciones inciertas y advertencias. Aprobar la importación queda ligado al contenido exacto inspeccionado y a un destino nuevo permitido.

Importa siempre en una carpeta nueva propia. Rechaza caminos externos, enlaces, destinos existentes e instalaciones arbitrarias. No sobrescribas el origen o un ensayo abierto. Crea en staging, valida y publica solo cuando pueda abrirse coherentemente. Un fallo intermedio conserva origen y archivo sin presentar un destino parcial como válido. Limpia solo rutas propias con resolved/realpath/marcador comprobados.

Usa `restoreBundle` para los datos CRM y validación expresa del kit para lo demás. No copies bases activas o claves del usuario. No hagas casts para acceder a constructores privados ni crees marcadores ficticios para eludir assertOwnRoot.

Define identidad de origen y destino. Conserva procedencia e historial sin atribuir hechos antiguos a la nueva instancia. Órdenes, previews, aprobaciones y tokens del origen no deben ejecutarse en el destino por compartir un ID nominal. Si cambia el contexto, la migración debe ser explícita y preservar las invariantes de diario e idempotencia.

Después de importar no hay envíos automáticos. Retira aprobaciones ejecutables y exige revisión. Conserva operaciones sending/uncertain como incertidumbre; no las conviertas en pending para recrearlas. El simulador debe conservar exactamente el efecto anterior al timeout. Un replay antiguo no representa una operación nueva del destino.

Una bandera exported no garantiza exclusión entre dos ordenadores desconectados. Explica el único escritor local y qué ocurre si origen y destino siguen abiertos. No desactives o borres el origen implícitamente.

### B5. Experiencia de producto

Tres pasos claros: preparar cápsula, inspeccionar y revisar, abrir destino. Estilo Plan B, jerarquía compacta, listas de hechos, contraseña con label, foco y errores útiles. La cancelación no borra trabajo ni archivos válidos.

Banner permanente: «Ensayo · datos ficticios · mismo equipo, carpeta nueva». Informe con origen/destino, revisiones, contenido conservado, aprobaciones retiradas e incertidumbres pendientes. Tiempo técnico separado de RTO. Las estimaciones siguen siendo declaradas; si el plan conserva el límite200, muéstralo.

La demo usa un puerto libre propio y falla si está ocupado. No mata4511,4515 ni procesos ajenos. Documenta comandos nuevo/reanudar y guion. El CLI de ensayo recorre el mismo contrato que la UI, sin una vía alternativa más permisiva.

### B6. Verificación mínima

1. Estados de origen: preparación, trabajo local, revisión de retorno, aprobado, parcial/incierto y cerrado. Explica y prueba la política de cada uno.
2. Caso principal: efecto antes del timeout, cápsula, destino en proceso nuevo, ID incorrecto rechazado, ID correcto conciliado y un único create. Lee estado persistido y cuenta llamadas.
3. Controles negativos: otra tarea idéntica no prueba el efecto original; otra entidad o sala con mismo ID no hereda éxito. Rechaza contexto antiguo, clave con contenido distinto y revisión obsoleta.
4. Integridad: contraseña incorrecta, truncado/alteración, esquema desconocido, bundle incompatible, componentes de revisiones distintas, diario/idem malformado y remoto incoherente. No publiques destino y conserva digest del origen.
5. Interrupciones antes/después de captura, cifrado, staging, publicación y primer arranque. Un proceso nuevo debe leer artefactos reales; no basta llamar al manejador final de errores.
6. Exclusión: mutación durante exportación, segundo escritor del destino e importaciones concurrentes. El resultado aclara si hubo efecto.
7. Escala: hasta10.000 registros, límites de colecciones y bytes, tiempo/memoria informados sin SLA inventado.
8. DOM real: inspección, cancelación, importación, errores, contraseña sin filtración, teclado y1440/390/320. Incluye recarga fallida después de éxito y respuesta tardía.

Construye primero un recorrido vertical y luego profundiza en fallos, escala y pulido. No fijes una cuota artificial de tests. Separa regresiones106/115, suites nuevas, bundles y DOM. Sin npm run build o dist/build de raíz: proyección aislada. Red externa bloqueada. No declares ausencia universal de DPAPI sin evidencia: utiliza memoria o fixtures nuevas controladas y documenta lo observado.

### B7. Entrega116

Informe y checkpoint propios con comandos comprobados, fallos, capturas inspeccionadas, hashes, matriz, límites y procesos. Propuesta de integración en `RESCUE-KIT-116-INTEGRACION.md`, sin ejecutarla.

```powershell
node tools/coordination/board.mjs submit CLAUDE-RESCUE-KIT-116 claude --note "Kit de Relevo ficticio: cápsula cifrada, inspección, destino nuevo y conciliación sin duplicado; evidencia y límites en informe"
```

Presenta, deja de editar y espera revisión. No te autoaceptes.

## Reglas comunes y uso de cuota

Una sesión autora, sin subagentes, nuevos worktrees, proveedores, MCP, datos reales, equipo original, perfiles, cuentas, instalaciones4331/4334, dependencias, compras, autostart, commits, push o despliegues. Solo Chromium automatizado propio y loopback. No anuncies disponible una demo sin comprobarla ahora.

Dedica la cuota incluida a115 y, cuando la puerta lo permita, a116. No presupongas acceso al contador. Guarda checkpoint al terminar cada fase y antes de un tramo largo, sin secretos. Sin llamadas redundantes para gastar, compras o evasión de límites. Si falta aceptación, entrega el punto exacto de continuación, sin inventar una unidad que la salte.

Tu respuesta final empieza con un mapa simple: qué unidad acabaste, cuál sigue en revisión y cuál es el único próximo paso. «Presentado» significa esperando revisión; «aceptado» exige decisión de Codex sobre hashes actuales; «integrado» exige otra entrega y pruebas de esa integración.
