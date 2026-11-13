# Revisión independiente de actualización 288

8/11/2026, Europe/Madrid. Este chat Codex revisa herramienta y recibos del otro Codex. **Favorable dentro del alcance fijo de esta instalación ficticia.** Se verifica la App realmente servida, sin volver a aplicar la actualización, reiniciar procesos o ejecutar rollback.

## Fuente y alcance

Presentación exacta revisada:

| Archivo | SHA-256 |
| --- | --- |
| `tools/preview/update-work-summary.mjs` | `c8a760c3c3751fc896fde44a5ffaac6a976f0a5d8ee31e23b4795b0f6ae6967a` |
| `coordination/reports/CODEX-LOCAL-PREVIEW-SUMMARY-288.md` | `2348437e19a1a5be8bca4367a6ae50e75b8c8c2381c48e8656de6436ba384c6b` |

La herramienta está ligada a la instalación de ficción 278/279, su identidad, sus activos anteriores, ausencia de configuración de proveedores, clave de ensayo y ausencia de contraseña configurada. Antes de aplicar exige 284 aceptada y hashes exactos. Se verifican propiedad del PID y rutas antes de detener o mover. Conserva respaldos y activos anteriores. La rama de rollback no restaura la base encima de posibles cambios. No es un instalador general ni debe usarse en otras instalaciones.

`node --check` termina correctamente. No se ejecutaron `--prepare`, `--apply` ni fallos artificiales durante esta revisión. El rollback real del primer intento es evidencia histórica del autor, conservada en sus recibos. La diferencia de ciphertext por reescritura de returnBusy=false no se oculta como un cambio inexistente: se distingue de igualdad del contenido.

## Composición y conservación verificadas

El recibo aplicado está en `tests/.tmp/preview288-bngxpH/applied.json`. Sus 304 fuentes coinciden con la composición comprobada por esta revisión independiente de 284. Las cuatro fuentes/pruebas del montaje corresponden a su entrega aceptada. Se cotejaron todos los archivos de fuente, el binario instalado y los 15 activos en disco y HTTP/SHA.

Main instalado: `165e06560ff938b942634a79f1180b257a863dc5d0a789b23c79f312c5f5625b`. La consulta de proceso confirma PID 22988, Node, ruta y bloqueo de salida externa de esta instalación. Salud devuelve la instancia original `3cb33118-1596-44cc-b78a-b2961615f4ff`. Los otros 3622 archivos inmutables del recibo original, incluido el Kit, coinciden por hash.

Se compararon independientemente los dos respaldos previos de SQLite y la base actual. Con la clave propia marcada `kind:test`, sin imprimirla, se cotejó el hash del texto plano de cada celda cifrada, todas las filas/columnas y las definiciones de sqlite_master. Coinciden los tres esquemas y contenidos completos; el digest de datos también coincide con el recibo aplicado. No se excluyó returnBusy ni ninguna tabla. La clave conserva sus bytes durante la comprobación. Se observan 62 registros ficticios.

## Navegación independiente

Script `tests/.tmp/review-preview288.cjs`, raíz `tests/.tmp/preview288-independent-Eq60ID/result.json`. Chromium aislado, sin acceder al navegador o perfil del usuario. Se bloquearon todos los métodos modificadores y destinos externos.

Desde la navegación habitual, Continuidad muestra la tarjeta del trabajo local con «Sin cobertura: se desconoce», explicación de desconocido distinto de cero y ausencia de contadores. Una lectura inicial se mantiene durante 3,1 segundos de observación; la acción manual con Enter realiza la segunda. No se infiere de ese intervalo una propiedad de vigilancia permanente.

La descarga JSON tiene 852 bytes, situación uncovered y counts/quarantine nulos. La lectura de diagnóstico obtiene el mismo pin exacto del resumen y de la evidencia autorizada. Esas dos GET de diagnóstico son adicionales a las dos lecturas de UI y se contabilizan separadas.

Se comprobó ausencia de desbordamiento a 1440, 390 y 320 px. Se generaron capturas de la tarjeta en esos anchos y se abrió e inspeccionó la de 320: texto, controles y descarga legibles. Hoy mantiene la lista de tareas. No hubo escrituras, tráfico externo, errores de página ni respuestas HTTP de error.

Durante el recorrido, también coinciden los bytes crudos de todas las celdas SQLite antes/después: `7ed34e59d8d80c4d011eb3df3aeeb652fe6603b66329ba5fbc112d294f2b75c6`. El navegador de revisión terminó; el servidor PID 22988 se conserva intencionalmente abierto. No se ejecutó un segundo banco de ocho E2E: ese montaje ya pasó la repetición independiente de 284.

## Límites y siguiente paso

La actualización está instalada en 4601 y puede verse al recargar la App y entrar en Continuidad. Los recibos 278/279 conservan su estado histórico; no describen el PID actual. El recibo vigente es el aplicado de 288.

No se habilitó A4, no se prueba recuperación duradera de intentos, no se actualizó ZIP 271 y no se hicieron llamadas reales a proveedores. Jornada y Radar siguen sus reservas. El lector de soporte durable no acredita que los guardados de la App estén instrumentados: covers:false permanece correcto.

Se acepta 288 por los dos hashes revisados. Este dictamen se presenta para revisión cruzada, sin autoaceptación.
