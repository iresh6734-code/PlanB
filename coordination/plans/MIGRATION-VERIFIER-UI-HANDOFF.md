# Verificador de migraciones · contrato de la futura interfaz (traspaso)

8/11/2026, Europe/Madrid. Claude B (`CLAUDE-MIGRATION-VERIFIER-VISUAL`). **Estado real:** el motor (`shared/migration-verifier.ts`), el informe JSON/HTML (`shared/migration-report.ts`), las exportaciones ficticias (`shared/migration-demo.ts`) y el presupuesto de entrada (`shared/migration-budget.ts`) existen, están probados y son **internos**. **No existe** ninguna pantalla, entrada de menú, endpoint, carga de ficheros ni persistencia, y el verificador **no es todavía una función de la App**: «Verificar una migración» no se ofrecerá hasta que esté accesible desde la navegación habitual y produzca el informe comprobado (tareas sucesoras al final). Su activación como línea de producto sigue la puerta de la Fase 4 del plan, que decide Codex coordinador.

## Qué hace falta que haga la persona (flujo)
1. **Elegir dos exportaciones** (origen y destino) como ficheros locales. El navegador los lee; **nunca se aceptan rutas del disco del servidor**. Antes de analizar nada se aplica `checkMigrationFiles`: tamaño de cada fichero y del conjunto, objetos, filas, campos y cadenas; un conjunto fuera de presupuesto se **rechaza con su motivo** (`FILE_TOO_LARGE`, `TOTAL_TOO_LARGE`, `NOT_JSON`, `BAD_SHAPE`, `TOO_MANY_OBJECTS`, `TOO_MANY_ROWS`, `TOO_MANY_FIELDS`, `STRING_TOO_LONG`); nunca se trunca ni se procesa «hasta donde llegue».
2. **Ver procedencia y cobertura**: proveedor, cuenta, instante y zona de cada exportación, cobertura por objeto (completa / parcial / muestra), total declarado frente a filas recibidas (si no coinciden, la cobertura se trata como parcial y se avisa).
3. **Revisar el mapa** que ella confirma: claves de correspondencia por objeto, campos (tipo, normalización, obligatorio, relevante, traducción de valores, tolerancia) y relaciones. Usar `$id` como clave exige marcar de forma explícita que ambos sistemas comparten identificador; un ID igual entre proveedores **no** es correspondencia.
4. **Confirmar el contenido EXACTO**: se muestran las huellas (SHA-256 cortas) del origen, del destino y del mapa tal como se van a comparar y se pide un nombre. La confirmación guarda `{ confirmedBy, confirmedAt, huellas }`. **Cambiar un fichero o el mapa invalida la confirmación** (las huellas cambian) y hay que volver a confirmar. `confirmedBy` es **un nombre declarado**: no se llama firma, autoría verificada ni aprobación de otro usuario mientras no exista identidad autenticada.
5. **Ejecutar**: en un Web Worker (la interfaz mantiene respuesta) con un `runId` por ejecución. «Cancelar» termina el Worker y **descarta** cualquier resultado cuyo `runId` ya no sea el vigente; nunca se publica un resultado de entradas viejas ni uno parcial.
6. **Resultado y descargas**: el informe del propio motor (mismos bytes que el JSON/HTML descargables), con el veredicto, la procedencia, los contadores que suman y los límites. Descargas con un nombre estable y sin datos personales en el nombre.

## Estados de la interfaz (todos distintos)
`sin ficheros` · `rechazado por presupuesto` (motivo y qué fichero) · `mapa no válido` (errores del esquema, sin ejecutar) · `por confirmar` · `confirmado` (con las huellas) · `calculando` (con «Cancelar») · `resultado` (cuatro veredictos: **sin diferencias en el alcance confirmado**, **se encontraron diferencias**, **no se puede concluir** y, con exportaciones parciales o muestras, el aviso permanente de que «no encontrado» no equivale a «el proveedor no lo tiene») · `error` (código del motor, sin trazas ni contenido).

