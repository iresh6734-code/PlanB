# 263 · Demo local de Continuidad integrada

Verificada el 6 de noviembre de 2026 a las 14:10 en Madrid. La demo abre en <http://127.0.0.1:4599/> con una base nueva de datos ficticios. El servidor de esta ejecución tiene PID `29224`, instancia `b737390c-4ef7-421b-9425-6e850dc7303f` y captura `continuity-demo-f419a3ea4f69`.

## Corte reproducible

`tests/.tmp/preview263-w3kHvZ/manifest.json` registra las 277 fuentes, su procedencia por archivo, las 59 entradas de backend y los 15 activos. Parte del corte 236 y aplica las entregas aceptadas 201, 245, 101, 103, 104, 239, 242, 214, 215, 217, 253, 233, 230 y 260. La última unidad aceptada prevalece cuando comparte ruta con una anterior. `shared/relay-rehearsal.ts` procede del corte de interfaz revisado en 260, que conserva el contrato compartido de 216 R2. El API de relevo sigue pendiente de R3 y devuelve 404 en la candidata.

Vite compiló la App normal en `runtime/dist`. esbuild compiló `server/main.ts` en `runtime/build/server.mjs`, SHA-256 `19392014f8213a4c1e2ab855216bcbfedbc76dc8e79b7be797fcde0cb3bd19cd`. Los scripts de preparación, arranque y navegador están en `tests/.tmp/preview263-{prepare,serve,browser}.cjs`. El servidor usa un entorno reducido, la guarda local de red y una clave de ensayo recién creada. La base y ambos resultados de compilación están dentro del corte.

## Evidencia de ejecución

- `ready.json` vincula el PID y la instancia de salud, comprueba los 15 activos por HTTP y confirma copia ficticia, `changes: 0`, proveedores sin configurar y evidencia `unproven`. La cabecera de evidencia confirma la misma revisión que se pidió.
- `browser-result.json` registra tres respuestas 200 de evidencia con revisión pedida y confirmada idénticas, cero escrituras, cero peticiones externas y cero errores de página. La copia y su contador permanecieron iguales durante el recorrido.
- El navegador mostró el pasaporte y el mapa sin desbordamiento a 1440, 390 y 320 px. Las capturas llevan el ancho en el nombre. La vista de 320 px se inspeccionó. Para probar la vuelta desde el mapa, se simuló un fallo en la lectura **local** de la configuración de HubSpot. El estado normal sin credencial no ofrece esa acción en esa fila. La vuelta mostró el aviso y devolvió el foco al título del bloque.
- El primer proceso terminó por el límite de cinco segundos antes de publicar `.endpoint.json`. Su salida y PID se conservaron. El segundo arrancó con un plazo mayor y generó los recibos de salud y navegador. El primer intento de navegación identificó la diferencia del estado sin credencial. El recorrido final usó la simulación descrita sin cambiar fuentes de producto.

La demo incluye Continuidad, el pasaporte, el mapa y la lectura de evidencia desde la App. Quedan por integrar el diario duradero y el editor condicionado de Hoy. El relevo aún aparece como fuente sin lectura en esta demo. LAB036 queda fuera del corte. El siguiente paso es cotejar de forma independiente el manifiesto y el recorrido en esta instancia mientras siga disponible.
