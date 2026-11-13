# REL046 · Candidata aislada y revisión de integración

## Revisión vigente · QA052 F2/F3 · 30/10/2026

Tras aceptar el informe independiente QA052, Codex reabrió esta reserva para corregir su hallazgo F2 y la mejora F3. Los apartados posteriores de iteraciones 4/5 son evidencia histórica; sus pendientes y cifras no describen el estado vigente.

- **F2:** se retira la lista de extensiones de activos públicos. Todos los archivos públicos regulares admisibles se capturan, incluidas extensiones arbitrarias, mayúsculas y archivos sin extensión. Las exclusiones por ruta oculta/salida constan en excludedPublicPaths, generan bloqueo PUBLIC_PATH_EXCLUDED y publicAssetCoverage.complete:false. Se cotejan entradas y exclusiones antes y después de compilar. Límites de tamaño/cantidad y rechazo de enlaces conservados.
- **F3:** entorno de hijos con lista permitida del sistema operativo. Se retiran todas las variables arbitrarias, no solo nombres conocidos de proveedores. Los seis bundles esbuild pasan ahora por CLI en el mismo runner saneado que typecheck, Vite y Node. No equivale a un sandbox hermético.
- **ASSETS057:** 3/3 regresiones mecánicas propias. La misma suite sobre la versión anterior exacta bd3d8388 produce 1 éxito y 2 fallos causales: activos omitidos y entorno heredado. Fuentes de Claude intactas; detalle y límites en CODEX-ASSETS-057.md.

**Candidata real nueva:** tests/.tmp/release-candidates/candidate-c3b1e6d5-9907-4358-8ad9-0b3ef065ee71. Captura 270 fuentes y produce 23 artefactos. Typecheck, Vite, seis bundles, cotejo byte a byte de diez activos públicos y 162/162 pruebas Node correctos, sin skips/TODO. snapshotStable y liveSourcesStillMatch:true al terminar. Estado compiled-and-node-verified; approved/deployed/releaseEligible:false. Incluye búsqueda SEARCH053, exportación EXPORT054 y recuperación INTEGRITY055. Los E2E de las unidades se probaron en sus propios snapshots: no se atribuyen a esta candidata integrada sin ejecución adicional.

Manifiesto y logs separados por candidata. Bloqueos por fuentes aún reservadas y E2E/revisión visual pendiente conservados: ningún verde elimina revisiones o acredita instalación. QA056 tiene encargo independiente para contrastar los hashes finales de F1/F2/F3. REL033 mantiene su propia reserva y sus observaciones de parser: no se corrigió ni se utilizó como preflight aprobado.

Hash del script comprobado en esta candidata: 34886dad490f3fafbf0f61c9c03c049dcf0b00fcff830002aec6ea308eb05778. La revisión se presenta sin autoaceptación, despliegue, dependencia nueva, proveedor, build/dist raíz, commit o push.

---

30/10/2026, Europe/Madrid. Codex. Petición: revisar las entregas, preparar una actualización comprobable y respetar las reservas de las dos sesiones Claude. **Fuentes compiladas y probadas; ninguna instalación actualizada por esta sesión. No está todo pendiente cerrado.**

## Resultado reproducible

`node scripts/prepare-release-candidate.mjs` y `--help` solo muestran ayuda. `--prepare` crea una carpeta UUID nueva bajo `tests/.tmp/release-candidates`, captura fuentes permitidas con SHA-256, comprueba que no cambiaron durante la captura y compila allí. No sobrescribe build/dist de raíz, instalaciones, bases, credenciales o sesiones; no reinicia servicios.

La herramienta limita rutas/extensiones/tamaño, rechaza enlaces, retira variables de proveedores del entorno de subprocesos y usa block-external. Captura código de src/shared/server/scripts/tests, los activos públicos admitidos y cinco archivos raíz. No es una imagen completa de instalación ni incluye dependencias. Registra los encargos que todavía reservan fuentes: un build verde conserva approved:false, deployed:false y releaseEligible:false.

Se verificaron typecheck completo, Vite, seis bundles Node (server, runtime, drill, team, copilot-worker y pilot-alias), copia byte a byte de activos públicos y diez archivos de pruebas Node. Cada candidata correcta contiene **243 fuentes y 23 artefactos** con hashes en su manifiesto.

## Versiones y resultados propios

