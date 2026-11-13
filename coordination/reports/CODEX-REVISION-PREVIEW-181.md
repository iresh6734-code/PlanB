# Copia local181 · backend de revisiones y UI158

4/11/2026, Europe/Madrid. Presentada para revisión independiente. Nueva carpeta, semilla ficticia, clave `kind:test` y base; no se reutilizaron datos, sesiones o claves de otra instalación. La copia161 permanece separada y no fue detenida. Esta unidad reserva únicamente este informe; no modifica fuentes de producto ni rutas de Claude.

## Resultado y entorno

**http://127.0.0.1:4595/**, instancia `2f98e12e-d660-4c89-8f66-c13351891cdb`, PID32248, handle propio91592. Raíz `tests/.tmp/p181-d30d61d3/runtime`, datos `fixture-data`. Lanzador real main167 con montaje160 aceptados, compilado desde el snapshot177 aceptado. Backend SHA256 `4d63e027d4b588f24f9bcee219c36121e80b1a3d5960db3f47f6555a4b0d6068`. Sus48inputs coinciden con el manifiesto congelado177 y se recotejaron al final;15activos UI158 copiados de161 coinciden byte a byte. El metafile conserva los48inputs. No se ejecutó rootbuild ni se modificó dist del checkout.

UI158 sigue usando el guardado antiguo. **No están montados el cliente166 en la ficha, U1, CONTRACT170, U2 o LAB036**. El endpoint de revisiones sí existe y se comprobó con el cliente166 desde Node contra este mismo runtime. No se presenta la interfaz como protegida frente a editores simultáneos por instalar el backend.

Semilla62registros/18tareas, portal ficticio `demo-agency`, captura `fixture-agency:2026-11-04T16:34:38.295Z`, datos de ensayo visibles. Entorno del proceso por lista permitida; sin `.env.local`, `.ai.local.json`, cuentas, tokens ni proveedores configurados. Preload bloquea tráfico externo y Chromium bloquea cualquier origen distinto del propio. La principal queda sin contraseña configurada; la comprobación de contraseña usa una copia adicional y credencial inventada, nunca almacenada en informes.

Ready16:34:44UTC: PID de endpoint coincide con el hijo y health/estado coinciden en instancia. Último GET propio16:36:30UTC: health200/estado200, misma instancia, `isTestData:true`,3cambios. La disponibilidad posterior depende del proceso; un handle no es un monitor permanente. Se pidió abrir4595 en el panel del chat y la herramienta devolvió **queued**, no se observó su apertura efectiva en la ventana del usuario.

## Recorrido visible

Flujo: cargar App → Hoy → editar task-2 → guardar → comprobar contador → búsqueda global porID → ficha del contacto → revisión local → recargar → Integraciones → Hoy móvil.

Playwright/Chromium propio de caché1228, sin perfil del usuario; Browser plugin not available.1440×1000,390×1000 y320×1000. `preview181-smoke.cjs` adapta el banco161 solo para nueva identificación181/puntero; son nuevas ejecuciones en datos nuevos, no cifras históricas trasladadas.

| Comprobación | Resultado observado |
| --- | --- |
| Identidad/no página vacía | TítuloPlanB y AgenciaNorte de ensayo; contenido real |
| Overlay y errores visibles | Sin overlay ni global-error |
| Interacción | PATCHlegacy real task-2, nota persistida, contador1cambio local |
| Búsqueda | contact-1 exacto, abre ficha y campos coinciden con API |
| Revisión local | POST real y acuse conservado tras recargar |
| Integraciones | Lectura local terminada, sin alertas ni consulta a proveedores |
| Geometría | Documento sin overflow a390/320; capturas conservadas |
| Consola/red |0pageerror/0warning-error/0peticiones externas |

Escrituras del recorrido:1PATCH `/api/records/tasks/task-2` y1POST `/api/v7/local-operations/reviews`. La segunda no aumenta el historial de cambios de registros. Screenshots `today-1440.png`, `today-390.png`, `today-320.png`, `integrations-1440.png` en la raíz181. Se abrió e inspeccionó `today-320.png`: navegación y contenido legibles, sin solapes observados en la primera pantalla; no auditoría visual exhaustiva de toda la app. Copia de imagen para conversación en la carpeta de visualizaciones del chat.

