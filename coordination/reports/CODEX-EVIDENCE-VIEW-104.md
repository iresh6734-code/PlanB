# EVIDENCE-VIEW-104 · Consulta explícita de evidencia local

## R2 · v1 rechaza un estado preparado sin evidencia de recuperación

6 de noviembre de 2026, Europe/Madrid. El dictamen 244 reprodujo que el cliente admitía `ready` si todos los checks decían `pass`, incluso con tiempo de recuperación nulo y restauración en otro equipo sin demostrar. El esquema de respuesta v1 admite ahora `at-risk`, `unproven` y `blocked`. Una versión futura que aporte evidencia de recuperación necesita su propio contrato. La API y el diseño de esta vista conservan su estructura.

La nueva regresión Node parte de un 200 real de 103 y cambia solo el veredicto y el estado de los checks. En Chromium se hizo una lectura válida, se alteró únicamente la segunda respuesta y se comprobó una tercera lectura válida. El cliente anterior aceptó la mutación en Node y en Chromium faltó el aviso esperado. En el corregido se retira el resultado, aparece el aviso de protocolo y la consulta siguiente recupera la evidencia genuina sin mostrar «Preparado». La alteración se hizo en el transporte de la prueba, sin modificar la Store.

- 46/46 Node, incluidas las pruebas de contrato y la sonda 244. 9/9 en Chromium, con las ocho pruebas existentes, teclado y anchos 1440, 390 y 320. Tipos focales correctos. Sin skips ni reintentos.
- Corte `tests/.tmp/evidence104-r2-EoOkXE`, backend de 236 con los bytes probados de 103 R2 y 245. Vite y los servidores 4517/4518 se ejecutaron en carpetas nuevas. Chromium de la caché de Playwright porque la skill Browser no está disponible. La captura `shots/invalid-ready.png` se inspeccionó. Se conserva la evidencia del navegador anterior en `old-browser.log`; la captura y los logs no acreditan montaje en la App principal.
- Cambian `src/continuity-evidence-client.ts` (`ed96e5760970f0a9dcd9688d343cf849e9fc2798dadfb9e54b672f21ddf2d67d`), `tests/continuity-evidence-client.test.ts` (`168f452e3e507f8ea2e1f71c2d651dc35bf836f3824c937cafc4d6eccbe5720d`) y `tests/e2e/continuity-evidence.spec.ts` (`2aae2ffc3aa65ae6f0097ae6cb71ccbcd64a78598da80bd373885284a9a56cb1`). Las otras cinco rutas de código, diseño y prueba conservan sus huellas.

Presentada para dictamen independiente. El registro de API y el vínculo con la copia activa siguen en 239/242. Sin cambio en la demo 236, cuentas externas o instalación.

1/11/2026, 16:10:42, Europe/Madrid. Presentada para revisión. Extensión de solo lectura y demo aislada; no integrada en App, main/runtime, navegación o piloto instalado. No acepta101/103/035 ni regulariza036.

## Resultado

Componente ContinuityEvidence y cliente nuevos. Escenarios caída del CRM/pérdida del equipo; horizontes8/24/72/168h. Objetivos fijos de1h/15min/24h mostrados como objetivos, nunca como tiempos demostrados. Consulta solo mediante acción explícita: un GET del mismo origen, sesión existente y cache:no-store, sin sondeo, reintento automático o almacenamiento del navegador.

Cada resultado fija la revisión. La consulta siguiente la conserva;409retira los derivados y ofrece «Actualizar referencia y consultar», que la renueva explícitamente. Cambiar selección, ocultar, desactivar o desmontar cancela y descarta resultados/errores tardíos incluso si el transporte ignora abort. Ocultar/desactivar limpia además el pin; cambiar escenario conserva la referencia. Una guarda síncrona evita solicitudes simultáneas. El botón conserva foco durante la carga mediante aria-disabled más la guarda funcional; no se deshabilita nativamente al pulsarlo.

El cliente valida esquema estricto, contexto/instalación/parámetros, cantidades y relaciones entre hechos antes de publicar. Limita lectura UTF-8/JSON a128KiB con cancelación de stream. No admite input interno, inventarios individuales, RTO inventado o respuestas de otra revisión.401/404/409/422/otros errores ofrecen mensajes estáticos, sin eco de detalles privados. El servidor103sigue siendo responsable de permisos y procedencia; esta validación no demuestra autenticidad criptográfica del remitente.