| Snapshot aislado | Validación | Alcance |
| --- | --- | --- |
| candidate-da6b0c9c-916f-4785-a351-b948e7e661e4 | Typecheck/build;162/162 Node;33/33 QA045;3/3 iniciador;32/32 navegador +1/1 navegación;1/1 smoke HTTP compilado | UX038 iteración4. Es anterior a los dos cambios de iteración5. |
| candidate-930ea988-d863-4a9d-a821-03e8a3754f8d | Typecheck/build;162/162 Node;18/18 navegador | UX038 iteración5. Repite diseño, selector, Empresa y navegación CRM/piloto tras el delta CSS. |

Rutas relativas a `tests/.tmp/release-candidates/`. Los resultados de ambas versiones se conservan separados; no sumar ejecuciones repetidas como pruebas distintas ni atribuir a la segunda todos los recorridos de la primera. Ninguna batería tuvo TODO, skipped o flaky. No se ejecutó npm test completo ni un lector de pantalla real u otro motor de navegador.

Hashes UX038 comprobados:

- Iteración4 CSS: `438d02ce6340031296d39bbe7d28a514b0c7e1c0350d2d8052ff96ec064162b4`; E2E: `83a021a419c7d62c5f7c809833ba4d4605e232eb6023dbe9a68736cf53c1cb0d`.
- Iteración5 CSS: `0e7563e4115db7135b2b7c6aa5c81126a5eccf31180d9dd3cce19d000780a943`; E2E: `8670cf9da448a05c1a3c5402a893b507fd5b377c96b9e9f11a97cc9d18e997d2`.
- QA045: `71f40c65e13a67935f7972df8d7c2a95e0ada56e066cace65cac427e1f3ff50f`.

## Qué se comprobó en navegador y HTTP

Chromium headless ya instalado, sin perfiles personales, un trabajador y ejecuciones seriales. Solo servidores fixture nuevos **127.0.0.1:4377/4381**, NODE_ENV=test, demo y carpetas de datos nuevas por recorrido. Sin solicitudes a los servicios reales4331/4334 o proveedores. Las URLs reales usadas como destino de los enlaces se interceptan en el test.

- Seis secciones del piloto, densidad y ausencia de desbordamiento de página a1440/1024/390/320; selector de44px también en escritorio con puntero fino, teclado, identidad por ID y1200 contactos.
- Empresa: cuatro entidades, búsqueda, cambio de espacio sin filtración, menú móvil, salida a Comercial, recarga y errores de consola/red/escrituras vigilados. Capturas desktop y320 inspeccionadas visualmente en ambas versiones.
- Comercial, documentos y Picker ficticio, propuestas/borradores, caducidad de revisión y bloqueo tras revocar sesión en los recorridos de la candidata iteración4. Esas pruebas no autorizan Google real.
- CRM completo: seis apartados y logos servidos, cuatro entidades, ida/vuelta al piloto, cancelación/confirmación ante borrador sin guardar, móvil y escritorio. Repetido con iteración5.
- Smoke sobre el backend compilado: importa/genera/activa fixture nuevo; radar200 con captura activa; segunda captura, comparador200 con un contacto cambiado; radar sigue ligado a la primera activa. No confunde candidata con copia activa.

Copias temporales de E2E conservaron sus aserciones: solo puertos locales; en cuatro recorridos antiguos, entrada `/team?view=records` en lugar de `/team` porque ahora Empresa es la pantalla inicial. La navegación completa adapta origen esperado/interceptado al puerto fixture. Fuentes de Claude intactas.

## Dictamen UX038 iteración5

Revisados informe `CLAUDE-UX-037.md`, delta CSS/E2E y coincidencia de los archivos presentados con sus hashes. Respecto al snapshot iteración4 solo cambian dos fuentes compiladas: planb-ui.css y ui-redesign.spec.ts. Los18 recorridos propios pasan sobre build nuevo: mantiene corrección44px y tarjeta de servicio, teclado y recorridos CRM; la nueva identidad visual conserva el funcionamiento y el responsive. No hay hallazgo bloqueante en esta versión comprobada. Tras cotejar de nuevo los20 hashes presentados y los fuentes del snapshot se aceptó UX038 como done. Una modificación posterior exige nueva revisión.

La declaración del autor de que iteración4 fue desplegada pertenece a su informe/otra sesión. No se verificó aquí ese runtime servido y no se atribuye ese despliegue a REL046. Iteración5 comprobada en fixture no significa instalada.

## Evidencia conservada

