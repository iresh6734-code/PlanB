# EXPORT054 · Exportación revisada y custodia explícita

30/10/2026, Europe/Madrid. Codex. **Mejora visible del flujo Exportar:5/5 recorridos propios, typecheck y build aislados correctos. Fuente para revisión, sin instalación actualizada.** No utiliza los nuevos verificadores BACKUP041/SAFE049 todavía pendientes de dictamen de fuentes.

La pantalla exige revisar el contenido ligado a una revisión y contraseñas coincidentes de12–200caracteres antes de descargar. Carga inicial, errores y reintento explícitos; actualizar contenido invalida la revisión marcada. El servidor sigue contrastando revision: si el espacio cambia devuelve409; la UI vuelve a cargar y requiere otra revisión, sin exportar automáticamente la versión nueva. No se ha modificado backend/contratos ni el helper de descarga global.

El mensaje «Descarga completada» se sustituye por «preparado para descargar» con revisión y pasos de comprobación. El navegador inicia la descarga, pero la app no acredita dónde se guardó ni una restauración por ese hecho. Tras éxito limpia ambas contraseñas y la casilla, sin localStorage. Solicita el estado de custodia existente para reflejar la exportación registrada; ante fallo no inventa custodia.

La custodia se muestra como declaración del usuario solo si current:true y la revisión coincide con el resumen. Una confirmación histórica no se promueve a vigente; se separan exportación registrada, confirmación, validación del archivo y ensayo de recuperación. La actualización de estado no confirma nada automáticamente. Un401durante descarga emite el bloqueo existente y retira la superficie con datos; cargas tardías tras desmontar no actualizan estado.

CSS acotado a export-page, controles44px, móvil sin overflow. Componentes y navegación existentes conservados. Las guías React/frontend-testing-debugging se aplicaron; no Browserplugin/skill disponible, se usó el flujo Playwright del repositorio con Chromium headless propio y perfil temporal.

## Verificación y evidencias

Snapshot: `tests/.tmp/export054-3d26706f-53ae-4942-9858-44d5d1de4b89`; hashes en manifest.json. Typecheck/Vite correctos en build-results.json/logs y backend fixture compilado para sus API. Puerto4391, datos ficticios nuevos, sin4331/4334 o proveedor.

**5/5 navegador**, sinTODO/skips/flaky:

1. Controles bloqueados hasta contenido/revisión/passwords válidas; descarga cifrada real guardada en evidencia y descifrada con contraseña ficticia. bundleRevision y captura/recuento coinciden con la revisión examinada. Mensaje honesto y contraseñas retiradas.
2. Cambio local durante revisión produce409, un único intento, revisión nueva sin casilla marcada.
3. Exportación/confirmación ficticia por API existente: declaración vigente diferenciada y retirada tras una edición; confirmación histórica visible solo como historia.
4.404de resumen bloquea descarga; fallo de custodia explícito; teclado y1440/390/320sin overflow. Capturas inspeccionadas.
5. Actualizar invalida casilla; bloqueo real de sesión provoca401y pantalla protegida, sin datos de exportación visibles.

Evidencia: `C:/Users/iresh/.codex/visualizations/2026/10/29/01a1896e-06ff-7690-9644-4f6de90c2826/export054/`, results.json y capturas export054-1440.png/390/320. Identidad/título/primer contenido comprobados; sin overlay de framework observado. No se probó lector de pantalla u otro motor.

Los recorridos usan la versión de Store anterior al fixINTEGRITY055 (hash en snapshot), que no altera la semántica de una exportación normal. No extenderlos a una instalación o un paquete real. La siguiente candidata integrada se registra por separado si se compila; los casos de incertidumbre pertenecen a INTEGRITY055.

## Coordinación

Cuatro archivos propios exactos; App permanece en reserva de revisión SEARCH053, la auditoríaQA052 y sus tests intactos. QA052 terminó durante esta fase: Codex contrastó el informe y comenzó correcciones separadas en Store/REL046. No significa que esta UI ejecute o certifique los nuevos verificadores.

Sin datos/cuentas reales, claves del equipo original, red externa, dependencias, build/dist raíz, despliegue, commit o push. Pendiente revisión separada; no autoaceptación. La preparación de una descarga autorizada puede continuar aunque el usuario navegue a otra pantalla, como hacía el helper existente; esta unidad evita actualizar estado de un componente desmontado, no cambia el contrato global de descargas.

## Hashes de fuente cotejados antes de presentar

- src/PortableExport.tsx: b0209f1175e7bb7e54a6e91a17e071c604fe8f08150e59f9b2080a6164b0ea92
- src/portable-export.css: 2bdd54057d0a74e8ea4ee85e2021dda9b0527ab6a575b69ddfd8ea28776106a0
- tests/e2e/portable-export-review.spec.ts: 07a351bc5a6df3bdc9333b80a0fc1284a19775385195ef2af614761400a897eb

El hash del propio informe lo registra submit; no se incluye un hash autorreferente.
