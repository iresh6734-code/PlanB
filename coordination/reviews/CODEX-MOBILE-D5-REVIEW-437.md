# Revisión de la barra y la medición móvil D5

Dictamen favorable para la barra de las vistas probadas. Dictamen de corrección para el script de medición. Cotejé las dos huellas presentadas y la huella completa del CSS de la autora, `bee58331cb2dea898bd5e888357f123b786d79fec39fe1b5418210f3897ed9a3`.

## Barra

En Chromium, 10 rutas a 320 px y las mismas 10 a 390 px pasaron la comprobación independiente. En cada ruta verifiqué HTTP 200, URL final, encabezado visible, anchura de la página y geometría de la etiqueta «Datos de prueba» y de los botones de tema, órdenes y bloqueo. La etiqueta y los tres botones quedaron dentro de la pantalla y de sus ancestros que recortan. Los tres botones tienen al menos 44 × 44 px. Abrí las capturas de Clientes a 320 y de una oportunidad a 390. No hubo errores de página ni tráfico exterior o métodos de escritura. El backend de 432 devolvió un 404 en `/api/v2/relay/rehearsal`. La evidencia de navegador de este corte se limita a las vistas y los controles medidos.

El banco `tests/.tmp/finish435-sJELRR/app-7HYAba/results.json` usa la compilación Vite congelada del CSS de D5 y un backend anterior de bucle local, con una base nueva. El chequeo completo de tipos del código congelado terminó con código 0. La ficha a pantalla completa y el piloto instalado quedan fuera del dictamen sobre D5.

## Herramienta

1. En Chromium, las diez rutas de un fixture HTTP redirigían a `/sesion`. El escáner exacto informó «Sin problemas en 10 vistas» y salió 0. Comprobó la barra de la misma página en cada visita. Banco `tests/.tmp/mobile437-rfJONP`.
2. Un botón dentro de dos ancestros `overflow:hidden` cabe en el interior de 220 px pero queda completamente oculto por el exterior de 100 px. El escáner indicó `/hoy ok`. El control con un único ancestro de 100 px sí se marcó en Clientes y produjo código 1. Banco `tests/.tmp/mobile437-iWyQv2`.

Para R2, comprobar respuesta HTTP, ruta final y un marcador propio del destino. La ausencia de marcadores o un tiempo agotado debe contar como prueba fallida. Recorrer la cadena de ancestros hasta el marco de la vista para detectar recortes exteriores. Las filas que desplazan horizontalmente siguen siendo válidas cuando su contenedor permite acceder al control. Incluir los dos controles independientes y conservar el caso de recorte directo. La revisión pedida se limita al script y al informe.
