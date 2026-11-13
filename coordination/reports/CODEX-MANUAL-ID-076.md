# CODEX-MANUAL-ID-076 · Identidad canónica en recuperación manual

Autor Codex. Entrega para revisión independiente079.

QA073M1se reproduce con remoto ficticio que interpreta IDs como números; no se ha llamado al proveedor real ni demostrado su comportamiento con ceros iniciales. Se fija contrato de entrada como texto decimal canónico (0o primer dígito distinto0). IDs>2^53permanecen distintos, sin Number. Se revisan colisiones contra mapeo heredado comparando identidad decimal textual, sin modificarlo automáticamente. Si un mapeo antiguo no canónico está en uso, se rechaza con mensaje y requiere revisión. Un mismo ID entre entidades sigue permitido; dos locales de la misma entidad no pueden compartir destino. Validación ocurre antes del remoto y no cambia watermark/report/map al rechazar.

**4/4propias** en banco82focal:0501/000/00sin llamadas remotas ni estado alterado, IDs9007199254740992/93distintos, colisión heredada y mismoID entre entidades. El primer caso falla ante075 (tests/.tmp/fixes075-baseline-6bceb5d0-deee-4148-8563-542a51128b00/manual-identity.log). Regresión adicional server existente: **10/10 tests/production.test.ts** ejecutados contra snapshot compilable por fuente, incluidos verificación manual, relaciones, concurrencia y exportación; resultado observado en salida de herramienta, no se inventa log completo persistido. UI067acompaña el nuevo contrato.

## Verificación integrada propia · 31/10/2026, 14:32:45, Europe/Madrid

Candidata aislada **tests/.tmp/release-candidates/candidate-5e94390e-745e-40e1-ac1f-d412eaf4672f**,329fuentes,23artefactos: typecheck, Vite, seis bundles Node, public-assets y162pruebas Node correctos. approved:false/deployed:false/releaseEligible:false; conserva bloqueos de fuentes sin aceptar. No es una instalación o aceptación de las unidades. Todos los hashes de fuente se recotejaron antes de esta presentación.

Banco focal propio del snapshot: **82/82**, sin fallos/TODO/skip (tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/focal.log). Navegador: **29casos únicos correctos** repartidos en dos ejecuciones del mismo snapshot: activación6, manual6, historial3 e inspector8 en tests/.tmp/final079-dae7ba5e-9460-4752-8f91-d35809f4ae03/evidence/browser-results.json, y búsqueda6 en tests/.tmp/final079-8a4e0c8e-ae18-44b0-aa37-b59b0b7abd12/evidence/browser-results.json. El primer arranque omitió la fixture de búsqueda: sus6fallos se conservaron; se corrigió solo el arnés y se repitió solo esa suite con datos ficticios nuevos. No se convierten los fallos iniciales en éxitos ni se suman reejecuciones como casos nuevos.

Browser plugin not available: PlaywrightCLI existente con Chromium headless-shell1228 propio, workers1, servidores nuevos4391/4401/4404/4406/4410, allowlist de entorno y bloqueo de red externa. Capturas1440/390/320; inspeccionadas visualmente las de inspector1440/320 y activación320. Controles44px medidos en navegador. Sin Edge, lector de pantalla, instalación4331/4334, datos reales, proveedor, dependencias, build/dist raíz, deploy, commit/push o acceso corporativo.

QA060/QA073 permanecen informes históricos aceptados como auditoría con hallazgos; no se reescribieron sus fuentes de pruebas/informes. La revalidación independiente nueva079 debe retirar TODO solo con causa y actualizar su caracterización H9 (búsqueda sin fechas implícitas). No se declara toda la batería del proyecto verde. AUTH_PARENT072 permanece pendiente y App.tsx no se modificó durante estas correcciones.


## Hashes de esta presentación (sustituyen tablas anteriores)

- server/manual-recovery.ts: `abddf779e8657e9685738470e84d79e63a40a3b02dd799e9ef5c258344ebba2f`
- tests/manual-recovery-id.test.ts: `5aa8138652c6e2ba6873cc5f18256e6df6631f91def5b18f61fdafc06d5400da`

El hash del informe lo registra submit. No autoaceptación.


## R1/O2 · Corte final 31/10/2026, 16:16:55, Europe/Madrid

Guarda de integridad antes/después de cada await remoto y en transacción final. No altera contrato de IDs canónicos o precisión; no guarda marca/mapeo/resultado después de detectar corrupción concurrente.

Detalle transversal en CODEX-RECOVERY-INTEGRITY-087.md, CODEX-SOURCE-CASE-089.md y CODEX-RECOVERY-BOOT-090.md.

Candidata final: tests/.tmp/release-candidates/candidate-42c5f15c-99a2-4f4d-bd96-275f84c47f0f;357 fuentes/23 artefactos, snapshotStable:true y liveSourcesStillMatch:true al cierre de la captura. Typecheck,Vite,seis bundles,activos públicos y162 pruebas Node correctos. Sigue approved/deployed/releaseEligible:false por revisiones y exclusiones declaradas. No es imagen íntegra del repositorio ni reconstrucción en máquina limpia. Dependencias existentes, sin nuevas instalaciones.

Los116 focales y24E2E se ejecutaron contra candidate-d4cc1c48-2201-48d9-94de-2bab0fb2faf0. El cierre final conserva todas las fuentes R1 de negocio/UI y21/23 artefactos idénticos; solo server.mjs/runtime.mjs cambian por las condiciones de arranque. Tres pruebas de arranque adicionales pasan contra fuentes finales y contra ambos ejecutables finales. Detalle de comparación y logs en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/final091-36a2d7eb-c634-49c3-8443-c8481cbf2d5d. No se suman repeticiones como pruebas únicas.

La app abierta PREVIEW083 en4420/4421 conserva sus artefactos anteriores: no incluye automáticamente R1. Ambos health200 comprobados en esta continuación. No se reemplazó/reinició esa vista, no instalaciones4331/4334, equipo original, proveedores, cuentas, claves, build/dist raíz, commit/push o despliegue. Fuentes para revisión independiente; no autoaceptación.

### Hashes que sustituyen las versiones previas para esta revisión

- server/manual-recovery.ts: `762e6ae48882b76ff44b09b2dd0641900e8b8255ef0b4615056e25422626a731`
- tests/manual-recovery-id.test.ts: `5aa8138652c6e2ba6873cc5f18256e6df6631f91def5b18f61fdafc06d5400da`

El informe lo sella submit.
