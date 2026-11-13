# CODEX-REHEARSAL-ISOLATION-077 · Workspaces privados para pruebas de recuperación

Autor Codex. Helper de pruebas, no cambio del destino permitido por el producto. Copia solo módulos.ts/.mjs/.cjs de server/shared y dos scripts concretos bajo UUID nuevo; genera package privado type:module. Rechaza enlaces/tamaños>2MB; no copia JSONconfig, bases,.env,.ai,claves o node_modules. No instala dependencias ni elimina archivos. Las fuentes se resuelven con dependencias ya disponibles por ancestros.

RESTORE050 integra helper en sus dos tests. Ejecución final real paralela **18/18** (9propias+9Claude) sin --test-concurrency=1: tests/.tmp/fixes076-078-10797dfb-43ab-4b6a-8e79-ed37af3a5510/parallel-restoration.log. La versión original075reproduce7pass/2fail; primer intento del arnésnuevo15pass/3fail por ruta evidenceFile relativa mal resuelta, preservado. No se afirma que un éxito casual elimine cualquier carrera posible:079debe añadir control adverso concurrente.

## Verificación integrada propia · 31/10/2026, 14:32:45, Europe/Madrid

Candidata aislada **tests/.tmp/release-candidates/candidate-5e94390e-745e-40e1-ac1f-d412eaf4672f**,329fuentes,23artefactos: typecheck, Vite, seis bundles Node, public-assets y162pruebas Node correctos. approved:false/deployed:false/releaseEligible:false; conserva bloqueos de fuentes sin aceptar. No es una instalación o aceptación de las unidades. Todos los hashes de fuente se recotejaron antes de esta presentación.

Banco focal propio del snapshot: **82/82**, sin fallos/TODO/skip (tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/focal.log). Navegador: **29casos únicos correctos** repartidos en dos ejecuciones del mismo snapshot: activación6, manual6, historial3 e inspector8 en tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/browser-results.json, y búsqueda6 en tests/.tmp/final079-8a4e0c8e-ae18-44b0-aa37-b59b0b7abd12/evidence/browser-results.json. El primer arranque omitió la fixture de búsqueda: sus6fallos se conservaron; se corrigió solo el arnés y se repitió solo esa suite con datos ficticios nuevos. No se convierten los fallos iniciales en éxitos ni se suman reejecuciones como casos nuevos.

Browser plugin not available: PlaywrightCLI existente con Chromium headless-shell1228 propio, workers1, servidores nuevos4391/4401/4404/4406/4410, allowlist de entorno y bloqueo de red externa. Capturas1440/390/320; inspeccionadas visualmente las de inspector1440/320 y activación320. Controles44px medidos en navegador. Sin Edge, lector de pantalla, instalación4331/4334, datos reales, proveedor, dependencias, build/dist raíz, deploy, commit/push o acceso corporativo.

QA060/QA073 permanecen informes históricos aceptados como auditoría con hallazgos; no se reescribieron sus fuentes de pruebas/informes. La revalidación independiente nueva079 debe retirar TODO solo con causa y actualizar su caracterización H9 (búsqueda sin fechas implícitas). No se declara toda la batería del proyecto verde. AUTH_PARENT072 permanece pendiente y App.tsx no se modificó durante estas correcciones.


## Hashes de esta presentación (sustituyen tablas anteriores)

- tests/helpers/rehearsal-workspace.ts: `ff20f88e4d44c75f63e1d7ca6d845ce7c372032910bad07c6bc299b3830bd8c7`

El hash del informe lo registra submit. No autoaceptación.