## Redacción obligatoria
- Nunca «migración íntegra» ni «migración correcta»: el mejor resultado es «sin diferencias en el alcance confirmado», con la frase de alcance del informe (solo objetos, claves y campos del mapa; no acredita integridad).
- Distinguir siempre **ausente** (destino completo), **no encontrado, sin concluir** (destino parcial o muestra), **dudoso** (varios candidatos o clave repetida: se muestran los candidatos y no se resuelve), **sin clave** y **sin concluir** (fecha sin zona, hora ambigua o inexistente, día de calendario imposible, valor sin traducción).
- Sin valores de campos por defecto en pantalla, descargas ni errores. «Mostrar valores» es opcional, explícito y recortado.
- Una descarga o un resultado no se «guardan en la copia»: guardar informes es una decisión aparte.

## Contrato técnico propuesto
- Entrada del Worker: `{ runId, source, target, map, includeValues }` ya aceptados por `checkMigrationFiles`; salida `{ runId, comparison, json, html }` o `{ runId, error }`. Todo es puro y **idéntico en Node y en el navegador** (comprobado: mismo JSON, mismo HTML, mismas huellas y mismas resoluciones de zona y cambio de hora; ver el informe de esta unidad).
- No hace falta API de servidor: todo puede ejecutarse en el navegador sin enviar nada a ningún sitio. Si Codex prefiere un endpoint local, debe repetir `checkMigrationFiles` en el servidor, aplicar sus propios límites de cuerpo y seguir sin leer rutas.
- Presupuesto vigente (`MIGRATION_BUDGET`): 24 MiB por exportación, 512 KiB de mapa, 48 MiB en total, 20 objetos por exportación, 120 000 filas sumando ambos lados, 100 campos por fila, cadenas de hasta 2 000 caracteres (y los límites por objeto del esquema). Son topes de seguridad de esta versión, no una promesa de capacidad.

## Medidas reales (este equipo, Node 24; no son una garantía)
| Filas por lado | Entrada | Comparar | Informe + JSON + HTML | JSON / HTML |
| --- | --- | --- | --- | --- |
| 1 000 | 0,4 MiB | ≈ 0,3 s | ≈ 4 ms | 13 / 15 KiB |
| 10 000 | 4,2 MiB | ≈ 1,1 s | ≈ 4 ms | 25 / 30 KiB |
| 50 000 | 21,1 MiB | ≈ 4,9 s | ≈ 2 ms | 25 / 31 KiB |
Crecimiento aproximadamente lineal; el tamaño del informe queda acotado por las listas de 200 elementos (con el recuento exacto). Por eso el cálculo debe ir fuera del hilo de la interfaz y ser cancelable.

## Qué NO existe todavía
Pantalla, ruta, menú, carga de ficheros, Worker, confirmación persistida, endpoint, descarga desde la App, ni verificación con exportaciones reales de HubSpot o Pipedrive (solo ficción). El HTML del informe se ha medido en Chromium a 1440/390/320 px en claro y oscuro con contenido arbitrario; la **interfaz** que lo envuelva todavía no.

## Dueños, rutas candidatas y orden
| Tarea | Dueño | Rutas candidatas | Depende de |
| --- | --- | --- | --- |
| Interfaz «Verificar una migración» (carga, procedencia, mapa, confirmación, Worker, cancelación, resultado, descargas) y sus pruebas de DOM | Claude A o Claude B, a acordar con Codex | `src/MigrationVerifier.tsx`, `src/migration-verifier-worker.ts`, `src/migration-verifier.css`, pruebas nuevas | Puerta de Fase 4; esta unidad aceptada |
| Entrada en la navegación habitual, contexto y montaje | Codex coordinador | `src/App.tsx` (y `server/main.ts` solo si se decide un endpoint) | La interfaz aceptada |
| Recorrido en la App compilada (cargar ficheros, confirmar, cancelar a mitad, cambiar un fichero e invalidar la confirmación, descargar, 1440/390/320) | Claude B (QA independiente) | Archivos de prueba propios | Montaje aceptado |
| Ensayo con exportaciones reales | Persona/Codex | — | Cuentas y autorización expresa; fase posterior |

La fila del inventario «Radar → fuentes externas, migraciones y otros verticales» debe seguir abierta, con este dueño y estas tareas, hasta que «Verificar una migración» sea accesible desde la navegación habitual y produzca el informe comprobado.