La vista separa comprobación de estructura, informe técnico, registro de exportación, declaración de custodia y restauración en otro equipo. Fecha civil sin hora impide exposición exacta, no equivale a0ni inventa medianoche. Muestra fechas de captura/comprobación con zonaMadrid, inventario completo, causas, próximos pasos y disclosure nativo de procedencia. No edita evidencias o ejecuta recuperación. La demo identifica expresamente su ficción nueva.

## Verificación final propia

- **44/44 Node,0fail/skip/TODO:**10casos del cliente+2SSR+15API103+17servicio101. Casos positivos de inventario preciso y vacío son lecturas del API real, además de respuestas rechazadas. SSR no se presenta como navegador.
- **8/8 E2E,0fail/skip/flaky**, Chromium existente, una worker y sin retries. Backend real createBaseApp+103+101 con Store nueva:memory:, fixtures nuevas y puerto4514. Navegador automatizado de caché, sin perfiles del usuario.
- **Typecheck focal limpio:** entradas propias e imports congelados; no typecheck global del checkout o borradores ajenos.
- Dos mutaciones privadas del cliente fallan cadauna0/1por la aserción prevista: quitar rechazo de señal ya abortada; omitir validación de contexto/wire. Los controles reales pasan. No se atribuyen dos defectos al producto ni se afirma haber mutado cada carrera del componente.

Casos de navegador: ausencia de lectura automática, GETdel mismo origen/sin cookies o browserstorage, resultado honesto sobre APIreal, teclado/foco/disclosure, cambio de selección, pin409provocado cambiando Store real, errores401/404/409/422/503 y cuerpos200malformados, cierre/desmontaje y reapertura sin consulta,1440/390/320 sin overflow y controles44px en móvil. Los estados de error HTTP en UI se **simulan en transporte**; autenticación real del middleware se probó en API103por Fastify.inject, no como sesión de navegador aquí. Flujo normal sin errores/warnings de consola o pageerror; una simulación409deMCP produjo el failed-resource esperado, no consola universalmente vacía.

La carrera final observa que la señal aborta y retiene respuestas de transporte que ignora esa señal. Antes de las aserciones finales espera recepción completa de los bytes mediante clone().arrayBuffer() en el arnés y dos frames del navegador; el resultado nuevo y la ausencia de error persisten. No se limita a comprobar inmediatamente después de liberar la respuesta.

### Cortes y fallos conservados

Primer E2E:2pass/1fail/5sin ejecutar. Una etiqueta envolvía selector/opciones y el nombre accesible no coincidía con su texto; se separaron label y select manteniendo getByLabel exacto. Después8/8. Primer banco43/43; añadido positivo preciso/vacío produce44/44, no44casos nuevos ni suma de ejecuciones.

Tras dictamen visual solo se reforzaron dos archivos de pruebas, sin cambiar componente/cliente/CSS/HTML. Un intento reforzado dio2pass/1fail/5sin ejecutar: response.finished() no completó para una respuesta interceptada aunque la traza muestra response/fulfill entregados. Se sustituyó esa espera del arnés por recepción de bytes observada en el navegador, sin debilitar aserciones. Luego44/44+tsc y8/8 finales. Se conserva el intento fallido en final-tests-7bfeb048-4789-4b17-9028-afc9f9639f0c/browser-47140fc0-249d-4b6d-8c2b-a83dfbe01ec9. No se atribuye aquel timeout a una regresión de producto.

## Fuente congelada y diseño

Base/build/primer8: D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/evidence104-0ac891e2-1570-414a-94cf-e0c9e39bb8ca. Corte final Node/tsc: D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/evidence104-0ac891e2-1570-414a-94cf-e0c9e39bb8ca/final-tests-8837ee61-bf7e-4c15-9e7b-01809c76cc82. E2E final: D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/evidence104-0ac891e2-1570-414a-94cf-e0c9e39bb8ca/final-tests-8837ee61-bf7e-4c15-9e7b-01809c76cc82/browser-b55d18ee-102a-4275-9284-b891206cec34. Sensibilidad final: D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/evidence104-0ac891e2-1570-414a-94cf-e0c9e39bb8ca/final-causal-ae8d0f86-8a70-45f3-aa04-0ad70fa258d2. Hashes antes/después de51inputs cotejados, dependencias existentes de node_modules no congeladas. El E2E final reutiliza los tres artefactos Vite previos byte a byte, sin recompilarlos.101y103conservan sus nueve hashes de fuentes/informes presentados; no se actualizan sus aceptaciones.

Skills aplicadas: marco compliance-autopilot-execution-core, React, frontend-testing-debugging e [Impeccable](C:/Users/iresh/.codex/skills/impeccable/SKILL.md). La última requiere revisor fresco y documentador; se delegaron solo esos roles acotados, no implementación. Contrato PLANB104en primer comentario body persiste en HTML compilado. Extensión Operate del sistema existente: PRODUCT/DESIGN/tokens vigentes, sin concepto/identidad nuevos o reescritura global de DESIGN.

