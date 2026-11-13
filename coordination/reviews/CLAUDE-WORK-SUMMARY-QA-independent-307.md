# QA del resumen de trabajo · Revisión independiente307

9 de noviembre de 2026, Europe/Madrid. Dictamen favorable sobre las tres rutas de QA presentadas; no es aceptación de coberturaA4 ni del montaje futuro.

## Versión y reproducción

- `tests/e2e/work-summary-qa.spec.ts`: `31a01106f3d10edc14c9822a646db2d4ec5fc498c34de5df31ca14f996f6bb64`
- `tests/work-summary-qa-fixtures.ts`: `7c55ba14204c9616327f3f6b0b69f692b198e6dc81fb9075ffdeb128f8ad4312`
- `coordination/reports/CLAUDE-WORK-SUMMARY-QA.md`: `1c8d4f66eea3bd68924132f3468568439d12177950030faa9ec2ef21d7fdd81d`

Banco summary307-ijrtC7: diezE2E originales sin cambios pasan10/10 en88,24s, tipos focales0, sin retries/skips/flakies. Ocho fuentes identificadas en el informe de autora coinciden por hash con284. El banco conserva la lista completa de fuentes congeladas; no copia working. Sus binarios compilados propios normald0330c98… y lectore5af7678… están en evidence.json y no se atribuyen a la compilación histórica de autora. No se exige identidad de binario entre carpetas distintas ni se afirma que se reprodujo su hash566d9008. El corte transitivo propio es el manifest del banco.

La variante normal usa main sin cambiar, covers:false. La variante lectora cambia solo esa declaración a true para ensayar datos208 sembrados: no se presenta como cobertura del escritor. El código de pruebas se revisó, incluidas barreras, conteo de lecturas/escrituras, tablas y exportaciones. El banco se ejecutó con TMP propio, producciónVite, Chromium de caché y red externa bloqueada. Browser plugin not available. PLANB_KEEP_SUMMARY_QA conserva binarios y evita su borrado.

Las diez pruebas ejercen lectura compartida/pin y recuentosnull sin cobertura, control vacío con cobertura, escenarios de diario, exportaciones, errores, respuesta tardía con señal ignorada, reinicio/captura,401, navegación honesta sin destino y teclado1440/390/320. Se abrió resumen-320.png: tarjeta de fixture lector claramente parcial, recuentos/cuarentena visibles, botones completos y descarga. No se declara lector de pantalla ni App instalada4601.

## Sensibilidad contrastada

Se repitió el mutante ya escrito por autora cobertura-declarada en una copia privada. summary307-causal-tudYwT falla exactamente en work-summary-qa.spec.ts:190: aparece complete/recuentos observados donde exige none/null. La fuente original conserva sus hashes. El borrado recursivo de esa copia fue verificado en tiempo de ejecución para permanecer bajo el banco propio y su destino figura en recursive-targets.log.

El primer intento summary307-causal-YgSQNH no seleccionó casos por usar un grep anclado al principio del título completo; no cuenta como mutante detectado ni fallo de producto. Se corrigió solo la selección y se conservó su log. Las demás mutaciones del informe no se repitieron aquí; sus resultados siguen atribuidos a autora. El equivalente de guarda de generación está declarado como tal, sin contarlo como detección.

## Hallazgos y continuidad

F1 de autora sigue reproducible por lectura del código: toWorkSource convierte una lectura correcta coverage:none en unavailable y pierde la causa. El pasaporte y mapa muestran «No se pudo leer» aunque el servidor pudo responder honestamente que carece de cobertura. Ambos conservan desconocido, no cero, por lo que se calibra como defecto de explicación, no recuento falso. Se acuerda una unidad nueva para conservar cobertura y distinguir texto, con pruebas de compatibilidad.

F2 es una acción de navegación todavía ausente y explicada por la UI; queda pendiente del montajeA4 del coordinador. No se acepta como enlace funcional ni se modifica desde esta revisión. Cuarentena plegada e identidad abreviada en exportación son observaciones informativas, sin defecto adicional demostrado.

Se acepta la entrega de QA con sus límites y hallazgos abiertos registrados. La corrección de producto tiene su propia reserva y revisión; no se editan las tres rutas de Claude para hacer pasar una nueva implementación.
