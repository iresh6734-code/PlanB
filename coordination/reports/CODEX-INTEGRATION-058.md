# INTEGRATION058 · Recuperación, búsqueda y exportación del runtime compilado

30/10/2026, Europe/Madrid. Codex. **Dos E2E integrados nuevos y dos recorridos existentes afectados correctos, con typecheck del snapshot final.** No instalación, certificación completa de release o autoaceptación de fuentes.

## Qué se comprobó

Se utiliza la candidata exacta `candidate-c3b1e6d5-9907-4358-8ad9-0b3ef065ee71`, compilada en REL046 tras SEARCH053/EXPORT054/INTEGRITY055. El test opt-in exige PLANB_INTEGRATED_CANDIDATE con un ID de candidata aislada; no acepta una ruta de instalación o base. Verifica inventario acotado, estado de compilación y SHA-256 de cada artefacto antes de copiarlo a una carpeta UUID nueva. Al terminar recoteja los bytes tanto del origen como de la copia ejecutada.

Se ejecuta **runtime.mjs compilado**, sin recompilar un backend fixture alternativo. Los únicos datos de inicio son un sobre cifrado ficticio recién generado y contraseñas sintéticas del test. La restauración atraviesa el formulario de archivo/contraseña y la API protegida del runtime. Windows crea únicamente las claves de protección de esas carpetas nuevas. No se accede a bases, claves o perfiles anteriores.

1. **Copia normal:** contraseña de recuperación errónea rechazada sin activar datos; restauración correcta conserva revisión. Búsqueda con acentos/mayúsculas resuelve dos homónimos por ID. Se abre contact-2, se comprueba su teléfono y se edita por el drawer. La descarga permanece bloqueada hasta revisar contenido; se descarga un archivo cifrado real, se descifra y coteja revisión, valores e historial. Se detiene ese proceso Node propio y se arranca otro sobre la misma SQLite ficticia: la sesión anterior obtiene 401, el login nuevo permite comprobar misma revisión e historial, y búsqueda API/UI encuentra el teléfono editado. Dos PID distintos registrados.
2. **Copia con incertidumbre:** plan guardado complete y operación sending. Tras restaurar, plan partial, approvedAt:null, exactamente una uncertain y ningún sending. Se conserva el historial y la API rechaza editar con 409. La exportación cifrada también contiene el estado incierto, sin inventar resultado remoto. Tras detener y arrancar otro proceso propio, plan e historial son iguales y el bloqueo 409 permanece; las lecturas siguen disponibles. No se invoca un remoto real para resolver el estado.
3. **Dos recorridos anteriores afectados:** continuity.spec.ts y v4.spec.ts incorporan únicamente el acto explícito de marcar la nueva casilla antes de descargar. Todas sus aserciones anteriores se conservan. Se repiten los casos de exportación/restauración con contraseña errónea y revisión/custodia tras edición sobre server.mjs compilado, con fixture nuevo. Ambos pasan.

La vigilancia de navegador registra cero pageerror y cero solicitudes fuera del origen fixture. Node usa block-external; los hijos runtime reciben una lista permitida de variables del SO y ajustes ficticios propios. Es un control del arnés, no un sandbox hermético. Puertos explícitos 127.0.0.1:4393/4394; si están ocupados no se reutiliza ni detiene un servicio ajeno. Los procesos se detienen por su objeto ChildProcess propio, no por nombre o barrido de puertos. No borrado recursivo: se conservan logs y datos de ensayo.

## Evidencias y resultados propios

Preparación congelada en `tests/.tmp/integration058-17bbfc57-0e8c-4816-9dd4-048f4cddb115`. Su manifest.json registra candidata, hash de su manifiesto y hashes de los tres tests. Copias de fuentes del snapshot original verificadas antes de preparar; tres tests propios sobreescritos con la revisión declarada. Dependencias locales existentes, sin instalación. La candidata original no se altera.

- integrated-browser.log: **2/2**, 28.8 s; sin skipped/flaky. Resultado JSON independiente.
- browser.log: **2/2 anteriores**, 11.9 s; sin skipped/flaky. Resultado JSON en subcarpeta legacy, sin sobrescribir el integrado.
- typecheck.log: typecheck completo del snapshot preparado, sin errores.
- Ejecución de navegador: node tests/.tmp/integration058-browser.cjs, Chromium headless de caché local y perfil temporal propio; un trabajador. Segundo grupo seleccionado por PLANB_058_GREP. El primer filtro anclado seleccionó solo los dos casos nuevos; se corrigió el filtro del arnés para ejecutar los dos antiguos por separado, sin relajar ninguna aserción.

Evidencia visual/JSON: `C:/Users/iresh/.codex/visualizations/2026/10/29/01a1896e-06ff-7690-9644-4f6de90c2826/integration058/integration058-17bbfc57-0e8c-4816-9dd4-048f4cddb115/`. results.json contiene dos integrados; legacy/results.json contiene dos anteriores. Attachments isolated-processes documentan carpeta/PID/revisión. Captura integrated058-after-restart.png inspeccionada: diálogo de búsqueda legible, registro correcto y datos de ensayo identificados. Descarga ficticia conservada en evidencia.

Carpetas de los runtimes nuevos bajo tests/.tmp/integrated058/run-UUID. El generador fixture separado vive en generator-root dentro de la preparación; solo main/server compilado sin configuración externa. Las cuentas, credenciales y datos reales están fuera de alcance.

## Límites y siguiente paso

Estas cuatro pruebas combinan los cambios nuevos y recuperan los dos contratos de exportación afectados. No equivalen a repetir todas las suites E2E, validar otro motor/lector de pantalla, medir un RTO comercial o acreditar el piloto instalado. Los blockers y approved/deployed/releaseEligible:false del manifiesto original se conservan: INTEGRITY055/REL046/ASSETS057 esperan QA056 y las demás fuentes reservadas tienen sus dictámenes propios. REL033 permanece intacta.

Cuatro archivos exactos de esta reserva: test integrado nuevo, los dos E2E existentes y este informe. Ninguna modificación en las fuentes de Claude o en las unidades de código congeladas. Sin proveedor, instalación, build/dist raíz, dependencia nueva, commit/push o autoaceptación. Siguiente: contrastar QA056 sobre hashes presentados; preparar una revisión independiente separada de SEARCH053/EXPORT054/RESTORE050 antes de cualquier etiqueta de release.

## Hashes de tests cotejados

- tests/e2e/integrated-recovery.spec.ts: bb80e282591030e978097d9d80ee520f1ea609f0818af6dd3b9f4b217e4d9f1e
- tests/e2e/continuity.spec.ts: 910243092995ac94eb7ff06cc08a94a2e82662393e3f2cbdef42e52bc7661e7b
- tests/e2e/v4.spec.ts: cc4e8ea687ffe575ad9160052c148d3a35d128a78d32ee96301539e2b89655e0

El hash del informe lo registra submit.
