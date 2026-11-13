# RESTORE050 · Recuperación por API y persistencia entre procesos

30/10/2026, Europe/Madrid. Codex. Nueva fase solicitada por el usuario mientras Opus corrige OPS048; durante la ejecución el usuario pidió un encargo largo para Opus y continuar después esta fase. **Ensayo implementado y ejecutado con SQLite nueva:9/9 pruebas y typecheck correctos. Fuente pendiente de revisión; sin actualización de una instalación.**

## Resultado concreto

La CLI genera una copia portátil cifrada con datos ficticios nuevos y un cambio local. El orquestador valida el contenido y crea una carpeta UUID nueva bajo tests/.tmp/recovery-rehearsals. Un primer proceso configura una contraseña efímera local del ensayo, restaura mediante POST /api/v2/restore y ejecuta operaciones reales por Fastify.inject; después cierra la app y termina. Un segundo proceso abre la misma base nueva, vuelve a autenticarse y comprueba revisión, registros, historial y pendientes persistidos.

Los procesos no abren listeners ni navegador. Se usa runtime:true, block-external, entorno de hijos saneado y windowsHide. No se invocan conectores. En Windows la base nueva usa protección local nueva del usuario actual mediante Store, sin leer claves/perfiles/instalaciones existentes. El JSON del informe no contiene contraseña, cookie, claves o valores/IDs de fichas.

Operaciones del ensayo: buscar/editar un cliente y verificar el resultado, avanzar una oportunidad, crear una tarea y completarla; **cuatro entradas nuevas en historial**. La copia demo empieza con62registros/1cambio y el resultado persistido conserva63registros/5cambios/5pendientes. Se coteja la revisión completa de trabajo después del reinicio, no solo esas cifras.

También se comprueban sesión requerida, guardas Host/Origin, probe local y bloqueo explícito de sesión. La revisión esperada al restaurar se calcula con el contrato real que retira aprobaciones y normaliza envíos inciertos; se conserva distinta de la revisión original cuando corresponde. Un envío incierto impide completar el flujo local y el informe falla, sin presentarlo como recuperación correcta.

## Uso y límites de entrada

```powershell
node --require ./scripts/block-external.cjs --import tsx scripts/rehearse-portable-recovery.ts --run-fixture
```

Sin argumentos o con --help: solo ayuda. El único modo de ejecución CLI es --run-fixture; no admite rutas de entrada/salida, contraseñas o una base existente. Passwords efímeras solo por stdin interno de subprocesos, nunca argv/env/informe. Código0 ensayo superado,1 no superado,2 uso/preparación incorrectos.

La función de módulo admite bytes JSON portátiles ficticios hasta2MiB para las pruebas y no recibe rutas de base. Rechaza origen distinto de fixture o clase real antes de crear carpeta. El worker también verifica el alcance directamente y rechaza rutas que no sean una carpeta UUID del scratch fijo, enlaces y reapertura de una base en la fase inicial. Resume solo abre la base del ensayo anterior. No hay borrado recursivo, sobreescritura o limpieza de carpetas ajenas.

Los informes y bases ficticias quedan conservados en cada run. No exportar datos o claves de esas bases como evidencia pública; basta report.json, que solo contiene hashes, checks, PIDs, contadores y duración. Un informe de éxito se escribe con flag wx y la escritura fallida impide declarar éxito del artefacto de evidencia.

## Verificación propia

Snapshot final: `tests/.tmp/restore050-final-c57de8c2-01e9-42d1-b0e8-1d5b28fbeadd`. Manifest.json identifica cada fuente; results.json, rehearsal.log y typecheck.log conservan resultados. Los datos de sus tests quedan bajo source/tests/.tmp/recovery-rehearsals.