- Logs por candidata: `logs/typecheck.log`, `vite.log`, `node-integration.log`; primer snapshot correcto también `qa045.log`, `launcher.log`, `e2e-main-approved.log`, `e2e-navigation-approved.log` y `compiled-api-approved.log`.
- Segundo snapshot correcto: `logs/e2e-iteration5-approved.log`.
- Evidencia visual/JSON: `C:/Users/iresh/.codex/visualizations/2026/10/29/01a1896e-06ff-7690-9644-4f6de90c2826/rel046/`.
- Resultados separados: `main/results.json`32; `navigation/results.json`1; `compiled-api-results.json`1; `iteration5/results.json`18. Capturas `company-home-1440.png`, `company-home-320.png` y `crm-completo-trabajar.png` en sus respectivos grupos.

## Incidencias del arnés y preparación

Primera candidata candidate-17256eef-38b6-4e4e-a9cc-98d642e5fcd8 compiló, pero el filtro propio omitía HTML/JSON/PNG públicos. Se detectó antes de instalar, se corrigió solo la herramienta de REL046 y se marcó superseded-incomplete-public-assets. Las candidatas posteriores cotejan todos los activos públicos capturados contra dist. No fue un defecto de Claude.

Primer arranque fixture restringido produjo EACCES en loopback; se terminó exclusivamente el árbol de procesos de ese arnés identificado por su ruta y se repitió con permiso de ejecución. Otro intento de navegación falló por expectativa del puerto real frente al fixture: corregida solo la copia temporal y repetida. Un reporter reutilizado se separó y la navegación se volvió a ejecutar para preservar su JSON. Se conservan logs de incidencias; no se ocultaron fallos cambiando aserciones de producto. Los procesos fixture finalizaron con Playwright.

## Retorno preparado y pendientes

Respaldo **solo de código/estáticos** de las instalaciones independientes actuales:19 archivos CRM y17 piloto bajo `candidate-da6.../rollback-artifacts/{crm,pilot}`, con manifiesto de hashes. No contiene bases, claves, sesiones o configuración local. Es provisional: otra sesión puede publicar después; recotejar y respaldar el baseline vigente inmediatamente antes de cualquier instalación futura. Los hashes de disco no acreditan el código ya cargado en un proceso.

UX032 conserva su reserva working: falta abrir la lista en la precondición de su regresión nº13 y presentar. REL033 sigue reservado con parser pendiente. LAB035/BACKUP041 y las nuevas herramientas/documentos tienen revisiones propias pendientes. No se autoaceptan para limpiar cola. OPS039/DIFF040/TEXT044/QA045 y UI028/UI031 fueron contrastadas y aceptadas por sus evidencias específicas.

**Siguiente:** autorUX032 presenta su corrección; resolver/revisar las demás fuentes necesarias antes de etiquetar candidata como instalable. Rehacer candidata si cambia la fuente, comprobar respaldo actual y separar instalación/verificación servida en unidad concreta. Mega prompt y alcance siguiente en `coordination/briefs/CLAUDE-MEGA-047.md`; OPS048 espera dependencias aceptadas. Cero cambios en fuentes reservadas ajenas, publicación, commit o push por esta sesión.


## R3 · Inventario de fuentes y herramientas · 31/10/2026, 15:10:36, Europe/Madrid

Cerrado O1 deQA056 en el builder: sourceSelection con raíces/archivos de raíz/exclusiones motivadas y repositoryImage:false; tools de código y HTML incluidos. data privado se excluye sin recorrer; public/data sigue capturado. Estabilidad compara también inventario de exclusiones y los auxiliares omitidos producen bloqueos explícitos. No se afirma imagen íntegra del repositorio o copia de dependencias. API de selección importable sin ejecutar CLI.

13/13focales y dos regresiones ante versión anterior fallidas por su causa. Candidata finaltests/.tmp/release-candidates/candidate-dcfb83d9-f72c-4f8f-872c-8f124530b8f5:350fuentes/23artefactos, typecheck/Vite/seis bundles/162Node correctos, fuentes estables.38/38REL033desde snapshot sin añadir tools a mano.23artefactos idénticos a la app de ensayo083; no UI/E2E repetidos ni reinicio de esa app. Banco histórico QA05617/18en corte intermedio:O1exigía omisión silenciosa y ahora falla; ese test se revalida en nuevaQA086, no se altera aquí. Fuentes e informe detallado en CODEX-SNAPSHOT-084.md, con incidencias/cortes intermedios preservados.

