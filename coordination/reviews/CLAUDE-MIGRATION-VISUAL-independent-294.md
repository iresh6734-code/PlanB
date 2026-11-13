# 294 · R2 favorable del presupuesto y HTML de migraciones

8/11/2026, Europe/Madrid. **Dictamen vigente favorable para la entrega interna R2. F1 cerrado.** Las seis huellas nuevas se cotejaron antes y después. No se modificó ninguna fuente de Claude. La revisión histórica de R1, que requirió R2, queda debajo como evidencia del defecto original.

## Corrección verificada

El codificador trata los delimitadores literales U+2039/U+203A en la misma pasada que los controles/dirección. La notación generada no se vuelve a codificar. El carácter real U+202E y el texto literal ‹U+202E› ya producen representaciones distintas, también cuando el dato contiene notación anidada. Informe/JSON/huellas conservan los originales y no se cambió el emparejamiento ni se eliminó un registro.

Banco propio nuevo `tests/.tmp/migration294-r2-wxyni6`:

- **32/32 Node** de la autora,18,39s; 24 CORE conservadas y8 visuales/presupuesto.
- **4/4 sondas propias originales**,0,66s, con las mismas aserciones que en R1. La regresión que falló por dos IDs visualmente confundibles ahora pasa.
- Tipos focales exit0.
- **4/4 Chromium**,7,1s, sin reintentos u omisiones: coherencia JSON/HTML/SHA Node-browser y18 casos de zonas, geometría/contraste a1440/390/320 claro/oscuro, teclado/estructura y cuatro IDs distintos en el DOM.
- Repetición diagnóstica del par exacto de R1: dos code.textContent distintos, título correcto, cero peticiones externas/errores de página. Captura390 abierta en `C:/Users/iresh/AppData/Local/Temp/planb-review294r2-IUZnx3/ids-r2-390.png` y recibo dom-r2.json. También se abrieron capturas de informe dark1440 y cambios light320 del banco actual.
- Fuentes fijas y seis huellas cotejadas, CIM posterior limitado al banco sin procesos. Browser plugin not available; Playwright del proyecto con Chromium1228 de caché, perfil propio ficticio. El banco se coordinó con el otro chat para no solapar Radar; no se tocó su contexto HubSpot ni terminal de credenciales.

Drivers: prepare-migration294-r2.cjs, review-migration294-r2-node.cjs, review-migration294-r2-browser.cjs y capture-migration294-r2.cjs en tests/.tmp. Node y navegador se ejecutaron por separado sobre el mismo corte fijo; result.json registra ambos. La evidencia causal propia anterior conserva el fallo de R1. Las dos contrapruebas nuevas comunicadas por la autora no se repitieron aquí; sí se repitieron las sondas originales sin debilitarlas.

## Huellas R2 aceptadas

| Ruta | SHA-256 |
| --- | --- |
| `shared/migration-budget.ts` | `2b6b6cda291b669a55f5846dd4548fe1221ef772098f369f8c915e30de2c4892` |
| `shared/migration-report.ts` | `efe6ced3f5aba1bea403157854fc98f4bf6f633fbac5b37b27613e91c418e5a5` |
| `tests/migration-verifier-visual.test.ts` | `42dbca3e7c5155fa66a3757adfb1b2513c06c1841d9c774d5c408a1de05bdd59` |
| `tests/e2e/migration-report-visual.spec.ts` | `4107c21bdcb4b2c7f988c5fc3c91e329948463b91d99b51a6af0cec37379d34c` |
| `coordination/plans/MIGRATION-VERIFIER-UI-HANDOFF.md` | `0e7a8a3070d9ad58847da24a5c81e49144e9813c079046967754b9ac2abb7305` |
| `coordination/reports/CLAUDE-MIGRATION-VERIFIER-VISUAL.md` | `a63a2ea50654f67f5d774edac00886bb42546a6273ff734521db23598785da1a` |

Se acepta el motor/informe/presupuesto internos y la validación de HTML descrita. El handoff sigue siendo una propuesta: no hay carga de ficheros, Worker, confirmación persistida, pantalla en navegación ni endpoint de migraciones. No abre Fase4 por sí sola ni acredita una migración real, lector de pantalla, otros motores de navegador o cuentas de proveedor. App/main/demo no se actualizaron.

---

# Histórico · R1 requirió corrección por IDs ambiguos

8/11/2026, Europe/Madrid. **Devolver para R2 por un hallazgo de presentación de IDs.** Motor interno: no hay pantalla, carga, Worker, endpoint ni menú montados. Las seis fuentes de Claude se conservaron intactas.

## F1 · Dos IDs distintos pueden aparecer iguales (medio, interno)

`shared/migration-report.ts:70` convierte el carácter de dirección U+202E en el texto `‹U+202E›`, pero conserva ese mismo texto cuando ya estaba literalmente en el ID. Las exportaciones admiten ambos IDs, y dos ausentes distintos se presentan como dos líneas idénticas.

