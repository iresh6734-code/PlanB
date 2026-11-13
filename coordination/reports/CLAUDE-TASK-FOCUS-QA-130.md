# CLAUDE-TASK-FOCUS-QA-130 · Informe

2/11/2026 (Europe/Madrid). Agente: Claude. Entrega para revisión de Codex; no aceptada. **Es una ampliación de QA de mi propia entrega 123, no una revisión independiente** (la independiente es 131, de Codex).

## Qué ocurrió (cronología relevante)

1. Registré y reservé 130 con cuatro archivos nuevos (verificados con `check-path`; los de 123 quedaron fuera de alcance, comprobado).
2. Hice la QA contra la **primera presentación de 123**: reproduje seis defectos (D1–D5, D7), medí uno (D6) y estudié el 401.
3. Mientras trabajaba, Codex devolvió 123 a `working` con la revisión independiente 131 (F1–F4). Conforme a mi encargo, **corregí 123 solo en sus once archivos reservados** y la volví a presentar (`review`). Detalle en `coordination/reports/CLAUDE-TASK-FOCUS-123.md`.
4. Adapté 130 a las fuentes corregidas: los casos que reproducían defectos pasaron a ser **regresiones de lo corregido**; D7 queda como límite abierto.

## Hallazgos: reproducido (a) · riesgo razonado (b) · hipótesis (c)

| ID | Clase | Qué | Estado |
| --- | --- | --- | --- |
| D1 = F4 | (a) reproducido en DOM + captura | Con el PATCH ya aplicado, el aviso de salida decía «Nada se ha enviado» | **Corregido en 123** (el aviso depende del estado: en vuelo / incierto / normal) |
| D2 | (a) DOM | Cambiar de tarea con un PATCH en vuelo dejaba el «Guardar» de la nueva sin efecto | **Corregido** (`flight` se reinicia) |
| D3 | (a) DOM (10 min virtuales) | Sin tiempos límite: «Leyendo…»/«Guardando…» eternos | **Corregido** (15 s lectura → error; 30 s PATCH → incierto; 20 s cola) |
| D4 | (a) Node: 48 MiB leídos antes de rechazar | El tope de 1 MiB se aplicaba tras consumir la respuesta | **Corregido** (lectura por flujo + `Content-Length`) |
| D5 | (a) DOM | «Seguir editando» ocultaba el fallo posterior de la recarga de la cola | **Corregido** (estado de cola aparte y persistente) |
| D6 | (b) **medido** | `/api/v2/state` crece ~300 B por propiedad: superaba 1 MiB con ~3.300 propiedades extra (la mitad con una candidata pendiente) | **Corregido** (tope 8 MiB por flujo; probado con 3.500). Prevalencia real desconocida |
| D7 | (a) DOM | PATCH aplicado + ficha cerrada + respuesta perdida → ni acuse ni actualización de la cola | **ABIERTO**: ahora se **avisa antes de salir**; resolverlo requiere contrato nuevo (p. ej. `onUncertain`) |
| F1–F3 | de la revisión 131 | verificación mezclando instalaciones; misma ID con otra fecha; decisión humana ≠ acuse | **Corregidos en 123** (no son hallazgos míos) |
| — | (c) hipótesis | Causa del «401 real» que falló una vez en 123 | **NO cerrada** (ver abajo) |

Defecto de **mi código de corrección** hallado por las propias pruebas: `raceAbort` dejaba una promesa sin manejar con la señal ya abortada (Node lo reportó). Corregido antes de presentar.

Riesgos razonados (b) sin reproducir: tras guardar, la copia puede cambiar justo entre la comprobación previa y el PATCH (no hay verificación posterior); `onSaved` del montaje que trague errores haría que la ficha diga «cola actualizada» sin estarlo (ver handoff, punto 3); cambiar `taskId` programáticamente descarta el borrador sin preguntar (solo evitable desde el montaje).

## Investigación del 401 intermitente (misión 2)

**Conclusión honesta: la causa del fallo único observado en 123 sigue siendo una hipótesis (c); no la he cerrado.**

Reproducido de forma determinista (barreras sobre `page.route`, servidor real, bloqueo real con `/api/v2/auth/lock`):

