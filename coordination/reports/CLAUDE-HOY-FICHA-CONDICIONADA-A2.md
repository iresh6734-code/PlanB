# CLAUDE-HOY-FICHA-CONDICIONADA-A2 · Ficha y host con guardado condicionado y comparador

6/11/2026, Europe/Madrid. Fase A2 del encargo «Haz que Hoy funcione de principio a fin». Sin red, proveedores ni credenciales; datos ficticios, raíces nuevas, SQLite de archivo y red exterior bloqueada. Sin commits ni despliegues. **No cubre «Por decidir»** (otra unidad: vive en `TaskSaveOutcomes.tsx`) **ni la persistencia tras reiniciar** (A4).

## Qué hace ahora la App

1. **Abrir.** La ficha abre con una sola lectura validada (`loadRevisedTask`): registro, esquema, contexto y token pertenecen a la misma lectura.
2. **Guardar.** El host crea el gestor con `revisionStrategy()` por defecto. El PATCH sale por `/api/v7/task-revision/<id>` con el token revisado; tras confirmar, la ficha adopta el token que devuelve el servidor. `seal()`, `resume()`, `dispose()` y la puerta síncrona de despacho no cambian.
3. **Conflicto.** Un 409 `TASK_REVISION_CHANGED` lee la versión actual y abre el comparador 199 dentro de la ficha (base revisada, borrador, lectura actual): conserva el cambio ajeno y lo propio sin colisión, y obliga a decidir lo que colisiona. Elegir, «Preparar el nuevo guardado» y «Volver al formulario» **no envían nada**. La propuesta vuelve al formulario con la base y el token de la lectura mostrada; un **segundo «Guardar cambios»** la confirma. Un cambio concurrente posterior da otro conflicto y vuelve a pedir decisión sobre la versión nueva. «Volver al formulario» conserva el borrador y ofrece «Comparar con la versión actual»; cerrar con el comparador abierto pide confirmar.
4. **Errores.** Un fallo de la lectura (401, 404, 5xx, cambio de contexto) o del endpoint condicionado conserva el borrador y muestra su aviso; **nunca** hay un PATCH legado ni una lectura por la ruta anterior.
5. **Sin cambios.** Un no-op se presenta como «Sin cambios… no se añadió historial». Si la ficha detecta localmente que no hay cambios, no sale ninguna petición.
6. **Resultados → intento exacto.** Un rechazo por revisión que llega con la ficha cerrada se recupera desde «Resultados» («Abrir la tarea») y abre el comparador, sin sobrescribir.

## Pruebas

Recuentos de PATCH condicionados, legados, 409 y filas de historial salen **del servidor** (registro de peticiones del arnés + `store.changes()`), no de la interfaz.

| Prueba (App compilada de fuentes congeladas, servidor real con `taskRevisions`, SQLite de archivo) | Observado |
|---|---|
| **Recuento, dos pestañas**: antes de decidir | 2 PATCH condicionados, 1 aplicado y 1 409, 1 fila, 0 legados; el 409 no escribió nada de la pestaña B |
| elegir y previsualizar | sin escrituras (2 / 1 / 1) |
| segundo clic | **3 PATCH condicionados, 2 aplicaciones, 2 filas**, 0 legados; resultado: cambio ajeno (fecha) + mi decisión (notas) + mi cambio propio (asunto) |
| **Teclado y foco** | decidir con la barra espaciadora; foco en el encabezado al abrir y en el aviso al volver; «Volver al formulario» con Enter; cerrar con el comparador abierto pide confirmar; recuentos intactos |
| **Segundo conflicto** | tras preparar la propuesta una tercera pestaña cambia la fecha: confirmar da otro 409 (4 condicionados, 2 aplicados, 2 filas), la intención se conserva y la decisión es sobre la versión nueva; al final aplica |
| **Generación** | cambia antes de enviar → «ya no corresponde a la copia actual» con 0 PATCH; cambia DURANTE el envío → 409 y «No se puede combinar esta tarea» con lo escrito a la vista; «Volver al formulario» lo conserva |
| **No-op** | sin cambios locales 0 peticiones; una petición sin efecto devuelve `changed: false` con el mismo token y 0 filas |
| **401, 404, 422, 500** inyectados con `page.route` (el servidor no los ve) | un único intento condicionado; 0 PATCH legados y 0 de otro tipo; 401/422 conservan el formulario, 404 y 500 muestran su aviso con el borrador en la operación |
| **Lectura fallida al abrir** | aviso, 0 PATCH, 0 peticiones a `/api/records/tasks/…` |
| **Homónimas** (task-2 y task-3, mismo asunto) | guardar task-3 va solo a `/task-revision/task-3`; task-2 intacta |
| **Resultados → intento exacto** | rechazo con la ficha cerrada; «Abrir la tarea» abre el comparador; 2 condicionados, 1 409, 1 fila; task-2 conserva la nota ganadora |