Reproducción con `createMigrationDemo`: añadir a contact dos filas con emails distintos que no existen en destino; IDs `id-\u202E-final` (el carácter real) e `id-‹U+202E›-final` (texto literal). Actualizar declaredTotal y ejecutar el motor/informe reales. El informe JSON conserva ambos IDs distintos, y el HTML/DOM muestra dos veces `id-‹U+202E›-final`. No es una colisión SHA, emparejamiento erróneo del motor, escritura, ejecución de scripts ni modificación del JSON. Sí puede confundir la identificación humana de un registro en el informe.

Evidencia propia: `tests/.tmp/migration294-AqydRO/independent.log` (3 controles pasan, 1 regresión falla por 1 representación en vez de 2), `dom-before.json` (dos code.textContent iguales) y captura abierta `C:/Users/iresh/AppData/Local/Temp/planb-review294-gPZnT7/before390.png`. Cero peticiones o errores de página. El problema se confirma al abrir «Ausentes en el destino» en Chromium a 390 px.

Control causal SOLO en copia privada: incluir U+2039, el delimitador literal de apertura, en la codificación visible distingue texto literal y marcador generado. Mismas cuatro sondas: 4/4; DOM: dos representaciones distintas; captura after390 abierta. `causal-result.json` y `causal-restored.json` acreditan restauración por hash. Es un ejemplo mínimo de corrección, no una implementación impuesta ni una modificación de fuentes compartidas. Deben cubrirse también los marcadores de controles y la propia notación literal para evitar una nueva colisión recursiva.

## Comprobaciones que pasan

Banco fijo `tests/.tmp/migration294-AqydRO`, driver `tests/.tmp/review-migration294.cjs`.

- **31/31 Node**, 17,69 s: 24 CORE intactas y 7 visuales/presupuesto. Tipos focales exit 0 incluyendo cuatro sondas independientes. CORE/demo/test comparados con las huellas previamente aceptadas.
- **3/3 Chromium**, 7,9 s, sin reintentos: JSON/HTML/huellas iguales en Node y navegador, 18 casos de zonas/fechas, controles y escapes; HTML en 1440/390/320 claro/oscuro, geometría, contraste, estructura y teclado.
- Se abrieron capturas de informe light1440 y dudosos dark320: contenido legible, recortes declarados, sin desbordamiento de página observado. La captura causal before/after390 confirma F1.
- Tres controles propios pasan: bytes UTF8 multibyte frente a UTF16, 120000 filas en el conjunto y rechazo al añadir una más, dos IDs ordinarios visibles y distintos. El cuarto reproduce F1. No se modificaron sus aserciones para obtener verde.
- Medidas propias del caso de volumen: comparar 1000/10000/50000 filas por lado tardó 179/977/3381 ms. Son medidas de esta máquina/datos, no capacidad universal. El volumen se calcula de la misma manera que el test autor; no se atribuye medición nueva de memoria.
- Los seis hashes presentados y todas las fuentes del corte se cotejaron antes/después. CIM limitado al banco: sin procesos vivos. Browser plugin not available (no skill `browser`); fallback a Playwright del proyecto y Chromium headless-shell1228 de caché, sin perfiles de usuario ni dependencias instaladas.

El flujo validado fue informe HTML real → abrir bloques con teclado/clic → verificar listas, procedencia y geometría. No acredita una interfaz de carga o verificación de migración montada en Plan B. Los once mutantes comunicados por la autora no se repitieron; se ejecutó un control causal propio específico para F1. No hubo App/main/4601/piloto original/proveedor.

## Huellas revisadas

| Ruta | SHA-256 |
| --- | --- |
| `shared/migration-budget.ts` | `2b6b6cda291b669a55f5846dd4548fe1221ef772098f369f8c915e30de2c4892` |
| `shared/migration-report.ts` | `6a35258e67988f09dcb44dea3695640b8a5c197500f8a2f022dd135b863a92fc` |
| `tests/migration-verifier-visual.test.ts` | `685fb72af2891d79504ea0d90ddd1110e59c90ecf76903c0239bc4be290212aa` |
| `tests/e2e/migration-report-visual.spec.ts` | `087477bc115ad7daf19f0655227c912d5a5e1b63508367c1f53a03cd2af4721b` |
| `coordination/plans/MIGRATION-VERIFIER-UI-HANDOFF.md` | `0e7a8a3070d9ad58847da24a5c81e49144e9813c079046967754b9ac2abb7305` |
| `coordination/reports/CLAUDE-MIGRATION-VERIFIER-VISUAL.md` | `1a602987a9ec58643a46385c88427912ee76a3b743e011267f431384585576a1` |

Estas huellas describen R1 revisada, no una aceptación. La reserva de los seis archivos continúa para Claude B.
