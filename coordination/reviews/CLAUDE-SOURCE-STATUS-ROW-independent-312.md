# SourceStatusRow · revisión independiente 312

Primera revisión del9/11/2026, Europe/Madrid: se devolvió para corregir F1. **Dictamen vigente del10/11, tras R2: aceptar el componente**, con el alcance y la evidencia añadidos al final. Sigue sin estar montado en Integraciones; no se acredita ninguna conexión o lectura real.

## F1 · La renovación de autorización conserva la actividad del estado anterior (P2)

`src/SourceStatusRow.tsx`, `signatureOf` y su efecto de invalidación: la firma selecciona proveedor, cuenta, nivel, evidencia, próxima acción, fecha y número de peticiones. Omite `authorizedAt` y otros campos semánticos de la vista. Dos vistas válidas derivadas por `describeSourceStatus`, para la misma cuenta y sin lecturas, difieren únicamente en la autorización (08:00 → 09:00 UTC). La segunda vista no invalida el estado de la primera.

Tres sondas Chromium independientes lo reproducen:

1. Iniciar una acción retenida, renovar autorización: el botón conserva «En curso…» deshabilitado, en vez de retirar la actividad del estado anterior.
2. Abrir detalles, renovar autorización: siguen abiertos y su hijo sigue montado.
3. Iniciar una acción, renovar autorización y resolver la anterior: aparece «La acción terminó…» en la vista renovada, atribuyendo allí la terminación anterior.

La tercera prueba sí ejecuta la terminación; en la primera la aserción de botón habilitado falla antes de llegar a ese paso. Es un defecto de atribución/invalidación visual; esta revisión no demuestra un acceso de proveedor ni una omisión de autorización en servidor.

Corrección solicitada: invalidar actividad y detalles ante cambios semánticos válidos de la vista, incluida autorización; definir explícitamente el tratamiento del cambio de ámbito del anfitrión al montar. Puede usarse la representación completa normalizada de la vista para su estado propio. Conservar guardia de desmontaje y ausencia de efectos de red del componente. Añadir regresiones y repetir el banco sin cambiar las sondas del revisor.

## Contraste y control causal

Banco privado congelado `tests/.tmp/source-row312-Q6j88C/s`; manifiesto en su raíz. Código revisado `SourceStatusRow.tsx`: `d26faa560df9fe87dc72e664395d1143ccf092c3ae2c32aac0f86bbc8a22d22f`; SourceStatus R3 aceptada `fddfda1bd5b73d4b5a32e0eca96e6b58a9188d6b7b50be911421c37cf2a08da1`. Las seis rutas entregadas coincidían con `submit` antes del dictamen.

- SSR del autor: **3/3**, tipos focales **exit 0**.
- Chromium: cinco pruebas del autor **5/5**; las dos primeras sondas independientes fallan por F1 en esa ejecución. Una ejecución posterior de las tres sondas definitivas falla **0/3**, cada una en su aserción prevista. No se presenta como una única pasada de ocho pruebas.
- Control causal: cambiar únicamente la firma a `JSON.stringify(view)` en la copia privada produce **8/8** (cinco previas y tres independientes), tipos **exit 0**, 17,2 s. No se editó el producto compartido. La copia privada se restauró a su hash original después de medir; el cambio causal no es una entrega de producto.
- Geometría y teclado: cubiertos por las cinco pruebas del autor, anchos 1440/390/320. Inspeccioné la captura original de 320 px; no abrí las de 390/1440. No lector de pantalla ni contraste calculado.

Se usó Playwright con Chromium instalado `chromium_headless_shell-1228` y servidor efímero en loopback. Browser plugin no disponible en el catálogo de skills de esta sesión. No hubo proveedores, credenciales ni instalación real. Primer intento del arnés: faltaban el import dinámico `shared/model.ts` y la ruta del binario; no cuenta como evidencia de producto. Se corrigió solo el banco. La preparación intentó un junction y recibió EPERM; se continuó mediante resolución normal de módulos, sin instalar ni relajar controles.

## Llegada pendiente

HISTORY-UI R2 está aceptada por 306, pero aún no está montada. El registro local de fuentes, GET derivado, acción de lectura de ensayo y montaje en `LocalIntegrations` continúan a cargo de Codex coordinador en unidades sucesoras. `CLAUDE-SOURCE-HISTORY-MOUNT-QA` verificará esa candidata cuando exista. Esta revisión no cierra ninguna de esas filas ni consume passport308 en revisión.

## R2 · F1 cerrada y componente aceptable

10/11/2026. Revisión independiente del nuevo corte: seis hashes de presentación cotejados antes/después. SourceStatusRow `b6125d57cc58d6ba39317a6d5b0d5d9ba084f9a87459808d7f057fbc0888231b`, prueba DOM `c8afaff258181e4653598dcd14ab05e0df684ec2b69abdcd12246e166d659fcd`; SSR y CSS conservan las huellas anteriores. Se leyeron también informe y traspaso R2.

La firma usa la vista completa validada y normalizada. Estado propio y detalles pertenecen a esa firma; cambian durante el render cuando se sustituye la vista. Generación, firma capturada y guardia de desmontaje retiran las terminaciones anteriores. El traspaso distingue correctamente la identidad visible de la clave completa de ámbito que debe aportar el anfitrión: instalación/captura/generación/pin/fuente/registro. Una vista equivalente no reinicia el componente innecesariamente.

Banco propio congelado `tests/.tmp/source-row312-r2-3LMJWM`: **3/3 SSR**, **12/12 Chromium**, tipos focales **exit0**. Son nueve pruebas DOM de autora y las **tres sondas originales del revisor intactas**, hash `8665f435eb7656aabd768ee216850a483478d8ad9f79378cca7456f6c31c18b2`. Navegador:16,4s, un trabajador, cero reintentos/omitidos. `manifest.json`, `run.mjs`, logs y `playwright.json` conservan el corte y los resultados.

Se cubren autorización renovada, cambios semánticos que mantienen fecha/peticiones, misma vista, A→B→A, cambio de clave del anfitrión, desmontaje, fallos y doble clic, teclado y1440/390/320. Se abrió la captura de320 del nuevo banco; no las de390/1440. No se repitieron mutantes: F1 ya tiene control causal privado documentado en la primera revisión y las tres sondas fallaron sobre aquel corte. No se modificó producto ni pruebas de autora.

Dependencias fijadas: SourceStatusR3 `fddfda1b…`, SourceReading `5e487a65…`, adaptador Zendesk y estilos del banco previo; no se adoptan passport308 ni otras ediciones working. Se usó Chromium1228 existente y loopback efímero; sin proveedores o credenciales. El arnés conserva los límites de inspección de consola declarados, sin afirmar una auditoría exhaustiva o lector de pantalla.

Aceptación exclusivamente de componente y contrato de montaje. El handoff conserva un rótulo histórico de HISTORY-UI como review306; el tablón y esta revisión la identifican ya done. Ese rótulo no cambia el resultado ni prueba montaje. Registro/API/Integraciones continúan pendientes; la siguiente transferencia a Claude B de módulos nuevos se registrará antes de editar. App/main/runtime/LocalIntegrations siguen con el coordinador salvo traspaso específico. No se cierra la QA de producto por estos15 pases de dos capas.