SHA-256 de scripts/prepare-release-candidate.mjs probado: **b026f0ddd9f0ad729ff7eba8c2d1f1bd4fbd0e467695c9c566407ed90ebb5b2b**. El hash del informe lo sella submit. No aceptación propia, publicación, proveedor o instalación anterior.


## R1/O2 · Corte final 31/10/2026, 16:16:55, Europe/Madrid

O2 deQA086 corregido con clasificación de nombres sin distinguir mayúsculas. Conserva rutas originales y excepción public/data.5regresiones nuevas y18focales correctos;3falloscausalesanteb026. No modifica oráculosClaude;QA086 se devuelve para R2, compilación real y skip explícito.

Detalle transversal en CODEX-RECOVERY-INTEGRITY-087.md, CODEX-SOURCE-CASE-089.md y CODEX-RECOVERY-BOOT-090.md.

Candidata final: tests/.tmp/release-candidates/candidate-42c5f15c-99a2-4f4d-bd96-275f84c47f0f;357 fuentes/23 artefactos, snapshotStable:true y liveSourcesStillMatch:true al cierre de la captura. Typecheck,Vite,seis bundles,activos públicos y162 pruebas Node correctos. Sigue approved/deployed/releaseEligible:false por revisiones y exclusiones declaradas. No es imagen íntegra del repositorio ni reconstrucción en máquina limpia. Dependencias existentes, sin nuevas instalaciones.

Los116 focales y24E2E se ejecutaron contra candidate-d4cc1c48-2201-48d9-94de-2bab0fb2faf0. El cierre final conserva todas las fuentes R1 de negocio/UI y21/23 artefactos idénticos; solo server.mjs/runtime.mjs cambian por las condiciones de arranque. Tres pruebas de arranque adicionales pasan contra fuentes finales y contra ambos ejecutables finales. Detalle de comparación y logs en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/final091-36a2d7eb-c634-49c3-8443-c8481cbf2d5d. No se suman repeticiones como pruebas únicas.

La app abierta PREVIEW083 en4420/4421 conserva sus artefactos anteriores: no incluye automáticamente R1. Ambos health200 comprobados en esta continuación. No se reemplazó/reinició esa vista, no instalaciones4331/4334, equipo original, proveedores, cuentas, claves, build/dist raíz, commit/push o despliegue. Fuentes para revisión independiente; no autoaceptación.

### Hashes que sustituyen las versiones previas para esta revisión

- scripts/prepare-release-candidate.mjs: `ae74ce22ea6a2ed14cc78f1b5735c763b937aa1a7199f9875764eba9a0ef2935`

El informe lo sella submit.

## Raíz pública enlazada con destino ausente · 9/11/2026

La continuación de QA052 reprodujo una pérdida de activos que el inventario no declaraba. Una junction `public` cuyo destino no existe da `existsSync=false` aunque la entrada esté presente y `lstat` la identifique como enlace. El constructor anterior `ae74ce22…` omitía toda la raíz antes de aplicar su rechazo de enlaces. En el banco CLI sintético completó los diez checks y registró `publicAssetCoverage` con `captured:0`, `excluded:0` y `complete:true`. Los indicadores de aprobación y elegibilidad seguían en false.

El constructor inspecciona ahora la entrada con `lstat` antes de decidir si falta. Una raíz realmente ausente conserva el comportamiento opcional. Los enlaces presentes se rechazan incluso cuando su destino falta. Los demás errores de inspección se propagan. La candidata del caso queda en `incomplete` antes de compilar, con cero checks y el motivo «No se capturan fuentes enlazadas».

La regresión CLI de ASSETS057 falla con el constructor anterior en `tests/.tmp/qa052-link-baseline-4K6yJS` y pasa con la corrección en `tests/.tmp/qa052-link-corrected-1AsrfA`. El banco final pasa las cuatro pruebas de activos y entorno. El inventario antes y después sobre las fuentes congeladas de Jornada299 coincide en las 308 entradas seleccionadas y sus diez activos públicos. Esa comprobación es de selección y el banco CLI usa un proyecto sintético.

El hash presentado del constructor es `9719765673729c44cad2318969995d22e5506d968ab4e2efe586d46a0b292731`. La evidencia QA086 de la candidata real pertenece a `ae74ce22…`. La versión nueva se presenta con la regresión específica y sus controles. La revisión independiente sigue pendiente.