- **Estabilidad:** `hoy-ficha-condicionada.spec.ts` 12/12 en tres ejecuciones seguidas sin reintentos (`retries: 0`) sobre raíces nuevas; la primera ejecución con el código real tuvo 6 fallos de la propia prueba (localizador por el título de la ficha, que cambia con el asunto; 404/500 que sustituyen el formulario) corregidos en la prueba, no en producto.
- **Sondas del arnés (`hoy-recuperable-240.spec.ts`)**: pasan las dos primeras sondas de A2 (guardado condicionado y comparador desde un 409 real). Falla, como se espera, el CONTROL de línea base legada (`1 PATCH legado`): **se retira** ahora que la estrategia condicionada está montada. Siguen rojas por función ausente «Por decidir», A3 y A4.
- **Causal (4 mutaciones sobre la App compilada, todas detectadas):** sin `revised` en `LocalOperations`, sin token en `submit`, propuesta con el token viejo y sin abrir el comparador ante un 409.
- **Regresión de la ficha** (antes de renovar la huella): 95/95 especificaciones de navegador de la ficha y el gestor (`task-focus-followup` 19 DOM originales, `local-task-focus`, `task-focus-outcomes`, `task-save-outcome`, `task-conflict-review`) y 92/92 Node (`task-focus-followup`, `task-outcomes-host`, `task-attempt-adoption`, `task-save-outcome`, `task-revision-strategy`). Solo entonces se renovó la huella de `LocalTaskFocus.tsx` en `tests/task-focus-followup.test.ts`, sin tocar sus aserciones.
- `tsc --noEmit` sin errores en los archivos de la unidad.

## Hallazgo que necesita decisión de otro dueño

**36 pruebas de navegador anteriores fallan con el host por defecto** (`task-d7-real-app`, `task-attempt-reopen`, `independent-task-mount`): montan la App real contra un servidor `createBaseApp` **sin** `taskRevisions`, y su aserción retiene `/api/records/tasks/task-2` (ruta anterior). Con el modo condicionado por defecto la ficha no puede abrir (el endpoint no existe) y la prueba espera el diálogo. Es la consecuencia directa de «condicionado por defecto, legado solo expreso». Opciones, ninguna es mía:
1. Esas especificaciones pasan a configurar el modo anterior de forma expresa (requiere que `App.tsx` o el host acepte `saveMode` desde configuración; hoy el host lo acepta por prop pero `App.tsx` no la pasa).
2. **Recomendada**: que `/api/health` publique `taskRevisions: true|false` (un cambio de una línea en `server/security.ts`, de Codex) y que el host use `saveMode='auto'`: condicionado cuando el servidor lo declara, anterior si no, **sin** adivinarlo por un error. Con eso las especificaciones antiguas siguen siendo del modo anterior sin editarlas y `main` (que lo habilita siempre) queda condicionado.

Hasta decidirlo, estas tres especificaciones están rojas por configuración, no por un defecto de producto.

## Hashes y límites

Las huellas de las ocho rutas las registra el tablón al presentar (el informe no puede contener la suya). Archivos con CRLF, como el árbol de trabajo.

- El comparador solo prepara la propuesta: no comprueba quién escribió cada valor ni impide que la tarea vuelva a cambiar antes de confirmar (otro 409 lo detecta).
- La protección frente a escrituras concurrentes es la de 185: un escritor cooperante; no cubre otros procesos ni la ruta anterior.
- Sin persistencia tras recargar o reiniciar (A4); el seguimiento sigue en memoria.
- No se probó 390/320 px ni accesibilidad con lector de pantalla para las vistas nuevas de la ficha; el comparador 199 conserva sus propias pruebas de diseño (1440/390/320) y pasaron.


---

# R2 · dictamen CODEX-HOY-A2-REVIEW

- **Compatibilidad con el arnés R2.** El fallo de la revisión (`ENOENT` al crear `cases/001-…` y `server.mts` en otra ruta) era una incompatibilidad con una versión intermedia del arnés. El arnés vigente (`CLAUDE-HOY-APP-PROBES-A` R2, presentado) crea el directorio padre `cases` y conserva el guion en `root/server.mts` (sus imports apuntan a la **copia privada** del servidor); esta unidad **no cambia su extensión** y corre sin cambios sobre él. Repetida la especificación completa en una raíz nueva: ver abajo.
- **390 y 320 px en la App con teclado y foco (nuevo).** Dos pruebas abren el comparador desde un 409 real con la pestaña estrecha: sin desbordamiento horizontal (comparador y formulario de vuelta), opciones con objetivo ≥ 40 px, foco en el encabezado al abrir, decidir con la barra espaciadora, llegar a «Preparar el nuevo guardado» **solo con Tab** y Enter, foco en el aviso al volver, 0 escrituras al decidir y volver (2 condicionados, 1 conflicto, 1 fila) y 3 condicionados / 2 filas tras el segundo guardado. **Capturas abiertas e inspeccionadas** (`cases/*/comparador-390.png` y `comparador-320.png` bajo la raíz de la ejecución): las tres columnas «Lo que viste / Tu propuesta / Lo que hay ahora» apiladas y legibles, etiquetas y estado en texto, radios amplios, botón primario con el anillo de foco visible y el aviso de límite sin recortar.
- **Modo por `health`.** Queda como **propuesta para una unidad de contrato independiente** (no es parte de A2 ni se pide aquí); se conserva el requisito: un error del servicio condicionado no activa escrituras por el endpoint anterior (0 PATCH legados en todos los recorridos de la especificación).
- **A3 y `LocalOperations.tsx`.** A3 espera a la **aceptación** de A2; esta unidad conserva sus ocho rutas.
- **Pendiente tal como se declaró:** «Por decidir» (otra unidad); persistencia tras reinicio (A4).