- **Mecanismo plausible reproducido, no la causa demostrada.** «401 real» de 123 «bloqueaba» con `context.clearCookies()`. Una búsqueda de `ReferenceSelect` iniciada con sesión válida y respondida después devuelve `Set-Cookie` y **restaura la cookie en una sesión que el servidor sigue considerando válida**: el guardado entonces pasa (PATCH 1) en lugar de dar 401 (`ventana 1 (mecanismo de la hipótesis)`). Es un artefacto del arnés, no del producto: con el **bloqueo real** (sesión borrada en el servidor) la misma respuesta tardía puede devolver la cookie al navegador pero no abre nada (`ventana 1a`, y a nivel de servidor «401: un bloqueo REAL…»).
- `ventana 1b`: si se pulsa Guardar antes de soltar la respuesta, `ReferenceSelect` **cancela** su búsqueda al deshabilitarse y la respuesta antigua nunca llega.
- 401 en carga inicial; entre las dos lecturas de estado de la carga; en lectura auxiliar; en la comprobación previa; **en el propio PATCH** (petición retenida, bloqueo, continuar → 401, 0 ejecuciones, 0 cambios); en la lectura posterior de la cola (acuse intacto, aviso, reintento solo lee, éxito tras desbloquear); respuesta antigua tras bloqueo + cambio de ID; respuesta antigua tras cerrar/desmontar (sin errores de página). En todos: borrador conservado cuando corresponde y un único PATCH tras desbloquear.
- Ventana descubierta además: **mis propias pruebas nuevas fallaban a veces** con `route.fetch: ECONNRESET/ECONNREFUSED` porque un manejador retenido seguía vivo mientras el servidor de prueba se cerraba. Es otra fuente de fallos intermitentes de arnés, corregida (`unrouteAll` antes de parar el servidor). No puedo afirmar que fuera la del 401 original: aquel test no usaba `route.fetch`.
- Repeticiones: ventana 1 (3 pruebas) ×8 = 24/24 tras el arreglo del arnés; suite completa de 130 ×3 sin fallos con las fuentes finales (1 ejecución previa con el defecto de arnés).
- **Mutaciones**: M6 (el 401 borra el borrador), M7 (la cola se declara actualizada tras un fallo), M8 (un 401 del PATCH tratado como «incierto») → las pruebas **fallan** (detectadas).

**No cubierto**: caducidad de sesión por tiempo (equivalente al bloqueo, pero no simulado), bloqueo desde otra pestaña, y cualquier otra causa del fallo original (p. ej. temporización de `toBeVisible` en esa ejecución concreta). Si reaparece, mirar primero ese test y la teardown.

## Acuse, recarga y concurrencia (misión 3)

Cubierto (repetido ahora): PATCH confirmado + recarga fallida (aviso, acuse intacto, reintento solo lee, PATCH 1); acuse perdido tras aplicar (incierto, solo lee, coincidencia ≠ autoría, **decisión humana registrada como tal**); acuse perdido sin llegar; cierre/cambio de ficha con operación en vuelo (D1/F4, D2, D7); 404/409/422/401 con borrador (pruebas de 123, repetidas); doble clic/Enter y persistencia real del historial; homónimas y dos capturas con el mismo ID (incluida la sustitución con **misma ID y fecha distinta**, F2); **contraprueba de CAS** en Node y en DOM (dos pestañas/escrituras simultáneas del mismo campo: ambas confirman, 2 filas, gana la última, sin aviso); envíos idénticos simultáneos (2 PATCH, 2 filas); cancelar ≠ deshacer; respuestas truncadas/inválidas/HTML/demasiado grandes (error claro en lectura, «incierto» en PATCH); tarea con **fecha-hora en DOM real** (Auckland y Los Ángeles, fixture ficticia con campo `datetime`).

La contraprueba que ya mostraba que 123 no tiene CAS ni idempotencia se conservó. 123 usa la API antigua y su comprobación previa tiene una ventana de carrera; no se afirma lo contrario.

## 128 y 129 (solo lectura)

128 está `done` (tras la revisión independiente `CODEX-TASK-CAS-128-independent.md`, dictamen favorable **solo para el servicio aislado bajo un único escritor**, sin aceptar su montaje ni interfaz); 129 sigue en `review`. No se adopta 128 en 123. Cómo cambiaría el consumidor está en el traspaso (punto 9). Lo que 128 daría: 409 de revisión que no es una carrera de «mejor esfuerzo»; lo que NO daría: protección multi-proceso ni idempotencia por intención, ni cobertura de las rutas antiguas.

## Evidencia

Node v24.14.0, Playwright 1.64.1, chrome-headless-shell 1228, sin perfil; servidor hijo propio por prueba (puerto efímero 127.0.0.1, `scripts/block-external.cjs`); todos cerrados (comprobado: 0 procesos `node` con `taskfocus`/`server.mts`).

