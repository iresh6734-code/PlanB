# Fase 2 · Límite común de una fuente del encargo

24/11/2026, Europe/Madrid.

Por decisión de la usuaria, una fuente del encargo admite hasta **48 MB (50.331.648 bytes UTF-8 del texto tal como se guarda)**. `ENGAGEMENT_LIMITS.sourceBytes` lo define y `sourceSizeProblem` da el mismo aviso en todas las entradas. El aviso nombra la fuente y dice cuánto ocupa, cuál es el máximo, que no se ha guardado nada y qué puede hacer el operador. En el borde enseña bytes exactos para que no se lea «48,0 MB frente a 48 MB».

| Entrada | Dónde se comprueba | Qué pasa si se supera |
| --- | --- | --- |
| Subida desde la pantalla | En el navegador con el tamaño del archivo y en el servidor con los bytes del texto recibido | `413` con el aviso común. Se conserva la fuente anterior y el expediente no cambia |
| Lectura de HubSpot (pantalla y script) | `readWithRecord`, sobre la captura ya serializada y antes de crear el acta | Lectura detenida con el aviso común. No se guarda captura, acta ni entrada del expediente |
| Captura semanal de la vigilancia | El mismo `readWithRecord` | No se guarda y se reintenta una hora después, como cualquier fallo de lectura |

Antes, la subida contaba caracteres (15 M) y la lectura solo registros y páginas, así que una captura leída de 45 MB no se podía volver a subir. El esquema ya no limita caracteres. La ruta de subida admite un cuerpo HTTP de hasta el doble del máximo más 64 KB, porque el JSON escapa comillas y saltos de línea. El resto de rutas mantiene los 20 MB globales. El lector conserva sus topes de 100.000 registros y 2.000 páginas.

La comparación de migración tiene su propio presupuesto (24 MB por exportación), que no cambia. La pantalla y la ruta de migración comprueban ahora ese presupuesto en vez del de las fuentes. Por eso una captura de cierre de la vigilancia de más de 24 MB se rechaza al comparar, con el mensaje del presupuesto.

## Comprobaciones

- Pruebas focales:
  - Un texto con menos caracteres que bytes se rechaza por un byte y se guarda justo en el máximo.
  - Una lectura de HubSpot por encima del máximo se para sin guardar nada.
  - La vigilancia no guarda la captura semanal y programa el reintento.
  - El aviso enseña los tamaños reales en el borde y por encima.
- Tres fallos provocados se detectan: contar caracteres en vez de bytes, quitar el control de la lectura y no pasar el máximo a la vigilancia.
- Una comprobación puntual con `inject`, sin puerto y con la red externa bloqueada: un CSV sintético de 50.331.648 B (57.195.089 B de cuerpo) se guardó en 1,5 s, y con un byte más recibió `413` con el aviso común.
- `tsc` limpio y batería segura correcta. No se ha comprobado en un navegador.

## Pendiente

- La vigilancia no enseña por qué falló una captura semanal. Solo muestra el siguiente reintento.
- Medir la ficha y la lista sin volver a interpretar la captura entera. El caso de 45 MB tardó casi 5 s en la primera vista.
- Estado interrumpido después de reiniciar.