Revisor fresco impeccable_finish_reviewer: **ship**, ninguna corrección visual material. Documento local design-documentation.md y finish-review-result.md en carpeta base. Ese dictamen es de acabado visual, no aceptación de código/tareas. Ocho capturas originales inspeccionadas por padre/revisor/documentador:desktop/mobile/narrow completas+viewport, loading/stale (estas últimas390x844). preview-desktop.png adicional1440x1000 inspeccionada por padre. La documentación/revisión43/8 corresponde al mismo código UI final; después solo cambian las dos pruebas.

Detector ejecutado una vez sobre nuevos targets:[]en evidence104-detector.json, **modo regex degradado**, sin parsersHTML/CSS. No acredita contraste calculado, accesibilidad completa, Edge o lector de pantalla. Node advierte SQLiteexperimental; Vite advierte dos anotaciones de comentario de dependenciaZod. No son fallos de estas comprobaciones. No se instalaron dependencias.

## Demo de esta máquina

Abierta http://127.0.0.1:4515/ en proceso propio25484; instanceId032357cc-2e05-4ce5-80b9-0cf85f20daba. Health actual cotejado a2026-11-01T15:09:18.385Z; no se afirma disponibilidad permanente. Store en memoria nueva y activos congelados. El wrapper del ensayo rechaza HTTPdistinto deGET/HEAD; intentoPATCHreal405y digest de contactos sin cambio en preview-readonly-check.json. No es una prueba de que el servidor de producto completo tenga esas restricciones: son de este wrapper de demo.

MCP verificó título/vista/lectura, carga y error; open_in_codex devolvió queued, no confirmación de pestaña visible. Solo se usó la pestaña del ensayo, no la ambient new-tab. Primera lectura local de health de cierre falló EACCES del sandbox; repetida con permiso de loopback comprobó la misma instancia, sin reiniciar. No se conectó equipooriginal/4331/4334, demo100 u otros procesos. demo100no verificada de nuevo ni actualizada.

## Coordinación y límites

Se preservan036y sus siete archivos sin integrar:sin reserva/submit registrado yF1/F2de099pendientes.079llegó a review pero su test G6 e informe cambiaron después de submit; se devolvió a working con las mismas reservas para nueva presentación. También cambió App.tsx reservado porSEARCH053:la discrepancia se conserva y queda pendiente de conciliación; no se acepta el hash antiguo o el cambio de otra sesión por citar una autorización histórica.081R2y091han llegado a review y aún deben revisarse.105prepara otro encargo en archivos distintos; no se editan los suyos.

Sin edición deApp/main/runtime/navglobal, motores101/103, fuentesClaude, package/lock, rootbuild/dist, cuentas/proveedores/secretos, commit/push o despliegue. No se afirma checkoutglobalverde:093histórico1154pass/1fail/7TODO y099dosrojos siguen separados hasta conciliación/revisión vigente. Próximo: revisarR2de081 y entregas091/079cuando sus hashes coincidan, resolver072como propuesta separada antes de integrar esta vista. Objetivo continuo activo, sin promesa de vigilancia o consumo permanente.

## Hashes propios finales

- src/ContinuityEvidence.tsx: 1c8d39cc0dce84a2d82839ed9c243bd62a361c4512fac6b71f64617171564b44
- src/continuity-evidence.css: eede38db281fbe1c28ca9e873c5351d960af1687e7d63e6a0fa2dc2194608959
- src/continuity-evidence-client.ts: 79a223780ac6b1c70f15f556188c9804e49e8c4dd8059d91da24291e29dd633c
- design/continuity-evidence/index.html: 4a6f41f8867b5c274884f93c4573e98a5cee58dce5e93f5c100e82b23fad4d01
- design/continuity-evidence/main.tsx: 2adf35f8ef55593cac1c181a0e1722d69bc5123f1e49a258f7755065117cf351
- tests/continuity-evidence-client.test.ts: 96c9b9256a7ba91989a5ea660efdcb202cbda9abefbf422e9314eb62950b3b50
- tests/continuity-evidence-ui.test.ts: 3f5098a6a3a00c802223860323646524d4c5af009d745d88d69f3e863931a1c1
- tests/e2e/continuity-evidence.spec.ts: a7e8230c717b70c3e67f89418ba7bdf5d060dc13e87f4fe427826d493f14940e

El SHA del informe se registra en submit. Sin autoaceptación.
