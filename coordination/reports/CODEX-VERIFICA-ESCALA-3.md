# Verifica · Diagnóstico adelantado de escala

24/11/2026 · Europe/Madrid. Medición sobre `effc450` con el corte 0 local. Los tres casos usan HubSpot simulado, bases SQLite cifradas nuevas, Node 24.14.0 y rutas reales mediante `Fastify.inject`. No se abre un puerto. Se bloquea la red externa.

| Caso | Registros | Peticiones simuladas | Lectura hasta resultado | Transacción de guardado | Primera vista | Reapertura y comprobación | Pico RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pyme | 944 | 20 | 168 ms | 17 ms | 47 ms | 136 ms | 177 MiB |
| Cerca del límite | 99.000 | 1.746 | 8,44 s | 1,26 s | 4,94 s | 6,18 s | 1.248 MiB |
| Por encima del límite | 100.100 ofrecidos | 1.765 | 2,71 s hasta el rechazo | — | — | — | 373 MiB |

La medición es una ejecución por caso. La espera incluye el sondeo del estado. La reapertura incluye abrir SQLite, renderizar la respuesta de fuentes y consultar el índice de actas. El pico de memoria incluye el simulador y, en los casos que completan, el control de subida de archivo. Los tiempos no incluyen la red, la latencia de HubSpot ni sus límites de frecuencia.

| Caso válido | Captura JSON UTF-8 | Fila cifrada | SQLite tras la lectura | Volver a subir la misma captura |
| --- | ---: | ---: | ---: | --- |
| Pyme | 254.337 B | 386.857 B | 446.464 B | `200` |
| Cerca del límite | 45.119.330 B | 68.178.833 B | 68.304.896 B | `413`, «El archivo es demasiado grande» |

Las dos capturas válidas conservan la misma huella tras cerrar y reabrir la base y su acta sigue accesible. El tercer caso se detuvo al superar los 100.000 registros y dejó cero filas de fuentes y actas. No se ha medido por separado el rechazo al superar 2.000 páginas.

## Decisión para robustez

La lectura directa admite ahora una captura que la subida rechaza. El límite del lector cuenta registros y páginas. La ruta de subida comprueba longitud de texto y el servidor limita el tamaño del cuerpo HTTP. Para el primer corte de robustez, definir un máximo común en bytes UTF-8 sobre el formato que se guarda y aplicarlo en cada entrada antes de persistir. El límite HTTP seguirá acotando también el envoltorio JSON. Un mensaje común debe indicar qué límite se superó y qué puede hacer el operador.

El caso grande muestra que almacenar el documento es solo parte del coste. La primera vista tardó casi cinco segundos y tuvo que volver a descifrar, interpretar y derivar la huella. Antes de elegir almacenamiento por bloques, medir una ficha que lea estado, recuentos y huella persistidos al guardar y reservar la lectura de la captura entera a las acciones que la necesitan. Repetir con dos capturas y emisión completa para fijar capacidad soportada. Dejar la reanudación parcial para el caso en que el resultado y los tiempos de campo la justifiquen.

## Reproducción

Con `NODE_ENV=test`, ejecutar el diagnóstico una vez por perfil. La herramienta crea una carpeta nueva por ejecución y solo usa una credencial ficticia pasada al simulador. Sus resultados detallados se imprimen como JSON.

```powershell
$env:NODE_ENV = 'test'
foreach ($perfilVerifica in @('pyme', 'limite', 'exceso')) {
  node --require ./scripts/block-external.cjs --import tsx tools/perf/verifica-scale.ts $perfilVerifica
  if ($LASTEXITCODE -ne 0) { throw "Falló el perfil $perfilVerifica" }
}
```

`tsc --noEmit -p tsconfig.json` correcto. Se deja la evidencia en el informe del encargo porque la memoria principal sigue reservada por `CODEX-LAB-035`. El Mega Plan 3 toma esta medición como insumo para robustez. La validación de HubSpot autorizado y CSV de Holded sigue en fase B.