- **9/9** nuevas:7 de módulo/worker y2 de CLI real, sinTODO/skips. Tests seriales; procesos de cada ensayo también seriales, sin ocupar navegador o puertos.
- **Typecheck completo del snapshot correcto.** No se ejecutó npm test completo ni build de raíz.
- Positivo cifrado: dos PIDs distintos, restauración por API protegida, cuatro operaciones, fingerprint/recuentos idénticos al reiniciar; fuente Store intacta y reporte sin canarios.
- Negativos: formato/descifrado/integridad/tamaño, contraseña incorrecta y origen/cuenta/clase fuera de alcance; sin carpeta o base nueva para entradas rechazadas por el orquestador.
- Aprobación remota retirada correctamente antes de calcular revisión esperada; source Store conserva su aprobación. Operación sending exportada se normaliza a incierta y bloquea el trabajo: resultado failed conservado.
- Worker directo rechaza ruta arbitraria y origen de proveedor incluso en carpeta permitida, antes de crear base/clave. CLI ayuda/argumentos incorrectos no inicia ensayo ni refleja rutas/contraseñas.

Smoke inicial real: run-b6ffa71b-ea28-436d-954f-9ee6a4d94c68, pasado en6857ms con PIDs680/29724 y63registros/5cambios después del reinicio. Es anterior al refuerzo del worker; la suite final9 vuelve a ejecutar todos los positivos sobre la versión definitiva. Primera suite8/8 correcta, luego nueva guarda y caso directo; suite final9/9. No sumar repeticiones como casos únicos. El tiempo medido pertenece a este ordenador/ejecución, no a un RTO prometido.

## Interrupción útil: cierre OPS048 y mega encargo Opus

Se atendió el nuevo mensaje del usuario sin abandonar RESTORE050. OPS048R2 revisada por Codex:109/109 focales propias, typecheck y sensibilidad independiente contra componente anterior10pass/4fail. Seis hashes cotejados;5E2E del bloque del autor cotejados en JSON y8continuity atribuidos al autor, sin nuevo navegador propio. OPS048 aceptada como done; no instalación acreditada. Revisión en coordination/reviews/CLAUDE-OPS-048-r2-codex.md.

Preparado y entregado al usuario mega prompt extenso coordination/briefs/CLAUDE-MEGA-QA-052.md: auditoría adversa y generativa de BACKUP041/SAFE049/REL046, cuatro archivos exactos, sin editar fuentes revisadas o RESTORE050. QA052 registrada y observada working después; no implica control automático de la sesión de Claude o envío por la CLI. PLAN051 presentado para revisión propia, sin autoaceptación.

## Estado de entrega

Siete archivos propios de RESTORE050; disjuntos de reservas Opus/QA052. Memoria/panel bajo LAB035 solo documental, motor/demo/tests anteriores intactos. Plan concreto coordination/plans/ENSAYO-RECUPERACION-050.md. Se presenta para revisión, no se autoacepta.

La prueba es API de fuente sobre este ordenador: no prueba UI, paquete compilado/instalado, recuperación en otro equipo, datos reales o RPO/RTO de negocio. No bases/cuentas/credenciales corporativas, servicios4331/4334, proveedores, correos, dependencias, build/dist raíz, despliegue, commit o push. Las nuevas carpetas contienen exclusivamente datos ficticios del ensayo.

## Hashes de fuentes presentadas

- server/recovery-rehearsal.ts: e8873f5522703a1a5f1cd4704ee62feec517df3a9b8357c1e9296008a3fd6e3e
- server/recovery-rehearsal-worker.ts: 755f25306a6a9abe8ea34c8555b917a23c4cc3d748f9f0234ff72d7f2d7c68a4
- scripts/rehearse-portable-recovery.ts: 1e3754eefe294d8556a722ec0aaa702f126f608002696ee1fc02c91b1f4e5b3d
- tests/recovery-rehearsal.test.ts: e78ebdd986261c6e38227580173f647deb76ad50aea62c5a1d3be76fbc627da2
- tests/recovery-rehearsal-cli.test.ts: 759dc6080202a43fbe2e5c6249edeba8d9092db0674bf599f14aa90e334da700


## R2 · Interferencia paralela QA060 F4

