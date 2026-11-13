# CODEX-OPERATIONS-118 · Hoy y revisión local

2/11/2026, Europe/Madrid. Entrega R2 de código para la app principal, pendiente de revisión final y montaje por el otro Codex en117/120. No actualiza por sí misma4451.

## R2 · Nombres largos de capturas válidas

El revisor120 reprodujo que un nombre capturado de101 caracteres, válido paraSnapshot, se usaba como título del esquema provisionalAppSpec, cuyo límite es100. Se corrige únicamente la proyección de metadatos: título provisional acotado a100 y nombre visible a500, con elipsis sin cortar pares sustitutosUnicode. La captura original, suID y el hash del contenido completo no se truncan ni reescriben.

Verificación R2:17/17Node finales (16 anteriores y un caso con cinco variantes100/101/501/Unicode),0fail/skip/TODO, en node-r2.log de la carpeta de evidencia siguiente; nueva comprobación de tipos focal en typecheck-r2.log. Las seis pruebasDOM descritas más abajo pertenecen a la presentación inicial; no se atribuye una repeticiónDOMR2. El cambioR2 no modificaUI/CSS/cliente. El otroCodex repetirá el corte integrado antes de aceptar. Fuentes previas de la presentación conservadas en sus snapshots y submitted históricos del revisor.

## Problema reproducido

En4451 health200, instancia89627687-9016-47e1-9d7d-220f128f7b46; captura ficticia AgenciaNorte importada, ready:false/spec:null. Hoy yAgentes devuelven available:false y muestran el mismo vacío. Integraciones enumera simulaciones y pendientes; origen de equipo:null. Comprobación HTTP y Chromium limpio sobre esa instancia, sin modificarla. Snapshot.records vacío en la proyección de estado no demuestra inventario vacío: la UI de Preparación mostraba62 registros capturados.

## Cambio

- Nuevo GET /api/v7/local-operations: prioridades de Store.records y buildResponseQueue. Lee la captura importada antes de activación usando su esquema capturado, sin generar ni guardar una especificación. La edición continúa deshabilitada hasta activar. Copia activa con datos reales no depende de la habilitación del agente de ensayo.
- Hoy muestra tareas, motivos, vencimientos, búsqueda y recuentos completos; limita a200 filas e informa el límite. Empty/carga/error/reintento separados. CTA de preparación, y apertura de tareas/oportunidades mediante callbacks cuando la copia está activa.
- Agentes ofrece una revisión determinista local explícita. POST /api/v7/local-operations/reviews exige revisión y claveUUID, guarda acuse ligado a instancia y contenido y conserva hasta100 revisiones sin borrarlas. Una solicitud repetida devuelve el mismo acuse; clave reutilizada para otro contexto/revisión se rechaza. No modifica registrosCRM, crea tareas o realiza acciones externas.
- Cambio de copia produce409 para una revisión nueva obsoleta. Repetir un acuse antiguo informa stale. Historial malformado se conserva y bloquea nuevas revisiones; las tareas siguen legibles. Integridad de devolución inválida bloquea el POST.
- Cliente valida formatos y recuentos, descarta lectura abortada aunque el transporte la ignore y transmite bloqueo401 a App. Conserva la misma clave si no hay acuse; un rechazo409/422 permite iniciar una revisión nueva explícita. Revisión confirmada y recarga fallida no repiten elPOST.

## Validación actual

Evidencia: `tests/.tmp/operations118-aa861579-52c5-40eb-80c4-180d91077e73`.

-16/16 Node,0fail/skip/TODO:12 API/servicio +4 cliente. Importado/activo/vacío, producción simulada solo como forma de snapshot en memoria,318 tareas con lista200, revisión de contenido con igualID/fecha, GET sin mutaciones, idempotencia, rechazo obsoleto/clave de otro contexto, historial corrupto preservado e identidad ausente. No se probaron clientes reales o producción auténtica.
+- Typecheck de proyección de siete entradas y sus imports:0 errores, typecheck.log. No typecheck/regresión global: un intento global se interrumpió en su sesión propia, sin resultado acreditado.
+-6/6 DOM real: datos antes de activar, callback Preparación, búsqueda, acuse persistido conGETfallido y reintento sin segundoPOST, recuperación de503, teclado del detalle y1440/390/320 sin overflow. esbuild del componente/cliente y CSS con estilos incumbentes; API real createBaseApp + registrador118, Store en memoria y ficción nueva. Un arnés monta el componente; esto no es todavía recorrido de App completa.
+- Capturas1440/320 del corte final inspeccionadas;390 inspeccionada en el corte anterior con mismo componente/CSS. El corte final también genera390. No Edge o lector de pantalla. La revisión visual fue acotada, sin rediseño del sistema.
+- Detector Impeccable sobre componente/CSS:[]; no sustituye pruebas funcionales. source-hashes.json identifica cinco fuentes118 y Store/cola/fixtures al cerrar la verificación. No se afirma que todos esos inputs fueran congelados byte a byte desde el primer intento; el otro Codex debe congelar los hashes presentados para su integración.

Incidencias de preparación conservadas: primer import erróneo server/fixtures falló antes de ejecutar casos; corregido a shared/fixtures. Una prueba de escala clonaba una tarea completada (318 tareas contadas pero solo14 abiertas), corregida a plantilla abierta. Primer tsc focal detectó error.message sobreunknown en helper de test, corregido. Primer navegador no pudo arrancar por aislamientoWindows; después, dos fallos eran selectores del test (searchbox frente a textbox y output también tiene rolstatus), corregidos sin cambiar producto. Corte final16/16+6/6 limpio. Warning SQLiteexperimental/NO_COLOR visible.

## Coordinación y límites

118 conserva12 rutas;119 se registró antes de implementar118: nueva sesiónClaude con9 rutas nuevas, sin claim en su nombre ni envío aCLI. Prompt coordination/briefs/CLAUDE-INTEGRATIONS-119.md entregado alusuario. Código117/120 y montajes de App/backend pertenecen alotroCodex; no se editaron aquí.106/113/115 se conservan.

El primer envío alchatCodex fue rechazado por auto-review por falta de autorización específica. Tras pregunta, el usuario respondió «Sí, coordina con ese Codex»; el envío posterior fue autorizado y el destinatario confirmó reparto. No se eludió la revisión automática.

Browserplugin/skillbrowser ausentes. CUA y NodeREPL fallaron al escribir kernel assets(os3). Playwright instalado y Chromium1228 existente, contexto limpio, red externa bloqueada; no instalación o perfil del usuario. El sandbox no alcanza4451/no permite lanzar eseChromium; inspección yDOM se ejecutaron con autorización del ejecutor fuera de esa limitación, sin cambiar controles del equipo. Servidor propio puerto efímero, cerrado al terminar; base en memoria. No DPAPI, credenciales, cuentas o servicios de proveedores en las nuevas pruebas118.

Sin app4451 actualizada, OAuth nuevo, IA real, credenciales, dependencias, build/dist raíz, worktree, autostart, commit/push o despliegue. Los100 acuses y filas200 son límites explícitos, sin limpieza automática. GET no implementa auth propio: depende de montar el registrador dentro de createBaseApp con sus guardas.120 debe verificar ese montaje/gates antes de anunciar disponible.

Siguiente:117/120 congela esta presentación, monta componente/API y verifica App completa;119 se ejecuta en la nueva sesiónClaude cuando el usuario la inicie. El responsableLAB035 incorporará la continuidad bajo su reserva; este chat no escribe su archivo.