## API de revisiones del mismo runtime

`preview181-api.cjs` importa el cliente166 exacto del snapshot177 y restringe todas sus peticiones al origen4595/rutasv7. Empieza con1cambio del recorrido visible; trabaja sobre task-3 distinta de task-2.

- Dos editores con la misma revisión: uno `changed`, otro `conflict`, historial total2.
- Guardar el valor ganador: `unchanged`, sin historial adicional. Una revisión antigua sigue `conflict`.
- Otro guardado se aplica; el transporte consume su respuesta200 y simula pérdida del acuse: cliente `uncertain`. La lectura posterior observa el valor y no aumenta el número de PATCH. Se conserva `uncertain`; observar el mismo valor no se presenta como prueba de autoría del envío.
- Un envío **explícito de control**, con revisión anterior a ese guardado, termina `conflict`. No es reintento automático de la lectura. Total3cambios.
- GETv7 devuelve200, `Cache-Control:no-store` y `Vary:Cookie`. No hay fallbacklegacy del cliente. El único PATCHlegacy del recorrido fue el de la UI158, registrado por separado.

`api-result.json` conserva el registro de8peticiones del cliente (6PATCH y2GET) y los resultados. Los6PATCH son dos competidores, no-op, control viejo, acuse perdido y control explícito final; no seis cambios. Solo dos cambian la tarea. No se repitió toda la suite177/168 ni su baseline en esta unidad: sus aceptaciones previas son prerequisitos, no pruebas nuevas de181.

## Acceso real en otra copia

Raíz `auth-check-af8d275f-fd2b-4196-949b-2b8bf32a93f8`, puerto51358, PID19128, mismos backend y activos copiados de181. Contraseña inventada configurada únicamente ahí. Respuesta authenticated:true anterior retenida; bloqueo real posterior →401 en API protegida. Entregar la respuesta antigua no remonta la sidebar/datos (MutationObserver); login real posterior →200 y vuelve UI.0cambiosCRM/0externas/0pageerror/0warning-error. La principal sigue sin contraseña configurada.

Capturas protegida1440/320;320abierta e inspeccionada, sin overflow y formulario visible. `result.json`, `exit.json` y `stopped.json` acreditan cierre del hijo propio19128 y PID ausente. No se cerró el proceso principal32248. No demuestra protección del disco, DPAPI, múltiples ventanas o disponibilidad permanente.

## Incidencia de entorno conservada

Primer intento en `tests/.tmp/p181-18652c28`, PID13764: servidor arrancó/publicó endpoint pero el sandbox devolvióEACCES al fetchloopback. Terminó por Ready timeout y su PID se observóESRCH; no hay evento close guardado y no se inventa. Datos de ese intento preservados. Se preparó una carpeta nueva y se repitió con permiso de loopback, sin cambiar fuente o controles del sistema. No es fallo de producto ni ejecución verde. Ambos builds dieron el mismo hash de backend.

## Evidencia y límites

Puntero `tests/.tmp/preview181-latest.json`; manifiesto completo, backend-metafile, owner/ready/server.log, smoke-result, api-result, final-health y copiaauth en `tests/.tmp/p181-d30d61d3`. Scripts propios `preview181-prepare.cjs`, `preview181-run.cjs`, `preview181-smoke.cjs`, `preview181-api.cjs`, `preview181-auth-check.cjs` en tests/.tmp. Comandos: preparar con node/tsx; iniciar con node; smoke/auth con node y Chromium; API con node/tsx. Loopback con permiso explícito del entorno. El runner recibe `stop` por su handle; no volver a prepararlo para simular una comprobación de salud.

No se repitió la suiteglobal, otros navegadores, lector de pantalla, rescate/paquete, conexiones reales o instalacióncorporativa. No se configura HubSpot/Google/IA. No hay commit,push,despliegue ni autoaceptación. Las reservas ajenas se conservan; el siguiente paso de producto visible sigue siendo170aceptada y despuésU2, con unidad independiente para adoptar166 en el gestor cuando corresponda.