No se cambian producto/worker/CLI. Los dos ficheros de tests usan ahora workspaces de fuentes privados, uno por fichero, mediante helper077. Sus aserciones siguen exigiendo IDs/archivos propios exactos; no cuentan carpetas compartidas ni se serializan. El evidenceFile del producto es relativo al módulo del workspace: el primer arnés nuevo lo resolvió contra la raíz anterior y produjo15pass/3fail; se corrigió solo la resolución de pruebas y se conservó ese intento. Ejecución final **18/18** en paralelo (9propias+9independientes), log tests/.tmp/fixes076-078-10797dfb-43ab-4b6a-8e79-ed37af3a5510/parallel-restoration.log. Antes, snapshot075con los dos ficheros originales reproducía7pass/2fail por interferencia. No se borran carpetas, no se debilita el destino del producto.

## Verificación integrada propia · 31/10/2026, 14:32:45, Europe/Madrid

Candidata aislada **tests/.tmp/release-candidates/candidate-5e94390e-745e-40e1-ac1f-d412eaf4672f**,329fuentes,23artefactos: typecheck, Vite, seis bundles Node, public-assets y162pruebas Node correctos. approved:false/deployed:false/releaseEligible:false; conserva bloqueos de fuentes sin aceptar. No es una instalación o aceptación de las unidades. Todos los hashes de fuente se recotejaron antes de esta presentación.

Banco focal propio del snapshot: **82/82**, sin fallos/TODO/skip (tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/focal.log). Navegador: **29casos únicos correctos** repartidos en dos ejecuciones del mismo snapshot: activación6, manual6, historial3 e inspector8 en tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/browser-results.json, y búsqueda6 en tests/.tmp/final079-8a4e0c8e-ae18-44b0-aa37-b59b0b7abd12/evidence/browser-results.json. El primer arranque omitió la fixture de búsqueda: sus6fallos se conservaron; se corrigió solo el arnés y se repitió solo esa suite con datos ficticios nuevos. No se convierten los fallos iniciales en éxitos ni se suman reejecuciones como casos nuevos.

Browser plugin not available: PlaywrightCLI existente con Chromium headless-shell1228 propio, workers1, servidores nuevos4391/4401/4404/4406/4410, allowlist de entorno y bloqueo de red externa. Capturas1440/390/320; inspeccionadas visualmente las de inspector1440/320 y activación320. Controles44px medidos en navegador. Sin Edge, lector de pantalla, instalación4331/4334, datos reales, proveedor, dependencias, build/dist raíz, deploy, commit/push o acceso corporativo.

QA060/QA073 permanecen informes históricos aceptados como auditoría con hallazgos; no se reescribieron sus fuentes de pruebas/informes. La revalidación independiente nueva079 debe retirar TODO solo con causa y actualizar su caracterización H9 (búsqueda sin fechas implícitas). No se declara toda la batería del proyecto verde. AUTH_PARENT072 permanece pendiente y App.tsx no se modificó durante estas correcciones.


## Hashes de esta presentación (sustituyen tablas anteriores)

- server/recovery-rehearsal.ts: `e8873f5522703a1a5f1cd4704ee62feec517df3a9b8357c1e9296008a3fd6e3e`
- server/recovery-rehearsal-worker.ts: `755f25306a6a9abe8ea34c8555b917a23c4cc3d748f9f0234ff72d7f2d7c68a4`
- scripts/rehearse-portable-recovery.ts: `1e3754eefe294d8556a722ec0aaa702f126f608002696ee1fc02c91b1f4e5b3d`
- tests/recovery-rehearsal.test.ts: `64178dcc2f769237861270000f1951257cd8b13c8748d7b2cb82d15c7b48afe5`
- tests/recovery-rehearsal-cli.test.ts: `0026127d178752e56e03bdd0dda986e1e0e7de4931afe180809d3ec226449ce1`
- coordination/plans/ENSAYO-RECUPERACION-050.md: `4097586b9a8fca758e086f00298681f3737784f09f0d9a7be3df1d601257fcc8`

El hash del informe lo registra submit. No autoaceptación.