| Suite | Resultado | Estado |
| --- | --- | --- |
| `tests/task-focus-followup.test.ts` (130, Node) | 8/8 | nueva, repetida |
| `tests/e2e/task-focus-followup.spec.ts` (130, DOM) | 19/19 | nueva, repetida (varias ejecuciones) |
| `tests/local-task-focus*.test.ts` (123, Node) | 32/32 | repetida sobre las fuentes corregidas |
| `tests/e2e/local-task-focus.spec.ts` (123, DOM) | 26/26 | repetida sobre las fuentes corregidas |
| `npx tsc --noEmit -p .` | 0 errores | árbol actual (no es regresión global) |

Históricos (no repetidos): el estado de 123 en su primera presentación (26 Node, 19 DOM).

**Prueba causal contra el código anterior** (reconstruyo la primera presentación a partir de una copia mutada con 1 línea revertida; `shared`, `LocalTaskFocus.tsx` y el cliente coinciden con los hashes presentados; el CSS difiere solo en que es anterior al recorte del título, sin efecto lógico): las pruebas nuevas de 123 **fallan** contra ella — Node: 6 de corrección (F1×2, F2, D3, D4, D6) + 2 de contexto puro (D3 se cuelga y se corta por tiempo), mientras las 15 originales siguen pasando; DOM: 9/9 de las seleccionadas fallan (7 nuevas + 2 cuyo texto cambió). Sin eso, «regresión causal» sería solo una etiqueta.

## Capturas

`tests/.tmp/taskfocusqa130-2bacfa55-14c5-4ca9-97df-9a974cafbadd/`: `d1.png` (primera presentación, defecto D1: «Guardando…» junto a «Nada se ha enviado») **inspeccionada**; `d1-corregido.png` (versión final) **no inspeccionada por mí**. En la carpeta de 123: `f4-en-vuelo.png` **inspeccionada** (versión previa al margen de 8 px de la línea de estado). Declaro que `d1.png` corresponde a una versión anterior del código.

## Hashes (SHA-256)

Fuentes de 123 contra las que se hizo esta QA (fijadas por el test de huella): `shared/local-task-focus.ts` 40332326d058dfd5c30e3d45e41e03b32c3a6a59f2e13b79228670ca4032479d · `src/LocalTaskFocus.tsx` aefb63df80bf9e6130ae6d6e42f9ca932aff5b297670e7cd40339cc6b0c6b3a5 · `src/local-task-focus-client.ts` 535177583a1defa3cecac416d6bd75fc887c5c16e35b83d06eaff3f8b10bf510 · `src/local-task-focus.css` cdbe8147c813be8bb57d2332d84ea4a0d4bd161b371aede30bd27391f84c1f26.

| Archivo de 130 | SHA-256 |
| --- | --- |
| tests/task-focus-followup.test.ts | 77db2be0942c043517d75621d86b1a8315b0bd4d12524968fa29beffbfd26941 |
| tests/e2e/task-focus-followup.spec.ts | 92d86c92363a202c2f14f7595b0920614b9e5c4876d117cdde52ae2114a6f2fc |

(Este informe y el traspaso los hashea el `submit`.)

## Cambios realizados

Solo en las rutas reservadas: 4 de 130 (esta QA) y, tras la devolución formal, las 11 de 123 (corrección). Ningún otro archivo del repositorio: sin App, LocalOperations, Store, server/app.ts, 128/129, `tests/independent-task-focus-123.test.ts` (de Codex; **sus dos observaciones F1/F2 ahora fallarán a propósito**, como indica su revisión, y las sustituye o invierte Codex).

## Riesgos pendientes y siguiente unidad

- D7 abierto; ventana residual antes del PATCH; ausencia de CAS/idempotencia (128 sería otra unidad con reserva propia, bajo escritor único).
- **Siguiente unidad concreta**: montaje de la ficha en la fila de Hoy (117/118) con `onSaved` que rechace, foco tras desaparecer el botón, y verificación a 1440/390/320 en la App real; después, evaluar integrar 128 y/o un `onUncertain`.

## Coordinación

No existe un canal operativo con Codex desde esta sesión (el servidor MCP `codex` falló al conectar). El tablero es el único medio: 123 reenviada con nota y este encargo presentado. **No hay prueba de que Codex los haya leído.** No ampliué permisos, herramientas ni alcance de envío.
